import { runFindLeads, runQualify, runWriteMessages } from "@/lib/agents";
import { enrichCard } from "@/lib/enrich";
import {
  upsertLeadByIdentity,
  getLead,
  setLeadQualified,
  createCampaignV2,
  addLeadsToCampaign,
  saveCampaignLeadMessages,
  setCampaignV2Status,
  getSettings,
} from "@/lib/db";
import { resetUsage } from "@/lib/anthropic";
import { getActiveModule } from "@/lib/activeModule";
import { requireApiAuth } from "@/lib/authGuard";

export const runtime = "nodejs";
export const maxDuration = 300;

// One-call "Generate Leads" orchestrator for the beginner wizard. Runs the whole
// journey server-side and streams progress over SSE so a non-technical user sees
// each stage happen: Find businesses -> Check fit (Qualify) -> Create campaign ->
// Write messages. Stops BEFORE sending (manual-send model). Each stage persists,
// so a late failure still leaves the earlier results saved.
export async function GET(req) {
  const denied = await requireApiAuth();
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const module = getActiveModule();
  const domain = module === "international" ? "international" : "local";
  const niche = (searchParams.get("niche") || "").trim();
  const city = (searchParams.get("city") || "").trim();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event, data) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

      if (!niche || !city) {
        send("error", { message: "Please enter both a business type and a city." });
        return controller.close();
      }

      resetUsage();
      try {
        // 1) FIND businesses
        send("step", { key: "find", status: "running", label: "Finding businesses" });
        const found = await runFindLeads({ domain, city, niche, module, campaignId: null });
        const leadIds = [];
        for (const l of found || []) {
          if (!l?.name) continue;
          const { id } = upsertLeadByIdentity({ ...l, module, niche, city: l.city || city, domain });
          if (id) leadIds.push(id);
        }
        if (leadIds.length === 0) {
          send("error", { message: `No businesses found for “${niche}” in ${city}. Try a broader type or another city.` });
          return controller.close();
        }
        send("step", { key: "find", status: "done", count: leadIds.length, label: `Found ${leadIds.length} businesses` });

        // 2) QUALIFY (check fit) + enrich verified public contact, skip suppressed
        send("step", { key: "qualify", status: "running", label: "Checking which are a good fit" });
        let qualified = 0;
        for (const id of leadIds) {
          const lead = getLead(id);
          if (!lead || lead.suppressed) continue;
          const cards = await runQualify({
            domain,
            highLeads: [{ name: lead.name, category: lead.niche, city: lead.city, website: lead.website, score: lead.score, gap: lead.gap }],
            module, leadId: id, source: lead.source,
          });
          let card = (cards || [])[0];
          if (!card) continue;
          card = await enrichCard(card, lead, module);
          setLeadQualified(id, card);
          qualified++;
        }
        send("step", { key: "qualify", status: "done", count: qualified, label: `${qualified} look like a good fit` });

        // 3) CREATE CAMPAIGN + attach the leads
        send("step", { key: "campaign", status: "running", label: "Creating your campaign" });
        const campaign = createCampaignV2({ module, name: `${niche} · ${city}`, channel: "multi" });
        addLeadsToCampaign(campaign.id, leadIds);
        send("step", { key: "campaign", status: "done", label: "Campaign created" });

        // 4) WRITE MESSAGES for the qualified leads
        send("step", { key: "draft", status: "running", label: "Writing a message for each lead" });
        const targets = leadIds.map((id) => getLead(id)).filter((l) => l && l.card && !l.suppressed);
        let written = 0;
        if (targets.length) {
          const msgs = await runWriteMessages({
            domain, qualified: targets.map((l) => l.card), profile: getSettings(), module, campaignId: campaign.id,
          });
          const byName = {};
          for (const m of msgs || []) if (m?.name) byName[m.name.trim().toLowerCase()] = m;
          for (const l of targets) {
            const msg = byName[(l.name || "").trim().toLowerCase()];
            if (!msg) continue;
            saveCampaignLeadMessages(campaign.id, l.id, msg);
            written++;
          }
          if (written) setCampaignV2Status(campaign.id, "messages_ready");
        }
        send("step", { key: "draft", status: "done", count: written, label: `Wrote ${written} message${written === 1 ? "" : "s"}` });

        send("done", { campaignId: campaign.id, found: leadIds.length, qualified, written });
      } catch (err) {
        send("error", { message: err?.message || "Something went wrong — any leads found so far were saved to your Leads page." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
