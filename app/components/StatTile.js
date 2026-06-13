// Compact metric tile for the campaign header and dashboard stats strip.
export default function StatTile({ label, value, valueClass = "text-ink" }) {
  return (
    <div className="stat-tile">
      <div className={`text-2xl font-bold tracking-tight ${valueClass}`}>
        {value}
      </div>
      <div className="mt-0.5 text-xs font-medium text-muted">{label}</div>
    </div>
  );
}
