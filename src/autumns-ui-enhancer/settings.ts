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
  /** Off, and greyed out in the panel, in Torn's mobile view. */
  desktopOnly?: boolean;
}

// Torn switches to its mobile layout at this width.
const MOBILE_QUERY = "(max-width: 784px)";

/** Whether Torn is showing its mobile layout. */
export function isMobileView(): boolean {
  return matchMedia(MOBILE_QUERY).matches;
}

export const PAGE_JUMP_BLOCK: Feature = {
  key: "PAGE_JUMP_BLOCK",
  label: "Page Jump Block",
  defaultOn: true,
};

export const INDEPENDENT_CHAT_TABS: Feature = {
  key: "INDEPENDENT_CHAT_TABS",
  label: "Independent Chat Tabs",
  defaultOn: true,
};

export const CHAT_SIDE_BUTTON: Feature = {
  key: "CHAT_SIDE_BUTTON",
  label: "Chat Left/Right Button",
  defaultOn: true,
  desktopOnly: true,
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

export const PREFERRED_RECIPIENT: Feature = {
  // The key stays as it was so nobody's existing choice is forgotten; only
  // what it covers, and what it is called, have changed.
  key: "SHOP_SEND",
  label: "Preferred Recipient",
  defaultOn: true,
};

export const DISPLAY_CASE_BUTTON: Feature = {
  key: "DISPLAY_CASE_BUTTON",
  label: "Display Case Button",
  defaultOn: true,
};

export const CITY_SHOP_ALERT: Feature = {
  // The key keeps the feature's first name so nobody's choice is forgotten.
  key: "CITY_SHOP_ALERT",
  label: "City Shop Purchase Check",
  defaultOn: true,
};

export const CITY_SHOP_STOCK: Feature = {
  key: "CITY_SHOP_STOCK",
  label: "City Shop Stock Check",
  defaultOn: true,
};

// Do not move the key to GM_setValue: any @grant sandboxes this script, and
// the fetch, XHR and scroll patches would stop reaching Torn's own code.

/** Where the API key is kept. */
export const API_KEY_SETTING = "API_KEY";

/** Where the ids of the city shop items whose stock is shown are kept, as JSON. */
export const STOCK_ITEMS_SETTING = "CITY_SHOP_STOCK_ITEMS";

/** Whether the preferences panel is open. */
export const PANEL_OPEN_SETTING = "PANEL_OPEN";

/** Whether the list of city shop items to check is open. */
export const STOCK_LIST_OPEN_SETTING = "CITY_SHOP_STOCK_LIST_OPEN";

/** Where the default recipient is kept. */
export const RECIPIENT_SETTING = "SEND_RECIPIENT";

/** Where the text shown in the recipient box is kept. */
export const RECIPIENT_LABEL = "SEND_RECIPIENT_LABEL";

/** The line printed under the switches. */
export const PANEL_FOOTNOTE =
  "Dark/Light Mode switch and table sorting in Torn Wiki enabled by default.";

/** The switches that need no API key, in the order the panel shows them. */
export const FEATURES: Feature[] = [
  PAGE_JUMP_BLOCK,
  INDEPENDENT_CHAT_TABS,
  CHAT_SIDE_BUTTON,
  LIST_DISPLAY_EXTENSION,
  LIST_SORTING,
  NEWS_TICKER,
  PREFERRED_RECIPIENT,
  DISPLAY_CASE_BUTTON,
];

/** The switches that use the API key, shown under it. */
export const API_FEATURES: Feature[] = [CITY_SHOP_ALERT, CITY_SHOP_STOCK];

/** Whether a feature is switched on. */
export function isEnabled(feature: Feature): boolean {
  if (feature.desktopOnly && isMobileView()) return false;
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
