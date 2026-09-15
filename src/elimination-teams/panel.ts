import { ApiError, factionIdFromUrl, fetchTeams, isKeyProblem } from "./api";
import { log } from "./debug";
import { Cancelled, loadRoster } from "./roster";
import {
  Roster,
  SortOrder,
  readApiKey,
  readHistory,
  readPanelOpen,
  readRoster,
  readSort,
  rosterIsFresh,
  writeApiKey,
  writePanelOpen,
  writeSort,
} from "./settings";
import {
  COLLAPSED_CLASS,
  ELIMINATED_CLASS,
  LEFT_CLASS,
  PANEL_ID,
  injectStyles,
} from "./styles";
import { TeamInfo, darkTheme, iconUrl, indexTeams, slugify } from "./teams";

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
let rows: Row[] = [];
let sort: SortOrder = readSort();
let loadToken = 0;

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

/** Turns a stored roster into the lines the panel shows. */
function buildRows(roster: Roster): Row[] {
  const built: Row[] = [];
  const history = readHistory();

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

/** Builds the badge shown beside a member's team. */
function buildBadge(row: Row): HTMLElement {
  const badge = document.createElement("span");
  badge.className = "et-badge";

  if (row.state === "eliminated") badge.classList.add(ELIMINATED_CLASS);
  if (row.state === "left") badge.classList.add(LEFT_CLASS);

  if (row.slug) {
    const image = document.createElement("img");
    const dark = darkTheme();
    image.src = iconUrl(row.slug, dark);
    image.alt = row.teamName;
    image.loading = "lazy";
    image.addEventListener(
      "error",
      () => {
        image.src = iconUrl(row.slug, !dark);
      },
      { once: true },
    );
    badge.appendChild(image);
  } else {
    const placeholder = document.createElement("span");
    placeholder.className = "et-no-team";
    badge.appendChild(placeholder);
  }

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
  return "Something went wrong loading the roster.";
}

/** How long ago a stored roster was loaded. */
function describeAge(roster: Roster): string {
  const minutes = Math.round((Date.now() - roster.fetchedAt) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minutes ago`;
  return `${Math.round(minutes / 60)} hours ago`;
}

/** Loads the teams and the faction's standings, then draws the list. */
async function load(options: { force: boolean }): Promise<void> {
  const token = ++loadToken;
  const key = readApiKey();
  const button = document.getElementById("et-refresh") as HTMLButtonElement | null;

  if (!key) {
    rows = [];
    renderList();
    setStatus("none", "Enter a public API key to load your faction.");
    return;
  }

  const factionId = factionIdFromUrl();
  const cached = readRoster(factionId ?? 0);

  if (button) button.disabled = true;
  setStatus("working", "Loading teams...");

  try {
    teamIndex = indexTeams(await fetchTeams(key));
    if (token !== loadToken) return;

    if (cached && !options.force && rosterIsFresh(cached)) {
      rows = buildRows(cached);
      renderList();
      setStatus("ok", `Showing ${rows.length} members, loaded ${describeAge(cached)}.`);
      return;
    }

    if (cached) {
      rows = buildRows(cached);
      renderList();
    }

    const roster = await loadRoster(
      key,
      factionId,
      ({ done, total }) => {
        if (token !== loadToken) return;
        setStatus("working", `Checking members... ${done}/${total}`);
      },
      () => token !== loadToken,
    );

    if (token !== loadToken) return;
    rows = buildRows(roster);
    renderList();
    setStatus("ok", `Showing ${rows.length} members in a team.`);
  } catch (error) {
    if (error instanceof Cancelled || token !== loadToken) return;
    log("load failed", error);
    setStatus("error", describe(error));
  } finally {
    if (token === loadToken && button) button.disabled = false;
  }
}

/** Builds the API key field and the refresh button. */
function buildKeyField(): HTMLElement {
  const field = document.createElement("div");

  const label = document.createElement("label");
  label.className = "et-field-label";
  label.htmlFor = "et-api-key";
  label.textContent = "Public API Key";
  field.appendChild(label);

  const row = document.createElement("div");
  row.className = "et-key-row";

  const input = document.createElement("input");
  input.id = "et-api-key";
  input.className = "et-text-input";
  input.type = "password";
  input.spellcheck = false;
  input.autocomplete = "off";
  input.placeholder = "Public access key";
  input.value = readApiKey();
  row.appendChild(input);

  const refresh = document.createElement("button");
  refresh.id = "et-refresh";
  refresh.type = "button";
  refresh.className = "et-button torn-btn";
  refresh.textContent = "Refresh";
  row.appendChild(refresh);

  field.appendChild(row);

  const status = document.createElement("div");
  status.id = "et-status";
  status.className = "et-status";
  field.appendChild(status);

  const hint = document.createElement("div");
  hint.className = "et-hint";
  hint.textContent =
    "A public access key is enough. The first load asks Torn about every " +
    "member in turn, so it takes about a minute, and the result is kept for " +
    "12 hours.";
  field.appendChild(hint);

  const submit = (): void => {
    writeApiKey(input.value);
    void load({ force: true });
  };

  input.addEventListener("change", submit);
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    submit();
  });
  refresh.addEventListener("click", submit);

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
  text.textContent = "Elimination Teams";
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
  body.appendChild(buildKeyField());

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
  void load({ force: false });
}
