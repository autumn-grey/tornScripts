// ==UserScript==
// @name         OC Travel Guard
// @namespace    https://github.com/autumn-grey
// @version      0.4.6
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
  var raccoonAngry_default = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAACXBIWXMAAAsTAAALEwEAmpwYAAAKbWlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4gPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgOS4xLWMwMDMgNzkuOTY5MGE4NywgMjAyNS8wMy8wNi0xOToxMjowMyAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczpkYz0iaHR0cDovL3B1cmwub3JnL2RjL2VsZW1lbnRzLzEuMS8iIHhtbG5zOnhtcE1NPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvbW0vIiB4bWxuczpzdEV2dD0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL3NUeXBlL1Jlc291cmNlRXZlbnQjIiB4bWxuczpzdFJlZj0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL3NUeXBlL1Jlc291cmNlUmVmIyIgeG1sbnM6cGhvdG9zaG9wPSJodHRwOi8vbnMuYWRvYmUuY29tL3Bob3Rvc2hvcC8xLjAvIiB4bWxuczp0aWZmPSJodHRwOi8vbnMuYWRvYmUuY29tL3RpZmYvMS4wLyIgeG1sbnM6ZXhpZj0iaHR0cDovL25zLmFkb2JlLmNvbS9leGlmLzEuMC8iIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIDI2LjEwIChXaW5kb3dzKSIgeG1wOkNyZWF0ZURhdGU9IjIwMjYtMDktMDZUMDE6NTg6MzArMTA6MDAiIHhtcDpNZXRhZGF0YURhdGU9IjIwMjYtMDktMDZUMDI6NTU6MzMrMTA6MDAiIHhtcDpNb2RpZnlEYXRlPSIyMDI2LTA5LTA2VDAyOjU1OjMzKzEwOjAwIiBkYzpmb3JtYXQ9ImltYWdlL3BuZyIgeG1wTU06SW5zdGFuY2VJRD0ieG1wLmlpZDowYmVlMDZlOC1mYmUwLTEzNDItODc3YS1jYTg0N2VlNzMyMmEiIHhtcE1NOkRvY3VtZW50SUQ9ImFkb2JlOmRvY2lkOnBob3Rvc2hvcDplOGFmMzgzMy03OTcwLWFhNGEtYmI3NS1mNTg0MzdjYTY1NjYiIHhtcE1NOk9yaWdpbmFsRG9jdW1lbnRJRD0ieG1wLmRpZDphNGZhMWEyZi1lMzcyLWJiNGEtOWYzOC04YWE2MmZjODM0MmMiIHBob3Rvc2hvcDpDb2xvck1vZGU9IjMiIHRpZmY6T3JpZW50YXRpb249IjEiIHRpZmY6WFJlc29sdXRpb249IjcyMDAwMC8xMDAwMCIgdGlmZjpZUmVzb2x1dGlvbj0iNzIwMDAwLzEwMDAwIiB0aWZmOlJlc29sdXRpb25Vbml0PSIyIiBleGlmOkNvbG9yU3BhY2U9IjY1NTM1IiBleGlmOlBpeGVsWERpbWVuc2lvbj0iMTAyMiIgZXhpZjpQaXhlbFlEaW1lbnNpb249IjE0MTQiPiA8eG1wTU06SGlzdG9yeT4gPHJkZjpTZXE+IDxyZGY6bGkgc3RFdnQ6YWN0aW9uPSJjcmVhdGVkIiBzdEV2dDppbnN0YW5jZUlEPSJ4bXAuaWlkOmE0ZmExYTJmLWUzNzItYmI0YS05ZjM4LThhYTYyZmM4MzQyYyIgc3RFdnQ6d2hlbj0iMjAyNi0wOS0wNlQwMTo1ODozMCsxMDowMCIgc3RFdnQ6c29mdHdhcmVBZ2VudD0iQWRvYmUgUGhvdG9zaG9wIDI2LjEwIChXaW5kb3dzKSIvPiA8cmRmOmxpIHN0RXZ0OmFjdGlvbj0ic2F2ZWQiIHN0RXZ0Omluc3RhbmNlSUQ9InhtcC5paWQ6YjhjNTNkMzYtZDAxOS1mZTQ1LTliNjAtNWFiMWRmYWUzYTYwIiBzdEV2dDp3aGVuPSIyMDI2LTA5LTA2VDAyOjI1OjE4KzEwOjAwIiBzdEV2dDpzb2Z0d2FyZUFnZW50PSJBZG9iZSBQaG90b3Nob3AgMjYuMTAgKFdpbmRvd3MpIiBzdEV2dDpjaGFuZ2VkPSIvIi8+IDxyZGY6bGkgc3RFdnQ6YWN0aW9uPSJzYXZlZCIgc3RFdnQ6aW5zdGFuY2VJRD0ieG1wLmlpZDpiODBjODk1OC1hMzVlLWRkNGItOTFjMi1lMjQ3MTFkYWQzMjMiIHN0RXZ0OndoZW49IjIwMjYtMDktMDZUMDI6NTU6MzMrMTA6MDAiIHN0RXZ0OnNvZnR3YXJlQWdlbnQ9IkFkb2JlIFBob3Rvc2hvcCAyNi4xMCAoV2luZG93cykiIHN0RXZ0OmNoYW5nZWQ9Ii8iLz4gPHJkZjpsaSBzdEV2dDphY3Rpb249ImNvbnZlcnRlZCIgc3RFdnQ6cGFyYW1ldGVycz0iZnJvbSBhcHBsaWNhdGlvbi92bmQuYWRvYmUucGhvdG9zaG9wIHRvIGltYWdlL3BuZyIvPiA8cmRmOmxpIHN0RXZ0OmFjdGlvbj0iZGVyaXZlZCIgc3RFdnQ6cGFyYW1ldGVycz0iY29udmVydGVkIGZyb20gYXBwbGljYXRpb24vdm5kLmFkb2JlLnBob3Rvc2hvcCB0byBpbWFnZS9wbmciLz4gPHJkZjpsaSBzdEV2dDphY3Rpb249InNhdmVkIiBzdEV2dDppbnN0YW5jZUlEPSJ4bXAuaWlkOjBiZWUwNmU4LWZiZTAtMTM0Mi04NzdhLWNhODQ3ZWU3MzIyYSIgc3RFdnQ6d2hlbj0iMjAyNi0wOS0wNlQwMjo1NTozMysxMDowMCIgc3RFdnQ6c29mdHdhcmVBZ2VudD0iQWRvYmUgUGhvdG9zaG9wIDI2LjEwIChXaW5kb3dzKSIgc3RFdnQ6Y2hhbmdlZD0iLyIvPiA8L3JkZjpTZXE+IDwveG1wTU06SGlzdG9yeT4gPHhtcE1NOkRlcml2ZWRGcm9tIHN0UmVmOmluc3RhbmNlSUQ9InhtcC5paWQ6YjgwYzg5NTgtYTM1ZS1kZDRiLTkxYzItZTI0NzExZGFkMzIzIiBzdFJlZjpkb2N1bWVudElEPSJ4bXAuZGlkOmE0ZmExYTJmLWUzNzItYmI0YS05ZjM4LThhYTYyZmM4MzQyYyIgc3RSZWY6b3JpZ2luYWxEb2N1bWVudElEPSJ4bXAuZGlkOmE0ZmExYTJmLWUzNzItYmI0YS05ZjM4LThhYTYyZmM4MzQyYyIvPiA8L3JkZjpEZXNjcmlwdGlvbj4gPC9yZGY6UkRGPiA8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";

  var FLIGHT_VARIANCE = 1.03;
  var SAFETY_MARGIN_MS = 5 * 6e4;
  var TEST_SAFETY_MARGIN_MS = 1e5 * 6e4;
  var SELECTORS = {
    ocIcon: [
      'a[aria-label^="Organized Crime" i]',
      'a[aria-label^="Organised Crime" i]',
      'a[href*="factions.php"][href*="tab=crimes"]'
    ].join(", "),
    tooltip: '[data-floating-ui-portal], [role="tooltip"]',
    travelButton: 'button[aria-label^="Travel to" i]',
    buttonish: "button, a, span, div",
    navigation: [
      "nav",
      "aside",
      '[role="navigation"]',
      "#sidebarroot",
      "#header-root",
      '[id*="sidebar" i]'
    ].join(", ")
  };
  var BUTTON_LABELS = ["TRAVEL"];
  var CONFIRM_LABELS = ["CONTINUE"];
  var BLOCK_ATTR = "data-ocg-blocked";
  var OWN_CLASS = "ocg-own";
  var OVERLAY_CLASS = "ocg-overlay";
  var TOGGLE_BAR_CLASS = "ocg-toggle-bar";
  var TOGGLE_ROW_CLASS = "ocg-toggle-row";
  var TOGGLE_SWITCH_CLASS = "ocg-switch";
  var TOGGLE_BAR_ID = "ocg-toggle-bar";

  // Reports whether debug logging is turned on.
  var debugOn = () => {
    try {
      return localStorage.getItem("OCG_DEBUG") === "1";
    } catch {
      return false;
    }
  };

  // Prints a debug message when debug logging is turned on.
  var log = (...args) => {
    if (debugOn()) console.log("[OCG]", ...args);
  };

  // Converts a wordy duration ("1 day, 2 hours...") into milliseconds.
  function parseWordyDuration(text) {
    const unit = (pattern) => {
      const digits = text.match(pattern)?.[1];
      return digits === void 0 ? 0 : Number(digits);
    };
    const total = ((unit(/(\d+)\s*day/i) * 24 + unit(/(\d+)\s*hour/i)) * 60 + unit(/(\d+)\s*minute/i)) * 60 + unit(/(\d+)\s*second/i);
    return total > 0 ? total * 1e3 : null;
  }

  // Finds an open Organized Crime countdown tooltip and returns its start time.
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
    // Falls back to scanning the whole page's visible text for the same pattern.
    const bodyText = document.body.innerText ?? "";
    const idx = bodyText.search(/organi[sz]ed\s*crime/i);
    if (idx !== -1) {
      const remaining = parseWordyDuration(bodyText.slice(idx, idx + 200));
      if (remaining !== null) {
        log("OC countdown (body fallback)");
        return Date.now() + remaining;
      }
    }
    return null;
  }

  // Returns a promise that resolves after the given delay.
  var wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Opens or closes the Organized Crime tooltip attached to an icon element.
  function triggerOcTooltip(element, entering) {
    const key = Object.keys(element).find((k) => k.startsWith("__reactFiber"));
    let fiber = key ? element[key] : null;
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
    // Also dispatches native events as a fallback.
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

  // Opens each Organized Crime icon's tooltip in turn and returns the crime's start time.
  async function probeIconsForOc() {
    const icons = [...document.querySelectorAll(SELECTORS.ocIcon)];
    log("probing", icons.length, "OC icon(s)");
    for (const icon of icons) {
      try {
        triggerOcTooltip(icon, true);
        for (let attempt = 0; attempt < 10; attempt += 1) {
          await wait(60);
          const found = scanForOcCountdown();
          if (found !== null) return found;
        }
      } finally {
        triggerOcTooltip(icon, false);
      }
    }
    return null;
  }
  var ocStartMs = null;
  var ocLookupRunning = false;

  // Determines and caches the Organized Crime start time.
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

  // Finds the current flight's duration in milliseconds.
  function findFlightTimeMs() {
    const text = document.body.innerText;
    const clock = text.match(/Flight\s*Time\s*[-–—:]*\s*(\d{1,2}):(\d{2})/i);
    if (clock?.[1] !== void 0 && clock[2] !== void 0) {
      return (Number(clock[1]) * 60 + Number(clock[2])) * 6e4;
    }
    const verbose = text.match(/It will take\s+([^.]+?)\s+to reach/i);
    return verbose?.[1] === void 0 ? null : parseWordyDuration(verbose[1]);
  }

  // Returns an element's own direct text, ignoring text inside its children.
  function ownText(element) {
    let text = "";
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) text += node.nodeValue ?? "";
    }
    return text.trim().toUpperCase();
  }

  // Finds elements whose own text matches one of the given labels.
  function findByCaption(labels, skipNavigation) {
    const found = [];
    for (const element of document.querySelectorAll(
      SELECTORS.buttonish
    )) {
      if (element.closest(`.${OWN_CLASS}`)) continue;
      if (skipNavigation && element.closest(SELECTORS.navigation)) continue;
      if (!labels.includes(ownText(element))) continue;
      const button = element.closest("button, a") ?? element;
      if (!found.includes(button)) found.push(button);
    }
    return found;
  }

  // Finds every travel and travel-confirmation button currently on the page.
  function findTravelButtons() {
    const found = [];
    const add = (element) => {
      if (!found.includes(element)) found.push(element);
    };
    for (const element of document.querySelectorAll(
      SELECTORS.travelButton
    )) {
      add(element);
    }
    for (const element of findByCaption(CONFIRM_LABELS, false)) add(element);
    if (found.length > 0) return found;
    return findByCaption(BUTTON_LABELS, true);
  }

  // Adds the script's stylesheet to the page.
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
      /* Box size matches the raccoon image's aspect ratio. */
      background-image: url("${raccoonAngry_default}");
      background-size: 100% 100%;
      background-position: center;
      background-repeat: no-repeat;
      pointer-events: none;
    }
    .${TOGGLE_BAR_CLASS} {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin: 6px 0 8px;
      padding: 0;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 13px;
      line-height: 1;
      color: #fff;
    }
    .${TOGGLE_ROW_CLASS} {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 12px;
      border-radius: 16px;
      cursor: pointer;
      color: #fff;
      background: linear-gradient(180deg, #454545 0%, #373737 100%);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
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
  `;
    document.head.appendChild(style);
  }
  var OVERLAY_BLEED_PX = 6;
  var raccoonWidth = 100;
  var raccoonHeight = 100;
  var raccoonImage = new Image();
  raccoonImage.addEventListener("load", () => {
    if (raccoonImage.naturalWidth > 0 && raccoonImage.naturalHeight > 0) {
      raccoonWidth = raccoonImage.naturalWidth;
      raccoonHeight = raccoonImage.naturalHeight;
      positionOverlays();
    }
  });
  raccoonImage.src = raccoonAngry_default;
  var overlays = /* @__PURE__ */ new Map();

  // Positions every blocking overlay over its blocked button.
  function positionOverlays() {
    for (const [button, overlay] of overlays) {
      if (!button.isConnected || !isVisible(button)) {
        overlay.remove();
        overlays.delete(button);
        button.removeAttribute(BLOCK_ATTR);
        button.removeAttribute("aria-disabled");
        if (button instanceof HTMLButtonElement) button.disabled = false;
        continue;
      }
      const rect = button.getBoundingClientRect();
      const width = Math.min(rect.width + OVERLAY_BLEED_PX * 2, raccoonWidth);
      const height = width * (raccoonHeight / raccoonWidth);
      overlay.style.width = `${width}px`;
      overlay.style.height = `${height}px`;
      overlay.style.left = `${rect.left + rect.width / 2 - width / 2}px`;
      overlay.style.top = `${rect.top + rect.height / 2 - height / 2}px`;
    }
  }

  // Reports whether an element currently occupies visible space on the page.
  var isVisible = (element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  // Disables a button and covers it with a blocking overlay.
  function blockButton(button) {
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

  // Removes every blocking overlay and re-enables the buttons they covered.
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

  // Stops clicks, taps, and presses on any blocked element from reaching the page.
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

  // Finds the "Travel Agency" page header.
  function findHeader() {
    let best = null;
    for (const element of document.body.querySelectorAll("*")) {
      if (element.closest(`.${OWN_CLASS}`)) continue;
      if (element.closest(SELECTORS.navigation)) continue;
      const text = (element.textContent ?? "").replace(/\s+/g, " ").trim().toUpperCase();
      if (!text.includes("TRAVEL AGENCY") || text.length > 40) continue;
      // Keeps the element with the shortest matching text.
      if (best === null || text.length < best.text.length) {
        best = { element, text };
      }
    }
    return best ? best.element.closest("div, section, header") ?? best.element : null;
  }

  // Finds the ancestor block that holds the whole title row and everything under it.
  function findTitleBlock() {
    const title = findHeader();
    if (!title) return null;
    let node = title;
    while (node.parentElement && node.parentElement !== document.body) {
      const parent = node.parentElement;
      const nodeBox = node.getBoundingClientRect();
      const parentBox = parent.getBoundingClientRect();
      if (nodeBox.width >= parentBox.width * 0.9 && parentBox.height > nodeBox.height * 1.5) {
        return node;
      }
      node = parent;
    }
    return title;
  }

  // Adds the OC Travel Guard switches on one row below the page title.
  function injectToggle() {
    if (document.getElementById(TOGGLE_BAR_ID)) return;
    const titleBlock = findTitleBlock();
    if (!titleBlock) return;
    const bar = document.createElement("div");
    bar.id = TOGGLE_BAR_ID;
    bar.className = `${TOGGLE_BAR_CLASS} ${OWN_CLASS}`;
    // Builds the guard and testing-mode toggle rows.
    bar.innerHTML = `
      <label class="${TOGGLE_ROW_CLASS}">
        <span class="ocg-label">OC Travel Guard</span>
        <span class="${TOGGLE_SWITCH_CLASS}">
          <input type="checkbox" data-ocg-role="guard" ${isGuardDisabled() ? "" : "checked"}>
          <span class="ocg-slider"></span>
        </span>
      </label>
      <label class="${TOGGLE_ROW_CLASS}">
        <span class="ocg-label">Testing Mode</span>
        <span class="${TOGGLE_SWITCH_CLASS}">
          <input type="checkbox" data-ocg-role="test" ${isTestMode() ? "checked" : ""}>
          <span class="ocg-slider"></span>
        </span>
      </label>
    `;
    titleBlock.insertAdjacentElement("afterend", bar);
    bar.querySelector('[data-ocg-role="guard"]')?.addEventListener("change", (event) => {
      setGuardDisabled(!event.target.checked);
      evaluate();
    });
    bar.querySelector('[data-ocg-role="test"]')?.addEventListener("change", (event) => {
      setTestMode(event.target.checked);
      evaluate();
    });
  }

  // Reports whether test mode has inflated the safety margin.
  var isTestMode = () => {
    try {
      return localStorage.getItem("OCG_TEST") === "1";
    } catch {
      return false;
    }
  };

  // Saves whether test mode is turned on.
  var setTestMode = (enabled) => {
    try {
      localStorage.setItem("OCG_TEST", enabled ? "1" : "0");
    } catch {}
  };

  // Reports whether the guard has been switched off.
  var isGuardDisabled = () => {
    try {
      return localStorage.getItem("OCG_DISABLED") === "1";
    } catch {
      return false;
    }
  };

  // Saves whether the guard is switched off.
  var setGuardDisabled = (disabled) => {
    try {
      localStorage.setItem("OCG_DISABLED", disabled ? "1" : "0");
    } catch {}
  };

  // Blocks or unblocks the travel buttons for the current guard and flight state.
  function evaluate() {
    if (isGuardDisabled()) {
      unblockAll();
      return;
    }
    const flightMs = findFlightTimeMs();
    if (ocStartMs === null || flightMs === null) {
      unblockAll();
      return;
    }
    const safetyMarginMs = isTestMode() ? TEST_SAFETY_MARGIN_MS : SAFETY_MARGIN_MS;
    const roundTripMs = 2 * flightMs * FLIGHT_VARIANCE + safetyMarginMs;
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
    const buttons = findTravelButtons();
    log("blocking", buttons.length, "button(s)");
    for (const button of buttons) blockButton(button);
  }

  // Bootstraps the script and keeps it in sync with the page.
  async function main() {
    injectStyles();
    installClickGuard();
    Object.assign(window, {
      __ocg: {
        scanForOcCountdown,
        probeIconsForOc,
        findFlightTimeMs,
        findTravelButtons,
        findHeader,
        evaluate,
        diagnose() {
          const describe = (element) => {
            const id = element.id ? `#${element.id}` : "";
            const label = element.getAttribute("aria-label") ?? ownText(element);
            return `${element.tagName}${id}[${label}]`;
          };
          return {
            ocStart: ocStartMs === null ? null : new Date(ocStartMs).toString(),
            flightMinutes: (findFlightTimeMs() ?? 0) / 6e4 || null,
            testMode: isTestMode(),
            travelButtons: findTravelButtons().map(describe),
            blocked: [
              ...document.querySelectorAll(`[${BLOCK_ATTR}]`)
            ].map(describe),
            overlays: document.querySelectorAll(`.${OVERLAY_CLASS}`).length
          };
        },
        get ocStartMs() {
          return ocStartMs;
        },
        set ocStartMs(value) {
          ocStartMs = value;
        }
      }
    });
    injectToggle();
    await resolveOcStart();
    evaluate();
    let pending = 0;
    const observer = new MutationObserver(() => {
      injectToggle();
      clearTimeout(pending);
      pending = window.setTimeout(evaluate, 80);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("scroll", positionOverlays, true);
    let resizePending = 0;
    window.addEventListener("resize", () => {
      positionOverlays();
      clearTimeout(resizePending);
      resizePending = window.setTimeout(evaluate, 120);
    });
    setInterval(() => {
      void resolveOcStart().then(evaluate);
    }, 3e4);
  }
  void main();
})();
