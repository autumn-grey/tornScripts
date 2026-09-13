import { log } from "./debug";
import { readRows } from "./items";
import { installMaxButton } from "./maxButton";
import { normalizeItemName } from "./sheet";
import { isOurStorageKey, readCachedItems } from "./settings";
import { ON_SHEET_CLASS, injectStyles } from "./styles";

/** Outlines a row when its item is on the source spreadsheet. */
function markOnSheet(element: HTMLElement, name: string, items: Set<string>): void {
  const onSheet = items.has(normalizeItemName(name));
  const signature = onSheet ? "on" : "off";

  if (element.dataset.stfMark === signature) return;
  element.dataset.stfMark = signature;

  element.classList.toggle(ON_SHEET_CLASS, onSheet);
}

/** Drops every recorded decision so the next pass judges from scratch. */
function forgetMarks(): void {
  for (const element of document.querySelectorAll<HTMLElement>("[data-stf-mark]")) {
    delete element.dataset.stfMark;
    element.classList.remove(ON_SHEET_CLASS);
  }
}

/** One pass over everything currently on the page. */
function markPage(): void {
  const items = readCachedItems();
  const rows = readRows();

  for (const row of rows) {
    installMaxButton(row);
    markOnSheet(row.element, row.name, items);
  }

  log(`pass over ${rows.length} rows against ${items.size} sheet items`);
}

/** Redraws arrive in bursts, so settle before doing the work. */
const SETTLE_MS = 150;

/** How long a pass may be put off by a page that never stops changing. */
const MAX_DEFER_MS = 1000;

let settleTimer: number | undefined;
let waitingSince = 0;

/** Runs a pass once the page has stopped changing. */
function schedulePass(): void {
  const now = Date.now();

  // Do not remove: Torn's chat and timers mutate the page faster than the
  // settle window, so a purely debounced pass never gets to run.
  if (waitingSince && now - waitingSince >= MAX_DEFER_MS) {
    runPass();
    return;
  }

  if (!waitingSince) waitingSince = now;
  clearTimeout(settleTimer);
  settleTimer = setTimeout(runPass, SETTLE_MS);
}

/** Runs a pass now. */
function runPass(): void {
  clearTimeout(settleTimer);
  waitingSince = 0;
  markPage();
}

let watching = false;

/** Starts marking up the trade list and keeps it marked up. */
export function installMarkup(): void {
  injectStyles();
  schedulePass();

  if (watching) return;
  watching = true;

  new MutationObserver(schedulePass).observe(document.body, {
    childList: true,
    subtree: true,
  });

  addEventListener("storage", (event) => {
    if (!isOurStorageKey(event.key)) return;
    forgetMarks();
    schedulePass();
  });
}

/** Re-judges every row against the list as it stands now. */
export function refreshMarks(): void {
  forgetMarks();
  schedulePass();
}
