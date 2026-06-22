// Horizontal labeled step indicator for the campaign wizard.
// steps: [{ label }], current: 0-based index.
export default function Stepper({ steps, current }) {
  return (
    <ol className="flex items-center gap-2">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.label} className="flex items-center gap-2">
            <span className={`flex items-center gap-2 rounded-full py-1 pr-2 ${active ? "bg-accent/5 pl-1" : ""}`}>
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  done ? "bg-success text-white" : active ? "bg-accent text-white" : "bg-neutral-200 text-muted"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              <span className={`text-sm ${active ? "font-semibold text-ink" : "text-muted"}`}>{s.label}</span>
            </span>
            {i < steps.length - 1 && <span className="mx-1 h-px w-6 bg-line sm:w-10" />}
          </li>
        );
      })}
    </ol>
  );
}
