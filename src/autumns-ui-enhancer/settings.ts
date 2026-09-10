// The feature switches, and where they are kept.

const SETTING_PREFIX = "AUE_";

export interface Feature {
  /** localStorage suffix; the full key is AUE_<key>. */
  key: string;
  label: string;
  /** A second, smaller line under the label. */
  note?: string;
  /** Used when nothing has been stored yet. */
  defaultOn: boolean;
}

export const PAGE_JUMP_BLOCK: Feature = {
  key: "PAGE_JUMP_BLOCK",
  label: "Page Jump Block",
  defaultOn: true,
};

export const LIST_DISPLAY_EXTENSION: Feature = {
  key: "LIST_DISPLAY_EXTENSION",
  label: "List Display Extension",
  defaultOn: true,
};

export const LIST_SORTING: Feature = {
  key: "LIST_SORTING",
  label: "Table Sorting",
  note: "applies to displayed results only",
  defaultOn: true,
};

export const NEWS_TICKER: Feature = {
  key: "NEWS_TICKER",
  label: "News Ticker Controls",
  defaultOn: true,
};

/** The line printed under the switches. */
export const PANEL_FOOTNOTE =
  "Dark/Light Mode switch and table sorting in Torn Wiki enabled by default.";

/** Every switch the preferences panel offers, in the order it shows them. */
export const FEATURES: Feature[] = [
  PAGE_JUMP_BLOCK,
  LIST_DISPLAY_EXTENSION,
  LIST_SORTING,
  NEWS_TICKER,
];

/** Whether a feature is switched on. */
export function isEnabled(feature: Feature): boolean {
  try {
    const stored = localStorage.getItem(SETTING_PREFIX + feature.key);
    if (stored === null) return feature.defaultOn;
    return stored === "1";
  } catch {
    return feature.defaultOn;
  }
}

/** Switches a feature on or off for future page loads. */
export function setEnabled(feature: Feature, on: boolean): void {
  try {
    localStorage.setItem(SETTING_PREFIX + feature.key, on ? "1" : "0");
  } catch {}
}

/** Returns a stored value, or the fallback when there is none. */
export function readSetting(key: string, fallback: string): string {
  try {
    return localStorage.getItem(SETTING_PREFIX + key) ?? fallback;
  } catch {
    return fallback;
  }
}

/** Stores a value for later page loads. */
export function writeSetting(key: string, value: string): void {
  try {
    localStorage.setItem(SETTING_PREFIX + key, value);
  } catch {}
}
