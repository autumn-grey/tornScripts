// City shop stock: what each city shop has in stock, from the API's
// torn/cityshops, and which of those items the player has picked to watch.

import { log } from "./debug";
import { STOCK_ITEMS_SETTING, readSetting, writeSetting } from "./settings";

const STOCK_URL = "https://api.torn.com/v2/torn/cityshops";
/** Where the last fetched stock is kept, so every page load does not ask. */
const STOCK_STATE_SETTING = "CITY_SHOP_STOCK_STATE";
const CITY_URL = "https://www.torn.com/city.php";

// Each shop's own page, by its name with everything but letters taken out.
// The shops.php steps are the ones the City page links to.
const SHOP_PAGES: Record<string, string> = {
  bitsnbobs: "https://www.torn.com/shops.php?step=bitsnbobs",
  cyberforce: "https://www.torn.com/shops.php?step=cyberforce",
  docks: "https://www.torn.com/shops.php?step=docks",
  jewelrystore: "https://www.torn.com/shops.php?step=jewelry",
  nikehperformance: "https://www.torn.com/shops.php?step=nikeh",
  pharmacy: "https://www.torn.com/shops.php?step=pharmacy",
  postoffice: "https://www.torn.com/shops.php?step=postoffice",
  superstore: "https://www.torn.com/shops.php?step=super",
  sallyssweetshop: "https://www.torn.com/shops.php?step=candy",
  tcclothing: "https://www.torn.com/shops.php?step=clothes",
  bigalsgunshop: "https://www.torn.com/bigalgunshop.php",
};

/** One item a city shop sells. */
export interface StockItem {
  id: number;
  name: string;
  /** Null when the API reply did not give a usable figure. */
  stock: number | null;
}

/** One city shop and what it has in stock. */
export interface CityShop {
  name: string;
  url: string;
  items: StockItem[];
}

/** The stock as last fetched. */
interface StockState {
  fetchedAt: number;
  shops: CityShop[];
}

/** Returns a shop's own page, or the City when the shop is not known. */
function shopUrl(name: string): string {
  return SHOP_PAGES[name.toLowerCase().replace(/[^a-z]/g, "")] ?? CITY_URL;
}

/** Returns a list from an array, or from an object keyed by id. */
function listOf(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === "object") {
    return Object.entries(raw).map(([id, value]) => ({ id, ...(value as object) }));
  }
  return [];
}

// v2 replies { cityshops: [{ id, name, items: [{ id, name, price, stock }] }] }.
// Objects keyed by id (v1's shape) are still read, in case a reply uses one.

/** Returns how many of an item a shop has, or null when the reply does not say. */
function stockOf(item: Record<string, unknown>): number | null {
  // v2 gives "stock": { "current": 458, "default": 1000 }; v1 gave "in_stock": 458.
  const stock = item.stock;
  const value =
    stock && typeof stock === "object" ? (stock as Record<string, unknown>).current : (stock ?? item.in_stock);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Returns the shops in a torn/cityshops response. */
function parseShops(body: Record<string, unknown>): CityShop[] {
  return listOf(body.cityshops ?? body.shops)
    .map((shop) => {
      const name = typeof shop.name === "string" ? shop.name : "";
      const items = listOf(shop.inventory ?? shop.items ?? shop.stock)
        .map((item) => ({
          id: Number(item.id),
          name: typeof item.name === "string" ? item.name : "",
          stock: stockOf(item),
        }))
        .filter((item) => Number.isFinite(item.id) && item.name !== "");
      return { name, url: shopUrl(name), items };
    })
    .filter((shop) => shop.name !== "" && shop.items.length > 0);
}

/** Returns every city shop's stock, or throws Torn's error. */
export async function fetchCityShops(key: string): Promise<CityShop[]> {
  const params = new URLSearchParams({ key });
  const response = await fetch(`${STOCK_URL}?${params}`, { credentials: "omit" });
  const body = (await response.json()) as Record<string, unknown> & {
    error?: { error?: string };
  };
  if (body.error) throw new Error(body.error.error ?? "API error");
  const shops = parseShops(body);
  log("city shop: stock", shops);
  return shops;
}

/** Returns the stored stock and when it was fetched, or null when there is none. */
export function readStock(): StockState | null {
  try {
    const parsed = JSON.parse(readSetting(STOCK_STATE_SETTING, "")) as Partial<StockState>;
    if (typeof parsed.fetchedAt !== "number" || !Array.isArray(parsed.shops)) return null;
    return parsed as StockState;
  } catch {
    return null;
  }
}

/** Returns the stock, fetching it when the stored one is older than maxAgeMs. */
export async function loadStock(key: string, maxAgeMs: number): Promise<CityShop[] | null> {
  const stored = readStock();
  if (stored && Date.now() - stored.fetchedAt < maxAgeMs) return stored.shops;
  try {
    const shops = await fetchCityShops(key);
    writeSetting(STOCK_STATE_SETTING, JSON.stringify({ fetchedAt: Date.now(), shops }));
    return shops;
  } catch (error) {
    log("city shop: could not read the stock", error);
    return stored?.shops ?? null;
  }
}

/** Drops the stored stock, which belongs to whichever key fetched it. */
export function forgetStock(): void {
  writeSetting(STOCK_STATE_SETTING, "");
}

/** Returns the ids of the items picked for the stock check. */
export function readCheckedItems(): Set<number> {
  try {
    const parsed: unknown = JSON.parse(readSetting(STOCK_ITEMS_SETTING, "[]"));
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === "number") : []);
  } catch {
    return new Set();
  }
}

/** Stores the items picked for the stock check. */
export function writeCheckedItems(ids: Set<number>): void {
  writeSetting(STOCK_ITEMS_SETTING, JSON.stringify([...ids]));
}
