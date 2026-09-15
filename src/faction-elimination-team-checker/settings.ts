import { TeamInfo } from "./teams";

const SETTING_PREFIX = "ET_";

const API_KEY_NAME = "ET_API_KEY";

/** Whether the panel is showing its contents. */
const PANEL_OPEN_KEY = "PANEL_OPEN";

/** Which column the list is ordered by. */
const SORT_KEY = "SORT";

/** The standings, which go stale as teams are knocked out. */
const TEAMS_KEY = "TEAMS";

/** The scanned faction, which only changes when someone joins or leaves. */
const ROSTER_KEY = "ROSTER";

/** The faction the key's owner belongs to, once it has been looked up. */
const OWN_FACTION_KEY = "OWN_FACTION";

/** The last team each member was seen on. */
const HISTORY_KEY = "HISTORY";

/** How long the standings are used before they are fetched again. */
const TEAMS_MAX_AGE_MS = 12 * 60 * 60 * 1000;

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

/** Reads one stored object, or null when there is nothing usable stored. */
function readJson<T>(key: string): Partial<T> | null {
  const raw = readSetting(key, "");
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Partial<T>) : null;
  } catch {
    return null;
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
  const [column, direction] = readSetting(SORT_KEY, "").split(":");
  if (column !== "name" && column !== "team") return { column: "team", ascending: true };
  return { column, ascending: direction !== "desc" };
}

/** Remembers the sort order. */
export function writeSort(sort: SortOrder): void {
  writeSetting(SORT_KEY, `${sort.column}:${sort.ascending ? "asc" : "desc"}`);
}

/** The standings as they were last fetched. */
export interface StoredTeams {
  season: string;
  fetchedAt: number;
  teams: TeamInfo[];
}

/** Reads the stored standings, or null when there are none. */
export function readTeams(): StoredTeams | null {
  const stored = readJson<StoredTeams>(TEAMS_KEY);
  if (!stored || typeof stored.season !== "string") return null;
  if (!Array.isArray(stored.teams)) return null;

  return {
    season: stored.season,
    fetchedAt: typeof stored.fetchedAt === "number" ? stored.fetchedAt : 0,
    teams: stored.teams.filter(
      (team): team is TeamInfo => !!team && typeof team.name === "string",
    ),
  };
}

/** Stores the standings. */
export function writeTeams(teams: StoredTeams): void {
  writeSetting(TEAMS_KEY, JSON.stringify(teams));
}

/** Says whether the standings are young enough to use without refetching. */
export function teamsAreFresh(teams: StoredTeams): boolean {
  return Date.now() - teams.fetchedAt < TEAMS_MAX_AGE_MS;
}

/** One faction member's standing in this year's elimination. */
export interface RosterEntry {
  id: number;
  name: string;
  team: string | null;
}

/** A scanned faction. */
export interface Roster {
  season: string;
  factionId: number;
  fetchedAt: number;
  entries: RosterEntry[];
}

// Everything below is stamped with the season and dropped when it changes:
// the teams are replaced each year, so a roster or a remembered team from
// last year would otherwise be read as this year's.

/** The faction the key's owner belongs to, or 0 when it is not known yet. */
export function readOwnFactionId(): number {
  const stored = Number(readSetting(OWN_FACTION_KEY, ""));
  return Number.isFinite(stored) && stored > 0 ? stored : 0;
}

/** Remembers which faction the key's owner belongs to. */
export function writeOwnFactionId(factionId: number): void {
  writeSetting(OWN_FACTION_KEY, String(factionId));
}

/** Returns the storage slot holding one faction's scan. */
function rosterKey(factionId: number): string {
  return `${ROSTER_KEY}_${factionId}`;
}

/** Reads the stored scan for a faction and season, or null when there is none. */
export function readRoster(factionId: number, season: string): Roster | null {
  // Do not remove: scans made before per-faction slots live under the old key.
  const stored = readJson<Roster>(rosterKey(factionId)) ?? readJson<Roster>(ROSTER_KEY);
  if (!stored || stored.season !== season || stored.factionId !== factionId) return null;
  if (!Array.isArray(stored.entries)) return null;

  return {
    season,
    factionId,
    fetchedAt: typeof stored.fetchedAt === "number" ? stored.fetchedAt : 0,
    entries: stored.entries.filter(
      (entry): entry is RosterEntry =>
        !!entry && typeof entry.id === "number" && typeof entry.name === "string",
    ),
  };
}

/** Stores a scanned faction. */
export function writeRoster(roster: Roster): void {
  writeSetting(rosterKey(roster.factionId), JSON.stringify(roster));
}

// Torn stops naming a team the moment someone leaves it, and offers nothing
// that says they ever had one. The only way to cross out the team a leaver
// was on is to have written it down while they were still on it.

/** The last team each member was seen on this season, by member id. */
export function readHistory(season: string): Record<string, string> {
  const stored = readJson<{ season: string; teams: Record<string, unknown> }>(HISTORY_KEY);
  if (!stored || stored.season !== season || !stored.teams) return {};

  const history: Record<string, string> = {};
  for (const [id, team] of Object.entries(stored.teams)) {
    if (typeof team === "string" && team) history[id] = team;
  }
  return history;
}

/** Adds every member currently on a team to the record. */
export function rememberTeams(season: string, entries: RosterEntry[]): void {
  const teams = readHistory(season);
  for (const entry of entries) {
    if (entry.team) teams[String(entry.id)] = entry.team;
  }
  writeSetting(HISTORY_KEY, JSON.stringify({ season, teams }));
}
