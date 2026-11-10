// The message a feature shows in place of itself when it has no key it can use.

import { ApiError } from "./api";

/** Query flag telling preferences.php to scroll to this script's settings once they are drawn. */
export const SETTINGS_FLAG = "art-settings";
const SETTINGS_URL = `https://www.torn.com/preferences.php?${SETTINGS_FLAG}=1`;

/** Torn's error codes for a key that is wrong or cannot read what was asked. */
const KEY_ERRORS = new Set([2, 16]);

/** Returns whether an error means the key needs replacing, not a retry. */
export function isKeyProblem(error: unknown): boolean {
  return error instanceof ApiError && error.code !== null && KEY_ERRORS.has(error.code);
}

/** Returns a link to this script's settings asking for a usable key. */
export function keyPrompt(): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = "art-key-prompt";
  link.href = SETTINGS_URL;
  link.textContent = "Please load a valid API Key in script settings";
  return link;
}
