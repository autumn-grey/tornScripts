// Diagnostic logging, off unless localStorage ABH_DEBUG is "1".
//
// The markup works by recognising Torn's own page structure, which changes
// between updates, so when it stops highlighting things the useful question
// is what it managed to find and what it made of the numbers. Same idea as
// AUE_DEBUG in Autumn's UI Enhancer.

const DEBUG_KEY = "ABH_DEBUG";

function debugging(): boolean {
  try {
    return localStorage.getItem(DEBUG_KEY) === "1";
  } catch {
    return false;
  }
}

export function log(...parts: unknown[]): void {
  if (!debugging()) return;
  console.debug("[ABH]", ...parts);
}
