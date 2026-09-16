// ==UserScript==
// @name         Autumn's UI Enhancer
// @namespace    https://github.com/autumn-grey
// @version      0.13.2
// @description  Small quality-of-life fixes for Torn's interface: stops filter links jumping the page, adds an items-per-page selector to paged lists, sorts those lists and the wiki's tables by column, adds a light/dark switch to the wiki, scrolls the news ticker with arrows for stepping through the headlines, and offers a send form for anything bought in a shop, prefilled with your usual recipient and the amount you bought. Switched on and off from a panel on the preferences page.
// @author       AutumnGrey
// @license      MIT
// @match        https://www.torn.com/*
// @match        https://wiki.torn.com/*
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
    console.log("[AUE]", ...parts);
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
  var LIST_SORTING = {
    key: "LIST_SORTING",
    label: "Table Sorting",
    note: "applies to displayed results only",
    defaultOn: true
  };
  var NEWS_TICKER = {
    key: "NEWS_TICKER",
    label: "News Ticker Controls",
    defaultOn: true
  };
  var SHOP_SEND = {
    key: "SHOP_SEND",
    label: "Buy Features",
    note: "send option after buying from a shop",
    defaultOn: true
  };
  var RECIPIENT_SETTING = "SEND_RECIPIENT";
  var PANEL_FOOTNOTE = "Dark/Light Mode switch and table sorting in Torn Wiki enabled by default.";
  var FEATURES = [
    PAGE_JUMP_BLOCK,
    LIST_DISPLAY_EXTENSION,
    LIST_SORTING,
    NEWS_TICKER,
    SHOP_SEND
  ];
  function isEnabled(feature) {
    try {
      const stored = localStorage.getItem(SETTING_PREFIX + feature.key);
      if (stored === null) return feature.defaultOn;
      return stored === "1";
    } catch {
      return feature.defaultOn;
    }
  }
  function setEnabled(feature, on3) {
    try {
      localStorage.setItem(SETTING_PREFIX + feature.key, on3 ? "1" : "0");
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
  var NOT_A_LIST = "#sidebarroot, #header-root, .header-wrapper-top, .header-wrapper-bottom, #chatRoot, .content-title, .breadcrumbs";
  var CONTENT_ROOT_SELECTOR = ".content-wrapper, #mainContainer";
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
    if (!START_IN_BODY.test(body)) return false;
    let path;
    try {
      path = new URL(url, location.href).pathname;
    } catch {
      return false;
    }
    if (path !== location.pathname) return false;
    lastRequest = { url, body };
    log("capture: list request for", path, body.replace(/=[^&]*/g, "=*"));
    return true;
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
        const captured = rememberRequest(
          this.__aueUrl ?? location.pathname,
          body
        );
        if (captured) {
          this.addEventListener("loadend", () => onRequestCaptured?.(), {
            once: true
          });
        }
      }
      sendOriginal.call(this, body);
    };
    const fetchOriginal = window.fetch;
    window.fetch = function(...args) {
      const input = args[0];
      const init = args[1];
      const body = init?.body;
      let captured = false;
      if (!ownRequest && typeof body === "string") {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        captured = rememberRequest(url, body);
      }
      const sent = fetchOriginal.apply(this, args);
      if (captured) void sent.then(() => onRequestCaptured?.()).catch(() => {
      });
      return sent;
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
    if (root.closest(NOT_A_LIST)) return null;
    const candidates = [];
    for (const element of root.querySelectorAll(
      ROW_CONTAINER_SELECTOR
    )) {
      if (element.closest(PAGINATION_SELECTOR)) continue;
      if (element.closest(NOT_A_LIST)) continue;
      if (rowsOf(element).length >= 2) candidates.push(element);
    }
    if (candidates.length === 0) return null;
    const full = candidates.filter((c) => rowsOf(c).length >= PAGE_STEP);
    const pool = full.length > 0 ? full : candidates;
    return pool.reduce(
      (best, c) => rowsOf(c).length > rowsOf(best).length ? c : best
    );
  }
  function isSpacer(element) {
    return element.childElementCount === 0 && (element.textContent ?? "").trim() === "";
  }
  function siblingsOf(node) {
    const after = [];
    const before = [];
    for (const [direction, into] of [
      ["nextElementSibling", after],
      ["previousElementSibling", before]
    ]) {
      let sibling = node[direction];
      while (sibling) {
        if (sibling.id !== CONTROL_ID && !isSpacer(sibling)) into.push(sibling);
        sibling = sibling[direction];
      }
    }
    const found = [];
    for (let step = 0; step < Math.max(after.length, before.length); step += 1) {
      const next = after[step];
      const previous = before[step];
      if (next) found.push(next);
      if (previous) found.push(previous);
    }
    return found;
  }
  function findList(widget) {
    let node = widget;
    for (let level = 0; node && node !== document.body && level <= MAX_CLIMB; ) {
      if (node.matches(CONTENT_ROOT_SELECTOR)) break;
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
    let below = null;
    for (const widget of document.querySelectorAll(
      PAGINATION_SELECTOR
    )) {
      if (!widget.querySelector(PAGE_LINK_SELECTOR)) continue;
      const target = findList(widget);
      if (!target) continue;
      const listIsAfterPager = target.pagerBlock.compareDocumentPosition(target.block) & Node.DOCUMENT_POSITION_FOLLOWING;
      if (listIsAfterPager) return target;
      below ?? (below = target);
    }
    return below;
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
  function unhide(element) {
    element.style.removeProperty("display");
  }
  function rewritePager(widget, size) {
    const model = pagerModel(widget, size);
    if (!model) return;
    const state = `${size}:${model.current}:${model.total}`;
    if (widget.getAttribute(PAGER_STATE_ATTR) === state) return;
    log("pager: page", model.current, "of", model.total, "at", size, "per page");
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
    unhide(blank);
    if (blankGap instanceof HTMLElement) unhide(blankGap);
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
    if (!container.isConnected) return;
    const start = currentStart();
    const key = `${start}:${size}`;
    if (filling && filling.key === key && filling.container === container) return;
    const mine = generation;
    filling = { key, container };
    const requests = Math.ceil(size / PAGE_STEP);
    log(
      "fill:",
      have,
      "rows present, want",
      size,
      "-",
      requests - 1,
      "more request(s)"
    );
    const spacer = container.querySelector(`:scope > .${SPACER_CLASS}`);
    try {
      for (let index = 1; index < requests; index += 1) {
        setStatus(`Loading ${index + 1}/${requests}`);
        const rows = await fetchRows(start + index * PAGE_STEP, container);
        if (mine !== generation) {
          log("fill: abandoned, the page moved on");
          return;
        }
        if (!container.isConnected) {
          log("fill: abandoned, Torn replaced the list");
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
      if (filling && filling.container === container && filling.key === key) {
        filling = null;
      }
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

  // src/autumns-ui-enhancer/listSort.ts
  var NOT_A_COLUMN = /* @__PURE__ */ new Set(["clear", "title", "divider"]);
  var MIN_COLUMNS = 2;
  var MIN_ROWS = 2;
  var ALREADY_SORTABLE = ".sortable, .jquery-tablesorter";
  var SETTLE_MS2 = 150;
  var SORTABLE_CLASS = "aue-sort";
  var MARK_CLASS = "aue-sort-mark";
  var ACTIVE_CLASS = "aue-sort-active";
  var DESCENDING_CLASS = "aue-sort-desc";
  var WIRED_ATTR = "data-aue-sort";
  var sorts = /* @__PURE__ */ new WeakMap();
  var writing2 = false;
  function clean(text) {
    return (text ?? "").replace(/\s+/g, " ").trim();
  }
  function numberIn(text) {
    const match = text.replace(/[,$]/g, "").match(/-?\d+(\.\d+)?/);
    return match ? Number(match[0]) : null;
  }
  function isNumericColumn(rows, column) {
    let seen2 = 0;
    for (const row of rows) {
      const text = column.read(row);
      if (text === "") continue;
      if (numberIn(text) === null) return false;
      seen2 += 1;
    }
    return seen2 > 0;
  }
  function keyOf(cell) {
    for (const name of cell.classList) {
      if (!NOT_A_COLUMN.has(name)) return name;
    }
    return null;
  }
  function cellOf(row, key) {
    try {
      return row.querySelector(`.${CSS.escape(key)}`);
    } catch {
      return null;
    }
  }
  function headerCandidates(target) {
    const found = [];
    for (const start of [target.container, target.container.parentElement]) {
      let node = start?.previousElementSibling ?? null;
      while (node) {
        found.push(node);
        node = node.previousElementSibling;
      }
    }
    return found;
  }
  function columnsOf(candidate, rows) {
    const sample = rows.slice(0, 3);
    const columns = [];
    for (const cell of candidate.children) {
      const key = keyOf(cell);
      if (!key) continue;
      if (!sample.some((row) => cellOf(row, key))) continue;
      columns.push({
        id: key,
        cell,
        read: (row) => clean(cellOf(row, key)?.textContent)
      });
    }
    return columns;
  }
  function listSortable() {
    const target = findTarget();
    if (!target) return null;
    const rows = rowsOf(target.container);
    if (rows.length < MIN_ROWS) return null;
    for (const candidate of headerCandidates(target)) {
      if (candidate === target.container) continue;
      const columns = columnsOf(candidate, rows);
      if (columns.length < MIN_COLUMNS) continue;
      const container = target.container;
      return {
        container,
        columns,
        rows: () => rowsOf(container),
        reorder: (sorted) => container.append(...sorted)
      };
    }
    return null;
  }
  function headerRowOf(table) {
    const row = table.tHead?.rows[0] ?? table.rows[0];
    if (!row || row.cells.length < MIN_COLUMNS) return null;
    for (const cell of row.cells) {
      if (cell.tagName !== "TH") return null;
    }
    return row;
  }
  function tableSortable(table) {
    if (table.parentElement?.closest("table")) return null;
    if (table.matches(ALREADY_SORTABLE)) return null;
    const header = headerRowOf(table);
    const container = header?.parentElement;
    if (!header || !container) return null;
    const bodyRows = () => {
      const found = [];
      let node = header.nextElementSibling;
      while (node) {
        if (node.tagName === "TR") found.push(node);
        node = node.nextElementSibling;
      }
      return found;
    };
    if (bodyRows().length < MIN_ROWS) return null;
    const columns = [...header.cells].map((cell, at) => ({
      id: String(at),
      cell,
      read: (row) => clean(row.cells?.[at]?.textContent)
    }));
    return {
      container,
      columns,
      rows: bodyRows,
      reorder: (sorted) => header.after(...sorted)
    };
  }
  function sortables() {
    const found = [];
    const list = listSortable();
    if (list) found.push(list);
    for (const table of document.querySelectorAll("table")) {
      const sortable = tableSortable(table);
      if (sortable) found.push(sortable);
    }
    return found;
  }
  function applyOrder(table) {
    const state = sorts.get(table.container);
    if (!state) return;
    const column = table.columns.find((entry) => entry.id === state.id);
    if (!column) return;
    const rows = table.rows();
    if (rows.length < MIN_ROWS) return;
    const numeric = isNumericColumn(rows, column);
    const direction = state.descending ? -1 : 1;
    const sorted = [...rows].sort((left, right) => {
      const a = column.read(left);
      const b = column.read(right);
      if (a === "" || b === "") return a === b ? 0 : a === "" ? 1 : -1;
      if (numeric) return ((numberIn(a) ?? 0) - (numberIn(b) ?? 0)) * direction;
      return a.localeCompare(b, void 0, { numeric: true }) * direction;
    });
    if (sorted.every((row, at) => row === rows[at])) return;
    writing2 = true;
    table.reorder(sorted);
    writing2 = false;
    log("sort: column", state.id, state.descending ? "descending" : "ascending");
  }
  function paint(table) {
    const state = sorts.get(table.container);
    writing2 = true;
    for (const column of table.columns) {
      const active = state?.id === column.id;
      column.cell.classList.toggle(ACTIVE_CLASS, active);
      column.cell.classList.toggle(DESCENDING_CLASS, active && state.descending);
    }
    writing2 = false;
  }
  function wire(table) {
    writing2 = true;
    for (const column of table.columns) {
      if (!column.cell.querySelector(`.${MARK_CLASS}`)) {
        const mark = document.createElement("span");
        mark.className = MARK_CLASS;
        column.cell.appendChild(mark);
      }
      column.cell.classList.add(SORTABLE_CLASS);
      if (column.cell.getAttribute(WIRED_ATTR) === column.id) continue;
      column.cell.setAttribute(WIRED_ATTR, column.id);
      column.cell.addEventListener("click", (event) => {
        if (!isEnabled(LIST_SORTING)) return;
        event.preventDefault();
        event.stopPropagation();
        const state = sorts.get(table.container);
        sorts.set(table.container, {
          id: column.id,
          descending: state?.id === column.id ? !state.descending : false
        });
        applyOrder(table);
        paint(table);
      });
    }
    writing2 = false;
  }
  function unwire(table) {
    writing2 = true;
    for (const column of table.columns) {
      column.cell.classList.remove(
        SORTABLE_CLASS,
        ACTIVE_CLASS,
        DESCENDING_CLASS
      );
      column.cell.querySelector(`.${MARK_CLASS}`)?.remove();
    }
    writing2 = false;
  }
  function pass() {
    const enabled = isEnabled(LIST_SORTING);
    for (const table of sortables()) {
      if (!enabled) {
        sorts.delete(table.container);
        unwire(table);
        continue;
      }
      wire(table);
      applyOrder(table);
      paint(table);
    }
  }
  function installListSort() {
    let timer = 0;
    const schedule = () => {
      if (writing2) return;
      clearTimeout(timer);
      timer = window.setTimeout(pass, SETTLE_MS2);
    };
    new MutationObserver(schedule).observe(document.body, {
      childList: true,
      subtree: true
    });
    addEventListener("hashchange", schedule);
    schedule();
  }

  // src/autumns-ui-enhancer/newsTicker.ts
  var BAR_SELECTOR = ".header-bottom-text.news-ticker-new";
  var SLIDE_SELECTOR = ".news-ticker-slide";
  var SCROLLER_SELECTOR = ".scroll-wrap";
  var HEADLINE_SELECTOR = ".headline";
  var BAR_CLASS = "aue-ticker-bar";
  var NAV_ID = "aue-ticker-nav";
  var OVERLAY_ID = "aue-ticker-overlay";
  var ACTIVE_SLIDE = /enter-done|enter-active|swiper-slide-active/;
  var MATCH_MIN_LENGTH = 8;
  var MANUAL_CLASS = "aue-ticker-manual";
  var OVERFLOW_SLACK = 4;
  var SCROLL_SPEED = 34;
  var HOLD_MS = 1500;
  var MANUAL_IDLE_MS = 45e3;
  var seen = [];
  var manualIndex = null;
  var manualAt = 0;
  var writing3 = false;
  function isHeadlineList(value) {
    return Array.isArray(value) && value.length > 0 && typeof value[0] === "object" && value[0] !== null && "headline" in value[0];
  }
  function digForList(value, depth) {
    if (isHeadlineList(value)) return value;
    if (!value || typeof value !== "object" || depth > 3) return null;
    if (value instanceof Element) return null;
    let keys;
    try {
      keys = Object.keys(value);
    } catch {
      return null;
    }
    for (const key of keys.slice(0, 30)) {
      let child;
      try {
        child = value[key];
      } catch {
        continue;
      }
      const found = digForList(child, depth + 1);
      if (found) return found;
    }
    return null;
  }
  function readHeadlines(bar) {
    try {
      const key = Object.keys(bar).find(
        (name) => name.startsWith("__reactFiber$")
      );
      if (!key) return null;
      let node = bar[key];
      for (let depth = 0; node && depth < 30; depth += 1) {
        let list = digForList(node.memoizedProps, 0);
        if (!list) {
          let hook = node.memoizedState;
          for (let i = 0; hook && i < 15 && !list; i += 1) {
            list = digForList(hook.memoizedState, 1);
            hook = hook.next;
          }
        }
        if (list) {
          return list.map((item) => ({
            id: String(item.ID ?? item.headline),
            html: String(item.headline ?? ""),
            link: typeof item.link === "string" && item.link ? item.link : null,
            endTime: Number(item.endTime) || 0
          }));
        }
        node = node.return;
      }
    } catch {
    }
    return null;
  }
  function headlines(bar) {
    return readHeadlines(bar) ?? seen;
  }
  function liveHeadline(bar) {
    const slides = Array.from(bar.querySelectorAll(SLIDE_SELECTOR)).reverse();
    const slide = slides.find((item) => ACTIVE_SLIDE.test(item.className));
    return (slide ?? slides[0])?.querySelector(HEADLINE_SELECTOR) ?? bar.querySelector(HEADLINE_SELECTOR);
  }
  function compareText(html) {
    const box = document.createElement("div");
    box.innerHTML = html;
    return (box.textContent ?? "").replace(/[[d:s]+]s*$/, "").replace(/s+/g, " ").trim().toLowerCase();
  }
  function remember(bar) {
    const headline = liveHeadline(bar);
    const html = headline?.innerHTML ?? "";
    if (!html) return;
    const id = headline?.textContent?.trim() ?? html;
    if (seen.some((item) => item.id === id)) return;
    const link = bar.querySelector(`${SLIDE_SELECTOR} a`);
    seen.push({ id, html, link: link?.getAttribute("href") ?? null, endTime: 0 });
  }
  function liveIndex(bar, list) {
    const showing = compareText(liveHeadline(bar)?.innerHTML ?? "");
    if (!showing) return 0;
    const at = list.findIndex((item) => {
      const text = compareText(item.html);
      if (text.length < MATCH_MIN_LENGTH) return text === showing;
      return showing.startsWith(text) || text.startsWith(showing);
    });
    return at === -1 ? 0 : at;
  }
  var scroller = null;
  var scrollKey = "";
  var startedAt = 0;
  var pausedAt = 0;
  var pointerOver = false;
  function marqueeKey(box) {
    return `${box.scrollWidth}:${box.clientWidth}:${box.textContent?.length ?? 0}`;
  }
  function tick(now) {
    requestAnimationFrame(tick);
    const box = scroller;
    if (!box || !box.isConnected) return;
    const distance = box.scrollWidth - box.clientWidth;
    if (distance <= OVERFLOW_SLACK) {
      box.scrollLeft = 0;
      return;
    }
    const key = marqueeKey(box);
    if (key !== scrollKey) {
      scrollKey = key;
      startedAt = now;
      box.scrollLeft = 0;
      return;
    }
    if (pointerOver || document.hidden) {
      pausedAt = pausedAt || now;
      return;
    }
    if (pausedAt) {
      startedAt += now - pausedAt;
      pausedAt = 0;
    }
    const travel = distance / SCROLL_SPEED * 1e3;
    const cycle = 2 * (travel + HOLD_MS);
    const at = (now - startedAt) % cycle;
    if (at < HOLD_MS) box.scrollLeft = 0;
    else if (at < HOLD_MS + travel) {
      box.scrollLeft = distance * (at - HOLD_MS) / travel;
    } else if (at < 2 * HOLD_MS + travel) box.scrollLeft = distance;
    else {
      box.scrollLeft = distance * (1 - (at - 2 * HOLD_MS - travel) / travel);
    }
  }
  function watchScroller(box) {
    if (box === scroller) return;
    scroller = box;
    scrollKey = "";
    pausedAt = 0;
  }
  function buildArrow(step) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `aue-ticker-arrow aue-ticker-arrow-${step === -1 ? "prev" : "next"}`;
    button.setAttribute(
      "aria-label",
      step === -1 ? "Previous headline" : "Next headline"
    );
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      stepBy(step);
    });
    return button;
  }
  function ensureNav(bar) {
    bar.classList.add(BAR_CLASS);
    if (bar.querySelector(`#${NAV_ID}`)) return;
    writing3 = true;
    const nav = document.createElement("div");
    nav.id = NAV_ID;
    nav.appendChild(buildArrow(-1));
    nav.appendChild(buildArrow(1));
    bar.appendChild(nav);
    writing3 = false;
  }
  function stepBy(step) {
    const bar = document.querySelector(BAR_SELECTOR);
    if (!bar) return;
    const list = headlines(bar);
    if (list.length === 0) return;
    const from = manualIndex ?? liveIndex(bar, list);
    manualIndex = (from + step + list.length) % list.length;
    manualAt = Date.now();
    log("ticker: showing headline", manualIndex + 1, "of", list.length);
    render(bar);
  }
  function toLive(bar) {
    manualIndex = null;
    writing3 = true;
    bar.classList.remove(MANUAL_CLASS);
    bar.querySelector(`#${OVERLAY_ID}`)?.remove();
    writing3 = false;
    watchScroller(bar.querySelector(SCROLLER_SELECTOR));
  }
  function countdownText(endTime) {
    const left = Math.max(0, endTime - Math.floor(Date.now() / 1e3));
    const pad = (value) => String(value).padStart(2, "0");
    const days = Math.floor(left / 86400);
    const hours = Math.floor(left % 86400 / 3600);
    return ` [${days}:${pad(hours)}:${pad(Math.floor(left % 3600 / 60))}:${pad(left % 60)}]`;
  }
  function render(bar) {
    const list = headlines(bar);
    if (manualIndex === null || list.length === 0) {
      toLive(bar);
      return;
    }
    const item = list[Math.min(manualIndex, list.length - 1)];
    if (!item) {
      toLive(bar);
      return;
    }
    writing3 = true;
    bar.classList.add(MANUAL_CLASS);
    let overlay = bar.querySelector(`#${OVERLAY_ID}`);
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = OVERLAY_ID;
      bar.appendChild(overlay);
    }
    const text = document.createElement("span");
    text.className = "aue-ticker-text";
    text.innerHTML = item.html;
    if (item.endTime > 0) {
      const countdown = document.createElement("span");
      countdown.className = "aue-ticker-countdown";
      countdown.textContent = countdownText(item.endTime);
      text.appendChild(countdown);
    }
    overlay.replaceChildren(
      item.link ? wrapInLink(text, item.link) : text
    );
    writing3 = false;
    watchScroller(overlay);
  }
  function wrapInLink(text, href) {
    const link = document.createElement("a");
    link.href = href;
    link.className = "aue-ticker-link";
    link.appendChild(text);
    return link;
  }
  function apply2() {
    const bar = document.querySelector(BAR_SELECTOR);
    if (!bar) return;
    if (!isEnabled(NEWS_TICKER)) {
      if (bar.querySelector(`#${NAV_ID}`)) {
        writing3 = true;
        bar.querySelector(`#${NAV_ID}`)?.remove();
        bar.classList.remove(BAR_CLASS);
        writing3 = false;
        toLive(bar);
      }
      watchScroller(null);
      return;
    }
    ensureNav(bar);
    remember(bar);
    if (manualIndex === null) {
      watchScroller(bar.querySelector(SCROLLER_SELECTOR));
    } else if (!bar.querySelector(`#${OVERLAY_ID}`)) {
      render(bar);
    }
  }
  function installNewsTicker() {
    requestAnimationFrame(tick);
    addEventListener(
      "pointerover",
      (event) => {
        const target = event.target;
        pointerOver = target instanceof Element && target.closest(BAR_SELECTOR) !== null;
      },
      true
    );
    addEventListener("pointerleave", () => pointerOver = false, true);
    let timer = 0;
    const schedule = () => {
      if (writing3) return;
      clearTimeout(timer);
      timer = window.setTimeout(apply2, 120);
    };
    new MutationObserver(schedule).observe(document.body, {
      childList: true,
      subtree: true
    });
    setInterval(() => {
      const bar = document.querySelector(BAR_SELECTOR);
      if (!bar || manualIndex === null) return;
      if (Date.now() - manualAt > MANUAL_IDLE_MS) {
        log("ticker: idle, back to Torn's rotation");
        toLive(bar);
        return;
      }
      const list = headlines(bar);
      const item = list[Math.min(manualIndex, list.length - 1)];
      const countdown = bar.querySelector(`#${OVERLAY_ID} .aue-ticker-countdown`);
      if (item && item.endTime > 0 && countdown) {
        countdown.textContent = countdownText(item.endTime);
      }
    }, 1e3);
    apply2();
  }

  // src/autumns-ui-enhancer/pageJumpBlock.ts
  var SUPPRESS_MS = 1e3;
  var navigationUntil = 0;
  var clickUntil = 0;
  var clicked = null;
  function on() {
    return isEnabled(PAGE_JUMP_BLOCK);
  }
  function suppressingNavigation() {
    return Date.now() < navigationUntil && on();
  }
  function suppressingClick(target) {
    if (Date.now() >= clickUntil || !on()) return false;
    if (clicked && (target.contains(clicked) || clicked.contains(target))) {
      return false;
    }
    return true;
  }
  function armNavigation() {
    navigationUntil = Date.now() + SUPPRESS_MS;
  }
  function armClick(target) {
    clicked = target;
    clickUntil = Date.now() + SUPPRESS_MS;
  }
  function isSamePage(url) {
    if (typeof url !== "string") return false;
    try {
      return new URL(url, location.href).pathname === location.pathname;
    } catch {
      return false;
    }
  }
  function isHashLink(href) {
    return typeof href === "string" && href.length > 1 && href[0] === "#";
  }
  function onClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    armClick(target);
    if (isHashLink(target.closest("a")?.getAttribute("href"))) armNavigation();
  }
  function patchHistory(name) {
    const original = history[name];
    history[name] = function(...args) {
      if (isSamePage(args[2])) armNavigation();
      return original.apply(this, args);
    };
  }
  function patchScrollIntoView() {
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function(...args) {
      if (suppressingNavigation() || suppressingClick(this)) return;
      original.apply(this, args);
    };
  }
  function patchWindowScrolling() {
    for (const name of ["scrollTo", "scroll", "scrollBy"]) {
      const original = window[name];
      if (typeof original !== "function") continue;
      window[name] = function(...args) {
        if (suppressingNavigation()) return;
        original.apply(this, args);
      };
    }
  }
  function installPageJumpBlock() {
    addEventListener("click", onClick, true);
    addEventListener("hashchange", armNavigation, true);
    addEventListener("popstate", armNavigation, true);
    patchHistory("pushState");
    patchHistory("replaceState");
    patchScrollIntoView();
    patchWindowScrolling();
  }

  // src/autumns-ui-enhancer/styles.ts
  var STYLE_ID = "aue-styles";
  var PANEL_ID = "aue-prefs-panel";
  var CSS2 = `

  #${PANEL_ID} {
    container-type: inline-size;
    margin: 10px 0 0;
    border-radius: 5px;
    overflow: hidden;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    font-family: Arial, Helvetica, sans-serif;
    color: #fff;
  }
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
  .aue-body {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    background: linear-gradient(180deg, #656565 0%, #373737 100%);
  }
  @container (max-width: 620px) {
    .aue-body { grid-template-columns: repeat(2, 1fr); }
  }
  @container (max-width: 400px) {
    .aue-body { grid-template-columns: 1fr; }
  }
  @supports not (container-type: inline-size) {
    @media (max-width: 1000px) {
      .aue-body { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 700px) {
      .aue-body { grid-template-columns: 1fr; }
    }
  }
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
  .aue-row:hover,
  .aue-row:active,
  .aue-row:focus-within {
    background: linear-gradient(180deg, #525252 0%, #414141 100%);
  }
  .aue-label {
    line-height: 22px;
  }
  .aue-note {
    display: block;
    margin-top: -4px;
    font-size: 11px;
    line-height: 14px;
    opacity: 0.7;
  }
  .aue-footnote {
    padding: 6px 12px;
    background: linear-gradient(180deg, #3a3a3a 0%, #2e2e2e 100%);
    box-shadow: inset 0 1px 0 rgba(0, 0, 0, 0.4);
    font-size: 11px;
    line-height: 15px;
    color: #fff;
    opacity: 0.75;
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

  .aue-sort {
    position: relative;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .aue-sort-mark {
    position: absolute;
    right: 3px;
    top: 50%;
    margin-top: -2px;
    width: 0;
    height: 0;
    border-left: 4px solid transparent;
    border-right: 4px solid transparent;
    border-bottom: 5px solid currentColor;
    opacity: 0;
    transition: opacity 0.15s;
    pointer-events: none;
  }
  .aue-sort-active .aue-sort-mark {
    opacity: 1;
  }
  .aue-sort:hover .aue-sort-mark {
    opacity: 0.5;
  }
  .aue-sort-active:hover .aue-sort-mark {
    opacity: 1;
  }
  .aue-sort-desc .aue-sort-mark {
    transform: rotate(180deg);
  }

  .aue-ticker-bar {
    position: relative;
  }
  .aue-ticker-bar .header-swiper-container {
    box-sizing: border-box;
    padding-right: 38px;
  }
  .aue-ticker-manual > *:not(#aue-ticker-overlay):not(#aue-ticker-nav) {
    visibility: hidden;
  }

  #aue-ticker-nav {
    position: absolute;
    right: 4px;
    top: 0;
    bottom: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .aue-ticker-arrow {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 100%;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    cursor: pointer;
    transition: color 0.15s;
    -webkit-tap-highlight-color: transparent;
  }
  .aue-ticker-arrow:hover,
  .aue-ticker-arrow:active,
  .aue-ticker-arrow:focus-visible {
    color: #fff;
  }
  .aue-ticker-arrow::before {
    content: "";
    width: 0;
    height: 0;
    border-top: 5px solid transparent;
    border-bottom: 5px solid transparent;
  }
  .aue-ticker-arrow-prev::before {
    border-right: 7px solid currentColor;
  }
  .aue-ticker-arrow-next::before {
    border-left: 7px solid currentColor;
  }

  #aue-ticker-overlay {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    right: 38px;
    z-index: 1;
    display: flex;
    align-items: center;
    overflow: hidden;
    white-space: nowrap;
  }
  #aue-ticker-overlay .aue-ticker-link {
    color: inherit;
    text-decoration: none;
  }
  #aue-ticker-overlay .aue-ticker-text {
    white-space: nowrap;
  }
  .aue-field {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  .aue-input {
    width: 76px;
    padding: 2px 6px;
    border: 1px solid rgba(0, 0, 0, 0.5);
    border-radius: 4px;
    background: #f2f2f2;
    color: #000;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
  }
  .aue-field-link {
    color: #a9d1ff;
    font-size: 11px;
    text-decoration: none;
  }
  .aue-field-link:hover {
    text-decoration: underline;
  }

  .aue-send {
    margin: 4px 0 6px;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
  }
  .aue-send-btn {
    height: 22px;
    padding: 0 12px;
    line-height: 22px;
    font-size: 11px;
    cursor: pointer;
  }
  .aue-send-body {
    border: 1px solid rgba(0, 0, 0, 0.5);
    border-radius: 4px;
    background: #111;
    overflow: hidden;
  }
  .aue-send-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 4px 8px;
    background: linear-gradient(180deg, #4e565e 0%, #303840 100%);
    color: #fff;
  }
  .aue-send-link {
    color: #a9d1ff;
    text-decoration: none;
    font-size: 11px;
  }
  .aue-send-link:hover {
    text-decoration: underline;
  }
  .aue-send-close {
    border: 0;
    padding: 0 4px;
    background: none;
    color: #fff;
    font-size: 12px;
    line-height: 1;
    cursor: pointer;
  }
  .aue-send-status {
    padding: 6px 8px;
    color: #ccc;
    font-size: 11px;
  }
  .aue-send-frame {
    display: block;
    width: 100%;
    height: 320px;
    border: 0;
    background: #111;
  }
`;
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS2;
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
  function buildRecipientRow() {
    const row = document.createElement("div");
    row.className = "aue-row";
    const label = document.createElement("span");
    label.className = "aue-label";
    label.textContent = "Item Recipient Default";
    const note = document.createElement("span");
    note.className = "aue-note";
    note.textContent = "user ID, filled in for you when sending";
    label.appendChild(note);
    row.appendChild(label);
    const field = document.createElement("span");
    field.className = "aue-field";
    row.appendChild(field);
    const input = document.createElement("input");
    input.className = "aue-input";
    input.type = "text";
    input.inputMode = "numeric";
    input.placeholder = "none";
    input.value = readSetting(RECIPIENT_SETTING, "");
    field.appendChild(input);
    const lookup = document.createElement("a");
    lookup.className = "aue-field-link";
    lookup.target = "_blank";
    lookup.rel = "noopener";
    lookup.textContent = "check";
    field.appendChild(lookup);
    const refresh = () => {
      lookup.href = "https://www.torn.com/profiles.php?XID=" + input.value;
      lookup.hidden = input.value === "";
    };
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D+/g, "");
      writeSetting(RECIPIENT_SETTING, input.value);
      refresh();
    });
    refresh();
    return row;
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
      if (feature.note) {
        const note = document.createElement("span");
        note.className = "aue-note";
        note.textContent = feature.note;
        label.appendChild(note);
      }
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
    body.appendChild(buildRecipientRow());
    const footnote = document.createElement("div");
    footnote.className = "aue-footnote";
    footnote.textContent = PANEL_FOOTNOTE;
    panel.appendChild(footnote);
    return panel;
  }
  function placePanel() {
    const anchor = findPrefsPanel();
    if (!anchor) return;
    const existing = document.getElementById(PANEL_ID);
    if (existing) {
      if (existing.previousElementSibling !== anchor) {
        anchor.insertAdjacentElement("afterend", existing);
      }
      return;
    }
    injectStyles();
    anchor.insertAdjacentElement("afterend", buildPanel());
  }
  function installPreferencesPanel() {
    placePanel();
    new MutationObserver(() => placePanel()).observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // src/autumns-ui-enhancer/shopSend.ts
  var SHOP_PATHS = ["/shops.php", "/bigalgunshop.php"];
  var ITEMS_URL = "https://www.torn.com/item.php";
  var ITEM_ATTR = "data-aue-item";
  var AMOUNT_ATTR = "data-aue-amount";
  var MARKED_ATTR = "data-aue-send";
  var BOUGHT_TEXT = /\byou (?:bought|purchased|have bought)\b/i;
  var BOUGHT_AMOUNT = /\byou (?:bought|purchased|have bought)\s+(?:a|an|the)?\s*([\d,]+)\s*x?\b/i;
  var MESSAGE_MAX_LENGTH = 300;
  var ITEM_IMAGE = /\/items\/(\d+)\//;
  var ANCESTOR_LIMIT = 6;
  var FRAME_READY_MS = 2e4;
  var POLL_MS = 250;
  var FILL_DELAY_MS = 300;
  var ROW_SELECTOR = "li, tr";
  var SEND_SELECTORS = [
    "[aria-label='Send' i]",
    "[title='Send' i]",
    "a[href*='send' i]",
    "[class*='send' i]"
  ];
  var USER_FIELD_SELECTOR = "input[name*='user' i], input[placeholder*='user' i], input[id*='user' i]";
  var AMOUNT_FIELD_SELECTOR = "input[name*='amount' i], input[placeholder*='amount' i], input[id*='amount' i], input[type='number']";
  var TEXT_FIELD_SELECTOR = "input[type='text'], input[type='number'], input:not([type])";
  var FRAME_CSS = `
  #sidebarroot,
  #header-root,
  .header-wrapper-top,
  .header-wrapper-bottom,
  #chatRoot,
  #footer,
  .footer,
  .content-title,
  .links-top-wrap,
  .breadcrumbs,
  .ad-wrapper {
    display: none !important;
  }
  body { background: #111 !important; }
`;
  function on2() {
    return isEnabled(SHOP_SEND);
  }
  function itemIdIn(scope) {
    const tagged = scope.matches("[data-item], [data-itemid]") ? scope : scope.querySelector("[data-item], [data-itemid]");
    const attribute = tagged?.getAttribute("data-item") ?? tagged?.getAttribute("data-itemid") ?? null;
    if (attribute && /^\d+$/.test(attribute)) return attribute;
    const image = scope.querySelector("img[src*='/items/']");
    const match = ITEM_IMAGE.exec(image?.getAttribute("src") ?? "");
    return match?.[1] ?? null;
  }
  function itemIdFor(message) {
    let node = message;
    for (let depth = 0; node && depth < ANCESTOR_LIMIT; depth += 1) {
      const id = itemIdIn(node);
      if (id) return id;
      node = node.parentElement;
    }
    return null;
  }
  function findRow(doc, itemId) {
    const tagged = doc.querySelector(
      `[data-item="${itemId}"], [data-itemid="${itemId}"]`
    );
    if (tagged) return tagged.closest(ROW_SELECTOR) ?? tagged;
    const images = doc.querySelectorAll("img[src*='/items/']");
    for (const image of images) {
      const match = ITEM_IMAGE.exec(image.getAttribute("src") ?? "");
      if (match && match[1] === itemId) {
        return image.closest(ROW_SELECTOR) ?? image.parentElement;
      }
    }
    return null;
  }
  function findSendControl(row) {
    for (const selector of SEND_SELECTORS) {
      const control = row.querySelector(selector);
      if (control) return control;
    }
    return null;
  }
  function defaultRecipient() {
    return readSetting(RECIPIENT_SETTING, "").replace(/\D+/g, "");
  }
  function amountBought(message) {
    const match = BOUGHT_AMOUNT.exec(message.textContent ?? "");
    const amount = match?.[1]?.replace(/,/g, "") ?? "";
    return /^[1-9]\d*$/.test(amount) ? amount : null;
  }
  function fillField(input, value) {
    const view = input.ownerDocument.defaultView;
    const setter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(input),
      "value"
    )?.set;
    if (setter) {
      setter.call(input, value);
    } else {
      input.value = value;
    }
    const EventClass = view?.Event ?? Event;
    input.dispatchEvent(new EventClass("input", { bubbles: true }));
    input.dispatchEvent(new EventClass("change", { bubbles: true }));
  }
  function sendFormScope(row) {
    if (row.querySelector(TEXT_FIELD_SELECTOR)) return row;
    const next = row.nextElementSibling;
    if (next?.querySelector(TEXT_FIELD_SELECTOR)) return next;
    return row;
  }
  function fillSendForm(row, amount) {
    const scope = sendFormScope(row);
    const boxes = Array.from(
      scope.querySelectorAll(TEXT_FIELD_SELECTOR)
    ).filter((box) => !box.disabled && !box.readOnly);
    if (boxes.length === 0) return;
    const recipient = defaultRecipient();
    const userBox = scope.querySelector(USER_FIELD_SELECTOR) ?? boxes[0];
    const amountBox = scope.querySelector(AMOUNT_FIELD_SELECTOR) ?? (boxes[1] === userBox ? boxes[0] : boxes[1]);
    if (recipient && userBox && userBox.value === "") {
      fillField(userBox, recipient);
      log("send: recipient", recipient);
    }
    if (amount && amountBox && amountBox !== userBox) {
      fillField(amountBox, amount);
      log("send: amount", amount);
    }
  }
  function sendFormOpen(row) {
    return row.querySelector("input[type='text'], input[type='number']") !== null;
  }
  function styleFrame(doc) {
    if (doc.getElementById("aue-send-frame-styles")) return;
    const style = doc.createElement("style");
    style.id = "aue-send-frame-styles";
    style.textContent = FRAME_CSS;
    (doc.head ?? doc.documentElement).appendChild(style);
  }
  function openInFrame(frame, itemId, amount, status) {
    const started = Date.now();
    const attempt = () => {
      let doc = null;
      try {
        doc = frame.contentDocument;
      } catch {
        doc = null;
      }
      const expired = Date.now() - started >= FRAME_READY_MS;
      if (!doc || !doc.body) {
        if (!expired) {
          setTimeout(attempt, POLL_MS);
          return;
        }
        status.textContent = "Torn would not show your items here - use the link above.";
        log("send: the items page never loaded in the frame");
        return;
      }
      styleFrame(doc);
      const row = findRow(doc, itemId);
      if (!row) {
        if (!expired) {
          setTimeout(attempt, POLL_MS);
          return;
        }
        status.textContent = "Couldn't find that item in the panel below - scroll to it there.";
        log("send: item", itemId, "not found on the items page");
        return;
      }
      if (!sendFormOpen(row)) findSendControl(row)?.click();
      setTimeout(() => fillSendForm(row, amount), FILL_DELAY_MS);
      const view = frame.contentWindow;
      if (view) {
        const top = row.getBoundingClientRect().top + view.scrollY - 6;
        view.scrollTo(0, Math.max(0, top));
      }
      status.hidden = true;
      log("send: showing item", itemId);
    };
    attempt();
  }
  function buildFrame(itemId, amount, status) {
    const frame = document.createElement("iframe");
    frame.className = "aue-send-frame";
    frame.src = ITEMS_URL;
    frame.addEventListener(
      "load",
      () => openInFrame(frame, itemId, amount, status)
    );
    return frame;
  }
  function buildPanel2(itemId, amount) {
    const panel = document.createElement("div");
    panel.className = "aue-send";
    panel.setAttribute(ITEM_ATTR, itemId);
    if (amount) panel.setAttribute(AMOUNT_ATTR, amount);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "torn-btn aue-send-btn";
    button.textContent = "Send this item";
    panel.appendChild(button);
    const body = document.createElement("div");
    body.className = "aue-send-body";
    body.hidden = true;
    panel.appendChild(body);
    const bar = document.createElement("div");
    bar.className = "aue-send-bar";
    body.appendChild(bar);
    const link = document.createElement("a");
    link.className = "aue-send-link";
    link.href = ITEMS_URL;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Open items page";
    bar.appendChild(link);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "aue-send-close";
    close.textContent = "X";
    close.setAttribute("aria-label", "Close");
    bar.appendChild(close);
    const status = document.createElement("div");
    status.className = "aue-send-status";
    body.appendChild(status);
    return panel;
  }
  function openPanel(panel) {
    const button = panel.querySelector(".aue-send-btn");
    const body = panel.querySelector(".aue-send-body");
    const status = panel.querySelector(".aue-send-status");
    const itemId = panel.getAttribute(ITEM_ATTR);
    if (!button || !body || !status || !itemId) return;
    button.hidden = true;
    body.hidden = false;
    status.hidden = false;
    status.textContent = "Loading your items...";
    if (!body.querySelector("iframe")) {
      const amount = panel.getAttribute(AMOUNT_ATTR);
      body.appendChild(buildFrame(itemId, amount, status));
    }
    log("send: opened item", itemId);
  }
  function closePanel(panel) {
    const button = panel.querySelector(".aue-send-btn");
    const body = panel.querySelector(".aue-send-body");
    if (!button || !body) return;
    body.hidden = true;
    body.querySelector("iframe")?.remove();
    button.hidden = false;
  }
  function installClicks() {
    document.addEventListener(
      "click",
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const panel = target.closest(".aue-send");
        if (!panel) return;
        const opening = target.closest(".aue-send-btn") !== null;
        if (!opening && !target.closest(".aue-send-close")) return;
        event.preventDefault();
        event.stopPropagation();
        if (opening) openPanel(panel);
        else closePanel(panel);
      },
      true
    );
  }
  function isPurchaseMessage(element) {
    if (element.hasAttribute(MARKED_ATTR)) return false;
    if (element.closest(".aue-send")) return false;
    const text = element.textContent ?? "";
    return text.length <= MESSAGE_MAX_LENGTH && BOUGHT_TEXT.test(text);
  }
  function offerSend(message) {
    message.setAttribute(MARKED_ATTR, "1");
    const itemId = itemIdFor(message);
    if (!itemId) {
      log("send: no item id near", message);
      return;
    }
    message.insertAdjacentElement(
      "afterend",
      buildPanel2(itemId, amountBought(message))
    );
  }
  function scan(root) {
    const found = [];
    if (isPurchaseMessage(root)) found.push(root);
    for (const element of root.querySelectorAll("*")) {
      if (isPurchaseMessage(element)) found.push(element);
    }
    for (const message of found) {
      if (found.some((other) => other !== message && message.contains(other))) {
        continue;
      }
      offerSend(message);
    }
  }
  function installShopSend() {
    if (!on2()) return;
    installClicks();
    scan(document.body);
    new MutationObserver((records) => {
      if (!on2()) return;
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element) scan(node);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  // src/autumns-ui-enhancer/wikiTheme.ts
  var THEME_SETTING = "WIKI_THEME";
  var DARK_CLASS = "aue-wiki-dark";
  var STYLE_ID2 = "aue-wiki-theme";
  var BUTTON_ID = "aue-wiki-theme-switch";
  var CSS3 = `
  html.${DARK_CLASS} {
    color-scheme: dark;
  }
  html.${DARK_CLASS} body {
    background: #17181a !important;
    color: #c9c8c2 !important;
  }
  html.${DARK_CLASS} .side-panel-wrapper,
  html.${DARK_CLASS} .card,
  html.${DARK_CLASS} .torn-navigation-header {
    background: #1f2124 !important;
    border-color: #34383c !important;
  }
  html.${DARK_CLASS} .content-area-wrapper {
    background: #1b1d1f !important;
  }
  html.${DARK_CLASS} #mw-content-text,
  html.${DARK_CLASS} .mw-parser-output,
  html.${DARK_CLASS} .mw-body-content,
  html.${DARK_CLASS} #catlinks,
  html.${DARK_CLASS} #toc,
  html.${DARK_CLASS} .toc {
    color: #c9c8c2 !important;
    background: transparent !important;
  }
  html.${DARK_CLASS} #catlinks {
    background: #1f2124 !important;
    border-color: #34383c !important;
  }
  html.${DARK_CLASS} a,
  html.${DARK_CLASS} #mw-content-text a {
    color: #62b0f5 !important;
  }
  html.${DARK_CLASS} a.new,
  html.${DARK_CLASS} #mw-content-text a.new {
    color: #ff7f7f !important;
  }
  html.${DARK_CLASS} .torn-title-text,
  html.${DARK_CLASS} .torn-title-text span {
    color: #e4e4e4 !important;
  }
  html.${DARK_CLASS} .torn-back-button {
    color: #9aa0a6 !important;
  }
  html.${DARK_CLASS} table.wikitable,
  html.${DARK_CLASS} table.wikitable td,
  html.${DARK_CLASS} table.wikitable th {
    border-color: #3b4650 !important;
    color: #c9c8c2 !important;
  }
  html.${DARK_CLASS} table.wikitable th {
    background: #253039 !important;
    color: #dfe7ee !important;
  }
  html.${DARK_CLASS} table.wikitable tr {
    background: #1b1d1f !important;
  }
  html.${DARK_CLASS} table.wikitable tr:nth-of-type(even) {
    background: #212427 !important;
  }
  html.${DARK_CLASS} table.wikitable td {
    background: transparent !important;
  }
  html.${DARK_CLASS} input,
  html.${DARK_CLASS} textarea,
  html.${DARK_CLASS} select {
    background: #26292c !important;
    color: #c9c8c2 !important;
    border-color: #3b4046 !important;
  }
  html.${DARK_CLASS} input::placeholder {
    color: #85888c !important;
  }
  html.${DARK_CLASS} pre,
  html.${DARK_CLASS} code,
  html.${DARK_CLASS} .mw-code {
    background: #232629 !important;
    color: #d3d2cc !important;
    border-color: #3b4046 !important;
  }
  html.${DARK_CLASS} hr {
    border-color: #34383c !important;
  }
  html.${DARK_CLASS} #torn-back-to-top {
    background: #26292c !important;
    border-color: #3b4046 !important;
  }
  html.${DARK_CLASS} .nav-menu-mobile-switch {
    background: rgba(90, 94, 98, 0.55) !important;
  }

  #${BUTTON_ID} {
    position: fixed;
    top: 6px;
    left: 6px;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid rgba(0, 0, 0, 0.25);
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.75);
    color: #55575a;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
    -webkit-tap-highlight-color: transparent;
  }
  html.${DARK_CLASS} #${BUTTON_ID} {
    border-color: rgba(255, 255, 255, 0.2);
    background: rgba(38, 41, 44, 0.85);
    color: #c9c8c2;
  }
  #${BUTTON_ID}:hover,
  #${BUTTON_ID}:active,
  #${BUTTON_ID}:focus-visible {
    color: #fff;
    border-color: #fff;
    background: rgba(38, 41, 44, 0.9);
  }
  #${BUTTON_ID} svg {
    width: 16px;
    height: 16px;
    display: block;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
  }
`;
  var MOON = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16 12.2A6.6 6.6 0 0 1 7.8 4 6.6 6.6 0 1 0 16 12.2Z"/></svg>`;
  var SUN = `<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.6"/><path d="M10 1.6v2.2M10 16.2v2.2M18.4 10h-2.2M3.8 10H1.6M15.9 4.1l-1.6 1.6M5.7 14.3l-1.6 1.6M15.9 15.9l-1.6-1.6M5.7 5.7 4.1 4.1"/></svg>`;
  function systemTheme() {
    try {
      return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {
      return "light";
    }
  }
  function currentTheme() {
    const stored = readSetting(THEME_SETTING, "");
    return stored === "dark" || stored === "light" ? stored : systemTheme();
  }
  function applyTheme(theme) {
    document.documentElement.classList.toggle(DARK_CLASS, theme === "dark");
    const button = document.getElementById(BUTTON_ID);
    if (button) paintButton(button, theme);
  }
  function paintButton(button, theme) {
    const toDark = theme === "light";
    button.innerHTML = toDark ? MOON : SUN;
    const label = toDark ? "Switch to dark mode" : "Switch to light mode";
    button.setAttribute("aria-label", label);
    button.title = label;
  }
  function injectStyle() {
    if (document.getElementById(STYLE_ID2)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID2;
    style.textContent = CSS3;
    (document.head ?? document.documentElement).appendChild(style);
  }
  function addButton() {
    if (!document.body || document.getElementById(BUTTON_ID)) return;
    const button = document.createElement("button");
    button.type = "button";
    button.id = BUTTON_ID;
    paintButton(button, currentTheme());
    button.addEventListener("click", () => {
      const next = currentTheme() === "dark" ? "light" : "dark";
      writeSetting(THEME_SETTING, next);
      applyTheme(next);
    });
    document.body.appendChild(button);
  }
  function installWikiTheme() {
    injectStyle();
    applyTheme(currentTheme());
    if (document.body) {
      addButton();
    } else {
      document.addEventListener("DOMContentLoaded", addButton, { once: true });
    }
  }

  // src/autumns-ui-enhancer/index.ts
  var PREFERENCES_PATH = "/preferences.php";
  var GAME_HOST = "www.torn.com";
  var onGame = location.hostname === GAME_HOST;
  if (onGame) {
    installPageJumpBlock();
    installRequestCapture();
  } else {
    installWikiTheme();
  }
  function onReady() {
    injectStyles();
    if (!onGame) {
      installListSort();
      return;
    }
    installNewsTicker();
    if (location.pathname === PREFERENCES_PATH) {
      installPreferencesPanel();
      return;
    }
    if (SHOP_PATHS.includes(location.pathname)) installShopSend();
    installListDisplay();
    installListSort();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady, { once: true });
  } else {
    onReady();
  }
})();
