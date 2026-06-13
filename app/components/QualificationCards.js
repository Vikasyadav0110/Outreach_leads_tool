export default function QualificationCards({ cards, onPrep }) {
  if (!cards || cards.length === 0) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {cards.map((c, i) => (
        <div key={i} className="card card-hover p-5">
          <div className="flex items-start justify-between gap-3">
            <h4 className="text-sm font-semibold text-ink">{c.name}</h4>
            <span className="badge bg-blue-50 text-accent">{c.serviceTag}</span>
          </div>

          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Gap" value={c.exactGap} />
            <Row label="Decision maker" value={c.decisionMaker} />
            <Row label="WhatsApp" value={c.whatsapp} />
            <Row label="Email" value={c.email} />
            <Row label="Hook" value={c.personalizationHook} />
          </dl>

          {onPrep && (
            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => onPrep(c)}
                className="btn-ghost px-3 py-1 text-xs"
              >
                Prep Meeting
              </button>
              <span className="text-xs text-muted">Open the lead to send →</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-xs font-medium text-muted">{label}</dt>
      <dd className="text-ink">{value || "—"}</dd>
    </div>
  );
}
