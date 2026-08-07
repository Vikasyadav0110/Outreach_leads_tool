"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { parseCSV } from "./csv";
import { toast } from "./toast";

// Target lead fields → the label shown + fuzzy header hints for auto-mapping.
const FIELDS = [
  { key: "name", label: "Company / Person", required: true, hints: ["company", "account", "name", "organization", "org", "business"] },
  { key: "decisionMaker", label: "Contact name", hints: ["contact", "full name", "first name", "person", "lead name"] },
  { key: "title", label: "Title", hints: ["title", "role", "position", "headline"] },
  { key: "email", label: "Email", hints: ["email", "e-mail", "mail"] },
  { key: "whatsapp", label: "Phone / WhatsApp", hints: ["phone", "mobile", "whatsapp", "tel", "number"] },
  { key: "linkedin", label: "LinkedIn URL", hints: ["linkedin", "profile", "url", "link"] },
  { key: "city", label: "City", hints: ["city", "location", "geo", "region"] },
  { key: "niche", label: "Niche / Industry", hints: ["industry", "niche", "sector", "category"] },
  { key: "website", label: "Website", hints: ["website", "site", "domain", "web"] },
  { key: "signal", label: "Signal / Note", hints: ["signal", "note", "reason", "why", "trigger", "comment"] },
  { key: "score", label: "Score", hints: ["score", "rating", "priority"] },
];

// Guess a CSV header for each field by fuzzy (substring) match.
function autoMap(headers) {
  const lower = headers.map((h) => h.toLowerCase());
  const map = {};
  for (const f of FIELDS) {
    const idx = lower.findIndex((h) => f.hints.some((hint) => h.includes(hint)));
    map[f.key] = idx >= 0 ? headers[idx] : "";
  }
  return map;
}

export default function LinkedInImportModal({ onClose, onDone }) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState(null); // { headers, rows }
  const [map, setMap] = useState({});
  const [busy, setBusy] = useState(false);

  function ingestText(raw) {
    const p = parseCSV(raw);
    if (!p.headers.length || !p.rows.length) {
      toast("Couldn't read any rows — check the CSV.", "error");
      return;
    }
    setParsed(p);
    setMap(autoMap(p.headers));
  }

  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { const t = String(reader.result || ""); setText(t); ingestText(t); };
    reader.readAsText(file);
  }

  // Build the mapped rows from the current column mapping.
  const mappedRows = useMemo(() => {
    if (!parsed) return [];
    return parsed.rows.map((row) => {
      const out = {};
      for (const f of FIELDS) { const col = map[f.key]; if (col) out[f.key] = row[col] || ""; }
      return out;
    }).filter((r) => (r.name || "").trim());
  }, [parsed, map]);

  async function doImport() {
    if (!mappedRows.length) return toast("Map the Company column first.", "error");
    setBusy(true);
    try {
      const res = await fetch("/api/leads/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: mappedRows }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Import failed.");
      toast(`Imported ${d.added} new · ${d.updated} updated${d.skipped ? ` · ${d.skipped} skipped` : ""}.`);
      onDone?.();
    } catch (e) { toast(e.message, "error"); } finally { setBusy(false); }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Import from LinkedIn">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !busy && onClose()} />
      <div className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-card border border-line bg-canvas shadow-pop">
        <div className="border-b border-line px-5 py-4">
          <h3 className="text-base font-semibold text-ink">Import from LinkedIn</h3>
          <p className="mt-1 text-xs text-muted">
            Build a list in <span className="font-medium text-ink">Sales Navigator</span> (advanced filters →
            headcount growth, hiring, funding), then paste or upload the columns you have. We only store contacts you
            provide — blanks can be filled later with Qualify / Find contact (public sources only). No scraping.
          </p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {!parsed ? (
            <>
              <div>
                <label className="label">Paste CSV</label>
                <textarea className="input min-h-32 font-mono text-xs" placeholder="Company,Contact,Title,Email,Location,Note&#10;Acme Corp,Jane Doe,VP Eng,jane@acme.com,Pune,Posted 4 dev roles" value={text} onChange={(e) => setText(e.target.value)} />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => ingestText(text)} disabled={!text.trim()} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">Read CSV</button>
                <span className="text-xs text-muted">or</span>
                <label className="btn-ghost cursor-pointer px-4 py-2 text-sm">
                  Upload .csv
                  <input type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
                </label>
              </div>
            </>
          ) : (
            <>
              {/* Column mapping */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="label">Map columns</span>
                  <button type="button" onClick={() => { setParsed(null); }} className="text-xs font-medium text-accent hover:underline">← Use a different CSV</button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {FIELDS.map((f) => (
                    <label key={f.key} className="flex items-center gap-2 text-sm">
                      <span className="w-32 shrink-0 text-xs text-muted">{f.label}{f.required ? " *" : ""}</span>
                      <select className="input w-auto flex-1" value={map[f.key] || ""} onChange={(e) => setMap({ ...map, [f.key]: e.target.value })} aria-label={`Map ${f.label}`}>
                        <option value="">— none —</option>
                        {parsed.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div>
                <div className="mb-1 text-xs text-muted">{mappedRows.length} lead{mappedRows.length === 1 ? "" : "s"} ready {map.name ? "" : "· map the Company column to continue"}</div>
                <div className="max-h-40 overflow-auto rounded-lg border border-line">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#f3f3f0] text-muted"><tr><th className="px-2 py-1.5">Company</th><th className="px-2 py-1.5">Contact</th><th className="px-2 py-1.5">Email</th><th className="px-2 py-1.5">Signal</th></tr></thead>
                    <tbody>
                      {mappedRows.slice(0, 6).map((r, i) => (
                        <tr key={i} className="border-t border-line even:bg-[#fafaf8]">
                          <td className="px-2 py-1.5 font-medium text-ink">{r.name}</td>
                          <td className="px-2 py-1.5 text-muted">{r.decisionMaker || "—"}</td>
                          <td className="px-2 py-1.5 text-muted">{r.email || "—"}</td>
                          <td className="px-2 py-1.5 text-muted">{r.signal || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <button type="button" onClick={onClose} disabled={busy} className="btn-ghost px-4 py-2 text-sm">Cancel</button>
          {parsed && (
            <button type="button" onClick={doImport} disabled={busy || !mappedRows.length} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
              {busy ? "Importing…" : `Import ${mappedRows.length} lead${mappedRows.length === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
