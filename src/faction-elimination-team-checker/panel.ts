import {
  ApiError,
  factionIdFromUrl,
  fetchCompetition,
  fetchOwnFactionId,
  isKeyProblem,
} from "./api";
import { log } from "./debug";
import { Cancelled, scanRoster } from "./roster";
import {
  Roster,
  SortOrder,
  readApiKey,
  readHistory,
  readOwnFactionId,
  readPanelOpen,
  readRoster,
  readSort,
  readTeams,
  teamsAreFresh,
  writeApiKey,
  writeOwnFactionId,
  writePanelOpen,
  writeSort,
  writeTeams,
} from "./settings";
import {
  COLLAPSED_CLASS,
  ELIMINATED_CLASS,
  LEFT_CLASS,
  PANEL_ID,
  injectStyles,
} from "./styles";
import { TeamInfo, darkTheme, iconUrl, indexTeams, seasonKey, slugify } from "./teams";

// Unhashed landmarks, most specific first. The panel goes directly before
// whichever is found, so it lands above TornTools' member filter.
// Do not reorder: .members-list sits below the filter, not above it.
const ANCHOR_SELECTORS = [".tt-filter", ".members-list", ".f-war-list"];

/** One member's line in the panel. */
interface Row {
  id: number;
  name: string;
  teamName: string;
  slug: string;
  state: "in" | "eliminated" | "left";
}

let teamIndex = new Map<string, TeamInfo>();
let season = "";
let rows: Row[] = [];
let sort: SortOrder = readSort();
let scanToken = 0;

/** The element the panel is inserted before, or null when none is on the page. */
function findAnchor(): Element | null {
  for (const selector of ANCHOR_SELECTORS) {
    const element = document.querySelector(selector);
    if (element) return element;
  }

  // TornTools hashes nothing but does move its filter around, so fall back to
  // anything of theirs that calls itself a filter.
  for (const element of Array.from(document.querySelectorAll('[class*="tt-"]'))) {
    if (/filter/i.test(element.className)) return element;
  }
  return null;
}

/** Turns a stored scan into the lines the panel shows. */
function buildRows(roster: Roster): Row[] {
  const built: Row[] = [];
  const history = readHistory(season);

  for (const entry of roster.entries) {
    if (entry.team) {
      const team = teamIndex.get(entry.team.toLowerCase());
      built.push({
        id: entry.id,
        name: entry.name,
        teamName: team?.name ?? entry.team,
        slug: team?.slug ?? slugify(entry.team),
        state: team?.eliminated ? "eliminated" : "in",
      });
      continue;
    }

    // Nothing in the profile separates a leaver from someone who never
    // joined, so a leaver is only known by the team this script last saw
    // them on.
    const remembered = history[String(entry.id)];
    if (!remembered) continue;

    const team = teamIndex.get(remembered.toLowerCase());
    built.push({
      id: entry.id,
      name: entry.name,
      teamName: team?.name ?? remembered,
      slug: team?.slug ?? slugify(remembered),
      state: "left",
    });
  }

  return built;
}

/** Orders the lines by the chosen column. */
function sortRows(list: Row[]): Row[] {
  const direction = sort.ascending ? 1 : -1;

  return [...list].sort((a, b) => {
    if (sort.column === "name") {
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) * direction;
    }

    const byTeam = a.teamName.localeCompare(b.teamName, undefined, { sensitivity: "base" });
    if (byTeam !== 0) return byTeam * direction;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

/** An empty badge, for a team with no icon to show. */
function buildPlaceholder(): HTMLElement {
  const placeholder = document.createElement("span");
  placeholder.className = "et-no-team";
  return placeholder;
}

/** Builds the badge shown beside a member's team. */
function buildBadge(row: Row): HTMLElement {
  const badge = document.createElement("span");
  badge.className = "et-badge";

  if (row.state === "eliminated") badge.classList.add(ELIMINATED_CLASS);
  if (row.state === "left") badge.classList.add(LEFT_CLASS);

  if (!row.slug) {
    badge.appendChild(buildPlaceholder());
    return badge;
  }

  const image = document.createElement("img");
  const dark = darkTheme();
  let tried = false;

  image.src = iconUrl(row.slug, dark);
  image.alt = row.teamName;
  image.loading = "lazy";

  // A team Torn has named but has no icon for leaves an empty badge rather
  // than a broken one.
  image.addEventListener("error", () => {
    if (!tried) {
      tried = true;
      image.src = iconUrl(row.slug, !dark);
      return;
    }
    image.replaceWith(buildPlaceholder());
  });

  badge.appendChild(image);
  return badge;
}

/** Builds one member's line. */
function buildRow(row: Row): HTMLElement {
  const line = document.createElement("div");
  line.className = "et-row";

  const nameCell = document.createElement("div");
  nameCell.className = "et-cell";
  const link = document.createElement("a");
  link.href = `/profiles.php?XID=${row.id}`;
  link.textContent = row.name;
  link.title = row.name;
  nameCell.appendChild(link);
  line.appendChild(nameCell);

  const teamCell = document.createElement("div");
  teamCell.className = "et-cell";
  teamCell.appendChild(buildBadge(row));

  const label = document.createElement("span");
  label.className = "et-team-name";
  const suffix = { in: "", eliminated: " (out)", left: " (left)" }[row.state];
  label.textContent = `${row.teamName}${suffix}`;
  label.title = label.textContent;
  teamCell.appendChild(label);
  line.appendChild(teamCell);

  return line;
}

/** Builds a clickable column heading. */
function buildHeadCell(column: SortOrder["column"], text: string): HTMLElement {
  const cell = document.createElement("div");
  cell.className = "et-head-cell";
  cell.setAttribute("role", "button");
  cell.tabIndex = 0;
  cell.textContent = text;

  if (sort.column === column) {
    const arrow = document.createElement("span");
    arrow.className = "et-arrow";
    arrow.textContent = sort.ascending ? "▲" : "▼";
    cell.appendChild(arrow);
  }

  const activate = (): void => {
    sort =
      sort.column === column
        ? { column, ascending: !sort.ascending }
        : { column, ascending: true };
    writeSort(sort);
    renderList();
  };

  cell.addEventListener("click", activate);
  cell.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    activate();
  });

  return cell;
}

/** Redraws the member list from what has been loaded. */
function renderList(): void {
  const host = document.getElementById("et-list");
  const count = document.getElementById("et-count");
  if (!host) return;

  host.textContent = "";
  if (count) count.textContent = rows.length ? `${rows.length} shown` : "";
  if (!rows.length) return;

  const table = document.createElement("div");
  table.className = "et-table";

  const head = document.createElement("div");
  head.className = "et-head";
  head.appendChild(buildHeadCell("name", "Faction member"));
  head.appendChild(buildHeadCell("team", "Team"));
  table.appendChild(head);

  for (const row of sortRows(rows)) table.appendChild(buildRow(row));
  host.appendChild(table);
}

type StatusKind = "ok" | "error" | "working" | "none";

/** Writes the line under the key field. */
function setStatus(kind: StatusKind, text: string): void {
  const status = document.getElementById("et-status");
  if (!status) return;
  status.className = kind === "none" ? "et-status" : `et-status et-status-${kind}`;
  status.textContent = text;
}

/** Turns an API failure into something worth reading. */
function describe(error: unknown): string {
  if (error instanceof ApiError) {
    if (isKeyProblem(error)) return `Key rejected: ${error.message}`;
    return error.message;
  }
  return "Something went wrong talking to Torn.";
}

/** How long ago something was fetched. */
function describeAge(at: number): string {
  const minutes = Math.round((Date.now() - at) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} hours ago` : `${Math.round(hours / 24)} days ago`;
}

/** Turns both buttons on or off while something is running. */
function setBusy(busy: boolean): void {
  for (const id of ["et-refresh-teams", "et-scan"]) {
    const button = document.getElementById(id) as HTMLButtonElement | null;
    if (button) button.disabled = busy;
  }
}

/** The faction being looked at, asking Torn only the first time. */
async function resolveFactionId(key: string): Promise<number> {
  const fromUrl = factionIdFromUrl();
  if (fromUrl) return fromUrl;

  const stored = readOwnFactionId();
  if (stored) return stored;

  const own = await fetchOwnFactionId(key);
  if (own) writeOwnFactionId(own);
  return own;
}

/** Draws the stored scan for the season the standings describe. */
function showStoredRoster(factionId: number): void {
  const roster = readRoster(factionId, season);
  rows = roster ? buildRows(roster) : [];
  renderList();
}

/** Loads the standings, from storage when they are still young enough. */
async function loadTeams(force: boolean): Promise<boolean> {
  const key = readApiKey();
  if (!key) {
    rows = [];
    renderList();
    setStatus("none", "Enter a public API key to get started.");
    return false;
  }

  const stored = readTeams();
  if (stored && !force && teamsAreFresh(stored)) {
    teamIndex = indexTeams(stored.teams);
    season = stored.season;
    log("teams from storage", season);
    return true;
  }

  setStatus("working", "Checking which teams are still in...");

  const competition = await fetchCompetition(key);
  if (!competition.teams.length) {
    rows = [];
    renderList();
    setStatus("none", "Torn is not running a team competition at the moment.");
    return false;
  }

  season = seasonKey(competition.name, competition.teams);
  teamIndex = indexTeams(competition.teams);
  writeTeams({ season, fetchedAt: Date.now(), teams: competition.teams });

  return true;
}

/** Says how many of the shown members are on a team that is out. */
function summarise(): string {
  if (!rows.length) return "No members scanned yet. Press Check for leavers.";

  const out = rows.filter((row) => row.state === "eliminated").length;
  const left = rows.filter((row) => row.state === "left").length;
  const parts = [`${rows.length} in a team`];
  if (out) parts.push(`${out} eliminated`);
  if (left) parts.push(`${left} left`);
  return `${parts.join(", ")}.`;
}

/** Refreshes the standings and redraws, without touching the member scan. */
async function refreshTeams(force: boolean): Promise<void> {
  setBusy(true);

  try {
    if (!(await loadTeams(force))) return;
    showStoredRoster(await resolveFactionId(readApiKey()));

    const stored = readTeams();
    const age = stored ? describeAge(stored.fetchedAt) : "just now";
    setStatus("ok", `${summarise()} Teams checked ${age}.`);
  } catch (error) {
    log("teams failed", error);
    setStatus("error", describe(error));
  } finally {
    setBusy(false);
  }
}

/** Walks every member again, which is the only way a leaver turns up. */
async function scanMembers(options: { forceTeams: boolean }): Promise<void> {
  const token = ++scanToken;
  const key = readApiKey();
  if (!key) {
    rows = [];
    renderList();
    setStatus("none", "Enter a public API key to get started.");
    return;
  }

  setBusy(true);

  try {
    if (!(await loadTeams(options.forceTeams))) return;

    const factionId = await resolveFactionId(key);
    showStoredRoster(factionId);

    const roster = await scanRoster(
      key,
      season,
      factionId,
      ({ done, total }) => {
        if (token !== scanToken) return;
        setStatus("working", `Checking members... ${done}/${total}`);
      },
      () => token !== scanToken,
    );

    if (token !== scanToken) return;
    rows = buildRows(roster);
    renderList();
    setStatus("ok", summarise());
  } catch (error) {
    if (error instanceof Cancelled || token !== scanToken) return;
    log("scan failed", error);
    setStatus("error", describe(error));
  } finally {
    if (token === scanToken) setBusy(false);
  }
}

const SVG_NS = "http://www.w3.org/2000/svg";

const EYE_PATHS = ["M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z", "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"];

const EYE_OFF_PATHS = [
  "M17.9 17.9A10.1 10.1 0 0 1 12 20C5 20 1 12 1 12a18.5 18.5 0 0 1 5.1-5.9",
  "M9.9 4.2A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.2 3.2",
  "M14.1 14.1a3 3 0 1 1-4.2-4.2",
  "M1 1l22 22",
];

/** Builds the eye drawn on the reveal button. */
function buildEye(hidden: boolean): SVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");

  for (const definition of hidden ? EYE_OFF_PATHS : EYE_PATHS) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", definition);
    svg.appendChild(path);
  }

  return svg;
}

/** Builds the button that shows and hides the key. */
function buildEyeToggle(input: HTMLInputElement): HTMLElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "et-eye";

  const apply = (shown: boolean): void => {
    input.type = shown ? "text" : "password";
    button.title = shown ? "Hide key" : "Show key";
    button.setAttribute("aria-label", button.title);
    button.setAttribute("aria-pressed", String(shown));
    button.textContent = "";
    button.appendChild(buildEye(shown));
  };

  apply(false);
  button.addEventListener("click", () => apply(input.type === "password"));

  return button;
}

/** Builds the API key field and the two buttons. */
function buildControls(): HTMLElement {
  const field = document.createElement("div");

  const label = document.createElement("label");
  label.className = "et-field-label";
  label.htmlFor = "et-api-key";
  label.textContent = "Public API Key";
  field.appendChild(label);

  const row = document.createElement("div");
  row.className = "et-key-row";

  const keyField = document.createElement("div");
  keyField.className = "et-key-field";

  const input = document.createElement("input");
  input.id = "et-api-key";
  input.className = "et-text-input";
  input.type = "password";
  input.spellcheck = false;
  input.autocomplete = "off";
  input.placeholder = "Public access key";
  input.value = readApiKey();
  keyField.appendChild(input);
  keyField.appendChild(buildEyeToggle(input));
  row.appendChild(keyField);

  const teamsButton = document.createElement("button");
  teamsButton.id = "et-refresh-teams";
  teamsButton.type = "button";
  teamsButton.className = "et-button torn-btn";
  teamsButton.textContent = "Refresh teams";
  teamsButton.title = "Check which teams have been eliminated. One call.";
  row.appendChild(teamsButton);

  const scanButton = document.createElement("button");
  scanButton.id = "et-scan";
  scanButton.type = "button";
  scanButton.className = "et-button torn-btn";
  scanButton.textContent = "Check for leavers";
  scanButton.title = "Ask Torn about every member again. Takes about a minute.";
  row.appendChild(scanButton);

  field.appendChild(row);

  const status = document.createElement("div");
  status.id = "et-status";
  status.className = "et-status";
  field.appendChild(status);

  const hint = document.createElement("div");
  hint.className = "et-hint";
  hint.textContent =
    "Entering a key scans the whole faction, which takes about a minute. " +
    "After that, eliminations are checked on their own every 12 hours or by " +
    "pressing refresh teams. Pressing check for leavers will see if any " +
    "members have left a team since the last scan, unfortunately members who " +
    "left before your first scan cannot be checked with an API (unless " +
    "someone knows a way?)";
  field.appendChild(hint);

  // A key on its own shows nothing, so entering one runs the full scan
  // rather than leaving an empty panel behind.
  // Do not drop the comparison: Enter and the blur that follows it would
  // otherwise start the scan twice.
  const keyEntered = (): void => {
    if (input.value.trim() === readApiKey()) return;
    writeApiKey(input.value);
    void scanMembers({ forceTeams: true });
  };

  input.addEventListener("change", keyEntered);
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    keyEntered();
  });
  teamsButton.addEventListener("click", () => void refreshTeams(true));
  scanButton.addEventListener("click", () => void scanMembers({ forceTeams: false }));

  return field;
}

/** Builds the title bar, which opens and closes the panel. */
function buildTitle(panel: HTMLElement): HTMLElement {
  const title = document.createElement("div");
  title.className = "et-title";
  title.setAttribute("role", "button");
  title.tabIndex = 0;

  const caret = document.createElement("span");
  caret.className = "et-caret";
  caret.textContent = "▾";
  title.appendChild(caret);

  const text = document.createElement("span");
  text.textContent = "Faction Elimination Team Checker";
  title.appendChild(text);

  const count = document.createElement("span");
  count.id = "et-count";
  count.className = "et-count";
  title.appendChild(count);

  const apply = (open: boolean): void => {
    panel.classList.toggle(COLLAPSED_CLASS, !open);
    title.setAttribute("aria-expanded", String(open));
  };

  apply(readPanelOpen());

  const toggle = (): void => {
    const open = panel.classList.contains(COLLAPSED_CLASS);
    writePanelOpen(open);
    apply(open);
  };

  title.addEventListener("click", toggle);
  title.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggle();
  });

  return title;
}

/** Builds the panel. */
function buildPanel(): HTMLElement {
  const panel = document.createElement("div");
  panel.id = PANEL_ID;
  panel.appendChild(buildTitle(panel));

  const body = document.createElement("div");
  body.className = "et-body";
  body.appendChild(buildControls());

  const list = document.createElement("div");
  list.id = "et-list";
  body.appendChild(list);

  panel.appendChild(body);
  return panel;
}

/** Redraws the badges when Torn is switched between light and dark. */
function watchTheme(): void {
  let dark = darkTheme();

  new MutationObserver(() => {
    if (darkTheme() === dark) return;
    dark = !dark;
    renderList();
  }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
}

/** Puts the panel above the member filter, once. */
export function installPanel(): void {
  if (document.getElementById(PANEL_ID)) return;

  const anchor = findAnchor();
  if (!anchor) return;

  injectStyles();
  anchor.insertAdjacentElement("beforebegin", buildPanel());
  watchTheme();
  void refreshTeams(false);
}
