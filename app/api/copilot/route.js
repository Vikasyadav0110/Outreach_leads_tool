import { NextResponse } from "next/server";
import { getClient, isMockMode, MODELS, providerForTask, beginCall } from "@/lib/anthropic";
import { requireApiAuth } from "@/lib/authGuard";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `You are the OutreachPilot copilot, assisting Indian digital-services agencies and SMB sellers with cold outreach. Be concise and practical. When writing messages, keep them short, human, and channel-appropriate (WhatsApp/email/call), using natural Hinglish where it fits the audience. No corporate filler, no "I hope this finds you well".`;

export async function POST(req) {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    const { messages, context } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "No message provided." }, { status: 400 });
    }

    // Copilot is a small, high-volume chat task → routed via API Management
    // (defaults to Gemini). Falls back to the other provider if its key is missing.
    const PREFER = providerForTask("copilot");
    if (isMockMode(PREFER)) {
      return NextResponse.json({ reply: mockReply() });
    }

    const system =
      context && typeof context === "string"
        ? `${SYSTEM}\n\nCONTEXT (what the user is currently viewing):\n${context.slice(0, 2000)}`
        : SYSTEM;

    const client = getClient(PREFER);
    beginCall({ task: "copilot" });
    const res = await client.messages.create({
      model: MODELS.writeMessages, // Sonnet 4.6 — fast + cheap for chat
      max_tokens: 1024,
      system,
      messages: messages.slice(-12).map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || ""),
      })),
    });

    if (res.stop_reason === "refusal") {
      return NextResponse.json({ reply: "I can't help with that request." });
    }
    const reply = res.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return NextResponse.json({ reply: reply || "(no response)" });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Copilot request failed." },
      { status: 500 }
    );
  }
}

function mockReply() {
  return `(Simulated reply) Here's a draft you can adapt:

"Hi 👋 — saw you're getting great walk-ins but there's no website to capture the people Googling you at night. I build simple lead-capturing sites for local businesses — can I show you a 2-min example on a quick call this week?"

Add a valid ANTHROPIC_API_KEY in .env.local for live, tailored copilot responses.`;
}
