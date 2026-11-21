// Personal Stats fixes: the personal stats page opens on the timespan and stats last chosen.
//
// Torn keeps both choices in the page address
// ("personalstats.php?ID=4386333&stats=useractivity&from=1%20month") and
// writes them there as they are changed. An address with neither opens on
// one month of Time played. So each choice is kept as Torn writes it, and
// put back into an address that has none before Torn's own code reads it.
// Nothing is reloaded or fetched for it: Torn loads the chart once either way.

import { log } from "./debug";
import { PERSONAL_STATS_FIXES, isEnabled, readSetting, writeSetting } from "./settings";

const PERSONAL_STATS_PATH = "/personalstats.php";

/** The address parameters remembered: the timespan, and the stats shown (comma separated when several). */
const REMEMBERED = ["from", "stats"] as const;

/** Returns where a parameter's last value is kept. */
function settingFor(name: (typeof REMEMBERED)[number]): string {
  return `PERSONAL_STATS_${name.toUpperCase()}`;
}

/** Keeps the timespan and stats an address carries, as the last ones chosen. */
function remember(address: string): void {
  let url: URL;
  try {
    url = new URL(address, location.href);
  } catch {
    return;
  }
  if (url.pathname !== PERSONAL_STATS_PATH) return;
  for (const name of REMEMBERED) {
    const value = url.searchParams.get(name);
    if (value) writeSetting(settingFor(name), value);
  }
}

/**
 * Adds the remembered timespan and stats to an address that has none.
 *
 * Written the way Torn writes them, with %20 for a space: a "+" from
 * URLSearchParams might not read back as one in Torn's own code. An address
 * that already names either, such as a link that asks for a particular stat,
 * keeps what it names.
 */
function restore(): void {
  const current = new URLSearchParams(location.search);
  let search = location.search;
  for (const name of REMEMBERED) {
    if (current.has(name)) continue;
    const value = readSetting(settingFor(name), "");
    if (!value) continue;
    search += `${search ? "&" : "?"}${name}=${encodeURIComponent(value)}`;
  }
  if (search === location.search) return;
  log("personal stats: opening on", search);
  history.replaceState(history.state, "", `${location.pathname}${search}${location.hash}`);
}

/** Has the History API keep each timespan or stats change Torn writes into the address. */
function watchHistory(name: "pushState" | "replaceState"): void {
  const original = history[name];
  history[name] = function (this: History, ...args: unknown[]) {
    const result = (original as (...a: unknown[]) => unknown).apply(this, args);
    if (typeof args[2] === "string" || args[2] instanceof URL) remember(String(args[2]));
    return result;
  } as History[typeof name];
}

/** Opens the personal stats page on the last timespan and stats, and keeps each new choice. Runs at document-start. */
export function installPersonalStats(): void {
  if (location.pathname !== PERSONAL_STATS_PATH || !isEnabled(PERSONAL_STATS_FIXES)) return;
  restore();
  watchHistory("pushState");
  watchHistory("replaceState");
  addEventListener("popstate", () => remember(location.href));
}
