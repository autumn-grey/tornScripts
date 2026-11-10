// Every call this script makes to the Torn API, and the small caches in front of them.

import { log } from "./debug";
import { readSetting, writeSetting } from "./settings";

const API_BASE = "https://api.torn.com/v2";

/**
 * The "Points building" log category, which the key link asks access to.
 * Check confirms it against torn/logcategories by title and keeps what that says.
 */
export const POINTS_BUILDING_CATEGORY = 113;
const POINTS_BUILDING_TITLE = /^points building$/i;
/** Where the category id Check confirmed is kept. */
const CATEGORY_SETTING = "LOG_CATEGORY";

/**
 * Opens Torn's new key form, filled in as a custom key that reads the user's
 * Hall of Fame standing, the Points Building log category, the level
 * leaderboard, the log category names, racing records and the points market.
 */
export const API_KEY_CREATE_URL =
  "https://www.torn.com/preferences.php#tab=api?step=addNewKey&title=AutumnRTv1" +
  `&user=hof,log&torn=hof,logcategories&racing=records&market=pointsmarket&logIds=${POINTS_BUILDING_CATEGORY}`;

/** How long the point value is used before the market is asked again. */
const POINT_VALUE_MAX_AGE_MS = 10 * 60_000;
const POINT_VALUE_SETTING = "POINT_VALUE";

/** Torn's error, carried with its code. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
  ) {
    super(message);
  }
}

/** Fetches one v2 endpoint and returns its body, or throws Torn's error. */
export async function tornGet<T>(
  path: string,
  params: Record<string, string | number>,
  key: string,
): Promise<T> {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) search.set(name, String(value));
  search.set("comment", "AutumnRT");
  search.set("key", key);

  const response = await fetch(`${API_BASE}/${path}?${search}`, { credentials: "omit" });
  const body = (await response.json()) as { error?: { code?: number; error?: string } };
  if (body.error) throw new ApiError(body.error.error ?? "API error", body.error.code ?? null);
  log(path, params, body);
  return body as T;
}

/** Returns the middle value of a list, averaging the two middle ones of an even list. */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return 0;
  if (sorted.length % 2) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/** The market value of one point. */
export interface PointValue {
  price: number;
  listings: number;
  fetchedAt: number;
}

/**
 * Returns the median listed price of a point, as autumn-grey.github.io works it
 * out: every listing counts once, whatever its size, so one odd listing cannot
 * move the figure.
 */
export async function fetchPointValue(key: string): Promise<PointValue> {
  const stored = readSetting<PointValue | null>(POINT_VALUE_SETTING, null);
  if (stored && Date.now() - stored.fetchedAt < POINT_VALUE_MAX_AGE_MS) return stored;

  const body = await tornGet<{ pointsmarket?: { cost?: number }[] }>("market/pointsmarket", {}, key);
  const prices = (body.pointsmarket ?? []).map((listing) => listing.cost ?? 0).filter((cost) => cost > 0);

  const value: PointValue = { price: median(prices), listings: prices.length, fetchedAt: Date.now() };
  writeSetting(POINT_VALUE_SETTING, value);
  return value;
}

/**
 * Torn's average point sell price, averaged across the days below, taken by hand
 * from the Points Market's "Average sell value" chart. The API has no price
 * history, so this is refreshed by hand now and then.
 */
export const POINT_AVERAGE = { price: 32_844, from: "2025-11-08", to: "2026-11-07" };

/** The user's level and where it places them on the level leaderboard. */
export interface MyLevel {
  level: number;
  position: number;
}

/** Returns the user's level and leaderboard position. */
export async function fetchMyLevel(key: string): Promise<MyLevel> {
  // Torn sends an error rather than a reply without the level, so the reply is taken as it comes.
  const body = await tornGet<{ hof: { level: { value: number; rank: number } } }>("user/hof", {}, key);
  return { level: body.hof.level.value, position: body.hof.level.rank };
}

/** Returns the Points Building log category id: the one Check confirmed, else the built-in one. */
export function pointsBuildingCategory(): number {
  return readSetting<number>(CATEGORY_SETTING, POINTS_BUILDING_CATEGORY);
}

/** Looks the Points Building category up by name and keeps its id, keeping the built-in one if the name is not found. */
async function confirmCategory(key: string): Promise<number> {
  const body = await tornGet<{ logcategories?: { id: number; title: string }[] }>(
    "torn/logcategories",
    {},
    key,
  );
  const found = (body.logcategories ?? []).find((category) => POINTS_BUILDING_TITLE.test(category.title));
  if (!found) return pointsBuildingCategory();
  writeSetting(CATEGORY_SETTING, found.id);
  return found.id;
}

/** Torn's error code for a key whose access level is too low for the selection. */
const ACCESS_TOO_LOW = 16;

/** What Check found: why the key is unusable, if it is, whether it can read logs, and whether it is a Full Access key. */
export interface KeyCheck {
  problem: string | null;
  logs: boolean;
  full: boolean;
}

/** Returns whether a key can do what this script needs, and whether it can read the Points Building log. */
export async function checkApiKey(key: string): Promise<KeyCheck> {
  const reason = (error: unknown): string => (error instanceof Error ? error.message : "API error");
  const steps: [string, () => Promise<unknown>][] = [
    ["Hall of Fame", () => fetchMyLevel(key)],
    ["Log categories", () => confirmCategory(key)],
    ["Level leaderboard", () => tornGet("torn/hof", { cat: "level", limit: 1 }, key)],
    ["Racing records", () => tornGet("racing/6/records", { cat: "A" }, key)],
    ["Points market", () => tornGet("market/pointsmarket", {}, key)],
  ];
  for (const [name, step] of steps) {
    try {
      await step();
    } catch (error) {
      return { problem: `${name}: ${reason(error)}`, logs: false, full: false };
    }
  }
  // Only the Point Merit Tracker reads logs, so a public key is still worth saving for the rest.
  try {
    await tornGet("user/log", { cat: pointsBuildingCategory(), limit: 1 }, key);
  } catch (error) {
    if (error instanceof ApiError && error.code === ACCESS_TOO_LOW) return { problem: null, logs: false, full: false };
    return { problem: `Points Building log: ${reason(error)}`, logs: false, full: false };
  }
  // Only a Custom or Full Access key reads logs, so only here is it worth asking which one this is.
  const info = await tornGet<{ info?: { access?: { type?: string } } }>("key/info", {}, key).catch(() => null);
  return { problem: null, logs: true, full: info?.info?.access?.type === "Full Access" };
}
