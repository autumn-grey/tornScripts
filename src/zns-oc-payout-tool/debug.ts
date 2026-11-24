// Diagnostic logging for ZNS OC Payout tool, off unless OCP_DEBUG is "1" in localStorage.

const DEBUG_KEY = "OCP_DEBUG";

function debugging(): boolean {
  try {
    return localStorage.getItem(DEBUG_KEY) === "1";
  } catch {
    return false;
  }
}

/** Writes a diagnostic line when OCP_DEBUG is switched on. */
export function log(...parts: unknown[]): void {
  if (!debugging()) return;
  console.log("[OCP]", ...parts);
}
