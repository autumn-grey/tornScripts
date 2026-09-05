/**
 * OC Travel Guard
 *
 * Torn shows a flight time only after you pick a destination, so this script
 * cannot mark up the map. It intercepts at the two points where a flight time
 * is on screen: the TRAVEL button, and the CONTINUE confirmation.
 *
 * Blocking is done with a capture-phase listener rather than by disabling the
 * button, so the click is stopped no matter what Torn re-renders underneath.
 *
 * Reads only the page already loaded. No requests, no automation, nothing
 * persisted between page loads.
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Torn's stated flight time can run up to 3% over. */
const FLIGHT_VARIANCE = 1.03;

/** Slack on top of the round trip, for landing, grabbing items and taking off. */
const SAFETY_MARGIN_MS = 5 * 60_000;

/**
 * Image covering the TRAVEL button. Empty string uses the built-in flashing
 * green placeholder. Set this to the raccoon GIF's URL once it is uploaded
 * alongside the script on GreasyFork.
 */
const RACCOON_URL = "";

/** Button labels to guard, upper-cased. */
const GUARDED_LABELS = ["TRAVEL", "CONTINUE"];

// ---------------------------------------------------------------------------
// Markers used on elements this script has touched
// ---------------------------------------------------------------------------

const BLOCK_ATTR = "data-ocg-blocked";
const OWN_CLASS = "ocg-own";
const OVERLAY_CLASS = "ocg-overlay";
const LABEL_CLASS = "ocg-label";

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Reads durations written out in words, covering both the OC tooltip
 * ("2 days, 18 hours, 9 minutes and 10 seconds") and the travel confirmation
 * ("1 hour, and 51 minutes"). Returns null when no unit is present.
 */
function parseWordyDuration(text: string): number | null {
  const unit = (pattern: RegExp): number => {
    const match = text.match(pattern);
    const digits = match?.[1];
    return digits === undefined ? 0 : Number(digits);
  };

  const days = unit(/(\d+)\s*day/i);
  const hours = unit(/(\d+)\s*hour/i);
  const minutes = unit(/(\d+)\s*minute/i);
  const seconds = unit(/(\d+)\s*second/i);

  const total = ((days * 24 + hours) * 60 + minutes) * 60 + seconds;
  return total > 0 ? total * 1000 : null;
}

/** "1h 47m late", or "47m late" when under an hour. */
function formatShortfall(ms: number): string {
  const totalMinutes = Math.max(1, Math.ceil(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m late` : `${minutes}m late`;
}

// ---------------------------------------------------------------------------
// Finding the OC start time
// ---------------------------------------------------------------------------

/**
 * Torn's status icon tooltip is the only place the OC countdown appears on
 * this page. Absolute timestamps are deliberately ignored: the native tooltip
 * gives a countdown, and anything showing a wall-clock time is in Torn City
 * Time, which would need timezone handling to read safely.
 */
function readOcCountdown(): number | null {
  const candidates = document.querySelectorAll<HTMLElement>("div, span, li, p");

  for (const element of candidates) {
    if (element.closest(`.${OWN_CLASS}`)) continue;

    const text = element.textContent ?? "";
    if (text.length > 300) continue;
    if (!/organi[sz]ed\s+crime/i.test(text)) continue;

    const remaining = parseWordyDuration(text);
    if (remaining !== null) return Date.now() + remaining;
  }

  return null;
}

function dispatchHover(element: HTMLElement, entering: boolean): void {
  const types = entering
    ? ["pointerover", "pointerenter", "mouseover", "mouseenter"]
    : ["pointerout", "pointerleave", "mouseout", "mouseleave"];

  for (const type of types) {
    element.dispatchEvent(
      new MouseEvent(type, { bubbles: true, cancelable: true, view: window }),
    );
  }
}

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * If the tooltip is only built on hover, the countdown is not in the DOM until
 * the icon is hovered. Hovering each status icon in turn surfaces it. This is
 * local event dispatch only; nothing is sent to Torn.
 */
async function probeIconsForOc(): Promise<number | null> {
  const icons = [
    ...document.querySelectorAll<HTMLElement>(
      '[id^="icon"], li[class*="icon"], ul[class*="icon"] > li',
    ),
  ].slice(0, 60);

  for (const icon of icons) {
    dispatchHover(icon, true);
    await wait(40);
    const found = readOcCountdown();
    dispatchHover(icon, false);
    if (found !== null) return found;
  }

  return null;
}

/**
 * Resolved once per page load. The countdown ticks, but the absolute start
 * time it implies does not, so there is nothing to refresh.
 */
let ocStartMs: number | null = null;
let ocLookupDone = false;

async function resolveOcStart(): Promise<void> {
  if (ocLookupDone) return;

  ocStartMs = readOcCountdown() ?? (await probeIconsForOc());
  ocLookupDone = true;

  if (ocStartMs === null) {
    console.info("[OC Travel Guard] No Organised Crime found. Standing down.");
  }
}

// ---------------------------------------------------------------------------
// Finding the flight time and the buttons
// ---------------------------------------------------------------------------

/** One-way flight time for the currently selected destination. */
function findFlightTimeMs(): number | null {
  const text = document.body.innerText;

  // Destination panel: "Flight Time - 01:51"
  const clock = text.match(/Flight\s*Time\s*[-–—:]*\s*(\d{1,2}):(\d{2})/i);
  const hours = clock?.[1];
  const minutes = clock?.[2];
  if (hours !== undefined && minutes !== undefined) {
    return (Number(hours) * 60 + Number(minutes)) * 60_000;
  }

  // Confirmation: "It will take 1 hour, and 51 minutes to reach your destination."
  const verbose = text.match(/It will take\s+([^.]+?)\s+to reach/i);
  const phrase = verbose?.[1];
  if (phrase !== undefined) return parseWordyDuration(phrase);

  return null;
}

/** The TRAVEL and CONTINUE buttons, whichever are currently on screen. */
function findGuardedButtons(): HTMLElement[] {
  const found: HTMLElement[] = [];

  for (const element of document.querySelectorAll<HTMLElement>(
    "button, a, span, div",
  )) {
    if (element.children.length > 0) continue;
    if (element.closest(`.${OWN_CLASS}`)) continue;

    const label = (element.textContent ?? "").trim().toUpperCase();
    if (!GUARDED_LABELS.includes(label)) continue;

    const button = (element.closest("button, a") ?? element) as HTMLElement;
    if (!found.includes(button)) found.push(button);
  }

  return found;
}

// ---------------------------------------------------------------------------
// Blocking
// ---------------------------------------------------------------------------

function injectStyles(): void {
  if (document.getElementById("ocg-styles")) return;

  const style = document.createElement("style");
  style.id = "ocg-styles";
  style.textContent = `
    [${BLOCK_ATTR}] {
      position: relative !important;
      cursor: not-allowed !important;
      filter: grayscale(1) brightness(0.5);
    }
    .${OVERLAY_CLASS} {
      position: absolute;
      inset: -6px;
      z-index: 9999;
      border-radius: 4px;
      background-size: cover;
      background-position: center;
      pointer-events: none;
    }
    .${OVERLAY_CLASS}.ocg-placeholder {
      animation: ocg-flash 0.6s steps(1, end) infinite;
    }
    @keyframes ocg-flash {
      0%, 49%   { background-color: rgb(0, 255, 0); }
      50%, 100% { background-color: rgb(0, 150, 50); }
    }
    .${LABEL_CLASS} {
      display: block;
      margin: 6px 0 2px;
      color: #e05c5c;
      font-size: 12px;
      font-weight: 700;
      text-align: center;
      letter-spacing: 0.02em;
    }
  `;
  document.head.appendChild(style);
}

function blockButton(button: HTMLElement, shortfallMs: number): void {
  const text = `back ${formatShortfall(shortfallMs)}`;

  // Idempotent: the observer fires on our own edits too.
  if (button.getAttribute(BLOCK_ATTR) === text) return;
  button.setAttribute(BLOCK_ATTR, text);

  if (!button.querySelector(`.${OVERLAY_CLASS}`)) {
    const overlay = document.createElement("div");
    overlay.className = `${OVERLAY_CLASS} ${OWN_CLASS}`;
    if (RACCOON_URL === "") {
      overlay.classList.add("ocg-placeholder");
    } else {
      overlay.style.backgroundImage = `url("${RACCOON_URL}")`;
    }
    button.appendChild(overlay);
  }

  const host = button.parentElement ?? button;
  let label = host.querySelector<HTMLElement>(`.${LABEL_CLASS}`);
  if (!label) {
    label = document.createElement("span");
    label.className = `${LABEL_CLASS} ${OWN_CLASS}`;
    host.appendChild(label);
  }
  label.textContent = text;
}

function clearBlocks(): void {
  for (const button of document.querySelectorAll<HTMLElement>(`[${BLOCK_ATTR}]`)) {
    button.removeAttribute(BLOCK_ATTR);
    button.querySelector(`.${OVERLAY_CLASS}`)?.remove();
  }
  for (const label of document.querySelectorAll(`.${LABEL_CLASS}`)) {
    label.remove();
  }
}

/**
 * The actual guarantee. Registered once, in the capture phase, so the click is
 * killed before it reaches Torn's own handler regardless of render timing.
 */
function installClickGuard(): void {
  const stop = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest(`[${BLOCK_ATTR}]`)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
  };

  for (const type of ["click", "mousedown", "pointerdown", "touchstart"]) {
    document.addEventListener(type, stop, true);
  }

  document.addEventListener(
    "keydown",
    (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      stop(event);
    },
    true,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function onTravelPage(): boolean {
  return /sid=travel|travelagency/i.test(location.href);
}

function evaluate(): void {
  if (!onTravelPage() || ocStartMs === null) return;

  const flightMs = findFlightTimeMs();
  if (flightMs === null) {
    clearBlocks();
    return;
  }

  const roundTripMs = 2 * flightMs * FLIGHT_VARIANCE + SAFETY_MARGIN_MS;
  const backAtMs = Date.now() + roundTripMs;
  const shortfallMs = backAtMs - ocStartMs;

  if (shortfallMs <= 0) {
    clearBlocks();
    return;
  }

  for (const button of findGuardedButtons()) blockButton(button, shortfallMs);
}

async function main(): Promise<void> {
  if (!onTravelPage()) return;

  injectStyles();
  installClickGuard();
  await resolveOcStart();
  if (ocStartMs === null) return;

  evaluate();

  let pending = 0;
  const observer = new MutationObserver(() => {
    clearTimeout(pending);
    pending = window.setTimeout(evaluate, 80);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // The shortfall shrinks as the OC approaches, so a destination that is
  // currently fine can become blocked while the page sits open.
  setInterval(evaluate, 30_000);
}

void main();
