"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { APP_NAME } from "./Brand";
import ModuleSwitcher from "./ModuleSwitcher";
import { DocIcon, DatabaseIcon } from "./icons";

// ---- icons ----
function GridIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}
function GearIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
function PlusIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function MegaphoneIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m3 11 15-5v12L3 13z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
      <path d="M18 8a3 3 0 0 1 0 6" />
    </svg>
  );
}
function UsersIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function ChartIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 3v18h18" />
      <rect x="7" y="11" width="3" height="6" />
      <rect x="12" y="7" width="3" height="10" />
      <rect x="17" y="14" width="3" height="3" />
    </svg>
  );
}
function MenuIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  );
}
function CloseIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

// Grouped + ordered by how the app is actually used: find leads (Sources) →
// review (Leads) → reach out (Campaigns). Workflow items carry a step number.
const NAV_GROUPS = [
  {
    items: [{ href: "/", label: "Dashboard", icon: GridIcon, match: (p) => p === "/" }],
  },
  {
    title: "Workflow",
    items: [
      { href: "/sources", label: "Sources", step: 1, icon: DatabaseIcon, match: (p) => p.startsWith("/sources") },
      { href: "/leads", label: "Leads", step: 2, icon: UsersIcon, match: (p) => p.startsWith("/leads") },
      { href: "/campaigns", label: "Campaigns", step: 3, icon: MegaphoneIcon, match: (p) => p.startsWith("/campaign") },
    ],
  },
  {
    title: "Manage",
    items: [
      { href: "/analytics", label: "Analytics", icon: ChartIcon, match: (p) => p.startsWith("/analytics") },
      { href: "/templates", label: "Templates", icon: DocIcon, match: (p) => p.startsWith("/templates") },
      { href: "/settings", label: "Settings", icon: GearIcon, match: (p) => p.startsWith("/settings") },
    ],
  },
];

function Brandmark({ onClick, name = APP_NAME }) {
  return (
    <Link href="/" onClick={onClick} className="flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent2 text-sm font-bold text-white shadow-sm">
        {name.charAt(0)}
      </span>
      <span className="bg-gradient-to-r from-accent to-accent2 bg-clip-text text-lg font-bold tracking-tight text-transparent">
        {name}
      </span>
    </Link>
  );
}

function MockBadge() {
  return (
    <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
      ⚠️ Simulated Fallback
    </span>
  );
}

export default function Sidebar({ mock, brandName, authEnabled, activeModule, dueCount = 0 }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    router.push("/login");
    router.refresh();
  }

  const navList = (
    <nav className="flex flex-col gap-1">
      {NAV_GROUPS.map((group, gi) => (
        <div key={gi} className={gi > 0 ? "mt-4" : ""}>
          {group.title && (
            <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wide text-muted/70">
              {group.title}
            </div>
          )}
          {group.items.map((item) => {
            const Icon = item.icon;
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 ${
                  active ? "bg-accent/10 text-accent" : "text-muted hover:bg-[#f3f3f0] hover:text-ink"
                }`}
              >
                <Icon width="18" height="18" />
                <span className="flex-1">{item.label}</span>
                {item.href === "/" && dueCount > 0 && (
                  <span
                    className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[10px] font-bold text-white"
                    title={`${dueCount} follow-up${dueCount > 1 ? "s" : ""} due`}
                  >
                    {dueCount}
                  </span>
                )}
                {item.step && (
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
                      active ? "bg-accent text-white" : "bg-neutral-200 text-muted"
                    }`}
                  >
                    {item.step}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-card px-4 py-5 lg:flex">
        <div className="px-1">
          <Brandmark name={brandName} />
        </div>
        <div className="mt-5">
          <ModuleSwitcher active={activeModule} />
        </div>
        <Link href="/campaigns/new" className="btn-primary mt-3 w-full">
          <PlusIcon width="16" height="16" />
          New campaign
        </Link>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("op-open-palette"))}
          className="mt-2 flex w-full items-center justify-between rounded-lg border border-line bg-white px-3 py-2 text-sm text-muted transition-colors hover:bg-[#f3f3f0] hover:text-ink"
        >
          <span>Search…</span>
          <kbd className="rounded border border-line bg-canvas px-1.5 py-0.5 text-[10px] font-medium">⌘K</kbd>
        </button>
        <div className="mt-6">{navList}</div>
        <div className="mt-auto space-y-2 px-1">
          {mock && <MockBadge />}
          {authEnabled && (
            <button
              type="button"
              onClick={logout}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-[#f3f3f0] hover:text-ink"
            >
              <LogoutIcon width="18" height="18" />
              Log out
            </button>
          )}
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-card/80 px-4 py-3 backdrop-blur lg:hidden">
        <Brandmark name={brandName} />
        <div className="flex items-center gap-2">
          {mock && <MockBadge />}
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
            className="rounded-lg border border-line bg-white p-2 text-muted transition-colors hover:text-ink"
          >
            <MenuIcon width="18" height="18" />
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={close} />
          <div className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-line bg-card p-4 shadow-pop">
            <div className="flex items-center justify-between px-1">
              <Brandmark onClick={close} name={brandName} />
              <button
                type="button"
                aria-label="Close menu"
                onClick={close}
                className="rounded-lg p-1.5 text-muted hover:text-ink"
              >
                <CloseIcon width="18" height="18" />
              </button>
            </div>
            <div className="mt-5">
              <ModuleSwitcher active={activeModule} />
            </div>
            <Link href="/campaigns/new" onClick={close} className="btn-primary mt-3 w-full">
              <PlusIcon width="16" height="16" />
              New campaign
            </Link>
            <div className="mt-6">{navList}</div>
            {authEnabled && (
              <button
                type="button"
                onClick={() => {
                  close();
                  logout();
                }}
                className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-[#f3f3f0] hover:text-ink"
              >
                <LogoutIcon width="18" height="18" />
                Log out
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function LogoutIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5M21 12H9" />
    </svg>
  );
}
