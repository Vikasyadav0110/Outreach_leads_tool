// Score badge: 9-10 red "HOT", 7-8 amber "HIGH", below 7 gray.
export default function ScoreBadge({ score }) {
  const n = Number(score) || 0;
  let cls;
  let label;
  if (n >= 9) {
    cls = "bg-red-50 text-danger";
    label = "HOT";
  } else if (n >= 7) {
    cls = "bg-amber-50 text-warning";
    label = "HIGH";
  } else {
    cls = "bg-neutral-100 text-muted";
    label = "LOW";
  }
  return (
    <span className={`badge ${cls}`}>
      {n} · {label}
    </span>
  );
}
