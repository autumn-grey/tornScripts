// ==UserScript==
// @name         Autumn's UI Enhancer
// @namespace    https://github.com/autumn-grey
// @version      0.2.4
// @description  Small quality-of-life fixes for Torn's interface: stops filter links jumping the page, and adds an items-per-page selector to paged lists. Switched on and off from a panel on the preferences page.
// @author       AutumnGrey
// @license      MIT
// @match        https://www.torn.com/*
// @grant        none
// @run-at       document-start
// @noframes     true
// @downloadURL  https://raw.githubusercontent.com/autumn-grey/tornScripts/main/dist/autumns-ui-enhancer.user.js
// @updateURL    https://raw.githubusercontent.com/autumn-grey/tornScripts/main/dist/autumns-ui-enhancer.user.js
// ==/UserScript==

"use strict";
(() => {
  // src/autumns-ui-enhancer/debug.ts
  var DEBUG_KEY = "AUE_DEBUG";
  function debugging() {
    try {
      return localStorage.getItem(DEBUG_KEY) === "1";
    } catch {
      return false;
    }
  }
  function log(...parts) {
    if (!debugging()) return;
    console.debug("[AUE]", ...parts);
  }

  // src/autumns-ui-enhancer/settings.ts
  var SETTING_PREFIX = "AUE_";
  var PAGE_JUMP_BLOCK = {
    key: "PAGE_JUMP_BLOCK",
    label: "Page Jump Block",
    defaultOn: true
  };
  var LIST_DISPLAY_EXTENSION = {
    key: "LIST_DISPLAY_EXTENSION",
    label: "List Display Extension",
    defaultOn: true
  };
  var FEATURES = [PAGE_JUMP_BLOCK, LIST_DISPLAY_EXTENSION];
  function isEnabled(feature) {
    try {
      const stored = localStorage.getItem(SETTING_PREFIX + feature.key);
      if (stored === null) return feature.defaultOn;
      return stored === "1";
    } catch {
      return feature.defaultOn;
    }
  }
  function setEnabled(feature, on) {
    try {
      localStorage.setItem(SETTING_PREFIX + feature.key, on ? "1" : "0");
    } catch {
    }
  }
  function readSetting(key, fallback) {
    try {
      return localStorage.getItem(SETTING_PREFIX + key) ?? fallback;
    } catch {
      return fallback;
    }
  }
  function writeSetting(key, value) {
    try {
      localStorage.setItem(SETTING_PREFIX + key, value);
    } catch {
    }
  }

  // src/autumns-ui-enhancer/listDisplay.ts
  var PAGINATION_SELECTOR = ".pagination";
  var PAGE_LINK_SELECTOR = "a.page-number[page]";
  var PAGE_GAP_SELECTOR = "span.points";
  var ARROW_PREV_SELECTOR = "i.pagination-left";
  var ARROW_NEXT_SELECTOR = "i.pagination-right";
  var ARROW_DISABLED_CLASS = "disable";
  var SPACER_CLASS = "clear";
  var ROW_CONTAINER_SELECTOR = "ul, ol, tbody";
  var PAGE_STEP = 20;
  var PAGE_SIZES = [20, 40, 60, 80, 100];
  var THROTTLE_MS = 150;
  var SETTLE_MS = 150;
  var MAX_SETTLE_MS = 1e3;
  var SIZE_SETTING = "ITEMS_PER_PAGE";
  var CONTROL_ID = "aue-per-page";
  var SELECT_ID = "aue-per-page-select";
  var STATUS_CLASS = "aue-per-page-status";
  var EXTRA_ROW_ATTR = "data-aue-extra";
  var PAGER_STATE_ATTR = "data-aue-pager";
  var START_IN_BODY = /(^|&)start=\d+/;
  var START_IN_HASH = /[?&]start=(\d+)/;
  var lastRequest = null;
  var ownRequest = false;
  var generation = 0;
  var writing = false;
  var filling = null;
  var primed = false;
  var onRequestCaptured = null;
  var originalPagers = /* @__PURE__ */ new WeakMap();
  var basePageCounts = /* @__PURE__ */ new WeakMap();
  function pageSize() {
    const stored = Number(readSetting(SIZE_SETTING, String(PAGE_STEP)));
    return PAGE_SIZES.includes(stored) ? stored : PAGE_STEP;
  }
  function rememberRequest(url, body) {
    if (!START_IN_BODY.test(body)) return;
    let path;
    try {
      path = new URL(url, location.href).pathname;
    } catch {
      return;
    }
    if (path !== location.pathname) return;
    lastRequest = { url, body };
    log("capture: list request for", path, body.replace(/=[^&]*/g, "=*"));
    onRequestCaptured?.();
  }
  function installRequestCapture() {
    const openOriginal = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(...args) {
      this.__aueUrl = String(args[1]);
      openOriginal.apply(this, args);
    };
    const sendOriginal = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(body) {
      if (!ownRequest && typeof body === "string") {
        rememberRequest(this.__aueUrl ?? location.pathname, body);
      }
      sendOriginal.call(this, body);
    };
    const fetchOriginal = window.fetch;
    window.fetch = function(...args) {
      const input = args[0];
      const init = args[1];
      const body = init?.body;
      if (!ownRequest && typeof body === "string") {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        rememberRequest(url, body);
      }
      return fetchOriginal.apply(
        this,
        args
      );
    };
  }
  var MAX_CLIMB = 4;
  function isRow(element) {
    if (element.classList.contains(SPACER_CLASS)) return false;
    return element.childElementCount > 0 || (element.textContent ?? "").trim() !== "";
  }
  function rowsOf(container) {
    return [...container.children].filter(isRow);
  }
  function findRowContainer(root) {
    if (root.id === CONTROL_ID) return null;
    const candidates = [];
    for (const element of root.querySelectorAll(
      ROW_CONTAINER_SELECTOR
    )) {
      if (element.closest(PAGINATION_SELECTOR)) continue;
      if (rowsOf(element).length >= 2) candidates.push(element);
    }
    if (candidates.length === 0) return null;
    const full = candidates.filter((c) => rowsOf(c).length >= PAGE_STEP);
    const pool = full.length > 0 ? full : candidates;
    return pool.reduce(
      (best, c) => rowsOf(c).length > rowsOf(best).length ? c : best
    );
  }
  function siblingsOf(node) {
    const found = [];
    for (const direction of [
      "nextElementSibling",
      "previousElementSibling"
    ]) {
      let sibling = node[direction];
      while (sibling && sibling.id === CONTROL_ID) sibling = sibling[direction];
      if (sibling) found.push(sibling);
    }
    return found;
  }
  function findList(widget) {
    let node = widget;
    for (let level = 0; node && node !== document.body && level <= MAX_CLIMB; ) {
      for (const sibling of siblingsOf(node)) {
        const container = findRowContainer(sibling);
        if (container) {
          return {
            widget,
            pagerBlock: node,
            block: sibling,
            container
          };
        }
      }
      node = node.parentElement;
      level += 1;
    }
    return null;
  }
  function findTarget() {
    for (const widget of document.querySelectorAll(
      PAGINATION_SELECTOR
    )) {
      if (!widget.querySelector(PAGE_LINK_SELECTOR)) continue;
      const target = findList(widget);
      if (target) return target;
    }
    return null;
  }
  function hashTemplate(widget) {
    const link = widget.querySelector(PAGE_LINK_SELECTOR);
    let href = link?.getAttribute("href") ?? "";
    if (href.length < 2 || href[0] !== "#") {
      href = location.hash.replace(START_IN_HASH, "");
    }
    if (href.length < 2) return null;
    href = href.replace(START_IN_HASH, "");
    return /[?&]$/.test(href) ? href : `${href}&`;
  }
  function currentStart() {
    const match = START_IN_HASH.exec(location.hash);
    return match ? Number(match[1]) : 0;
  }
  function goToPage(widget, page) {
    const template = hashTemplate(widget);
    if (!template) return;
    const size = pageSize();
    const start = Math.max(0, page - 1) * size;
    generation += 1;
    location.hash = `${template}start=${start}`;
  }
  function basePageCount(widget) {
    const stored = basePageCounts.get(widget);
    if (stored !== void 0) return stored;
    const links = [
      ...widget.querySelectorAll(PAGE_LINK_SELECTOR)
    ];
    if (links.length === 0) return null;
    const pageOf = (link) => Number(link.getAttribute("page")) || 1;
    const last = widget.querySelector(`${PAGE_LINK_SELECTOR}.last`);
    const pages = last ? pageOf(last) : Math.max(1, ...links.map(pageOf));
    if (last) basePageCounts.set(widget, pages);
    log(
      "pager: Torn reports",
      pages,
      "pages of",
      PAGE_STEP,
      last ? "" : "(pager unfinished, not cached)"
    );
    return pages;
  }
  function pagerModel(widget, size) {
    const pages20 = basePageCount(widget);
    if (pages20 === null) return null;
    const total = Math.max(1, Math.ceil(pages20 * PAGE_STEP / size));
    const current = Math.min(total, Math.floor(currentStart() / size) + 1);
    return { base: pages20, current, total };
  }
  function pagesToShow(model) {
    const wanted = /* @__PURE__ */ new Set([1, model.total]);
    for (let page = model.current - 2; page <= model.current + 2; page += 1) {
      if (page >= 1 && page <= model.total) wanted.add(page);
    }
    return [...wanted].sort((a, b) => a - b);
  }
  function rewritePager(widget, size) {
    const model = pagerModel(widget, size);
    if (!model) return;
    log("pager: page", model.current, "of", model.total, "at", size, "per page");
    const state = `${size}:${model.current}:${model.total}`;
    if (widget.getAttribute(PAGER_STATE_ATTR) === state) return;
    if (!originalPagers.has(widget)) {
      originalPagers.set(widget, widget.innerHTML);
      basePageCounts.set(widget, model.base);
    }
    const template = widget.querySelector(PAGE_LINK_SELECTOR);
    const gap = widget.querySelector(PAGE_GAP_SELECTOR);
    if (!template) return;
    const nextArrow = widget.querySelector(ARROW_NEXT_SELECTOR)?.closest("a");
    const anchorPoint = nextArrow ?? widget.querySelector(".pagination-r") ?? null;
    const blank = template.cloneNode(true);
    const blankGap = gap?.cloneNode(true) ?? null;
    for (const old of widget.querySelectorAll(
      `${PAGE_LINK_SELECTOR}, ${PAGE_GAP_SELECTOR}`
    )) {
      old.remove();
    }
    const pages = pagesToShow(model);
    const fragment = document.createDocumentFragment();
    let previous = 0;
    for (const page of pages) {
      if (previous !== 0 && page !== previous + 1 && blankGap) {
        fragment.appendChild(blankGap.cloneNode(true));
      }
      const link = blank.cloneNode(true);
      link.setAttribute("page", String(page));
      link.classList.remove("first", "last", "active");
      if (page === 1) link.classList.add("first");
      if (page === model.total) link.classList.add("last");
      if (page === model.current) link.classList.add("active");
      const number = link.querySelector(".page-nb") ?? link;
      number.textContent = String(page);
      fragment.appendChild(link);
      previous = page;
    }
    if (anchorPoint) widget.insertBefore(fragment, anchorPoint);
    else widget.appendChild(fragment);
    const prev = widget.querySelector(ARROW_PREV_SELECTOR);
    const next = widget.querySelector(ARROW_NEXT_SELECTOR);
    prev?.classList.toggle(ARROW_DISABLED_CLASS, model.current <= 1);
    next?.classList.toggle(ARROW_DISABLED_CLASS, model.current >= model.total);
    widget.setAttribute(PAGER_STATE_ATTR, state);
  }
  function restorePager(widget) {
    const original = originalPagers.get(widget);
    if (original === void 0) return;
    widget.innerHTML = original;
    widget.removeAttribute(PAGER_STATE_ATTR);
    originalPagers.delete(widget);
    basePageCounts.delete(widget);
  }
  function installPagerClicks() {
    document.addEventListener(
      "click",
      (event) => {
        if (!isEnabled(LIST_DISPLAY_EXTENSION)) return;
        const size = pageSize();
        if (size <= PAGE_STEP) return;
        const target = event.target;
        if (!(target instanceof Element)) return;
        const link = target.closest("a");
        const widget = link?.closest(PAGINATION_SELECTOR);
        if (!link || !widget) return;
        const model = pagerModel(widget, size);
        if (!model) return;
        let page = null;
        const pageAttribute = link.getAttribute("page");
        if (pageAttribute !== null) {
          page = Number(pageAttribute);
        } else if (link.querySelector(ARROW_PREV_SELECTOR)) {
          page = model.current - 1;
        } else if (link.querySelector(ARROW_NEXT_SELECTOR)) {
          page = model.current + 1;
        }
        if (page === null || Number.isNaN(page)) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        if (page < 1 || page > model.total || page === model.current) return;
        goToPage(widget, page);
      },
      true
    );
  }
  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  function matchingContainer(parsed, live) {
    const sameTag = [
      ...parsed.querySelectorAll(live.tagName.toLowerCase())
    ].filter((element) => rowsOf(element).length > 0);
    if (sameTag.length === 0) return null;
    const liveClasses = [...live.classList];
    const byClass = sameTag.filter(
      (element) => liveClasses.some((name) => element.classList.contains(name))
    );
    const pool = byClass.length > 0 ? byClass : sameTag;
    return pool.reduce(
      (best, element) => rowsOf(element).length > rowsOf(best).length ? element : best
    );
  }
  async function fetchRows(start, live) {
    if (!lastRequest) return [];
    const body = lastRequest.body.replace(
      START_IN_BODY,
      (_match, lead) => `${lead}start=${start}`
    );
    ownRequest = true;
    let html;
    try {
      const response = await fetch(lastRequest.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Requested-With": "XMLHttpRequest"
        },
        body,
        credentials: "same-origin"
      });
      if (!response.ok) return [];
      html = await response.text();
    } catch {
      return [];
    } finally {
      ownRequest = false;
    }
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const container = matchingContainer(parsed, live);
    if (!container) lastRequest = null;
    const rows = container ? rowsOf(container) : [];
    log(
      "fetch: start",
      start,
      "->",
      html.length,
      "chars,",
      container ? `matched ${container.tagName}.${container.className}` : "NO LIST FOUND",
      `${rows.length} rows`
    );
    return rows;
  }
  function removeExtraRows(container) {
    for (const row of container.querySelectorAll(`[${EXTRA_ROW_ATTR}]`)) {
      row.remove();
    }
  }
  async function fillList(target, size) {
    const { container } = target;
    const have = rowsOf(container).length;
    if (have >= size) return;
    if (have < PAGE_STEP) {
      log("fill: skipped -", have, "rows is a short page, so this is the end");
      return;
    }
    const start = currentStart();
    const key = `${start}:${size}`;
    if (filling === key) return;
    const mine = generation;
    filling = key;
    const requests = Math.ceil(size / PAGE_STEP);
    log("fill:", have, "rows present, want", size, "-", requests - 1, "more request(s)");
    const spacer = container.querySelector(`:scope > .${SPACER_CLASS}`);
    try {
      for (let index = 1; index < requests; index += 1) {
        setStatus(`Loading ${index + 1}/${requests}`);
        const rows = await fetchRows(start + index * PAGE_STEP, container);
        if (mine !== generation) {
          log("fill: abandoned, the page moved on");
          return;
        }
        if (rows.length === 0) {
          log("fill: stopped, that request returned no rows");
          break;
        }
        writing = true;
        for (const row of rows) {
          row.setAttribute(EXTRA_ROW_ATTR, "");
          if (spacer) container.insertBefore(row, spacer);
          else container.appendChild(row);
        }
        writing = false;
        if (rows.length < PAGE_STEP) break;
        if (index + 1 < requests) await delay(THROTTLE_MS);
        if (mine !== generation) return;
      }
      log("fill: done,", rowsOf(container).length, "rows now showing");
    } finally {
      writing = false;
      if (filling === key) filling = null;
      setStatus("");
    }
  }
  function setStatus(text) {
    const status = document.querySelector(`.${STATUS_CLASS}`);
    if (status) status.textContent = text;
  }
  function buildControl() {
    const bar = document.createElement("div");
    bar.id = CONTROL_ID;
    bar.className = "aue-per-page";
    const status = document.createElement("span");
    status.className = STATUS_CLASS;
    bar.appendChild(status);
    const label = document.createElement("label");
    label.className = "aue-per-page-label";
    label.htmlFor = SELECT_ID;
    label.textContent = "Items per page";
    bar.appendChild(label);
    const select = document.createElement("select");
    select.id = SELECT_ID;
    select.className = "aue-per-page-select";
    for (const size of PAGE_SIZES) {
      const option = document.createElement("option");
      option.value = String(size);
      option.textContent = String(size);
      select.appendChild(option);
    }
    select.value = String(pageSize());
    select.addEventListener("change", () => onSizeChange(Number(select.value)));
    bar.appendChild(select);
    return bar;
  }
  function onSizeChange(size) {
    writeSetting(SIZE_SETTING, String(size));
    generation += 1;
    setStatus("");
    const target = findTarget();
    if (!target) return;
    writing = true;
    removeExtraRows(target.container);
    for (const widget of document.querySelectorAll(
      PAGINATION_SELECTOR
    )) {
      restorePager(widget);
    }
    writing = false;
    const page = Math.floor(currentStart() / size) + 1;
    const before = location.hash;
    goToPage(target.widget, page);
    if (location.hash === before) setTimeout(() => void apply(), 0);
  }
  function ensureControl(target) {
    const existing = document.getElementById(CONTROL_ID);
    if (existing) {
      const select = existing.querySelector(`#${SELECT_ID}`);
      if (select && select.value !== String(pageSize())) {
        select.value = String(pageSize());
      }
      if (existing.nextElementSibling === target.pagerBlock) return;
      writing = true;
      target.pagerBlock.insertAdjacentElement("beforebegin", existing);
      writing = false;
      return;
    }
    writing = true;
    target.pagerBlock.insertAdjacentElement("beforebegin", buildControl());
    writing = false;
  }
  function removeControl() {
    document.getElementById(CONTROL_ID)?.remove();
  }
  function primeRequest(target) {
    if (primed || START_IN_HASH.test(location.hash)) return;
    primed = true;
    log("prime: asking Torn for this list so its request can be replayed");
    goToPage(target.widget, Math.floor(currentStart() / pageSize()) + 1);
  }
  async function apply() {
    if (!isEnabled(LIST_DISPLAY_EXTENSION)) {
      removeControl();
      return;
    }
    const target = findTarget();
    if (!target) {
      removeControl();
      return;
    }
    ensureControl(target);
    const size = pageSize();
    if (size <= PAGE_STEP) {
      writing = true;
      removeExtraRows(target.container);
      for (const widget of document.querySelectorAll(
        PAGINATION_SELECTOR
      )) {
        restorePager(widget);
      }
      writing = false;
      return;
    }
    if (!lastRequest) {
      log("apply: no list request to replay yet, leaving the page alone");
      writing = true;
      removeExtraRows(target.container);
      for (const widget of document.querySelectorAll(
        PAGINATION_SELECTOR
      )) {
        restorePager(widget);
      }
      writing = false;
      primeRequest(target);
      return;
    }
    writing = true;
    for (const widget of document.querySelectorAll(
      PAGINATION_SELECTOR
    )) {
      if (widget.querySelector(PAGE_LINK_SELECTOR)) rewritePager(widget, size);
    }
    writing = false;
    await fillList(target, size);
  }
  function installListDisplay() {
    installPagerClicks();
    let timer = 0;
    let deadline = 0;
    const schedule = () => {
      const now = Date.now();
      if (deadline === 0) deadline = now + MAX_SETTLE_MS;
      clearTimeout(timer);
      timer = window.setTimeout(
        () => {
          deadline = 0;
          void apply();
        },
        Math.max(0, Math.min(SETTLE_MS, deadline - now))
      );
    };
    onRequestCaptured = schedule;
    new MutationObserver(() => {
      if (writing) return;
      schedule();
    }).observe(document.body, { childList: true, subtree: true });
    addEventListener("hashchange", () => {
      generation += 1;
      schedule();
    });
    schedule();
  }

  // src/autumns-ui-enhancer/pageJumpBlock.ts
  var SUPPRESS_MS = 1e3;
  var suppressUntil = 0;
  function suppressing() {
    if (Date.now() >= suppressUntil) return false;
    return isEnabled(PAGE_JUMP_BLOCK);
  }
  function armSuppression() {
    suppressUntil = Date.now() + SUPPRESS_MS;
  }
  function installPageJumpBlock() {
    addEventListener(
      "click",
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const link = target.closest("a");
        const href = link?.getAttribute("href");
        if (!href || href.length < 2 || href[0] !== "#") return;
        armSuppression();
      },
      true
    );
    addEventListener("hashchange", armSuppression, true);
    addEventListener("popstate", armSuppression, true);
    const patchHistory = (name) => {
      const original = history[name];
      history[name] = function(...args) {
        const url = args[2];
        if (typeof url === "string" && url.includes("#")) armSuppression();
        return original.apply(this, args);
      };
    };
    patchHistory("pushState");
    patchHistory("replaceState");
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function(...args) {
      if (suppressing()) return;
      originalScrollIntoView.apply(this, args);
    };
    for (const name of ["scrollTo", "scroll", "scrollBy"]) {
      const original = window[name];
      if (typeof original !== "function") continue;
      window[name] = function(...args) {
        if (suppressing()) return;
        original.apply(this, args);
      };
    }
  }

  // src/autumns-ui-enhancer/styles.ts
  var STYLE_ID = "aue-styles";
  var PANEL_ID = "aue-prefs-panel";
  var CSS = `
  /* ------------------------------------------------ preferences panel */

  /* Sits directly under the main preferences panel and inherits its width,
     so the two read as one stack. The columns below size themselves against
     this box rather than the viewport, so the panel lays itself out
     correctly whatever Torn does with the page around it. */
  #${PANEL_ID} {
    container-type: inline-size;
    margin: 10px 0 0;
    border-radius: 5px;
    overflow: hidden;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    font-family: Arial, Helvetica, sans-serif;
    color: #fff;
  }
  /* Torn's own panel-title bar: blue-grey, lighter at the top. */
  .aue-title {
    height: 30px;
    line-height: 30px;
    padding: 0 0 0 10px;
    background: linear-gradient(180deg, #4e565e 0%, #303840 100%);
    font-family: Arial, Helvetica, sans-serif;
    font-weight: bold;
    font-size: 12px;
    color: #fff;
    text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
  }
  /* Three toggles to a line. The gradient is on the body rather than the
     cells, so it stays one continuous fill however the grid reflows. */
  .aue-body {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    background: linear-gradient(180deg, #656565 0%, #373737 100%);
  }
  /* Narrower panel, fewer columns, so a label never has to be cropped. */
  @container (max-width: 620px) {
    .aue-body { grid-template-columns: repeat(2, 1fr); }
  }
  @container (max-width: 400px) {
    .aue-body { grid-template-columns: 1fr; }
  }
  /* For anything without container queries - the same steps, read off the
     viewport instead, which is close enough on Torn's fixed-width layout. */
  @supports not (container-type: inline-size) {
    @media (max-width: 1000px) {
      .aue-body { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 700px) {
      .aue-body { grid-template-columns: 1fr; }
    }
  }
  /* Seams are drawn to the right of and below every cell; the panel's own
     overflow clips the ones that land on its outside edges, so this needs
     no per-column or per-row arithmetic. */
  .aue-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 12px;
    font-size: 13px;
    color: #fff;
    box-shadow:
      1px 0 0 rgba(0, 0, 0, 0.4),
      0 1px 0 rgba(0, 0, 0, 0.4);
    transition: background 0.15s;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
  }
  /* Highlights the row on hover, press, or keyboard focus. */
  .aue-row:hover,
  .aue-row:active,
  .aue-row:focus-within {
    background: linear-gradient(180deg, #525252 0%, #414141 100%);
  }
  /* Down to one column a long label wraps rather than being cropped. The
     line height matches the switch so the first line still sits level with
     it, and the switch stays pinned to that top line. */
  .aue-label {
    line-height: 22px;
  }
  .aue-switch {
    position: relative;
    display: inline-block;
    width: 42px;
    height: 22px;
    flex-shrink: 0;
  }
  .aue-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }
  /* Off state: near-black track, mid-grey knob on the left. */
  .aue-switch .aue-slider {
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
  .aue-switch .aue-slider::before {
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
  .aue-switch input:checked + .aue-slider {
    background: linear-gradient(180deg, #9e9e9e 0%, #6e6e6e 100%);
  }
  .aue-switch input:checked + .aue-slider::before {
    transform: translateX(20px);
    background: linear-gradient(180deg, #4c4c4c 0%, #343434 100%);
  }
  .aue-row:hover .aue-slider,
  .aue-row:active .aue-slider,
  .aue-row:focus-within .aue-slider {
    border-color: #fff;
    background: linear-gradient(180deg, #262626 0%, #141414 100%);
    box-shadow: 0 2px 3px rgba(0, 0, 0, 0.6);
  }
  .aue-row:hover .aue-slider::before,
  .aue-row:active .aue-slider::before,
  .aue-row:focus-within .aue-slider::before {
    background: linear-gradient(180deg, #9a9a9a 0%, #6e6e6e 100%);
  }
  .aue-row:hover input:checked + .aue-slider,
  .aue-row:active input:checked + .aue-slider,
  .aue-row:focus-within input:checked + .aue-slider {
    background: linear-gradient(180deg, #ffffff 0%, #bdbdbd 100%);
  }
  .aue-row:hover input:checked + .aue-slider::before,
  .aue-row:active input:checked + .aue-slider::before,
  .aue-row:focus-within input:checked + .aue-slider::before {
    background: linear-gradient(180deg, #666666 0%, #444444 100%);
  }

  /* ------------------------------------------- items-per-page control */

  /* Sits above the top right of the list it controls. The text colour is
     inherited so it reads correctly in both of Torn's themes; only the
     select carries a colour of its own. */
  .aue-per-page {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 8px;
    margin: 0 0 6px;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    color: inherit;
  }
  .aue-per-page-status {
    font-size: 11px;
    opacity: 0.75;
    font-variant-numeric: tabular-nums;
  }
  /* Plain and readable rather than themed: the open list is drawn by the
     browser on its own white background, so light text vanishes in it.
     Placeholder until these scripts share one dropdown style. */
  .aue-per-page-select {
    padding: 2px 6px;
    border: 1px solid rgba(0, 0, 0, 0.5);
    border-radius: 4px;
    background: #f2f2f2;
    color: #000;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    cursor: pointer;
  }
  .aue-per-page-select option {
    background: #fff;
    color: #000;
  }
`;
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head ?? document.documentElement).appendChild(style);
  }

  // src/autumns-ui-enhancer/panel.ts
  var PREFS_PANEL_SELECTORS = [
    ".preferences-container",
    ".preferences-wrap",
    ".content-wrapper"
  ];
  function findPrefsPanel() {
    for (const selector of PREFS_PANEL_SELECTORS) {
      const element = document.querySelector(selector);
      if (element) return element;
    }
    return null;
  }
  function buildPanel() {
    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    const title = document.createElement("div");
    title.className = "aue-title";
    title.textContent = "Autumn's Scripts";
    panel.appendChild(title);
    const body = document.createElement("div");
    body.className = "aue-body";
    panel.appendChild(body);
    for (const feature of FEATURES) {
      const row = document.createElement("div");
      row.className = "aue-row";
      const label = document.createElement("span");
      label.className = "aue-label";
      label.textContent = feature.label;
      row.appendChild(label);
      const toggle = document.createElement("label");
      toggle.className = "aue-switch";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = isEnabled(feature);
      input.addEventListener("change", () => setEnabled(feature, input.checked));
      toggle.appendChild(input);
      const slider = document.createElement("span");
      slider.className = "aue-slider";
      toggle.appendChild(slider);
      row.appendChild(toggle);
      body.appendChild(row);
    }
    return panel;
  }
  function injectPanel() {
    if (document.getElementById(PANEL_ID)) return;
    const anchor = findPrefsPanel();
    if (!anchor) return;
    injectStyles();
    anchor.insertAdjacentElement("afterend", buildPanel());
  }
  function installPreferencesPanel() {
    injectPanel();
    new MutationObserver(() => injectPanel()).observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // src/autumns-ui-enhancer/index.ts
  var PREFERENCES_PATH = "/preferences.php";
  installPageJumpBlock();
  installRequestCapture();
  function onReady() {
    injectStyles();
    if (location.pathname === PREFERENCES_PATH) {
      installPreferencesPanel();
    } else {
      installListDisplay();
    }
  }
  if (document.body) {
    onReady();
  } else {
    document.addEventListener("DOMContentLoaded", onReady, { once: true });
  }
})();
