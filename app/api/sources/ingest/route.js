import { getAdapter } from "@/lib/sources";
import {
  startIngestRun,
  finishIngestRun,
  insertSourcedLead,
} from "@/lib/db";
import { requireApiAuth } from "@/lib/authGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event, data) =>
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );

      const run = startIngestRun({
        source: adapter.id,
        pipeline: adapter.pipeline,
        query: [term, location].filter(Boolean).join(" · "),
      });

      send("start", {
        runId: run.id,
        source: adapter.id,
        label: adapter.label,
        pipeline: adapter.pipeline,
        mock: !adapter.ready(),
      });

      let found = 0;
      let added = 0;
      try {
        for await (const raw of adapter.fetch({ term, location, limit })) {
          found++;
          const { added: isNew, lead } = insertSourcedLead({
            ...raw,
            runId: run.id,
            source: adapter.id,
            pipeline: adapter.pipeline,
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
