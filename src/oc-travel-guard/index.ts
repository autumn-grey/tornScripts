// OC Travel Guard
//
// One job: on the travel page, if you could not fly to the selected destination
// and back before your Organised Crime starts, grey out the TRAVEL button,
// swallow clicks on it, and drop a placeholder rectangle over it.
//
//   now + 2 * (flight time * FLIGHT_VARIANCE) + SAFETY_MARGIN > OC start
//     => blocked

const FLIGHT_VARIANCE = 1.03;
const SAFETY_MARGIN_MS = 5 * 60_000;

// Placeholder for the gif that goes over the button. Empty = flat green box.
const OVERLAY_IMAGE_URL = "";
const OVERLAY_COLOUR = "#00ff00";

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
};

const BUTTON_LABELS = ["TRAVEL"];

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

function findTravelButtons(): HTMLElement[] {
  const labelled = [
    ...document.querySelectorAll<HTMLElement>(SELECTORS.travelButton),
  ];
  if (labelled.length > 0) return labelled;

  // aria-label gone? Fall back to reading the button caption.
  const found: HTMLElement[] = [];
  for (const element of document.querySelectorAll<HTMLElement>(
    SELECTORS.buttonish,
  )) {
    if (element.children.length > 0) continue; // leaf nodes only
    if (element.closest(`.${OWN_CLASS}`)) continue;

    const label = (element.textContent ?? "").trim().toUpperCase();
    if (!BUTTON_LABELS.includes(label)) continue;

    const button = (element.closest("button, a") ?? element) as HTMLElement;
    if (!found.includes(button)) found.push(button);
  }
  return found;
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
      border-radius: 4px;
      background-color: ${OVERLAY_COLOUR};
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      pointer-events: none;
    }
  `;
  document.head.appendChild(style);
}

// How far the overlay extends past each edge of the button.
const OVERLAY_BLEED_PX = 6;

// The overlay lives on <body>, not inside the button: the button's grayscale
// filter would otherwise drain the colour out of it too.
const overlays = new Map<HTMLElement, HTMLElement>();

function positionOverlays(): void {
  for (const [button, overlay] of overlays) {
    if (!button.isConnected) {
      overlay.remove();
      overlays.delete(button);
      continue;
    }
    const rect = button.getBoundingClientRect();
    overlay.style.top = `${rect.top - OVERLAY_BLEED_PX}px`;
    overlay.style.left = `${rect.left - OVERLAY_BLEED_PX}px`;
    overlay.style.width = `${rect.width + OVERLAY_BLEED_PX * 2}px`;
    overlay.style.height = `${rect.height + OVERLAY_BLEED_PX * 2}px`;
  }
}

function blockButton(button: HTMLElement): void {
  if (button.getAttribute(BLOCK_ATTR) === null) {
    button.setAttribute(BLOCK_ATTR, "1");
    button.setAttribute("aria-disabled", "true");
    if (button instanceof HTMLButtonElement) button.disabled = true;
  }

  if (!overlays.has(button)) {
    const overlay = document.createElement("div");
    overlay.className = `${OVERLAY_CLASS} ${OWN_CLASS}`;
    if (OVERLAY_IMAGE_URL !== "") {
      overlay.style.backgroundImage = `url("${OVERLAY_IMAGE_URL}")`;
    }
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
  window.addEventListener("resize", positionOverlays);

  // The tooltip may not have been mountable at load; keep retrying quietly.
  setInterval(() => {
    void resolveOcStart().then(evaluate);
  }, 30_000);
}

void main();
