// ==UserScript==
// @name         Faction Elimination Team Checker
// @namespace    https://github.com/autumn-grey
// @version      1.2.2
// @description  Adds a collapsible panel to the faction page showing which elimination team each faction member is on, with eliminated teams greyed out.
// @author       AutumnGrey
// @license      MIT
// @match        https://www.torn.com/factions.php*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// @noframes     true
// @downloadURL  https://raw.githubusercontent.com/autumn-grey/tornScripts/main/dist/faction-elimination-team-checker.user.js
// @updateURL    https://raw.githubusercontent.com/autumn-grey/tornScripts/main/dist/faction-elimination-team-checker.user.js
// ==/UserScript==

"use strict";
(() => {
  // src/faction-elimination-team-checker/debug.ts
  var DEBUG_KEY = "ET_DEBUG";
  function debugging() {
    try {
      return localStorage.getItem(DEBUG_KEY) === "1";
    } catch {
      return false;
    }
  }
  function log(...parts) {
    if (!debugging()) return;
    console.debug("[ET]", ...parts);
  }

  // src/faction-elimination-team-checker/teams.ts
  var ICON_BASE = "https://www.torn.com/images/v2/competition/elimination/team-icons";
  function slugify(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
  function darkTheme() {
    return document.body?.classList.contains("dark-mode") ?? true;
  }
  function iconUrl(slug, dark) {
    return `${ICON_BASE}/${slug}-${dark ? "dark" : "light"}.svg`;
  }
  function indexTeams(teams) {
    const index = /* @__PURE__ */ new Map();
    for (const team of teams) index.set(team.name.toLowerCase(), team);
    return index;
  }
  function seasonKey(competition, teams) {
    const ids = teams.map((team) => team.id).sort((a, b) => a - b).join(",");
    return `${competition}:${ids}`;
  }

  // src/faction-elimination-team-checker/api.ts
  var V1 = "https://api.torn.com";
  var V2 = "https://api.torn.com/v2";
  var ApiError = class extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  };
  function isKeyProblem(error) {
    return error instanceof ApiError && [1, 2, 10, 13, 16, 18].includes(error.code);
  }
  async function request(url) {
    let body;
    try {
      const response = await fetch(url, { credentials: "omit" });
      body = await response.json();
    } catch {
      throw new ApiError(0, "Could not reach the Torn API.");
    }
    const error = body.error;
    if (error) throw new ApiError(error.code ?? 0, error.error ?? "Unknown API error.");
    return body;
  }
  async function fetchCompetition(key) {
    const body = await request(`${V1}/torn/?selections=competition&key=${encodeURIComponent(key)}`);
    const competition = body.competition;
    const teams = Array.isArray(competition?.teams) ? competition.teams : [];
    return {
      name: competition?.name ?? "",
      teams: teams.map((entry) => entry).filter((entry) => typeof entry.name === "string").map((entry) => ({
        id: entry.teamID ?? 0,
        name: entry.name,
        slug: slugify(entry.name),
        lives: entry.lives ?? 0,
        eliminated: (entry.lives ?? 0) <= 0
      }))
    };
  }
  async function fetchMembers(key, factionId) {
    const path = factionId ? `${V2}/faction/${factionId}/members` : `${V2}/faction/members`;
    const body = await request(`${path}?key=${encodeURIComponent(key)}`);
    const members = Array.isArray(body.members) ? body.members : [];
    return members.map((entry) => entry).filter((entry) => typeof entry.id === "number").map((entry) => ({ id: entry.id, name: entry.name ?? String(entry.id) }));
  }
  async function fetchTeamOf(key, userId) {
    const body = await request(
      `${V1}/user/${userId}?selections=profile&key=${encodeURIComponent(key)}`
    );
    const competition = body.competition;
    log("standing", userId, competition);
    const team = typeof competition?.team === "string" ? competition.team : "";
    return team && team.toLowerCase() !== "unknown" ? team : null;
  }
  function factionIdFromUrl() {
    const id = new URLSearchParams(location.search).get("ID");
    const parsed = Number(id);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  // src/faction-elimination-team-checker/settings.ts
  var SETTING_PREFIX = "ET_";
  var API_KEY_NAME = "ET_API_KEY";
  var PANEL_OPEN_KEY = "PANEL_OPEN";
  var SORT_KEY = "SORT";
  var TEAMS_KEY = "TEAMS";
  var ROSTER_KEY = "ROSTER";
  var HISTORY_KEY = "HISTORY";
  var TEAMS_MAX_AGE_MS = 12 * 60 * 60 * 1e3;
  function readSetting(key, fallback) {
    try {
      return localStorage.getItem(SETTING_PREFIX + key) ?? fallback;
    } catch {
      return fallback;
    }
  }
  function writeSetting(key, value) {
    try {
      localStorage.setItem(SETTING_PREFIX + key, value);
    } catch {
    }
  }
  function readJson(key) {
    const raw = readSetting(key, "");
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }
  function readApiKey() {
    try {
      const stored = GM_getValue(API_KEY_NAME, "");
      return typeof stored === "string" ? stored.trim() : "";
    } catch {
      return "";
    }
  }
  function writeApiKey(key) {
    try {
      GM_setValue(API_KEY_NAME, key.trim());
    } catch {
    }
  }
  function readPanelOpen() {
    return readSetting(PANEL_OPEN_KEY, "1") !== "0";
  }
  function writePanelOpen(open) {
    writeSetting(PANEL_OPEN_KEY, open ? "1" : "0");
  }
  function readSort() {
    const [column, direction] = readSetting(SORT_KEY, "").split(":");
    if (column !== "name" && column !== "team") return { column: "team", ascending: true };
    return { column, ascending: direction !== "desc" };
  }
  function writeSort(sort2) {
    writeSetting(SORT_KEY, `${sort2.column}:${sort2.ascending ? "asc" : "desc"}`);
  }
  function readTeams() {
    const stored = readJson(TEAMS_KEY);
    if (!stored || typeof stored.season !== "string") return null;
    if (!Array.isArray(stored.teams)) return null;
    return {
      season: stored.season,
      fetchedAt: typeof stored.fetchedAt === "number" ? stored.fetchedAt : 0,
      teams: stored.teams.filter(
        (team) => !!team && typeof team.name === "string"
      )
    };
  }
  function writeTeams(teams) {
    writeSetting(TEAMS_KEY, JSON.stringify(teams));
  }
  function teamsAreFresh(teams) {
    return Date.now() - teams.fetchedAt < TEAMS_MAX_AGE_MS;
  }
  function readRoster(factionId, season2) {
    const stored = readJson(ROSTER_KEY);
    if (!stored || stored.season !== season2 || stored.factionId !== factionId) return null;
    if (!Array.isArray(stored.entries)) return null;
    return {
      season: season2,
      factionId,
      fetchedAt: typeof stored.fetchedAt === "number" ? stored.fetchedAt : 0,
      entries: stored.entries.filter(
        (entry) => !!entry && typeof entry.id === "number" && typeof entry.name === "string"
      )
    };
  }
  function writeRoster(roster) {
    writeSetting(ROSTER_KEY, JSON.stringify(roster));
  }
  function readHistory(season2) {
    const stored = readJson(HISTORY_KEY);
    if (!stored || stored.season !== season2 || !stored.teams) return {};
    const history = {};
    for (const [id, team] of Object.entries(stored.teams)) {
      if (typeof team === "string" && team) history[id] = team;
    }
    return history;
  }
  function rememberTeams(season2, entries) {
    const teams = readHistory(season2);
    for (const entry of entries) {
      if (entry.team) teams[String(entry.id)] = entry.team;
    }
    writeSetting(HISTORY_KEY, JSON.stringify({ season: season2, teams }));
  }

  // src/faction-elimination-team-checker/roster.ts
  var CALL_SPACING_MS = 700;
  var RATE_LIMIT_BACKOFF_MS = 15e3;
  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  var Cancelled = class extends Error {
  };
  async function scanRoster(key, season2, factionId, onProgress, cancelled) {
    const members = await fetchMembers(key, factionId);
    const entries = [];
    onProgress({ done: 0, total: members.length });
    for (const member of members) {
      if (cancelled()) throw new Cancelled();
      try {
        const team = await fetchTeamOf(key, member.id);
        entries.push({ id: member.id, name: member.name, team });
      } catch (error) {
        if (error instanceof ApiError && error.code === 5) {
          log("rate limited, backing off");
          await wait(RATE_LIMIT_BACKOFF_MS);
          if (cancelled()) throw new Cancelled();
          const team = await fetchTeamOf(key, member.id);
          entries.push({ id: member.id, name: member.name, team });
        } else if (error instanceof ApiError && error.code === 6) {
          log("skipping unknown member", member.id);
        } else {
          throw error;
        }
      }
      onProgress({ done: entries.length, total: members.length });
      await wait(CALL_SPACING_MS);
    }
    const roster = {
      season: season2,
      factionId: factionId ?? 0,
      fetchedAt: Date.now(),
      entries
    };
    writeRoster(roster);
    rememberTeams(season2, entries);
    return roster;
  }

  // src/faction-elimination-team-checker/styles.ts
  var STYLE_ID = "et-styles";
  var PANEL_ID = "et-panel";
  var COLLAPSED_CLASS = "et-collapsed";
  var ELIMINATED_CLASS = "et-eliminated";
  var LEFT_CLASS = "et-left";
  var CSS = `
  #${PANEL_ID} {
    margin: 0 0 10px;
    border-radius: 5px;
    overflow: hidden;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    font-family: Arial, Helvetica, sans-serif;
    color: #fff;
  }
  .et-title {
    display: flex;
    align-items: center;
    gap: 7px;
    cursor: pointer;
    user-select: none;
    height: 30px;
    line-height: 30px;
    padding: 0 10px;
    background: linear-gradient(180deg, #4e565e 0%, #303840 100%);
    font-weight: bold;
    font-size: 12px;
    color: #fff;
    text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
  }
  .et-caret {
    font-size: 10px;
    line-height: 1;
    transition: transform 0.15s ease;
  }
  .${COLLAPSED_CLASS} .et-caret {
    transform: rotate(-90deg);
  }
  .${COLLAPSED_CLASS} .et-body {
    display: none;
  }
  .et-count {
    margin-left: auto;
    font-weight: normal;
    font-size: 11px;
    color: #cfcfcf;
  }
  .et-body {
    background: linear-gradient(180deg, #656565 0%, #373737 100%);
    padding: 10px 12px;
  }

  /* ------------------------------------------------------------ key field */

  .et-field-label {
    display: block;
    margin: 0 0 5px;
    font-size: 13px;
    line-height: 18px;
    color: #fff;
  }
  .et-key-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .et-text-input {
    box-sizing: border-box;
    flex: 1 1 260px;
    min-width: 0;
    max-width: 420px;
    padding: 4px 7px;
    border: 1px solid rgba(0, 0, 0, 0.5);
    border-radius: 4px;
    background: #f2f2f2;
    color: #000;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    line-height: 18px;
  }
  .et-text-input:focus {
    outline: none;
    border-color: #fff;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.6);
  }
  /* Paint, font and border come from Torn's own torn-btn; only the size is
     ours, because a full-size button crowds the field. */
  .et-button {
    box-sizing: border-box;
    width: auto;
    min-width: 0;
    height: 24px;
    line-height: 22px;
    margin: 0;
    padding: 0 10px;
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
  }
  .et-button:not(.torn-btn) {
    border: 1px solid #1c2228;
    border-radius: 3px;
    background: linear-gradient(180deg, #5b646d 0%, #333b43 100%);
    color: #fff;
    font-family: "Fjalla One", "Arial Narrow", Arial, sans-serif;
    text-transform: uppercase;
    text-shadow: 0 1px 1px rgba(0, 0, 0, 0.6);
  }
  .et-button[disabled] {
    opacity: 0.5;
    cursor: default;
  }
  .et-status {
    margin: 5px 0 0;
    font-size: 11px;
    line-height: 15px;
    font-weight: bold;
    text-shadow: 0 1px 1px rgba(0, 0, 0, 0.6);
  }
  .et-status-ok      { color: #5ed17c; }
  .et-status-error   { color: #ff6b6b; }
  .et-status-working { color: #d6d6d6; font-weight: normal; }
  .et-hint {
    margin: 4px 0 0;
    font-size: 11px;
    line-height: 15px;
    color: #d0d0d0;
  }

  /* ---------------------------------------------------------- member list */

  .et-table {
    margin: 10px 0 0;
    border: 1px solid #1a1a1a;
    border-radius: 5px;
    overflow: hidden;
  }
  .et-head {
    display: flex;
    background: linear-gradient(180deg, #4e565e 0%, #303840 100%);
  }
  .et-head-cell {
    flex: 1 1 50%;
    padding: 0 10px;
    height: 26px;
    line-height: 26px;
    font-size: 11px;
    font-weight: bold;
    color: #fff;
    text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .et-head-cell:hover {
    color: #8ecfff;
  }
  .et-arrow {
    margin-left: 4px;
    font-size: 9px;
  }
  .et-row {
    display: flex;
    align-items: center;
    min-height: 30px;
    border-top: 1px solid rgba(0, 0, 0, 0.35);
    background: #4a4a4a;
  }
  .et-row:nth-child(even) {
    background: #414141;
  }
  .et-cell {
    flex: 1 1 50%;
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    padding: 4px 10px;
    font-size: 12px;
    color: #eee;
  }
  .et-cell a {
    color: #a3d2ff;
    text-decoration: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .et-cell a:hover {
    text-decoration: underline;
  }
  .et-badge {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 26px;
    height: 26px;
  }
  .et-badge img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }
  .${ELIMINATED_CLASS} img {
    filter: grayscale(1);
    opacity: 0.55;
  }
  .${ELIMINATED_CLASS} + .et-team-name {
    color: #9a9a9a;
  }
  .${LEFT_CLASS} img {
    filter: grayscale(1);
    opacity: 0.45;
  }
  /* The two bars of the cross, drawn over whatever the badge holds. */
  .${LEFT_CLASS}::before,
  .${LEFT_CLASS}::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 50%;
    width: 130%;
    height: 2px;
    margin-left: -65%;
    background: #e03131;
    box-shadow: 0 0 2px rgba(0, 0, 0, 0.8);
  }
  .${LEFT_CLASS}::before { transform: rotate(45deg); }
  .${LEFT_CLASS}::after  { transform: rotate(-45deg); }
  .et-no-team {
    width: 20px;
    height: 20px;
    border: 1px dashed #8d8d8d;
    border-radius: 3px;
  }
  .et-team-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .et-empty {
    padding: 10px;
    font-size: 12px;
    color: #d0d0d0;
    background: #454545;
  }
`;
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head ?? document.documentElement).appendChild(style);
  }

  // src/faction-elimination-team-checker/panel.ts
  var ANCHOR_SELECTORS = [".tt-filter", ".members-list", ".f-war-list"];
  var teamIndex = /* @__PURE__ */ new Map();
  var season = "";
  var rows = [];
  var sort = readSort();
  var scanToken = 0;
  function findAnchor() {
    for (const selector of ANCHOR_SELECTORS) {
      const element = document.querySelector(selector);
      if (element) return element;
    }
    for (const element of Array.from(document.querySelectorAll('[class*="tt-"]'))) {
      if (/filter/i.test(element.className)) return element;
    }
    return null;
  }
  function buildRows(roster) {
    const built = [];
    const history = readHistory(season);
    for (const entry of roster.entries) {
      if (entry.team) {
        const team2 = teamIndex.get(entry.team.toLowerCase());
        built.push({
          id: entry.id,
          name: entry.name,
          teamName: team2?.name ?? entry.team,
          slug: team2?.slug ?? slugify(entry.team),
          state: team2?.eliminated ? "eliminated" : "in"
        });
        continue;
      }
      const remembered = history[String(entry.id)];
      if (!remembered) continue;
      const team = teamIndex.get(remembered.toLowerCase());
      built.push({
        id: entry.id,
        name: entry.name,
        teamName: team?.name ?? remembered,
        slug: team?.slug ?? slugify(remembered),
        state: "left"
      });
    }
    return built;
  }
  function sortRows(list) {
    const direction = sort.ascending ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sort.column === "name") {
        return a.name.localeCompare(b.name, void 0, { sensitivity: "base" }) * direction;
      }
      const byTeam = a.teamName.localeCompare(b.teamName, void 0, { sensitivity: "base" });
      if (byTeam !== 0) return byTeam * direction;
      return a.name.localeCompare(b.name, void 0, { sensitivity: "base" });
    });
  }
  function buildPlaceholder() {
    const placeholder = document.createElement("span");
    placeholder.className = "et-no-team";
    return placeholder;
  }
  function buildBadge(row) {
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
  function buildRow(row) {
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
  function buildHeadCell(column, text) {
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
    const activate = () => {
      sort = sort.column === column ? { column, ascending: !sort.ascending } : { column, ascending: true };
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
  function renderList() {
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
  function setStatus(kind, text) {
    const status = document.getElementById("et-status");
    if (!status) return;
    status.className = kind === "none" ? "et-status" : `et-status et-status-${kind}`;
    status.textContent = text;
  }
  function describe(error) {
    if (error instanceof ApiError) {
      if (isKeyProblem(error)) return `Key rejected: ${error.message}`;
      return error.message;
    }
    return "Something went wrong talking to Torn.";
  }
  function describeAge(at) {
    const minutes = Math.round((Date.now() - at) / 6e4);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} minutes ago`;
    const hours = Math.round(minutes / 60);
    return hours < 24 ? `${hours} hours ago` : `${Math.round(hours / 24)} days ago`;
  }
  function setBusy(busy) {
    for (const id of ["et-refresh-teams", "et-scan"]) {
      const button = document.getElementById(id);
      if (button) button.disabled = busy;
    }
  }
  function showStoredRoster() {
    const roster = readRoster(factionIdFromUrl() ?? 0, season);
    rows = roster ? buildRows(roster) : [];
    renderList();
  }
  async function loadTeams(force) {
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
  function summarise() {
    if (!rows.length) return "No members scanned yet. Press Check for leavers.";
    const out = rows.filter((row) => row.state === "eliminated").length;
    const left = rows.filter((row) => row.state === "left").length;
    const parts = [`${rows.length} in a team`];
    if (out) parts.push(`${out} eliminated`);
    if (left) parts.push(`${left} left`);
    return `${parts.join(", ")}.`;
  }
  async function refreshTeams(force) {
    setBusy(true);
    try {
      if (!await loadTeams(force)) return;
      showStoredRoster();
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
  async function scanMembers(options) {
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
      if (!await loadTeams(options.forceTeams)) return;
      showStoredRoster();
      const roster = await scanRoster(
        key,
        season,
        factionIdFromUrl(),
        ({ done, total }) => {
          if (token !== scanToken) return;
          setStatus("working", `Checking members... ${done}/${total}`);
        },
        () => token !== scanToken
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
  function buildControls() {
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
    hint.textContent = "Entering a key scans the whole faction, which takes about a minute. After that, eliminations are checked on their own every 12 hours, and who is on which team only changes when you press Check for leavers.";
    field.appendChild(hint);
    const keyEntered = () => {
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
  function buildTitle(panel) {
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
    const apply = (open) => {
      panel.classList.toggle(COLLAPSED_CLASS, !open);
      title.setAttribute("aria-expanded", String(open));
    };
    apply(readPanelOpen());
    const toggle = () => {
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
  function buildPanel() {
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
  function watchTheme() {
    let dark = darkTheme();
    new MutationObserver(() => {
      if (darkTheme() === dark) return;
      dark = !dark;
      renderList();
    }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }
  function installPanel() {
    if (document.getElementById(PANEL_ID)) return;
    const anchor = findAnchor();
    if (!anchor) return;
    injectStyles();
    anchor.insertAdjacentElement("beforebegin", buildPanel());
    watchTheme();
    void refreshTeams(false);
  }

  // src/faction-elimination-team-checker/index.ts
  function onReady() {
    installPanel();
    new MutationObserver(() => installPanel()).observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  if (document.body) {
    onReady();
  } else {
    document.addEventListener("DOMContentLoaded", onReady, { once: true });
  }
})();
