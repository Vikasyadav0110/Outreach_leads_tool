"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import CommandPalette from "./CommandPalette";
import Copilot from "./Copilot";
import { Toaster } from "./toast";

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
