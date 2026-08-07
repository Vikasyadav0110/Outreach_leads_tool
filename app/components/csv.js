// Shared CSV helpers (used by LeadsTable + GlobalLeadsTable exports).

// Escape a single CSV cell (quote if it contains comma/quote/newline).
export function csvCell(v) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Build a CSV string from a header row + array-of-arrays.
export function toCSV(header, rows) {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}

// Parse a CSV string into { headers, rows } where rows are objects keyed by
// header. Handles quoted fields with embedded commas/newlines and "" escaping.
// Dependency-free; tolerant of \r\n and a trailing newline.
export function parseCSV(text) {
  const src = String(text || "").replace(/^﻿/, ""); // strip BOM
  const records = [];
  let field = "";
  let record = [];
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      record.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++; // swallow \r\n
      record.push(field); field = "";
      if (record.length > 1 || record[0] !== "") records.push(record);
      record = [];
    } else field += c;
  }
  // flush trailing field/record
  if (field !== "" || record.length) { record.push(field); if (record.length > 1 || record[0] !== "") records.push(record); }
  if (!records.length) return { headers: [], rows: [] };
  const headers = records[0].map((h) => h.trim());
  const rows = records.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, j) => { obj[h] = (r[j] ?? "").trim(); });
    return obj;
  });
  return { headers, rows };
}

// Trigger a client-side download of a CSV string.
export function downloadCSV(filename, csv) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
