// ==UserScript==
// @name         Autumn's Buy Helper
// @namespace    https://github.com/autumn-grey
// @version      0.1.0
// @description  Marks up the item market and other players' bazaars with your own reference prices, so a listing worth buying is obvious at a glance. The source spreadsheet is set from a panel on the preferences page.
// @author       AutumnGrey
// @license      MIT
// @match        https://www.torn.com/preferences.php*
// @match        https://www.torn.com/page.php*
// @match        https://www.torn.com/bazaar.php*
// @grant        GM_xmlhttpRequest
// @connect      *
// @run-at       document-idle
// @noframes     true
// @downloadURL  https://raw.githubusercontent.com/autumn-grey/tornScripts/main/dist/autumns-buy-helper.user.js
// @updateURL    https://raw.githubusercontent.com/autumn-grey/tornScripts/main/dist/autumns-buy-helper.user.js
// ==/UserScript==

"use strict";
(() => {
  // src/autumns-buy-helper/debug.ts
  var DEBUG_KEY = "ABH_DEBUG";
  function debugging() {
    try {
      return localStorage.getItem(DEBUG_KEY) === "1";
    } catch {
      return false;
    }
  }
  function log(...parts) {
    if (!debugging()) return;
    console.debug("[ABH]", ...parts);
  }

  // src/autumns-buy-helper/sheet.ts
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
    for (let i = 0; i < text.length; i++) {
      const character = text[i];
      const next = text[i + 1];
      if (quoted && character === '"' && next === '"') {
        value += '"';
        i++;
      } else if (character === '"') {
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
  function parsePrice(value) {
    const text = value.trim().toLowerCase().replace(/[$,\s]/g, "");
    if (!text) return NaN;
    const match = /^(-?\d*\.?\d+)([kmb])?$/.exec(text);
    if (!match?.[1]) return NaN;
    const suffix = match[2] ?? "";
    const scale = suffix === "k" ? 1e3 : suffix === "m" ? 1e6 : suffix === "b" ? 1e9 : 1;
    return Number(match[1]) * scale;
  }
  var ITEM_NAME_COLUMN = 2;
  var PRICE_COLUMN = 3;
  function readPriceTable(rows) {
    const prices = /* @__PURE__ */ new Map();
    for (const row of rows) {
      const name = normalizeItemName(row[ITEM_NAME_COLUMN] ?? "");
      if (!name) continue;
      const price = parsePrice(row[PRICE_COLUMN] ?? "");
      if (!Number.isFinite(price) || price <= 0) continue;
      if (!prices.has(name)) prices.set(name, price);
    }
    if (prices.size === 0) return null;
    return { prices };
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
    return body.startsWith("PK");
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
    const table = readPriceTable(parseSheetText(fetched.body));
    if (!table) {
      return {
        status: "bad-data",
        detail: "Item names are read from column C and prices from column D, and no row had both. Check the sheet matches the template."
      };
    }
    return { status: "ok", csvUrl: ref.csvUrl, table };
  }

  // src/autumns-buy-helper/settings.ts
  var SETTING_PREFIX = "ABH_";
  var SHEET_URL_KEY = "SHEET_URL";
  var SHEET_CACHE_KEY = "SHEET_CACHE";
  var MAX_BUY_VALUE_KEY = "MAX_BUY_VALUE";
  var DEFAULT_MAX_BUY_VALUE = 0;
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
  function clampMaxBuyValue(value) {
    if (!Number.isFinite(value)) return DEFAULT_MAX_BUY_VALUE;
    return Math.min(100, Math.max(0, value));
  }
  function readMaxBuyValue() {
    const stored = readSetting(MAX_BUY_VALUE_KEY, "");
    if (!stored) return DEFAULT_MAX_BUY_VALUE;
    return clampMaxBuyValue(Number(stored));
  }
  function writeMaxBuyValue(value) {
    writeSetting(MAX_BUY_VALUE_KEY, String(clampMaxBuyValue(value)));
  }
  function readSheetCache() {
    const raw = readSetting(SHEET_CACHE_KEY, "");
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      const cache = parsed;
      if (typeof cache.csvUrl !== "string") return null;
      if (!Array.isArray(cache.entries)) return null;
      return {
        csvUrl: cache.csvUrl,
        fetchedAt: typeof cache.fetchedAt === "number" ? cache.fetchedAt : 0,
        entries: cache.entries
      };
    } catch {
      return null;
    }
  }
  function writeSheetCache(cache) {
    writeSetting(SHEET_CACHE_KEY, JSON.stringify(cache));
  }
  function readCachedPrices() {
    const cache = readSheetCache();
    if (!cache) return /* @__PURE__ */ new Map();
    const prices = /* @__PURE__ */ new Map();
    for (const entry of cache.entries) {
      const [name, price] = entry;
      if (typeof name === "string" && typeof price === "number") {
        prices.set(name, price);
      }
    }
    return prices;
  }

  // src/autumns-buy-helper/styles.ts
  var STYLE_ID = "abh-styles";
  var PANEL_ID = "abh-prefs-panel";
  var GOOD_BUY_CLASS = "abh-good-buy";
  var CSS = `
  /* ---------------------------------------------------- settings panel */

  /* Sits under the main preferences panel and inherits its width, so the
     two read as one stack. */
  #${PANEL_ID} {
    margin: 10px 0 0;
    border-radius: 5px;
    overflow: hidden;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    font-family: Arial, Helvetica, sans-serif;
    color: #fff;
  }
  /* Torn's own panel-title bar: blue-grey, lighter at the top. */
  .abh-title {
    height: 30px;
    line-height: 30px;
    padding: 0 0 0 10px;
    background: linear-gradient(180deg, #4e565e 0%, #303840 100%);
    font-weight: bold;
    font-size: 12px;
    color: #fff;
    text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
  }
  /* The gradient sits on the body rather than on each field, so it stays
     one continuous fill however many settings end up in here. */
  .abh-body {
    background: linear-gradient(180deg, #656565 0%, #373737 100%);
    padding: 10px 12px;
  }
  .abh-field + .abh-field {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid rgba(0, 0, 0, 0.4);
  }
  .abh-field-label {
    display: block;
    margin: 0 0 5px;
    font-size: 13px;
    line-height: 18px;
    color: #fff;
  }
  /* Plain and readable rather than themed - same reasoning as the UI
     Enhancer's dropdown: the browser draws its own chrome around inputs. */
  .abh-text-input {
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
  .abh-text-input:focus {
    outline: none;
    border-color: #fff;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.6);
  }
  /* Under the input, and always present once a check has run, so the field
     does not jump around as the message changes. */
  .abh-status {
    margin: 4px 0 0;
    font-size: 11px;
    line-height: 15px;
    font-weight: bold;
    text-shadow: 0 1px 1px rgba(0, 0, 0, 0.6);
  }
  .abh-status-ok      { color: #5ed17c; }
  .abh-status-error   { color: #ff6b6b; }
  /* Neutral, for the moment between pressing enter and Google answering. */
  .abh-status-working { color: #d6d6d6; font-weight: normal; }
  /* The hint under a setting, explaining what it wants. */
  .abh-hint {
    margin: 4px 0 0;
    font-size: 11px;
    line-height: 15px;
    color: #d0d0d0;
  }

  /* --------------------------------------------- percentage input box */

  /* The % sits inside the box rather than beside it, so it reads as part of
     the value. The input is padded out of its way, and the sign ignores
     clicks so tapping it still puts the cursor in the box. */
  .abh-percent {
    position: relative;
    display: inline-block;
  }
  .abh-percent .abh-percent-sign {
    position: absolute;
    left: 7px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 12px;
    line-height: 1;
    color: #555;
    pointer-events: none;
  }
  .abh-percent .abh-text-input {
    width: 90px;
    padding-left: 20px;
  }
  /* Torn's pages are narrow enough that the spinner arrows crowd the value,
     and the number is easier to type than to click up to anyway. */
  .abh-percent .abh-text-input::-webkit-outer-spin-button,
  .abh-percent .abh-text-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .abh-percent .abh-text-input {
    -moz-appearance: textfield;
    appearance: textfield;
  }

  /* ----------------------------------------------- worth-buying outline */

  /* An outline rather than a border: it is drawn outside the box model, so
     nothing on Torn's page shifts by two pixels when a listing lights up.
     Pulled inwards so it lands on the edge of the listing rather than in the
     gap beside it, and !important because Torn's own styles are heavy
     handed about outlines on the things it draws. */
  .${GOOD_BUY_CLASS} {
    outline: 2px solid #3fbf5f !important;
    outline-offset: -2px !important;
    border-radius: 5px;
    background-color: rgba(40, 150, 70, 0.13);
    box-shadow: 0 0 6px rgba(63, 191, 95, 0.45);
  }
`;
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head ?? document.documentElement).appendChild(style);
  }

  // src/autumns-buy-helper/markup.ts
  var ITEM_IMAGE = "img.torn-item[alt]";
  var PRICE_ELEMENT = '[class*="priceAndTotal"] > span, [class*="price___"]';
  var MONEY = /\$\s?([\d,]+)/g;
  var MAX_WALK_DEPTH = 8;
  function parseMoney(text) {
    const found = [];
    for (const match of text.matchAll(MONEY)) {
      const digits = match[1]?.replace(/,/g, "");
      if (!digits) continue;
      const value = Number(digits);
      if (Number.isFinite(value) && value > 0) found.push(value);
    }
    return found;
  }
  function findPrice(listing) {
    for (const element of listing.querySelectorAll(PRICE_ELEMENT)) {
      const amounts2 = parseMoney(element.textContent ?? "");
      const first = amounts2[0];
      if (first !== void 0) return first;
    }
    const amounts = parseMoney(listing.textContent ?? "");
    if (amounts.length === 0) return null;
    return Math.min(...amounts);
  }
  function findListing(image) {
    let node = image.parentElement;
    for (let depth = 0; node && depth < MAX_WALK_DEPTH; depth++) {
      if (node.querySelectorAll(ITEM_IMAGE).length > 1) return null;
      if (findPrice(node) !== null) return node;
      node = node.parentElement;
    }
    return null;
  }
  function buyThreshold(sheetPrice, maxBuyValue) {
    return sheetPrice - sheetPrice * (maxBuyValue / 100);
  }
  function formatMoney(value) {
    return `$${Math.round(value).toLocaleString("en-US")}`;
  }
  function markListing(listing, itemName, prices, maxBuyValue) {
    const sheetPrice = prices.get(normalizeItemName(itemName));
    const askingPrice = findPrice(listing);
    if (sheetPrice === void 0 || askingPrice === null) {
      clearListing(listing);
      return;
    }
    const threshold = buyThreshold(sheetPrice, maxBuyValue);
    const worthBuying = askingPrice <= threshold;
    const signature = `${askingPrice}:${sheetPrice}:${maxBuyValue}`;
    if (listing.dataset.abhMark === signature) return;
    listing.dataset.abhMark = signature;
    listing.classList.toggle(GOOD_BUY_CLASS, worthBuying);
    listing.title = worthBuying ? `${itemName}: asking ${formatMoney(askingPrice)}, at or under your ${formatMoney(threshold)} buy price (${formatMoney(sheetPrice)} on your sheet, less ${maxBuyValue}%).` : `${itemName}: asking ${formatMoney(askingPrice)}, over your ${formatMoney(threshold)} buy price (${formatMoney(sheetPrice)} on your sheet, less ${maxBuyValue}%).`;
    log("marked", {
      itemName,
      askingPrice,
      sheetPrice,
      maxBuyValue,
      threshold,
      worthBuying
    });
  }
  function clearListing(listing) {
    if (listing.dataset.abhMark === void 0) return;
    delete listing.dataset.abhMark;
    listing.classList.remove(GOOD_BUY_CLASS);
    listing.removeAttribute("title");
  }
  function markPage() {
    const prices = readCachedPrices();
    if (prices.size === 0) {
      log("no prices loaded - set a source spreadsheet in preferences");
      return;
    }
    const maxBuyValue = readMaxBuyValue();
    const images = document.querySelectorAll(ITEM_IMAGE);
    let marked = 0;
    for (const image of images) {
      const itemName = image.getAttribute("alt")?.trim();
      if (!itemName) continue;
      const listing = findListing(image);
      if (!listing) continue;
      markListing(listing, itemName, prices, maxBuyValue);
      marked++;
    }
    log(`pass over ${images.length} item images, ${marked} listings found`);
  }
  var SETTLE_MS = 150;
  var settleTimer;
  function schedulePass() {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(markPage, SETTLE_MS);
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
      if (event.key?.startsWith("ABH_")) {
        forgetMarks();
        schedulePass();
      }
    });
  }
  function forgetMarks() {
    for (const listing of document.querySelectorAll("[data-abh-mark]")) {
      clearListing(listing);
    }
  }

  // src/autumns-buy-helper/pages.ts
  function readParam(name) {
    const fromQuery = new URLSearchParams(location.search).get(name);
    if (fromQuery) return fromQuery;
    const pattern = new RegExp(`[#/&?]${name}=([^&/#]+)`, "i");
    const fromHash = pattern.exec(location.hash);
    return fromHash?.[1] ?? null;
  }
  function currentPage() {
    const path = location.pathname.toLowerCase();
    if (path === "/page.php") {
      const sid = readParam("sid");
      return sid?.toLowerCase() === "itemmarket" ? "item-market" : null;
    }
    if (path === "/bazaar.php") return "bazaar";
    return null;
  }
  function onLocationChange(handler) {
    let last = location.href;
    const check = () => {
      if (location.href === last) return;
      last = location.href;
      handler();
    };
    addEventListener("popstate", check);
    addEventListener("hashchange", check);
    for (const name of ["pushState", "replaceState"]) {
      const original = history[name];
      history[name] = function(...args) {
        const result = original.apply(this, args);
        check();
        return result;
      };
    }
  }

  // src/autumns-buy-helper/panel.ts
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
  function setStatus(element, kind, text) {
    element.className = kind === "none" ? "abh-status" : `abh-status abh-status-${kind}`;
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
      entries: [...result.table.prices]
    });
    setStatus(status, "ok", "valid source sheet loaded");
    status.title = `${result.table.prices.size} item prices read from the sheet.`;
  }
  function buildSourceSheetField() {
    const field = document.createElement("div");
    field.className = "abh-field";
    const label = document.createElement("label");
    label.className = "abh-field-label";
    label.htmlFor = "abh-sheet-url";
    label.textContent = "Source Spreadsheet";
    field.appendChild(label);
    const input = document.createElement("input");
    input.id = "abh-sheet-url";
    input.className = "abh-text-input";
    input.type = "text";
    input.spellcheck = false;
    input.autocomplete = "off";
    input.placeholder = "Link to a public spreadsheet";
    input.value = readSetting(SHEET_URL_KEY, "");
    field.appendChild(input);
    const status = document.createElement("div");
    status.className = "abh-status";
    field.appendChild(status);
    const hint = document.createElement("div");
    hint.className = "abh-hint";
    hint.textContent = "Paste a link to a publicly viewable spreadsheet and press enter. Google Sheets links work as they come; anything else should be a link that hands out the sheet as CSV.";
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
  function buildMaxBuyValueField() {
    const field = document.createElement("div");
    field.className = "abh-field";
    const label = document.createElement("label");
    label.className = "abh-field-label";
    label.htmlFor = "abh-max-buy-value";
    label.textContent = "Maximum Buy Value";
    field.appendChild(label);
    const wrapper = document.createElement("span");
    wrapper.className = "abh-percent";
    const sign = document.createElement("span");
    sign.className = "abh-percent-sign";
    sign.textContent = "%";
    wrapper.appendChild(sign);
    const input = document.createElement("input");
    input.id = "abh-max-buy-value";
    input.className = "abh-text-input";
    input.type = "number";
    input.min = "0";
    input.max = "100";
    input.step = "1";
    input.value = String(readMaxBuyValue());
    wrapper.appendChild(input);
    field.appendChild(wrapper);
    const hint = document.createElement("div");
    hint.className = "abh-hint";
    hint.textContent = "How far under your sheet price a listing has to be before it is outlined. At 30%, an item worth 1,000 on your sheet is only outlined when someone is asking $700 or less.";
    field.appendChild(hint);
    const save = () => {
      const value = clampMaxBuyValue(Number(input.value));
      writeMaxBuyValue(value);
      input.value = String(value);
    };
    input.addEventListener("change", save);
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      save();
    });
    return field;
  }
  function buildPanel() {
    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    const title = document.createElement("div");
    title.className = "abh-title";
    title.textContent = "Autumn's Buy Helper";
    panel.appendChild(title);
    const body = document.createElement("div");
    body.className = "abh-body";
    body.appendChild(buildSourceSheetField());
    body.appendChild(buildMaxBuyValueField());
    panel.appendChild(body);
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

  // src/autumns-buy-helper/index.ts
  var PREFERENCES_PATH = "/preferences.php";
  function onPage() {
    if (!currentPage()) return;
    installMarkup();
  }
  function onReady() {
    if (location.pathname === PREFERENCES_PATH) {
      installPreferencesPanel();
      return;
    }
    onPage();
    onLocationChange(onPage);
  }
  if (document.body) {
    onReady();
  } else {
    document.addEventListener("DOMContentLoaded", onReady, { once: true });
  }
})();
