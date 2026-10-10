import "./globals.css";
import { Inter, Sora } from "next/font/google";
import { APP_NAME } from "./components/Brand";

// Body text (Inter) + display face for headings/brand (Sora). next/font self-hosts
// these with `font-display: swap` — no render-blocking Google @import, no FOIT.
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-sans", display: "swap" });
const sora = Sora({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display", display: "swap" });
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
    <html lang="en" className={`${inter.variable} ${sora.variable}`}>
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
