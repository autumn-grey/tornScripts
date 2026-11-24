// ==UserScript==
// @name         Autumn's UI Enhancer
// @namespace    https://github.com/autumn-grey
// @version      1.0.1
// @description  Heaps of QOL features, all are optional, check Torn settings to see the full list
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
  // src/shared/hashedClass.ts
  function hashedClass(name, atStart = false) {
    const forms = [`${name}___`, `_${name}_`];
    const parts = atStart ? forms.flatMap((form) => [`[class^="${form}"]`, `[class*=" ${form}"]`]) : forms.map((form) => `[class*="${form}"]`);
    return `:is(${parts.join(", ")})`;
  }

  // src/autumns-ui-enhancer/debug.ts
  var DEBUG_KEY = "AUE_DEBUG";
  function debugging() {
    try {
      return localStorage.getItem(DEBUG_KEY) === "1";
    } catch {
      return false;
    }
  }
  function safeJson(value) {
    try {
      return (JSON.stringify(value) ?? String(value)).slice(0, 300);
    } catch {
      return String(value);
    }
  }
  function log(...parts) {
    if (!debugging()) return;
    const kept = window.aueLog ?? (window.aueLog = []);
    kept.push(
      `${(/* @__PURE__ */ new Date()).toISOString().slice(11, 23)} ${parts.map((part2) => typeof part2 === "string" ? part2 : safeJson(part2)).join(" ")}`
    );
    if (kept.length > 500) kept.splice(0, kept.length - 500);
    console.log("[AUE]", ...parts);
  }

  // src/autumns-ui-enhancer/settings.ts
  var SETTING_PREFIX = "AUE_";
  var MOBILE_QUERY = "(max-width: 784px)";
  function isMobileView() {
    return matchMedia(MOBILE_QUERY).matches;
  }
  var PAGE_JUMP_BLOCK = {
    key: "PAGE_JUMP_BLOCK",
    label: "Page Jump Block",
    defaultOn: true
  };
  var INDEPENDENT_CHAT_TABS = {
    key: "INDEPENDENT_CHAT_TABS",
    label: "Independent Chat Tabs",
    defaultOn: true
  };
  var CHAT_SIDE_BUTTON = {
    key: "CHAT_SIDE_BUTTON",
    label: "Chat Left/Right Button",
    defaultOn: true,
    desktopOnly: true
  };
  var LIST_DISPLAY_EXTENSION = {
    key: "LIST_DISPLAY_EXTENSION",
    label: "Show More on Lists",
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
  var PREFERRED_RECIPIENT = {
    // The key stays as it was so nobody's existing choice is forgotten; only
    // what it covers, and what it is called, have changed.
    key: "SHOP_SEND",
    label: "Preferred Recipient",
    defaultOn: true
  };
  var DISPLAY_CASE_BUTTON = {
    key: "DISPLAY_CASE_BUTTON",
    label: "Display Case Button",
    defaultOn: true
  };
  var PERSONAL_STATS_FIXES = {
    key: "PERSONAL_STATS_FIXES",
    label: "Personal Stats fixes",
    defaultOn: true
  };
  var FORUM_SEARCH = {
    key: "FORUM_SEARCH",
    label: "Forum Search",
    defaultOn: true
  };
  var HIDE_CHATS = {
    key: "HIDE_CHATS",
    label: "Hide Chats",
    defaultOn: true
  };
  var CITY_SHOP_ALERT = {
    // The key keeps the feature's first name so nobody's choice is forgotten.
    key: "CITY_SHOP_ALERT",
    label: "City Shop Purchase Check",
    defaultOn: true
  };
  var CITY_SHOP_STOCK = {
    key: "CITY_SHOP_STOCK",
    label: "City Shop Stock Check",
    defaultOn: true
  };
  var API_KEY_SETTING = "API_KEY";
  var KEY_REJECTED_SETTING = "API_KEY_REJECTED";
  var STOCK_ITEMS_SETTING = "CITY_SHOP_STOCK_ITEMS";
  var PANEL_OPEN_SETTING = "PANEL_OPEN";
  var STOCK_LIST_OPEN_SETTING = "CITY_SHOP_STOCK_LIST_OPEN";
  var RECIPIENT_SETTING = "SEND_RECIPIENT";
  var RECIPIENT_LABEL = "SEND_RECIPIENT_LABEL";
  var PANEL_FOOTNOTE = "Dark/Light Mode switch and table sorting in Torn Wiki enabled by default.";
  var FEATURES = [
    PAGE_JUMP_BLOCK,
    INDEPENDENT_CHAT_TABS,
    CHAT_SIDE_BUTTON,
    LIST_DISPLAY_EXTENSION,
    LIST_SORTING,
    NEWS_TICKER,
    PREFERRED_RECIPIENT,
    DISPLAY_CASE_BUTTON,
    PERSONAL_STATS_FIXES,
    FORUM_SEARCH,
    HIDE_CHATS
  ];
  var API_FEATURES = [CITY_SHOP_ALERT, CITY_SHOP_STOCK];
  function isEnabled(feature) {
    if (feature.desktopOnly && isMobileView()) return false;
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

  // src/autumns-ui-enhancer/cityStock.ts
  var ApiError = class extends Error {
    constructor(message, code) {
      super(message);
      this.code = code;
    }
  };
  var DEAD_KEY_CODES = /* @__PURE__ */ new Set([1, 2, 10, 13, 16, 18]);
  function throwIfApiError(body) {
    if (body.error) throw new ApiError(body.error.error ?? "API error", body.error.code ?? null);
  }
  function keyRejection() {
    return readSetting(KEY_REJECTED_SETTING, "");
  }
  function noteKeyFailure(error) {
    if (!(error instanceof ApiError) || error.code === null) return;
    if (!DEAD_KEY_CODES.has(error.code)) return;
    log("city shop: Torn refused the key, so no more calls until it is checked again -", error.message);
    writeSetting(KEY_REJECTED_SETTING, error.message);
  }
  function clearKeyRejection() {
    writeSetting(KEY_REJECTED_SETTING, "");
  }
  var STOCK_URL = "https://api.torn.com/v2/torn/cityshops";
  var STOCK_STATE_SETTING = "CITY_SHOP_STOCK_STATE";
  var CITY_URL = "https://www.torn.com/city.php";
  var SHOP_PAGES = {
    bitsnbobs: "https://www.torn.com/shops.php?step=bitsnbobs",
    cyberforce: "https://www.torn.com/shops.php?step=cyberforce",
    docks: "https://www.torn.com/shops.php?step=docks",
    jewelrystore: "https://www.torn.com/shops.php?step=jewelry",
    nikehperformance: "https://www.torn.com/shops.php?step=nikeh",
    pharmacy: "https://www.torn.com/shops.php?step=pharmacy",
    postoffice: "https://www.torn.com/shops.php?step=postoffice",
    superstore: "https://www.torn.com/shops.php?step=super",
    sallyssweetshop: "https://www.torn.com/shops.php?step=candy",
    tcclothing: "https://www.torn.com/shops.php?step=clothes",
    bigalsgunshop: "https://www.torn.com/bigalgunshop.php"
  };
  function shopUrl(name) {
    return SHOP_PAGES[name.toLowerCase().replace(/[^a-z]/g, "")] ?? CITY_URL;
  }
  function listOf(raw) {
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === "object") {
      return Object.entries(raw).map(([id, value]) => ({ id, ...value }));
    }
    return [];
  }
  function stockOf(item) {
    const stock = item.stock;
    const value = stock && typeof stock === "object" ? stock.current : stock ?? item.in_stock;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  function parseShops(body) {
    return listOf(body.cityshops ?? body.shops).map((shop) => {
      const name = typeof shop.name === "string" ? shop.name : "";
      const items = listOf(shop.inventory ?? shop.items ?? shop.stock).map((item) => ({
        id: Number(item.id),
        name: typeof item.name === "string" ? item.name : "",
        stock: stockOf(item)
      })).filter((item) => Number.isFinite(item.id) && item.name !== "");
      return { name, url: shopUrl(name), items };
    }).filter((shop) => shop.name !== "" && shop.items.length > 0);
  }
  async function fetchCityShops(key) {
    const params = new URLSearchParams({ key });
    const response = await fetch(`${STOCK_URL}?${params}`, { credentials: "omit" });
    const body = await response.json();
    throwIfApiError(body);
    return parseShops(body);
  }
  function readStock() {
    try {
      const parsed = JSON.parse(readSetting(STOCK_STATE_SETTING, ""));
      if (typeof parsed.fetchedAt !== "number" || !Array.isArray(parsed.shops)) return null;
      return parsed;
    } catch {
      return null;
    }
  }
  async function loadStock(key, maxAgeMs) {
    const stored = readStock();
    if (stored && Date.now() - stored.fetchedAt < maxAgeMs) return stored.shops;
    if (keyRejection()) return stored?.shops ?? null;
    try {
      const shops = await fetchCityShops(key);
      if (JSON.stringify(shops) !== JSON.stringify(stored?.shops)) log("city shop: stock changed", shops);
      writeSetting(STOCK_STATE_SETTING, JSON.stringify({ fetchedAt: Date.now(), shops }));
      return shops;
    } catch (error) {
      log("city shop: could not read the stock", error);
      noteKeyFailure(error);
      return stored?.shops ?? null;
    }
  }
  function forgetStock() {
    writeSetting(STOCK_STATE_SETTING, "");
  }
  function readCheckedItems() {
    try {
      const parsed = JSON.parse(readSetting(STOCK_ITEMS_SETTING, "[]"));
      return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === "number") : []);
    } catch {
      return /* @__PURE__ */ new Set();
    }
  }
  function writeCheckedItems(ids) {
    writeSetting(STOCK_ITEMS_SETTING, JSON.stringify([...ids]));
  }

  // src/autumns-ui-enhancer/ownChanges.ts
  var OWN_SELECTOR = '[id^="aue-"]';
  function isOurs(node) {
    const element = node instanceof Element ? node : node.parentElement;
    return element?.closest(OWN_SELECTOR) != null;
  }
  function onlyOurs(records) {
    for (const record of records) {
      if (isOurs(record.target)) continue;
      if (record.removedNodes.length > 0) return false;
      for (const node of record.addedNodes) {
        if (!isOurs(node)) return false;
      }
    }
    return true;
  }

  // src/autumns-ui-enhancer/purchaseText.ts
  var FURNITURE_SELECTOR = "#header-root, #sidebarroot, #chatRoot";
  var LOG_WORDING = /\bat\s+\$[\d,]+\s+each\b/i;
  function isLogEntry(node) {
    const element = node instanceof Element ? node : node.parentElement;
    if (element?.closest(FURNITURE_SELECTOR)) return true;
    return LOG_WORDING.test(node.textContent ?? "");
  }

  // src/autumns-ui-enhancer/cityShop.ts
  var SELECTORS = {
    // The City item in the side menu, which carries the attention class:
    // <div class="area-desktop___yee1a notList___jrp60" id="nav-city">.
    cityItem: "#nav-city",
    // The same item found from its link, should the id ever go.
    cityLink: '#sidebarroot a[href="/city.php"]',
    cityItemFromLink: `${hashedClass("area-desktop")}, ${hashedClass("area-mobile")}`,
    // A side menu item's icon, which carries the blue class.
    navIcon: hashedClass("defaultIcon"),
    // The status icon list: <ul class="statusIcons___ks48M big___O1UVc">.
    statusList: `ul${hashedClass("statusIcons")}`,
    // The faction icon (grey fist), which ours goes after.
    factionIcon: 'a[href*="factions.php"]:not([href*="crimes"])',
    // The Bank Investment icon, which ours goes before.
    bankIcon: 'a[href*="bank.php"]'
  };
  var ATTENTION_CLASS_PREFIX = "attention___";
  var BLUE_CLASS_PREFIX = "blue___";
  function bagIcon(top, bottom, handle) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="4 1.6 16 21.4">
<defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/>
</linearGradient></defs>
<path d="M8.3 9V6.2a3.7 3.7 0 0 1 7.4 0V9" fill="none" stroke="${handle}" stroke-width="1.7" stroke-linecap="round"/>
<rect x="4.5" y="8" width="15" height="14.5" rx="0.6" fill="url(#b)"/>
<rect x="6.2" y="10.2" width="11.6" height="2.6" fill="#3d3d3d"/>
</svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }
  var BAG_OPEN = bagIcon("#f2cd92", "#c38d55", "#e9c48c");
  var BAG_DONE = bagIcon("#a8e67a", "#4f9a2e", "#93d665");
  var BAG_NO_KEY = bagIcon("#f28a7e", "#b8392c", "#ec7a6d");
  var LOG_URL = "https://api.torn.com/v2/user/log";
  var SHOP_BUY_LOG_ID = 4200;
  var DAILY_LIMIT = 100;
  var DAY_S = 86400;
  var REFRESH_MS = 2 * 6e4;
  var STOCK_REFRESH_MS = 2e4;
  var STOCK_SLACK_MS = 2e3;
  var AFTER_BUY_MS = 1500;
  var MIN_GAP_MS = 5e3;
  var PURCHASE_TEXT = /\byou bought\s+(?:([\d,]+)\s*x\b|an?\s)/i;
  var STATE_SETTING = "CITY_SHOP_STATE";
  var SHOPS_PATH = "/shops.php";
  var SETTINGS_URL = "/preferences.php";
  var ICON_ID = "aue-city-shop-icon";
  var TIP_ID = "aue-city-shop-tip";
  var STOCK_ID = "aue-city-shop-stock";
  var ALERT_ID = "aue-city-shop-alert";
  var FLASH_CLASS = "aue-bag-flash";
  var LIT_ATTR = "data-aue-city-lit";
  var BLUE_ATTR = "data-aue-city-blue";
  var bought = null;
  var lastFetch = 0;
  var deferred = 0;
  var restocked = [];
  var update = () => {
  };
  function tctMidnight() {
    return Math.floor(Date.now() / 1e3 / DAY_S) * DAY_S;
  }
  function readState() {
    try {
      const parsed = JSON.parse(readSetting(STATE_SETTING, ""));
      if (typeof parsed.day !== "number" || typeof parsed.bought !== "number" || typeof parsed.fetchedAt !== "number" || parsed.day !== tctMidnight()) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }
  function forgetCityShopCount() {
    writeSetting(STATE_SETTING, "");
    forgetStock();
    clearKeyRejection();
  }
  async function fetchShopBuys(key, from, limit) {
    const params = new URLSearchParams({
      log: String(SHOP_BUY_LOG_ID),
      from: String(from),
      limit: String(limit),
      key
    });
    const response = await fetch(`${LOG_URL}?${params}`, { credentials: "omit" });
    const body = await response.json();
    throwIfApiError(body);
    const entries2 = Array.isArray(body.log) ? body.log : [];
    log("city shop: log entries", entries2);
    return entries2;
  }
  function quantityOf(entry) {
    const data = entry.data ?? {};
    for (const field3 of ["quantity", "qty", "amount"]) {
      const value = data[field3];
      if (typeof value === "number") return value;
    }
    const items = data.items;
    if (Array.isArray(items)) {
      return items.reduce((sum, item) => {
        const row = item ?? {};
        const qty = row.qty ?? row.quantity ?? 1;
        return sum + (typeof qty === "number" ? qty : 1);
      }, 0);
    }
    return 1;
  }
  async function checkApiKey(key) {
    const reason = (error) => error instanceof Error ? error.message : "API error";
    try {
      await fetchShopBuys(key, tctMidnight(), 1);
    } catch (error) {
      return `Purchase log: ${reason(error)}`;
    }
    if (!isEnabled(CITY_SHOP_STOCK)) return null;
    try {
      await fetchCityShops(key);
    } catch (error) {
      return `Shop stock: ${reason(error)}`;
    }
    return null;
  }
  async function refreshStock(force) {
    const key = readSetting(API_KEY_SETTING, "").trim();
    if (!key || !isEnabled(CITY_SHOP_STOCK) || readCheckedItems().size === 0) return;
    if (document.hidden) return;
    const before = readStock();
    await loadStock(key, force ? 0 : STOCK_REFRESH_MS - STOCK_SLACK_MS);
    const after = readStock();
    if (!before || !after || after.fetchedAt === before.fetchedAt) return;
    noteRestocks(before.shops, after.shops);
  }
  function noteRestocks(before, after) {
    const checked = readCheckedItems();
    const was = /* @__PURE__ */ new Map();
    for (const shop of before) for (const item of shop.items) was.set(item.id, item.stock);
    for (const shop of after) {
      for (const item of shop.items) {
        if (!checked.has(item.id) || was.get(item.id) !== 0) continue;
        if (typeof item.stock !== "number" || item.stock <= 0) continue;
        if (restocked.some((seen4) => seen4.id === item.id)) continue;
        log("city shop: back in stock", item.name, item.stock);
        restocked.push({ id: item.id, name: item.name, url: shop.url });
      }
    }
  }
  async function refresh(force = false) {
    const key = readSetting(API_KEY_SETTING, "").trim();
    if (!key || !isEnabled(CITY_SHOP_ALERT) || keyRejection()) {
      bought = null;
      return;
    }
    const stored = readState();
    if (stored && !force && Date.now() - stored.fetchedAt < REFRESH_MS) {
      bought = stored.bought;
      return;
    }
    bought = stored ? stored.bought : null;
    if (document.hidden) return;
    const wait = lastFetch + MIN_GAP_MS - Date.now();
    if (wait > 0) {
      if (force && !deferred) {
        deferred = window.setTimeout(() => {
          deferred = 0;
          update(true);
        }, wait);
      }
      return;
    }
    lastFetch = Date.now();
    try {
      const day = tctMidnight();
      const entries2 = await fetchShopBuys(key, day, DAILY_LIMIT);
      const total = entries2.reduce((sum, entry) => sum + quantityOf(entry), 0);
      writeSetting(STATE_SETTING, JSON.stringify({ day, bought: total, fetchedAt: Date.now() }));
      bought = total;
      log("city shop:", bought, "bought today");
    } catch (error) {
      log("city shop: could not read the count", error);
      noteKeyFailure(error);
    }
  }
  function onPurchase(quantity) {
    const stored = readState();
    if (stored) {
      bought = stored.bought + quantity;
      writeSetting(STATE_SETTING, JSON.stringify({ ...stored, bought }));
      apply();
    }
    window.setTimeout(() => update(true), AFTER_BUY_MS);
  }
  function purchaseIn(node) {
    if (node instanceof Element && node.closest(`#${TIP_ID}, #${ICON_ID}`)) return 0;
    if (isLogEntry(node)) return 0;
    const match = PURCHASE_TEXT.exec(node.textContent ?? "");
    if (!match) return 0;
    return match[1] ? Number(match[1].replace(/,/g, "")) : 1;
  }
  function tornClass(prefix, scope, ruleContext) {
    const pattern = new RegExp(String.raw`(?:^|\s)(${prefix}\w+)`);
    for (const element of document.querySelectorAll(`${scope}[class*="${prefix}"]`)) {
      const match = pattern.exec(element.getAttribute("class") ?? "");
      if (match?.[1]) return match[1];
    }
    const rulePattern = new RegExp(String.raw`\.(${prefix}\w+)`);
    for (const sheet of document.styleSheets) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of rules) {
        if (!(rule instanceof CSSStyleRule) || !rule.selectorText.includes(ruleContext)) continue;
        const match = rulePattern.exec(rule.selectorText);
        if (match?.[1]) return match[1];
      }
    }
    return null;
  }
  function cityNavItem() {
    return document.querySelector(SELECTORS.cityItem) ?? document.querySelector(SELECTORS.cityLink)?.closest(SELECTORS.cityItemFromLink) ?? null;
  }
  function lendClass(element, on3, attr, find) {
    const owned = element.getAttribute(attr);
    if (on3) {
      if (owned) {
        if (!element.classList.contains(owned)) element.classList.add(owned);
        return;
      }
      const name = find();
      if (!name || element.classList.contains(name)) return;
      element.classList.add(name);
      element.setAttribute(attr, name);
    } else if (owned) {
      element.classList.remove(owned);
      element.removeAttribute(attr);
    }
  }
  function setCityLit(lit) {
    const item = cityNavItem();
    if (!item) return;
    lendClass(
      item,
      lit,
      LIT_ATTR,
      () => tornClass(ATTENTION_CLASS_PREFIX, "#sidebarroot ", "area-")
    );
    const icon = item.querySelector(SELECTORS.navIcon);
    if (icon) {
      lendClass(
        icon,
        lit,
        BLUE_ATTR,
        () => tornClass(BLUE_CLASS_PREFIX, `#sidebarroot ${SELECTORS.navIcon}`, "defaultIcon___")
      );
    }
  }
  function box(id) {
    let element = document.getElementById(id);
    if (!element) {
      element = document.createElement("div");
      element.id = id;
      element.hidden = true;
      document.body.appendChild(element);
    }
    return element;
  }
  function watchedStock() {
    if (!isEnabled(CITY_SHOP_STOCK)) return [];
    const checked = readCheckedItems();
    if (checked.size === 0) return [];
    return (readStock()?.shops ?? []).map((shop) => ({ ...shop, items: shop.items.filter((item) => checked.has(item.id)) })).filter((shop) => shop.items.length > 0);
  }
  function needsKey() {
    const wanted = isEnabled(CITY_SHOP_ALERT) || isEnabled(CITY_SHOP_STOCK);
    return wanted && (readSetting(API_KEY_SETTING, "").trim() === "" || keyRejection() !== "");
  }
  function openSettings() {
    writeSetting(PANEL_OPEN_SETTING, "1");
    location.assign(SETTINGS_URL);
  }
  function fillTip(tip) {
    const title = document.createElement("b");
    title.textContent = "City Shops";
    if (needsKey()) {
      const message = document.createElement("div");
      message.className = "aue-tip-message";
      const here = document.createElement("span");
      here.className = "aue-tip-link";
      here.textContent = "click here";
      const rejected = keyRejection();
      message.append(
        rejected ? `Torn refused the API key (${rejected}). Please ` : "This feature requires an API key. Please ",
        here,
        " to open Autumn's UI Enhancer settings."
      );
      tip.replaceChildren(title, message);
      return;
    }
    const count = document.createElement("div");
    count.textContent = `${bought ?? 0}/${DAILY_LIMIT} items bought today`;
    tip.replaceChildren(title, count);
  }
  function fillStock(list) {
    list.replaceChildren();
    for (const shop of watchedStock()) {
      const group = document.createElement("div");
      group.className = "aue-tip-shop";
      const link = document.createElement("a");
      link.href = shop.url;
      link.textContent = shop.name;
      group.appendChild(link);
      for (const item of shop.items) {
        const row = document.createElement("div");
        row.className = "aue-tip-item";
        const name = document.createElement("span");
        name.textContent = item.name;
        const stock = document.createElement("span");
        stock.textContent = typeof item.stock === "number" ? item.stock.toLocaleString() : "?";
        row.append(name, stock);
        group.appendChild(row);
      }
      list.appendChild(group);
    }
  }
  function refill(element, fill) {
    const fresh = document.createElement("div");
    try {
      fill(fresh);
    } catch (error) {
      log("city shop: could not fill", element.id, error);
    }
    if (fresh.innerHTML !== element.innerHTML) element.replaceChildren(...fresh.childNodes);
  }
  function showTip(icon) {
    if (!box(STOCK_ID).hidden) return;
    const tip = box(TIP_ID);
    refill(tip, fillTip);
    tip.hidden = false;
    const place = icon.getBoundingClientRect();
    const width = tip.offsetWidth;
    const centre2 = place.left + place.width / 2;
    const left = Math.min(Math.max(4, centre2 - width / 2), innerWidth - width - 4);
    tip.style.left = `${left + scrollX}px`;
    tip.style.top = `${place.top + scrollY - tip.offsetHeight - 8}px`;
    tip.style.setProperty("--aue-arrow-left", `${centre2 - left}px`);
  }
  function hideTip() {
    const tip = document.getElementById(TIP_ID);
    if (tip) tip.hidden = true;
  }
  function openStock(icon) {
    hideTip();
    const list = box(STOCK_ID);
    refill(list, fillStock);
    list.hidden = false;
    const place = icon.getBoundingClientRect();
    const width = list.offsetWidth;
    const left = Math.min(
      Math.max(4, place.left + place.width / 2 - width / 2),
      innerWidth - width - 4
    );
    list.style.left = `${left + scrollX}px`;
    list.style.top = `${place.bottom + scrollY + 6}px`;
  }
  function closeStock() {
    const list = document.getElementById(STOCK_ID);
    if (list) list.hidden = true;
  }
  function fillAlert(alert) {
    for (const item of restocked) {
      const link = document.createElement("a");
      link.href = item.url;
      link.textContent = `${item.name} back in stock`;
      alert.appendChild(link);
    }
  }
  function showAlert(on3) {
    const link = document.querySelector(`#${ICON_ID} a`);
    link?.classList.toggle(FLASH_CLASS, on3);
    const alert = document.getElementById(ALERT_ID);
    if (!on3 || !link) {
      if (alert) alert.hidden = true;
      return;
    }
    const shown = alert ?? box(ALERT_ID);
    refill(shown, fillAlert);
    shown.hidden = false;
    const place = link.getBoundingClientRect();
    const width = shown.offsetWidth;
    const left = Math.min(
      Math.max(4, place.left + place.width / 2 - width / 2),
      innerWidth - width - 4
    );
    shown.style.left = `${left + scrollX}px`;
    shown.style.top = `${place.bottom + scrollY + 6}px`;
  }
  function dismissAlert() {
    if (restocked.length === 0) return;
    restocked = [];
    showAlert(false);
  }
  function buildIcon() {
    const item = document.createElement("li");
    item.id = ICON_ID;
    const link = document.createElement("a");
    link.setAttribute("role", "button");
    link.tabIndex = 0;
    link.setAttribute("aria-label", "City shops");
    link.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        link.click();
      }
    });
    item.appendChild(link);
    let touch = false;
    link.addEventListener("pointerdown", (event) => touch = event.pointerType === "touch");
    link.addEventListener("pointerenter", (event) => {
      if (event.pointerType !== "touch") showTip(link);
    });
    link.addEventListener("pointerleave", (event) => {
      if (event.pointerType !== "touch") hideTip();
    });
    link.addEventListener("click", (event) => {
      event.preventDefault();
      if (touch && box(TIP_ID).hidden && box(STOCK_ID).hidden) {
        showTip(link);
        return;
      }
      if (needsKey()) {
        openSettings();
        return;
      }
      if (watchedStock().length === 0) {
        if (touch) hideTip();
        return;
      }
      if (box(STOCK_ID).hidden) openStock(link);
      else closeStock();
    });
    return item;
  }
  function placeIcon() {
    const list = document.querySelector(SELECTORS.statusList);
    if (!list) return;
    const icon = document.getElementById(ICON_ID) ?? buildIcon();
    const faction = list.querySelector(SELECTORS.factionIcon)?.closest("li");
    const bank = list.querySelector(SELECTORS.bankIcon)?.closest("li");
    if (faction) {
      if (faction.nextElementSibling !== icon) faction.after(icon);
    } else if (bank) {
      if (bank.previousElementSibling !== icon) bank.before(icon);
    } else if (icon.parentElement !== list) {
      list.appendChild(icon);
    }
    const neighbour = faction ?? bank ?? list.querySelector(`li:not(#${ICON_ID})`);
    if (neighbour) {
      const style = getComputedStyle(neighbour);
      if (icon.style.width !== style.width) icon.style.width = style.width;
      if (icon.style.height !== style.height) icon.style.height = style.height;
      if (icon.style.margin !== style.margin) icon.style.margin = style.margin;
    }
  }
  function apply() {
    const missingKey = needsKey();
    const known = isEnabled(CITY_SHOP_ALERT) && bought !== null && !missingKey;
    const left = known && (bought ?? 0) < DAILY_LIMIT;
    setCityLit(left);
    if (known || missingKey) {
      placeIcon();
      const link = document.querySelector(`#${ICON_ID} a`);
      const state = missingKey ? "nokey" : left ? "open" : "done";
      if (link && link.dataset.bag !== state) {
        link.dataset.bag = state;
        const bag = missingKey ? BAG_NO_KEY : left ? BAG_OPEN : BAG_DONE;
        link.style.backgroundImage = `url("${bag}")`;
      }
      const tip = document.getElementById(TIP_ID);
      if (tip && !tip.hidden) refill(tip, fillTip);
      const list = document.getElementById(STOCK_ID);
      if (list && !list.hidden) refill(list, fillStock);
      if (!left && known) restocked = [];
      showAlert(!missingKey && restocked.length > 0 && (list?.hidden ?? true));
    } else {
      document.getElementById(ICON_ID)?.remove();
      hideTip();
      closeStock();
      showAlert(false);
    }
  }
  function installCityShopAlert() {
    if (!isEnabled(CITY_SHOP_ALERT) && !isEnabled(CITY_SHOP_STOCK)) return;
    update = (force = false) => void Promise.all([refresh(force), refreshStock(force)]).then(apply);
    update();
    if (location.pathname === SHOPS_PATH) {
      new MutationObserver((records) => {
        for (const record of records) {
          const nodes = record.type === "characterData" ? [record.target] : record.addedNodes;
          for (const node of nodes) {
            const quantity = purchaseIn(node.nodeType === Node.TEXT_NODE ? node.parentNode ?? node : node);
            if (quantity > 0) {
              log("city shop: purchase seen", quantity);
              onPurchase(quantity);
              return;
            }
          }
        }
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    }
    setInterval(() => update(), STOCK_REFRESH_MS);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) update();
    });
    document.addEventListener("pointerdown", (event) => {
      const target = event.target;
      if (!(target instanceof Element && target.closest(`#${ALERT_ID}`))) dismissAlert();
      if (target instanceof Element && target.closest(`#${ICON_ID}, #${STOCK_ID}`)) return;
      hideTip();
      closeStock();
    });
    document.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest(`#${ALERT_ID} a`)) dismissAlert();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeStock();
    });
    let timer = 0;
    new MutationObserver((records) => {
      if (onlyOurs(records)) return;
      clearTimeout(timer);
      timer = window.setTimeout(apply, 120);
    }).observe(document.body, { childList: true, subtree: true });
  }

  // src/autumns-ui-enhancer/clash.ts
  var POPUP_ID = "aue-clash";
  var SEEN_KEY = "AUE_CLASH_SEEN";
  var RUNNING_ATTR = "data-aue-running";
  var KNOWN_SCRIPTS = [
    {
      name: "TornW3B Companion",
      selector: '[id^="w3b-"], [class^="w3b-"], [class*=" w3b-"], [data-w3b-chat-resize]'
    },
    { name: "TornTools", selector: '[id^="tt-"], [class^="tt-"], [class*=" tt-"]' }
  ];
  var W3B_ONE_TAB_LOCK = "w3b-chat-owner";
  var CHECK_AFTER_MS = [1500, 6e3, 15e3];
  var FIGHT_LIMIT = 6;
  var FIGHT_WINDOW_MS = 1e4;
  var SQUIGGLES = [
    [15, 0, -100],
    [50, 0, -90],
    [85, 0, -80],
    [15, 100, 100],
    [50, 100, 90],
    [85, 100, 80],
    [0, 50, 180],
    [100, 50, 0],
    [0, 0, -135],
    [100, 0, -45],
    [0, 100, 135],
    [100, 100, 45]
  ];
  var reported = /* @__PURE__ */ new Set();
  var waiting = [];
  function seen() {
    try {
      return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? "[]"));
    } catch {
      return /* @__PURE__ */ new Set();
    }
  }
  function keyOf(clash) {
    return `${clash.feature}|${clash.script ?? ""}`;
  }
  function reportClash(clash) {
    const key = keyOf(clash);
    if (reported.has(key) || seen().has(key)) return;
    reported.add(key);
    log("clash:", clash.feature, "with", clash.script ?? "an unknown script", "-", clash.how);
    if (!document.body) {
      waiting.push(clash);
      return;
    }
    addToPopup(clash);
  }
  function popup() {
    const existing = document.getElementById(POPUP_ID);
    if (existing) return existing;
    const box2 = document.createElement("div");
    box2.id = POPUP_ID;
    box2.setAttribute("role", "alert");
    const squiggles = SQUIGGLES.map(
      ([x, y, angle], index) => `<span class="aue-squiggle" style="left:${x}%;top:${y}%;--aue-angle:${angle}deg;animation-delay:${index % 4 * -0.3}s"><svg viewBox="0 0 30 10"><path d="M1 5q3.5-5 7 0t7 0 7 0 7 0"/></svg></span>`
    ).join("");
    box2.innerHTML = `<span class="aue-squiggles" aria-hidden="true">${squiggles}</span><div class="aue-clash-list"></div>`;
    const dismiss = () => {
      if (getSelection()?.toString()) return;
      const dismissed = seen();
      for (const key of reported) dismissed.add(key);
      try {
        sessionStorage.setItem(SEEN_KEY, JSON.stringify([...dismissed]));
      } catch {
      }
      box2.remove();
      document.removeEventListener("click", dismiss, true);
    };
    setTimeout(() => document.addEventListener("click", dismiss, true));
    document.body.appendChild(box2);
    return box2;
  }
  function addToPopup(clash) {
    const line = document.createElement("div");
    line.className = "aue-clash-line";
    const feature = document.createElement("span");
    feature.className = "aue-clash-feature";
    feature.textContent = clash.feature;
    const rest = clash.script ? ` clashes with ${clash.script}: ${clash.how}` : ` clash: ${clash.how}`;
    line.append(feature, rest);
    popup().querySelector(".aue-clash-list")?.appendChild(line);
  }
  function scriptsIn(root) {
    if (!root) return [];
    return KNOWN_SCRIPTS.filter(
      (script) => root.matches(script.selector) || root.querySelector(script.selector)
    ).map((script) => script.name);
  }
  var fights = /* @__PURE__ */ new Map();
  function noteUndone(feature, what, near) {
    const now = Date.now();
    const times = (fights.get(feature) ?? []).filter((time) => now - time < FIGHT_WINDOW_MS);
    times.push(now);
    fights.set(feature, times);
    if (times.length < FIGHT_LIMIT) return;
    const suspects = scriptsIn(near);
    const how = `something keeps undoing ${what}, so the two keep fighting over it. Try turning one of them off.`;
    reportClash(suspects.length > 0 ? { feature, script: suspects.join(" or "), how } : { feature, how });
  }
  function claimPage() {
    const root = document.documentElement;
    if (root.hasAttribute(RUNNING_ATTR)) {
      reportClash({
        feature: "Autumn's UI Enhancer",
        script: "another copy of itself",
        how: "it is installed or switched on twice, so this copy has stood down. Remove one in your userscript manager."
      });
      return false;
    }
    root.setAttribute(RUNNING_ATTR, "1.0.1");
    return true;
  }
  async function w3bOneTabOn() {
    try {
      const state = await navigator.locks.query();
      return [...state.held ?? [], ...state.pending ?? []].some(
        (lock) => lock.name === W3B_ONE_TAB_LOCK
      );
    } catch {
      return false;
    }
  }
  async function checkKnown() {
    if (isEnabled(INDEPENDENT_CHAT_TABS) && await w3bOneTabOn()) {
      reportClash({
        feature: "Independent Chat Tabs",
        script: "TornW3B Companion (Chat in one tab only)",
        how: "both decide which chats each tab shows, so chats can vanish or refuse to come back. Turn one of them off."
      });
    }
  }
  function installClashCheck(checkMarkers) {
    for (const clash of waiting.splice(0)) addToPopup(clash);
    if (!checkMarkers) return;
    for (const delay of CHECK_AFTER_MS) setTimeout(() => void checkKnown(), delay);
  }

  // src/autumns-ui-enhancer/tornForms.ts
  var RFCV_COOKIE = /(?:^|;\s*)rfc_v=([^;]+)/;
  async function postTorn(url, fields) {
    const rfcv = RFCV_COOKIE.exec(document.cookie)?.[1] ?? "";
    const response = await fetch(`${url}?rfcv=${encodeURIComponent(rfcv)}`, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest"
      },
      body: new URLSearchParams(fields).toString()
    });
    if (!response.ok) throw new Error(`Torn answered ${response.status}`);
    return response.text();
  }
  function cleanAmount(value, max) {
    const digits = value.replace(/\D+/g, "");
    const limit = Number(max);
    if (digits === "" || !(limit > 0)) return digits;
    return String(Math.min(Number(digits), limit));
  }
  function showReply(target, html) {
    const parsed = new DOMParser().parseFromString(html, "text/html").body;
    const copy = (from, to) => {
      for (const node of from.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          to.appendChild(document.createTextNode(node.textContent ?? ""));
        } else if (node instanceof Element && node.tagName === "B") {
          const bold = document.createElement("b");
          copy(node, bold);
          to.appendChild(bold);
        } else if (node instanceof Element && node.tagName === "A") {
          const href = node.getAttribute("href") ?? "";
          const link = document.createElement("a");
          if (href.startsWith("/")) link.href = href;
          link.className = "aue-send-link";
          copy(node, link);
          to.appendChild(link);
        } else {
          copy(node, to);
        }
      }
    };
    target.replaceChildren();
    copy(parsed, target);
  }
  function field(label, className, value) {
    const wrap = document.createElement("label");
    wrap.className = `aue-send-field ${className}`;
    const caption = document.createElement("span");
    caption.textContent = label;
    const input = document.createElement("input");
    input.type = "text";
    input.value = value;
    wrap.append(caption, input);
    return wrap;
  }
  function tornButton(text, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `torn-btn ${className}`;
    button.textContent = text;
    return button;
  }

  // src/autumns-ui-enhancer/displayCase.ts
  var DISPLAY_URL = "https://www.torn.com/displaycase.php";
  var INVENTORY_URL = "https://www.torn.com/inventory.php";
  var SELECTORS2 = {
    // One item in a category's list: <ul class="items-cont …"><li data-item="27"
    // data-category="Primary" data-armoryid="2182…" data-qty="" data-rowkey="u2182…">.
    // data-qty is empty for a single item. The loadout's equipped tiles are built
    // the same way, which is why the list is named.
    row: ".items-cont > li[data-item][data-category][data-rowkey]",
    // The row's own buttons: <div class="actions right"><ul class="actions-wrap">
    // with Equip, Send, Sell, Trash, then <li class="clear">. Every slot is
    // used by some item, so the button is a fifth.
    actionsBox: ".actions",
    actions: ".actions-wrap",
    // Damage, accuracy and the rest, pinned the actions' width from the right.
    bonuses: ".bonuses",
    // In the list view, the picture and name: <div class="title left"> at the
    // row's width less the actions' (646 of 784), holding the 58px picture and
    // <span class="name-wrap"> at 576px plus 12px padding. Both give up a slot.
    title: ".title-wrap > .title",
    nameWrap: ".title-wrap > .title > .name-wrap",
    // A faction's item on loan, which has Return in place of Send.
    loaned: "[data-action='return'], .actions-wrap > li.return",
    // Torn's narrow layout, where the actions open as a bar under the item.
    accordion: ".ui-accordion-content, .ui-accordion-header",
    // An equippable item's Equip button names its copy in the inventory.
    equip: "[data-action='equip'][data-id]",
    name: ".name-wrap .name",
    // The counts the row shows: <span class="qty bold d-hide">x5</span> and its
    // t-hide twin beside the name, and <div class="item-amount qty">5</div>.
    nameCount: ".name-wrap > .qty",
    pictureCount: ".item-amount.qty",
    // The part of the row the panel goes after.
    body: ".cont-wrap"
  };
  var FIVE_CLASS = "aue-display-five";
  var ROW_ATTR = "data-aue-display-row";
  var PENDING_ATTR = "data-aue-pending";
  var SETTLE_MS = 150;
  var SVG_NS = "http://www.w3.org/2000/svg";
  var CASE_PATH = "M3 2h18v20H3zM5.5 4.5v15h5.25v-15zM13.25 4.5v15h5.25v-15z";
  function readRow(row) {
    const key = row.dataset.rowkey ?? "";
    const itemId = row.dataset.item ?? "";
    const category = row.dataset.category ?? "";
    if (!/^[\w-]+$/.test(key) || !/^\d+$/.test(itemId) || !category) return null;
    const copyId = row.dataset.armoryid ?? row.querySelector(SELECTORS2.equip)?.dataset.id ?? "";
    const name = row.querySelector(SELECTORS2.name)?.textContent?.trim() ?? "";
    const held = Number(row.dataset.qty) || 1;
    return { key, itemId, category, copyId: /^\d+$/.test(copyId) ? copyId : "", name, held };
  }
  function caseIcon() {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("aue-display-icon");
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", CASE_PATH);
    path.setAttribute("fill", "currentColor");
    path.setAttribute("fill-rule", "evenodd");
    svg.appendChild(path);
    return svg;
  }
  function buildBlank(key) {
    const item = document.createElement("li");
    item.className = "left aue-display-slot aue-display-blank";
    item.id = `aue-display-blank-${key}`;
    return item;
  }
  function buildOption(key, name) {
    const item = document.createElement("li");
    item.className = "left aue-display-slot aue-display-option";
    item.id = `aue-display-${key}`;
    item.setAttribute(ROW_ATTR, key);
    const wrap = document.createElement("span");
    wrap.className = "icon-h";
    wrap.title = "Display this Item";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "wai-btn aue-display-button";
    button.setAttribute("aria-label", `Add ${name} to your display case`);
    button.appendChild(caseIcon());
    const label = document.createElement("span");
    label.className = "opt-name";
    label.append("Display ");
    const more2 = document.createElement("span");
    more2.className = "t-hide";
    more2.textContent = "this Item";
    label.appendChild(more2);
    wrap.append(button, label);
    item.appendChild(wrap);
    return item;
  }
  function buildPanel(row) {
    const panel = document.createElement("div");
    panel.className = "aue-send aue-display";
    panel.id = `aue-display-panel-${row.key}`;
    panel.setAttribute(ROW_ATTR, row.key);
    panel.hidden = true;
    const form = document.createElement("div");
    form.className = "aue-send-form";
    if (row.held > 1) {
      const amount = field("Amount", "aue-send-amount", "1");
      amount.querySelector("input")?.setAttribute("inputmode", "numeric");
      form.appendChild(amount);
    }
    form.appendChild(tornButton("ADD", "aue-display-add"));
    const confirm = document.createElement("div");
    confirm.className = "aue-send-confirm";
    confirm.hidden = true;
    const question = document.createElement("div");
    question.className = "aue-send-question";
    confirm.append(question, tornButton("YES", "aue-display-yes"), tornButton("NO", "aue-display-no"));
    const status = document.createElement("div");
    status.className = "aue-send-status";
    status.hidden = true;
    panel.append(form, confirm, status);
    return panel;
  }
  function rowFor(key) {
    return document.querySelector(`${SELECTORS2.row}[data-rowkey="${key}"]`);
  }
  function say(panel, html, failed) {
    const status = panel.querySelector(".aue-send-status");
    if (!status) return;
    showReply(status, html);
    status.classList.toggle("aue-send-failed", failed);
    status.hidden = false;
  }
  function togglePanel(key) {
    const rowElement = rowFor(key);
    const row = rowElement && readRow(rowElement);
    if (!rowElement || !row) return;
    let panel = document.getElementById(`aue-display-panel-${key}`);
    if (!panel) {
      panel = buildPanel(row);
      const body = rowElement.querySelector(SELECTORS2.body);
      if (body) body.insertAdjacentElement("afterend", panel);
      else rowElement.appendChild(panel);
    }
    panel.hidden = !panel.hidden;
    if (panel.hidden) return;
    closePanels(panel);
    cancelAdd(panel);
    panel.querySelector(".aue-send-status")?.setAttribute("hidden", "");
    if (!row.copyId && !panel.hasAttribute(COPY_ATTR)) void lookUp(panel, row);
  }
  function closePanels(except) {
    for (const open of document.querySelectorAll(".aue-display:not([hidden])")) {
      if (open !== except) open.hidden = true;
    }
  }
  function updateCount(rowElement, held) {
    if (held <= 0) {
      rowElement.style.display = "none";
      return;
    }
    rowElement.dataset.qty = String(held);
    for (const label of rowElement.querySelectorAll(SELECTORS2.nameCount)) {
      label.textContent = held > 1 ? `x${held}` : "";
    }
    const badge = rowElement.querySelector(SELECTORS2.pictureCount);
    if (badge) badge.textContent = held > 1 ? String(held) : "";
  }
  var COPY_ATTR = "data-aue-copy";
  var TYPE_ATTR = "data-aue-type";
  var inventory = /* @__PURE__ */ new Map();
  var listNext = /* @__PURE__ */ new Map();
  var LIST_PAGES_MAX = 10;
  async function findCopy(itemId, category) {
    for (const type of ["All", category]) {
      for (let page = 0; page < LIST_PAGES_MAX && !inventory.has(itemId); page += 1) {
        const start2 = listNext.get(type) ?? 0;
        if (listNext.get(type) === null) break;
        const reply = JSON.parse(
          await postTorn(INVENTORY_URL, { step: "getList", type, start: String(start2) })
        );
        for (const entry of reply.list ?? []) {
          const kind = String(entry.itemID ?? entry.ID ?? "");
          if (kind && !entry.equiped && !inventory.has(kind)) inventory.set(kind, entry);
        }
        const next = reply.start;
        const done = reply.loaded === true || !reply.list?.length || typeof next !== "number" || next <= start2;
        listNext.set(type, done ? null : next);
      }
      if (inventory.has(itemId)) break;
    }
    return inventory.get(itemId) ?? null;
  }
  async function lookUp(panel, row) {
    panel.setAttribute(COPY_ATTR, "");
    try {
      const entry = await findCopy(row.itemId, row.category);
      const copy = String(entry?.armoryID ?? "");
      if (!entry || !/^\d+$/.test(copy)) {
        panel.removeAttribute(COPY_ATTR);
        say(panel, "Couldn't find this item in your inventory.", true);
        log("display case: item", row.itemId, "not in the inventory list");
        return;
      }
      panel.setAttribute(COPY_ATTR, copy);
      if (entry.type2) panel.setAttribute(TYPE_ATTR, entry.type2);
      log("display case: item", row.itemId, "is copy", copy, entry.type2);
    } catch (error) {
      panel.removeAttribute(COPY_ATTR);
      say(panel, "Couldn't reach Torn. Try again.", true);
      log("display case: inventory lookup failed", error);
    }
  }
  function heldFor(panel) {
    const rowElement = rowFor(panel.getAttribute(ROW_ATTR) ?? "");
    return (rowElement && readRow(rowElement)?.held) ?? 0;
  }
  function askToAdd(panel) {
    const rowElement = rowFor(panel.getAttribute(ROW_ATTR) ?? "");
    const row = rowElement && readRow(rowElement);
    if (!row) {
      say(panel, "This item is no longer on the page.", true);
      return;
    }
    const typed = panel.querySelector(".aue-send-amount input")?.value ?? "1";
    const amount = cleanAmount(typed, String(heldFor(panel)));
    if (!amount || amount === "0") {
      say(panel, "How many should go in?", true);
      return;
    }
    const copyId = row.copyId || panel.getAttribute(COPY_ATTR) || "";
    if (!copyId) {
      say(
        panel,
        panel.hasAttribute(COPY_ATTR) ? "Still finding this item, try again in a moment." : "Couldn't find this item in your inventory.",
        true
      );
      return;
    }
    const fields = {
      "items[0][amount]": amount,
      // The inventory list's own category name where it was looked up, as the
      // row's can differ: the row's Miscellaneous is the list's Other.
      "items[0][type]": panel.getAttribute(TYPE_ATTR) || row.category,
      "items[0][id]": copyId,
      "items[0][itemID]": row.itemId,
      step: "addInventoryItems"
    };
    panel.setAttribute(PENDING_ATTR, JSON.stringify(fields));
    const question = panel.querySelector(".aue-send-question");
    if (question) {
      question.replaceChildren(`Add ${amount} x `);
      const name = document.createElement("b");
      name.textContent = row.name || "this item";
      question.append(name, " to your display case?");
    }
    panel.querySelector(".aue-send-form")?.setAttribute("hidden", "");
    panel.querySelector(".aue-send-status")?.setAttribute("hidden", "");
    panel.querySelector(".aue-send-confirm")?.removeAttribute("hidden");
    panel.querySelector(".aue-display-yes")?.focus();
  }
  async function addNow(panel) {
    const yes = panel.querySelector(".aue-display-yes");
    const raw = panel.getAttribute(PENDING_ATTR);
    if (!yes || yes.disabled || !raw) return;
    const fields = JSON.parse(raw);
    yes.disabled = true;
    try {
      const reply = JSON.parse(await postTorn(DISPLAY_URL, fields));
      log("display case: Torn answered", reply);
      panel.removeAttribute(PENDING_ATTR);
      panel.querySelector(".aue-send-confirm")?.setAttribute("hidden", "");
      const text = reply.logs?.join(" ") || reply.text || "";
      if (reply.success) {
        const left = heldFor(panel) - Number(fields["items[0][amount]"]);
        const amount = panel.querySelector(".aue-send-amount input");
        if (amount) amount.value = "1";
        say(panel, text || "Added.", false);
        const close = document.createElement("a");
        close.href = "#";
        close.className = "aue-send-link aue-display-close";
        close.textContent = "Close";
        panel.querySelector(".aue-send-status")?.append(" ", close);
        const rowElement = rowFor(panel.getAttribute(ROW_ATTR) ?? "");
        if (rowElement) updateCount(rowElement, left);
      } else {
        panel.querySelector(".aue-send-form")?.removeAttribute("hidden");
        say(panel, text || "Torn wouldn't add that.", true);
      }
    } catch (error) {
      say(panel, "Couldn't reach Torn. Try again.", true);
      log("display case: request failed", error);
    } finally {
      yes.disabled = false;
    }
  }
  function cancelAdd(panel) {
    panel.removeAttribute(PENDING_ATTR);
    panel.querySelector(".aue-send-confirm")?.setAttribute("hidden", "");
    panel.querySelector(".aue-send-form")?.removeAttribute("hidden");
  }
  function scan() {
    if (!isEnabled(DISPLAY_CASE_BUTTON)) return;
    let added = 0;
    for (const rowElement of document.querySelectorAll(SELECTORS2.row)) {
      const row = readRow(rowElement);
      const actions = rowElement.querySelector(SELECTORS2.actions);
      if (!row || !actions) continue;
      const existing = rowElement.querySelector(".aue-display-option");
      const blank = rowElement.querySelector(".aue-display-blank");
      if (!canDisplay(rowElement)) {
        if (existing) removeFrom(rowElement);
        if (!blank) actions.prepend(buildBlank(row.key));
        if (rowElement.querySelector(SELECTORS2.accordion)) actions.classList.add(FIVE_CLASS);
        continue;
      }
      if (existing) continue;
      blank?.remove();
      const option = buildOption(row.key, row.name);
      actions.prepend(option);
      if (rowElement.querySelector(SELECTORS2.accordion)) actions.classList.add(FIVE_CLASS);
      added += 1;
    }
    if (added > 0) log("display case: buttons added to", added, "items");
    for (const rowElement of document.querySelectorAll(SELECTORS2.row)) {
      const narrowLayout = rowElement.querySelector(SELECTORS2.accordion) !== null;
      rowElement.querySelector(SELECTORS2.actions)?.classList.toggle(FIVE_CLASS, narrowLayout);
      matchNeighbour(rowElement);
      widen(rowElement);
    }
  }
  function relayout() {
    for (const rowElement of document.querySelectorAll(SELECTORS2.row)) {
      unwiden(rowElement);
      rowElement.querySelector(SELECTORS2.actionsBox)?.removeAttribute(WIDE_ATTR);
      rowElement.querySelector(".aue-display-option")?.removeAttribute(MATCHED_ATTR);
      const button = rowElement.querySelector(".aue-display-button");
      button?.removeAttribute("style");
    }
    scan();
  }
  function canDisplay(rowElement) {
    if (rowElement.dataset.equipped === "true" || rowElement.classList.contains("bg-green")) return false;
    return rowElement.querySelector(SELECTORS2.loaned) === null;
  }
  function removeFrom(rowElement) {
    rowElement.querySelector(".aue-display-option")?.remove();
    rowElement.querySelector(".aue-display")?.remove();
    unwiden(rowElement);
    rowElement.querySelector(SELECTORS2.actionsBox)?.removeAttribute(WIDE_ATTR);
  }
  var MATCHED_ATTR = "data-aue-matched";
  function matchNeighbour(rowElement) {
    const option = rowElement.querySelector(".aue-display-option");
    const button = option?.querySelector(".aue-display-button");
    const neighbour = option?.nextElementSibling;
    const theirs = neighbour?.querySelector("button");
    if (!option || !button || !neighbour || !theirs || option.hasAttribute(MATCHED_ATTR)) return;
    const slot = neighbour.getBoundingClientRect();
    const face = theirs.getBoundingClientRect();
    if (face.width === 0 || face.height === 0) return;
    button.style.width = `${face.width}px`;
    button.style.height = `${face.height}px`;
    button.style.marginTop = `${face.top - slot.top}px`;
    button.style.marginLeft = "auto";
    button.style.marginRight = "auto";
    option.setAttribute(MATCHED_ATTR, "");
  }
  var WIDE_ATTR = "data-aue-wide";
  var NARROWED = [SELECTORS2.title, SELECTORS2.nameWrap, SELECTORS2.bonuses];
  function unwiden(rowElement) {
    const box2 = rowElement.querySelector(SELECTORS2.actionsBox);
    box2?.style.removeProperty("width");
    for (const selector of NARROWED) {
      rowElement.querySelector(selector)?.style.removeProperty("width");
    }
    rowElement.querySelector(SELECTORS2.bonuses)?.style.removeProperty("right");
  }
  function narrow(element, by) {
    if (!element) return;
    const own = parseFloat(getComputedStyle(element).width);
    if (own > by) element.style.setProperty("width", `${own - by}px`, "important");
  }
  function level(a, b) {
    return Math.abs(a.getBoundingClientRect().top - b.getBoundingClientRect().top) <= 2;
  }
  function widen(rowElement) {
    const box2 = rowElement.querySelector(SELECTORS2.actionsBox);
    const option = rowElement.querySelector(".aue-display-slot");
    if (!box2 || !option || box2.hasAttribute(WIDE_ATTR)) return;
    const boxWidth = box2.getBoundingClientRect().width;
    if (boxWidth === 0) return;
    if (getComputedStyle(box2).float !== "right" || rowElement.querySelector(SELECTORS2.accordion)) {
      box2.setAttribute(WIDE_ATTR, "");
      return;
    }
    const slots = [...box2.querySelectorAll(".actions-wrap > li.left")];
    const needed = Math.ceil(slots.reduce((sum, slotElement) => {
      const style = getComputedStyle(slotElement);
      return sum + slotElement.getBoundingClientRect().width + parseFloat(style.marginLeft) + parseFloat(style.marginRight);
    }, 0));
    const slot = needed - boxWidth;
    if (slot <= 0) {
      box2.setAttribute(WIDE_ATTR, String(boxWidth));
      return;
    }
    const boxTop = box2.getBoundingClientRect().top;
    const title = rowElement.querySelector(SELECTORS2.title);
    const bonuses = rowElement.querySelector(SELECTORS2.bonuses);
    const pinned = bonuses !== null && getComputedStyle(bonuses).position === "absolute";
    const titleBeside = title !== null && level(title, box2);
    const bonusesBeside = bonuses !== null && !pinned && level(bonuses, box2);
    const neighbour = titleBeside ? title : bonusesBeside ? bonuses : null;
    const neighbourHeight = neighbour?.getBoundingClientRect().height ?? 0;
    const width = boxWidth + slot;
    box2.style.setProperty("width", `${width}px`, "important");
    if (titleBeside) {
      narrow(title, slot);
      narrow(rowElement.querySelector(SELECTORS2.nameWrap), slot);
    }
    if (bonusesBeside) narrow(bonuses, slot);
    if (pinned) bonuses.style.setProperty("right", `${width}px`, "important");
    const lastSlot = slots[slots.length - 1];
    const stayed = Math.abs(box2.getBoundingClientRect().top - boxTop) <= 1;
    const oneLine = !lastSlot || level(lastSlot, option);
    const neighbourKept = !neighbour || neighbour.getBoundingClientRect().height <= neighbourHeight + 1;
    if (!stayed || !oneLine || !neighbourKept) {
      unwiden(rowElement);
      box2.setAttribute(WIDE_ATTR, "");
      log("display case: no room for a fifth slot in", rowElement.dataset.rowkey);
      return;
    }
    box2.setAttribute(WIDE_ATTR, String(width));
  }
  function installListeners() {
    document.addEventListener(
      "click",
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (!target.closest(".aue-display")) setTimeout(scan, SETTLE_MS * 2);
        const clickedRow = target.closest(SELECTORS2.row);
        if (clickedRow) closePanels(clickedRow.querySelector(".aue-display"));
        const option = target.closest(".aue-display-option");
        if (option) {
          event.preventDefault();
          event.stopPropagation();
          togglePanel(option.getAttribute(ROW_ATTR) ?? "");
          return;
        }
        const panel = target.closest(".aue-display");
        if (!panel) return;
        event.stopPropagation();
        if (target.closest(".aue-display-close")) {
          event.preventDefault();
          panel.hidden = true;
        } else if (target.closest(".aue-display-add")) askToAdd(panel);
        else if (target.closest(".aue-display-yes")) void addNow(panel);
        else if (target.closest(".aue-display-no")) cancelAdd(panel);
      },
      true
    );
    document.addEventListener(
      "beforeinput",
      (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement) || !target.closest(".aue-display .aue-send-amount")) return;
        if (event.data && /\D/.test(event.data)) event.preventDefault();
      },
      true
    );
    document.addEventListener(
      "input",
      (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement) || !target.closest(".aue-display .aue-send-amount")) return;
        const panel = target.closest(".aue-display");
        const held = panel ? String(heldFor(panel)) : "";
        const cleaned = cleanAmount(target.value, held);
        if (cleaned !== target.value) target.value = cleaned;
      },
      true
    );
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Enter") return;
        const target = event.target;
        if (target instanceof Element && target.closest(".aue-display")) event.preventDefault();
      },
      true
    );
  }
  function installDisplayCase() {
    if (!isEnabled(DISPLAY_CASE_BUTTON)) {
      log("display case: switched off");
      return;
    }
    installListeners();
    scan();
    let resizeTimer = 0;
    addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(relayout, SETTLE_MS * 2);
    });
    let timer = 0;
    new MutationObserver((records) => {
      if (onlyOurs(records)) return;
      clearTimeout(timer);
      timer = window.setTimeout(scan, SETTLE_MS);
    }).observe(document.body, { childList: true, subtree: true });
  }

  // src/autumns-ui-enhancer/forumSearch.ts
  var FORUMS_PATH = "/forums.php";
  var SELECTORS3 = {
    /** The search box of Torn's own form, on the forums home. */
    tornSearchInput: 'input[placeholder*="search term" i]',
    /** Torn's forum menu, read for the forum names and numbers. */
    tornForumSelect: "select#forum-category",
    /** The results list, tagged with the words searched and whether the match was exact. */
    results: ".forums-thread[data-words]",
    /** The block the results page's pager, breadcrumbs and results sit in. */
    resultsWrap: ".search-wrap",
    /** One result. */
    result: "ul.thread-list > li",
    title: ".title-black",
    /** Holds data-thread, data-post and data-author. */
    postWrap: ".post-wrap",
    /** "View this post in the X forum", linking to the post with f= for the forum. */
    postLink: "a.search-link",
    created: ".time-wrap .created",
    body: ".post",
    authorName: ".poster-name",
    karma: "li.karma"
  };
  var PANEL_ID = "aue-forum-search";
  var RANKED_ID = "aue-forum-ranked";
  var FILTERED_CLASS = "aue-search-filtered";
  var ENDED_CLASS = "aue-search-ended";
  var RANKED_CLASS = "aue-search-ranked";
  var EXCLUDED_SETTING = "FORUM_SEARCH_EXCLUDED";
  var PICKED_SETTING = "FORUM_SEARCH_PICKED";
  var SINCE_SETTING = "FORUM_SEARCH_SINCE";
  var BEFORE_SETTING = "FORUM_SEARCH_BEFORE";
  var ORDER_SETTING = "FORUM_SEARCH_ORDER";
  var FORUMS_SETTING = "FORUM_SEARCH_FORUMS";
  var TYPES = [
    ["0", "All Posts"],
    ["3", "Thread Titles"],
    ["1", "Original Posts"],
    ["2", "Thread Replies"],
    ["4", "Thread with Polls"]
  ];
  var BUILT_IN_FORUMS = [
    ["1", "Announcements"],
    ["8", "Donator Forum"],
    ["9991", "My Faction"],
    ["9992", "My Company"],
    ["2", "General Discussion"],
    ["3", "Questions & Answers"],
    ["61", "Tutorials & Guides"],
    ["10", "Trading Post"],
    ["13", "Fun & Games"],
    ["62", "Community Events"],
    ["16", "Achievements"],
    ["9", "Faction Discussion"],
    ["24", "Faction Recruitment"],
    ["20", "Company Discussion"],
    ["46", "Company Recruitment"],
    ["59", "Attacking"],
    ["11", "Stock Market"],
    ["22", "Properties"],
    ["15", "Gambling"],
    ["69", "Poker"],
    ["21", "Racing"],
    ["47", "Missions"],
    ["23", "Graphics"],
    ["67", "Tools & Userscripts"],
    ["14", "Discord"],
    ["63", "API Development"],
    ["19", "Bugs & Issues"],
    ["4", "Suggestions"],
    ["17", "Graveyard"],
    ["38", "Politics & Law"],
    ["6", "General Non-related"],
    ["40", "Gaming"],
    ["41", "Music"],
    ["7", "Roleplay"],
    ["35", "TV & Movies"],
    ["37", "Sports"],
    ["49", "Art & Literature"],
    ["36", "Technology"],
    ["54", "Food & Cooking"],
    ["52", "Hobbies & Interests"],
    ["39", "Health & Fitness"],
    ["53", "Paranormal"],
    ["56", "Travel & Culture"],
    ["55", "Animals & Nature"],
    ["50", "Science"],
    ["51", "Motoring"]
  ];
  function readIds(setting) {
    try {
      const parsed = JSON.parse(readSetting(setting, "[]"));
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  function forumList() {
    const select = document.querySelector(SELECTORS3.tornForumSelect);
    if (select) {
      const read = [...select.options].filter((option) => option.value !== "0").map((option) => [option.value, (option.textContent ?? "").trim()]);
      if (read.length > 0) {
        writeSetting(FORUMS_SETTING, JSON.stringify(read));
        return read;
      }
    }
    try {
      const kept = JSON.parse(readSetting(FORUMS_SETTING, ""));
      if (Array.isArray(kept) && kept.length > 0) return kept;
    } catch {
    }
    return BUILT_IN_FORUMS;
  }
  function currentSearch() {
    const params = new URLSearchParams(location.search || location.hash.replace(/^#[!/]*/, "?"));
    const fromHash = new URLSearchParams(location.hash.replace(/^#[!/]*/, ""));
    const read = (name) => fromHash.get(name) ?? params.get(name) ?? "";
    return { q: read("q"), f: read("f") || "0", y: read("y") || "0" };
  }
  function onResultsPage() {
    return document.querySelector(SELECTORS3.results) !== null;
  }
  function dayStart(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const time = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(time) ? time : null;
  }
  function readPosted(text) {
    const match = /(\d{2}):(\d{2}):(\d{2})\s*-\s*(\d{2})\/(\d{2})\/(\d{2})/.exec(text);
    if (!match) return null;
    const [, h, m, s, d, mo, y] = match.map(Number);
    return Date.UTC(2e3 + (y ?? 0), (mo ?? 1) - 1, d, h, m, s);
  }
  function readResult(item) {
    const wrap = item.querySelector(SELECTORS3.postWrap);
    const link = item.querySelector(SELECTORS3.postLink);
    if (!wrap || !link) return null;
    const href = link.getAttribute("href") ?? "";
    const forumName = /in the (.+?) forum/i.exec(link.textContent ?? "")?.[1]?.trim() ?? "";
    const karmaText = item.querySelector(SELECTORS3.karma)?.textContent ?? "";
    return {
      item,
      thread: wrap.dataset.thread ?? "",
      post: wrap.dataset.post ?? "",
      title: (item.querySelector(SELECTORS3.title)?.textContent ?? "").trim(),
      forumId: /[?&]f=(\d+)/.exec(href)?.[1] ?? "",
      forumName,
      link: href,
      posted: readPosted(item.querySelector(SELECTORS3.created)?.textContent ?? ""),
      author: (item.querySelector(SELECTORS3.authorName)?.textContent ?? "").trim(),
      karma: Number(karmaText.replace(/[^\d]/g, "")) || 0,
      text: (item.querySelector(SELECTORS3.body)?.textContent ?? "").replace(/\s+/g, " ").trim()
    };
  }
  function searchTerms(list) {
    const words = (list.getAttribute("data-words") ?? "").split(",").map((word) => word.trim()).filter(Boolean);
    if (list.getAttribute("data-exact-match") === "1" && words.length > 1) return [words.join(" ")];
    return words;
  }
  function termPattern(terms) {
    if (terms.length === 0) return null;
    const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"));
    return new RegExp(`\\b(?:${escaped.join("|")})\\b`, "gi");
  }
  function onlyForums() {
    return currentSearch().f === "0" ? new Set(readIds(PICKED_SETTING)) : /* @__PURE__ */ new Set();
  }
  function passes(result, only, excluded, since, before) {
    if (only.size > 0 && !only.has(result.forumId)) return false;
    if (excluded.has(result.forumId)) return false;
    if (result.posted !== null) {
      if (since !== null && result.posted < since) return false;
      if (before !== null && result.posted >= before + 864e5) return false;
    }
    return true;
  }
  function scoreThread(group, pattern, now) {
    const titleHit = pattern !== null && new RegExp(pattern.source, "i").test(group.title) ? 3 : 0;
    const matches = Math.log2(1 + group.posts.length) * 2;
    const longest = Math.max(...group.posts.map((post) => post.text.length));
    const length = Math.min(2, longest / 1500);
    const karma = Math.log10(1 + Math.max(...group.posts.map((post) => post.karma))) / 2;
    const newest = Math.max(...group.posts.map((post) => post.posted ?? 0));
    const ageDays = newest > 0 ? (now - newest) / 864e5 : 3650;
    const recency = 1.5 * Math.exp(-ageDays / 365);
    return titleHit + matches + length + karma + recency;
  }
  function highlighted(text, pattern) {
    const fragment = document.createDocumentFragment();
    if (!pattern) {
      fragment.append(text);
      return fragment;
    }
    let at = 0;
    for (const match of text.matchAll(new RegExp(pattern.source, "gi"))) {
      const index = match.index ?? 0;
      fragment.append(text.slice(at, index));
      const mark = document.createElement("mark");
      mark.textContent = match[0];
      fragment.append(mark);
      at = index + match[0].length;
    }
    fragment.append(text.slice(at));
    return fragment;
  }
  function snippet(text, pattern) {
    const index = pattern ? text.search(new RegExp(pattern.source, "i")) : -1;
    const from = Math.max(0, index - 120);
    const cut = text.slice(from, from + 300);
    return `${from > 0 ? "..." : ""}${cut}${from + 300 < text.length ? "..." : ""}`;
  }
  function shortDate(time) {
    if (time === null) return "";
    return new Date(time).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  }
  function threadCard(group, pattern) {
    const card = document.createElement("div");
    card.className = "aue-search-thread";
    const head = document.createElement("div");
    head.className = "aue-search-head";
    const title = document.createElement("a");
    title.className = "aue-search-title";
    title.href = group.posts[0]?.link ?? "#";
    title.append(highlighted(group.title, pattern));
    const meta = document.createElement("span");
    meta.className = "aue-search-meta";
    const count = group.posts.length;
    meta.textContent = `${group.forumName} · ${count} matching post${count === 1 ? "" : "s"}`;
    head.append(title, meta);
    card.append(head);
    for (const post of group.posts) {
      const row = document.createElement("a");
      row.className = "aue-search-post";
      row.href = post.link;
      const by = document.createElement("span");
      by.className = "aue-search-by";
      by.textContent = `${post.author}, ${shortDate(post.posted)}`;
      const text = document.createElement("span");
      text.className = "aue-search-text";
      text.append(highlighted(snippet(post.text, pattern), pattern));
      row.append(by, text);
      card.append(row);
    }
    return card;
  }
  function applyToResults() {
    const list = document.querySelector(SELECTORS3.results);
    if (!list) return;
    const only = onlyForums();
    const excluded = new Set(readIds(EXCLUDED_SETTING));
    const since = dayStart(readSetting(SINCE_SETTING, ""));
    const before = dayStart(readSetting(BEFORE_SETTING, ""));
    const order = readSetting(ORDER_SETTING, "best");
    const extra = readExtra();
    const extraOk = extraFilter(extra);
    const pattern = termPattern([...searchTerms(list), ...extra ? [...extra.phrases, ...extra.words] : []]);
    const results = [...list.querySelectorAll(SELECTORS3.result)].map(readResult).filter((result) => result !== null);
    const kept = [];
    for (const result of results) {
      const ok = passes(result, only, excluded, since, before) && extraOk(result);
      result.item.classList.toggle(FILTERED_CLASS, !ok);
      if (ok) kept.push(result);
    }
    const oldest = Math.min(...results.map((result) => result.posted ?? Infinity));
    document.body.classList.toggle(ENDED_CLASS, since !== null && oldest < since);
    document.body.classList.toggle(RANKED_CLASS, order === "best");
    let ranked = document.getElementById(RANKED_ID);
    if (order !== "best") {
      ranked?.remove();
    } else {
      const groups = /* @__PURE__ */ new Map();
      for (const result of kept) {
        const group = groups.get(result.thread) ?? {
          thread: result.thread,
          title: result.title,
          forumName: result.forumName,
          posts: [],
          score: 0
        };
        group.posts.push(result);
        groups.set(result.thread, group);
      }
      const now = Date.now();
      const sorted = [...groups.values()];
      for (const group of sorted) group.score = scoreThread(group, pattern, now);
      sorted.sort((a, b) => b.score - a.score);
      if (!ranked) {
        ranked = document.createElement("div");
        ranked.id = RANKED_ID;
        list.before(ranked);
      }
      const summary = document.createElement("div");
      summary.className = "aue-search-summary";
      const left = results.length - kept.length;
      summary.textContent = `${sorted.length} thread${sorted.length === 1 ? "" : "s"} from ${results.length} results loaded` + (left > 0 ? `, ${left} left out by your filters` : "");
      ranked.replaceChildren(summary, ...sorted.map((group) => threadCard(group, pattern)));
    }
    log("forum search:", results.length, "results,", kept.length, "kept, order", order);
  }
  function field2(label, control, tag = "label") {
    const wrap = document.createElement(tag);
    wrap.className = "aue-search-field";
    const caption = document.createElement("span");
    caption.textContent = label;
    wrap.append(caption, control);
    return wrap;
  }
  function menu(options, picked) {
    const select = document.createElement("select");
    for (const [value, text] of options) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      select.append(option);
    }
    select.value = picked;
    return select;
  }
  function forumMenu(forums, setting, picked, none) {
    const names = new Map(forums);
    const wrap = document.createElement("div");
    wrap.className = "aue-search-drop";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "aue-search-dropbtn";
    const list = document.createElement("div");
    list.className = "aue-search-droplist";
    const showPicked = () => {
      const first = [...picked][0] ?? "";
      button.textContent = picked.size === 0 ? none : picked.size === 1 ? names.get(first) ?? "1 forum" : `${picked.size} forums`;
    };
    const changed = () => {
      writeSetting(setting, JSON.stringify([...picked]));
      showPicked();
      applyToResults();
    };
    const reset2 = document.createElement("button");
    reset2.type = "button";
    reset2.className = "torn-btn aue-search-reset";
    reset2.textContent = "Reset";
    const grid = document.createElement("div");
    grid.className = "aue-search-forums";
    const boxes = [];
    for (const [id, name] of forums) {
      const option = document.createElement("label");
      const box2 = document.createElement("input");
      box2.type = "checkbox";
      box2.checked = picked.has(id);
      box2.addEventListener("change", () => {
        if (box2.checked) picked.add(id);
        else picked.delete(id);
        changed();
      });
      boxes.push(box2);
      option.append(box2, name);
      grid.append(option);
    }
    reset2.addEventListener("click", () => {
      picked.clear();
      for (const box2 of boxes) box2.checked = false;
      changed();
    });
    list.append(reset2, grid);
    button.addEventListener("click", () => {
      const opening = !wrap.classList.contains("aue-open");
      for (const open of document.querySelectorAll(".aue-search-drop.aue-open")) open.classList.remove("aue-open");
      wrap.classList.toggle("aue-open", opening);
    });
    document.addEventListener("pointerdown", (event) => {
      if (!wrap.contains(event.target)) wrap.classList.remove("aue-open");
    });
    wrap.addEventListener("keydown", (event) => {
      if (event.key === "Escape") wrap.classList.remove("aue-open");
    });
    showPicked();
    wrap.append(button, list);
    return wrap;
  }
  function splitSearch(q) {
    const phrases = [];
    let rest = q.replace(/"([^"]*)"/g, (_, inside2) => {
      if (inside2.trim()) phrases.push(inside2.trim());
      return " ";
    });
    const without = [];
    rest = rest.replace(/(^|\s)-(\S+)/g, (_, space, word) => {
      without.push(word);
      return space;
    });
    return { words: rest.replace(/\s+/g, " ").trim(), phrase: phrases.join(", "), without: without.join(", ") };
  }
  function entries(box2) {
    return box2.split(",").map((entry) => entry.replace(/"/g, "").replace(/^-+/, "").trim()).filter(Boolean);
  }
  function withoutWords(box2) {
    return entries(box2).flatMap((entry) => entry.split(/\s+/).map((word) => word.replace(/^-+/, "")).filter(Boolean));
  }
  var EXTRA_SETTING = "FORUM_SEARCH_EXTRA";
  function readExtra() {
    try {
      const extra = JSON.parse(readSetting(EXTRA_SETTING, "null"));
      return extra && extra.q === currentSearch().q ? extra : null;
    } catch {
      return null;
    }
  }
  function extraFilter(extra) {
    if (!extra) return () => true;
    const whole = (term) => termPattern([term]) ?? /$^/;
    const needed = [...extra.phrases, ...extra.words].map((term) => new RegExp(whole(term).source, "i"));
    const banned = extra.without.map((term) => new RegExp(whole(term).source, "i"));
    return (result) => {
      const text = `${result.title} ${result.text}`;
      return needed.every((term) => term.test(text)) && !banned.some((term) => term.test(text));
    };
  }
  function textBox(value, placeholder = "") {
    const input = document.createElement("input");
    input.type = "text";
    input.value = value;
    input.placeholder = placeholder;
    return input;
  }
  function datePicker(setting) {
    const input = document.createElement("input");
    input.type = "date";
    input.value = readSetting(setting, "");
    input.addEventListener("change", () => {
      writeSetting(setting, input.value);
      applyToResults();
    });
    return input;
  }
  function buildPanel2() {
    const search = currentSearch();
    const forums = forumList();
    const panel = document.createElement("form");
    panel.id = PANEL_ID;
    const extra = readExtra();
    const split = extra ? {
      words: extra.words.join(" "),
      phrase: [search.q.replace(/"/g, ""), ...extra.phrases].join(", "),
      without: extra.without.join(", ")
    } : splitSearch(search.q);
    const words = textBox(split.words, "Enter search term");
    const phrase = textBox(split.phrase);
    const without = textBox(split.without);
    const picked = new Set(search.f !== "0" ? [search.f] : readIds(PICKED_SETTING));
    const forumPicker = forumMenu(forums, PICKED_SETTING, picked, "All Forums");
    const exclude = forumMenu(forums, EXCLUDED_SETTING, new Set(readIds(EXCLUDED_SETTING)), "None");
    const type = menu(TYPES, search.y);
    const order = menu(
      [
        ["best", "Best match"],
        ["newest", "Newest first"]
      ],
      readSetting(ORDER_SETTING, "best")
    );
    order.addEventListener("change", () => {
      writeSetting(ORDER_SETTING, order.value);
      applyToResults();
    });
    const go = document.createElement("button");
    go.type = "submit";
    go.className = "torn-btn";
    go.textContent = "Search";
    const top = document.createElement("div");
    top.className = "aue-search-row";
    const wordsField = field2("Words", words);
    wordsField.classList.add("aue-search-grow");
    const pair = document.createElement("div");
    pair.className = "aue-search-pair";
    pair.append(field2("Exact phrase", phrase), field2("Without words", without));
    const note = document.createElement("span");
    note.className = "aue-search-note";
    note.textContent = "Separate different phrases and words by commas";
    const group = document.createElement("div");
    group.className = "aue-search-group";
    group.append(pair, note);
    top.classList.add("aue-search-top");
    top.append(wordsField, group, field2(" ", go, "div"));
    const options = document.createElement("div");
    options.className = "aue-search-row";
    options.append(
      field2("Forum", forumPicker, "div"),
      field2("Exclude", exclude, "div"),
      field2("Type", type),
      field2("Since", datePicker(SINCE_SETTING)),
      field2("Before", datePicker(BEFORE_SETTING)),
      field2("Order", order)
    );
    panel.append(top, options);
    panel.addEventListener("submit", (event) => {
      event.preventDefault();
      const phrases = entries(phrase.value);
      const left = withoutWords(without.value);
      let q;
      if (phrases.length > 0) {
        q = `"${phrases[0]}"`;
        const rest = {
          q,
          phrases: phrases.slice(1),
          words: words.value.split(/\s+/).filter(Boolean),
          without: left
        };
        writeSetting(EXTRA_SETTING, JSON.stringify(rest));
      } else {
        q = [words.value.trim(), ...left.map((word) => `-${word}`)].filter(Boolean).join(" ");
        writeSetting(EXTRA_SETTING, "null");
      }
      if (!q) return;
      writeSetting(PICKED_SETTING, JSON.stringify([...picked]));
      const f = picked.size === 1 ? [...picked][0] ?? "0" : "0";
      const params = new URLSearchParams({ p: "search", q, f, y: type.value });
      location.assign(`${FORUMS_PATH}?${params}`);
    });
    return panel;
  }
  function placePanel() {
    if (document.getElementById(PANEL_ID)) return;
    const tornInput = document.querySelector(SELECTORS3.tornSearchInput);
    const tornForm = tornInput?.closest("form");
    if (tornForm) {
      tornForm.style.display = "none";
      tornForm.after(buildPanel2());
      return;
    }
    if (onResultsPage()) {
      const wrap = document.querySelector(SELECTORS3.resultsWrap) ?? document.querySelector(SELECTORS3.results);
      wrap?.prepend(buildPanel2());
    }
  }
  function installForumSearch() {
    if (location.pathname !== FORUMS_PATH || !isEnabled(FORUM_SEARCH)) return;
    let timer = 0;
    let lastCount = -1;
    const pass4 = () => {
      placePanel();
      const list = document.querySelector(SELECTORS3.results);
      const count = list ? list.querySelectorAll(SELECTORS3.result).length : -1;
      if (count !== lastCount) {
        lastCount = count;
        if (list) applyToResults();
      }
    };
    new MutationObserver(() => {
      clearTimeout(timer);
      timer = window.setTimeout(pass4, 150);
    }).observe(document.body, { childList: true, subtree: true });
    pass4();
  }

  // src/autumns-ui-enhancer/hideChats.ts
  var SELECTORS4 = {
    panel: "#people_panel",
    /** The title in the panel's header, "Your private chats" while the chats tab is open. */
    title: `button span${hashedClass("headingH1")}`,
    /** The block holding the search box and the list. */
    content: hashedClass("content"),
    /** The scrolling list Torn draws the rows into. */
    list: "#private-channel-list",
    /** One conversation; its id ends in the other player's id. */
    card: 'button[id^="private_chat_card_"]',
    /** The row holding the name and the time of the last message. */
    header: hashedClass("header"),
    /** The name link. */
    name: `a${hashedClass("title")}`,
    /** The time of the last message, "4 days ago". */
    time: hashedClass("metadata"),
    /** The last message, "Name : text". */
    description: hashedClass("description")
  };
  var DM_PATH = /\/dm$/;
  var ROW_HEIGHT = 68;
  var CARD_PREFIX = "private_chat_card_";
  var CHATS_TITLE = "Your private chats";
  var ON_CLASS = "aue-hide-chats";
  var HIDDEN_MODE_CLASS = "aue-hide-chats-hidden";
  var OUT_CLASS = "aue-hide-chats-out";
  var GLOW_CLASS = "aue-hide-chats-glow";
  var OPEN_CLASS = "aue-hide-chats-open";
  var MENU_ID = "aue-hide-chats-menu";
  var HIDDEN_LIST_ID = "aue-hide-chats-list";
  var HIDE_BUTTON_CLASS = "aue-hide-chats-x";
  var HIDDEN_SETTING = "HIDE_CHATS_PEOPLE";
  var SAVED_SETTING = "HIDE_CHATS_SAVED";
  var mode = "shown";
  var newInShown = false;
  var lastPreview = /* @__PURE__ */ new Map();
  var seen2 = /* @__PURE__ */ new Map();
  var hiddenIndex = /* @__PURE__ */ new Map();
  var written = /* @__PURE__ */ new WeakMap();
  function setStyle(element, property, value) {
    let mine = written.get(element);
    if (!mine) written.set(element, mine = /* @__PURE__ */ new Map());
    if (mine.get(property) === value) return;
    mine.set(property, value);
    element.style.setProperty(property, value);
  }
  function hiddenIds() {
    try {
      const parsed = JSON.parse(readSetting(HIDDEN_SETTING, "[]"));
      return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
    } catch {
      return /* @__PURE__ */ new Set();
    }
  }
  function savedChats() {
    try {
      const parsed = JSON.parse(readSetting(SAVED_SETTING, "{}"));
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  function writeSaved(saved) {
    writeSetting(SAVED_SETTING, JSON.stringify(saved));
  }
  function decode(text) {
    const box2 = document.createElement("textarea");
    box2.innerHTML = text;
    return box2.value;
  }
  function flat(text) {
    return text.replace(/\s+/g, " ").trim();
  }
  function fromItem(item) {
    const other = item.otherUser;
    const last = item.lastMessage;
    if (!other?.userId) return null;
    return {
      name: other.name ?? "",
      avatar: other.avatar ?? "",
      preview: last ? flat(`${last.sender?.name ?? ""} : ${decode(last.content ?? "")}`) : "",
      when: typeof last?.createdAt === "number" ? last.createdAt : null,
      whenText: "",
      unread: false
    };
  }
  function fromThem(chat) {
    return chat.preview.startsWith(`${chat.name} :`);
  }
  function updateFromReply(saved, id, fresh) {
    const old = saved[id];
    if (!old) {
      saved[id] = fresh;
      return true;
    }
    const newer = old.when !== null && fresh.when !== null ? fresh.when > old.when : flat(old.preview) !== flat(fresh.preview);
    if (!newer && old.name === fresh.name && old.avatar === fresh.avatar) return false;
    saved[id] = { ...old, ...fresh, domPreview: old.domPreview, unread: old.unread || newer && fromThem(fresh) };
    return true;
  }
  function updateFromRow(saved, id, card) {
    const row = fromCard(card);
    const dom = row.preview;
    const old = saved[id];
    if (!old) {
      saved[id] = { ...row, domPreview: dom };
      return true;
    }
    if (old.domPreview === dom) return false;
    if (old.domPreview === void 0) {
      saved[id] = { ...old, domPreview: dom };
      return true;
    }
    saved[id] = { ...old, ...row, when: Date.now(), domPreview: dom, unread: old.unread || fromThem(row) };
    return true;
  }
  function filterReply(data) {
    if (!Array.isArray(data.items)) return 0;
    const hidden = hiddenIds();
    const saved = savedChats();
    let changed = false;
    const kept = [];
    for (const item of data.items) {
      const id = String(item.otherUser?.userId ?? "");
      const fresh = fromItem(item);
      if (fresh) seen2.set(id, fresh);
      if (!hidden.has(id)) {
        kept.push(item);
        continue;
      }
      if (fresh && updateFromReply(saved, id, fresh)) changed = true;
    }
    if (changed) writeSaved(saved);
    const removed = data.items.length - kept.length;
    data.items = kept;
    return removed;
  }
  var serverRead = 0;
  var givenToTorn = 0;
  function serverOffset(asked) {
    if (asked === 0) {
      serverRead = 0;
      givenToTorn = 0;
      return 0;
    }
    return asked === givenToTorn && givenToTorn !== serverRead ? serverRead : asked;
  }
  function withOffset(input, offset) {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    if (url.searchParams.get("offset") === String(offset)) return input;
    url.searchParams.set("offset", String(offset));
    return input instanceof Request ? new Request(url, input) : url.toString();
  }
  function installChatFilter() {
    if (!isEnabled(HIDE_CHATS)) return;
    const original = window.fetch;
    window.fetch = async function(input, init) {
      let url;
      try {
        url = new URL(input instanceof Request ? input.url : String(input), location.href);
      } catch {
        return original.call(this, input, init);
      }
      if (!DM_PATH.test(url.pathname)) return original.call(this, input, init);
      const asked = Number(url.searchParams.get("offset") ?? "0") || 0;
      const offset = serverOffset(asked);
      if (offset !== asked) log("hide chats: Torn asked from", asked, "- moved on to", offset);
      const response = await original.call(this, withOffset(input, offset), init);
      try {
        const data = await response.clone().json();
        if (!Array.isArray(data.items)) return response;
        const read = data.items.length;
        const removed = filterReply(data);
        serverRead = offset + read;
        givenToTorn += data.items.length;
        if (typeof data.total === "number") data.total -= serverRead - givenToTorn;
        if (removed > 0) log("hide chats: took", removed, "hidden chat(s) out of", read);
        schedule();
        const headers = new Headers(response.headers);
        headers.delete("content-length");
        headers.delete("content-encoding");
        return new Response(JSON.stringify(data), { status: response.status, statusText: response.statusText, headers });
      } catch {
        return response;
      }
    };
  }
  function fromCard(card) {
    const link = card.querySelector(SELECTORS4.name);
    const name = link ? [...link.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent ?? "").join("").trim() : "";
    return {
      name,
      avatar: card.querySelector("img")?.getAttribute("src") ?? "",
      preview: flat(card.querySelector(SELECTORS4.description)?.textContent ?? ""),
      when: null,
      whenText: (card.querySelector(SELECTORS4.time)?.textContent ?? "").trim(),
      unread: false
    };
  }
  function hide(id, card) {
    const ids = hiddenIds();
    ids.add(id);
    writeSetting(HIDDEN_SETTING, JSON.stringify([...ids]));
    const saved = savedChats();
    const details = seen2.get(id) ?? (card ? fromCard(card) : null);
    if (details) saved[id] = { ...details, unread: false, domPreview: card ? fromCard(card).preview : void 0 };
    writeSaved(saved);
    log("hide chats: hid", id);
  }
  function unhide(id) {
    const ids = hiddenIds();
    ids.delete(id);
    writeSetting(HIDDEN_SETTING, JSON.stringify([...ids]));
    const saved = savedChats();
    delete saved[id];
    writeSaved(saved);
    hiddenIndex.delete(id);
    log("hide chats: brought back", id);
  }
  function rowButton(symbol, title, action) {
    const button = document.createElement("span");
    button.className = HIDE_BUTTON_CLASS;
    button.setAttribute("role", "button");
    button.tabIndex = 0;
    button.textContent = symbol;
    button.title = title;
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
      button.addEventListener(type, (event) => event.stopPropagation());
    }
    const run = (event) => {
      event.preventDefault();
      event.stopPropagation();
      action();
      pass();
    };
    button.addEventListener("click", run);
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") run(event);
    });
    return button;
  }
  function ago(when) {
    const minutes = Math.max(0, Math.round((Date.now() - when) / 6e4));
    const say3 = (count, unit) => count === 1 ? `1 ${unit} ago` : `${count} ${unit}s ago`;
    if (minutes < 1) return "just now";
    if (minutes < 60) return say3(minutes, "minute");
    const hours = Math.round(minutes / 60);
    if (hours < 24) return say3(hours, "hour");
    return say3(Math.round(hours / 24), "day");
  }
  function hiddenRow(id, chat) {
    const row = document.createElement("div");
    row.className = "aue-hide-chats-row";
    row.classList.toggle("aue-hide-chats-unread", chat.unread);
    const picture = document.createElement("img");
    picture.className = "aue-hide-chats-avatar";
    picture.alt = "";
    if (/^(https:\/\/|\/)/.test(chat.avatar)) picture.src = chat.avatar;
    const body = document.createElement("div");
    body.className = "aue-hide-chats-body";
    const head = document.createElement("div");
    head.className = "aue-hide-chats-head";
    const name = document.createElement("a");
    name.className = "aue-hide-chats-name";
    name.href = `/profiles.php?XID=${encodeURIComponent(id)}`;
    name.textContent = chat.name || `[${id}]`;
    const time = document.createElement("span");
    time.className = "aue-hide-chats-time";
    time.textContent = chat.when !== null ? ago(chat.when) : chat.whenText;
    head.append(
      name,
      time,
      rowButton("↩", "Unhide", () => unhide(id))
    );
    const preview = document.createElement("div");
    preview.className = "aue-hide-chats-preview";
    preview.textContent = chat.preview;
    body.append(head, preview);
    row.append(picture, body);
    return row;
  }
  function drawHiddenList(list) {
    const content = list.parentElement;
    if (!content) return;
    let box2 = document.getElementById(HIDDEN_LIST_ID);
    if (mode !== "hidden") {
      box2?.remove();
      return;
    }
    if (!box2) {
      box2 = document.createElement("div");
      box2.id = HIDDEN_LIST_ID;
      content.append(box2);
    }
    if (getComputedStyle(content).position === "static") setStyle(content, "position", "relative");
    setStyle(box2, "top", `${list.offsetTop}px`);
    setStyle(box2, "height", `${list.offsetHeight}px`);
    const hidden = hiddenIds();
    const saved = savedChats();
    const chats = [...hidden].map((id) => [id, saved[id] ?? { name: "", avatar: "", preview: "", when: null, whenText: "", unread: false }]).sort(([, a], [, b]) => Number(b.unread) - Number(a.unread) || (b.when ?? 0) - (a.when ?? 0));
    const key = JSON.stringify(chats);
    if (box2.dataset.drawn === key) return;
    box2.dataset.drawn = key;
    if (chats.length === 0) {
      const empty = document.createElement("div");
      empty.className = "aue-hide-chats-empty";
      empty.textContent = "No hidden chats";
      box2.replaceChildren(empty);
    } else {
      box2.replaceChildren(...chats.map(([id, chat]) => hiddenRow(id, chat)));
    }
  }
  function markHiddenRead() {
    const saved = savedChats();
    let changed = false;
    for (const chat of Object.values(saved)) {
      if (chat.unread) {
        chat.unread = false;
        changed = true;
      }
    }
    if (changed) writeSaved(saved);
  }
  var MODES = [
    ["shown", CHATS_TITLE],
    ["hidden", "Hidden chats"]
  ];
  function buildMenu() {
    const menu2 = document.createElement("div");
    menu2.id = MENU_ID;
    const label = document.createElement("span");
    label.className = "aue-hide-chats-label";
    const drop = document.createElement("div");
    drop.className = "aue-hide-chats-drop";
    for (const [value, text] of MODES) {
      const item = document.createElement("div");
      item.className = "aue-hide-chats-item";
      item.dataset.mode = value;
      item.textContent = text;
      drop.append(item);
    }
    menu2.append(label, drop);
    return menu2;
  }
  function inside(element, x, y) {
    const box2 = element.getBoundingClientRect();
    return box2.width > 0 && x >= box2.left && x <= box2.right && y >= box2.top && y <= box2.bottom;
  }
  function setMode(picked) {
    if (picked === mode) return;
    if (mode === "hidden") markHiddenRead();
    mode = picked;
    newInShown = false;
    pass();
  }
  function onMenuPress(event) {
    const menu2 = document.getElementById(MENU_ID);
    if (!menu2) return;
    const point = event instanceof TouchEvent ? event.changedTouches[0] : event;
    if (!point) return;
    const { clientX: x, clientY: y } = point;
    const open = menu2.classList.contains(OPEN_CLASS);
    const items = [...menu2.querySelectorAll(".aue-hide-chats-item")];
    const onLabel = inside(menu2, x, y);
    const onItem = open ? items.find((item) => inside(item, x, y)) : void 0;
    if (!onLabel && !onItem) {
      if (open && event.type === "click") menu2.classList.remove(OPEN_CLASS);
      return;
    }
    event.stopPropagation();
    if (event.cancelable && event.type !== "touchstart") event.preventDefault();
    if (event.type !== "click") return;
    if (onItem) {
      menu2.classList.remove(OPEN_CLASS);
      setMode(onItem.dataset.mode === "hidden" ? "hidden" : "shown");
    } else {
      menu2.classList.toggle(OPEN_CLASS, !open);
    }
  }
  function placeMenu(panel) {
    const title = panel.querySelector(SELECTORS4.title);
    let menu2 = document.getElementById(MENU_ID);
    const onChats = title !== null && (title.textContent ?? "").trim() === CHATS_TITLE;
    if (!onChats || !title) {
      menu2?.remove();
      if (title) setStyle(title, "visibility", "");
      return null;
    }
    if (!menu2) {
      menu2 = buildMenu();
      panel.append(menu2);
    }
    const label = menu2.querySelector(".aue-hide-chats-label");
    const text = MODES.find(([value]) => value === mode)?.[1] ?? CHATS_TITLE;
    if (label && label.textContent !== text) label.textContent = text;
    setStyle(title, "visibility", "hidden");
    if (getComputedStyle(panel).position === "static") setStyle(panel, "position", "relative");
    const box2 = panel.getBoundingClientRect();
    const at = title.getBoundingClientRect();
    setStyle(menu2, "left", `${at.left - box2.left}px`);
    setStyle(menu2, "top", `${at.top - box2.top}px`);
    setStyle(menu2, "height", `${at.height}px`);
    setStyle(menu2, "font", getComputedStyle(title).font);
    return menu2;
  }
  function rowIndex(card) {
    const y = /translateY\((-?[\d.]+)px\)/.exec(card.style.transform)?.[1];
    return y === void 0 ? null : Math.round(Number(y) / ROW_HEIGHT);
  }
  function tidyTornList(list, hidden, saved) {
    let savedChanged = false;
    const cards = [...list.querySelectorAll(SELECTORS4.card)];
    for (const card of cards) {
      const id = card.id.slice(CARD_PREFIX.length);
      const index = rowIndex(card);
      const isHidden = hidden.has(id);
      card.classList.toggle(OUT_CLASS, isHidden);
      if (isHidden && index !== null) hiddenIndex.set(id, index);
      const preview = flat(card.querySelector(SELECTORS4.description)?.textContent ?? "");
      const before = lastPreview.get(id);
      lastPreview.set(id, preview);
      if (isHidden) {
        if (updateFromRow(saved, id, card)) savedChanged = true;
      } else if (before !== void 0 && before !== preview && mode === "hidden") {
        const name = fromCard(card).name;
        if (preview.startsWith(`${name} :`)) newInShown = true;
      }
      if (!card.querySelector(`.${HIDE_BUTTON_CLASS}`)) {
        card.querySelector(SELECTORS4.header)?.append(rowButton("✕", "Hide", () => hide(id, card)));
      }
    }
    for (const id of hiddenIndex.keys()) if (!hidden.has(id)) hiddenIndex.delete(id);
    for (const card of cards) {
      const index = rowIndex(card);
      if (index === null) continue;
      let above = 0;
      for (const at of hiddenIndex.values()) if (at < index) above++;
      setStyle(card, "translate", above > 0 ? `0 ${-above * ROW_HEIGHT}px` : "");
    }
    return savedChanged;
  }
  var scheduled = false;
  function pass() {
    scheduled = false;
    const panel = document.querySelector(SELECTORS4.panel);
    if (!panel) return;
    const list = panel.querySelector(SELECTORS4.list);
    const menu2 = placeMenu(panel);
    const on3 = list !== null && menu2 !== null;
    panel.classList.toggle(ON_CLASS, on3);
    panel.classList.toggle(HIDDEN_MODE_CLASS, on3 && mode === "hidden");
    if (!list || !menu2) {
      document.getElementById(HIDDEN_LIST_ID)?.remove();
      return;
    }
    const hidden = hiddenIds();
    const saved = savedChats();
    if (tidyTornList(list, hidden, saved)) writeSaved(saved);
    drawHiddenList(list);
    const unreadHidden = [...hidden].some((id) => saved[id]?.unread);
    const glow = mode === "shown" ? unreadHidden : newInShown;
    menu2.classList.toggle(GLOW_CLASS, glow);
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(pass);
  }
  function installHideChats() {
    if (!isEnabled(HIDE_CHATS)) return;
    new MutationObserver((records) => {
      const matters = records.some(
        (record) => record.type !== "attributes" || record.target instanceof Element && record.target.closest(SELECTORS4.panel) !== null
      );
      if (matters) schedule();
    }).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["id", "style"]
    });
    for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend", "click"]) {
      addEventListener(type, onMenuPress, { capture: true, passive: false });
    }
    addEventListener("resize", schedule);
    addEventListener("pagehide", () => {
      if (mode === "hidden") markHiddenRead();
    });
    schedule();
  }

  // src/autumns-ui-enhancer/jsonRows.ts
  var AUCTION_PARTS = {
    plate: ".item-plate",
    image: ".item-plate img",
    hover: ".item-hover",
    info: ".view-info",
    name: ".item-name",
    rarity: ".title p",
    bonuses: ".item-bonuses",
    seller: ".seller-wrap .name",
    bidder: ".seller-wrap .namehight",
    bids: ".bids-wrap",
    topBid: ".c-bid-wrap",
    bidIcon: ".bid-wrap .bid-icon",
    time: ".time-wrap",
    mobSeller: ".seller-mob-wrap",
    mobBidder: ".top-seller-mob-wrap",
    mobBid: ".top-bid-mob-wrap",
    mobTime: ".time-mob-wrap",
    panels: ".confirm, .show-item-info",
    // Lines another userscript adds to Torn's rows (a bonus name and figure
    // under the title). A clone would carry the template's, and that script
    // then adds the right one beside it, so the copy's are taken out.
    foreign: '[class*="w3b-"]'
  };
  var SYNC_ATTR = "data-w3b-sync";
  var SYNC_MARK = "aue";
  var URGENT_CLASS = "t-red";
  var GLOW_PREFIX = "glow-";
  function asText(value) {
    return value === null || value === void 0 ? "" : String(value);
  }
  function asNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function countdownText(timer) {
    const days = asNumber(timer.d);
    const hours = asNumber(timer.h) % 24;
    const minutes = asNumber(timer.m) % 60;
    const seconds = asNumber(timer.s) % 60;
    switch (timer.max) {
      case "d":
        return `${days}d ${hours}h `;
      case "h":
        return `${hours}h ${minutes}m `;
      case "m":
        return `${minutes}m ${seconds}s `;
      default:
        return `${seconds}s `;
    }
  }
  function setPerson(cell, person) {
    const link = cell?.querySelector("a");
    const who = person;
    if (!link || !who) return;
    link.setAttribute("href", asText(who.link));
    link.textContent = asText(who.name);
  }
  function setCountdown(cell, timer, endsAt) {
    if (!cell) return;
    const titled = cell.querySelector("span[title]");
    if (titled) titled.title = `Ends on ${endsAt}`;
    const time = cell.querySelector(".time");
    if (time) time.setAttribute("timer", String(asNumber(timer.value)));
    const urgent = timer.max === "m" || timer.max === "s";
    const shown = countdownText(timer);
    for (const slot of cell.querySelectorAll(".dh-time, .max-time")) {
      slot.textContent = shown;
      slot.classList.toggle(URGENT_CLASS, urgent);
    }
  }
  function collapse(panel) {
    const preloader = panel.querySelector(".ajax-preloader");
    panel.replaceChildren();
    if (preloader) panel.appendChild(preloader.cloneNode(true));
  }
  function itemSrcset(base, extension) {
    return [1, 2, 3, 4].map((scale) => {
      const suffix = scale === 1 ? "" : `@${scale}x`;
      return `${base}${suffix}${extension} ${scale}x`;
    }).join(", ");
  }
  var AUCTION_MARKET = {
    path: "/amarket.php",
    fill(row, listing) {
      const parts = AUCTION_PARTS;
      row.id = asText(listing.ID);
      for (const added of row.querySelectorAll(parts.foreign)) added.remove();
      const plate = row.querySelector(parts.plate);
      if (plate) {
        for (const name2 of [...plate.classList]) {
          if (name2.startsWith(GLOW_PREFIX)) plate.classList.remove(name2);
        }
        const glow = asText(listing.glowClass);
        if (glow) plate.classList.add(glow);
      }
      const image = row.querySelector(parts.image);
      if (image) {
        image.setAttribute("src", asText(listing.itemSrc));
        image.setAttribute(
          "srcset",
          itemSrcset(
            asText(listing.itemSrcSetName),
            asText(listing.itemSrcSetExt)
          )
        );
      }
      const hover = row.querySelector(parts.hover);
      if (hover) {
        hover.setAttribute("item", asText(listing.itemID));
        hover.setAttribute("armoury", asText(listing.armouryID));
        hover.setAttribute("loaded", "0");
      }
      const label = asText(listing.arialabel);
      const info = row.querySelector(parts.info);
      if (info) info.setAttribute("aria-label", label);
      const name = row.querySelector(parts.name);
      if (name) {
        name.textContent = asText(listing.itemName);
        name.setAttribute("href", asText(listing.itemLink));
      }
      const rarity = row.querySelector(parts.rarity);
      if (rarity) rarity.textContent = `(${asText(listing.rare)})`;
      const bonuses = row.querySelector(parts.bonuses);
      if (bonuses) bonuses.innerHTML = asText(listing.item_image_icons);
      setPerson(row.querySelector(parts.seller), listing.seller);
      setPerson(row.querySelector(parts.bidder), listing.hightbidder);
      const bids = row.querySelector(parts.bids);
      if (bids) bids.textContent = `${asNumber(listing.bids)} bids`;
      const topBid = asText(listing.topbid);
      const price = row.querySelector(parts.topBid);
      if (price) price.textContent = topBid;
      const bidIcon = row.querySelector(parts.bidIcon);
      if (bidIcon) {
        bidIcon.setAttribute(
          "aria-label",
          `BID: ${asText(listing.itemName)} (${asText(listing.rare)})`
        );
      }
      const timer = listing.timer ?? {};
      const endsAt = asText(listing.enddate);
      setCountdown(row.querySelector(parts.time), timer, endsAt);
      setCountdown(row.querySelector(parts.mobTime), timer, endsAt);
      setPerson(row.querySelector(parts.mobSeller), listing.seller);
      setPerson(row.querySelector(parts.mobBidder), listing.hightbidder);
      const mobBid = row.querySelector(parts.mobBid);
      if (mobBid) mobBid.textContent = `Bid: ${topBid}`;
      for (const panel of row.querySelectorAll(parts.panels)) collapse(panel);
    }
  };
  var BUILDERS = [AUCTION_MARKET];
  function passingClasses(template) {
    const own = [...template.parentElement?.children ?? []].filter(
      (row) => !row.hasAttribute("data-aue-extra") && row.tagName === template.tagName
    );
    return [...template.classList].filter(
      (name) => own.some((row) => !row.classList.contains(name))
    );
  }
  function rowsFromJson(body, template) {
    if (body.trimStart()[0] !== "{") return null;
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      return null;
    }
    const list = data.list;
    if (!Array.isArray(list)) return null;
    const builder = BUILDERS.find((one) => one.path === location.pathname);
    if (!builder) {
      log("build: this page answers with data, and nothing here can draw it");
      return null;
    }
    const passing = passingClasses(template);
    const rows = [];
    for (const listing of list) {
      if (typeof listing !== "object" || listing === null) continue;
      const store = window.aueListings ?? (window.aueListings = {});
      store[asText(listing.ID)] = listing;
      const row = template.cloneNode(true);
      for (const name of passing) row.classList.remove(name);
      if (row.hasAttribute(SYNC_ATTR)) row.setAttribute(SYNC_ATTR, SYNC_MARK);
      try {
        builder.fill(row, listing);
      } catch (problem) {
        log("build: a row would not fill -", problem);
        return null;
      }
      rows.push(row);
    }
    log("build:", rows.length, "rows drawn from data");
    return rows;
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
  var seen3 = [];
  var manualIndex = null;
  var manualAt = 0;
  var writing = false;
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
    return readHeadlines(bar) ?? seen3;
  }
  function liveHeadline(bar) {
    const slides = Array.from(bar.querySelectorAll(SLIDE_SELECTOR)).reverse();
    const slide = slides.find((item) => ACTIVE_SLIDE.test(item.className));
    return (slide ?? slides[0])?.querySelector(HEADLINE_SELECTOR) ?? bar.querySelector(HEADLINE_SELECTOR);
  }
  function compareText(html) {
    const box2 = document.createElement("div");
    box2.innerHTML = html;
    return (box2.textContent ?? "").replace(/[[d:s]+]s*$/, "").replace(/s+/g, " ").trim().toLowerCase();
  }
  function remember(bar) {
    const headline = liveHeadline(bar);
    const html = headline?.innerHTML ?? "";
    if (!html) return;
    const id = headline?.textContent?.trim() ?? html;
    if (seen3.some((item) => item.id === id)) return;
    const link = bar.querySelector(`${SLIDE_SELECTOR} a`);
    seen3.push({ id, html, link: link?.getAttribute("href") ?? null, endTime: 0 });
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
  function marqueeKey(box2) {
    return `${box2.scrollWidth}:${box2.clientWidth}:${box2.textContent?.length ?? 0}`;
  }
  function tick(now) {
    requestAnimationFrame(tick);
    const box2 = scroller;
    if (!box2 || !box2.isConnected) return;
    const distance = box2.scrollWidth - box2.clientWidth;
    if (distance <= OVERFLOW_SLACK) {
      box2.scrollLeft = 0;
      return;
    }
    const key = marqueeKey(box2);
    if (key !== scrollKey) {
      scrollKey = key;
      startedAt = now;
      box2.scrollLeft = 0;
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
    if (at < HOLD_MS) box2.scrollLeft = 0;
    else if (at < HOLD_MS + travel) {
      box2.scrollLeft = distance * (at - HOLD_MS) / travel;
    } else if (at < 2 * HOLD_MS + travel) box2.scrollLeft = distance;
    else {
      box2.scrollLeft = distance * (1 - (at - 2 * HOLD_MS - travel) / travel);
    }
  }
  function watchScroller(box2) {
    if (box2 === scroller) return;
    scroller = box2;
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
    writing = true;
    const nav = document.createElement("div");
    nav.id = NAV_ID;
    nav.appendChild(buildArrow(-1));
    nav.appendChild(buildArrow(1));
    bar.appendChild(nav);
    writing = false;
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
    writing = true;
    bar.classList.remove(MANUAL_CLASS);
    bar.querySelector(`#${OVERLAY_ID}`)?.remove();
    writing = false;
    watchScroller(bar.querySelector(SCROLLER_SELECTOR));
  }
  function countdownText2(endTime) {
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
    writing = true;
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
      countdown.textContent = countdownText2(item.endTime);
      text.appendChild(countdown);
    }
    overlay.replaceChildren(
      item.link ? wrapInLink(text, item.link) : text
    );
    writing = false;
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
        writing = true;
        bar.querySelector(`#${NAV_ID}`)?.remove();
        bar.classList.remove(BAR_CLASS);
        writing = false;
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
    const schedule2 = () => {
      if (writing) return;
      clearTimeout(timer);
      timer = window.setTimeout(apply2, 120);
    };
    new MutationObserver((records) => {
      if (!onlyOurs(records)) schedule2();
    }).observe(document.body, {
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
        countdown.textContent = countdownText2(item.endTime);
      }
    }, 1e3);
    apply2();
  }

  // src/autumns-ui-enhancer/listDisplay.ts
  var PAGINATION_SELECTOR = ".pagination";
  var PAGE_LINK_SELECTOR = "a.page-number[page]";
  var PAGE_GAP_SELECTOR = "span.points";
  var ARROW_PREV_ANY = 'i.pagination-left, [class*="pagination-left"]';
  var ARROW_NEXT_ANY = 'i.pagination-right, [class*="pagination-right"]';
  var ARROW_DISABLED_CLASS = "disable";
  var SPACER_CLASS = "clear";
  var ROW_CONTAINER_SELECTOR = "ul, ol, tbody";
  var NOT_A_LIST = "#sidebarroot, #header-root, .header-wrapper-top, .header-wrapper-bottom, #chatRoot, .content-title, .breadcrumbs";
  var CONTENT_ROOT_SELECTOR = ".content-wrapper, #mainContainer";
  var SETTLE_MS2 = 150;
  var MAX_SETTLE_MS = 1e3;
  var MORE_BUTTON_CLASS = "aue-pager-more";
  var MORE_BUTTON_GAP_PX = 10;
  var TOP_BUTTON_ID = "aue-back-to-top";
  var TOP_BUTTON_MARGIN_PX = 10;
  var RANGE_CLASS = "aue-page-range";
  var EXTRA_ROW_ATTR = "data-aue-extra";
  var PAGER_STATE_ATTR = "data-aue-pager";
  var OWN_LINK_ATTR = "data-aue-page";
  var JUMP_CLASS = "aue-page-jump";
  var OLD_REQUEST_PREFIX = "AUE_LIST_REQUEST:";
  var SHOW_MORE_LABEL = "Show more";
  var LOADING_LABEL = "Loading";
  var FAILED_LABEL = "Nothing more to show";
  var TOP_LABEL = "Back to top";
  var TOP_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 15l7-7 7 7" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var START_IN_HASH = /[?&]start=(\d+)/;
  var START_IN_LINK = /(?:^|[?&#])start=(\d+)/;
  var RFCV_COOKIE2 = /(?:^|;\s*)rfc_v=([^;]+)/;
  var observer = null;
  function forgetOwnChanges() {
    observer?.takeRecords();
  }
  var generation = 0;
  var more = null;
  var pageSteps = /* @__PURE__ */ new WeakMap();
  var originalPagers = /* @__PURE__ */ new WeakMap();
  var pagerTotals = /* @__PURE__ */ new WeakMap();
  function isPlausibleStep(step) {
    return Number.isInteger(step) && step >= 1 && step <= 100;
  }
  function stepFromLinks(widget) {
    const points = [];
    for (const link of widget.querySelectorAll(PAGE_LINK_SELECTOR)) {
      const page = Number(link.getAttribute("page"));
      const match = START_IN_LINK.exec(link.getAttribute("href") ?? "");
      if (!Number.isInteger(page) || page < 1 || !match) continue;
      points.push({ page, start: Number(match[1]) });
    }
    for (const a of points) {
      for (const b of points) {
        if (a.page === b.page) continue;
        const step = (a.start - b.start) / (a.page - b.page);
        if (isPlausibleStep(step)) return step;
      }
    }
    const beyondFirst = points.find((point) => point.page > 1);
    if (beyondFirst) {
      const step = beyondFirst.start / (beyondFirst.page - 1);
      if (isPlausibleStep(step)) return step;
    }
    return null;
  }
  function isGap(element) {
    if (element.matches(`${PAGE_GAP_SELECTOR}, .${JUMP_CLASS}`)) return true;
    return element.matches(PAGE_LINK_SELECTOR) && /^\s*(\.\.\.|…)\s*$/.test(element.textContent ?? "");
  }
  function numberLinks(widget) {
    return [...widget.querySelectorAll(PAGE_LINK_SELECTOR)].filter((link) => !isGap(link));
  }
  function gapsOf(widget) {
    return [...widget.querySelectorAll(`${PAGE_LINK_SELECTOR}, ${PAGE_GAP_SELECTOR}, .${JUMP_CLASS}`)].filter(isGap);
  }
  function pagerPages(widget) {
    let active = 1;
    let last = 1;
    for (const link of numberLinks(widget)) {
      const page = Number(link.getAttribute("page"));
      if (!Number.isInteger(page) || page < 1) continue;
      if (link.classList.contains("active")) active = page;
      if (page > last) last = page;
    }
    return { active, last };
  }
  function pageStepFor(widget, container) {
    const cached = pageSteps.get(widget);
    if (cached !== void 0) return cached;
    let step = stepFromLinks(widget);
    let how = "its page links";
    if (step === null && container) {
      const { active, last } = pagerPages(widget);
      const own = rowsOf(container).filter(
        (row) => !row.hasAttribute(EXTRA_ROW_ATTR)
      ).length;
      if (last > active && isPlausibleStep(own) && own > 1) {
        step = own;
        how = "the rows on a full page";
      }
    }
    const hrefs = [...widget.querySelectorAll(PAGE_LINK_SELECTOR)].slice(0, 3).map((link) => link.getAttribute("href") ?? "(no href)");
    if (step === null) {
      log("step: cannot read one. Page links point at:", hrefs.join(" "));
      return null;
    }
    pageSteps.set(widget, step);
    log("step:", step, "rows per request, read from", how, "-", hrefs.join(" "));
    return step;
  }
  function routeParams() {
    const pairs = (text) => text.split("&").filter((pair) => pair.includes("=") && !pair.startsWith("start="));
    const fromHash = pairs(location.hash.replace(/^#[!/]*/, ""));
    return fromHash.length > 0 ? fromHash : pairs(location.search.replace(/^\?/, ""));
  }
  function routeValue(name) {
    const pair = routeParams().find((entry) => entry.split("=")[0] === name);
    return pair === void 0 ? null : pair.slice(name.length + 1);
  }
  var KNOWN_LISTS = [
    { path: "/messages.php", when: { p: "inbox" }, bare: true, body: "p=inbox&step=inbox" },
    { path: "/bounties.php", when: { p: "main" }, bare: true, body: "p=main&step=mainBounties" },
    {
      path: "/forums.php",
      when: { p: "forums" },
      needs: ["f", "b", "a"],
      body: "p=forums&f={f}&b={b}&a={a}&title=true&step=forums"
    },
    {
      path: "/forums.php",
      when: { p: "threads" },
      needs: ["f", "t", "b", "a"],
      body: "p=threads&f={f}&t={t}&b={b}&a={a}&title=true&step=threads"
    },
    // The tab is #itemtab= in the address but itemtype= in the request.
    { path: "/amarket.php", needs: ["itemtab"], body: "step=getAuctionItemsList&itemtype={itemtab}" },
    { path: "/joblist.php", when: { p: "main" }, bare: true, body: "p=main&step=mainJoblist" },
    { path: "/joblist.php", when: { p: "corp" }, needs: ["ID"], body: "p=corp&ID={ID}&step=corpJoblist" },
    { path: "/personals.php", when: { p: "main" }, bare: true, body: "p=main&step=mainPersonals" },
    {
      path: "/personals.php",
      when: { p: "search" },
      needs: ["type"],
      body: "p=search&type={type}&step=searchPersonals"
    },
    // The search term goes as Torn sends it: "best+car" in the address, "best%2Bcar" in the request.
    {
      path: "/forums.php",
      when: { p: "search" },
      needs: ["q", "f", "y"],
      encode: ["q"],
      body: "p=search&q={q}&f={f}&y={y}&title=true&step=search"
    },
    {
      path: "/comics.php",
      when: { p: "main" },
      bare: true,
      hashPrefix: "#!",
      body: "p=main&step=mainComics&cross_page_request=false"
    },
    {
      path: "/properties.php",
      step: "rentalmarket",
      needs: ["property"],
      body: "step=rentalMarket&property={property}"
    },
    {
      path: "/properties.php",
      step: "sellingmarket",
      needs: ["property"],
      body: "step=sellingMarket&property={property}"
    }
  ];
  function listRequest() {
    const list = currentList();
    if (!list) return null;
    let body = list.body;
    for (const name of list.needs ?? []) {
      const value = routeValue(name) ?? "";
      body = body.replace(`{${name}}`, list.encode?.includes(name) ? encodeURIComponent(value) : value);
    }
    return body;
  }
  function currentList() {
    const pageStep = new URLSearchParams(location.search).get("step");
    for (const list of KNOWN_LISTS) {
      if (list.path !== location.pathname) continue;
      if (list.step !== void 0 && list.step !== pageStep) continue;
      const bare = list.bare === true && routeParams().length === 0;
      const matches = Object.entries(list.when ?? {}).every(([name, value]) => routeValue(name) === value);
      if (!matches && !bare) continue;
      const values = (list.needs ?? []).map((name) => [name, routeValue(name)]);
      if (values.some(([, value]) => value === null)) continue;
      return list;
    }
    return null;
  }
  var MAX_CLIMB = 4;
  function isRow(element) {
    if (element.classList.contains(SPACER_CLASS)) return false;
    return element.childElementCount > 0 || (element.textContent ?? "").trim() !== "";
  }
  function rowsOf(container) {
    return [...container.children].filter(isRow);
  }
  function fitScore(container, step) {
    const own = rowsOf(container).filter((row) => !row.hasAttribute(EXTRA_ROW_ATTR)).length;
    if (step === null) return 1;
    if (own === step) return 0;
    return own < step ? 1 : 2;
  }
  function findRowContainer(root, step) {
    if (root.closest(NOT_A_LIST)) return null;
    let best = null;
    const candidates = root.matches(ROW_CONTAINER_SELECTOR) ? [root, ...root.querySelectorAll(ROW_CONTAINER_SELECTOR)] : [...root.querySelectorAll(ROW_CONTAINER_SELECTOR)];
    for (const element of candidates) {
      if (element.closest(PAGINATION_SELECTOR)) continue;
      if (element.closest(NOT_A_LIST)) continue;
      const rows = rowsOf(element).length;
      if (rows < 2) continue;
      const score = fitScore(element, step);
      if (!best || score < best.score || score === best.score && rows > best.rows) {
        best = { container: element, score, rows };
      }
    }
    return best;
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
        if (!sibling.matches(PAGINATION_SELECTOR) && !isSpacer(sibling)) {
          into.push(sibling);
        }
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
  function findList(widget, step) {
    let best = null;
    let node = widget;
    for (let level2 = 0; node && node !== document.body && level2 <= MAX_CLIMB; level2 += 1) {
      if (node.matches(CONTENT_ROOT_SELECTOR)) break;
      for (const sibling of siblingsOf(node)) {
        const found = findRowContainer(sibling, step);
        if (!found || best && found.score >= best.score) continue;
        best = {
          widget,
          pagerBlock: node,
          block: sibling,
          container: found.container,
          step: step ?? pageStepFor(widget, found.container),
          score: found.score
        };
        if (found.score === 0) return best;
      }
      node = node.parentElement;
    }
    return best;
  }
  function isShown(element) {
    return element.getClientRects().length > 0;
  }
  function pagerIsAbove(target) {
    return Boolean(
      target.pagerBlock.compareDocumentPosition(target.block) & Node.DOCUMENT_POSITION_FOLLOWING
    );
  }
  function findTarget() {
    let best = null;
    for (const widget of document.querySelectorAll(PAGINATION_SELECTOR)) {
      if (!widget.querySelector(PAGE_LINK_SELECTOR)) continue;
      if (!isShown(widget)) continue;
      const found = findList(widget, pageStepFor(widget));
      if (!found) continue;
      const better = !best || found.score < best.score || found.score === best.score && found.container === best.container && pagerIsAbove(found) && !pagerIsAbove(best);
      if (better) best = found;
    }
    return best;
  }
  function shownStart(widget, step) {
    if (widget.querySelector(`${PAGE_LINK_SELECTOR}.active`)) {
      return (pagerPages(widget).active - 1) * step;
    }
    const match = START_IN_HASH.exec(location.hash);
    return match ? Number(match[1]) : 0;
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
  function looseRows(parsed, live) {
    const rowTag = live.firstElementChild?.tagName;
    const body = parsed.body;
    if (!rowTag || !body) return null;
    const matching2 = [...body.children].filter(
      (child) => child.tagName === rowTag
    );
    return matching2.length > 0 ? body : null;
  }
  function markupIn(text) {
    const head = text.trimStart()[0];
    if (head !== "{" && head !== "[") return text;
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return text;
    }
    let best = "";
    const looksLikeRows = /<\s*(li|tr|div|ul|ol|table|tbody)\b/i;
    const walk = (value, depth) => {
      if (depth > 6) return;
      if (typeof value === "string") {
        if (looksLikeRows.test(value) && value.length > best.length) best = value;
        return;
      }
      if (Array.isArray(value)) {
        for (const item of value) walk(item, depth + 1);
        return;
      }
      if (value !== null && typeof value === "object") {
        for (const item of Object.values(value)) walk(item, depth + 1);
      }
    };
    walk(data, 0);
    return best === "" ? text : best;
  }
  async function fetchRows(request, start2, live) {
    const rfcv = RFCV_COOKIE2.exec(document.cookie)?.[1];
    const url = `${location.pathname.slice(1)}${rfcv ? `?rfcv=${rfcv}` : ""}`;
    const body = `${request}&start=${start2}`;
    let html;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "X-Requested-With": "XMLHttpRequest",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
        },
        credentials: "same-origin",
        body
      });
      if (!response.ok) {
        log("fetch: start", start2, "->", response.status, response.statusText);
        return [];
      }
      html = await response.text();
    } catch {
      return [];
    }
    const template = rowsOf(live)[0];
    const built = template ? rowsFromJson(html, template) : null;
    if (built) {
      log(
        "fetch: start",
        start2,
        "->",
        html.length,
        "chars,",
        built.length,
        "rows built from data"
      );
      return built;
    }
    const parsed = new DOMParser().parseFromString(markupIn(html), "text/html");
    const container = matchingContainer(parsed, live) ?? looseRows(parsed, live);
    const rows = container ? rowsOf(container) : [];
    log(
      "fetch: start",
      start2,
      "->",
      html.length,
      "chars,",
      container ? `matched ${container.tagName}.${container.className}` : "NO LIST FOUND",
      `${rows.length} rows`
    );
    if (!container) log("fetch: the response began:", html.slice(0, 300));
    return rows;
  }
  function disarm(row) {
    for (const script of row.querySelectorAll("script, iframe, object, embed")) {
      script.remove();
    }
    for (const element of [row, ...row.querySelectorAll("*")]) {
      for (const attribute of [...element.attributes]) {
        if (attribute.name.toLowerCase().startsWith("on")) {
          element.removeAttribute(attribute.name);
        }
      }
    }
    return row;
  }
  function removeAllExtraRows() {
    const extra = document.querySelectorAll(`[${EXTRA_ROW_ATTR}]`);
    if (extra.length === 0) return;
    for (const row of extra) row.remove();
    forgetOwnChanges();
    log("more: took back", extra.length, "added rows");
  }
  function reset() {
    removeAllExtraRows();
    more = null;
    generation += 1;
    showTopButton(false);
  }
  function showTopButton(show2) {
    const existing = document.getElementById(TOP_BUTTON_ID);
    if (!show2) {
      if (!existing) return;
      existing.remove();
      forgetOwnChanges();
      removeEventListener("scroll", placeTopButton);
      removeEventListener("resize", placeTopButton);
      return;
    }
    if (existing) return;
    const button = document.createElement("button");
    button.type = "button";
    button.id = TOP_BUTTON_ID;
    button.setAttribute("aria-label", TOP_LABEL);
    button.title = TOP_LABEL;
    button.innerHTML = TOP_ICON;
    button.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    document.body.appendChild(button);
    forgetOwnChanges();
    placeTopButton();
    addEventListener("scroll", placeTopButton, { passive: true });
    addEventListener("resize", placeTopButton, { passive: true });
  }
  function placeTopButton() {
    const button = document.getElementById(TOP_BUTTON_ID);
    if (!button) return;
    const ticker = document.querySelector(BAR_SELECTOR);
    const below = ticker ? ticker.getBoundingClientRect().bottom : 0;
    button.style.top = `${Math.max(below, 0) + TOP_BUTTON_MARGIN_PX}px`;
  }
  function setButtons(text, disabled) {
    for (const button of document.querySelectorAll(`.${MORE_BUTTON_CLASS}`)) {
      button.textContent = text;
      button.disabled = disabled;
    }
  }
  function partName(element) {
    return [element.tagName, ...[...element.classList].sort()].join(".");
  }
  function closedParts(rows) {
    const perRow = rows.map((row) => {
      const hidden = /* @__PURE__ */ new Set();
      const shown = /* @__PURE__ */ new Set();
      for (const element of row.querySelectorAll("*")) {
        if (element.classList.length === 0) continue;
        const name = partName(element);
        if (getComputedStyle(element).display === "none") hidden.add(name);
        else shown.add(name);
      }
      for (const name of shown) hidden.delete(name);
      return hidden;
    });
    const [first, ...rest] = perRow;
    if (!first) return /* @__PURE__ */ new Set();
    return new Set([...first].filter((name) => rest.every((hidden) => hidden.has(name))));
  }
  function closeLikeTorn(row, closed) {
    if (closed.size === 0) return row;
    for (const element of row.querySelectorAll("*")) {
      if (closed.has(partName(element))) element.style.display = "none";
    }
    return row;
  }
  async function loadMore() {
    const state = more;
    if (!state || state.loading || state.done) return;
    const target = findTarget();
    const request = listRequest();
    if (!target || target.container !== state.container || request === null) return;
    const { container } = target;
    const { step } = state;
    const mine = generation;
    state.loading = true;
    setButtons(LOADING_LABEL, true);
    const rows = await fetchRows(request, state.next, container);
    state.loading = false;
    if (mine !== generation || !container.isConnected) {
      log("more: abandoned, the list moved on");
      return;
    }
    const spacer = container.querySelector(`:scope > .${SPACER_CLASS}`);
    const closed = closedParts(rowsOf(container).filter((row) => !row.hasAttribute(EXTRA_ROW_ATTR)));
    try {
      for (const row of rows) {
        closeLikeTorn(disarm(row), closed).setAttribute(EXTRA_ROW_ATTR, "");
        if (spacer) container.insertBefore(row, spacer);
        else container.appendChild(row);
      }
    } finally {
      forgetOwnChanges();
    }
    log("more: added", rows.length, "rows from start", state.next);
    if (rows.length === 0) {
      state.done = true;
      setButtons(FAILED_LABEL, true);
      syncPagers(false);
      return;
    }
    state.next += step;
    if (rows.length < step) state.done = true;
    if (state.total !== null && state.next > (state.total - 1) * step) state.done = true;
    setButtons(SHOW_MORE_LABEL, false);
    showTopButton(true);
    syncPagers(!state.done);
  }
  function readTotal(widget) {
    const items = [...widget.querySelectorAll(`${PAGE_LINK_SELECTOR}, ${PAGE_GAP_SELECTOR}`)];
    const lastLink = items.filter((item) => !isGap(item)).pop();
    if (!lastLink) return null;
    const after = items.slice(items.indexOf(lastLink) + 1);
    if (after.some((item) => isGap(item) && isShown(item))) return null;
    return Number(lastLink.getAttribute("page")) || null;
  }
  function totalPages(widget) {
    return pagerTotals.has(widget) ? pagerTotals.get(widget) ?? null : readTotal(widget);
  }
  function hrefBase(widget) {
    const links = [...widget.querySelectorAll(PAGE_LINK_SELECTOR)];
    const source2 = links.find((link) => START_IN_LINK.test(link.getAttribute("href") ?? "")) ?? links.find((link) => (link.getAttribute("href") ?? "").length > 1);
    const href = source2?.getAttribute("href");
    if (!href) return null;
    return href.replace(/(^|[#?&])start=\d+&?/, "$1").replace(/[?&]$/, "");
  }
  function hrefWith(base, start2) {
    const separator = /[#?&]$/.test(base) ? "" : base.includes("#") || base.includes("?") ? "&" : "#";
    return `${base}${separator}start=${start2}`;
  }
  function hrefAt(widget, start2) {
    const base = hrefBase(widget);
    return base === null ? null : hrefWith(base, start2);
  }
  function pagedByClicks(widget) {
    const href = widget.querySelector(`${PAGE_LINK_SELECTOR}[href]`)?.getAttribute("href") ?? "";
    return href.includes("#") && href[0] !== "#";
  }
  function goToPage(widget, page, step) {
    const href = hrefAt(widget, (page - 1) * step);
    if (!href || pagedByClicks(widget)) {
      log("page: no page link to follow, so cannot move to page", page);
      return;
    }
    const target = new URL(href, location.href);
    if (target.origin !== location.origin) return;
    log("page: going to page", page);
    if (href[0] === "#") location.hash = target.hash;
    else {
      const prefix = currentList()?.hashPrefix;
      if (prefix !== void 0) location.hash = prefix + target.search.slice(1);
      else location.assign(target.href);
    }
  }
  function buildJump(widget, total, step) {
    const input = document.createElement("input");
    input.type = "number";
    input.className = JUMP_CLASS;
    input.min = "1";
    if (total !== null) input.max = String(total);
    input.placeholder = "...";
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const page = Math.round(Number(input.value));
      if (!Number.isFinite(page) || page < 1) return;
      goToPage(widget, total === null ? page : Math.min(page, total), step);
    });
    return input;
  }
  function pageLink(template, base, page, step, label, active) {
    const link = template.cloneNode(true);
    link.style.removeProperty("display");
    link.setAttribute("page", String(page));
    link.setAttribute(OWN_LINK_ATTR, "");
    link.classList.remove("first", "last", "active");
    if (active) {
      link.classList.add("active");
      link.removeAttribute("href");
    } else if (base !== null) {
      link.setAttribute("href", hrefWith(base, (page - 1) * step));
    }
    const number = link.querySelector(".page-nb") ?? link;
    number.textContent = label;
    if (label !== String(page)) link.classList.add(RANGE_CLASS);
    return link;
  }
  function convertOneGap(widget, total, step) {
    const gaps = gapsOf(widget).filter(isShown);
    if (gaps.some((gap) => gap.classList.contains(JUMP_CLASS))) return;
    const active = numberLinks(widget).find((link) => link.classList.contains("active"));
    const after = active ? gaps.filter((gap) => active.compareDocumentPosition(gap) & Node.DOCUMENT_POSITION_FOLLOWING) : [];
    const chosen = after[0] ?? gaps[gaps.length - 1];
    chosen?.replaceWith(buildJump(widget, total, step));
  }
  function syncPager(widget, step) {
    const ours = widget.querySelector(`[${OWN_LINK_ATTR}], .${JUMP_CLASS}`) !== null;
    if (!ours) {
      originalPagers.set(widget, widget.innerHTML);
      pagerTotals.set(widget, readTotal(widget));
      widget.removeAttribute(PAGER_STATE_ATTR);
    }
    const active = pagerPages(widget).active;
    const first = more ? more.base / step + 1 : active;
    const loaded = more ? more.next / step : active;
    const total = more?.done ? loaded : more?.total ?? totalPages(widget);
    const state = `${first}:${loaded}:${total ?? "?"}`;
    if (widget.getAttribute(PAGER_STATE_ATTR) === state) return;
    try {
      const jumps = !pagedByClicks(widget);
      if (loaded <= first) {
        if (jumps) convertOneGap(widget, total, step);
        widget.setAttribute(PAGER_STATE_ATTR, state);
        return;
      }
      const numbers = numberLinks(widget);
      const template = numbers.find((link) => !link.classList.contains("active")) ?? numbers[0];
      if (!template) return;
      const anchor = widget.querySelector(ARROW_NEXT_ANY)?.closest("a") ?? widget.querySelector(".pagination-r");
      const base = hrefBase(widget);
      const gapTemplate = gapsOf(widget).find((gap) => !gap.classList.contains(JUMP_CLASS))?.cloneNode(true) ?? null;
      const plainGap = () => {
        const gap = gapTemplate?.cloneNode(true);
        if (!(gap instanceof HTMLElement)) return document.createTextNode(" ... ");
        gap.style.removeProperty("display");
        return gap;
      };
      const before = [first - 2, first - 1].filter((page) => page >= 1);
      const after = [loaded + 1, loaded + 2].filter((page) => total === null || page <= total);
      const showFirst = total !== null && (before[0] ?? first) > 1;
      const showLast = total !== null && (after[after.length - 1] ?? loaded) < total;
      const hiddenBefore = (before[0] ?? first) > (showFirst ? 2 : 1);
      const hiddenAfter = total === null || (after[after.length - 1] ?? loaded) < total - (showLast ? 1 : 0);
      const fragment = document.createDocumentFragment();
      const add = (page, label, isActive) => fragment.appendChild(pageLink(template, base, page, step, label, isActive));
      if (showFirst) add(1, "1", false);
      if (hiddenBefore) {
        fragment.appendChild(jumps && !hiddenAfter ? buildJump(widget, total, step) : plainGap());
      }
      for (const page of before) add(page, String(page), false);
      add(first, `${first}-${loaded}`, true);
      for (const page of after) add(page, String(page), false);
      if (hiddenAfter) fragment.appendChild(jumps ? buildJump(widget, total, step) : plainGap());
      if (showLast && total !== null) {
        add(total, String(total), false);
        fragment.lastChild.classList.add("last");
      }
      for (const old of widget.querySelectorAll(
        `${PAGE_LINK_SELECTOR}, ${PAGE_GAP_SELECTOR}, .${JUMP_CLASS}`
      )) {
        old.remove();
      }
      if (anchor && anchor.parentElement === widget) widget.insertBefore(fragment, anchor);
      else widget.appendChild(fragment);
      if (base === null) log("pager: no page link with an address, so the redrawn links have none");
      widget.querySelector(ARROW_PREV_ANY)?.classList.toggle(ARROW_DISABLED_CLASS, first <= 1);
      widget.querySelector(ARROW_NEXT_ANY)?.classList.toggle(ARROW_DISABLED_CLASS, total !== null && loaded >= total);
      widget.setAttribute(PAGER_STATE_ATTR, state);
    } finally {
      forgetOwnChanges();
    }
  }
  function ensurePagerButton(widget) {
    if (widget.querySelector(`.${MORE_BUTTON_CLASS}`)) return;
    const active = widget.querySelector(`${PAGE_LINK_SELECTOR}.active`);
    const button = document.createElement("button");
    button.type = "button";
    button.className = MORE_BUTTON_CLASS;
    const shown = document.querySelector(`.${MORE_BUTTON_CLASS}`);
    button.textContent = shown?.textContent ?? SHOW_MORE_LABEL;
    button.disabled = shown?.disabled ?? false;
    if (active) {
      const style = getComputedStyle(active);
      const transparent = /rgba\(0, 0, 0, 0\)|transparent/.test(style.backgroundColor);
      button.style.setProperty("--aue-more-bg", style.backgroundColor);
      button.style.setProperty("--aue-more-img", style.backgroundImage);
      button.style.setProperty("--aue-more-edge", transparent ? "rgba(255, 255, 255, 0.3)" : style.backgroundColor);
      button.style.setProperty("--aue-more-radius", style.borderRadius);
      button.style.setProperty("--aue-more-color", style.color);
      button.style.setProperty("--aue-more-height", `${active.getBoundingClientRect().height || 26}px`);
      button.style.setProperty("--aue-more-font", style.fontFamily);
      button.style.setProperty("--aue-more-size", style.fontSize);
    }
    button.addEventListener("click", () => void loadMore());
    if (getComputedStyle(widget).position === "static") widget.style.position = "relative";
    widget.appendChild(button);
    if (widget.dataset.aueMorePadding === void 0) {
      widget.dataset.aueMorePadding = widget.style.paddingRight;
    }
    const room = button.offsetWidth + 2 * MORE_BUTTON_GAP_PX;
    if (parseFloat(getComputedStyle(widget).paddingRight) < room) widget.style.paddingRight = `${room}px`;
    forgetOwnChanges();
  }
  function syncPagers(showButton) {
    for (const widget of document.querySelectorAll(PAGINATION_SELECTOR)) {
      if (!widget.querySelector(PAGE_LINK_SELECTOR) || !isShown(widget)) continue;
      const step = pageStepFor(widget) ?? more?.step;
      if (step === void 0) continue;
      syncPager(widget, step);
      const failed = widget.querySelector(`.${MORE_BUTTON_CLASS}:disabled`) !== null && !more?.loading;
      if (showButton) ensurePagerButton(widget);
      else if (!failed) removeButtons(widget);
    }
  }
  function removeButtons(root = document) {
    const buttons = root.querySelectorAll(`.${MORE_BUTTON_CLASS}`);
    if (buttons.length === 0) return;
    for (const button of buttons) {
      const widget = button.parentElement;
      button.remove();
      if (widget?.dataset.aueMorePadding !== void 0) {
        widget.style.paddingRight = widget.dataset.aueMorePadding;
        delete widget.dataset.aueMorePadding;
      }
    }
    forgetOwnChanges();
  }
  function restorePagers() {
    for (const widget of document.querySelectorAll(`[${PAGER_STATE_ATTR}]`)) {
      const original = originalPagers.get(widget);
      if (original !== void 0) widget.innerHTML = original;
      widget.removeAttribute(PAGER_STATE_ATTR);
    }
    forgetOwnChanges();
  }
  function arrowDirection(clicked2, widget) {
    for (let node = clicked2; node && node !== widget; node = node.parentElement) {
      const next = node.matches(ARROW_NEXT_ANY) || node.querySelector(ARROW_NEXT_ANY) !== null;
      const prev = node.matches(ARROW_PREV_ANY) || node.querySelector(ARROW_PREV_ANY) !== null;
      if (next && !prev) return "next";
      if (prev && !next) return "prev";
      if (next && prev) return null;
    }
    return null;
  }
  function installArrowClicks() {
    document.addEventListener(
      "click",
      (event) => {
        if (!isEnabled(LIST_DISPLAY_EXTENSION)) return;
        const state = more;
        if (!state || state.next - state.base <= state.step) return;
        const clicked2 = event.target;
        if (!(clicked2 instanceof Element)) return;
        const widget = clicked2.closest(PAGINATION_SELECTOR);
        if (!widget || pagedByClicks(widget)) return;
        const direction = arrowDirection(clicked2, widget);
        if (direction === null) return;
        const page = direction === "next" ? state.next / state.step + 1 : state.base / state.step;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        if (page < 1 || state.done && direction === "next") return;
        goToPage(widget, page, state.step);
      },
      true
    );
  }
  var lastHiddenReason = "";
  function hiddenBecause(reason) {
    if (reason === lastHiddenReason) return;
    lastHiddenReason = reason;
    log("more: no button -", reason);
  }
  function whyNoList() {
    const pagers = [...document.querySelectorAll(PAGINATION_SELECTOR)];
    if (pagers.length === 0) return "no element matches .pagination on this page";
    const withLinks = pagers.filter((widget) => widget.querySelector(PAGE_LINK_SELECTOR));
    if (withLinks.length === 0) {
      const sample = pagers[0]?.innerHTML.replace(/\s+/g, " ").slice(0, 300) ?? "";
      return `${pagers.length} pager(s), none with a.page-number[page] links. First pager: ${sample}`;
    }
    if (!withLinks.some(isShown)) return `${withLinks.length} pager(s) with links, all hidden`;
    return "a pager is shown, but no list of rows was found beside it";
  }
  function apply3() {
    if (!isEnabled(LIST_DISPLAY_EXTENSION)) {
      removeButtons();
      restorePagers();
      if (more) reset();
      return;
    }
    const target = findTarget();
    if (!target) {
      hiddenBecause(whyNoList());
      removeButtons();
      return;
    }
    if (target.step === null) {
      hiddenBecause("the list was found, but its rows per page could not be read");
      removeButtons();
      return;
    }
    const { step } = target;
    const base = shownStart(target.widget, step);
    if (!more || more.container !== target.container || more.base !== base) {
      if (more) reset();
      const total = totalPages(target.widget);
      more = {
        container: target.container,
        step,
        base,
        next: base + step,
        total,
        done: total !== null && base + step > (total - 1) * step,
        loading: false
      };
      log("more: list of", step, "a page, at start", base, "of", total ?? "an unknown number of", "pages");
    }
    const state = more;
    const request = listRequest();
    syncPagers(!state.done && request !== null);
    if (state.done || request === null) {
      hiddenBecause(
        state.done ? `on the last page (start ${state.base}, ${step} a page)` : `not a list Show more knows: ${location.pathname}${location.search}${location.hash}`
      );
      return;
    }
    lastHiddenReason = "";
  }
  function installListDisplay() {
    installArrowClicks();
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith(OLD_REQUEST_PREFIX)) localStorage.removeItem(key);
      }
    } catch {
    }
    let timer = 0;
    let deadline = 0;
    const schedule2 = () => {
      const now = Date.now();
      if (deadline === 0) deadline = now + MAX_SETTLE_MS;
      clearTimeout(timer);
      timer = window.setTimeout(
        () => {
          deadline = 0;
          apply3();
        },
        Math.max(0, Math.min(SETTLE_MS2, deadline - now))
      );
    };
    observer = new MutationObserver((records) => {
      const elements = (nodes) => [...nodes].some((node) => node.nodeType === Node.ELEMENT_NODE);
      if (records.some((record) => elements(record.addedNodes) || elements(record.removedNodes))) schedule2();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    addEventListener("hashchange", () => {
      reset();
      removeButtons();
      schedule2();
    });
    schedule2();
  }

  // src/autumns-ui-enhancer/listSort.ts
  var NOT_A_COLUMN = /* @__PURE__ */ new Set(["clear", "title", "divider"]);
  var MIN_COLUMNS = 2;
  var MIN_ROWS = 2;
  var ALREADY_SORTABLE = ".sortable, .jquery-tablesorter";
  var SETTLE_MS3 = 150;
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
    let seen4 = 0;
    for (const row of rows) {
      const text = column.read(row);
      if (text === "") continue;
      if (numberIn(text) === null) return false;
      seen4 += 1;
    }
    return seen4 > 0;
  }
  function keyOf2(cell) {
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
    for (const start2 of [target.container, target.container.parentElement]) {
      let node = start2?.previousElementSibling ?? null;
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
      const key = keyOf2(cell);
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
  function pass2() {
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
    const schedule2 = () => {
      if (writing2) return;
      clearTimeout(timer);
      timer = window.setTimeout(pass2, SETTLE_MS3);
    };
    new MutationObserver((records) => {
      if (!onlyOurs(records)) schedule2();
    }).observe(document.body, {
      childList: true,
      subtree: true
    });
    addEventListener("hashchange", schedule2);
    schedule2();
  }

  // src/autumns-ui-enhancer/localChat.ts
  var CHAT_ROOT_SELECTOR = "#chatRoot";
  var CHAT_ID_SELECTOR = 'div[id^="public_"], div[id^="private-"], div[id^="faction"], div[id^="company"], div#staff';
  var MINIMISE_SELECTOR = 'svg[aria-label^="Minimize"]';
  var CLOSE_SELECTOR = 'svg[aria-label^="Close chat"]';
  var TASKBAR_PREFIX = "chat_panel_button:";
  var TASKBAR_SELECTOR = `button[id^="${TASKBAR_PREFIX}"]`;
  var BOX_SELECTOR = "div[id]";
  var NOT_A_CHAT = /_panel$/;
  var HIDDEN_CLASS = "aue-chat-hidden";
  var LEFT_CLASS = "aue-chat-left";
  var INSTANT_CLASS = "aue-chat-instant";
  var HIDDEN_KEY = "AUE_CHAT_HIDDEN";
  var KNOWN_KEY = "AUE_CHAT_KNOWN";
  var SIDE_KEY = "AUE_CHAT_SIDE";
  var PEOPLE_PANEL_SELECTOR = "#people_panel";
  var MENU_OPEN_MS = 3e3;
  var TASKBAR_CLIMB = 4;
  var SIDE_BUTTON_ID = "aue-chat-side";
  var SIDE_BUTTON_LEFT = "aue-chat-side-left";
  var FAILSAFE_MS = 5e3;
  var SETTLE_MS4 = 120;
  var MAX_SETTLE_MS2 = 600;
  var SAFE_ID = /^[A-Za-z0-9_-]+$/;
  var earlyHide = null;
  function liftEarlyHide() {
    if (!earlyHide) return;
    earlyHide.remove();
    earlyHide = null;
  }
  var focusedOnArrival = true;
  function isTheActiveTab() {
    try {
      return document.hasFocus();
    } catch {
      return true;
    }
  }
  function readSet(key) {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return /* @__PURE__ */ new Set();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return /* @__PURE__ */ new Set();
      return new Set(parsed.filter((id) => typeof id === "string"));
    } catch {
      return /* @__PURE__ */ new Set();
    }
  }
  function writeSet(key, ids) {
    try {
      sessionStorage.setItem(key, JSON.stringify([...ids]));
    } catch {
    }
  }
  var startHidden = false;
  var menuOpen = null;
  function chatName(box2) {
    const label = box2.querySelector(MINIMISE_SELECTOR)?.getAttribute("aria-label") ?? "";
    return label.replace(/^Minimi[sz]e\s*(chat\s*(with)?\s*)?/i, "").trim();
  }
  function pickedFromMenu(box2) {
    if (!menuOpen || Date.now() > menuOpen.until) return false;
    const name = chatName(box2);
    if (name === "" || !menuOpen.texts.includes(name)) return false;
    menuOpen = null;
    return true;
  }
  function tabIsNew() {
    try {
      return sessionStorage.getItem(KNOWN_KEY) === null;
    } catch {
      return true;
    }
  }
  function barSide() {
    if (!isEnabled(CHAT_SIDE_BUTTON)) return "right";
    try {
      return sessionStorage.getItem(SIDE_KEY) === "left" ? "left" : "right";
    } catch {
      return "right";
    }
  }
  function setBarSide(side) {
    try {
      sessionStorage.setItem(SIDE_KEY, side);
    } catch {
    }
  }
  function tornOffset(wrapper) {
    const match = /translateX\((-?[\d.]+)px\)/.exec(wrapper.style.transform);
    return match ? Number(match[1]) : 0;
  }
  function allowSmoothOffset(wrapper) {
    if (wrapper.dataset.aueEased === "1") return;
    wrapper.dataset.aueEased = "1";
    const already = getComputedStyle(wrapper).transitionProperty;
    if (already.includes("translate") || already.includes("all")) return;
    const widened = already === "none" ? "translate" : `${already}, translate`;
    wrapper.style.setProperty("transition-property", widened, "important");
  }
  var writtenOffsets = /* @__PURE__ */ new WeakMap();
  function setOffset(wrapper, x, instant = false) {
    const wanted = Math.abs(x) < 0.5 ? "" : `${Math.round(x * 10) / 10}px 0`;
    if (wrapper.style.translate === wanted) return;
    const placeAtOnce = instant || wrapper.style.translate === "";
    if (placeAtOnce) wrapper.classList.add(INSTANT_CLASS);
    allowSmoothOffset(wrapper);
    if (wanted === "") wrapper.style.removeProperty("translate");
    else wrapper.style.setProperty("translate", wanted, "important");
    writtenOffsets.set(wrapper, wrapper.style.translate);
    if (placeAtOnce) {
      void wrapper.offsetWidth;
      wrapper.classList.remove(INSTANT_CLASS);
    }
  }
  function wrapperOf(box2) {
    const wrapper = box2.parentElement?.parentElement;
    return wrapper instanceof HTMLElement ? wrapper : null;
  }
  function boxOf(element) {
    const box2 = element.closest(BOX_SELECTOR);
    if (!box2 || !box2.id || NOT_A_CHAT.test(box2.id)) return null;
    return box2;
  }
  function isWindowBox(box2) {
    if (NOT_A_CHAT.test(box2.id)) return false;
    return wrapperOf(box2)?.style.transform.includes("translateX(") ?? false;
  }
  function chatBoxes() {
    const found = /* @__PURE__ */ new Set();
    const root = document.querySelector(CHAT_ROOT_SELECTOR) ?? document;
    for (const box2 of root.querySelectorAll(CHAT_ID_SELECTOR)) {
      if (isWindowBox(box2)) found.add(box2);
    }
    for (const button of document.querySelectorAll(MINIMISE_SELECTOR)) {
      const box2 = boxOf(button);
      if (box2) found.add(box2);
    }
    return [...found];
  }
  function chatWindows() {
    const found = [];
    for (const box2 of chatBoxes()) {
      const wrapper = wrapperOf(box2);
      if (wrapper) found.push({ id: box2.id, wrapper });
    }
    return found;
  }
  function findTaskbar() {
    let node = document.querySelector(TASKBAR_SELECTOR)?.parentElement ?? null;
    for (let step = 0; node && step < TASKBAR_CLIMB; step += 1) {
      const laidOutInARow = getComputedStyle(node).display === "flex";
      if (laidOutInARow && node.children.length > 1) return node;
      node = node.parentElement;
    }
    return null;
  }
  function layOutTaskbar(side) {
    const bar = findTaskbar();
    if (!bar) return;
    if (side === "left") {
      if (reversedBar === bar && bar.style.flexDirection !== "row-reverse") {
        noteUndone(CHAT_SIDE_BUTTON.label, "the chat bar's direction", chatRoot());
      }
      bar.style.setProperty("flex-direction", "row-reverse", "important");
      reversedBar = bar;
    } else {
      bar.style.removeProperty("flex-direction");
      reversedBar = null;
    }
    placeSideButton(bar, side);
  }
  var reversedBar = null;
  var buttonBar = null;
  function chatRoot() {
    return document.querySelector(CHAT_ROOT_SELECTOR);
  }
  function nativeClasses() {
    let closed = null;
    const opened = /* @__PURE__ */ new Set();
    for (const button of document.querySelectorAll(TASKBAR_SELECTOR)) {
      if (/^\d+$/.test(button.id.slice(TASKBAR_PREFIX.length))) continue;
      const classes = [...button.classList];
      for (const name of classes) if (name.startsWith("opened")) opened.add(name);
      const base = classes.filter((name) => !STATE_CLASS.test(name));
      closed = closed ? closed.filter((name) => base.includes(name)) : base;
    }
    return closed && closed.length > 0 ? { closed, opened: [...opened] } : null;
  }
  var STATE_CLASS = /^(opened|message|unread|new)/i;
  function sideButton() {
    const existing = document.getElementById(SIDE_BUTTON_ID);
    if (existing instanceof HTMLButtonElement) return existing;
    const button = document.createElement("button");
    button.type = "button";
    button.id = SIDE_BUTTON_ID;
    button.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true">
<defs><linearGradient id="aue-arrow-fill" x1="0" y1="0" x2="0" y2="1">
<stop class="aue-arrow-start" offset="0"/><stop class="aue-arrow-end" offset="1"/>
</linearGradient></defs>
<path fill="url(#aue-arrow-fill)" d="M2 10 9.5 2.5V7H18v6H9.5v4.5Z"/>
</svg>`;
    button.addEventListener("click", () => {
      setBarSide(barSide() === "left" ? "right" : "left");
      relayout2();
      log("chat: bar moved to the", barSide());
    });
    return button;
  }
  function placeSideButton(bar, side) {
    if (!isEnabled(CHAT_SIDE_BUTTON)) {
      document.getElementById(SIDE_BUTTON_ID)?.remove();
      return;
    }
    const button = sideButton();
    if (button.parentElement !== bar) {
      if (buttonBar === bar) {
        noteUndone(CHAT_SIDE_BUTTON.label, "the left/right button's place in the chat bar", chatRoot());
      }
      bar.prepend(button);
      buttonBar = bar;
    }
    const left = side === "left";
    const native = nativeClasses();
    const useNative = native !== null && (!left || native.opened.length > 0);
    const classes = [
      ...useNative ? native.closed : [],
      ...useNative && left ? native.opened : [],
      ...useNative ? ["aue-native"] : [],
      ...left ? [SIDE_BUTTON_LEFT] : []
    ].join(" ");
    if (button.className !== classes) button.className = classes;
    const label = left ? "Move chats to the right" : "Move chats to the left";
    if (button.title !== label) {
      button.title = label;
      button.setAttribute("aria-label", label);
      const arrow = button.querySelector("svg");
      if (arrow) arrow.style.transform = left ? "scaleX(-1)" : "";
    }
  }
  function windowRow() {
    const fromChat = chatWindows()[0]?.wrapper.parentElement;
    if (fromChat) return fromChat;
    const bar = findTaskbar();
    const shell = bar?.parentElement;
    if (!bar || !shell) return null;
    for (const child of shell.children) {
      if (child !== bar && child instanceof HTMLElement) return child;
    }
    return null;
  }
  function rowItems() {
    const row = windowRow();
    if (!row) return [];
    return [...row.children].filter(
      (child) => child instanceof HTMLElement && isPositionedByTorn(child)
    );
  }
  function isPositionedByTorn(element) {
    if (element.style.display === "none") return false;
    if (element.style.position === "fixed") return false;
    return true;
  }
  var itemWidths = /* @__PURE__ */ new WeakMap();
  var rowWidth = 0;
  function measureRow() {
    const row = windowRow();
    if (!row) return;
    rowWidth = row.getBoundingClientRect().width;
    for (const item of rowItems()) {
      itemWidths.set(item, item.getBoundingClientRect().width);
    }
  }
  function widthOf(item, standIn) {
    const known = itemWidths.get(item);
    if (known !== void 0) return known;
    if (standIn > 0) return standIn;
    const measured = item.getBoundingClientRect().width;
    itemWidths.set(item, measured);
    return measured;
  }
  var PANEL_ORDER = ["settings_panel", "people_panel", "notes_panel"];
  function windowIdOf(item) {
    return item.querySelector("div[id]")?.id ?? "";
  }
  function belongsTo(windowId, barId) {
    if (windowId === barId || windowId === `public_${barId}`) return true;
    return windowId.startsWith("private-") && windowId.slice(8).split(/[-_]/).includes(barId);
  }
  function windowIdFor(barId) {
    const known = [...readSet(HIDDEN_KEY), ...chatBoxes().map((box2) => box2.id)];
    return known.find((id) => belongsTo(id, barId)) ?? barId;
  }
  function barOrder() {
    return [...document.querySelectorAll(TASKBAR_SELECTOR)].map(
      (button) => button.id.slice(TASKBAR_PREFIX.length)
    );
  }
  function slotOf(item, bar) {
    const id = windowIdOf(item);
    const panel = PANEL_ORDER.indexOf(id);
    if (panel >= 0) return panel;
    const chat = bar.findIndex((barId) => belongsTo(id, barId));
    if (chat >= 0) {
      const place = PANEL_ORDER.length + chat;
      lastSlots.set(item, place);
      return place;
    }
    return lastSlots.get(item) ?? PANEL_ORDER.length + bar.length;
  }
  var lastLayout = "";
  var lastMembership = "";
  function sayOnce(what) {
    if (what === lastLayout) return;
    lastLayout = what;
    log("layout:", what);
  }
  var lastSlots = /* @__PURE__ */ new WeakMap();
  function spacingGap(items, width) {
    const offsets = items.map(tornOffset).sort((a, b) => b - a);
    for (let index = 1; index < offsets.length; index += 1) {
      const apart = Math.abs((offsets[index] ?? 0) - (offsets[index - 1] ?? 0));
      if (apart > 0.5) return Math.max(0, apart - width);
    }
    return 0;
  }
  function relayout2() {
    const side = barSide();
    layOutTaskbar(side);
    windowRow()?.classList.toggle(LEFT_CLASS, side === "left");
    const row = windowRow();
    const items = rowItems();
    if (row) watchRow(row, items);
    const membership = items.map(windowIdOf).join(",");
    if (membership !== lastMembership) {
      lastMembership = membership;
      measureRow();
    }
    let standIn = 0;
    for (const item of items) {
      const known = itemWidths.get(item);
      if (known !== void 0 && known > standIn) standIn = known;
    }
    const visible = items.filter((item) => !item.classList.contains(HIDDEN_CLASS)).map((item) => ({
      wrapper: item,
      torn: tornOffset(item),
      width: widthOf(item, standIn)
    })).filter((item) => item.width > 0).filter(
      (item) => side === "left" || item.wrapper.style.transform.includes("translateX(")
    );
    for (const item of items) {
      if (item.classList.contains(HIDDEN_CLASS)) setOffset(item, 0);
    }
    const anyHidden = items.some(
      (item) => item.classList.contains(HIDDEN_CLASS)
    );
    if (!anyHidden && side === "right") {
      for (const item of items) setOffset(item, 0);
      sayOnce("on the right with nothing hidden - left alone");
      return;
    }
    if (side === "left") {
      const bar = barOrder().reverse();
      visible.sort((a, b) => slotOf(a.wrapper, bar) - slotOf(b.wrapper, bar));
    } else {
      visible.sort((a, b) => b.torn - a.torn);
    }
    const first = visible[0];
    if (!first) {
      sayOnce(`nothing to lay out - ${items.length} in the row`);
      return;
    }
    if (rowWidth === 0) measureRow();
    const containerWidth = rowWidth;
    if (containerWidth < first.width) {
      sayOnce(`row measured ${Math.round(containerWidth)} for a ${Math.round(first.width)} window - waiting`);
      measureRow();
      return;
    }
    const gap = spacingGap(items, first.width);
    const placed = [];
    let used = 0;
    for (const chat of visible) {
      const natural = side === "left" ? containerWidth - chat.width : containerWidth - chat.width + chat.torn;
      const target = side === "left" ? used : containerWidth - used - chat.width;
      setOffset(chat.wrapper, target - natural);
      placed.push(`${windowIdOf(chat.wrapper) || "?"}@${Math.round(target)}`);
      used += chat.width + gap;
    }
    const summary = `${side}: ${placed.join(" ")}`;
    if (summary !== lastLayout) {
      lastLayout = summary;
      log("layout", summary);
    }
  }
  var BAR_ICON_STYLE_ID = "aue-chat-bar-icons";
  function paintBarIcons(hidden) {
    const buttons = [];
    for (const button of document.querySelectorAll(TASKBAR_SELECTOR)) {
      const barId = button.id.slice(TASKBAR_PREFIX.length);
      if ([...hidden].some((id) => belongsTo(id, barId))) buttons.push(`#${CSS.escape(button.id)}`);
    }
    const each = (suffix) => buttons.map((button) => button + suffix).join(", ");
    const css = buttons.length === 0 ? "" : `${each(`:not(${hashedClass("message")})`)} {
  background: linear-gradient(#666666, #333333) !important;
  box-shadow: inset 0 0 4px rgba(255, 255, 255, 0.25), 0 -2px 4px rgba(0, 0, 0, 0.5) !important;
}
${each(`:not(${hashedClass("message")}):hover`)} { background: linear-gradient(#888888, #444444) !important; }
${each(' svg defs stop[id="start"]')} { stop-color: #cccccc !important; }
${each(' svg defs stop[id="end"]')} { stop-color: #999999 !important; }
${each(':hover svg defs stop[id="start"]')} { stop-color: #ffffff !important; }
${each(':hover svg defs stop[id="end"]')} { stop-color: #cccccc !important; }`;
    let style = document.getElementById(BAR_ICON_STYLE_ID);
    if (!style) {
      if (css === "") return;
      style = document.createElement("style");
      style.id = BAR_ICON_STYLE_ID;
      (document.head ?? document.documentElement).appendChild(style);
    }
    if (style.textContent !== css) style.textContent = css;
  }
  var wantHidden = /* @__PURE__ */ new WeakSet();
  function setHidden(wrapper, on3) {
    if (on3) wantHidden.add(wrapper);
    else wantHidden.delete(wrapper);
    if (wrapper.classList.contains(HIDDEN_CLASS) !== on3) {
      wrapper.classList.toggle(HIDDEN_CLASS, on3);
    }
  }
  function hide2(id) {
    const hidden = readSet(HIDDEN_KEY);
    hidden.add(id);
    writeSet(HIDDEN_KEY, hidden);
    apply4();
    log("chat:", id, "hidden in this tab only");
  }
  function show(id) {
    const hidden = readSet(HIDDEN_KEY);
    hidden.delete(id);
    writeSet(HIDDEN_KEY, hidden);
    apply4();
    log("chat:", id, "back in this tab");
  }
  function forget(id) {
    const hidden = readSet(HIDDEN_KEY);
    const known = readSet(KNOWN_KEY);
    hidden.delete(id);
    known.delete(id);
    writeSet(HIDDEN_KEY, hidden);
    writeSet(KNOWN_KEY, known);
  }
  function apply4() {
    if (!isEnabled(INDEPENDENT_CHAT_TABS)) {
      for (const hiddenWindow of document.querySelectorAll(`.${HIDDEN_CLASS}`)) {
        setHidden(hiddenWindow, false);
      }
      paintBarIcons(/* @__PURE__ */ new Set());
      relayout2();
      return;
    }
    const hidden = readSet(HIDDEN_KEY);
    const known = readSet(KNOWN_KEY);
    const openedHere = focusedOnArrival;
    let changed = false;
    let seen4 = 0;
    for (const box2 of chatBoxes()) {
      const wrapper = wrapperOf(box2);
      if (!wrapper) continue;
      seen4 += 1;
      if (pickedFromMenu(box2)) {
        if (hidden.delete(box2.id)) {
          changed = true;
          log("chat:", box2.id, "picked from the private chats list, so shown");
        }
        if (!known.has(box2.id)) {
          known.add(box2.id);
          changed = true;
        }
      } else if (!known.has(box2.id)) {
        known.add(box2.id);
        changed = true;
        if (startHidden || !openedHere) {
          hidden.add(box2.id);
          log("chat:", box2.id, startHidden ? "hidden as the tab is new" : "was opened in another tab, so hidden here");
        }
      }
      setHidden(wrapper, hidden.has(box2.id));
    }
    if (changed) {
      writeSet(KNOWN_KEY, known);
      writeSet(HIDDEN_KEY, hidden);
    }
    paintBarIcons(hidden);
    if (seen4 > 0) liftEarlyHide();
    measureRow();
    relayout2();
  }
  function swallow(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }
  function everywhere(id) {
    forget(id);
    schedulePass();
    log("chat:", id, "left to Torn, for every tab");
  }
  function onClick(event) {
    if (!isEnabled(INDEPENDENT_CHAT_TABS)) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const closing = target.closest(CLOSE_SELECTOR);
    if (closing) {
      const box2 = boxOf(closing);
      if (box2) forget(box2.id);
      return;
    }
    const minimising = target.closest(MINIMISE_SELECTOR);
    if (minimising) {
      const box2 = boxOf(minimising);
      if (!box2) return;
      if (event.shiftKey) {
        everywhere(box2.id);
        return;
      }
      swallow(event);
      hide2(box2.id);
      return;
    }
    const tab = target.closest(TASKBAR_SELECTOR);
    if (tab) {
      const barId = tab.id.slice(TASKBAR_PREFIX.length);
      if (!barId) return;
      const id = windowIdFor(barId);
      if (event.shiftKey) {
        everywhere(id);
        return;
      }
      if (readSet(HIDDEN_KEY).has(id)) {
        swallow(event);
        show(id);
        return;
      }
      const box2 = document.getElementById(id);
      const wrapper = box2 && wrapperOf(box2);
      const onScreen = wrapper ? wrapper.getBoundingClientRect().width > 0 : false;
      if (!onScreen) {
        forget(id);
        return;
      }
      swallow(event);
      hide2(id);
    }
  }
  var watchedItems = /* @__PURE__ */ new WeakSet();
  var watchedRows = /* @__PURE__ */ new WeakSet();
  var rowIsWatched = false;
  function watchRow(row, items) {
    if (!watchedRows.has(row)) {
      watchedRows.add(row);
      rowIsWatched = true;
      new MutationObserver(queueRelayout).observe(row, { childList: true });
    }
    for (const item of items) {
      if (watchedItems.has(item)) continue;
      watchedItems.add(item);
      new MutationObserver((records) => {
        if (records.every(isOwnChange)) return;
        catchUndoing(item);
        queueRelayout();
      }).observe(item, {
        attributes: true,
        attributeFilter: ["style", "class"],
        attributeOldValue: true,
        childList: true
      });
    }
  }
  var scratch = document.createElement("div");
  function tornStyle(value) {
    scratch.setAttribute("style", value ?? "");
    scratch.style.removeProperty("translate");
    scratch.style.removeProperty("transition-property");
    return scratch.style.cssText;
  }
  function tornClasses(value) {
    return (value ?? "").split(/\s+/).filter((name) => name !== "" && !name.startsWith("aue-")).join(" ");
  }
  function isOwnChange(record) {
    if (record.type !== "attributes" || !(record.target instanceof Element)) return false;
    const now = record.target.getAttribute(record.attributeName ?? "");
    if (record.attributeName === "class") {
      return tornClasses(record.oldValue) === tornClasses(now);
    }
    return tornStyle(record.oldValue) === tornStyle(now);
  }
  function catchUndoing(item) {
    if (wantHidden.has(item) && !item.classList.contains(HIDDEN_CLASS)) {
      item.classList.add(HIDDEN_CLASS);
      noteUndone(INDEPENDENT_CHAT_TABS.label, "a chat this tab has hidden", chatRoot());
    }
    const written2 = writtenOffsets.get(item);
    if (written2 !== void 0 && item.style.translate !== written2) {
      const feature = barSide() === "left" ? CHAT_SIDE_BUTTON : INDEPENDENT_CHAT_TABS;
      noteUndone(feature.label, "where the chat windows sit", chatRoot());
    }
  }
  var layoutQueued = false;
  function queueRelayout() {
    if (layoutQueued) return;
    layoutQueued = true;
    queueMicrotask(() => {
      layoutQueued = false;
      relayout2();
    });
  }
  var passTimer = 0;
  var passDeadline = 0;
  function schedulePass() {
    const now = Date.now();
    if (passDeadline === 0) passDeadline = now + MAX_SETTLE_MS2;
    clearTimeout(passTimer);
    passTimer = window.setTimeout(
      () => {
        passDeadline = 0;
        apply4();
      },
      Math.max(0, Math.min(SETTLE_MS4, passDeadline - now))
    );
  }
  function hideChatsEarly() {
    if (!isEnabled(INDEPENDENT_CHAT_TABS)) return;
    let rules;
    if (tabIsNew()) {
      startHidden = true;
      setTimeout(() => startHidden = false, FAILSAFE_MS);
      rules = `div:has(> div > div[id]:not([id$="_panel"]) ${MINIMISE_SELECTOR}) { display: none !important; }`;
      log("chat: new tab, holding back every chat until the page settles");
    } else {
      const hidden = [...readSet(HIDDEN_KEY)].filter((id) => SAFE_ID.test(id));
      if (hidden.length === 0) return;
      rules = hidden.map((id) => `div:has(> div > div[id="${id}"]) { display: none !important; }`).join("\n");
      log("chat: holding back", hidden.length, "window(s) until the page settles");
    }
    const style = document.createElement("style");
    style.textContent = rules;
    (document.head ?? document.documentElement).appendChild(style);
    earlyHide = style;
    setTimeout(liftEarlyHide, FAILSAFE_MS);
  }
  function onMenuClick(event) {
    if (!isEnabled(INDEPENDENT_CHAT_TABS)) return;
    const target = event.target;
    if (!(target instanceof Element) || !target.closest(PEOPLE_PANEL_SELECTOR)) return;
    if (target.closest(`.${HIDE_BUTTON_CLASS}`)) return;
    const entry = target.closest("li, a, button, [role='button']") ?? target;
    const texts = [];
    for (const element of [entry, ...entry.querySelectorAll("*")]) {
      const own = [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent ?? "").join("").trim();
      if (own === "") continue;
      texts.push(own);
      const sender = /^(.+?)\s:\s/.exec(own)?.[1];
      if (sender) texts.push(sender.trim());
    }
    if (texts.length === 0) return;
    menuOpen = { texts, until: Date.now() + MENU_OPEN_MS };
    log("chat: picked from the private chats list:", texts);
    apply4();
  }
  function installLocalChat() {
    addEventListener("click", onClick, true);
    addEventListener("click", onMenuClick, true);
    addEventListener("resize", schedulePass);
    new MutationObserver((records) => {
      if (onlyOurs(records)) return;
      focusedOnArrival = isTheActiveTab();
      if (!rowIsWatched) queueRelayout();
      schedulePass();
    }).observe(document.body, { childList: true, subtree: true });
    apply4();
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
  function onClick2(event) {
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
  function isPageScroller(element) {
    return element === document.documentElement || element === document.body;
  }
  function patchScrollTop() {
    const descriptor = Object.getOwnPropertyDescriptor(
      Element.prototype,
      "scrollTop"
    );
    const read = descriptor?.get;
    const write = descriptor?.set;
    if (!read || !write || descriptor.configurable === false) return;
    Object.defineProperty(Element.prototype, "scrollTop", {
      configurable: true,
      enumerable: descriptor.enumerable ?? false,
      get: read,
      set(value) {
        if (isPageScroller(this) && suppressingNavigation()) return;
        write.call(this, value);
      }
    });
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
    addEventListener("click", onClick2, true);
    addEventListener("hashchange", armNavigation, true);
    addEventListener("popstate", armNavigation, true);
    patchHistory("pushState");
    patchHistory("replaceState");
    patchScrollIntoView();
    patchWindowScrolling();
    patchScrollTop();
  }

  // src/autumns-ui-enhancer/personalStats.ts
  var PERSONAL_STATS_PATH = "/personalstats.php";
  var REMEMBERED = ["from", "stats"];
  function settingFor(name) {
    return `PERSONAL_STATS_${name.toUpperCase()}`;
  }
  function remember2(address) {
    let url;
    try {
      url = new URL(address, location.href);
    } catch {
      return;
    }
    if (url.pathname !== PERSONAL_STATS_PATH) return;
    for (const name of REMEMBERED) {
      const value = url.searchParams.get(name);
      if (value) writeSetting(settingFor(name), value);
    }
  }
  function restore() {
    const current = new URLSearchParams(location.search);
    let search = location.search;
    for (const name of REMEMBERED) {
      if (current.has(name)) continue;
      const value = readSetting(settingFor(name), "");
      if (!value) continue;
      search += `${search ? "&" : "?"}${name}=${encodeURIComponent(value)}`;
    }
    if (search === location.search) return;
    log("personal stats: opening on", search);
    history.replaceState(history.state, "", `${location.pathname}${search}${location.hash}`);
  }
  function watchHistory(name) {
    const original = history[name];
    history[name] = function(...args) {
      const result = original.apply(this, args);
      if (typeof args[2] === "string" || args[2] instanceof URL) remember2(String(args[2]));
      return result;
    };
  }
  function installPersonalStats() {
    if (location.pathname !== PERSONAL_STATS_PATH || !isEnabled(PERSONAL_STATS_FIXES)) return;
    restore();
    watchHistory("pushState");
    watchHistory("replaceState");
    addEventListener("popstate", () => remember2(location.href));
  }

  // src/autumns-ui-enhancer/personalStatsZoom.ts
  var PERSONAL_STATS_PATH2 = "/personalstats.php";
  var CHART_SELECTOR = '#personal-stats svg[aria-label="A chart."]';
  var SECTION_SELECTOR = "#chartSection";
  var CONTROLS_ID = "aue-stats-zoom";
  var ZOOMED_CLASS = "aue-stats-zoomed";
  var MATCHING_SETTING = "PERSONAL_STATS_MATCHING";
  var DAY_MS = 864e5;
  var MIN_SPAN_DAYS = 7;
  var SLIDER_STEPS = 100;
  var BUTTON_STEPS = 10;
  var LOADER_WAIT_MS = 3e4;
  var ICON_OUT = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M7 17l4-6 4 6z" fill="currentColor"/></svg>';
  var ICON_IN = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M2 20l7-11 7 11z M11 20l6-9 6 9z" fill="currentColor"/></svg>';
  var MATCHING_LABEL = "Matching start";
  var source = null;
  var originalDraw = null;
  var matchedView = null;
  var redrawing = false;
  var zoom = 0;
  var centre = 0.5;
  var valueRange = null;
  var matching = readSetting(MATCHING_SETTING, "") === "1";
  function toTime(value) {
    return value instanceof Date ? value.getTime() : Number(value);
  }
  function isEmpty(value) {
    return value === null || value === void 0 || typeof value === "number" && Number.isNaN(value);
  }
  function seriesOf(data) {
    const found = [];
    const columns = data.getNumberOfColumns();
    const rows = data.getNumberOfRows();
    for (let column = 1; column < columns; column += 1) {
      if (data.getColumnType(column) !== "number" || data.getColumnRole?.(column)) continue;
      const next = column + 1;
      const tooltip = next < columns && data.getColumnRole?.(next) === "tooltip" ? next : null;
      let start2 = 0;
      while (start2 < rows && isEmpty(data.getValue(start2, column))) start2 += 1;
      if (start2 < rows) found.push({ value: column, tooltip, start: start2 });
    }
    return found;
  }
  function dayTooltip(tooltip, day) {
    if (typeof tooltip !== "string") return tooltip;
    return tooltip.replace(/(<p class=["']?date___[^>]*>)[^<]*(<\/p>)/, `$1Day ${day}$2`);
  }
  function tornView(from) {
    const range = from.data.getColumnRange(0);
    return {
      data: from.data,
      options: from.options,
      dates: range.min instanceof Date,
      first: toTime(range.min),
      last: toTime(range.max),
      minSpan: MIN_SPAN_DAYS * DAY_MS
    };
  }
  function buildMatchedView(from) {
    const Table = window.google?.visualization?.DataTable;
    const series = seriesOf(from.data);
    if (!Table || series.length < 2) return null;
    const { data } = from;
    const rows = data.getNumberOfRows();
    const table = new Table();
    table.addColumn({ type: "number", label: "Day" });
    for (const line of series) {
      table.addColumn({ type: "number", label: data.getColumnLabel(line.value) });
      if (line.tooltip !== null) {
        table.addColumn({ type: "string", role: "tooltip", p: data.getColumnProperties?.(line.tooltip) ?? { html: true } });
      }
    }
    const days = Math.max(...series.map((line) => rows - line.start));
    const built = [];
    for (let day = 1; day <= days; day += 1) {
      const row = [day];
      for (const line of series) {
        const at = line.start + day - 1;
        row.push(at < rows ? data.getValue(at, line.value) : null);
        if (line.tooltip !== null) row.push(at < rows ? dayTooltip(data.getValue(at, line.tooltip), day) : null);
      }
      built.push(row);
    }
    table.addRows(built);
    const { ticks: _ticks, format: _format, gridlines, minorGridlines, ...hAxis } = from.options.hAxis ?? {};
    const plainGrid = (grid) => {
      if (!grid || typeof grid !== "object") return grid;
      const { units: _units, ...rest } = grid;
      return rest;
    };
    return {
      data: table,
      options: {
        ...from.options,
        hAxis: { ...hAxis, gridlines: plainGrid(gridlines), minorGridlines: plainGrid(minorGridlines), format: "0" }
      },
      dates: false,
      first: 1,
      last: days,
      minSpan: MIN_SPAN_DAYS
    };
  }
  function canMatch() {
    return source !== null && seriesOf(source.data).length >= 2;
  }
  function currentView() {
    if (!source) return null;
    if (matching && canMatch()) {
      matchedView ?? (matchedView = buildMatchedView(source));
      if (matchedView) return matchedView;
    }
    return tornView(source);
  }
  function windowShare(view) {
    const full = view.last - view.first;
    if (full <= view.minSpan) return 1;
    return (view.minSpan / full) ** (zoom / SLIDER_STEPS);
  }
  function readValueRange(chart) {
    try {
      const layout = chart.getChartLayoutInterface();
      const box2 = layout.getChartAreaBoundingBox();
      const min = layout.getVAxisValue(box2.top + box2.height);
      const max = layout.getVAxisValue(box2.top);
      return Number.isFinite(min) && Number.isFinite(max) && max > min ? { min, max } : null;
    } catch {
      return null;
    }
  }
  function redraw() {
    const view = currentView();
    if (!source || !view || !originalDraw) return;
    const share = windowShare(view);
    let options = view.options;
    if (share < 1) {
      valueRange ?? (valueRange = readValueRange(source.chart));
      const full = view.last - view.first;
      const width = full * share;
      const start2 = Math.min(Math.max(view.first + centre * full - width / 2, view.first), view.last - width);
      centre = (start2 + width / 2 - view.first) / full;
      const edge = (at) => view.dates ? new Date(at) : at;
      const hAxis = options.hAxis ?? {};
      const vAxis = options.vAxis ?? {};
      options = {
        ...options,
        hAxis: { ...hAxis, viewWindow: { min: edge(start2), max: edge(start2 + width) } },
        vAxis: valueRange ? { ...vAxis, viewWindow: valueRange } : vAxis
      };
    }
    redrawing = true;
    try {
      originalDraw.call(source.chart, view.data, options);
    } finally {
      redrawing = false;
    }
  }
  function resetZoom() {
    zoom = 0;
    centre = 0.5;
    valueRange = null;
  }
  function patchLineChart(google) {
    const proto = google.visualization?.LineChart?.prototype;
    if (!proto) return false;
    if (originalDraw) return true;
    const original = proto.draw;
    originalDraw = original;
    proto.draw = function(data, options = {}) {
      if (redrawing) return original.call(this, data, options);
      source = { chart: this, data, options };
      matchedView = null;
      resetZoom();
      if (debugging()) window.aueStatsData = data;
      try {
        syncControls();
        if (matching && canMatch()) {
          redraw();
          return void 0;
        }
      } catch (error) {
        log("stats zoom: could not read the chart's data", error);
      }
      return original.call(this, data, options);
    };
    log("stats zoom: watching the chart's draws");
    return true;
  }
  function watchForGoogle() {
    const until = Date.now() + LOADER_WAIT_MS;
    let wrapped = false;
    const look = () => {
      const google = window.google;
      if (google && patchLineChart(google)) return;
      const charts = google?.charts;
      if (charts?.setOnLoadCallback && !wrapped) {
        wrapped = true;
        const original = charts.setOnLoadCallback.bind(charts);
        charts.setOnLoadCallback = (callback) => original(() => {
          if (google) patchLineChart(google);
          callback();
        });
      }
      if (Date.now() < until) requestAnimationFrame(look);
    };
    look();
  }
  function setZoom(value) {
    zoom = Math.min(Math.max(Math.round(value), 0), SLIDER_STEPS);
    syncControls();
    redraw();
  }
  function setMatching(on3) {
    matching = on3;
    writeSetting(MATCHING_SETTING, on3 ? "1" : "");
    resetZoom();
    syncControls();
    redraw();
  }
  function zoomButton(icon, label, change) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "aue-stats-zoom-button";
    button.innerHTML = icon;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.addEventListener("click", () => setZoom(zoom + change));
    return button;
  }
  function buildControls() {
    const bar = document.createElement("div");
    bar.id = CONTROLS_ID;
    const match = document.createElement("button");
    match.type = "button";
    match.className = "aue-stats-zoom-button aue-stats-match";
    match.textContent = MATCHING_LABEL;
    match.addEventListener("click", () => setMatching(!matching));
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = String(SLIDER_STEPS);
    slider.value = String(zoom);
    slider.setAttribute("aria-label", "Zoom the timeline");
    slider.addEventListener("input", () => setZoom(Number(slider.value)));
    bar.append(match, zoomButton(ICON_OUT, "Zoom out", -BUTTON_STEPS), slider, zoomButton(ICON_IN, "Zoom in", BUTTON_STEPS));
    return bar;
  }
  function syncControls() {
    const section = document.querySelector(SECTION_SELECTOR);
    const view = currentView();
    const wanted = view !== null && section !== null && (view.last - view.first > view.minSpan || canMatch());
    let bar = document.getElementById(CONTROLS_ID);
    if (!wanted) {
      bar?.remove();
      return;
    }
    if (!bar) {
      bar = buildControls();
      section?.appendChild(bar);
    } else if (bar.parentElement !== section || bar.nextElementSibling) {
      section?.appendChild(bar);
    }
    const slider = bar.querySelector("input");
    if (slider && slider.value !== String(zoom)) slider.value = String(zoom);
    const match = bar.querySelector(".aue-stats-match");
    if (match) {
      match.hidden = !canMatch();
      match.setAttribute("aria-pressed", String(matching));
    }
    section?.classList.toggle(ZOOMED_CLASS, zoom > 0);
  }
  function installPanning() {
    let drag = null;
    let frame = 0;
    document.addEventListener("pointerdown", (event) => {
      const view = currentView();
      if (zoom === 0 || !source || !view || !(event.target instanceof Element)) return;
      const chart = event.target.closest(CHART_SELECTOR);
      if (!chart) return;
      let width = chart.getBoundingClientRect().width;
      try {
        width = source.chart.getChartLayoutInterface().getChartAreaBoundingBox().width || width;
      } catch {
      }
      drag = { x: event.clientX, centre, width, share: windowShare(view) };
      event.preventDefault();
    });
    addEventListener("pointermove", (event) => {
      if (!drag) return;
      centre = drag.centre - (event.clientX - drag.x) / drag.width * drag.share;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        redraw();
      });
    });
    const stop = () => {
      drag = null;
    };
    addEventListener("pointerup", stop);
    addEventListener("pointercancel", stop);
  }
  function keepControls() {
    new MutationObserver(() => {
      if (source && !document.getElementById(CONTROLS_ID)) syncControls();
    }).observe(document.body, { childList: true, subtree: true });
  }
  function installPersonalStatsZoom() {
    if (location.pathname !== PERSONAL_STATS_PATH2 || !isEnabled(PERSONAL_STATS_FIXES)) return;
    watchForGoogle();
    installPanning();
    if (document.body) keepControls();
    else document.addEventListener("DOMContentLoaded", keepControls, { once: true });
  }

  // src/shared/apiKey.ts
  var KEY_SHAPE = /^[A-Za-z0-9]{16}$/;
  var BAD_KEY_SHAPE = "API keys are 16 letters and numbers";
  function isKeyShaped(key) {
    return KEY_SHAPE.test(key);
  }

  // src/autumns-ui-enhancer/styles.ts
  var STYLE_ID = "aue-styles";
  var PANEL_ID2 = "aue-prefs-panel";
  var CSS2 = `

  #${PANEL_ID2} {
    container-type: inline-size;
    margin: 10px 0 0;
    border-radius: 5px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    font-family: Arial, Helvetica, sans-serif;
    color: #fff;
  }
  .aue-title {
    display: block;
    box-sizing: border-box;
    width: 100%;
    border: 0;
    text-align: left;
    cursor: pointer;
    border-radius: 5px 5px 0 0;
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
  }
  .aue-row:hover,
  .aue-row:active,
  .aue-row:focus-within {
    background: linear-gradient(180deg, #525252 0%, #414141 100%);
  }
  .aue-label {
    line-height: 22px;
  }
  .aue-row-stack {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
  .aue-heading {
    display: flex;
    align-items: baseline;
    gap: 8px;
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
    /* Only the switch: clicking it quickly should not highlight it, but the
       panel's words must stay selectable. */
    user-select: none;
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
  .aue-row.aue-row-disabled {
    opacity: 0.45;
    background: none;
  }
  .aue-row-disabled .aue-switch {
    pointer-events: none;
  }
  .aue-row-disabled .aue-slider {
    border-color: #8c8c8c !important;
    background: linear-gradient(180deg, #1c1c1c 0%, #0d0d0d 100%) !important;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.55) !important;
  }

  .aue-pager-more {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    box-sizing: border-box;
    height: var(--aue-more-height, 26px);
    padding: 0 12px;
    border: 1px solid var(--aue-more-edge, rgba(255, 255, 255, 0.3));
    border-radius: var(--aue-more-radius, 5px);
    background: transparent !important;
    color: var(--aue-more-color, #ddd) !important;
    font-family: var(--aue-more-font, Arial, Helvetica, sans-serif);
    font-size: var(--aue-more-size, 13px);
    font-weight: bold;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
  }
  .aue-pager-more:active:not(:disabled) {
    background-color: var(--aue-more-bg, #333) !important;
    background-image: var(--aue-more-img, none) !important;
  }
  /* The loaded run, "10-12": Torn's links are sized for one number, so this one widens. */
  .aue-page-range,
  .aue-page-range * {
    width: auto !important;
    min-width: max-content;
    white-space: nowrap !important;
  }
  .aue-page-range {
    padding-left: 6px !important;
    padding-right: 6px !important;
  }
  /* Hide Chats: a hidden person's row that got past the filter, and the Hidden chats list over Torn's. */
  #people_panel.aue-hide-chats .aue-hide-chats-out {
    visibility: hidden !important;
  }
  #aue-hide-chats-list {
    position: absolute;
    z-index: 5;
    left: 0;
    right: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    background: #333 !important;
    color: #ddd !important;
  }
  #aue-hide-chats-list * {
    color: inherit !important;
  }
  #aue-hide-chats-list .aue-hide-chats-empty {
    padding: 20px;
    text-align: center;
    opacity: 0.7;
  }
  #aue-hide-chats-list .aue-hide-chats-row {
    display: flex;
    gap: 10px;
    padding: 8px 10px;
    border-bottom: 1px solid #2a2a2a;
  }
  #aue-hide-chats-list .aue-hide-chats-avatar {
    flex: none;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: 2px solid #666;
    object-fit: cover;
  }
  #aue-hide-chats-list .aue-hide-chats-body {
    flex: 1;
    min-width: 0;
  }
  #aue-hide-chats-list .aue-hide-chats-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  #aue-hide-chats-list .aue-hide-chats-name {
    flex: 1;
    overflow: hidden;
    color: #fff !important;
    font-size: 16px;
    text-decoration: none;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  #aue-hide-chats-list .aue-hide-chats-unread .aue-hide-chats-name {
    font-weight: bold;
  }
  #aue-hide-chats-list .aue-hide-chats-unread .aue-hide-chats-name::before {
    content: "";
    display: inline-block;
    width: 8px;
    height: 8px;
    margin-right: 6px;
    border-radius: 50%;
    background: #4cff4c;
    vertical-align: middle;
  }
  #aue-hide-chats-list .aue-hide-chats-time {
    flex: none;
    font-size: 12px;
  }
  #aue-hide-chats-list .aue-hide-chats-preview {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin-top: 2px;
    font-size: 14px;
    overflow-wrap: anywhere;
  }
  .aue-hide-chats-x {
    flex: none;
    margin-left: 8px;
    padding: 0 2px;
    color: #999 !important;
    font-size: 13px;
    line-height: 1;
    cursor: pointer;
  }
  .aue-hide-chats-x:hover {
    color: #fff !important;
  }
  #aue-hide-chats-menu {
    position: absolute;
    z-index: 10;
    display: flex;
    align-items: center;
    color: #fff !important;
    cursor: pointer;
    white-space: nowrap;
  }
  #aue-hide-chats-menu .aue-hide-chats-label::after {
    content: "";
    display: inline-block;
    margin: 0 0 3px 8px;
    border: 5px solid transparent;
    border-top-color: currentColor;
    vertical-align: middle;
  }
  #aue-hide-chats-menu .aue-hide-chats-drop {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    min-width: 100%;
    padding: 4px 0;
    border: 1px solid #444;
    border-radius: 6px;
    background: #222 !important;
    font-size: 14px;
    font-weight: normal;
  }
  #aue-hide-chats-menu.aue-hide-chats-open .aue-hide-chats-drop {
    display: block;
  }
  #aue-hide-chats-menu .aue-hide-chats-item {
    padding: 6px 12px;
    color: #fff !important;
  }
  #aue-hide-chats-menu .aue-hide-chats-item:hover {
    background: #3a3a3a !important;
  }
  #aue-hide-chats-menu.aue-hide-chats-glow .aue-hide-chats-label {
    color: #b6ffb0 !important;
    text-shadow: 0 0 6px #4cff4c, 0 0 12px #1fbf1f;
  }
  #aue-forum-search {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0 0 10px;
    padding: 10px;
    border-radius: 6px;
    background: #2b2b2b;
    color: #ddd !important;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
  }
  #aue-forum-search * {
    color: inherit !important;
  }
  #aue-forum-search .aue-search-row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 8px;
  }
  #aue-forum-search .aue-search-top {
    align-items: flex-start;
  }
  #aue-forum-search .aue-search-group {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  #aue-forum-search .aue-search-pair {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  #aue-forum-search .aue-search-note {
    font-size: 11px;
    opacity: 0.75;
  }
  #aue-forum-search input[type="text"],
  #aue-forum-search input[type="date"],
  #aue-forum-search select {
    box-sizing: border-box;
    height: 30px;
    padding: 0 8px;
    border: 1px solid #444;
    border-radius: 6px;
    background: #0b0b0b !important;
    color: #fff !important;
    font: inherit;
    color-scheme: dark;
  }
  #aue-forum-search .aue-search-grow {
    flex: 1 1 200px;
  }
  #aue-forum-search .aue-search-field {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-weight: bold;
  }
  #aue-forum-search .aue-search-drop {
    position: relative;
  }
  #aue-forum-search .aue-search-dropbtn {
    box-sizing: border-box;
    height: 30px;
    min-width: 120px;
    padding: 0 26px 0 8px;
    border: 1px solid #444;
    border-radius: 6px;
    background: #0b0b0b !important;
    color: #fff !important;
    font: inherit;
    font-weight: normal;
    text-align: left;
    cursor: pointer;
  }
  #aue-forum-search .aue-search-dropbtn::after {
    content: "";
    position: absolute;
    right: 10px;
    top: 13px;
    border: 4px solid transparent;
    border-top-color: #fff;
  }
  #aue-forum-search .aue-search-droplist {
    display: none;
    position: absolute;
    z-index: 1000;
    top: calc(100% + 4px);
    left: 0;
    width: 400px;
    max-width: calc(100vw - 32px);
    max-height: 340px;
    overflow-y: auto;
    padding: 8px;
    border: 1px solid #444;
    border-radius: 6px;
    background: #0b0b0b !important;
    font-weight: normal;
  }
  #aue-forum-search .aue-search-drop.aue-open .aue-search-droplist {
    display: block;
  }
  #aue-forum-search .aue-search-forums {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 4px 12px;
    margin-top: 8px;
  }
  #aue-forum-search .aue-search-forums label {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }
  #aue-forum-ranked {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 10px 0;
    color: #ddd !important;
    font-family: Arial, Helvetica, sans-serif;
  }
  #aue-forum-ranked * {
    color: inherit !important;
  }
  #aue-forum-ranked .aue-search-summary {
    font-size: 12px;
    opacity: 0.8;
  }
  #aue-forum-ranked .aue-search-thread {
    padding: 8px 10px;
    border-radius: 6px;
    background: #2b2b2b;
  }
  #aue-forum-ranked .aue-search-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 10px;
    margin-bottom: 4px;
  }
  #aue-forum-ranked .aue-search-title {
    color: #fff !important;
    font-size: 14px;
    font-weight: bold;
    text-decoration: none;
  }
  #aue-forum-ranked .aue-search-title:hover {
    text-decoration: underline;
  }
  #aue-forum-ranked .aue-search-meta {
    font-size: 11px;
    opacity: 0.7;
  }
  #aue-forum-ranked .aue-search-post {
    display: block;
    padding: 4px 0;
    border-top: 1px solid #3a3a3a;
    font-size: 12px;
    line-height: 1.4;
    text-decoration: none;
  }
  #aue-forum-ranked .aue-search-post:hover {
    background: #333;
  }
  #aue-forum-ranked .aue-search-by {
    display: block;
    font-size: 11px;
    opacity: 0.7;
  }
  #aue-forum-ranked mark {
    background: #f5d742;
    color: #222 !important;
  }
  .aue-search-ranked .forums-thread[data-words] .thread-list,
  .aue-search-filtered {
    display: none !important;
  }
  .aue-search-ended .aue-pager-more {
    display: none !important;
  }
  #aue-stats-zoom {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin: 6px 0 10px;
  }
  #aue-stats-zoom input[type="range"] {
    width: min(360px, 60%);
    accent-color: #999;
    cursor: pointer;
  }
  .aue-stats-zoom-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 1px solid #444;
    border-radius: 6px;
    background: #222 !important;
    color: #ccc !important;
    cursor: pointer;
  }
  .aue-stats-zoom-button:hover {
    color: #fff !important;
  }
  .aue-stats-match {
    width: auto;
    padding: 0 10px;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    font-weight: bold;
    white-space: nowrap;
  }
  .aue-stats-match[aria-pressed="true"] {
    border-color: #888;
    background: linear-gradient(0deg, #555 0%, #333 100%) !important;
    color: #fff !important;
  }
  .aue-stats-match[hidden] {
    display: none;
  }
  /* Sideways drags and swipes slide the zoomed chart; up and down still scroll the page. */
  .aue-stats-zoomed svg[aria-label="A chart."] {
    touch-action: pan-y;
    cursor: grab;
  }
  #aue-back-to-top {
    position: fixed;
    right: 16px;
    top: 10px;
    z-index: 999990;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    padding: 0;
    border: 1px solid #444;
    border-radius: 50%;
    background: #222 !important;
    color: #ccc !important;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
    cursor: pointer;
  }
  #aue-back-to-top:hover {
    background: #2e2e2e !important;
    color: #fff !important;
  }
  .aue-pager-more:disabled {
    opacity: 0.6;
    cursor: default;
  }
  /* After the number box on Torn's item send form: dark, thin grey edge, bold white. */
  .aue-page-jump {
    width: 56px;
    height: 26px;
    margin: 0 4px;
    padding: 0 6px;
    box-sizing: border-box;
    border: 1px solid #444 !important;
    border-radius: 6px;
    background: #0b0b0b !important;
    color: #fff !important;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 13px;
    font-weight: bold;
    text-align: center;
    vertical-align: middle;
    outline: none;
    -moz-appearance: textfield;
  }
  .aue-page-jump::placeholder {
    color: #999;
  }
  .aue-page-jump:focus {
    border-color: #777 !important;
  }
  .aue-page-jump::-webkit-outer-spin-button,
  .aue-page-jump::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
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
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  .aue-input {
    width: 166px;
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

  .aue-suggest {
    position: absolute;
    z-index: 60;
    top: 100%;
    left: 0;
    width: 200px;
    max-height: 190px;
    overflow-y: auto;
    border: 1px solid rgba(0, 0, 0, 0.6);
    border-radius: 4px;
    background: #2e2e2e;
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.6);
  }
  .aue-suggest-option {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 4px 8px;
    border: 0;
    background: none;
    color: #a9d1ff;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }
  .aue-suggest-option:hover,
  .aue-suggest-option:focus-visible {
    background: #414141;
  }
  .aue-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #777;
    flex-shrink: 0;
  }
  .aue-dot-on {
    background: #6ac46a;
  }

  .aue-send-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    margin: 0 0 0 10px;
    padding: 0;
    border: 0;
    background: none;
    color: #64a4ff;
    vertical-align: middle;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .aue-send-trigger svg {
    width: 15px;
    height: 15px;
  }
  .aue-send-trigger:hover,
  .aue-send-trigger:focus-visible {
    color: #fff;
  }
  .aue-send-trigger-loose {
    display: block;
    margin: 4px auto;
  }
  /* Not overflow: hidden, which would clip the User ID box's list of names. */
  .aue-send {
    display: block;
    margin: 0 0 10px;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    text-align: left;
  }
  .aue-send[hidden] {
    display: none;
  }
  .aue-send-link {
    color: #a9d1ff;
    text-decoration: none;
  }
  .aue-send-link:hover {
    text-decoration: underline;
  }
  .aue-send {
    box-sizing: border-box;
    padding: 8px 10px;
    border-radius: 5px;
    background: rgba(0, 0, 0, 0.2);
  }
  .aue-send-heading {
    margin: 0 0 6px;
  }
  .aue-send-form,
  .aue-send-confirm {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 8px;
  }
  .aue-send-form[hidden],
  .aue-send-confirm[hidden],
  .aue-send-status[hidden] {
    display: none;
  }
  .aue-send-field {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .aue-send-field input {
    box-sizing: border-box;
    width: 100%;
    height: 24px;
    padding: 0 6px;
    border: 1px solid rgba(128, 128, 128, 0.55);
    border-radius: 3px;
    background: transparent;
    color: inherit;
    font: inherit;
  }
  .aue-send-message {
    flex: 1 1 200px;
  }
  .aue-send-user {
    position: relative;
    flex: 1 1 160px;
  }
  .aue-send-user .aue-suggest[hidden] {
    display: none;
  }
  .aue-send-amount {
    flex: 0 0 70px;
  }
  .aue-send-confirm {
    align-items: center;
  }
  .aue-send-question {
    flex: 1 1 100%;
  }
  .aue-send-status {
    margin: 6px 0 0;
  }
  .aue-send-status.aue-send-failed {
    color: #e0584f;
  }
  /* Sits under the item's row on the items page, across its full width. */
  /* Solid, so a highlighted row's colour does not show through it. */
  .aue-display {
    clear: both;
    margin: 6px 0;
    background: #2b2b2b;
  }
  /*
   * The button is first in the row of actions, so the dark line Torn draws
   * on the first slot's left edge moves onto it.
   */
  .actions-wrap:not(.aue-display-five) > li.aue-display-slot {
    border-left: 2px solid #222;
  }
  .actions-wrap:not(.aue-display-five) > li.aue-display-slot + li {
    border-left: 0 !important;
  }
  /*
   * Torn's narrow layout: its bar's four quarters become five fifths, and
   * the words beside the icons are hidden so five fit. Hidden the way screen
   * readers still read them, so nothing beside them moves: the icon is the
   * button, a separate element, and stays where it was.
   */
  .actions-wrap.aue-display-five > li.left {
    width: 20% !important;
  }
  .actions-wrap.aue-display-five .opt-name,
  .aue-display-option .opt-name {
    position: absolute !important;
    width: 1px !important;
    height: 1px !important;
    overflow: hidden !important;
    clip: rect(0 0 0 0) !important;
    white-space: nowrap !important;
  }
  /* Sized and coloured like Torn's own Send and Trash icons beside it. */
  .aue-display-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
  }
  .aue-display-button svg {
    width: 20px;
    height: 20px;
  }
  /*
   * On the path itself, as Torn's own button styles turned it white through
   * color. Grey like Torn's icons at rest, and white on hover, as they go.
   */
  .actions-wrap .aue-display-button svg path {
    fill: #7b7b7b !important;
  }
  .actions-wrap .aue-display-option:hover .aue-display-button svg path,
  .actions-wrap .aue-display-button:focus-visible svg path {
    fill: #fff !important;
  }

  .aue-chat-hidden {
    display: none !important;
  }
  /*
   * Laid out from the left, Torn's own placement is switched off and every
   * window is put where this script says. Leaving Torn to place them and
   * correcting it afterwards meant each window travelled to Torn's idea of
   * its place before being moved to ours.
   */
  .aue-chat-left > * {
    transform: none !important;
  }
  .aue-chat-instant {
    transition-duration: 0s !important;
  }
  /*
   * The left/right button, drawn with the same values as Torn's own chat bar
   * buttons (.root___rnQAo and its .opened state) so it reads as one of them.
   * Light grey while the chats are on the right, dark like an open chat while
   * they are on the left. order puts it first in the bar whatever Torn adds,
   * which is the inner end both ways round, as the bar reverses on the left.
   *
   * With .aue-native it also wears the classes of Torn's own bar buttons, so
   * Torn's colours apply and follow any restyle; the gradients here are the
   * fallback for when there is no Torn button to copy them from.
   */
  #aue-chat-side {
    order: -1;
    flex-shrink: 0;
    align-self: center;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: 34px;
    min-width: 34px;
    height: 34px;
    margin: 0 4px 0 0;
    padding: 0;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    pointer-events: auto;
    -webkit-tap-highlight-color: transparent;
  }
  /* The bar is reversed on the left, so the gap moves to the other side. */
  #aue-chat-side.aue-chat-side-left {
    margin: 0 0 0 4px;
  }
  #aue-chat-side:not(.aue-native) {
    background: linear-gradient(#666666, #333333);
    box-shadow:
      inset 0 0 4px rgba(255, 255, 255, 0.25),
      0 -2px 4px rgba(0, 0, 0, 0.5);
  }
  #aue-chat-side:not(.aue-native):hover,
  #aue-chat-side:not(.aue-native):active {
    background: linear-gradient(#888888, #444444);
  }
  #aue-chat-side.aue-chat-side-left:not(.aue-native) {
    background: linear-gradient(#1f1f1f, #3d3d3d);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.1),
      0 -2px 4px rgba(0, 0, 0, 0.5);
  }
  #aue-chat-side.aue-chat-side-left:not(.aue-native):hover,
  #aue-chat-side.aue-chat-side-left:not(.aue-native):active {
    background: linear-gradient(#333333, #666666);
  }
  #aue-chat-side svg {
    width: 20px;
    height: 20px;
    filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.55));
  }
  /* Torn's classes can carry icon rules; the arrow keeps its own fill. */
  #aue-chat-side svg path {
    fill: url(#aue-arrow-fill);
  }
  #aue-chat-side .aue-arrow-start { stop-color: #cccccc; }
  #aue-chat-side .aue-arrow-end { stop-color: #999999; }
  #aue-chat-side:hover .aue-arrow-start,
  #aue-chat-side.aue-chat-side-left .aue-arrow-start { stop-color: #ffffff; }
  #aue-chat-side:hover .aue-arrow-end,
  #aue-chat-side.aue-chat-side-left .aue-arrow-end { stop-color: #cccccc; }
  .aue-key-box {
    position: relative;
    display: inline-flex;
  }
  .aue-input.aue-key-input {
    width: 150px;
    padding-right: 36px;
  }
  .aue-key-reveal {
    position: absolute;
    top: 50%;
    right: 3px;
    transform: translateY(-50%);
    padding: 0 3px;
    border: 0;
    background: none;
    color: #555;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10px;
    cursor: pointer;
  }
  .aue-key-reveal:hover {
    color: #000;
  }
  .torn-btn.aue-key-check {
    height: 22px;
    padding: 0 8px;
    line-height: 20px;
    font-size: 12px;
  }
  .aue-key-check:not(.torn-btn) {
    padding: 2px 8px;
    border: 1px solid rgba(0, 0, 0, 0.5);
    border-radius: 4px;
    background: linear-gradient(180deg, #8a8a8a 0%, #555 100%);
    color: #fff;
    font-size: 12px;
  }
  .aue-title::after,
  .aue-section-toggle::after {
    content: "▾";
    float: right;
    margin-right: 10px;
    transition: transform 0.15s;
  }
  .aue-title[aria-expanded="false"]::after,
  .aue-section-toggle[aria-expanded="false"]::after {
    transform: rotate(-90deg);
  }
  #${PANEL_ID2}.aue-collapsed .aue-title {
    border-radius: 5px;
  }
  .aue-body-api {
    border-radius: 0 0 5px 5px;
  }
  .aue-row-wide {
    grid-column: 1 / -1;
  }
  .aue-note.aue-key-note {
    margin-top: 0;
  }
  .aue-section-toggle {
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    color: #fff;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 13px;
    line-height: 22px;
    text-align: left;
    cursor: pointer;
  }
  .aue-section-toggle::after {
    margin-right: 0;
  }
  /* A long list under the pointer should not light up as one big row. */
  .aue-row.aue-stock-row:hover,
  .aue-row.aue-stock-row:active,
  .aue-row.aue-stock-row:focus-within {
    background: none;
  }
  .aue-stock-list {
    width: 100%;
  }
  .aue-stock-shop {
    margin-top: 8px;
  }
  .aue-stock-shop-name {
    margin-bottom: 4px;
    font-size: 12px;
    font-weight: bold;
  }
  .aue-stock-items {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 2px 12px;
  }
  .aue-stock-item {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    cursor: pointer;
  }
  .aue-key-field {
    flex-wrap: wrap;
    flex-shrink: 1;
  }
  /* A long error from Torn takes its own line instead of a narrow column. */
  .aue-key-result {
    flex-basis: 100%;
    font-size: 11px;
  }
  .aue-key-result:empty {
    display: none;
  }
  .aue-key-good {
    color: #9fdf6f;
  }
  .aue-key-bad {
    color: #ff8f8f;
  }
  #aue-city-shop-icon {
    list-style: none;
    /* Torn's own rule for these items paints a default sprite (a green dot). */
    background: none !important;
  }
  #aue-city-shop-icon a {
    display: block;
    width: 100%;
    height: 100%;
    background: center / contain no-repeat;
    cursor: pointer;
  }
  /* Matches Torn's own status icon tooltips: grey, above the icon, arrow down. */
  #aue-city-shop-tip {
    position: absolute;
    z-index: 999999;
    padding: 8px 10px;
    border-radius: 6px;
    background: #4a4a4a;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45);
    font-family: Arial, Helvetica, sans-serif;
    font-size: 13px;
    line-height: 17px;
    color: #fff;
    white-space: nowrap;
    pointer-events: none;
  }
  #aue-city-shop-tip::after {
    content: "";
    position: absolute;
    top: 100%;
    left: var(--aue-arrow-left, 50%);
    margin-left: -6px;
    border: 6px solid transparent;
    border-top-color: #4a4a4a;
  }
  #aue-city-shop-stock {
    position: absolute;
    z-index: 999999;
    padding: 6px 9px;
    border-radius: 5px;
    background: #2e2e2e;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    line-height: 16px;
    color: #fff;
    white-space: nowrap;
  }
  #aue-city-shop-stock[hidden] {
    display: none;
  }
  .aue-tip-shop + .aue-tip-shop {
    margin-top: 6px;
  }
  .aue-tip-shop a {
    color: #a9d1ff;
    font-weight: bold;
    text-decoration: none;
  }
  .aue-tip-shop a:hover {
    text-decoration: underline;
  }
  .aue-tip-item {
    display: flex;
    justify-content: space-between;
    gap: 16px;
  }
  #aue-city-shop-tip[hidden] {
    display: none;
  }
  #aue-city-shop-alert {
    position: absolute;
    z-index: 999999;
    padding: 6px 9px;
    border-radius: 5px;
    background: #2e2e2e;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    line-height: 16px;
    white-space: nowrap;
  }
  #aue-city-shop-alert[hidden] {
    display: none;
  }
  #aue-city-shop-alert a {
    display: block;
    color: #a9d1ff !important;
    font-weight: bold;
    text-decoration: none;
  }
  #aue-city-shop-alert a:hover {
    text-decoration: underline;
  }
  /* Flashes the bag while a restock alert is up. */
  #aue-city-shop-icon a.aue-bag-flash {
    animation: aue-bag-flash 0.8s ease-in-out infinite;
  }
  @keyframes aue-bag-flash {
    50% {
      opacity: 0.2;
    }
  }
  /* The tip is a single line for the count; the key message wraps. */
  .aue-tip-message {
    max-width: 220px;
    white-space: normal;
  }
  .aue-tip-link {
    color: #a9d1ff;
    font-weight: bold;
  }
  /* The clash pop-up: bottom centre, above the chat bar, until clicked. */
  #aue-clash {
    position: fixed;
    left: 50%;
    bottom: 64px;
    transform: translateX(-50%);
    z-index: 2147483000;
    box-sizing: border-box;
    width: max-content;
    max-width: min(520px, calc(100vw - 32px));
    padding: 12px 16px;
    border: 1px solid #ff8c1a;
    border-radius: 6px;
    background: #1e1e1e;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.6);
    font-family: Arial, Helvetica, sans-serif;
    font-size: 13px;
    font-weight: bold;
    line-height: 18px;
    color: #ff9a2e;
    cursor: pointer;
  }
  .aue-clash-line + .aue-clash-line {
    margin-top: 8px;
  }
  .aue-clash-feature {
    color: #ffc070;
  }
  .aue-squiggles {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .aue-squiggle {
    position: absolute;
    width: 26px;
    height: 9px;
    margin-top: -4.5px;
    transform-origin: 0 50%;
    animation: aue-squiggle-out 1.2s linear infinite;
  }
  .aue-squiggle svg {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
    animation: aue-squiggle-wriggle 0.24s steps(1) infinite;
  }
  .aue-squiggle path {
    fill: none;
    stroke: #ff8c1a;
    stroke-width: 2;
    stroke-linecap: round;
  }
  @keyframes aue-squiggle-out {
    0% { transform: rotate(var(--aue-angle)) translateX(4px); opacity: 0; }
    15% { opacity: 1; }
    35% { opacity: 0.25; }
    55% { opacity: 1; }
    100% { transform: rotate(var(--aue-angle)) translateX(26px); opacity: 0; }
  }
  @keyframes aue-squiggle-wriggle {
    50% { transform: scaleY(-1); }
  }
  @media (prefers-reduced-motion: reduce) {
    .aue-squiggle,
    .aue-squiggle svg {
      animation: none;
    }
    .aue-squiggle {
      transform: rotate(var(--aue-angle)) translateX(8px);
    }
  }
`;
  function injectStyles() {
    document.documentElement.setAttribute("data-aue", "1.0.1");
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS2;
    (document.head ?? document.documentElement).appendChild(style);
  }

  // src/autumns-ui-enhancer/userSearch.ts
  var SEARCH_URL = "https://www.torn.com/autocompleteUserAjaxAction.php";
  var MAX_RESULTS = 8;
  var MIN_QUERY = 2;
  var pending = null;
  function readUser(row) {
    if (!row || typeof row !== "object") return null;
    const entry = row;
    const id = String(entry.id ?? "");
    const name = String(entry.name ?? "");
    if (!/^\d+$/.test(id) || !name) return null;
    return { id, name, online: entry.online === "online" };
  }
  async function searchUsers(query) {
    pending?.abort();
    const controller = new AbortController();
    pending = controller;
    const url = `${SEARCH_URL}?q=${encodeURIComponent(query)}&option=ac-all`;
    try {
      const response = await fetch(url, {
        headers: { "X-Requested-With": "XMLHttpRequest" },
        signal: controller.signal
      });
      if (!response.ok) {
        log("search: Torn answered", response.status);
        return [];
      }
      const body = await response.json();
      if (!Array.isArray(body)) return [];
      return body.slice(0, MAX_RESULTS).map(readUser).filter((user) => user !== null);
    } catch {
      return [];
    }
  }

  // src/shared/maskedInput.ts
  function makeSecretInput(input) {
    input.type = "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("data-lpignore", "true");
    input.setAttribute("data-1p-ignore", "true");
    input.setAttribute("data-bwignore", "true");
    input.setAttribute("data-form-type", "other");
    setSecretShown(input, false);
  }
  function setSecretShown(input, shown) {
    input.style.setProperty("-webkit-text-security", shown ? "none" : "disc");
    input.dataset.secretShown = shown ? "1" : "0";
  }
  function isSecretShown(input) {
    return input.dataset.secretShown === "1";
  }

  // src/autumns-ui-enhancer/panel.ts
  var SEARCH_DELAY_MS = 250;
  var BLUR_MS = 150;
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
    row.className = "aue-row aue-row-stack";
    const heading = document.createElement("span");
    heading.className = "aue-heading";
    row.appendChild(heading);
    const label = document.createElement("span");
    label.className = "aue-label";
    label.textContent = "Item Recipient Default";
    heading.appendChild(label);
    const lookup = document.createElement("a");
    lookup.className = "aue-field-link";
    lookup.target = "_blank";
    lookup.rel = "noopener";
    heading.appendChild(lookup);
    const field3 = document.createElement("span");
    field3.className = "aue-field";
    row.appendChild(field3);
    const input = document.createElement("input");
    input.className = "aue-input";
    input.type = "text";
    input.placeholder = "name or ID";
    input.value = readSetting(RECIPIENT_LABEL, readSetting(RECIPIENT_SETTING, ""));
    field3.appendChild(input);
    const list = document.createElement("div");
    list.className = "aue-suggest";
    list.hidden = true;
    field3.appendChild(list);
    const refresh2 = () => {
      const id = readSetting(RECIPIENT_SETTING, "");
      lookup.href = `https://www.torn.com/profiles.php?XID=${id}`;
      lookup.textContent = id ? `[${id}]` : "";
      lookup.hidden = id === "";
    };
    const choose = (name, id) => {
      input.value = `${name} [${id}]`;
      writeSetting(RECIPIENT_SETTING, id);
      writeSetting(RECIPIENT_LABEL, input.value);
      list.hidden = true;
      refresh2();
    };
    const offer = (users) => {
      list.replaceChildren();
      for (const user of users) {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "aue-suggest-option";
        const dot = document.createElement("span");
        dot.className = user.online ? "aue-dot aue-dot-on" : "aue-dot";
        option.appendChild(dot);
        option.appendChild(document.createTextNode(`${user.name} [${user.id}]`));
        option.addEventListener("mousedown", (event) => {
          event.preventDefault();
          choose(user.name, user.id);
        });
        list.appendChild(option);
      }
      list.hidden = users.length === 0;
    };
    let timer = 0;
    input.addEventListener("input", () => {
      const typed = input.value.trim();
      const id = /^\d+$/.test(typed) ? typed : /\[(\d+)\]/.exec(typed)?.[1] ?? "";
      writeSetting(RECIPIENT_SETTING, id);
      writeSetting(RECIPIENT_LABEL, typed);
      refresh2();
      clearTimeout(timer);
      if (typed.length < MIN_QUERY || /^\d+$/.test(typed)) {
        list.hidden = true;
        return;
      }
      timer = window.setTimeout(() => {
        void searchUsers(typed).then(offer);
      }, SEARCH_DELAY_MS);
    });
    input.addEventListener("blur", () => {
      window.setTimeout(() => list.hidden = true, BLUR_MS);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") list.hidden = true;
    });
    refresh2();
    return row;
  }
  var API_KEY_CREATE_URL = "https://www.torn.com/preferences.php#tab=api?step=addNewKey&title=AutumnsUIEv1&user=log&torn=cityshops&logIds=86&logtypes=4200";
  function buildApiKeyRow() {
    const row = document.createElement("div");
    row.className = "aue-row aue-row-stack aue-row-wide";
    const heading = document.createElement("span");
    heading.className = "aue-heading";
    row.appendChild(heading);
    const label = document.createElement("span");
    label.className = "aue-label";
    label.textContent = "API Key";
    heading.appendChild(label);
    const generate = document.createElement("a");
    generate.className = "aue-field-link";
    generate.href = API_KEY_CREATE_URL;
    generate.target = "_blank";
    generate.rel = "noopener";
    generate.textContent = "Generate key";
    heading.appendChild(generate);
    const field3 = document.createElement("span");
    field3.className = "aue-field aue-key-field";
    row.appendChild(field3);
    const note = document.createElement("span");
    note.className = "aue-note aue-key-note";
    note.textContent = "The custom key fetches City shop purchase logs and shop stock only.";
    row.appendChild(note);
    const box2 = document.createElement("span");
    box2.className = "aue-key-box";
    field3.appendChild(box2);
    const input = document.createElement("input");
    input.className = "aue-input aue-key-input";
    makeSecretInput(input);
    input.placeholder = "custom key";
    input.value = readSetting(API_KEY_SETTING, "");
    box2.appendChild(input);
    const reveal = document.createElement("button");
    reveal.type = "button";
    reveal.className = "aue-key-reveal";
    reveal.textContent = "Show";
    reveal.addEventListener("click", () => {
      const show2 = !isSecretShown(input);
      setSecretShown(input, show2);
      reveal.textContent = show2 ? "Hide" : "Show";
    });
    box2.appendChild(reveal);
    const check = document.createElement("button");
    check.type = "button";
    check.className = "torn-btn aue-key-check";
    check.textContent = "Check";
    field3.appendChild(check);
    const result = document.createElement("span");
    result.className = "aue-key-result";
    field3.appendChild(result);
    input.addEventListener("input", () => {
      result.textContent = "";
      result.className = "aue-key-result";
    });
    check.addEventListener("click", () => {
      const key = input.value.trim();
      if (!key) {
        writeSetting(API_KEY_SETTING, "");
        forgetCityShopCount();
        result.textContent = "Removed";
        result.className = "aue-key-result";
        return;
      }
      if (!isKeyShaped(key)) {
        result.textContent = BAD_KEY_SHAPE;
        result.className = "aue-key-result aue-key-bad";
        return;
      }
      check.disabled = true;
      void checkApiKey(key).then((problem) => {
        check.disabled = false;
        if (problem) {
          result.textContent = problem;
          result.className = "aue-key-result aue-key-bad";
          return;
        }
        writeSetting(API_KEY_SETTING, key);
        forgetCityShopCount();
        result.textContent = "Saved";
        result.className = "aue-key-result aue-key-good";
      });
    });
    return row;
  }
  function buildSwitchRow(feature) {
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
    if (feature.desktopOnly && isMobileView()) {
      input.disabled = true;
      row.classList.add("aue-row-disabled");
    }
    toggle.appendChild(input);
    const slider = document.createElement("span");
    slider.className = "aue-slider";
    toggle.appendChild(slider);
    row.appendChild(toggle);
    return row;
  }
  function buildToggleHeading(className, text, setting, openByDefault, onChange) {
    const heading = document.createElement("div");
    heading.setAttribute("role", "button");
    heading.tabIndex = 0;
    heading.className = className;
    heading.textContent = text;
    heading.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      heading.click();
    });
    const set = (open) => {
      heading.setAttribute("aria-expanded", String(open));
      onChange(open);
    };
    heading.addEventListener("click", () => {
      if (getSelection()?.toString()) return;
      const open = heading.getAttribute("aria-expanded") !== "true";
      writeSetting(setting, open ? "1" : "0");
      set(open);
    });
    queueMicrotask(() => set(readSetting(setting, openByDefault ? "1" : "0") === "1"));
    return heading;
  }
  function fillStockList(list, shops) {
    const checked = readCheckedItems();
    list.replaceChildren();
    for (const shop of shops) {
      const group = document.createElement("div");
      group.className = "aue-stock-shop";
      const name = document.createElement("div");
      name.className = "aue-stock-shop-name";
      name.textContent = shop.name;
      group.appendChild(name);
      const items = document.createElement("div");
      items.className = "aue-stock-items";
      for (const item of shop.items) {
        const option = document.createElement("label");
        option.className = "aue-stock-item";
        const box2 = document.createElement("input");
        box2.type = "checkbox";
        box2.checked = checked.has(item.id);
        box2.addEventListener("change", () => {
          const now = readCheckedItems();
          if (box2.checked) now.add(item.id);
          else now.delete(item.id);
          writeCheckedItems(now);
        });
        option.append(box2, document.createTextNode(item.name));
        items.appendChild(option);
      }
      group.appendChild(items);
      list.appendChild(group);
    }
  }
  function buildStockListRow() {
    const row = document.createElement("div");
    row.className = "aue-row aue-row-stack aue-row-wide aue-stock-row";
    const list = document.createElement("div");
    list.className = "aue-stock-list";
    let loaded = false;
    const load = () => {
      if (loaded) return;
      loaded = true;
      const stored = readStock();
      if (stored) {
        fillStockList(list, stored.shops);
        return;
      }
      const key = readSetting(API_KEY_SETTING, "").trim();
      if (!key) {
        list.textContent = "No API key";
        loaded = false;
        return;
      }
      list.textContent = "Loading…";
      fetchCityShops(key).then(
        (shops) => fillStockList(list, shops),
        (error) => {
          list.textContent = error instanceof Error ? error.message : "API error";
          loaded = false;
        }
      );
    };
    row.appendChild(
      buildToggleHeading("aue-section-toggle", "City Shop Items to check", STOCK_LIST_OPEN_SETTING, false, (open) => {
        list.hidden = !open;
        if (open) load();
      })
    );
    row.appendChild(list);
    return row;
  }
  function buildPanel3() {
    const panel = document.createElement("div");
    panel.id = PANEL_ID2;
    const content = document.createElement("div");
    content.className = "aue-content";
    panel.appendChild(
      buildToggleHeading("aue-title", "Autumn's Scripts", PANEL_OPEN_SETTING, true, (open) => {
        content.hidden = !open;
        panel.classList.toggle("aue-collapsed", !open);
      })
    );
    panel.appendChild(content);
    const body = document.createElement("div");
    body.className = "aue-body";
    for (const feature of FEATURES) body.appendChild(buildSwitchRow(feature));
    body.appendChild(buildRecipientRow());
    content.appendChild(body);
    const footnote = document.createElement("div");
    footnote.className = "aue-footnote";
    footnote.textContent = PANEL_FOOTNOTE;
    content.appendChild(footnote);
    const api = document.createElement("div");
    api.className = "aue-body aue-body-api";
    api.appendChild(buildApiKeyRow());
    for (const feature of API_FEATURES) api.appendChild(buildSwitchRow(feature));
    api.appendChild(buildStockListRow());
    content.appendChild(api);
    return panel;
  }
  function placePanel2() {
    const anchor = findPrefsPanel();
    if (!anchor) return;
    const existing = document.getElementById(PANEL_ID2);
    if (existing) {
      if (existing.previousElementSibling !== anchor) {
        anchor.insertAdjacentElement("afterend", existing);
      }
      return;
    }
    injectStyles();
    anchor.insertAdjacentElement("afterend", buildPanel3());
  }
  function installPreferencesPanel() {
    placePanel2();
    new MutationObserver((records) => {
      if (!onlyOurs(records)) placePanel2();
    }).observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // src/autumns-ui-enhancer/recipient.ts
  var SEND_PROMPT = /who would you like to send/i;
  var TEXT_FIELD_SELECTOR = "input[type='text'], input[type='number'], input:not([type])";
  var USER_FIELD_SELECTOR = "input[name*='user' i], input[placeholder*='user' i], input[id*='user' i]";
  var FORM_MAX_LENGTH = 400;
  var REFILL_DELAYS_MS = [150, 400, 900];
  function defaultRecipient() {
    return readSetting(RECIPIENT_SETTING, "").replace(/\D+/g, "");
  }
  function recipientText() {
    const id = defaultRecipient();
    if (!id) return "";
    const label = readSetting(RECIPIENT_LABEL, "").trim();
    return /\[(\d+)\]/.exec(label)?.[1] === id ? label : id;
  }
  async function nameTheRecipient(userBox) {
    const id = defaultRecipient();
    const found = (await searchUsers(id)).find((user) => user.id === id);
    if (!found) return;
    const label = `${found.name} [${found.id}]`;
    writeSetting(RECIPIENT_LABEL, label);
    if (userBox.isConnected && userBox.value === id) fillField(userBox, label);
    log("send: recipient is", label);
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
  function findSendForms(root) {
    const forms = [];
    const candidates = [root, ...root.querySelectorAll("*")];
    for (const node of candidates) {
      const text = node.textContent ?? "";
      if (text.length > FORM_MAX_LENGTH || !SEND_PROMPT.test(text)) continue;
      if (!node.querySelector(TEXT_FIELD_SELECTOR)) continue;
      forms.push(node);
    }
    return forms.filter(
      (form) => !forms.some((other) => other !== form && form.contains(other))
    );
  }
  function fillRecipient(form) {
    const recipient = recipientText();
    if (!recipient) {
      log("send: no recipient stored, nothing to fill in");
      return false;
    }
    const boxes = Array.from(
      form.querySelectorAll(TEXT_FIELD_SELECTOR)
    ).filter((box2) => !box2.disabled && !box2.readOnly);
    const userBox = form.querySelector(USER_FIELD_SELECTOR) ?? boxes[0];
    if (!userBox) {
      log("send: no recipient box in", boxes.length, "boxes on this form");
      return false;
    }
    if (userBox.value !== "") return false;
    fillField(userBox, recipient);
    log("send: recipient", recipient, "into", userBox);
    if (recipient === defaultRecipient()) void nameTheRecipient(userBox);
    for (const delay of REFILL_DELAYS_MS) {
      setTimeout(() => {
        if (userBox.isConnected && userBox.value === "") {
          fillField(userBox, recipient);
          log("send: recipient put back after Torn cleared it");
        }
      }, delay);
    }
    return true;
  }

  // src/autumns-ui-enhancer/itemSend.ts
  var ITEMS_PATH = "/item.php";
  var SETTLE_MS5 = 120;
  var filled = /* @__PURE__ */ new WeakSet();
  function pass3() {
    if (!isEnabled(PREFERRED_RECIPIENT)) return;
    const forms = findSendForms(document.body);
    if (forms.length) log("send: send forms on the items page:", forms.length);
    for (const form of forms) {
      if (filled.has(form)) continue;
      filled.add(form);
      fillRecipient(form);
    }
  }
  function installItemSend() {
    pass3();
    let timer = 0;
    new MutationObserver((records) => {
      if (onlyOurs(records)) return;
      clearTimeout(timer);
      timer = window.setTimeout(pass3, SETTLE_MS5);
    }).observe(document.body, { childList: true, subtree: true });
  }

  // src/autumns-ui-enhancer/shopSend.ts
  var SHOP_PATHS = ["/shops.php", "/bigalgunshop.php"];
  var SEND_URL = "https://www.torn.com/item.php";
  var MESSAGE_MAX = 200;
  var ITEM_ATTR = "data-aue-item";
  var AMOUNT_ATTR = "data-aue-amount";
  var NAME_ATTR = "data-aue-name";
  var MAX_ATTR = "data-aue-max";
  var HELD_IN_FORM = /name="amount"[^>]*data-max="(\d+)"|data-max="(\d+)"[^>]*name="amount"/;
  var SEARCH_DELAY_MS2 = 250;
  var BLUR_MS2 = 150;
  var PENDING_ATTR2 = "data-aue-pending";
  var PANEL_ATTR = "data-aue-panel";
  var MARKED_ATTR = "data-aue-send";
  var BOUGHT_TEXT = /\byou (?:bought|purchased|have bought)\b/i;
  var BOUGHT_ITEM = /\byou (?:bought|purchased|have bought)\s+(?:(?:a|an|the)\s+)?(?:([\d,]+)\s*x?\s+)?(.+?)(?:\s+at\s+\$[\d,]+\s+each)?\s+for\s/i;
  var MESSAGE_MAX_LENGTH = 300;
  var ITEM_IMAGE = /\/items\/(\d+)\//;
  var ANCESTOR_LIMIT = 6;
  var BOX_LIMIT = 8;
  var CONTENT_ROOT_SELECTOR2 = ".content-wrapper, #mainContainer";
  var COLUMN_SLACK_PX = 5;
  var CLOSE_LINK_ATTR = "data-aue-closes";
  var CLOSE_LIMIT = 4;
  var MESSAGE_CLOSE_SELECTOR = "button[aria-label='Close' i], .close-icon";
  var OPTION_TEXT = /your items|equip|use item|read|open|start|abroad/i;
  var PLANE_PATH = "M2 21l21-9L2 3v7l15 2-15 2v7z";
  var SVG_NS2 = "http://www.w3.org/2000/svg";
  var SETTLE_MS6 = 150;
  var panelCount = 0;
  function on2() {
    return isEnabled(PREFERRED_RECIPIENT);
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
  function findOptionRow(message) {
    let node = message;
    for (let depth = 0; node && depth < ANCESTOR_LIMIT; depth += 1) {
      const links = Array.from(node.querySelectorAll("a"));
      const option = links.find((link) => OPTION_TEXT.test(link.textContent ?? ""));
      if (option?.parentElement) return option.parentElement;
      node = node.parentElement;
    }
    return null;
  }
  function amountBought(message) {
    const match = BOUGHT_ITEM.exec(message.textContent ?? "");
    if (!match) return null;
    const amount = match[1]?.replace(/,/g, "") ?? "1";
    return /^[1-9]\d*$/.test(amount) ? amount : null;
  }
  function nameBought(message) {
    const match = BOUGHT_ITEM.exec(message.textContent ?? "");
    return match?.[2]?.replace(/\s+/g, " ").trim() ?? "";
  }
  async function postSend(fields) {
    return JSON.parse(await postTorn(SEND_URL, fields));
  }
  async function learnHeld(panel) {
    if (panel.hasAttribute(MAX_ATTR)) return;
    const itemId = panel.getAttribute(ITEM_ATTR) ?? "";
    if (!itemId) return;
    panel.setAttribute(MAX_ATTR, "");
    try {
      const html = await postTorn(SEND_URL, {
        step: "actionForm",
        action: "send",
        name: panel.getAttribute(NAME_ATTR) ?? "",
        type: "item",
        id: itemId
      });
      const found = HELD_IN_FORM.exec(html);
      const held = found?.[1] ?? found?.[2];
      if (!held) {
        log("send: Torn's send form gave no amount held");
        return;
      }
      panel.setAttribute(MAX_ATTR, held);
      const amount = panel.querySelector(".aue-send-amount input");
      if (amount) amount.value = cleanAmount(amount.value, held);
      log("send: holding", held, "of item", itemId);
    } catch (error) {
      log("send: couldn't learn the amount held", error);
    }
  }
  function buildTrigger(panelId) {
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "aue-send-trigger";
    trigger.title = "Send item";
    trigger.setAttribute("aria-label", "Send item");
    trigger.setAttribute(PANEL_ATTR, panelId);
    const svg = document.createElementNS(SVG_NS2, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(SVG_NS2, "path");
    path.setAttribute("d", PLANE_PATH);
    path.setAttribute("fill", "currentColor");
    svg.appendChild(path);
    trigger.appendChild(svg);
    return trigger;
  }
  function buildPanel4(panelId, itemId, name, amount) {
    const panel = document.createElement("div");
    panel.className = "aue-send";
    panel.id = panelId;
    panel.hidden = true;
    panel.setAttribute(ITEM_ATTR, itemId);
    panel.setAttribute(NAME_ATTR, name);
    if (amount) panel.setAttribute(AMOUNT_ATTR, amount);
    const heading = document.createElement("div");
    heading.className = "aue-send-heading";
    heading.append("Who would you like to send your ");
    const item = document.createElement("b");
    item.textContent = name || "item";
    heading.append(item, " to?");
    const form = document.createElement("div");
    form.className = "aue-send-form";
    const message = field("Message", "aue-send-message", "");
    message.querySelector("input")?.setAttribute("maxlength", String(MESSAGE_MAX));
    const user = field("User ID", "aue-send-user", recipientText());
    const suggestions = document.createElement("div");
    suggestions.className = "aue-suggest";
    suggestions.hidden = true;
    user.appendChild(suggestions);
    const count = field("Amount", "aue-send-amount", amount ?? "1");
    count.querySelector("input")?.setAttribute("inputmode", "numeric");
    const send = tornButton("SEND", "aue-send-go");
    form.append(message, user, count, send);
    const confirm = document.createElement("div");
    confirm.className = "aue-send-confirm";
    confirm.hidden = true;
    const question = document.createElement("div");
    question.className = "aue-send-question";
    const yes = tornButton("YES", "aue-send-yes");
    const no = tornButton("NO", "aue-send-no");
    confirm.append(question, yes, no);
    const status = document.createElement("div");
    status.className = "aue-send-status";
    status.hidden = true;
    panel.append(heading, form, confirm, status);
    return panel;
  }
  function valueOf(panel, className) {
    return panel.querySelector(`.${className} input`)?.value.trim() ?? "";
  }
  function say2(panel, html, failed) {
    const status = panel.querySelector(".aue-send-status");
    if (!status) return;
    showReply(status, html);
    status.classList.toggle("aue-send-failed", failed);
    status.hidden = false;
  }
  function part(panel, className) {
    return panel.querySelector(`.${className}`);
  }
  async function askToSend(panel) {
    const send = part(panel, "aue-send-go");
    if (!send || send.disabled) return;
    const itemId = panel.getAttribute(ITEM_ATTR) ?? "";
    const user = valueOf(panel, "aue-send-user");
    const amount = valueOf(panel, "aue-send-amount");
    const tag = valueOf(panel, "aue-send-message");
    if (!itemId) {
      say2(panel, "Couldn't tell which item this is, so it can't be sent from here.", true);
      return;
    }
    if (!user) {
      say2(panel, "Who should it go to?", true);
      return;
    }
    send.disabled = true;
    try {
      const reply = await postSend({ step: "sendItemAction", tag, userID: user, amount, itemID: itemId });
      log("send: check answered", reply);
      if (!reply.success || !reply.confirm || reply.itemID === void 0 || reply.userID === void 0) {
        say2(panel, reply.text || "Torn wouldn't send that.", true);
        return;
      }
      panel.setAttribute(
        PENDING_ATTR2,
        JSON.stringify({
          step: "sendItemAction",
          confirm: "1",
          XID: String(reply.itemID),
          userID: String(reply.userID),
          tag,
          amount
        })
      );
      const question = part(panel, "aue-send-question");
      if (question) showReply(question, reply.text ?? "Send it?");
      part(panel, "aue-send-form")?.setAttribute("hidden", "");
      part(panel, "aue-send-status")?.setAttribute("hidden", "");
      part(panel, "aue-send-confirm")?.removeAttribute("hidden");
      part(panel, "aue-send-yes")?.focus();
    } catch (error) {
      say2(panel, "Couldn't reach Torn. Try again.", true);
      log("send: check failed", error);
    } finally {
      send.disabled = false;
    }
  }
  async function confirmSend(panel) {
    const yes = part(panel, "aue-send-yes");
    const raw = panel.getAttribute(PENDING_ATTR2);
    if (!yes || yes.disabled || !raw) return;
    const fields = JSON.parse(raw);
    yes.disabled = true;
    try {
      const reply = await postSend(fields);
      log("send: confirmation answered", reply);
      panel.removeAttribute(PENDING_ATTR2);
      part(panel, "aue-send-confirm")?.setAttribute("hidden", "");
      if (reply.success) {
        say2(panel, reply.text || "Sent.", false);
        const held = Number(panel.getAttribute(MAX_ATTR));
        if (held > 0) panel.setAttribute(MAX_ATTR, String(Math.max(0, held - Number(fields.amount))));
      } else {
        part(panel, "aue-send-form")?.removeAttribute("hidden");
        say2(panel, reply.text || "Torn wouldn't send that.", true);
      }
    } catch (error) {
      say2(panel, "Couldn't reach Torn. Try again.", true);
      log("send: confirmation failed", error);
    } finally {
      yes.disabled = false;
    }
  }
  function cancelSend(panel) {
    panel.removeAttribute(PENDING_ATTR2);
    part(panel, "aue-send-confirm")?.setAttribute("hidden", "");
    part(panel, "aue-send-form")?.removeAttribute("hidden");
  }
  function offerUsers(panel, users) {
    const list = part(panel, "aue-suggest");
    if (!list) return;
    list.replaceChildren();
    for (const user of users) {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "aue-suggest-option";
      option.dataset.aueUser = `${user.name} [${user.id}]`;
      const dot = document.createElement("span");
      dot.className = user.online ? "aue-dot aue-dot-on" : "aue-dot";
      option.append(dot, `${user.name} [${user.id}]`);
      list.appendChild(option);
    }
    list.hidden = users.length === 0;
  }
  var searchTimer = 0;
  function onUserTyped(panel, input) {
    const typed = input.value.trim();
    clearTimeout(searchTimer);
    if (typed.length < MIN_QUERY || /^\d+$/.test(typed) || /\[\d+\]$/.test(typed)) {
      part(panel, "aue-suggest")?.setAttribute("hidden", "");
      return;
    }
    searchTimer = window.setTimeout(() => {
      void searchUsers(typed).then((users) => {
        if (input.value.trim() === typed) offerUsers(panel, users);
      });
    }, SEARCH_DELAY_MS2);
  }
  function openPanel(panel) {
    void learnHeld(panel);
    panel.hidden = false;
    log("send: opened item", panel.getAttribute(ITEM_ATTR));
  }
  function closePanel(panel) {
    panel.hidden = true;
  }
  function dropPanel(panelId) {
    document.getElementById(panelId)?.remove();
    document.querySelector(`[${PANEL_ATTR}="${panelId}"]`)?.remove();
    document.querySelector(`[${MARKED_ATTR}="${panelId}"]`)?.removeAttribute(
      MARKED_ATTR
    );
    log("send: purchase message dismissed, panel taken away");
  }
  function linkClose(message, panelId) {
    let node = message;
    for (let depth = 0; node && depth < CLOSE_LIMIT; depth += 1) {
      const buttons = node.querySelectorAll(MESSAGE_CLOSE_SELECTOR);
      if (buttons.length > 1) return;
      if (buttons.length === 1) {
        buttons[0]?.setAttribute(CLOSE_LINK_ATTR, panelId);
        return;
      }
      node = node.parentElement;
    }
  }
  function installClicks() {
    document.addEventListener(
      "click",
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const trigger = target.closest(`[${PANEL_ATTR}]`);
        if (trigger) {
          event.preventDefault();
          event.stopPropagation();
          const panelId = trigger.getAttribute(PANEL_ATTR) ?? "";
          const message = document.querySelector(`[${MARKED_ATTR}="${panelId}"]`);
          const panel2 = document.getElementById(panelId) ?? (message && ensurePanel(message, panelId));
          if (!panel2) {
            log("send: no panel to open for", panelId);
            return;
          }
          if (panel2.hidden) openPanel(panel2);
          else closePanel(panel2);
          return;
        }
        const panel = target.closest(".aue-send");
        if (panel) {
          if (target.closest(".aue-send-go")) void askToSend(panel);
          else if (target.closest(".aue-send-yes")) void confirmSend(panel);
          else if (target.closest(".aue-send-no")) cancelSend(panel);
          return;
        }
        const dismissing = target.closest(`[${CLOSE_LINK_ATTR}]`);
        if (dismissing) dropPanel(dismissing.getAttribute(CLOSE_LINK_ATTR) ?? "");
      },
      true
    );
    document.addEventListener(
      "mousedown",
      (event) => {
        const target = event.target;
        const option = target instanceof Element ? target.closest(".aue-send .aue-suggest-option") : null;
        const panel = option?.closest(".aue-send");
        if (!option || !panel) return;
        event.preventDefault();
        const input = panel.querySelector(".aue-send-user input");
        if (input) input.value = option.dataset.aueUser ?? "";
        part(panel, "aue-suggest")?.setAttribute("hidden", "");
      },
      true
    );
    document.addEventListener(
      "beforeinput",
      (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement) || !target.closest(".aue-send-amount")) return;
        if (event.data && /\D/.test(event.data)) event.preventDefault();
      },
      true
    );
    document.addEventListener(
      "input",
      (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        const panel = target.closest(".aue-send");
        if (!panel) return;
        if (target.closest(".aue-send-user")) onUserTyped(panel, target);
        if (target.closest(".aue-send-amount")) {
          const cleaned = cleanAmount(target.value, panel.getAttribute(MAX_ATTR) ?? "");
          if (cleaned !== target.value) target.value = cleaned;
        }
      },
      true
    );
    document.addEventListener(
      "focusout",
      (event) => {
        const target = event.target;
        if (!(target instanceof Element) || !target.closest(".aue-send-user")) return;
        const panel = target.closest(".aue-send");
        if (panel) setTimeout(() => part(panel, "aue-suggest")?.setAttribute("hidden", ""), BLUR_MS2);
      },
      true
    );
    document.addEventListener("keydown", (event) => {
      const target = event.target;
      if (event.key === "Enter" && target instanceof HTMLInputElement && target.closest(".aue-send-form")) {
        event.preventDefault();
        const panel = target.closest(".aue-send");
        const list = panel && part(panel, "aue-suggest");
        const options = list && !list.hidden ? list.querySelectorAll(".aue-suggest-option") : [];
        if (target.closest(".aue-send-user") && options.length === 1 && list) {
          target.value = options[0]?.dataset.aueUser ?? target.value;
          list.hidden = true;
        }
        return;
      }
      if (event.key !== "Escape") return;
      for (const panel of document.querySelectorAll(".aue-send")) {
        if (!panel.hidden) closePanel(panel);
      }
    });
  }
  function isPurchaseMessage(element) {
    if (element.closest(".aue-send") || isLogEntry(element)) return false;
    const text = element.textContent ?? "";
    return text.length <= MESSAGE_MAX_LENGTH && BOUGHT_TEXT.test(text);
  }
  function ensureTrigger(message, panelId) {
    linkClose(message, panelId);
    if (document.querySelector(`[${PANEL_ATTR}="${panelId}"]`)) return;
    const trigger = buildTrigger(panelId);
    const row = findOptionRow(message);
    if (row) {
      row.appendChild(trigger);
    } else {
      trigger.classList.add("aue-send-trigger-loose");
      message.insertAdjacentElement("afterend", trigger);
    }
    linkClose(message, panelId);
    log("send: aeroplane placed", row ? "in Torn's row" : "on its own");
  }
  function purchaseBox(message) {
    const shop = shopBox(message);
    let node = message;
    for (let depth = 0; node && depth < CLOSE_LIMIT; depth += 1) {
      if (node.querySelector(MESSAGE_CLOSE_SELECTOR)) {
        return itemsInOneColumn(shop, node) ? node : shop;
      }
      node = node.parentElement;
    }
    return shop;
  }
  function itemsInOneColumn(shop, messageBox) {
    const pictures = [...shop.querySelectorAll("img[src*='/items/']")].filter((picture) => !messageBox.contains(picture)).slice(0, 2).map((picture) => picture.getBoundingClientRect());
    const [first, second] = pictures;
    if (!first || !second) return false;
    return Math.abs(first.left - second.left) < COLUMN_SLACK_PX;
  }
  function shopBox(message) {
    let box2 = message;
    for (let depth = 0; depth < BOX_LIMIT; depth += 1) {
      const parent = box2.parentElement;
      if (!parent || parent === document.body) break;
      if (parent.matches(CONTENT_ROOT_SELECTOR2)) break;
      box2 = parent;
    }
    return box2;
  }
  function stockItemId(name) {
    const wanted = name.toLowerCase();
    for (const shop of readStock()?.shops ?? []) {
      const item = shop.items.find((candidate) => candidate.name.toLowerCase() === wanted);
      if (item) return String(item.id);
    }
    return "";
  }
  function offerSend(message) {
    const name = nameBought(message);
    const itemId = itemIdFor(message) ?? stockItemId(name);
    if (!itemId) {
      message.setAttribute(MARKED_ATTR, "none");
      log("send: no item id for", name || message.textContent);
      return;
    }
    panelCount += 1;
    const panelId = `aue-send-${panelCount}`;
    message.setAttribute(MARKED_ATTR, panelId);
    ensurePanel(message, panelId);
    ensureTrigger(message, panelId);
    log("send: offering item", itemId);
  }
  function ensurePanel(message, panelId) {
    const existing = document.getElementById(panelId);
    if (existing) return existing;
    const name = nameBought(message);
    const itemId = itemIdFor(message) ?? stockItemId(name);
    if (!itemId) return null;
    const panel = buildPanel4(panelId, itemId, name, amountBought(message));
    purchaseBox(message).insertAdjacentElement("afterend", panel);
    return panel;
  }
  function scan2(root) {
    const found = [];
    if (isPurchaseMessage(root)) found.push(root);
    for (const element of root.querySelectorAll("*")) {
      if (isPurchaseMessage(element)) found.push(element);
    }
    for (const message of found) {
      if (found.some((other) => other !== message && message.contains(other))) {
        continue;
      }
      const marked = message.getAttribute(MARKED_ATTR);
      if (!marked) offerSend(message);
      else if (marked !== "none") {
        ensurePanel(message, marked);
        ensureTrigger(message, marked);
      }
    }
  }
  function installShopSend() {
    if (!on2()) return;
    installClicks();
    scan2(document.body);
    let timer = 0;
    new MutationObserver((records) => {
      if (onlyOurs(records)) return;
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (on2()) scan2(document.body);
      }, SETTLE_MS6);
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
  var firstCopy = claimPage();
  function start(name, install) {
    try {
      install();
    } catch (error) {
      log("failed to start", name, error);
    }
  }
  if (!firstCopy) {
  } else if (onGame) {
    start("page jump block", installPageJumpBlock);
    start("personal stats", installPersonalStats);
    start("personal stats zoom", installPersonalStatsZoom);
    start("hide chats filter", installChatFilter);
    start("chat pre-hide", hideChatsEarly);
  } else {
    start("wiki theme", installWikiTheme);
  }
  function onReady() {
    start("styles", injectStyles);
    start("clash check", () => installClashCheck(firstCopy && onGame));
    if (!firstCopy) return;
    if (!onGame) {
      start("list sort", installListSort);
      return;
    }
    start("per-tab chat", installLocalChat);
    start("hide chats", installHideChats);
    start("news ticker", installNewsTicker);
    start("city shop alert", installCityShopAlert);
    if (location.pathname === PREFERENCES_PATH) {
      start("preferences panel", installPreferencesPanel);
      return;
    }
    if (location.pathname === ITEMS_PATH) {
      start("item send", installItemSend);
      start("display case", installDisplayCase);
    }
    if (SHOP_PATHS.includes(location.pathname)) start("shop send", installShopSend);
    start("forum search", installForumSearch);
    start("list display", installListDisplay);
    start("list sort", installListSort);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady, { once: true });
  } else {
    onReady();
  }
})();
