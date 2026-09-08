// Feature switches, and where they are kept.
//
// Everything lives in localStorage rather than GM storage so the settings
// are readable from any Torn tab without a grant, and so a value written on
// one tab is picked up by the next read on another.

const SETTING_PREFIX = "AUE_";

export interface Feature {
  /** localStorage suffix; the full key is AUE_<key>. */
  key: string;
  label: string;
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

/** Every switch the preferences panel offers, in the order it shows them. */
export const FEATURES: Feature[] = [PAGE_JUMP_BLOCK, LIST_DISPLAY_EXTENSION];

export function isEnabled(feature: Feature): boolean {
  try {
    const stored = localStorage.getItem(SETTING_PREFIX + feature.key);
    if (stored === null) return feature.defaultOn;
    return stored === "1";
  } catch {
    // Private mode, or storage disabled - fall back to the default.
    return feature.defaultOn;
  }
}

export function setEnabled(feature: Feature, on: boolean): void {
  try {
    localStorage.setItem(SETTING_PREFIX + feature.key, on ? "1" : "0");
  } catch {
    // As above - the switch just won't persist.
  }
}

/** A plain stored value, for feature settings that aren't on/off. */
export function readSetting(key: string, fallback: string): string {
  try {
    return localStorage.getItem(SETTING_PREFIX + key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeSetting(key: string, value: string): void {
  try {
    localStorage.setItem(SETTING_PREFIX + key, value);
  } catch {
    // As above.
  }
}
