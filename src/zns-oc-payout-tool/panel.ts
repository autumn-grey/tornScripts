// The panel on the faction bank page: key, percentages, the crime list and
// each crime's member breakdown.

import { BAD_KEY_SHAPE, isKeyShaped } from "../shared/apiKey";
import { ApiError, checkKey } from "./api";
import { Prefill, fillBankForm, watchSendButton } from "./bank";
import { CrimeRow, buildRows, loadMore, memberName, moreToLoad, resetCrimes } from "./crimes";
import { log } from "./debug";
import { Percents, PlayerPayout, completePercents, percentsProblem } from "./payout";
import {
  readApiKey,
  readPanelOpen,
  readPercents,
  recordPayment,
  writeApiKey,
  writePanelOpen,
  writePercents,
} from "./settings";
import { COLLAPSED_CLASS, PANEL_ID, injectStyles } from "./styles";

/** The sheet holding every payment made with the tool; the button stays off until it exists. */
const FULL_LOG_URL = "";

/**
 * The armoury tab's content panel. It only exists while the armoury tab is
 * open, and Torn hides it with the tab, so a panel placed inside goes with it.
 */
const ARMOURY_ROOT = "#faction-armoury";
/**
 * The rule under the armoury panel's title. The panel goes just before it,
 * which puts it directly under the faction tab menu. TornW3B Companion's
 * Faction Quick Items bar anchors here too and shows in that spot.
 */
const ARMOURY_RULE = "#faction-armoury > hr";

/** A member chosen for payment, with the crime it is for. */
interface Selection extends Prefill {
  crimeId: number;
  percents: Percents;
}

let percents = readPercents();
let rows: CrimeRow[] = [];
let selection: Selection | null = null;
const openCrimes = new Set<number>();
let busy = false;

// ------------------------------------------------------------- formatting

/** Formats dollars the way Torn does, or "?" when the amount is not known. */
function money(amount: number | null): string {
  return amount === null ? "?" : `$${Math.round(amount).toLocaleString("en-US")}`;
}

/** Formats seconds as days, hours and minutes, leaving out leading days and hours that are 0. */
function duration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes % 60}m`;
}

/** Formats a timestamp in Torn City Time, which is UTC. */
function tornDate(at: number | null): string {
  if (!at) return "-";
  const date = new Date(at * 1000);
  const two = (value: number): string => String(value).padStart(2, "0");
  return `${two(date.getUTCDate())}/${two(date.getUTCMonth() + 1)}/${String(date.getUTCFullYear()).slice(2)} ` +
    `${two(date.getUTCHours())}:${two(date.getUTCMinutes())}`;
}

/** Makes an element with a class and text. */
function make<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

/** Returns one of Torn's own buttons. */
function button(text: string): HTMLButtonElement {
  const element = make("button", "torn-btn ocp-button", text);
  element.type = "button";
  return element;
}

// --------------------------------------------------------------- key field

const SVG_NS = "http://www.w3.org/2000/svg";
const EYE_PATHS = ["M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z", "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"];
const EYE_OFF_PATHS = [
  "M17.9 17.9A10.1 10.1 0 0 1 12 20C5 20 1 12 1 12a18.5 18.5 0 0 1 5.1-5.9",
  "M9.9 4.2A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.2 3.2",
  "M14.1 14.1a3 3 0 1 1-4.2-4.2",
  "M1 1l22 22",
];

/** Builds the eye drawn on the reveal button. */
function buildEye(shown: boolean): SVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  for (const definition of shown ? EYE_OFF_PATHS : EYE_PATHS) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", definition);
    svg.appendChild(path);
  }
  return svg;
}

/** Builds the key box with its show/hide button. */
function buildKeyField(): { field: HTMLElement; input: HTMLInputElement } {
  const field = make("div", "ocp-key-field");
  const input = make("input", "ocp-input");
  // A text box masked by CSS, not a password box: browsers' password managers
  // ignore autocomplete="off" on password fields and fill in a saved or
  // suggested password. The data- flags stop the common password extensions.
  input.type = "text";
  input.autocomplete = "off";
  input.name = "ocp-torn-api-key";
  input.spellcheck = false;
  input.setAttribute("data-lpignore", "true");
  input.setAttribute("data-1p-ignore", "true");
  input.setAttribute("data-bwignore", "true");
  input.setAttribute("data-form-type", "other");
  input.placeholder = "Limited access key";
  input.value = readApiKey();

  const eye = make("button", "ocp-eye");
  eye.type = "button";
  let shown = false;
  const apply = (): void => {
    input.classList.toggle("ocp-masked", !shown);
    eye.title = shown ? "Hide key" : "Show key";
    eye.setAttribute("aria-label", eye.title);
    eye.replaceChildren(buildEye(shown));
  };
  apply();
  eye.addEventListener("click", () => {
    shown = !shown;
    apply();
  });

  field.append(input, eye);
  return { field, input };
}

/** Writes a short result beside a button. */
function setStatus(target: HTMLElement, kind: "ok" | "error" | "none", text: string): void {
  target.className = `ocp-status${kind === "none" ? "" : ` ocp-${kind}`}`;
  target.textContent = text;
}

/** Turns an API error into a few words. */
function describe(error: unknown): string {
  if (error instanceof ApiError && [2, 10, 13, 16, 18].includes(error.code)) return "Invalid key";
  if (error instanceof ApiError && error.code === 7) return "No faction API access";
  return error instanceof Error ? error.message : "Something went wrong";
}

// ------------------------------------------------------------- crime list

/** Says whether every member of a crime is settled. */
function crimeDone(row: CrimeRow): boolean {
  if (row.state === "chain-failed" || row.paidByTorn) return true;
  if (!row.payout) return false;
  return row.payout.players.every((player) => row.paid.has(player.id));
}

/** Returns "X/Y" for a crime's paid members. */
function paidCount(row: CrimeRow): string {
  const total = row.crime.slots.filter((slot) => slot.user).length;
  if (row.paidByTorn || row.state === "chain-failed") return `${total}/${total}`;
  return `${row.paid.size}/${total}`;
}

/** Marks a crime that is part of a chain with its place in it. */
function chainTag(row: CrimeRow): HTMLElement | null {
  if (row.chain.length < 2) return null;
  const position = row.chain.indexOf(row.crime) + 1;
  const tag = make("span", "ocp-chain", `Chain ${position}/${row.chain.length}`);
  tag.title = row.chain.map((link) => link.name || `#${link.id}`).join(" → ");
  return tag;
}

/** Builds the line of totals above a crime's members. */
function buildSummary(row: CrimeRow): HTMLElement {
  const summary = make("div", "ocp-summary");
  if (row.state !== "payable") {
    summary.textContent = row.state === "waiting" ? "Waiting on the crime this one unlocked" : "The crime this one unlocked failed";
    return summary;
  }
  // Figures show "?" only while a role score is not known.
  const payout = row.payout;
  const parts = [
    `Base: ${money(payout?.base ?? null)}`,
    `Total Role Score: ${payout?.totalRoleScore?.toFixed(1) ?? "?"}`,
    `Role Reserve: ${money(payout?.roleReserve ?? null)}`,
    `Time Reserve: ${money(payout?.timeReserve ?? null)}`,
    `Total Time: ${payout ? duration(payout.totalTimeScore) : "?"}`,
    `Stall Bonus: ${money(payout?.stallReserve ?? null)}`,
    `Stall Time: ${payout ? duration(payout.totalStall) : "?"}`,
  ];
  for (const part of parts) summary.appendChild(make("span", "", part));
  return summary;
}

/** Builds one member's line. */
function buildPlayerRow(row: CrimeRow, player: PlayerPayout): HTMLTableRowElement {
  const paid = row.paid.has(player.id) || row.paidByTorn;
  const line = make("tr", "ocp-player");
  if (paid) line.classList.add("ocp-paid");
  if (selection?.crimeId === row.crime.id && selection.memberId === player.id) line.classList.add("ocp-selected");

  const name = make("td");
  name.append(make("span", "", `${player.name} `), make("span", "ocp-player-id", `[${player.id}]`));
  line.appendChild(name);

  const cells = [
    player.prs?.toFixed(1) ?? "?",
    money(player.prc),
    duration(player.pts),
    money(player.ptc),
    duration(player.stallJoin),
    money(player.psc),
  ];
  for (const text of cells) line.appendChild(make("td", "", text));
  line.appendChild(make("td", "ocp-payout", money(player.payout)));
  line.appendChild(make("td", "", paid ? "Paid" : "Unpaid"));

  // A member whose payout is not known yet cannot be put into the form.
  if (!paid && player.payout !== null) {
    line.classList.add("ocp-clickable");
    line.addEventListener("click", () => choosePlayer(row, player));
  }
  return line;
}

/** Builds the member table inside an opened crime. */
function buildDetail(row: CrimeRow): HTMLTableRowElement {
  const detail = make("tr", "ocp-detail");
  const cell = make("td");
  cell.colSpan = 8;
  cell.appendChild(buildSummary(row));

  if (row.payout) {
    const table = make("table", "ocp-table ocp-players");
    const head = make("tr");
    const headings = [
      "Player", "Role Score", "Role Cut", "Time Score",
      "Time Cut", "Stall Score", "Stall Cut", "Payout", "Paid",
    ];
    for (const text of headings) head.appendChild(make("th", "", text));
    table.appendChild(head);
    // Longest time signed up first.
    const players = [...row.payout.players].sort((a, b) => b.pts - a.pts);
    for (const player of players) table.appendChild(buildPlayerRow(row, player));
    cell.appendChild(table);
  }

  detail.appendChild(cell);
  return detail;
}

/** Builds a crime's line and, when it is open, its members. */
function buildCrime(row: CrimeRow): HTMLTableRowElement[] {
  const open = openCrimes.has(row.crime.id);
  const line = make("tr", "ocp-crime");
  if (crimeDone(row)) line.classList.add("ocp-done");
  else if (row.state === "waiting") line.classList.add("ocp-waiting");

  line.appendChild(make("td", "ocp-caret-cell", open ? "▾" : "▸"));
  const name = make("td", "", row.crime.name);
  const tag = chainTag(row);
  if (tag) name.appendChild(tag);
  line.appendChild(name);
  line.appendChild(make("td", "", String(row.crime.difficulty)));
  line.appendChild(make("td", "", tornDate(row.crime.executed_at)));

  const payout = row.payout;
  const split = (amount: number | null | undefined): string =>
    row.state === "payable" ? money(amount ?? null) : "-";
  line.appendChild(make("td", "", row.state === "waiting" ? "Waiting" : money(row.total)));
  line.appendChild(make("td", "", split(payout?.factionCut)));
  line.appendChild(make("td", "", split(payout?.remaining)));
  line.appendChild(make("td", "", paidCount(row)));

  line.addEventListener("click", () => {
    if (open) openCrimes.delete(row.crime.id);
    else openCrimes.add(row.crime.id);
    render();
  });

  return open ? [line, buildDetail(row)] : [line];
}

/** Redraws the crime list from what is loaded. */
function render(): void {
  const list = document.getElementById("ocp-list");
  if (!list) return;

  if (!percentsProblem(percents)) rows = buildRows(completePercents(percents));
  list.replaceChildren();
  if (!rows.length) return;

  const scroll = make("div", "ocp-scroll");
  const table = make("table", "ocp-table");
  const head = make("tr");
  const headings = ["", "OC Name", "Level", "Date Completed", "Total Pay", "Faction Cut", "Remaining", "Paid"];
  for (const text of headings) head.appendChild(make("th", "", text));
  table.appendChild(head);
  for (const row of rows) table.append(...buildCrime(row));
  scroll.appendChild(table);
  list.appendChild(scroll);

  const more = document.getElementById("ocp-more") as HTMLButtonElement | null;
  if (more) more.disabled = busy || !moreToLoad();
}

// ---------------------------------------------------------------- paying

/** Puts a member into the give money form. */
function choosePlayer(row: CrimeRow, player: PlayerPayout): void {
  const status = document.getElementById("ocp-list-status");
  if (!row.percents || player.payout === null) return;
  const chosen: Selection = {
    crimeId: row.crime.id,
    percents: row.percents,
    memberId: player.id,
    label: `${memberName(player.id)} [${player.id}]`,
    amount: player.payout,
  };

  if (!fillBankForm(chosen)) {
    if (status) setStatus(status, "error", "Give money form not found");
    return;
  }
  if (status) setStatus(status, "none", "");
  selection = chosen;
  render();
}

/** Marks the chosen member paid once the form's button is pressed. */
function onSent(prefill: Prefill): void {
  const chosen = selection;
  if (!chosen || chosen.memberId !== prefill.memberId) return;
  recordPayment(chosen.crimeId, chosen.percents, chosen.memberId, chosen.amount);
  log("paid", chosen);
  selection = null;
  render();
}

// --------------------------------------------------------------- loading

/** Fetches a page of crimes and redraws. */
async function fetchPage(fresh: boolean): Promise<void> {
  const key = readApiKey();
  const status = document.getElementById("ocp-list-status");
  if (!key || busy || !status) return;

  busy = true;
  setStatus(status, "none", "Loading...");
  try {
    if (fresh) {
      resetCrimes();
      selection = null;
    }
    await loadMore(key);
    setStatus(status, "none", "");
  } catch (error) {
    setStatus(status, "error", describe(error));
  } finally {
    busy = false;
    render();
  }
}

// ----------------------------------------------------------------- panel

/** Builds the key row: box, Check and its result. */
function buildKeyRow(fetchButton: HTMLButtonElement): HTMLElement {
  const row = make("div", "ocp-row");
  const { field, input } = buildKeyField();
  const check = button("Check");
  const status = make("span", "ocp-status");

  check.addEventListener("click", async () => {
    const key = input.value.trim();
    if (!isKeyShaped(key)) {
      setStatus(status, "error", BAD_KEY_SHAPE);
      return;
    }
    check.disabled = true;
    setStatus(status, "none", "Checking...");
    try {
      await checkKey(key);
      writeApiKey(key);
      fetchButton.disabled = false;
      setStatus(status, "ok", "Saved");
    } catch (error) {
      setStatus(status, "error", describe(error));
    } finally {
      check.disabled = false;
    }
  });

  row.append(make("span", "", "API key"), field, check, status);
  return row;
}

/** Builds the four percentage boxes. */
function buildPercentRow(): HTMLElement {
  const row = make("div", "ocp-row");
  const status = make("span", "ocp-status");
  const fields: [keyof Percents, string][] = [
    ["faction", "Faction Cut"],
    ["time", "Time Bonus"],
    ["role", "Role Bonus"],
    ["stall", "Stalling Bonus"],
  ];

  for (const [name, text] of fields) {
    const label = make("label", "ocp-percent-label");
    const input = make("input", "ocp-percent");
    input.type = "number";
    input.min = "0";
    input.max = "100";
    input.step = "0.01";
    const stored = percents[name];
    input.value = stored === null ? "" : String(stored);
    input.addEventListener("input", () => {
      const next = { ...percents, [name]: input.value.trim() === "" ? null : Number(input.value) };
      const problem = percentsProblem(next);
      setStatus(status, problem ? "error" : "none", problem ?? "");
      if (problem) return;
      percents = next;
      writePercents(percents);
      render();
    });
    label.append(make("span", "", text), input, make("span", "", "%"));
    row.appendChild(label);
  }

  row.appendChild(status);
  return row;
}

/** Builds the panel. */
function buildPanel(): HTMLElement {
  const panel = make("div");
  panel.id = PANEL_ID;

  const title = make("div", "ocp-title");
  title.setAttribute("role", "button");
  title.tabIndex = 0;
  title.append(make("span", "ocp-caret", "▾"), make("span", "", "ZNS OC Payout tool"));
  const applyOpen = (open: boolean): void => {
    panel.classList.toggle(COLLAPSED_CLASS, !open);
    title.setAttribute("aria-expanded", String(open));
  };
  applyOpen(readPanelOpen());
  const toggle = (): void => {
    const open = panel.classList.contains(COLLAPSED_CLASS);
    writePanelOpen(open);
    applyOpen(open);
  };
  title.addEventListener("click", toggle);
  title.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggle();
  });

  const body = make("div", "ocp-body");
  const fetchButton = button("Fetch OCs");
  fetchButton.disabled = !readApiKey();
  fetchButton.addEventListener("click", () => void fetchPage(true));
  body.appendChild(buildKeyRow(fetchButton));

  const fetchRow = make("div", "ocp-row");
  const listStatus = make("span", "ocp-status");
  listStatus.id = "ocp-list-status";
  fetchRow.append(fetchButton, listStatus);
  body.appendChild(fetchRow);
  body.appendChild(buildPercentRow());

  const list = make("div");
  list.id = "ocp-list";
  body.appendChild(list);

  const footer = make("div", "ocp-footer");
  const more = button("See More");
  more.id = "ocp-more";
  more.disabled = true;
  more.addEventListener("click", () => void fetchPage(false));
  const fullLog = button("Full Log");
  fullLog.disabled = !FULL_LOG_URL;
  fullLog.addEventListener("click", () => window.open(FULL_LOG_URL, "_blank", "noopener"));
  footer.append(more, fullLog);
  body.appendChild(footer);

  panel.append(title, body);
  return panel;
}

/** Where the panel goes: before the armoury's rule, or at the start of the armoury when it has none. */
function findPlace(): { parent: Element; before: ChildNode | null } | null {
  const rule = document.querySelector(ARMOURY_RULE);
  if (rule?.parentElement) return { parent: rule.parentElement, before: rule };
  const armoury = document.querySelector(ARMOURY_ROOT);
  return armoury ? { parent: armoury, before: armoury.firstChild } : null;
}

/** The last placement result logged, so a busy page does not repeat it every frame. */
let lastReport = "";

/** Logs why the panel was or was not placed, once per change. */
function report(reason: string, ...detail: unknown[]): void {
  if (reason === lastReport) return;
  lastReport = reason;
  log(reason, ...detail);
}

let watching = false;

/** Puts the panel at the top of the armoury tab's content, once it is on the page. */
export function installPanel(): void {
  if (document.getElementById(PANEL_ID)) return;
  const place = findPlace();
  if (!place) {
    report(`no ${ARMOURY_ROOT} on the page`);
    return;
  }

  injectStyles();
  place.parent.insertBefore(buildPanel(), place.before);
  report("panel placed");
  render();

  if (!watching) {
    watching = true;
    watchSendButton(() => selection, onSent);
  }
}
