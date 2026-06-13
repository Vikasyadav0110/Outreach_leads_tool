import { getCampaign } from "@/lib/db";
import { requireApiAuth } from "@/lib/authGuard";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  const denied = await requireApiAuth();
  if (denied) return denied;
  const campaign = getCampaign(Number(params.id));
  if (!campaign) {
    return new Response("Campaign not found.", { status: 404 });
  }

  const txt = buildKit(campaign);
  const safeCity = (campaign.city || "campaign").replace(/[^a-z0-9]+/gi, "-");
  const filename = `outreach-kit-${campaign.domain}-${safeCity}-${campaign.id}.txt`;

  return new Response(txt, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function buildKit(c) {
  const lines = [];
  const rule = "=".repeat(64);
  lines.push(rule);
  lines.push(`OUTREACH KIT — Campaign #${c.id}`);
  lines.push(`Domain: ${c.domain}   City: ${c.city}   Niche: ${c.niche}`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(rule, "");

  const messages = Array.isArray(c.messages) ? c.messages : [];
  if (messages.length === 0) {
    lines.push("No messages generated yet. Run the pipeline through Agent 3.");
    return lines.join("\n");
  }

  messages.forEach((m, i) => {
    lines.push(`${"-".repeat(64)}`);
    lines.push(`LEAD ${i + 1}: ${m.name || "(unnamed)"}`);
    lines.push("-".repeat(64), "");

    lines.push("COLD EMAIL");
    lines.push(`Subject: ${m.email?.subject || ""}`);
    lines.push("");
    lines.push(m.email?.body || "");
    lines.push("");

    lines.push("WHATSAPP");
    lines.push(m.whatsapp || "");
    lines.push("");

    lines.push("90-SECOND CALL SCRIPT");
    lines.push(m.callScript || "");
    lines.push("", "");
  });

  return lines.join("\n");
}
