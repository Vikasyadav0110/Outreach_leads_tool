// White-label-ready: the app name comes from NEXT_PUBLIC_APP_NAME if set,
// otherwise defaults to "OutreachPilot". Change branding without touching code.
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "OutreachPilot";

// ---- domain icons (small, stroke = currentColor) ----
function StoreIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 9 4 4h16l1 5" />
      <path d="M4 9v11h16V9" />
      <path d="M3 9a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 4 0 2.5 2.5 0 0 0 4 0 2.5 2.5 0 0 0 5 0" />
      <path d="M9 20v-5h6v5" />
    </svg>
  );
}
function BuildingIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" />
      <path d="M10 21v-3h4v3" />
    </svg>
  );
}
function HealthIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 12h3l2 5 4-12 2 7h7" />
    </svg>
  );
}
function CapIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M22 9 12 5 2 9l10 4 10-4Z" />
      <path d="M6 11v5c0 1 2.5 2.5 6 2.5s6-1.5 6-2.5v-5" />
    </svg>
  );
}

// Per-domain visual metadata, the single source of truth for chips + tiles.
export const DOMAIN_META = {
  local: {
    label: "Local",
    chip: "bg-emerald-50 text-emerald-700",
    tileOn: "border-emerald-400 bg-emerald-50 ring-1 ring-emerald-300",
    tileOff: "border-line hover:border-emerald-200",
    iconText: "text-emerald-600",
    solid: "bg-emerald-500",
    Icon: StoreIcon,
  },
  realestate: {
    label: "Real Estate",
    chip: "bg-blue-50 text-blue-700",
    tileOn: "border-blue-400 bg-blue-50 ring-1 ring-blue-300",
    tileOff: "border-line hover:border-blue-200",
    iconText: "text-blue-600",
    solid: "bg-blue-500",
    Icon: BuildingIcon,
  },
  health: {
    label: "Healthcare",
    chip: "bg-rose-50 text-rose-700",
    tileOn: "border-rose-400 bg-rose-50 ring-1 ring-rose-300",
    tileOff: "border-line hover:border-rose-200",
    iconText: "text-rose-600",
    solid: "bg-rose-500",
    Icon: HealthIcon,
  },
  edtech: {
    label: "Education",
    chip: "bg-violet-50 text-violet-700",
    tileOn: "border-violet-400 bg-violet-50 ring-1 ring-violet-300",
    tileOff: "border-line hover:border-violet-200",
    iconText: "text-violet-600",
    solid: "bg-violet-500",
    Icon: CapIcon,
  },
};

// Canonical domain order for pickers and breakdowns.
export const DOMAIN_ORDER = ["local", "realestate", "health", "edtech"];

// Quick-start example [city, niche] combos per domain.
export const PRESETS = {
  local: [["Agra", "Tour Operators"], ["Jaipur", "Restaurants"], ["Goa", "Salons"]],
  realestate: [["Delhi", "Builders"], ["Gurgaon", "Property Dealers"], ["Noida", "Brokers"]],
  health: [["Pune", "Dental Clinics"], ["Mumbai", "Physiotherapists"], ["Lucknow", "Diagnostic Labs"]],
  edtech: [["Kota", "Coaching Institutes"], ["Hyderabad", "Tutors"], ["Indore", "Test-Prep Centers"]],
};

// Colored pill with the domain's icon + label.
export function DomainChip({ domain }) {
  const meta = DOMAIN_META[domain];
  if (!meta) return <span className="badge bg-neutral-100 text-muted">{domain}</span>;
  const { Icon, chip, label } = meta;
  return (
    <span className={`badge gap-1 ${chip}`}>
      <Icon width="12" height="12" />
      {label}
    </span>
  );
}
