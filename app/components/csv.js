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
