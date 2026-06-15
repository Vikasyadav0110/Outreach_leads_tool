// Server-only helper (imports next/headers) — kept out of lib/modules.js so the
// client-safe constants there can be imported by client components.
import { cookies } from "next/headers";
import { MODULES, DEFAULT_MODULE, MODULE_COOKIE } from "./modules";

// Read + validate the active module from the request cookie.
export function getActiveModule() {
  const v = cookies().get(MODULE_COOKIE)?.value;
  return MODULES.some((m) => m.key === v) ? v : DEFAULT_MODULE;
}
