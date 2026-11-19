// The shape of a Torn API key, checked before a key is ever sent.

/** A Torn API key is 16 letters and digits. */
const KEY_SHAPE = /^[A-Za-z0-9]{16}$/;

/** What a key box says when what was typed cannot be a key. */
export const BAD_KEY_SHAPE = "API keys are 16 letters and numbers";

/** Whether a string could be a Torn API key, so a typo never reaches the API. */
export function isKeyShaped(key: string): boolean {
  return KEY_SHAPE.test(key);
}
