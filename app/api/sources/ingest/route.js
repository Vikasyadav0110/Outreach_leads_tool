import { getAdapter } from "@/lib/sources";
import {
  startIngestRun,
  finishIngestRun,
  insertSourcedLead,
} from "@/lib/db";
import { requireApiAuth } from "@/lib/authGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // Claude Research web-search runs can be long

// Server-Sent Events stream: runs one source adapter and emits an event per
// lead as it's produced, so the client shows leads arriving in real time.
export async function GET(req) {
  const denied = await requireApiAuth();
  if (denied) return denied;
  const { searchParams } = new URL(req.url);
  const source = searchParams.get("source") || "";
  const adapter = getAdapter(source);
  if (!adapter) {
    return new Response("Unknown source", { status: 400 });
  }
  const term = (searchParams.get("term") || "").trim();
  const location = (searchParams.get("location") || "").trim();
  const limit = Math.min(parseInt(searchParams.get("limit") || "12", 10) || 12, 50);
  // The active module decides which pipeline these leads belong to. A universal
  // source (e.g. Google Places) can feed either; fall back to the adapter's own.
  const reqPipeline = (searchParams.get("pipeline") || "").trim();
  const pipeline = ["deliver", "sell"].includes(reqPipeline) ? reqPipeline : adapter.pipeline;
  // Free-form research brief (Claude Research) + optional ICP filters (used by
  // enterprise adapters like Apollo; ignored by others).
  const prompt = (searchParams.get("prompt") || "").trim();
  const model = (searchParams.get("model") || "").trim();
  // Procurement filters (USASpending / SAM.gov); ignored by other adapters.
  const naics = (searchParams.get("naics") || "").trim();
  const postedFrom = (searchParams.get("postedFrom") || "").trim();
  // AI Research "Enterprise Buyers" preset toggle.
  const enterpriseBuyers = searchParams.get("enterpriseBuyers") === "1";
  const icp = {
    role: (searchParams.get("role") || "").trim(),
    industry: (searchParams.get("industry") || "").trim(),
    tech: (searchParams.get("tech") || "").trim(),
    size: (searchParams.get("size") || "").trim(),
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event, data) =>
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );

      const run = startIngestRun({
        source: adapter.id,
        pipeline,
        query: [term, location].filter(Boolean).join(" · "),
        // Full param bag → enables one-click "Re-run" from history.
        params: { source: adapter.id, term, location, limit, prompt, model, naics, postedFrom, enterpriseBuyers, ...icp },
      });

      send("start", {
        runId: run.id,
        source: adapter.id,
        label: adapter.label,
        pipeline,
        mock: !adapter.ready(),
      });

      let found = 0;
      let added = 0;
      try {
        for await (const raw of adapter.fetch({ term, location, limit, pipeline, prompt, model, naics, postedFrom, enterpriseBuyers, ...icp })) {
          found++;
          const { added: isNew, lead } = insertSourcedLead({
            ...raw,
            runId: run.id,
            source: adapter.id,
            pipeline,
          });
          if (isNew) added++;
          send("lead", { lead, isNew, found, added });
        }
        finishIngestRun(run.id, { found, added, status: "done" });
        send("done", { found, added });
      } catch (err) {
        finishIngestRun(run.id, { found, added, status: "error" });
        send("error", { message: err?.message || "Ingestion failed" });
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
      "X-Accel-Buffering": "no",
    },
  });
}
