// OC Travel Guard
//
// One job: on the travel page, if you could not fly to the selected destination
// and back before your Organised Crime starts, grey out the button that would
// commit the flight, swallow clicks on it, and drop an angry raccoon over it.
//
// Desktop and mobile put that button in different places. Desktop has a TRAVEL
// button carrying aria-label="Travel to <country>". Mobile lists destinations
// in a table and only shows a CONTINUE button once you pick one, inside a
// confirmation block. Both are handled; see findTravelButtons().
//
//   now + 2 * (flight time * FLIGHT_VARIANCE) + SAFETY_MARGIN > OC start
//     => blocked

// esbuild inlines this as a data: URI at build time (see the loader map in
// build.mjs), so the built .user.js carries the image and fetches nothing.
import raccoonAngry from "./raccoonAngry.png";

const FLIGHT_VARIANCE = 1.03;
const SAFETY_MARGIN_MS = 5 * 60_000;

// Torn's class names are hashed per deploy, so match on aria-labels, hrefs and
// framework attributes instead. Everything selector-shaped lives here.
const SELECTORS = {
  // Sidebar OC icon. Its aria-label carries the crime name but NOT the timer;
  // the countdown only exists in the tooltip it opens on hover.
  ocIcon: [
    'a[aria-label^="Organized Crime" i]',
    'a[aria-label^="Organised Crime" i]',
    'a[href*="factions.php"][href*="tab=crimes"]',
  ].join(", "),
  // Where floating-ui mounts that tooltip.
  tooltip: '[data-floating-ui-portal], [role="tooltip"]',
  // The travel button, e.g. aria-label="Travel to Argentina".
  travelButton: 'button[aria-label^="Travel to" i]',
  // Fallback if the aria-label ever changes: scan leaf nodes for the caption.
  buttonish: "button, a, span, div",
  // Chrome that is never the travel control no matter what it says. Both the
  // sidebar and the mobile top bar carry a "TRAVEL" link, and the caption
  // fallback below would otherwise happily grey that out instead.
  navigation: [
    "nav",
    "header",
    "aside",
    '[role="navigation"]',
    '[id*="sidebar" i]',
    '[class*="sidebar" i]',
    '[class*="navbar" i]',
    '[class*="menu" i]',
  ].join(", "),
};

const BUTTON_LABELS = ["TRAVEL"];

// Mobile commits the flight through a CONTINUE button in its confirmation
// block, rather than through a TRAVEL button.
const CONFIRM_LABELS = ["CONTINUE"];

const BLOCK_ATTR = "data-ocg-blocked";
const OWN_CLASS = "ocg-own"; // marks nodes we injected, so we never read them back
const OVERLAY_CLASS = "ocg-overlay";

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

/**
 * Read the OC countdown out of any tooltip currently mounted. The tooltip text
 * runs together with no separators, e.g.
 *   "Organized CrimeArsonist in Market Forces2 days, 17 hours, 5 minutes..."
 */
function scanForOcCountdown(): number | null {
  for (const node of document.querySelectorAll<HTMLElement>(SELECTORS.tooltip)) {
    if (node.closest(`.${OWN_CLASS}`)) continue;

    const text = (node.textContent ?? "").trim();
    if (text.length === 0 || text.length > 300) continue;
    if (!/organi[sz]ed\s*crime/i.test(text)) continue;

    const remaining = parseWordyDuration(text);
    if (remaining !== null) {
      log("OC countdown:", text);
      return Date.now() + remaining;
    }
  }
  return null;
}

function dispatchHover(element: Element, entering: boolean): void {
  const types = entering
    ? ["pointerover", "pointerenter", "mouseover", "mouseenter"]
    : ["pointerout", "pointerleave", "mouseout", "mouseleave"];
  for (const type of types) {
    element.dispatchEvent(
      new MouseEvent(type, { bubbles: true, cancelable: true, view: window }),
    );
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fake-hover the sidebar OC icon so its tooltip mounts, read the countdown out
 * of it, then hover back off. Purely a read — the icon is a link we never click.
 */
async function probeIconsForOc(): Promise<number | null> {
  const icons = [...document.querySelectorAll<HTMLElement>(SELECTORS.ocIcon)];
  log("probing", icons.length, "OC icon(s)");

  for (const icon of icons) {
    dispatchHover(icon, true);
    try {
      // floating-ui mounts on a delay and fades in; poll rather than guess.
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await wait(60);
        const found = scanForOcCountdown();
        if (found !== null) return found;
      }
    } finally {
      dispatchHover(icon, false);
    }
  }
  return null;
}

/** Absolute epoch ms when the OC starts, once we've managed to read it. */
let ocStartMs: number | null = null;
let ocLookupRunning = false;

async function resolveOcStart(): Promise<void> {
  if (ocStartMs !== null || ocLookupRunning) return;
  ocLookupRunning = true;
  try {
    ocStartMs = scanForOcCountdown() ?? (await probeIconsForOc());
    log(
      "OC start:",
      ocStartMs === null ? "not found" : new Date(ocStartMs).toString(),
    );
  } finally {
    ocLookupRunning = false;
  }
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

/**
 * Every leaf node whose caption is in `labels`, resolved to its enclosing
 * button or link.
 *
 * `skipNavigation` is opt-in because the exclusion list matches on class
 * substrings, and Torn's class names are hashed per deploy — one could contain
 * "menu" by accident and silently swallow a real match. Only the TRAVEL
 * fallback needs it, since the nav bar has a TRAVEL link but no CONTINUE.
 */
/**
 * An element's own text, ignoring any it inherits from descendants. So
 * <button>CONTINUE<i class="icon"></i></button> still reads as "CONTINUE",
 * while a wrapper <div> holding half the page reads as "".
 *
 * Matching on textContent alone would miss the first and match the second.
 */
function ownText(element: HTMLElement): string {
  let text = "";
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) text += node.nodeValue ?? "";
  }
  return text.trim().toUpperCase();
}

function findByCaption(labels: string[], skipNavigation: boolean): HTMLElement[] {
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

/**
 * Both shapes of the button that commits a flight: desktop's aria-labelled
 * TRAVEL, and mobile's CONTINUE inside the confirmation.
 *
 * CONTINUE is matched bare, with no attempt to prove it belongs to the travel
 * confirmation. That is safe here for two reasons: @match limits this script
 * to the travel pages, which carry only the one CONTINUE, and evaluate() only
 * calls this once a flight time has been read — which on mobile only happens
 * while that confirmation is open.
 */
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

  // Neither shape found — aria-label may have changed. Match the caption.
  return findByCaption(BUTTON_LABELS, true);
}

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
      z-index: 2147483000;
      /* positionOverlays() sizes the box to the raccoon's own aspect
         ratio, so filling it neither crops nor squashes it. */
      background-image: url("${raccoonAngry}");
      background-size: 100% 100%;
      background-position: center;
      background-repeat: no-repeat;
      pointer-events: none;
    }
  `;
  document.head.appendChild(style);
}

// How far the raccoon may extend past the left and right edges of the
// button. Vertical overflow is unbounded — see positionOverlays().
const OVERLAY_BLEED_PX = 6;

// The raccoon is scaled by WIDTH and centred on the button, free to hang
// over the top and bottom. Fitting it to the button's height instead would
// shrink it to nothing on a short, wide button.
//
// Read from the image rather than hardcoded, so swapping the PNG for one of
// a different shape needs no code change.
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

// The overlay lives on <body>, not inside the button: the button's grayscale
// filter would otherwise drain the colour out of it too.
const overlays = new Map<HTMLElement, HTMLElement>();

function positionOverlays(): void {
  for (const [button, overlay] of overlays) {
    // Gone from the DOM, or still in it but hidden by the other layout.
    if (!button.isConnected || !isVisible(button)) {
      overlay.remove();
      overlays.delete(button);
      button.removeAttribute(BLOCK_ATTR);
      button.removeAttribute("aria-disabled");
      if (button instanceof HTMLButtonElement) button.disabled = false;
      continue;
    }
    const rect = button.getBoundingClientRect();

    // Never upscale past the image's natural size — a blown-up 100px PNG
    // just looks blurry.
    const width = Math.min(rect.width + OVERLAY_BLEED_PX * 2, raccoonWidth);
    const height = width * (raccoonHeight / raccoonWidth);

    overlay.style.width = `${width}px`;
    overlay.style.height = `${height}px`;
    overlay.style.left = `${rect.left + rect.width / 2 - width / 2}px`;
    overlay.style.top = `${rect.top + rect.height / 2 - height / 2}px`;
  }
}

/**
 * Torn ships the desktop and mobile layouts together and hides one with CSS,
 * so a node can be connected but have no box. Those are not on screen and
 * must not get an overlay — that is what put a second raccoon in the top bar
 * after resizing from mobile back to desktop.
 */
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
    document.body.appendChild(overlay);
    overlays.set(button, overlay);
  }

  positionOverlays();
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

/** Belt and braces: kill any event that starts inside a blocked button. */
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

// -------------------------------------------------------------- main loop

/** localStorage.OCG_FORCE = '1' blocks regardless of the maths, to eyeball it. */
const forceBlock = () => {
  try {
    return localStorage.getItem("OCG_FORCE") === "1";
  } catch {
    return false;
  }
};

function evaluate(): void {
  const flightMs = findFlightTimeMs();
  const forced = forceBlock();

  if (!forced && (ocStartMs === null || flightMs === null)) {
    unblockAll();
    return;
  }

  if (!forced && ocStartMs !== null && flightMs !== null) {
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
  }

  const buttons = findTravelButtons();
  log("blocking", buttons.length, "button(s)", forced ? "(forced)" : "");
  for (const button of buttons) blockButton(button);
}

async function main(): Promise<void> {
  injectStyles();
  installClickGuard();

  // Exposed so the console can poke at it while we're still tuning selectors.
  Object.assign(window as unknown as Record<string, unknown>, {
    __ocg: {
      scanForOcCountdown,
      probeIconsForOc,
      findFlightTimeMs,
      findTravelButtons,
      evaluate,
      // __ocg.diagnose() in the console when it silently does nothing.
      diagnose() {
        const describe = (element: HTMLElement) =>
          `${element.tagName}${element.id ? "#" + element.id : ""}` +
          `[${element.getAttribute("aria-label") ?? ownText(element)}]`;
        return {
          ocStart: ocStartMs === null ? null : new Date(ocStartMs).toString(),
          flightMinutes: (findFlightTimeMs() ?? 0) / 60_000 || null,
          forced: forceBlock(),
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
    },
  });

  await resolveOcStart();
  evaluate();

  let pending = 0;
  const observer = new MutationObserver(() => {
    clearTimeout(pending);
    pending = window.setTimeout(evaluate, 80);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // The overlay is position:fixed, so it has to follow the button around.
  window.addEventListener("scroll", positionOverlays, true);

  // A resize can cross Torn's mobile/desktop breakpoint and swap which set of
  // buttons is on screen, so repositioning is not enough — re-run the search.
  let resizePending = 0;
  window.addEventListener("resize", () => {
    positionOverlays();
    clearTimeout(resizePending);
    resizePending = window.setTimeout(evaluate, 120);
  });

  // The tooltip may not have been mountable at load; keep retrying quietly.
  setInterval(() => {
    void resolveOcStart().then(evaluate);
  }, 30_000);
}

void main();
