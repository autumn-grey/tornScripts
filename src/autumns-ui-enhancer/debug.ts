// Diagnostic logging, off unless localStorage AUE_DEBUG is "1".
//
// The list features work by pattern-matching Torn's markup, which changes
// between deploys, so when something stops working the useful question is
// which step stopped matching. Same idea as OCG_DEBUG in the OC Travel
// Guard.

const DEBUG_KEY = "AUE_DEBUG";

function debugging(): boolean {
  try {
    return localStorage.getItem(DEBUG_KEY) === "1";
  } catch {
    return false;
  }
}

export function log(...parts: unknown[]): void {
  if (!debugging()) return;
  console.debug("[AUE]", ...parts);
}
