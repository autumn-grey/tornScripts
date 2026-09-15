const SETTING_PREFIX = "ET_";

const API_KEY_NAME = "ET_API_KEY";

/** Whether the panel is showing its contents. */
const PANEL_OPEN_KEY = "PANEL_OPEN";

/** Which column the list is ordered by. */
const SORT_KEY = "SORT";

/** The stored roster, so the list is there before the next fetch answers. */
const ROSTER_KEY = "ROSTER";

/** The last team each member was seen on. */
const HISTORY_KEY = "HISTORY";

/** How long a stored roster is used before it is fetched again. */
export const ROSTER_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** Reads one stored setting, or the fallback when there is nothing stored. */
function readSetting(key: string, fallback: string): string {
  try {
    return localStorage.getItem(SETTING_PREFIX + key) ?? fallback;
  } catch {
    return fallback;
  }
}

/** Stores one setting. */
function writeSetting(key: string, value: string): void {
  try {
    localStorage.setItem(SETTING_PREFIX + key, value);
  } catch {
    // The setting just will not survive the tab.
  }
}

// Do not move the key to localStorage: Tampermonkey's own storage is the only
// place in this project an API key is allowed to live.

/** Reads the stored API key, empty when none has been entered. */
export function readApiKey(): string {
  try {
    const stored = GM_getValue(API_KEY_NAME, "");
    return typeof stored === "string" ? stored.trim() : "";
  } catch {
    return "";
  }
}

/** Stores the API key. */
export function writeApiKey(key: string): void {
  try {
    GM_setValue(API_KEY_NAME, key.trim());
  } catch {
    // Nothing else to fall back to.
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

/** How the list is ordered. */
export interface SortOrder {
  column: "name" | "team";
  ascending: boolean;
}

/** Reads the stored sort order. */
export function readSort(): SortOrder {
  const raw = readSetting(SORT_KEY, "");
  const [column, direction] = raw.split(":");
  if (column !== "name" && column !== "team") return { column: "team", ascending: true };
  return { column, ascending: direction !== "desc" };
}

/** Remembers the sort order. */
export function writeSort(sort: SortOrder): void {
  writeSetting(SORT_KEY, `${sort.column}:${sort.ascending ? "asc" : "desc"}`);
}

/** One faction member's standing in this year's elimination. */
export interface RosterEntry {
  id: number;
  name: string;
  team: string | null;
}

/** A loaded roster, flattened for storage. */
export interface Roster {
  factionId: number;
  fetchedAt: number;
  entries: RosterEntry[];
}

/** Reads the stored roster for a faction, or null when there is none. */
export function readRoster(factionId: number): Roster | null {
  const raw = readSetting(ROSTER_KEY, "");
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    const roster = parsed as Partial<Roster>;
    if (roster.factionId !== factionId) return null;
    if (!Array.isArray(roster.entries)) return null;

    return {
      factionId,
      fetchedAt: typeof roster.fetchedAt === "number" ? roster.fetchedAt : 0,
      entries: roster.entries.filter(
        (entry): entry is RosterEntry =>
          !!entry && typeof entry.id === "number" && typeof entry.name === "string",
      ),
    };
  } catch {
    return null;
  }
}

/** Stores a loaded roster. */
export function writeRoster(roster: Roster): void {
  writeSetting(ROSTER_KEY, JSON.stringify(roster));
}

/** Says whether a stored roster is still young enough to show without refetching. */
export function rosterIsFresh(roster: Roster): boolean {
  return Date.now() - roster.fetchedAt < ROSTER_MAX_AGE_MS;
}

// Torn stops naming a team the moment someone leaves it, and offers nothing
// that says they ever had one. The only way to cross out the team a leaver
// was on is to have written it down while they were still on it.

/** The last team each member was seen on, by member id. */
export function readHistory(): Record<string, string> {
  const raw = readSetting(HISTORY_KEY, "");
  if (!raw) return {};

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};

    const history: Record<string, string> = {};
    for (const [id, team] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof team === "string" && team) history[id] = team;
    }
    return history;
  } catch {
    return {};
  }
}

/** Adds every member currently on a team to the record. */
export function rememberTeams(entries: RosterEntry[]): Record<string, string> {
  const history = readHistory();
  for (const entry of entries) {
    if (entry.team) history[String(entry.id)] = entry.team;
  }
  writeSetting(HISTORY_KEY, JSON.stringify(history));
  return history;
}
