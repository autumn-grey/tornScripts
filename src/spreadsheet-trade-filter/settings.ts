const SETTING_PREFIX = "STF_";

/** The source spreadsheet link, exactly as the user typed it. */
export const SHEET_URL_KEY = "SHEET_URL";

/** The last successful load, so the list is there before the next fetch answers. */
export const SHEET_CACHE_KEY = "SHEET_CACHE";

/** Whether the panel is showing its contents. */
export const PANEL_OPEN_KEY = "PANEL_OPEN";

/** Reads one stored setting, or the fallback when there is nothing stored. */
export function readSetting(key: string, fallback: string): string {
  try {
    return localStorage.getItem(SETTING_PREFIX + key) ?? fallback;
  } catch {
    return fallback;
  }
}

/** Stores one setting. */
export function writeSetting(key: string, value: string): void {
  try {
    localStorage.setItem(SETTING_PREFIX + key, value);
  } catch {
    // The setting just will not survive the tab.
  }
}

/** Forgets one setting. */
export function clearSetting(key: string): void {
  try {
    localStorage.removeItem(SETTING_PREFIX + key);
  } catch {
    // As above.
  }
}

/** Says whether the panel should start open. */
export function readPanelOpen(): boolean {
  return readSetting(PANEL_OPEN_KEY, "1") !== "0";
}

/** Remembers whether the panel is open. */
export function writePanelOpen(open: boolean): void {
  writeSetting(PANEL_OPEN_KEY, open ? "1" : "0");
}

/** A loaded item list, flattened for storage. */
export interface SheetCache {
  csvUrl: string;
  fetchedAt: number;
  items: string[];
}

/** Reads the stored item list, or null when nothing has been loaded yet. */
export function readSheetCache(): SheetCache | null {
  const raw = readSetting(SHEET_CACHE_KEY, "");
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    const cache = parsed as Partial<SheetCache>;
    if (typeof cache.csvUrl !== "string") return null;
    if (!Array.isArray(cache.items)) return null;

    return {
      csvUrl: cache.csvUrl,
      fetchedAt: typeof cache.fetchedAt === "number" ? cache.fetchedAt : 0,
      items: cache.items,
    };
  } catch {
    return null;
  }
}

/** Stores a loaded item list. */
export function writeSheetCache(cache: SheetCache): void {
  writeSetting(SHEET_CACHE_KEY, JSON.stringify(cache));
}

/** The cached item names as a lookup, empty until a sheet has loaded. */
export function readCachedItems(): Set<string> {
  const cache = readSheetCache();
  if (!cache) return new Set();

  const items = new Set<string>();
  for (const name of cache.items) {
    if (typeof name === "string" && name) items.add(name);
  }
  return items;
}

/** Says whether a storage key belongs to this script. */
export function isOurStorageKey(key: string | null): boolean {
  return typeof key === "string" && key.startsWith(SETTING_PREFIX);
}
