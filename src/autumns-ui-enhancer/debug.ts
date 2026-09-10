// Diagnostic logging, off unless localStorage AUE_DEBUG is "1".

const DEBUG_KEY = "AUE_DEBUG";

/** Whether diagnostic logging is switched on. */
function debugging(): boolean {
  try {
    return localStorage.getItem(DEBUG_KEY) === "1";
  } catch {
    return false;
  }
}

/** Writes a diagnostic line to the console. */
export function log(...parts: unknown[]): void {
  if (!debugging()) return;
  // Do not use console.debug: Chrome hides it unless Verbose is enabled.
  console.log("[AUE]", ...parts);
}
