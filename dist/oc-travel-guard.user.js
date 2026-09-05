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
  var RACCOON_URL = "";
  var GUARDED_LABELS = ["TRAVEL", "CONTINUE"];
  var BLOCK_ATTR = "data-ocg-blocked";
  var OWN_CLASS = "ocg-own";
  var OVERLAY_CLASS = "ocg-overlay";
  var LABEL_CLASS = "ocg-label";
  function parseWordyDuration(text) {
    const unit = (pattern) => {
      const match = text.match(pattern);
      const digits = match?.[1];
      return digits === void 0 ? 0 : Number(digits);
    };
    const days = unit(/(\d+)\s*day/i);
    const hours = unit(/(\d+)\s*hour/i);
    const minutes = unit(/(\d+)\s*minute/i);
    const seconds = unit(/(\d+)\s*second/i);
    const total = ((days * 24 + hours) * 60 + minutes) * 60 + seconds;
    return total > 0 ? total * 1e3 : null;
  }
  function formatShortfall(ms) {
    const totalMinutes = Math.max(1, Math.ceil(ms / 6e4));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${minutes}m late` : `${minutes}m late`;
  }
  function readOcCountdown() {
    const candidates = document.querySelectorAll("div, span, li, p");
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
    const icons = [
      ...document.querySelectorAll(
        '[id^="icon"], li[class*="icon"], ul[class*="icon"] > li'
      )
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
  var ocStartMs = null;
  var ocLookupDone = false;
  async function resolveOcStart() {
    if (ocLookupDone) return;
    ocStartMs = readOcCountdown() ?? await probeIconsForOc();
    ocLookupDone = true;
    if (ocStartMs === null) {
      console.info("[OC Travel Guard] No Organised Crime found. Standing down.");
    }
  }
  function findFlightTimeMs() {
    const text = document.body.innerText;
    const clock = text.match(/Flight\s*Time\s*[-–—:]*\s*(\d{1,2}):(\d{2})/i);
    const hours = clock?.[1];
    const minutes = clock?.[2];
    if (hours !== void 0 && minutes !== void 0) {
      return (Number(hours) * 60 + Number(minutes)) * 6e4;
    }
    const verbose = text.match(/It will take\s+([^.]+?)\s+to reach/i);
    const phrase = verbose?.[1];
    if (phrase !== void 0) return parseWordyDuration(phrase);
    return null;
  }
  function findGuardedButtons() {
    const found = [];
    for (const element of document.querySelectorAll(
      "button, a, span, div"
    )) {
      if (element.children.length > 0) continue;
      if (element.closest(`.${OWN_CLASS}`)) continue;
      const label = (element.textContent ?? "").trim().toUpperCase();
      if (!GUARDED_LABELS.includes(label)) continue;
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
  function blockButton(button, shortfallMs) {
    const text = `back ${formatShortfall(shortfallMs)}`;
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
    let label = host.querySelector(`.${LABEL_CLASS}`);
    if (!label) {
      label = document.createElement("span");
      label.className = `${LABEL_CLASS} ${OWN_CLASS}`;
      host.appendChild(label);
    }
    label.textContent = text;
  }
  function clearBlocks() {
    for (const button of document.querySelectorAll(`[${BLOCK_ATTR}]`)) {
      button.removeAttribute(BLOCK_ATTR);
      button.querySelector(`.${OVERLAY_CLASS}`)?.remove();
    }
    for (const label of document.querySelectorAll(`.${LABEL_CLASS}`)) {
      label.remove();
    }
  }
  function installClickGuard() {
    const stop = (event) => {
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
      (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        stop(event);
      },
      true
    );
  }
  function onTravelPage() {
    return /sid=travel|travelagency/i.test(location.href);
  }
  function evaluate() {
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
  async function main() {
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
    setInterval(evaluate, 3e4);
  }
  void main();
})();
