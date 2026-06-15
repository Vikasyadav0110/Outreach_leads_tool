// Enterprise (sell-pipeline) lead scoring. Unlike SMB scoring (website gap),
// enterprise score reflects BUYING INTENT + FIT signals. 1–10; ≥7 = HIGH.
export function scoreSellLead({
  project = false, // posted a project / RFP (explicit demand)
  budgetK = 0, // stated budget in $k
  hiring = 0, // # of engineering roles open
  fundedRecently = false, // raised in the last ~12 months
  techMatch = false, // on a stack we specialize in
  employees = 0,
} = {}) {
  let s = 4; // baseline "fits firmographically"
  if (project) s = 8; // explicit demand is the strongest signal
  if (budgetK >= 50) s += 1;
  if (hiring >= 3) s += 2;
  else if (hiring > 0) s += 1;
  if (fundedRecently) s += 1;
  if (techMatch) s += 1;
  if (employees >= 200) s += 1;
  return Math.max(1, Math.min(10, s));
}

export const sellPriority = (score) => ((Number(score) || 0) >= 7 ? "HIGH" : "NORMAL");
