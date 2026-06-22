"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import CommandPalette from "./CommandPalette";
import Copilot from "./Copilot";
import { Toaster } from "./toast";

// Persistent banner shown across all pages when running in Simulated (mock) mode.
// Helps users understand that data is fabricated and Send actions are disabled.
function MockBanner() {
  return (
    <div className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-5 py-2 text-sm text-amber-900">
      <div className="flex items-center gap-2">
        <span className="text-base">⚠️</span>
        <span>
          <span className="font-semibold">Simulated mode</span> — all leads, contacts, and messages
          are AI-generated placeholders. Send actions are disabled to prevent messaging fabricated
          numbers.
        </span>
      </div>
      <a
        href="/settings"
        className="shrink-0 rounded-md border border-amber-400 bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-200"
      >
        Add API key →
      </a>
    </div>
  );
}

// Renders the full app shell, except on /login where it shows the bare page.
export default function AppFrame({ mock, brandName, authEnabled, activeModule, dueCount, children }) {
  const pathname = usePathname();

  if (pathname === "/login") {
    return (
      <>
        {children}
        <Toaster />
      </>
    );
  }

  return (
    <>
      {mock && <MockBanner />}
      <div className="lg:flex">
        <Sidebar mock={mock} brandName={brandName} authEnabled={authEnabled} activeModule={activeModule} dueCount={dueCount} />
        <div className="min-w-0 flex-1">
          <main className="mx-auto max-w-content px-6 py-8">{children}</main>
        </div>
      </div>
      <CommandPalette />
      <Copilot />
      <Toaster />
    </>
  );
}
