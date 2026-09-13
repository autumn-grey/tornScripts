const DEBUG_KEY = "STF_DEBUG";

function debugging(): boolean {
  try {
    return localStorage.getItem(DEBUG_KEY) === "1";
  } catch {
    return false;
  }
}

/** Writes a diagnostic line when STF_DEBUG is switched on. */
export function log(...parts: unknown[]): void {
  if (!debugging()) return;
  console.debug("[STF]", ...parts);
}
