// Every value the script keeps in Tampermonkey storage.

const PREFIX = "AKN_";

/** The Apps Script web app URL; only stored once Check has passed. */
export const SHEET_URL = "SHEET_URL";
/** Rounds recorded here that the sheet has not confirmed yet. */
export const PENDING = "PENDING";
/** The last full history read from the sheet, so the board paints before it answers. */
export const HISTORY = "HISTORY";
/** Which heat map the board shows. */
export const HEAT_MODE = "HEAT_MODE";

/** Returns a stored value, or the fallback when nothing is stored. */
export function readSetting<T>(key: string, fallback: T): T {
  return GM_getValue<T>(PREFIX + key, fallback);
}

/** Stores a value. */
export function writeSetting(key: string, value: Tampermonkey.StorageValue): void {
  GM_setValue(PREFIX + key, value);
}
