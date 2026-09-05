// ==UserScript==
// @name         OC Travel Guard
// @namespace    https://github.com/autumn-grey
// @version      0.1.0
// @description  Blocks travel to any destination you could not fly back from before your Organised Crime starts.
// @author       AutumnGrey
// @license      MIT
// @match        https://www.torn.com/page.php?sid=travel*
// @match        https://www.torn.com/travelagency.php*
// @grant        none
// @run-at       document-idle
// @noframes     true
// @downloadURL  https://raw.githubusercontent.com/autumn-grey/tornScripts/main/dist/oc-travel-guard.user.js
// @updateURL    https://raw.githubusercontent.com/autumn-grey/tornScripts/main/dist/oc-travel-guard.user.js
// ==/UserScript==

"use strict";
(() => {
  // src/oc-travel-guard/index.ts
  var FLIGHT_VARIANCE = 1.03;
  var SAFETY_MARGIN_MS = 5 * 6e4;
  var OVERLAY_IMAGE_URL = "";
  var OVERLAY_COLOUR = "#00ff00";
  var SELECTORS = {
    // Sidebar OC icon. Its aria-label carries the crime name but NOT the timer;
    // the countdown only exists in the tooltip it opens on hover.
    ocIcon: [
      'a[aria-label^="Organized Crime" i]',
      'a[aria-label^="Organised Crime" i]',
      'a[href*="factions.php"][href*="tab=crimes"]'
    ].join(", "),
    // Where floating-ui mounts that tooltip.
    tooltip: '[data-floating-ui-portal], [role="tooltip"]',
    // The travel button, e.g. aria-label="Travel to Argentina".
    travelButton: 'button[aria-label^="Travel to" i]',
    // Fallback if the aria-label ever changes: scan leaf nodes for the caption.
    buttonish: "button, a, span, div"
  };
  var BUTTON_LABELS = ["TRAVEL"];
  var BLOCK_ATTR = "data-ocg-blocked";
  var OWN_CLASS = "ocg-own";
  var OVERLAY_CLASS = "ocg-overlay";
  var debugOn = () => {
    try {
      return localStorage.getItem("OCG_DEBUG") === "1";
    } catch {
      return false;
    }
  };
  var log = (...args) => {
    if (debugOn()) console.log("[OCG]", ...args);
  };
  function parseWordyDuration(text) {
    const unit = (pattern) => {
      const digits = text.match(pattern)?.[1];
      return digits === void 0 ? 0 : Number(digits);
    };
    const total = ((unit(/(\d+)\s*day/i) * 24 + unit(/(\d+)\s*hour/i)) * 60 + unit(/(\d+)\s*minute/i)) * 60 + unit(/(\d+)\s*second/i);
    return total > 0 ? total * 1e3 : null;
  }
  function scanForOcCountdown() {
    for (const node of document.querySelectorAll(SELECTORS.tooltip)) {
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
  function dispatchHover(element, entering) {
    const types = entering ? ["pointerover", "pointerenter", "mouseover", "mouseenter"] : ["pointerout", "pointerleave", "mouseout", "mouseleave"];
    for (const type of types) {
      element.dispatchEvent(
        new MouseEvent(type, { bubbles: true, cancelable: true, view: window })
      );
    }
  }
  var wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function probeIconsForOc() {
    const icons = [...document.querySelectorAll(SELECTORS.ocIcon)];
    log("probing", icons.length, "OC icon(s)");
    for (const icon of icons) {
      dispatchHover(icon, true);
      try {
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
  var ocStartMs = null;
  var ocLookupRunning = false;
  async function resolveOcStart() {
    if (ocStartMs !== null || ocLookupRunning) return;
    ocLookupRunning = true;
    try {
      ocStartMs = scanForOcCountdown() ?? await probeIconsForOc();
      log(
        "OC start:",
        ocStartMs === null ? "not found" : new Date(ocStartMs).toString()
      );
    } finally {
      ocLookupRunning = false;
    }
  }
  function findFlightTimeMs() {
    const text = document.body.innerText;
    const clock = text.match(/Flight\s*Time\s*[-–—:]*\s*(\d{1,2}):(\d{2})/i);
    if (clock?.[1] !== void 0 && clock[2] !== void 0) {
      return (Number(clock[1]) * 60 + Number(clock[2])) * 6e4;
    }
    const verbose = text.match(/It will take\s+([^.]+?)\s+to reach/i);
    return verbose?.[1] === void 0 ? null : parseWordyDuration(verbose[1]);
  }
  function findTravelButtons() {
    const labelled = [
      ...document.querySelectorAll(SELECTORS.travelButton)
    ];
    if (labelled.length > 0) return labelled;
    const found = [];
    for (const element of document.querySelectorAll(
      SELECTORS.buttonish
    )) {
      if (element.children.length > 0) continue;
      if (element.closest(`.${OWN_CLASS}`)) continue;
      const label = (element.textContent ?? "").trim().toUpperCase();
      if (!BUTTON_LABELS.includes(label)) continue;
      const button = element.closest("button, a") ?? element;
      if (!found.includes(button)) found.push(button);
    }
    return found;
  }
  function injectStyles() {
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
  var OVERLAY_BLEED_PX = 6;
  var overlays = /* @__PURE__ */ new Map();
  function positionOverlays() {
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
  function blockButton(button) {
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
  function unblockAll() {
    for (const button of document.querySelectorAll(
      `[${BLOCK_ATTR}]`
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
  function installClickGuard() {
    const stop = (event) => {
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
  var forceBlock = () => {
    try {
      return localStorage.getItem("OCG_FORCE") === "1";
    } catch {
      return false;
    }
  };
  function evaluate() {
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
        new Date(ocStartMs).toLocaleString()
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
  async function main() {
    injectStyles();
    installClickGuard();
    Object.assign(window, {
      __ocg: {
        scanForOcCountdown,
        probeIconsForOc,
        findFlightTimeMs,
        findTravelButtons,
        evaluate,
        get ocStartMs() {
          return ocStartMs;
        },
        set ocStartMs(value) {
          ocStartMs = value;
        }
      }
    });
    await resolveOcStart();
    evaluate();
    let pending = 0;
    const observer = new MutationObserver(() => {
      clearTimeout(pending);
      pending = window.setTimeout(evaluate, 80);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("scroll", positionOverlays, true);
    window.addEventListener("resize", positionOverlays);
    setInterval(() => {
      void resolveOcStart().then(evaluate);
    }, 3e4);
  }
  void main();
})();
