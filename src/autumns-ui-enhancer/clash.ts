// Spots other scripts working on the same parts of the page, and says so.
//
// Userscripts cannot see one another, only what each leaves in the page. Two
// kinds of check use that: known markers, for scripts already looked at, and
// fight counting, for anything that keeps undoing what a feature has just
// done. Either one ends in the same pop-up, which stays until it is clicked.

import { log } from "./debug";
import { INDEPENDENT_CHAT_TABS, isEnabled } from "./settings";

/** One clash: our feature, the other script where it can be named, and what goes wrong. */
export interface Clash {
  feature: string;
  script?: string;
  how: string;
}

const POPUP_ID = "aue-clash";
/** Clashes already dismissed in this tab, so a click is not undone by the next page. */
const SEEN_KEY = "AUE_CLASH_SEEN";
/** Put on the page by the first copy of this script to start. */
const RUNNING_ATTR = "data-aue-running";

/** Scripts known to work on the same parts of Torn, and how each marks the page. */
const KNOWN_SCRIPTS = [
  {
    name: "TornW3B Companion",
    selector: '[id^="w3b-"], [class^="w3b-"], [class*=" w3b-"], [data-w3b-chat-resize]',
  },
  { name: "TornTools", selector: '[id^="tt-"], [class^="tt-"], [class*=" tt-"]' },
];

/**
 * The Web Lock TornW3B's "Chat in one tab only" holds or waits on in every tab.
 *
 * Its stylesheet and dock button are no use as a sign: TornW3B puts both on
 * the page with the setting off too. The lock is only asked for while it is on.
 */
const W3B_ONE_TAB_LOCK = "w3b-chat-owner";

/** When the marker checks run, as other scripts start at different times. */
const CHECK_AFTER_MS = [1500, 6000, 15000];

/** Undoings within FIGHT_WINDOW_MS that count as a fight rather than chance. */
const FIGHT_LIMIT = 6;
const FIGHT_WINDOW_MS = 10_000;

/** The squiggles round the pop-up: where each starts, as % of the box, and the way it points. */
const SQUIGGLES: [number, number, number][] = [
  [15, 0, -100], [50, 0, -90], [85, 0, -80],
  [15, 100, 100], [50, 100, 90], [85, 100, 80],
  [0, 50, 180], [100, 50, 0],
  [0, 0, -135], [100, 0, -45], [0, 100, 135], [100, 100, 45],
];

const reported = new Set<string>();
const waiting: Clash[] = [];

/** Returns the clashes already dismissed in this tab. */
function seen(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

/** Returns the line a clash is known by. */
function keyOf(clash: Clash): string {
  return `${clash.feature}|${clash.script ?? ""}`;
}

/** Shows a clash in the pop-up, once per page and not again once dismissed in this tab. */
export function reportClash(clash: Clash): void {
  const key = keyOf(clash);
  if (reported.has(key) || seen().has(key)) return;
  reported.add(key);
  log("clash:", clash.feature, "with", clash.script ?? "an unknown script", "-", clash.how);
  if (!document.body) {
    waiting.push(clash);
    return;
  }
  addToPopup(clash);
}

/** Returns the pop-up, made on first use. */
function popup(): HTMLElement {
  const existing = document.getElementById(POPUP_ID);
  if (existing) return existing;

  const box = document.createElement("div");
  box.id = POPUP_ID;
  box.setAttribute("role", "alert");
  const squiggles = SQUIGGLES.map(
    ([x, y, angle], index) =>
      `<span class="aue-squiggle" style="left:${x}%;top:${y}%;--aue-angle:${angle}deg;animation-delay:${(index % 4) * -0.3}s">` +
      `<svg viewBox="0 0 30 10"><path d="M1 5q3.5-5 7 0t7 0 7 0 7 0"/></svg></span>`,
  ).join("");
  box.innerHTML = `<span class="aue-squiggles" aria-hidden="true">${squiggles}</span><div class="aue-clash-list"></div>`;

  const dismiss = (): void => {
    // A drag to copy the text also ends in a click, and should not close it.
    if (getSelection()?.toString()) return;
    const dismissed = seen();
    for (const key of reported) dismissed.add(key);
    try {
      sessionStorage.setItem(SEEN_KEY, JSON.stringify([...dismissed]));
    } catch {}
    box.remove();
    document.removeEventListener("click", dismiss, true);
  };
  // Added a turn later: a clash found while a click is being handled would
  // otherwise be closed by that same click as it reaches the document.
  // Listened for without stopping the click, so whatever was clicked still works.
  setTimeout(() => document.addEventListener("click", dismiss, true));
  document.body.appendChild(box);
  return box;
}

/** Adds one clash's line to the pop-up. */
function addToPopup(clash: Clash): void {
  const line = document.createElement("div");
  line.className = "aue-clash-line";
  const feature = document.createElement("span");
  feature.className = "aue-clash-feature";
  feature.textContent = clash.feature;
  const rest = clash.script ? ` clashes with ${clash.script}: ${clash.how}` : ` clash: ${clash.how}`;
  line.append(feature, rest);
  popup().querySelector(".aue-clash-list")?.appendChild(line);
}

/** Returns the known scripts that have left a mark inside an element. */
export function scriptsIn(root: Element | null): string[] {
  if (!root) return [];
  return KNOWN_SCRIPTS.filter(
    (script) => root.matches(script.selector) || root.querySelector(script.selector),
  ).map((script) => script.name);
}

const fights = new Map<string, number[]>();

/**
 * Notes that something undid what a feature had just done.
 *
 * One undoing is ordinary: Torn redraws things. Many in a short time mean
 * another script is putting back what we change, and both will go on doing
 * it for as long as the page is open.
 */
export function noteUndone(feature: string, what: string, near: Element | null): void {
  const now = Date.now();
  const times = (fights.get(feature) ?? []).filter((time) => now - time < FIGHT_WINDOW_MS);
  times.push(now);
  fights.set(feature, times);
  if (times.length < FIGHT_LIMIT) return;

  const suspects = scriptsIn(near);
  const how = `something keeps undoing ${what}, so the two keep fighting over it. Try turning one of them off.`;
  reportClash(suspects.length > 0 ? { feature, script: suspects.join(" or "), how } : { feature, how });
}

/**
 * Marks the page as taken by this script.
 *
 * Returns false when another copy got there first, which happens when the
 * script is installed twice, and that copy is the one left running.
 */
export function claimPage(): boolean {
  const root = document.documentElement;
  if (root.hasAttribute(RUNNING_ATTR)) {
    reportClash({
      feature: "Autumn's UI Enhancer",
      script: "another copy of itself",
      how: "it is installed or switched on twice, so this copy has stood down. Remove one in your userscript manager.",
    });
    return false;
  }
  root.setAttribute(RUNNING_ATTR, __SCRIPT_VERSION__);
  return true;
}

/** Whether TornW3B's one-tab chat is on, in this tab or any other. */
async function w3bOneTabOn(): Promise<boolean> {
  try {
    const state = await navigator.locks.query();
    return [...(state.held ?? []), ...(state.pending ?? [])].some(
      (lock) => lock.name === W3B_ONE_TAB_LOCK,
    );
  } catch {
    return false;
  }
}

/** Looks for the scripts known to clash with a feature that is switched on. */
async function checkKnown(): Promise<void> {
  if (isEnabled(INDEPENDENT_CHAT_TABS) && (await w3bOneTabOn())) {
    reportClash({
      feature: "Independent Chat Tabs",
      script: "TornW3B Companion (Chat in one tab only)",
      how: "both decide which chats each tab shows, so chats can vanish or refuse to come back. Turn one of them off.",
    });
  }
}

/** Shows anything reported before the page had a body, and runs the marker checks if asked. */
export function installClashCheck(checkMarkers: boolean): void {
  for (const clash of waiting.splice(0)) addToPopup(clash);
  if (!checkMarkers) return;
  for (const delay of CHECK_AFTER_MS) setTimeout(() => void checkKnown(), delay);
}
