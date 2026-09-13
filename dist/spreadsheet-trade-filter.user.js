// ==UserScript==
// @name         Spreadsheet Trade Filter
// @namespace    https://github.com/autumn-grey
// @version      1.0.1
// @description  Adds a max button beside every quantity box on the trade item list, and outlines the items that appear on your source spreadsheet.
// @author       AutumnGrey
// @license      MIT
// @match        https://www.torn.com/trade.php*
// @grant        GM_xmlhttpRequest
// @connect      *
// @run-at       document-idle
// @noframes     true
// @downloadURL  https://raw.githubusercontent.com/autumn-grey/tornScripts/main/dist/spreadsheet-trade-filter.user.js
// @updateURL    https://raw.githubusercontent.com/autumn-grey/tornScripts/main/dist/spreadsheet-trade-filter.user.js
// ==/UserScript==

"use strict";
(() => {
  // src/spreadsheet-trade-filter/debug.ts
  var DEBUG_KEY = "STF_DEBUG";
  function debugging() {
    try {
      return localStorage.getItem(DEBUG_KEY) === "1";
    } catch {
      return false;
    }
  }
  function log(...parts) {
    if (!debugging()) return;
    console.debug("[STF]", ...parts);
  }

  // src/spreadsheet-trade-filter/items.ts
  var ITEM_IMAGE = 'img[alt][src*="/images/items/"]';
  var ROW = "li, tr";
  var NAME = ".name-wrap .t-overflow";
  var AMOUNT_HELD = ".item-amount";
  var AMOUNT_IN_NAME = /\bx\s?([\d,]+)\b/;
  var QTY_INPUT = [
    'input[type="text"][name="amount"]',
    'input[type="text"][placeholder*="qty" i]',
    'input[type="text"][placeholder*="quantity" i]',
    'input[type="number"][name="amount"]',
    'input[type="number"][placeholder*="qty" i]'
  ].join(", ");
  var MAX_WALK_DEPTH = 8;
  function findRow(image) {
    const row = image.closest(ROW);
    if (row) return row;
    let node = image.parentElement;
    for (let depth = 0; node && depth < MAX_WALK_DEPTH; depth++) {
      if (node.querySelector(QTY_INPUT)) return node;
      node = node.parentElement;
    }
    return null;
  }
  function parseAmount(text) {
    if (!text) return null;
    const value = Number(text.replace(/,/g, "").trim());
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  function findName(row, image) {
    const displayed = row.querySelector(NAME)?.textContent?.trim();
    if (displayed) return displayed;
    const alt = image.getAttribute("alt")?.trim() ?? "";
    return alt.replace(AMOUNT_IN_NAME, "").trim();
  }
  function findAmount(row) {
    const beneathThumbnail = parseAmount(row.querySelector(AMOUNT_HELD)?.textContent);
    if (beneathThumbnail !== null) return beneathThumbnail;
    const written = AMOUNT_IN_NAME.exec(row.querySelector(".name-wrap")?.textContent ?? "");
    return parseAmount(written?.[1]);
  }
  function findQtyInput(row) {
    const input = row.querySelector(QTY_INPUT);
    if (!input) return null;
    if (input.disabled || input.readOnly) return null;
    if (!input.offsetParent) return null;
    return input;
  }
  function readRows() {
    const rows = [];
    const seen = /* @__PURE__ */ new Set();
    for (const image of document.querySelectorAll(ITEM_IMAGE)) {
      const element = findRow(image);
      if (!element || seen.has(element)) continue;
      seen.add(element);
      const name = findName(element, image);
      if (!name) continue;
      rows.push({
        element,
        name,
        amount: findAmount(element),
        qtyInput: findQtyInput(element)
      });
    }
    log(`read ${rows.length} item rows`);
    return rows;
  }

  // src/spreadsheet-trade-filter/styles.ts
  var STYLE_ID = "stf-styles";
  var PANEL_ID = "stf-panel";
  var COLLAPSED_CLASS = "stf-collapsed";
  var MAX_BUTTON_CLASS = "stf-max";
  var QTY_WRAP_CLASS = "stf-qty-wrap";
  var HAS_MAX_CLASS = "stf-has-max";
  var ON_SHEET_CLASS = "stf-on-sheet";
  var CSS = `
  /* ------------------------------------------------------ source panel */

  #${PANEL_ID} {
    margin: 0 0 10px;
    border-radius: 5px;
    overflow: hidden;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    font-family: Arial, Helvetica, sans-serif;
    color: #fff;
  }
  .stf-title {
    display: flex;
    align-items: center;
    gap: 7px;
    cursor: pointer;
    user-select: none;
    height: 30px;
    line-height: 30px;
    padding: 0 0 0 10px;
    background: linear-gradient(180deg, #4e565e 0%, #303840 100%);
    font-weight: bold;
    font-size: 12px;
    color: #fff;
    text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
  }
  .stf-caret {
    font-size: 10px;
    line-height: 1;
    transition: transform 0.15s ease;
  }
  .${COLLAPSED_CLASS} .stf-caret {
    transform: rotate(-90deg);
  }
  .${COLLAPSED_CLASS} .stf-body {
    display: none;
  }
  .stf-body {
    background: linear-gradient(180deg, #656565 0%, #373737 100%);
    padding: 10px 12px;
  }
  .stf-field-label {
    display: block;
    margin: 0 0 5px;
    font-size: 13px;
    line-height: 18px;
    color: #fff;
  }
  .stf-text-input {
    box-sizing: border-box;
    width: 100%;
    max-width: 560px;
    padding: 4px 7px;
    border: 1px solid rgba(0, 0, 0, 0.5);
    border-radius: 4px;
    background: #f2f2f2;
    color: #000;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    line-height: 18px;
  }
  .stf-text-input:focus {
    outline: none;
    border-color: #fff;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.6);
  }
  .stf-status {
    margin: 4px 0 0;
    font-size: 11px;
    line-height: 15px;
    font-weight: bold;
    text-shadow: 0 1px 1px rgba(0, 0, 0, 0.6);
  }
  .stf-status-ok      { color: #5ed17c; }
  .stf-status-error   { color: #ff6b6b; }
  .stf-status-working { color: #d6d6d6; font-weight: normal; }
  .stf-hint {
    margin: 4px 0 0;
    font-size: 11px;
    line-height: 15px;
    color: #d0d0d0;
  }

  /* -------------------------------------------------------- max button */

  /* Paint, font and border come from Torn's own torn-btn; only the size is
     ours, because a full-size button does not fit the row. */
  .${MAX_BUTTON_CLASS} {
    box-sizing: border-box;
    width: auto;
    min-width: 0;
    height: 22px;
    line-height: 20px;
    margin: 0;
    padding: 0 7px;
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
  }

  /* Other scripts write their own price text into this column and position
     it against the right edge, where the button now is. */
  .${HAS_MAX_CLASS} .tt-item-price {
    margin-right: 48px;
  }

  /* Against the left edge of the quantity box, centred on it. */
  .${QTY_WRAP_CLASS} {
    position: relative;
  }
  .${QTY_WRAP_CLASS} > .${MAX_BUTTON_CLASS} {
    position: absolute;
    right: 100%;
    top: 50%;
    transform: translateY(-50%);
    margin-right: 2px;
  }
  /* Only when Torn's own button styling is not there to be borrowed. */
  .${MAX_BUTTON_CLASS}:not(.torn-btn) {
    border: 1px solid #1c2228;
    border-radius: 3px;
    background: linear-gradient(180deg, #5b646d 0%, #333b43 100%);
    color: #fff;
    font-family: "Fjalla One", "Arial Narrow", Arial, sans-serif;
    text-transform: uppercase;
    text-shadow: 0 1px 1px rgba(0, 0, 0, 0.6);
  }

  /* ---------------------------------------------------- on-sheet outline */

  .${ON_SHEET_CLASS} {
    outline: 1px solid #3fbf5f !important;
    outline-offset: -1px !important;
    border-radius: 5px;
    background-color: rgba(40, 150, 70, 0.13);
    box-shadow: 0 0 4px rgba(63, 191, 95, 0.3);
  }
`;
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head ?? document.documentElement).appendChild(style);
  }

  // src/spreadsheet-trade-filter/maxButton.ts
  function fillQuantity(input, amount) {
    const value = String(amount);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(input, value);
    else input.value = value;
    input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "0" }));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "0" }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    log("filled quantity", { amount });
  }
  function placementTarget(input) {
    const parent = input.parentElement;
    if (!parent) return input;
    return parent.children.length === 1 ? parent : input;
  }
  function matchHeight(button, input) {
    const height = input.offsetHeight;
    if (!height) return;
    button.style.height = `${height}px`;
    button.style.lineHeight = `${height - 2}px`;
  }
  function describe(amount) {
    return `Fill the box with all ${amount.toLocaleString("en-US")}.`;
  }
  function currentInput(input, row) {
    if (input.isConnected) return input;
    return row.querySelector(QTY_INPUT);
  }
  function buildButton(input, amount, row) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "MAX";
    button.className = `torn-btn ${MAX_BUTTON_CLASS}`;
    button.dataset.stfAmount = String(amount);
    button.title = describe(amount);
    matchHeight(button, input);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const target = currentInput(input, row);
      if (!target) return;
      fillQuantity(target, Number(button.dataset.stfAmount ?? amount));
    });
    return button;
  }
  function place(button, input, row) {
    const wrapper = placementTarget(input);
    if (wrapper !== input) {
      wrapper.classList.add(QTY_WRAP_CLASS);
      wrapper.appendChild(button);
      row.classList.add(HAS_MAX_CLASS);
      return;
    }
    button.style.display = "inline-block";
    button.style.verticalAlign = "middle";
    button.style.marginRight = "4px";
    input.insertAdjacentElement("beforebegin", button);
  }
  function installMaxButton(row) {
    const { qtyInput, amount } = row;
    if (!qtyInput || amount === null) return;
    const existing = row.element.querySelector(`.${MAX_BUTTON_CLASS}`);
    if (existing) {
      if (existing.dataset.stfAmount !== String(amount)) {
        existing.dataset.stfAmount = String(amount);
        existing.title = describe(amount);
      }
      return;
    }
    place(buildButton(qtyInput, amount, row.element), qtyInput, row.element);
  }

  // src/spreadsheet-trade-filter/sheet.ts
  var DOCUMENT_ID = /^[A-Za-z0-9_-]{20,}$/;
  var SHARED_PATH = /\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/;
  var PUBLISHED_PATH = /\/spreadsheets\/d\/e\/([A-Za-z0-9_-]{20,})/;
  function findGid(url) {
    const fromHash = /[#&?]gid=(\d+)/.exec(url.hash);
    if (fromHash?.[1]) return fromHash[1];
    const fromQuery = url.searchParams.get("gid");
    if (fromQuery && /^\d+$/.test(fromQuery)) return fromQuery;
    return null;
  }
  function googleCsvUrl(url) {
    const gid = findGid(url);
    const published = PUBLISHED_PATH.exec(url.pathname);
    if (published?.[1]) {
      const base = `https://docs.google.com/spreadsheets/d/e/${published[1]}/pub?output=csv`;
      return gid ? `${base}&gid=${gid}` : base;
    }
    const shared = SHARED_PATH.exec(url.pathname);
    if (shared?.[1]) {
      const base = `https://docs.google.com/spreadsheets/d/${shared[1]}/gviz/tq?tqx=out:csv`;
      return gid ? `${base}&gid=${gid}` : base;
    }
    return null;
  }
  function parseSheetRef(input) {
    const trimmed = input.trim();
    if (!trimmed) return null;
    if (DOCUMENT_ID.test(trimmed)) {
      return {
        csvUrl: `https://docs.google.com/spreadsheets/d/${trimmed}/gviz/tq?tqx=out:csv`
      };
    }
    let url;
    try {
      const absolute = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      url = new URL(absolute);
    } catch {
      return null;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.hostname === "docs.google.com") {
      const csvUrl = googleCsvUrl(url);
      return csvUrl ? { csvUrl } : null;
    }
    return { csvUrl: url.href };
  }
  function parseDelimited(text, delimiter) {
    const rows = [];
    let row = [];
    let value = "";
    let quoted = false;
    const endRow = () => {
      row.push(value);
      value = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
    };
    const QUOTE = '"';
    for (let i = 0; i < text.length; i++) {
      const character = text[i];
      const next = text[i + 1];
      if (quoted && character === QUOTE && next === QUOTE) {
        value += QUOTE;
        i++;
      } else if (character === QUOTE) {
        quoted = !quoted;
      } else if (character === delimiter && !quoted) {
        row.push(value);
        value = "";
      } else if ((character === "\n" || character === "\r") && !quoted) {
        if (character === "\r" && next === "\n") i++;
        endRow();
      } else {
        value += character;
      }
    }
    if (value !== "" || row.length > 0) endRow();
    return rows;
  }
  function parseSheetText(text) {
    const sample = text.slice(0, 5e3);
    const commas = (sample.match(/,/g) ?? []).length;
    const tabs = (sample.match(/\t/g) ?? []).length;
    return parseDelimited(text, tabs > commas ? "	" : ",");
  }
  function normalizeItemName(name) {
    return name.trim().toLowerCase().replace(/\s+/g, " ");
  }
  var ITEM_HEADING = /^\s*item(\s*name)?\s*$/i;
  var MONEY_OR_NUMBER = /^[$£€]?\s*-?[\d,]+(\.\d+)?\s*[kmb%]?$/i;
  var LONGEST_ITEM_NAME = 60;
  function looksLikeItemName(cell) {
    const text = cell.trim();
    if (!text || text.length > LONGEST_ITEM_NAME) return false;
    if (MONEY_OR_NUMBER.test(text)) return false;
    return /[a-z]/i.test(text);
  }
  function columnNames(rows, column) {
    const names = /* @__PURE__ */ new Set();
    for (const row of rows) {
      const cell = row[column] ?? "";
      if (!looksLikeItemName(cell)) continue;
      names.add(normalizeItemName(cell));
    }
    return names;
  }
  function widestNameColumn(rows) {
    const width = Math.max(0, ...rows.map((row) => row.length));
    let best = /* @__PURE__ */ new Set();
    for (let column = 0; column < width; column++) {
      const names = columnNames(rows, column);
      if (names.size > best.size) best = names;
    }
    return best;
  }
  function findHeaders(rows) {
    const headers = [];
    rows.forEach((row, index) => {
      const items = [];
      row.forEach((cell, column) => {
        if (ITEM_HEADING.test(cell)) items.push(column);
      });
      if (items.length > 0) headers.push({ row: index, items });
    });
    return headers;
  }
  function readItemList(rows) {
    const headers = findHeaders(rows);
    if (headers.length === 0) {
      const fallback = widestNameColumn(rows);
      return fallback.size > 0 ? fallback : null;
    }
    const names = /* @__PURE__ */ new Set();
    headers.forEach((header, index) => {
      const end = headers[index + 1]?.row ?? rows.length;
      const section = rows.slice(header.row + 1, end);
      for (const column of header.items) {
        for (const name of columnNames(section, column)) names.add(name);
      }
    });
    return names.size > 0 ? names : null;
  }
  var REQUEST_TIMEOUT_MS = 15e3;
  function requestSheet(csvUrl) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: csvUrl,
        timeout: REQUEST_TIMEOUT_MS,
        onload(response) {
          resolve({ body: response.responseText, status: response.status });
        },
        onerror() {
          reject(new Error("Could not reach that address"));
        },
        ontimeout() {
          reject(new Error("That address did not respond in time"));
        }
      });
    });
  }
  function looksLikeWebPage(body) {
    const start = body.slice(0, 500).trimStart().toLowerCase();
    return start.startsWith("<!doctype html") || start.startsWith("<html") || start.startsWith("<?xml") || start.includes("<head");
  }
  function looksLikeOfficeFile(body) {
    return body.startsWith("PK");
  }
  async function loadSheet(input) {
    const ref = parseSheetRef(input);
    if (!ref) {
      return { status: "invalid-url", detail: "That is not a web address." };
    }
    let fetched;
    try {
      fetched = await requestSheet(ref.csvUrl);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return { status: "invalid-url", detail };
    }
    if (fetched.status === 401 || fetched.status === 403) {
      return {
        status: "private",
        detail: `The host refused the request (HTTP ${fetched.status}).`
      };
    }
    if (fetched.status < 200 || fetched.status >= 300) {
      return {
        status: "invalid-url",
        detail: `That address returned HTTP ${fetched.status}.`
      };
    }
    if (looksLikeWebPage(fetched.body)) {
      return {
        status: "private",
        detail: "A web page came back instead of the data, which is what a sign-in or preview screen looks like. Share the sheet so that anyone with the link can view it, and use its published CSV link."
      };
    }
    if (looksLikeOfficeFile(fetched.body)) {
      return {
        status: "bad-data",
        detail: "That link hands out an Excel file rather than plain data. Publish the sheet as CSV and use that link instead."
      };
    }
    const items = readItemList(parseSheetText(fetched.body));
    if (!items) {
      return {
        status: "bad-data",
        detail: "Item names are read from every column headed Item, falling back to whichever column holds the most names, and no column held any."
      };
    }
    return { status: "ok", csvUrl: ref.csvUrl, items };
  }

  // src/spreadsheet-trade-filter/settings.ts
  var SETTING_PREFIX = "STF_";
  var SHEET_URL_KEY = "SHEET_URL";
  var SHEET_CACHE_KEY = "SHEET_CACHE";
  var PANEL_OPEN_KEY = "PANEL_OPEN";
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
  function clearSetting(key) {
    try {
      localStorage.removeItem(SETTING_PREFIX + key);
    } catch {
    }
  }
  function readPanelOpen() {
    return readSetting(PANEL_OPEN_KEY, "1") !== "0";
  }
  function writePanelOpen(open) {
    writeSetting(PANEL_OPEN_KEY, open ? "1" : "0");
  }
  function readSheetCache() {
    const raw = readSetting(SHEET_CACHE_KEY, "");
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      const cache = parsed;
      if (typeof cache.csvUrl !== "string") return null;
      if (!Array.isArray(cache.items)) return null;
      return {
        csvUrl: cache.csvUrl,
        fetchedAt: typeof cache.fetchedAt === "number" ? cache.fetchedAt : 0,
        items: cache.items
      };
    } catch {
      return null;
    }
  }
  function writeSheetCache(cache) {
    writeSetting(SHEET_CACHE_KEY, JSON.stringify(cache));
  }
  function readCachedItems() {
    const cache = readSheetCache();
    if (!cache) return /* @__PURE__ */ new Set();
    const items = /* @__PURE__ */ new Set();
    for (const name of cache.items) {
      if (typeof name === "string" && name) items.add(name);
    }
    return items;
  }
  function isOurStorageKey(key) {
    return typeof key === "string" && key.startsWith(SETTING_PREFIX);
  }

  // src/spreadsheet-trade-filter/markup.ts
  function markOnSheet(element, name, items) {
    const onSheet = items.has(normalizeItemName(name));
    const signature = onSheet ? "on" : "off";
    if (element.dataset.stfMark === signature) return;
    element.dataset.stfMark = signature;
    element.classList.toggle(ON_SHEET_CLASS, onSheet);
  }
  function forgetMarks() {
    for (const element of document.querySelectorAll("[data-stf-mark]")) {
      delete element.dataset.stfMark;
      element.classList.remove(ON_SHEET_CLASS);
    }
  }
  function markPage() {
    const items = readCachedItems();
    const rows = readRows();
    for (const row of rows) {
      installMaxButton(row);
      markOnSheet(row.element, row.name, items);
    }
    log(`pass over ${rows.length} rows against ${items.size} sheet items`);
  }
  var SETTLE_MS = 150;
  var MAX_DEFER_MS = 1e3;
  var settleTimer;
  var waitingSince = 0;
  function schedulePass() {
    const now = Date.now();
    if (waitingSince && now - waitingSince >= MAX_DEFER_MS) {
      runPass();
      return;
    }
    if (!waitingSince) waitingSince = now;
    clearTimeout(settleTimer);
    settleTimer = setTimeout(runPass, SETTLE_MS);
  }
  function runPass() {
    clearTimeout(settleTimer);
    waitingSince = 0;
    markPage();
  }
  var watching = false;
  function installMarkup() {
    injectStyles();
    schedulePass();
    if (watching) return;
    watching = true;
    new MutationObserver(schedulePass).observe(document.body, {
      childList: true,
      subtree: true
    });
    addEventListener("storage", (event) => {
      if (!isOurStorageKey(event.key)) return;
      forgetMarks();
      schedulePass();
    });
  }
  function refreshMarks() {
    forgetMarks();
    schedulePass();
  }

  // src/spreadsheet-trade-filter/panel.ts
  var HEADER_SELECTORS = [
    ".content-title",
    "#skip-to-content",
    ".title-black",
    ".content-wrapper > h4"
  ];
  function findHeader() {
    for (const selector of HEADER_SELECTORS) {
      const element = document.querySelector(selector);
      if (element) return element;
    }
    return null;
  }
  function setStatus(element, kind, text) {
    element.className = kind === "none" ? "stf-status" : `stf-status stf-status-${kind}`;
    element.textContent = text;
  }
  var checkToken = 0;
  async function checkSheet(input, status, options) {
    const token = ++checkToken;
    const value = input.value.trim();
    if (!value) {
      clearSetting(SHEET_URL_KEY);
      setStatus(status, "none", options.announceEmpty ? "No source sheet set." : "");
      status.removeAttribute("title");
      return;
    }
    setStatus(status, "working", "Checking sheet...");
    status.removeAttribute("title");
    const result = await loadSheet(value);
    if (token !== checkToken) return;
    writeSetting(SHEET_URL_KEY, value);
    if (result.status === "invalid-url") {
      setStatus(status, "error", "invalid URL");
      status.title = result.detail;
      return;
    }
    if (result.status === "private") {
      setStatus(status, "error", "Please adjust your sheet's privacy settings");
      status.title = result.detail;
      return;
    }
    if (result.status === "bad-data") {
      setStatus(
        status,
        "error",
        "URL loaded but data is not formatted correctly for this script."
      );
      status.title = result.detail;
      return;
    }
    writeSheetCache({
      csvUrl: result.csvUrl,
      fetchedAt: Date.now(),
      items: [...result.items]
    });
    setStatus(status, "ok", `valid source sheet loaded - ${result.items.size} items`);
    status.title = "Items on the list are outlined in the trade list below.";
    refreshMarks();
  }
  function buildSourceSheetField() {
    const field = document.createElement("div");
    field.className = "stf-field";
    const label = document.createElement("label");
    label.className = "stf-field-label";
    label.htmlFor = "stf-sheet-url";
    label.textContent = "Source Spreadsheet";
    field.appendChild(label);
    const input = document.createElement("input");
    input.id = "stf-sheet-url";
    input.className = "stf-text-input";
    input.type = "text";
    input.spellcheck = false;
    input.autocomplete = "off";
    input.placeholder = "Link to a public spreadsheet";
    input.value = readSetting(SHEET_URL_KEY, "");
    field.appendChild(input);
    const status = document.createElement("div");
    status.className = "stf-status";
    field.appendChild(status);
    const hint = document.createElement("div");
    hint.className = "stf-hint";
    hint.textContent = "Paste a link to a publicly viewable Google sheet with one or more headers called 'item' and press enter. If prompted, select always allow for this domain.";
    field.appendChild(hint);
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      void checkSheet(input, status, { announceEmpty: true });
    });
    if (input.value.trim()) {
      void checkSheet(input, status, { announceEmpty: false });
    }
    return field;
  }
  function buildTitle(panel) {
    const title = document.createElement("div");
    title.className = "stf-title";
    title.setAttribute("role", "button");
    title.tabIndex = 0;
    const caret = document.createElement("span");
    caret.className = "stf-caret";
    caret.textContent = "▾";
    title.appendChild(caret);
    const text = document.createElement("span");
    text.textContent = "Spreadsheet Trade Filter";
    title.appendChild(text);
    const apply = (open) => {
      panel.classList.toggle(COLLAPSED_CLASS, !open);
      title.setAttribute("aria-expanded", String(open));
    };
    apply(readPanelOpen());
    const toggle = () => {
      const open = panel.classList.contains(COLLAPSED_CLASS);
      writePanelOpen(open);
      apply(open);
    };
    title.addEventListener("click", toggle);
    title.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggle();
    });
    return title;
  }
  function buildPanel() {
    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.appendChild(buildTitle(panel));
    const body = document.createElement("div");
    body.className = "stf-body";
    body.appendChild(buildSourceSheetField());
    panel.appendChild(body);
    return panel;
  }
  function installPanel() {
    if (document.getElementById(PANEL_ID)) return;
    const anchor = findHeader();
    if (!anchor) return;
    injectStyles();
    anchor.insertAdjacentElement("afterend", buildPanel());
  }

  // src/spreadsheet-trade-filter/index.ts
  function onReady() {
    installPanel();
    installMarkup();
    new MutationObserver(() => installPanel()).observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  if (document.body) {
    onReady();
  } else {
    document.addEventListener("DOMContentLoaded", onReady, { once: true });
  }
})();
