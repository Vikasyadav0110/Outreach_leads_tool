import { getCampaignV2 } from "@/lib/db";
import { requireApiAuth } from "@/lib/authGuard";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  const denied = await requireApiAuth();
  if (denied) return denied;
  const campaign = getCampaignV2(Number(params.id));
  if (!campaign) {
    return new Response("Campaign not found.", { status: 404 });
  }

  const txt = buildKit(campaign);
  const safe = (campaign.name || "campaign").replace(/[^a-z0-9]+/gi, "-");
  const filename = `outreach-kit-${safe}-${campaign.id}.txt`;

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
  lines.push(`OUTREACH KIT — ${c.name} (#${c.id})`);
  lines.push(`Channel: ${c.channel}   Leads: ${c.members?.length || 0}`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(rule, "");

  const messages = Array.isArray(c.messages) ? c.messages : [];
  if (messages.length === 0) {
    lines.push("No messages generated yet. Use Generate Messages on the campaign.");
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
