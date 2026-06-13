// Pipeline progress: 4 connected dots — Find → Qualify → Write → Ready.
// current step = accent blue, completed = green, future = gray.
const STEPS = [
  { key: "find", label: "Find" },
  { key: "qualify", label: "Qualify" },
  { key: "write", label: "Write" },
  { key: "ready", label: "Ready" },
];

// `activeIndex` = step currently running (or -1 if none).
// `completedThrough` = highest step index that has finished.
export default function PipelineSteps({ activeIndex, completedThrough }) {
  return (
    <div className="flex items-center">
      {STEPS.map((step, i) => {
        const done = i <= completedThrough;
        const active = i === activeIndex;
        let dotCls = "bg-neutral-100 text-muted border-neutral-200";
        if (done) dotCls = "bg-success text-white border-success shadow-sm";
        if (active)
          dotCls =
            "bg-gradient-to-br from-accent to-accent2 text-white border-transparent shadow-sm ring-4 ring-accent/15 animate-pulse";

        let textCls = "text-muted";
        if (done) textCls = "text-success";
        if (active) textCls = "text-accent";

        return (
          <div key={step.key} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full border text-sm font-bold transition-all duration-150 ${dotCls}`}
              >
                {done && !active ? "✓" : i + 1}
              </div>
              <span className={`mt-1.5 text-xs font-semibold ${textCls}`}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="mx-2 mb-5 h-1 w-12 overflow-hidden rounded-full bg-neutral-200">
                <div
                  className={`h-full rounded-full bg-gradient-to-r from-accent to-accent2 transition-all duration-300 ${
                    i < completedThrough ? "w-full" : "w-0"
                  }`}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
