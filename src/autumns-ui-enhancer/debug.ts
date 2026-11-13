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

/** Returns a value as short JSON, or its string form when it will not serialise. */
function safeJson(value: unknown): string {
  try {
    return (JSON.stringify(value) ?? String(value)).slice(0, 300);
  } catch {
    return String(value);
  }
}

/** Writes a diagnostic line to the console. */
export function log(...parts: unknown[]): void {
  if (!debugging()) return;
  // Also kept as text, so a run can be copied out of the console in one go.
  const kept = ((window as unknown as { aueLog?: string[] }).aueLog ??= []);
  kept.push(
    `${new Date().toISOString().slice(11, 23)} ${parts
      .map((part) => (typeof part === "string" ? part : safeJson(part)))
      .join(" ")}`,
  );
  if (kept.length > 500) kept.splice(0, kept.length - 500);
  // Do not use console.debug: Chrome hides it unless Verbose is enabled.
  console.log("[AUE]", ...parts);
}
