// The user's Points Building log, read from the API and kept so each visit
// only asks for what is new, plus what each entry bought.
//
// Entries are kept raw (title and data) and sorted into purchases when read,
// so a better reading of the titles applies to the whole history at once.

import { pointsBuildingCategory, tornGet } from "./api";
import { log } from "./debug";
import { readSetting, writeSetting } from "./settings";

const LOG_SETTING = "POINTS_LOG";
const PAGE_SIZE = 100;
/** A ceiling on pages per sync, so a stuck cursor cannot loop forever. */
const MAX_PAGES = 200;

/** One kept log entry. */
export interface StoredEntry {
  id: string;
  timestamp: number;
  title: string;
  data: Record<string, unknown>;
}

interface StoredLog {
  /** The category the entries came from; a different one starts over. */
  category: number;
  /** Whether the walk back has reached the oldest entry. */
  complete: boolean;
  entries: StoredEntry[];
}

interface LogPage {
  log?: { id?: string | number; timestamp?: number; details?: { title?: string }; data?: unknown }[];
  _metadata?: { nanostamp?: string | number | null };
}

/**
 * Returns every Points Building log entry. Pages back from the newest entry,
 * stopping once it reaches entries already kept, or the oldest there is.
 */
export async function syncPointsLog(key: string): Promise<StoredEntry[]> {
  const category = pointsBuildingCategory();
  const stored = readSetting<StoredLog | null>(LOG_SETTING, null);
  const kept = stored && stored.category === category ? stored : { category, complete: false, entries: [] };
  const known = new Set(kept.entries.map((entry) => entry.id));

  let cursor: string | null = null;
  let complete = kept.complete;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params: Record<string, string | number> = { cat: category, limit: PAGE_SIZE };
    // Torn's own cursor: timestamps are only to the second, so `to` would repeat or skip entries.
    if (cursor) params.nanostamp = cursor;
    const body = await tornGet<LogPage>("user/log", params, key);
    const rows = body.log ?? [];

    let reachedKnown = false;
    for (const row of rows) {
      const id = String(row.id ?? "");
      if (!id) continue;
      if (known.has(id)) {
        reachedKnown = true;
        continue;
      }
      known.add(id);
      kept.entries.push({
        id,
        timestamp: row.timestamp ?? 0,
        title: row.details?.title ?? "",
        data: row.data && typeof row.data === "object" ? (row.data as Record<string, unknown>) : {},
      });
    }

    const next = body._metadata?.nanostamp;
    if (rows.length < PAGE_SIZE || next === null || next === undefined) {
      complete = true;
      break;
    }
    if (reachedKnown && kept.complete) break;
    cursor = String(next);
  }

  kept.complete = complete;
  kept.entries.sort((a, b) => b.timestamp - a.timestamp);
  writeSetting(LOG_SETTING, kept);
  log("points log", kept.entries.length, "entries", kept.entries.slice(0, 5));
  return kept.entries;
}

/** What one Points Building purchase was. */
export type PurchaseKind =
  | "energy"
  | "nerve"
  | "token"
  | "merit"
  | "reset"
  | "stockTicker"
  | "racingLicense"
  | "displayCase"
  | "bazaar"
  | "hairstyle"
  | "backdrop"
  | "honor"
  | "other";

/** One entry, read. */
export interface Purchase {
  kind: PurchaseKind;
  quantity: number;
  /** Points spent, or null when the entry does not say. */
  points: number | null;
  /** The entry's words, lower case, for matching names in. */
  text: string;
}

// Matched against the title and data together, most specific first: a
// "merit reset" must not count as a merit, nor an honor as anything else.
const KIND_PATTERNS: [PurchaseKind, RegExp][] = [
  ["honor", /\bhonou?r/],
  ["reset", /\breset/],
  ["merit", /\bmerit/],
  ["energy", /\benergy/],
  ["nerve", /\bnerve/],
  ["token", /\btoken|\bcasino/],
  ["stockTicker", /stock ticker/],
  ["racingLicense", /racing licen[cs]e/],
  ["displayCase", /display case/],
  ["bazaar", /\bbazaar/],
  ["hairstyle", /\bhair/],
  ["backdrop", /\bbackdrop/],
];

/** Returns the first numeric field whose name matches, if any. */
function numberField(data: Record<string, unknown>, names: RegExp): number | null {
  for (const [name, value] of Object.entries(data)) {
    if (names.test(name) && typeof value === "number") return value;
  }
  return null;
}

/** Reads what one log entry bought. */
export function readPurchase(entry: StoredEntry): Purchase {
  const text = `${entry.title} ${JSON.stringify(entry.data)}`.toLowerCase();
  const kind = KIND_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0] ?? "other";
  return {
    kind,
    quantity: numberField(entry.data, /^(quantity|qty|amount)$/i) ?? 1,
    points: numberField(entry.data, /point|cost|price/i),
    text,
  };
}
