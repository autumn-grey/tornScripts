// OC Travel Guard
//
// Blocks the button that commits a flight you could not return from before
// your Organised Crime starts, and reports the maths in a panel below the
// page title.

// Inlined as a data: URI at build time.
import raccoonAngry from "./raccoonAngry.png";

const FLIGHT_VARIANCE = 1.03;
const SAFETY_MARGIN_MS = 5 * 60_000;

// Every selector this script matches on.
const SELECTORS = {
  // Sidebar OC icon.
  ocIcon: [
    'a[aria-label^="Organized Crime" i]',
    'a[aria-label^="Organised Crime" i]',
    'a[href*="factions.php"][href*="tab=crimes"]',
  ].join(", "),
  // The same icon, but only where its aria-label names a crime.
  ocIconLabelled: [
    'a[aria-label^="Organized Crime" i]',
    'a[aria-label^="Organised Crime" i]',
  ].join(", "),
  // Where floating-ui mounts that tooltip.
  tooltip: '[data-floating-ui-portal], [role="tooltip"]',
  // The travel button, e.g. aria-label="Travel to Argentina".
  travelButton: 'button[aria-label^="Travel to" i]',
  // Leaf nodes scanned for a button's caption.
  buttonish: "button, a, span, div",
  // Chrome that is never the travel control, whatever its caption says.
  navigation: [
    "nav",
    "aside",
    '[role="navigation"]',
    "#sidebarroot",
    "#header-root",
    '[id*="sidebar" i]',
  ].join(", "),
};

const BUTTON_LABELS = ["TRAVEL"];

// The caption on mobile's button that commits the flight.
const CONFIRM_LABELS = ["CONTINUE"];

const BLOCK_ATTR = "data-ocg-blocked";
// Marks the nodes this script injected.
const OWN_CLASS = "ocg-own";
const OVERLAY_CLASS = "ocg-overlay";

const TOGGLE_BAR_CLASS = "ocg-toggle-bar";
const TOGGLE_ROW_CLASS = "ocg-toggle-row";
const TOGGLE_SWITCH_CLASS = "ocg-switch";
const TOGGLE_BAR_ID = "ocg-toggle-bar";
const PANEL_CLASS = "ocg-panel";
const STATUS_GROUP_CLASS = "ocg-status-group";
const STATUS_ROW_CLASS = "ocg-status-row";
const STATUS_OC_ID = "ocg-status-oc";
const STATUS_RETURN_ID = "ocg-status-return";
const STATUS_MESSAGE_ID = "ocg-status-message";

const REPORT_CLASS = "ocg-report";
const REPORT_COPY_CLASS = "ocg-report-copy";
// Where the report box sends unrecognised tooltip wording.
const REPORT_URL = "https://www.torn.com/messages.php#/p=compose&XID=4386333";

// Every destination Torn flies to.
const TRAVEL_COUNTRIES = [
  "Mexico",
  "Cayman Islands",
  "Canada",
  "Hawaii",
  "United Kingdom",
  "Argentina",
  "Switzerland",
  "Japan",
  "China",
  "UAE",
  "South Africa",
];

const debugOn = () => {
  try {
    return localStorage.getItem("OCG_DEBUG") === "1";
  } catch {
    return false;
  }
};
const log = (...args: unknown[]) => {
  if (debugOn()) console.log("[OCG]", ...args);
};

// ---------------------------------------------------------------- durations

/** "2 days, 17 hours, 32 minutes and 6 seconds" -> ms. Null if nothing parsed. */
function parseWordyDuration(text: string): number | null {
  const unit = (pattern: RegExp) => {
    const digits = text.match(pattern)?.[1];
    return digits === undefined ? 0 : Number(digits);
  };
  const total =
    ((unit(/(\d+)\s*day/i) * 24 + unit(/(\d+)\s*hour/i)) * 60 +
      unit(/(\d+)\s*minute/i)) *
      60 +
    unit(/(\d+)\s*second/i);
  return total > 0 ? total * 1000 : null;
}

// ------------------------------------------------------------- step 1: OC

// The states an Organized Crime can be in, as read from its tooltip.
const OC_UNKNOWN = "unknown";
const OC_TIMER = "timer";
const OC_IMMINENT = "imminent";
const OC_RECRUITING = "recruiting";
const OC_NONE = "none";
const OC_UNREADABLE = "unreadable";

type OcKind =
  | typeof OC_UNKNOWN
  | typeof OC_TIMER
  | typeof OC_IMMINENT
  | typeof OC_RECRUITING
  | typeof OC_NONE
  | typeof OC_UNREADABLE;

/** A state actually read off a tooltip. */
type OcReading =
  | { kind: typeof OC_TIMER; startMs: number }
  | { kind: typeof OC_IMMINENT }
  | { kind: typeof OC_RECRUITING };

/** Which state a tooltip's text is describing. */
function classifyOcText(text: string): OcReading | null {
  if (!/organi[sz]ed\s*crime/i.test(text)) return null;

  // Do not test the wordings below first: a countdown may mention failure too.
  const remaining = parseWordyDuration(text);
  if (remaining !== null) {
    return { kind: OC_TIMER, startMs: Date.now() + remaining };
  }

  // "3 of 5 slots filled" - still recruiting.
  // Do not anchor this with \b: the tooltip's lines run together, so the
  // count arrives glued to the end of the crime's name.
  if (/\d+\s*of\s*\d+\s*slots?\s*filled/i.test(text)) {
    return { kind: OC_RECRUITING };
  }

  // "Waiting to initiate..." - the crime is due.
  if (/waiting\s*to\s*initiate/i.test(text)) return { kind: OC_IMMINENT };

  return null;
}

// The raw text of the tooltip the last lookup saw.
let ocCapturedText = "";

/** Remembers a tooltip's text, preferring one that names the crime. */
function rememberTooltipText(text: string): void {
  if (/organi[sz]ed\s*crime/i.test(text) || ocCapturedText === "") {
    ocCapturedText = text;
  }
}

/** Reads the OC state out of any tooltip currently mounted. */
function scanForOcState(): OcReading | null {
  for (const node of document.querySelectorAll<HTMLElement>(
    SELECTORS.tooltip,
  )) {
    if (node.closest(`.${OWN_CLASS}`)) continue;

    const text = (node.textContent ?? "").trim();
    if (text.length === 0 || text.length > 300) continue;

    rememberTooltipText(text);
    const state = classifyOcText(text);
    if (state !== null) {
      log("OC tooltip:", state.kind, "|", text);
      return state;
    }
  }

  // Falls back to the page's own text, where only a countdown is trusted.
  const bodyText = document.body.innerText ?? "";
  const idx = bodyText.search(/organi[sz]ed\s*crime/i);
  if (idx !== -1) {
    const remaining = parseWordyDuration(bodyText.slice(idx, idx + 200));
    if (remaining !== null) {
      log("OC countdown (body fallback)");
      return { kind: OC_TIMER, startMs: Date.now() + remaining };
    }
  }

  return null;
}

/** Whether anything on the page says the user is in a crime at all. */
function hasOcIcon(): boolean {
  if (document.querySelector(SELECTORS.ocIconLabelled) !== null) return true;
  return /organi[sz]ed\s*crime/i.test(ocCapturedText);
}

/** The slice of a React fiber node this script reads. */
interface FiberNode {
  memoizedProps?: Record<string, unknown> | null;
  return?: FiberNode | null;
}

/** Opens or closes the tooltip attached to an OC icon. */
function triggerOcTooltip(element: HTMLElement, entering: boolean): void {
  const key = Object.keys(element).find((k) => k.startsWith("__reactFiber"));
  let fiber: FiberNode | null | undefined = key
    ? (element as unknown as Record<string, FiberNode | undefined>)[key]
    : null;

  const propNames = entering
    ? ["onMouseEnter", "onPointerEnter", "onMouseOver", "onFocus"]
    : ["onMouseLeave", "onPointerLeave", "onMouseOut", "onBlur"];

  while (fiber) {
    for (const propName of propNames) {
      const handler = fiber.memoizedProps?.[propName];
      if (typeof handler === "function") {
        try {
          handler();
        } catch (err) {
          log("handler threw for", propName, err);
        }
      }
    }
    fiber = fiber.return;
  }

  // Do not remove: the fiber handlers alone miss a non-React icon.
  const nativeEvents = entering
    ? ["pointerenter", "mouseenter", "mouseover", "focus"]
    : ["pointerleave", "mouseleave", "mouseout", "blur"];
  for (const type of nativeEvents) {
    try {
      element.dispatchEvent(new Event(type, { bubbles: false }));
    } catch (err) {
      log("dispatch threw for", type, err);
    }
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Opens each OC icon's tooltip in turn and reads the crime's state from it. */
async function probeIconsForOc(): Promise<OcReading | null> {
  const icons = [...document.querySelectorAll<HTMLElement>(SELECTORS.ocIcon)];
  log("probing", icons.length, "OC icon(s)");

  for (const icon of icons) {
    try {
      triggerOcTooltip(icon, true);
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await wait(60);
        const found = scanForOcState();
        if (found !== null) return found;
      }
    } finally {
      triggerOcTooltip(icon, false);
    }
  }
  return null;
}

// Absolute epoch ms when the OC starts.
let ocStartMs: number | null = null;
let ocState: OcKind = OC_UNKNOWN;
let ocLookupRunning = false;
let ocAttempts = 0;

// Lookups to run before settling on an answer.
const OC_MAX_ATTEMPTS = 1;

/** Determines and caches the Organized Crime state. */
async function resolveOcState(): Promise<void> {
  if (ocState !== OC_UNKNOWN || ocLookupRunning) return;
  ocLookupRunning = true;
  ocCapturedText = "";
  try {
    const found = scanForOcState() ?? (await probeIconsForOc());
    if (found !== null) {
      ocState = found.kind;
      // An imminent crime counts as starting right now.
      ocStartMs =
        found.kind === OC_TIMER
          ? found.startMs
          : found.kind === OC_IMMINENT
            ? Date.now()
            : null;
      ocAttempts = 0;
    } else {
      ocAttempts += 1;
      // No icon means no crime; an icon we could not read means new wording.
      if (ocAttempts >= OC_MAX_ATTEMPTS) {
        ocState = hasOcIcon() ? OC_UNREADABLE : OC_NONE;
      }
    }
    log(
      "OC state:",
      ocState,
      ocStartMs === null ? "" : new Date(ocStartMs).toString(),
    );
  } finally {
    ocLookupRunning = false;
  }
}

const OC_RETRY_MIN_MS = 1_000;
const OC_RETRY_MAX_MS = 30_000;
let ocRetryDelayMs = OC_RETRY_MIN_MS;
let ocRetryTimer = 0;

/** Reopens the OC question, returning the state that was in force. */
function reopenOcLookup(): OcKind {
  const previous = ocState;
  ocState = OC_UNKNOWN;
  ocAttempts = 0;
  return previous;
}

/** Schedules another OC lookup, with backoff, while the state is unknown. */
function scheduleOcRetry(): void {
  clearTimeout(ocRetryTimer);
  if (ocState !== OC_UNKNOWN) return;
  ocRetryTimer = window.setTimeout(() => {
    void resolveOcState().then(() => {
      evaluate();
      if (ocState === OC_UNKNOWN) {
        ocRetryDelayMs = Math.min(ocRetryDelayMs * 2, OC_RETRY_MAX_MS);
        scheduleOcRetry();
      }
    });
  }, ocRetryDelayMs);
}

/** Rechecks the OC state immediately, settled or not. */
function retryOcNow(): void {
  if (ocState === OC_TIMER) return;
  ocRetryDelayMs = OC_RETRY_MIN_MS;
  clearTimeout(ocRetryTimer);
  const previous = reopenOcLookup();
  void resolveOcState().then(() => {
    // Only a fresh, positive reading may replace one already read.
    const settledEmpty = ocState === OC_NONE || ocState === OC_UNREADABLE;
    const hadReading =
      previous !== OC_UNKNOWN &&
      previous !== OC_NONE &&
      previous !== OC_UNREADABLE;
    if (settledEmpty && hadReading) {
      ocState = previous;
    }
    evaluate();
    scheduleOcRetry();
  });
}

// --------------------------------------------------- step 2: flight time

/** "Flight Time - 01:51" -> ms. Only present once a destination is selected. */
function findFlightTimeMs(): number | null {
  const text = document.body.innerText;

  const clock = text.match(/Flight\s*Time\s*[-–—:]*\s*(\d{1,2}):(\d{2})/i);
  if (clock?.[1] !== undefined && clock[2] !== undefined) {
    return (Number(clock[1]) * 60 + Number(clock[2])) * 60_000;
  }

  const verbose = text.match(/It will take\s+([^.]+?)\s+to reach/i);
  return verbose?.[1] === undefined ? null : parseWordyDuration(verbose[1]);
}

// ------------------------------------------------------ step 3: the button

/** An element's own text, ignoring any it inherits from descendants. */
function ownText(element: HTMLElement): string {
  let text = "";
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) text += node.nodeValue ?? "";
  }
  return text.trim().toUpperCase();
}

/** Every leaf node whose caption is in `labels`, resolved to its button or link. */
function findByCaption(
  labels: string[],
  skipNavigation: boolean,
): HTMLElement[] {
  const found: HTMLElement[] = [];
  for (const element of document.querySelectorAll<HTMLElement>(
    SELECTORS.buttonish,
  )) {
    if (element.closest(`.${OWN_CLASS}`)) continue;
    if (skipNavigation && element.closest(SELECTORS.navigation)) continue;

    if (!labels.includes(ownText(element))) continue;

    const button = (element.closest("button, a") ?? element) as HTMLElement;
    if (!found.includes(button)) found.push(button);
  }
  return found;
}

/** Both shapes of the button that commits a flight. */
function findTravelButtons(): HTMLElement[] {
  const found: HTMLElement[] = [];
  const add = (element: HTMLElement) => {
    if (!found.includes(element)) found.push(element);
  };

  for (const element of document.querySelectorAll<HTMLElement>(
    SELECTORS.travelButton,
  )) {
    add(element);
  }

  for (const element of findByCaption(CONFIRM_LABELS, false)) add(element);

  if (found.length > 0) return found;

  // Do not pass false here: the nav bar's own TRAVEL link would match too.
  return findByCaption(BUTTON_LABELS, true);
}

// ------------------------------------------------------------------ styles

function injectStyles(): void {
  if (document.getElementById("ocg-styles")) return;
  const style = document.createElement("style");
  style.id = "ocg-styles";
  style.textContent = `
    [${BLOCK_ATTR}] {
      cursor: not-allowed !important;
      pointer-events: none !important;
      filter: grayscale(1) brightness(0.5);
    }
    .${OVERLAY_CLASS} {
      position: fixed;
      z-index: ${OVERLAY_Z_INDEX};
      background-image: url("${raccoonAngry}");
      background-size: 100% 100%;
      background-position: center;
      background-repeat: no-repeat;
      pointer-events: none;
    }
    .${TOGGLE_BAR_CLASS} {
      display: flex;
      flex-wrap: wrap;
      align-items: stretch;
      gap: 8px;
      margin: 6px 0 8px;
      padding: 0;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 13px;
      line-height: 1;
      color: #fff;
    }
    /* The shared vanilla-Torn panel look. */
    .${PANEL_CLASS} {
      display: flex;
      align-items: stretch;
      border-radius: 8px;
      overflow: hidden;
      background: linear-gradient(180deg, #656565 0%, #373737 100%);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    }
    .${TOGGLE_ROW_CLASS} {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 12px;
      color: #fff;
      transition: background 0.15s;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
    }
    /* Highlights the row on hover, press, or keyboard focus. */
    .${TOGGLE_ROW_CLASS}:hover,
    .${TOGGLE_ROW_CLASS}:active,
    .${TOGGLE_ROW_CLASS}:focus-within {
      background: linear-gradient(180deg, #525252 0%, #414141 100%);
    }
    .${TOGGLE_ROW_CLASS} .ocg-label {
      white-space: nowrap;
    }
    /* The timer panel is always a stacked column. */
    .${STATUS_GROUP_CLASS} {
      flex-direction: column;
      align-items: stretch;
    }
    .${STATUS_ROW_CLASS} {
      display: flex;
      align-items: center;
      padding: 6px 12px;
      color: #fff;
      font-size: 11px;
      white-space: normal;
      font-variant-numeric: tabular-nums;
    }
    /* The same seam as the toggle module. */
    .${STATUS_ROW_CLASS}:not(:first-child) {
      border-top: 1px solid rgba(0, 0, 0, 0.4);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
    }
    .${STATUS_ROW_CLASS} b {
      margin-right: 4px;
    }
    .${TOGGLE_SWITCH_CLASS} {
      position: relative;
      display: inline-block;
      width: 42px;
      height: 22px;
      flex-shrink: 0;
    }
    .${TOGGLE_SWITCH_CLASS} input {
      opacity: 0;
      width: 0;
      height: 0;
    }
    /* Off state: near-black track, mid-grey knob on the left. */
    .${TOGGLE_SWITCH_CLASS} .ocg-slider {
      position: absolute;
      inset: 0;
      box-sizing: border-box;
      border: 2px solid #8c8c8c;
      border-radius: 999px;
      background: linear-gradient(180deg, #1c1c1c 0%, #0d0d0d 100%);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
      cursor: pointer;
      transition: background 0.2s, border-color 0.15s, box-shadow 0.15s;
    }
    .${TOGGLE_SWITCH_CLASS} .ocg-slider::before {
      content: "";
      position: absolute;
      left: 2px;
      top: 2px;
      height: 14px;
      width: 14px;
      border-radius: 50%;
      background: linear-gradient(180deg, #7d7d7d 0%, #5a5a5a 100%);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
      transition: transform 0.2s, background 0.15s;
    }
    /* On state: filled track, dark knob slid to the right. */
    .${TOGGLE_SWITCH_CLASS} input:checked + .ocg-slider {
      background: linear-gradient(180deg, #9e9e9e 0%, #6e6e6e 100%);
    }
    .${TOGGLE_SWITCH_CLASS} input:checked + .ocg-slider::before {
      transform: translateX(20px);
      background: linear-gradient(180deg, #4c4c4c 0%, #343434 100%);
    }
    .${TOGGLE_ROW_CLASS}:hover .ocg-slider,
    .${TOGGLE_ROW_CLASS}:active .ocg-slider,
    .${TOGGLE_ROW_CLASS}:focus-within .ocg-slider {
      border-color: #fff;
      background: linear-gradient(180deg, #262626 0%, #141414 100%);
      box-shadow: 0 2px 3px rgba(0, 0, 0, 0.6);
    }
    .${TOGGLE_ROW_CLASS}:hover .ocg-slider::before,
    .${TOGGLE_ROW_CLASS}:active .ocg-slider::before,
    .${TOGGLE_ROW_CLASS}:focus-within .ocg-slider::before {
      background: linear-gradient(180deg, #9a9a9a 0%, #6e6e6e 100%);
    }
    .${TOGGLE_ROW_CLASS}:hover input:checked + .ocg-slider,
    .${TOGGLE_ROW_CLASS}:active input:checked + .ocg-slider,
    .${TOGGLE_ROW_CLASS}:focus-within input:checked + .ocg-slider {
      background: linear-gradient(180deg, #ffffff 0%, #bdbdbd 100%);
    }
    .${TOGGLE_ROW_CLASS}:hover input:checked + .ocg-slider::before,
    .${TOGGLE_ROW_CLASS}:active input:checked + .ocg-slider::before,
    .${TOGGLE_ROW_CLASS}:focus-within input:checked + .ocg-slider::before {
      background: linear-gradient(180deg, #666666 0%, #444444 100%);
    }
    /* Sits one layer above the raccoon, and unlike it is clickable. */
    .${REPORT_CLASS} {
      position: fixed;
      z-index: ${OVERLAY_Z_INDEX + 1};
      box-sizing: border-box;
      width: 260px;
      padding: 8px 10px;
      border-radius: 6px;
      background: #b3261e;
      color: #fff;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12px;
      line-height: 1.35;
      text-align: left;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.55);
    }
    .${REPORT_COPY_CLASS} {
      display: block;
      margin: 6px 0;
      padding: 6px 8px;
      border: 1px solid rgba(255, 255, 255, 0.45);
      border-radius: 4px;
      background: rgba(0, 0, 0, 0.35);
      color: #fff;
      font-family: Consolas, "Courier New", monospace;
      font-size: 11px;
      line-height: 1.3;
      word-break: break-word;
      max-height: 88px;
      overflow-y: auto;
      cursor: pointer;
    }
    .${REPORT_COPY_CLASS}:hover {
      background: rgba(0, 0, 0, 0.5);
    }
    .${REPORT_CLASS} a {
      color: #4da3ff;
      font-weight: bold;
      text-decoration: underline;
    }
  `;
  document.head.appendChild(style);
}

// ----------------------------------------------------------------- overlay

// How far the raccoon may extend past the button's left and right edges.
const OVERLAY_BLEED_PX = 6;

// How far the overlay has to out-stack its neighbours.
const OVERLAY_Z_INDEX = 1;

// The raccoon's own proportions, read off the image it is drawn from.
let raccoonWidth = 100;
let raccoonHeight = 100;
const raccoonImage = new Image();
raccoonImage.addEventListener("load", () => {
  if (raccoonImage.naturalWidth > 0 && raccoonImage.naturalHeight > 0) {
    raccoonWidth = raccoonImage.naturalWidth;
    raccoonHeight = raccoonImage.naturalHeight;
    positionOverlays();
  }
});
raccoonImage.src = raccoonAngry;

const overlays = new Map<HTMLElement, HTMLElement>();

function positionOverlays(): void {
  for (const [button, overlay] of overlays) {
    // Gone from the DOM, or hidden by the other layout.
    if (!button.isConnected || !isVisible(button)) {
      overlay.remove();
      overlays.delete(button);
      button.removeAttribute(BLOCK_ATTR);
      button.removeAttribute("aria-disabled");
      if (button instanceof HTMLButtonElement) button.disabled = false;
      continue;
    }
    const rect = button.getBoundingClientRect();

    // Never upscale past the image's natural size.
    const width = Math.min(rect.width + OVERLAY_BLEED_PX * 2, raccoonWidth);
    const height = width * (raccoonHeight / raccoonWidth);

    overlay.style.width = `${width}px`;
    overlay.style.height = `${height}px`;
    overlay.style.left = `${rect.left + rect.width / 2 - width / 2}px`;
    overlay.style.top = `${rect.top + rect.height / 2 - height / 2}px`;
  }
  positionReportBoxes();
}

/** Whether an element actually has a box on screen. */
// Do not simplify to a DOM-connected check: Torn keeps its unused layout.
const isVisible = (element: HTMLElement): boolean => {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};

function blockButton(button: HTMLElement): void {
  if (!isVisible(button)) return;

  if (button.getAttribute(BLOCK_ATTR) === null) {
    button.setAttribute(BLOCK_ATTR, "1");
    button.setAttribute("aria-disabled", "true");
    if (button instanceof HTMLButtonElement) button.disabled = true;
  }

  if (!overlays.has(button)) {
    const overlay = document.createElement("div");
    overlay.className = `${OVERLAY_CLASS} ${OWN_CLASS}`;
    // Placed as the button's next sibling.
    button.insertAdjacentElement("afterend", overlay);
    overlays.set(button, overlay);
  }

  positionOverlays();
}

/** Repositions the overlays, if there are any. */
function reconcileOverlays(): void {
  if (overlays.size === 0 && reportBoxes.size === 0) return;
  positionOverlays();
}

/** Repositions the overlays whenever user input could have moved a button. */
function installOverlayReconciler(): void {
  for (const type of ["click", "touchstart", "keydown", "scroll"]) {
    window.addEventListener(type, reconcileOverlays, {
      capture: true,
      passive: true,
    });
  }
}

function unblockAll(): void {
  for (const button of document.querySelectorAll<HTMLElement>(
    `[${BLOCK_ATTR}]`,
  )) {
    button.removeAttribute(BLOCK_ATTR);
    button.removeAttribute("aria-disabled");
    if (button instanceof HTMLButtonElement) button.disabled = false;
  }
  for (const overlay of document.querySelectorAll(`.${OVERLAY_CLASS}`)) {
    overlay.remove();
  }
  overlays.clear();
}

// ------------------------------------------------------------- report box

const REPORT_GAP_PX = 8;
const REPORT_WIDTH_PX = 260;
const reportBoxes = new Map<HTMLElement, HTMLElement>();

/** Copies text to the clipboard. */
function copyText(text: string): Promise<void> {
  const selectAndCopy = () =>
    new Promise<void>((resolve, reject) => {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try {
        if (document.execCommand("copy")) resolve();
        else reject(new Error("copy refused"));
      } catch (err) {
        reject(err);
      } finally {
        area.remove();
      }
    });

  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(selectAndCopy);
  }
  return selectAndCopy();
}

/** Builds the "you found a new thing" report box for the captured tooltip. */
function buildReportBox(): HTMLElement {
  const box = document.createElement("div");
  box.className = `${REPORT_CLASS} ${OWN_CLASS}`;

  const intro = document.createElement("div");
  intro.innerHTML =
    "Hey! Congrats, you found a <i>newww</i> thing!! Can you please copy " +
    "this (just click it to copy):";
  box.appendChild(intro);

  // Do not read the payload back off the element: "Copied!" would be copied.
  const payload =
    ocCapturedText === "" ? "(no tooltip text found)" : ocCapturedText;
  const copy = document.createElement("div");
  copy.className = REPORT_COPY_CLASS;
  // Do not switch to innerHTML: this string came off the page.
  copy.textContent = payload;
  copy.title = "Click to copy";
  copy.addEventListener("click", () => {
    void copyText(payload).then(
      () => {
        copy.textContent = "Copied!";
        window.setTimeout(() => {
          copy.textContent = payload;
        }, 1200);
      },
      () => {
        copy.textContent = "Copy failed - select it by hand";
        window.setTimeout(() => {
          copy.textContent = payload;
        }, 2000);
      },
    );
  });
  box.appendChild(copy);

  const outro = document.createElement("div");
  const link = document.createElement("a");
  link.href = REPORT_URL;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = "AutumnGrey";
  outro.append("and send it to ", link, "?");
  box.appendChild(outro);

  return box;
}

/** Places each report box above its button, or below where there is no room. */
function positionReportBoxes(): void {
  for (const [button, box] of reportBoxes) {
    if (!button.isConnected || !isVisible(button)) {
      box.remove();
      reportBoxes.delete(button);
      continue;
    }
    const rect = button.getBoundingClientRect();
    const width = box.offsetWidth || REPORT_WIDTH_PX;
    const height = box.offsetHeight;
    const left = Math.max(
      4,
      Math.min(
        rect.left + rect.width / 2 - width / 2,
        window.innerWidth - width - 4,
      ),
    );
    let top = rect.top - height - REPORT_GAP_PX;
    if (top < 4) top = rect.bottom + REPORT_GAP_PX;
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
  }
}

function removeReportBoxes(): void {
  if (reportBoxes.size === 0) return;
  for (const box of document.querySelectorAll(`.${REPORT_CLASS}`)) {
    box.remove();
  }
  reportBoxes.clear();
}

/** Shows the report box wherever a crime's tooltip wording went unrecognised. */
function updateReportBoxes(): void {
  const wanted = !isGuardDisabled() && ocState === OC_UNREADABLE;
  if (!wanted) {
    removeReportBoxes();
    return;
  }

  const buttons = findTravelButtons().filter(isVisible);
  for (const [button, box] of reportBoxes) {
    if (!buttons.includes(button)) {
      box.remove();
      reportBoxes.delete(button);
    }
  }
  for (const button of buttons) {
    if (reportBoxes.has(button)) continue;
    const box = buildReportBox();
    button.insertAdjacentElement("afterend", box);
    reportBoxes.set(button, box);
  }
  positionReportBoxes();
}

/** Kills any event that starts inside a blocked button. */
function installClickGuard(): void {
  const stop = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest(`[${BLOCK_ATTR}]`)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    log("blocked a", event.type);
  };
  for (const type of ["click", "mousedown", "pointerdown", "touchstart"]) {
    document.addEventListener(type, stop, true);
  }
}

// ------------------------------------------------------------ status panel

/** The "Travel Agency" page heading. */
function findHeader(): HTMLElement | null {
  let best: { element: HTMLElement; text: string } | null = null;

  for (const element of document.body.querySelectorAll<HTMLElement>("*")) {
    if (element.closest(`.${OWN_CLASS}`)) continue;
    if (element.closest(SELECTORS.navigation)) continue;

    const text = (element.textContent ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
    if (!text.includes("TRAVEL AGENCY") || text.length > 40) continue;

    // The shortest match is the heading itself.
    if (best === null || text.length < best.text.length) {
      best = { element, text };
    }
  }

  return best
    ? (best.element.closest("div, section, header") ?? best.element)
    : null;
}

/** The block holding the whole title row. */
function findTitleBlock(): HTMLElement | null {
  const title = findHeader();
  if (!title) return null;

  let node: HTMLElement = title;
  while (node.parentElement && node.parentElement !== document.body) {
    const parent = node.parentElement;
    const nodeBox = node.getBoundingClientRect();
    const parentBox = parent.getBoundingClientRect();
    if (
      nodeBox.width >= parentBox.width * 0.9 &&
      parentBox.height > nodeBox.height * 1.5
    ) {
      return node;
    }
    node = parent;
  }
  return title;
}

/** The destination of the currently selected trip. */
function findSelectedDestination(): string | null {
  for (const button of document.querySelectorAll<HTMLElement>(
    SELECTORS.travelButton,
  )) {
    if (button.closest(`.${OWN_CLASS}`)) continue;
    const label = button.getAttribute("aria-label") ?? "";
    const country = label.match(/^Travel to\s+(.+)$/i)?.[1]?.trim();
    if (country !== undefined && TRAVEL_COUNTRIES.includes(country)) {
      return country;
    }
  }

  const [confirmButton] = findByCaption(CONFIRM_LABELS, false);
  if (!confirmButton) return null;

  let bestCountry: string | null = null;
  let bestDistance = Infinity;
  for (const element of document.body.querySelectorAll<HTMLElement>("*")) {
    if (element.children.length > 0) continue;
    const text = (element.textContent ?? "").trim();
    if (!TRAVEL_COUNTRIES.includes(text)) continue;

    let distance = 0;
    let ancestor: HTMLElement | null = element;
    while (ancestor && !ancestor.contains(confirmButton)) {
      ancestor = ancestor.parentElement;
      distance++;
    }
    if (!ancestor) continue;

    if (distance < bestDistance) {
      bestDistance = distance;
      bestCountry = text;
    }
  }
  return bestCountry;
}

/** Every short leaf element mentioning a travel country, for the console. */
function findDestinationCandidates(): string[] {
  const results: string[] = [];
  for (const element of document.body.querySelectorAll<HTMLElement>("*")) {
    if (element.children.length > 0) continue;
    const text = (element.textContent ?? "").trim();
    if (text.length === 0 || text.length > 60) continue;
    if (!TRAVEL_COUNTRIES.some((country) => text.includes(country))) continue;
    if (!results.includes(text)) results.push(text);
    if (results.length >= 20) break;
  }
  return results;
}

/** ms -> "H:MM", "H:MM:SS", or "Dd H:MM[:SS]" once it reaches a day. */
function formatDuration(ms: number, withSeconds: boolean): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  const clock = withSeconds
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${hours}:${pad(minutes)}`;
  return days > 0 ? `${days}d ${clock}` : clock;
}

/** Epoch ms -> "HH:MM" in Torn City Time, which is UTC. */
function formatClockTCT(ms: number): string {
  const date = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

/** What the OC row shows for the state we are in. */
function ocRowText(): string {
  if (ocState === OC_TIMER && ocStartMs !== null) {
    return formatDuration(ocStartMs - Date.now(), true);
  }
  if (ocState === OC_IMMINENT) return formatDuration(0, true);
  if (ocState === OC_RECRUITING) return "Waiting for all slots to be filled";
  if (ocState === OC_NONE) return "You are a big plum!";
  if (ocState === OC_UNREADABLE) return "Unrecognised - please report it!";
  return "unknown";
}

/** Refreshes the OC countdown, return-time and flight-safety rows. */
function updateStatusBar(): void {
  const ocEl = document.getElementById(STATUS_OC_ID);
  const returnEl = document.getElementById(STATUS_RETURN_ID);
  const messageEl = document.getElementById(STATUS_MESSAGE_ID);
  if (!ocEl || !returnEl || !messageEl) return;

  ocEl.innerHTML = `<b>Current OC in:</b> ${ocRowText()}`;

  const destination = findSelectedDestination();
  const flightMs = findFlightTimeMs();

  // Nothing selected yet.
  if (destination === null || flightMs === null) {
    log(
      "return time hidden - destination:",
      destination,
      "| flightMs:",
      flightMs,
    );
    returnEl.style.display = "none";
    messageEl.style.display = "none";
    return;
  }

  const roundTripMs = 2 * flightMs * FLIGHT_VARIANCE + SAFETY_MARGIN_MS;
  const returnAtMs = Date.now() + roundTripMs;

  returnEl.style.display = "";
  returnEl.innerHTML =
    `<b>Return from ${destination}:</b> ${formatClockTCT(returnAtMs)} TCT` +
    ` - ${formatDuration(roundTripMs, false)} from now`;

  // Recruiting, or not in a crime at all.
  if (ocState === OC_RECRUITING || ocState === OC_NONE) {
    messageEl.style.display = "";
    messageEl.style.color = ocState === OC_RECRUITING ? "#4caf50" : "#f44336";
    messageEl.innerHTML =
      ocState === OC_RECRUITING
        ? "Travel to your heart's content queen x"
        : "Hey bae, maybe join an OC?";
    return;
  }

  if (ocStartMs === null) {
    messageEl.style.display = "none";
    return;
  }

  const spareMs = ocStartMs - returnAtMs;
  let color: string;
  let text: string;
  if (spareMs < 0) {
    color = "#f44336";
    text = `You will return ${formatDuration(-spareMs, false)} late, <b>DO NOT FLY!</b>`;
  } else if (spareMs < 3_600_000) {
    color = "#ff9800";
    text = "You're pushing your luck, no waiting for xanax refills!";
  } else if (spareMs < 12 * 3_600_000) {
    color = "#ffca28";
    text = "This flight is safe but no sleepovers!";
  } else {
    color = "#4caf50";
    text = "This flight is safe, have a holiday!";
  }
  messageEl.style.display = "";
  messageEl.style.color = color;
  messageEl.innerHTML = text;
}

/** Inserts the guard switch and status panel just below the page title. */
function injectToggle(): void {
  if (document.getElementById(TOGGLE_BAR_ID)) return;
  const titleBlock = findTitleBlock();
  if (!titleBlock) return;

  const bar = document.createElement("div");
  bar.id = TOGGLE_BAR_ID;
  bar.className = `${TOGGLE_BAR_CLASS} ${OWN_CLASS}`;
  bar.innerHTML = `
      <div class="${PANEL_CLASS}">
        <div class="${TOGGLE_ROW_CLASS}">
          <span class="ocg-label">Travel Blocker</span>
          <label class="${TOGGLE_SWITCH_CLASS}">
            <input type="checkbox" data-ocg-role="guard" ${isGuardDisabled() ? "" : "checked"}>
            <span class="ocg-slider"></span>
          </label>
        </div>
      </div>
      <div class="${PANEL_CLASS} ${STATUS_GROUP_CLASS}">
        <div class="${STATUS_ROW_CLASS}" id="${STATUS_OC_ID}"></div>
        <div class="${STATUS_ROW_CLASS}" id="${STATUS_RETURN_ID}" style="display: none"></div>
        <div class="${STATUS_ROW_CLASS}" id="${STATUS_MESSAGE_ID}" style="display: none"></div>
      </div>
    `;

  titleBlock.insertAdjacentElement("afterend", bar);
  updateStatusBar();

  bar
    .querySelector<HTMLInputElement>('[data-ocg-role="guard"]')
    ?.addEventListener("change", (event) => {
      setGuardDisabled(!(event.target as HTMLInputElement).checked);
      evaluate();
    });
}

// -------------------------------------------------------------- main loop

/** Whether the guard is switched off entirely. */
const isGuardDisabled = () => {
  try {
    return localStorage.getItem("OCG_DISABLED") === "1";
  } catch {
    return false;
  }
};

const setGuardDisabled = (disabled: boolean) => {
  try {
    localStorage.setItem("OCG_DISABLED", disabled ? "1" : "0");
  } catch {
    // The switch just won't persist.
  }
};

function evaluate(): void {
  updateStatusBar();
  updateReportBoxes();

  if (isGuardDisabled()) {
    unblockAll();
    return;
  }

  // Recruiting, or not in a crime at all.
  if (ocState === OC_RECRUITING || ocState === OC_NONE) {
    unblockAll();
    return;
  }

  // About to initiate, so every destination blocks.
  if (ocState === OC_IMMINENT) {
    const imminentButtons = findTravelButtons();
    log("blocking", imminentButtons.length, "button(s) - OC imminent");
    for (const button of imminentButtons) blockButton(button);
    return;
  }

  const flightMs = findFlightTimeMs();
  if (ocStartMs === null || flightMs === null) {
    unblockAll();
    return;
  }

  const roundTripMs = 2 * flightMs * FLIGHT_VARIANCE + SAFETY_MARGIN_MS;
  const backAtMs = Date.now() + roundTripMs;
  log(
    "back at",
    new Date(backAtMs).toLocaleString(),
    "| OC at",
    new Date(ocStartMs).toLocaleString(),
  );

  if (backAtMs <= ocStartMs) {
    unblockAll();
    return;
  }

  const buttons = findTravelButtons();
  log("blocking", buttons.length, "button(s)");
  for (const button of buttons) blockButton(button);
}

async function main(): Promise<void> {
  injectStyles();
  installClickGuard();

  // The console handle.
  Object.assign(window as unknown as Record<string, unknown>, {
    __ocg: {
      scanForOcState,
      classifyOcText,
      probeIconsForOc,
      findFlightTimeMs,
      findSelectedDestination,
      findDestinationCandidates,
      findTravelButtons,
      findHeader,
      evaluate,
      // Reports what each step of the search found.
      diagnose() {
        const describe = (element: HTMLElement) => {
          const id = element.id ? `#${element.id}` : "";
          const label = element.getAttribute("aria-label") ?? ownText(element);
          return `${element.tagName}${id}[${label}]`;
        };
        return {
          ocState,
          ocAttempts,
          ocCapturedText,
          ocStart: ocStartMs === null ? null : new Date(ocStartMs).toString(),
          flightMinutes: (findFlightTimeMs() ?? 0) / 60_000 || null,
          selectedDestination: findSelectedDestination(),
          destinationCandidates: findDestinationCandidates(),
          travelButtons: findTravelButtons().map(describe),
          blocked: [
            ...document.querySelectorAll<HTMLElement>(`[${BLOCK_ATTR}]`),
          ].map(describe),
          overlays: document.querySelectorAll(`.${OVERLAY_CLASS}`).length,
        };
      },
      get ocStartMs() {
        return ocStartMs;
      },
      set ocStartMs(value: number | null) {
        ocStartMs = value;
      },
      get ocState() {
        return ocState;
      },
      // Forces a state, to see how it renders.
      set ocState(value: OcKind) {
        ocState = value;
      },
    },
  });

  injectToggle();
  installOverlayReconciler();

  // Ticks the countdown in the OC row.
  window.setInterval(updateStatusBar, 1000);

  await resolveOcState();
  evaluate();

  let pending = 0;
  const observer = new MutationObserver(() => {
    // Torn re-renders the title block on navigation within the page.
    injectToggle();
    clearTimeout(pending);
    pending = window.setTimeout(() => {
      // Do not retry once settled: opening the tooltip is itself a DOM change.
      if (ocState === OC_UNKNOWN) {
        void resolveOcState().then(evaluate);
      } else {
        evaluate();
      }
    }, 80);
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "class", "hidden"],
  });

  // Follows the button as the page scrolls.
  window.addEventListener("scroll", positionOverlays, true);

  // A resize can swap which set of buttons is on screen.
  let resizePending = 0;
  window.addEventListener("resize", () => {
    positionOverlays();
    clearTimeout(resizePending);
    resizePending = window.setTimeout(evaluate, 120);
  });

  scheduleOcRetry();

  // Rechecks the OC when the tab comes back to the foreground.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") retryOcNow();
  });
}

void main();
