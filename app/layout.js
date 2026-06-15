import "./globals.css";
import { APP_NAME } from "./components/Brand";
import AppFrame from "./components/AppFrame";
import { accentVars, DEFAULT_ACCENT } from "./components/theme";
import { isMockMode } from "@/lib/anthropic";
import { getAuthConfig } from "@/lib/authStore";
import { requireAuthPage } from "@/lib/authGuard";
import { getActiveModule } from "@/lib/activeModule";
import { getSettings, dueTaskCount } from "@/lib/db";

export function generateMetadata() {
  const brand = getSettings().brandName?.trim() || APP_NAME;
  return {
    title: brand,
    description: "AI sales outreach pipeline for Indian SMBs.",
  };
}

export default async function RootLayout({ children }) {
  // Gate pages at the Node layer (the edge middleware can't read the DB).
  await requireAuthPage();

  const mock = isMockMode();
  const settings = getSettings();
  const brandName = settings.brandName?.trim() || APP_NAME;
  const themeCss = `:root{${accentVars(settings.accentKey || DEFAULT_ACCENT)}}`;
  const activeModule = getActiveModule();
  const dueCount = dueTaskCount(activeModule);

  return (
    <html lang="en">
      <body>
        {/* Per-tenant white-label accent (overrides the globals.css default). */}
        <style dangerouslySetInnerHTML={{ __html: themeCss }} />
        <AppFrame
          mock={mock}
          brandName={brandName}
          authEnabled={getAuthConfig().enabled}
          activeModule={activeModule}
          dueCount={dueCount}
        >
          {children}
        </AppFrame>
      </body>
    </html>
  );
}
