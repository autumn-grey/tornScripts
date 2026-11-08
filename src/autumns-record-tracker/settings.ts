// The feature switches and every stored value, kept in Tampermonkey storage.

const SETTING_PREFIX = "ART_";

export interface Feature {
  /** Storage suffix; the full key is ART_<key>. */
  key: string;
  label: string;
  /** Used when nothing has been stored yet. */
  defaultOn: boolean;
}

export const LEVEL_PROGRESS: Feature = {
  key: "LEVEL_PROGRESS",
  label: "Level Progress",
  defaultOn: true,
};

export const RACING_CLASS_RECORDS: Feature = {
  key: "RACING_CLASS_RECORDS",
  label: "Racing Class Records",
  defaultOn: true,
};

export const POINT_MERIT_TRACKER: Feature = {
  key: "POINT_MERIT_TRACKER",
  label: "Point Merit Tracker",
  defaultOn: true,
};

/** The switches, in the order the panel shows them. */
export const FEATURES: Feature[] = [LEVEL_PROGRESS, RACING_CLASS_RECORDS, POINT_MERIT_TRACKER];

// Do not move the key to localStorage: this script has GM grants, and
// Tampermonkey's own storage is where a key belongs when it has them.

/** Where the API key is kept. */
export const API_KEY_SETTING = "API_KEY";

/** Whether the standalone preferences panel is open. */
export const PANEL_OPEN_SETTING = "PANEL_OPEN";

/** Whether the tracker on the Points Building is open. */
export const TRACKER_OPEN_SETTING = "TRACKER_OPEN";

/** Returns a stored value, or the fallback when there is none. */
export function readSetting<T>(key: string, fallback: T): T {
  try {
    return GM_getValue<T>(SETTING_PREFIX + key, fallback);
  } catch {
    return fallback;
  }
}

/** Stores a value for later page loads. */
export function writeSetting(key: string, value: unknown): void {
  try {
    GM_setValue(SETTING_PREFIX + key, value as Parameters<typeof GM_setValue>[1]);
  } catch {}
}

/** Whether a feature is switched on. */
export function isEnabled(feature: Feature): boolean {
  return readSetting<boolean>(feature.key, feature.defaultOn);
}

/** Switches a feature on or off for future page loads. */
export function setEnabled(feature: Feature, on: boolean): void {
  writeSetting(feature.key, on);
}

/** Returns the stored API key, or an empty string. */
export function readKey(): string {
  return readSetting<string>(API_KEY_SETTING, "").trim();
}
