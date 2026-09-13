// Where the script's settings live.
//
// localStorage rather than GM storage, matching Autumn's UI Enhancer: no
// grant needed, and a value written on one Torn tab is picked up by the next
// read on another. The only thing that needs a grant here is fetching the
// spreadsheet, which lives on another site.

const SETTING_PREFIX = "ABH_";

/** The source spreadsheet link, exactly as the user typed it. */
export const SHEET_URL_KEY = "SHEET_URL";

/** Last successful load, so a market page has prices before its own fetch. */
export const SHEET_CACHE_KEY = "SHEET_CACHE";

/** How far under the sheet price a listing has to be, as a percentage. */
export const MAX_BUY_VALUE_KEY = "MAX_BUY_VALUE";

/** Nothing off the sheet price demanded until the user asks for a discount. */
export const DEFAULT_MAX_BUY_VALUE = 0;

export function readSetting(key: string, fallback: string): string {
  try {
    return localStorage.getItem(SETTING_PREFIX + key) ?? fallback;
  } catch {
    // Private mode, or storage disabled - carry on without persistence.
    return fallback;
  }
}

export function writeSetting(key: string, value: string): void {
  try {
    localStorage.setItem(SETTING_PREFIX + key, value);
  } catch {
    // As above: the setting just will not survive the tab.
  }
}

export function clearSetting(key: string): void {
  try {
    localStorage.removeItem(SETTING_PREFIX + key);
  } catch {
    // As above.
  }
}

// ------------------------------------------------------- maximum buy value

/** Held to 0-100, because it is a percentage off and nothing else makes sense. */
export function clampMaxBuyValue(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MAX_BUY_VALUE;
  return Math.min(100, Math.max(0, value));
}

export function readMaxBuyValue(): number {
  const stored = readSetting(MAX_BUY_VALUE_KEY, "");
  if (!stored) return DEFAULT_MAX_BUY_VALUE;
  return clampMaxBuyValue(Number(stored));
}

export function writeMaxBuyValue(value: number): void {
  writeSetting(MAX_BUY_VALUE_KEY, String(clampMaxBuyValue(value)));
}

// ------------------------------------------------------------ price cache

/** A loaded sheet, flattened for storage. */
export interface SheetCache {
  /** The address the prices came from, so a stale cache is detectable. */
  csvUrl: string;
  /** Epoch ms of the fetch that produced these prices. */
  fetchedAt: number;
  /** [item name in lower case, price] pairs - a Map is not JSON. */
  entries: [string, number][];
}

export function readSheetCache(): SheetCache | null {
  const raw = readSetting(SHEET_CACHE_KEY, "");
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    const cache = parsed as Partial<SheetCache>;
    if (typeof cache.csvUrl !== "string") return null;
    if (!Array.isArray(cache.entries)) return null;

    return {
      csvUrl: cache.csvUrl,
      fetchedAt: typeof cache.fetchedAt === "number" ? cache.fetchedAt : 0,
      entries: cache.entries,
    };
  } catch {
    // Written by an older version, or truncated - treat as no cache.
    return null;
  }
}

export function writeSheetCache(cache: SheetCache): void {
  writeSetting(SHEET_CACHE_KEY, JSON.stringify(cache));
}

/** The cached prices as a lookup, empty if nothing has been loaded yet. */
export function readCachedPrices(): Map<string, number> {
  const cache = readSheetCache();
  if (!cache) return new Map();

  const prices = new Map<string, number>();
  for (const entry of cache.entries) {
    const [name, price] = entry;
    if (typeof name === "string" && typeof price === "number") {
      prices.set(name, price);
    }
  }
  return prices;
}

/** Every key this script writes, for anything that watches for changes. */
export function isOurStorageKey(key: string | null): boolean {
  return typeof key === "string" && key.startsWith(SETTING_PREFIX);
}
