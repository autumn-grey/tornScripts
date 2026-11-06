// ==UserScript==
// @name         Autumn's UI Enhancer
// @namespace    https://github.com/autumn-grey
// @version      0.20.26
// @description  Small quality-of-life fixes for Torn's interface: stops filter links jumping the page, keeps chat windows minimised in one tab without minimising them in the rest and lets the chat bar be dragged to either side of the screen, adds an items-per-page selector to paged lists, sorts those lists and the wiki's tables by column, adds a light/dark switch to the wiki, scrolls the news ticker with arrows for stepping through the headlines, fills your usual recipient into the send forms on the items page and offers to send what you have just bought from a shop, lights up the City while you have city shop buys left today, and shows the stock of the city shop items you pick. Switched on and off from a panel on the preferences page.
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
  var INDEPENDENT_CHAT_TABS = {
    key: "INDEPENDENT_CHAT_TABS",
    label: "Independent Chat Tabs",
    note: "Also lets chat align left when dragged",
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
  var PREFERRED_RECIPIENT = {
    // The key stays as it was so nobody's existing choice is forgotten; only
    // what it covers, and what it is called, have changed.
    key: "SHOP_SEND",
    label: "Preferred Recipient",
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
  var STOCK_ITEMS_SETTING = "CITY_SHOP_STOCK_ITEMS";
  var PANEL_OPEN_SETTING = "PANEL_OPEN";
  var STOCK_LIST_OPEN_SETTING = "CITY_SHOP_STOCK_LIST_OPEN";
  var RECIPIENT_SETTING = "SEND_RECIPIENT";
  var RECIPIENT_LABEL = "SEND_RECIPIENT_LABEL";
  var PANEL_FOOTNOTE = "Dark/Light Mode switch and table sorting in Torn Wiki enabled by default.";
  var FEATURES = [
    PAGE_JUMP_BLOCK,
    INDEPENDENT_CHAT_TABS,
    LIST_DISPLAY_EXTENSION,
    LIST_SORTING,
    NEWS_TICKER,
    PREFERRED_RECIPIENT
  ];
  var API_FEATURES = [CITY_SHOP_ALERT, CITY_SHOP_STOCK];
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

  // src/autumns-ui-enhancer/cityStock.ts
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
    if (body.error) throw new Error(body.error.error ?? "API error");
    const shops = parseShops(body);
    log("city shop: stock", shops);
    return shops;
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
    try {
      const shops = await fetchCityShops(key);
      writeSetting(STOCK_STATE_SETTING, JSON.stringify({ fetchedAt: Date.now(), shops }));
      return shops;
    } catch (error) {
      log("city shop: could not read the stock", error);
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
    cityItemFromLink: '[class*="area-desktop___"], [class*="area-mobile___"]',
    // A side menu item's icon, which carries the blue class.
    navIcon: '[class*="defaultIcon___"]',
    // The status icon list: <ul class="statusIcons___ks48M big___O1UVc">.
    statusList: 'ul[class*="statusIcons___"]',
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
  var CITY_URL2 = "https://www.torn.com/city.php";
  var LOG_URL = "https://api.torn.com/v2/user/log";
  var SHOP_BUY_LOG_ID = 4200;
  var DAILY_LIMIT = 100;
  var DAY_S = 86400;
  var REFRESH_MS = 2 * 6e4;
  var AFTER_BUY_MS = 1500;
  var MIN_GAP_MS = 5e3;
  var PURCHASE_TEXT = /\byou bought\s+(?:([\d,]+)\s*x\b|an?\s)/i;
  var STATE_SETTING = "CITY_SHOP_STATE";
  var SHOPS_PATH = "/shops.php";
  var ICON_ID = "aue-city-shop-icon";
  var TIP_ID = "aue-city-shop-tip";
  var STOCK_ID = "aue-city-shop-stock";
  var LIT_ATTR = "data-aue-city-lit";
  var BLUE_ATTR = "data-aue-city-blue";
  var bought = null;
  var lastFetch = 0;
  var deferred = 0;
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
    if (body.error) throw new Error(body.error.error ?? "API error");
    const entries = Array.isArray(body.log) ? body.log : [];
    log("city shop: log entries", entries);
    return entries;
  }
  function quantityOf(entry) {
    const data = entry.data ?? {};
    for (const field of ["quantity", "qty", "amount"]) {
      const value = data[field];
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
    await loadStock(key, force ? 0 : REFRESH_MS);
  }
  async function refresh(force = false) {
    const key = readSetting(API_KEY_SETTING, "").trim();
    if (!key || !isEnabled(CITY_SHOP_ALERT)) {
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
      const entries = await fetchShopBuys(key, day, DAILY_LIMIT);
      const total = entries.reduce((sum, entry) => sum + quantityOf(entry), 0);
      writeSetting(STATE_SETTING, JSON.stringify({ day, bought: total, fetchedAt: Date.now() }));
      bought = total;
      log("city shop:", bought, "bought today");
    } catch (error) {
      log("city shop: could not read the count", error);
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
  function fillTip(tip) {
    const title = document.createElement("b");
    title.textContent = "City Shops";
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
    const centre = place.left + place.width / 2;
    const left = Math.min(Math.max(4, centre - width / 2), innerWidth - width - 4);
    tip.style.left = `${left + scrollX}px`;
    tip.style.top = `${place.top + scrollY - tip.offsetHeight - 8}px`;
    tip.style.setProperty("--aue-arrow-left", `${centre - left}px`);
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
  function buildIcon() {
    const item = document.createElement("li");
    item.id = ICON_ID;
    const link = document.createElement("a");
    link.href = CITY_URL2;
    link.setAttribute("aria-label", "City shops");
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
      if (watchedStock().length === 0) {
        if (touch && box(TIP_ID).hidden) {
          event.preventDefault();
          showTip(link);
        }
        return;
      }
      event.preventDefault();
      if (touch && box(TIP_ID).hidden && box(STOCK_ID).hidden) {
        showTip(link);
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
    const known = isEnabled(CITY_SHOP_ALERT) && bought !== null;
    const left = known && (bought ?? 0) < DAILY_LIMIT;
    setCityLit(left);
    if (known) {
      placeIcon();
      const link = document.querySelector(`#${ICON_ID} a`);
      const state = left ? "open" : "done";
      if (link && link.dataset.bag !== state) {
        link.dataset.bag = state;
        link.style.backgroundImage = `url("${left ? BAG_OPEN : BAG_DONE}")`;
      }
      const tip = document.getElementById(TIP_ID);
      if (tip && !tip.hidden) refill(tip, fillTip);
      const list = document.getElementById(STOCK_ID);
      if (list && !list.hidden) refill(list, fillStock);
    } else {
      document.getElementById(ICON_ID)?.remove();
      hideTip();
      closeStock();
    }
  }
  function installCityShopAlert() {
    if (!isEnabled(CITY_SHOP_ALERT)) return;
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
    setInterval(() => update(), REFRESH_MS);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) update();
    });
    document.addEventListener("pointerdown", (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest(`#${ICON_ID}, #${STOCK_ID}`)) return;
      hideTip();
      closeStock();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeStock();
    });
    let timer = 0;
    new MutationObserver(() => {
      clearTimeout(timer);
      timer = window.setTimeout(apply, 120);
    }).observe(document.body, { childList: true, subtree: true });
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
    panels: ".confirm, .show-item-info"
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
    const hours = asNumber(timer.h);
    const minutes = asNumber(timer.m);
    const seconds = asNumber(timer.s);
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
    const rows = [];
    for (const listing of list) {
      if (typeof listing !== "object" || listing === null) continue;
      const row = template.cloneNode(true);
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
  var MAX_REQUESTS = 5;
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
  var START_IN_URL = /([?&])start=\d+/;
  var START_IN_HASH = /[?&]start=(\d+)/;
  var lastRequest = null;
  var ownRequest = false;
  var generation = 0;
  var writing = false;
  var filling = null;
  var failedFills = /* @__PURE__ */ new Set();
  var FETCH_BUDGET = 12;
  var fetchBudget = FETCH_BUDGET;
  var saidNoRequest = false;
  var primed = false;
  var onRequestCaptured = null;
  var originalPagers = /* @__PURE__ */ new WeakMap();
  var basePageCounts = /* @__PURE__ */ new WeakMap();
  var pageSteps = /* @__PURE__ */ new WeakMap();
  var START_IN_LINK = /(?:^|[?&#])start=(\d+)/;
  function newGeneration() {
    generation += 1;
    failedFills.clear();
    fetchBudget = FETCH_BUDGET;
    saidNoRequest = false;
  }
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
  function hasLaterPages(widget) {
    let active = 1;
    let last = 1;
    for (const link of widget.querySelectorAll(PAGE_LINK_SELECTOR)) {
      const page = Number(link.getAttribute("page"));
      if (!Number.isInteger(page) || page < 1) continue;
      if (link.classList.contains("active")) active = page;
      if (page > last) last = page;
    }
    return last > active;
  }
  function pageStepFor(widget, container) {
    const cached = pageSteps.get(widget);
    if (cached !== void 0) return cached;
    let step = stepFromLinks(widget);
    let how = "its page links";
    if (step === null && container && hasLaterPages(widget)) {
      const own = rowsOf(container).filter(
        (row) => !row.hasAttribute(EXTRA_ROW_ATTR)
      ).length;
      if (isPlausibleStep(own) && own > 1) {
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
  function adoptStep(widget, step) {
    if (pageSteps.has(widget)) return;
    pageSteps.set(widget, step);
  }
  function sizeChoices(step) {
    return Array.from({ length: MAX_REQUESTS }, (_, index) => step * (index + 1));
  }
  function sizeSetting() {
    return `${SIZE_SETTING}:${location.pathname}`;
  }
  function pageSize(step) {
    const shared = readSetting(SIZE_SETTING, String(step));
    const stored = Number(readSetting(sizeSetting(), shared));
    const wanted = Number.isFinite(stored) && stored > 0 ? stored : step;
    const requests = Math.min(
      MAX_REQUESTS,
      Math.max(1, Math.round(wanted / step))
    );
    return step * requests;
  }
  function redact(text) {
    return text.replace(/=[^&]*/g, "=*");
  }
  function rememberRequest(method, url, body) {
    let address;
    try {
      address = new URL(url, location.href);
    } catch {
      return false;
    }
    if (address.origin !== location.origin) return false;
    if (body !== null && START_IN_BODY.test(body)) {
      if (address.pathname !== location.pathname) return false;
      lastRequest = { method: method || "POST", url, body, offsetIn: "body" };
      log("capture: list request to", address.pathname, redact(body));
      return true;
    }
    if (START_IN_URL.test(address.search)) {
      if (address.pathname !== location.pathname) return false;
      if (lastRequest?.offsetIn === "body") return false;
      lastRequest = { method: method || "GET", url, body, offsetIn: "url" };
      log(
        "capture: list request to",
        address.pathname + redact(address.search),
        body === null ? "(no body)" : redact(body)
      );
      return true;
    }
    return false;
  }
  function installRequestCapture() {
    const openOriginal = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(...args) {
      this.__aueMethod = String(args[0]);
      this.__aueUrl = String(args[1]);
      openOriginal.apply(this, args);
    };
    const sendOriginal = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(body) {
      if (!ownRequest) {
        const captured = rememberRequest(
          this.__aueMethod ?? "GET",
          this.__aueUrl ?? location.pathname,
          typeof body === "string" ? body : null
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
      if (!ownRequest) {
        const request = input instanceof Request ? input : null;
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : request?.url ?? "";
        captured = rememberRequest(
          init?.method ?? request?.method ?? "GET",
          url,
          typeof body === "string" ? body : null
        );
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
  function findRowContainer(root, step) {
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
    const full = step === null ? [] : candidates.filter((c) => rowsOf(c).length >= step);
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
  function findList(widget, step) {
    let node = widget;
    for (let level = 0; node && node !== document.body && level <= MAX_CLIMB; ) {
      if (node.matches(CONTENT_ROOT_SELECTOR)) break;
      for (const sibling of siblingsOf(node)) {
        const container = findRowContainer(sibling, step);
        if (container) {
          return {
            widget,
            pagerBlock: node,
            block: sibling,
            container,
            // A pager with no offsets in its links may still be measurable
            // from the rows it has in front of it.
            step: step ?? pageStepFor(widget, container),
            pagerIsAbove: Boolean(
              node.compareDocumentPosition(sibling) & Node.DOCUMENT_POSITION_FOLLOWING
            )
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
      const target = findList(widget, pageStepFor(widget));
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
  function goToPage(widget, page, size) {
    const template = hashTemplate(widget);
    if (!template) {
      log("page: no hash to build on, so this list cannot be paged by us");
      return;
    }
    const start2 = Math.max(0, page - 1) * size;
    log("page: going to page", page, "- start", start2);
    removeAllExtraRows();
    newGeneration();
    location.hash = `${template}start=${start2}`;
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
      "pages",
      last ? "" : "(pager unfinished, not cached)"
    );
    return pages;
  }
  function pagerModel(widget, size, step) {
    const basePages = basePageCount(widget);
    if (basePages === null) return null;
    const total = Math.max(1, Math.ceil(basePages * step / size));
    const current = Math.min(total, Math.floor(currentStart() / size) + 1);
    return { base: basePages, current, total };
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
  function rewritePager(widget, size, step) {
    const model = pagerModel(widget, size, step);
    if (!model) return;
    const state = `${size}:${model.current}:${model.total}`;
    if (widget.getAttribute(PAGER_STATE_ATTR) === state) return;
    log(
      "pager: page",
      model.current,
      "of",
      model.total,
      "at",
      size,
      "per page, in steps of",
      step
    );
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
        const target = event.target;
        if (!(target instanceof Element)) return;
        const link = target.closest("a");
        const widget = link?.closest(PAGINATION_SELECTOR);
        if (!link || !widget) return;
        const state = widget.getAttribute(PAGER_STATE_ATTR);
        const step = pageStepFor(widget);
        if (state === null || step === null) return;
        const size = Number(state.split(":")[0]);
        if (!Number.isInteger(size) || size <= step) return;
        const model = pagerModel(widget, size, step);
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
        goToPage(widget, page, size);
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
  function looseRows(parsed, live) {
    const rowTag = live.firstElementChild?.tagName;
    const body = parsed.body;
    if (!rowTag || !body) return null;
    const matching = [...body.children].filter(
      (child) => child.tagName === rowTag
    );
    return matching.length > 0 ? body : null;
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
  async function fetchRows(start2, live) {
    if (!lastRequest) return [];
    if (fetchBudget <= 0) {
      log("fetch: this page has had its allowance, so nothing more is asked for");
      return [];
    }
    fetchBudget -= 1;
    const { offsetIn } = lastRequest;
    const method = lastRequest.method.toUpperCase();
    const at = (_match, lead) => `${lead}start=${start2}`;
    const url = offsetIn === "url" ? lastRequest.url.replace(START_IN_URL, at) : lastRequest.url;
    const body = offsetIn === "body" && lastRequest.body !== null ? lastRequest.body.replace(START_IN_BODY, at) : lastRequest.body;
    const headers = {
      "X-Requested-With": "XMLHttpRequest"
    };
    const sendsBody = method !== "GET" && method !== "HEAD" && body !== null;
    if (sendsBody) headers["Content-Type"] = "application/x-www-form-urlencoded";
    ownRequest = true;
    let html;
    try {
      const init = { method, headers, credentials: "same-origin" };
      if (sendsBody) init.body = body;
      const response = await fetch(url, init);
      if (!response.ok) {
        log("fetch: start", start2, "->", response.status, response.statusText);
        return [];
      }
      html = await response.text();
    } catch {
      return [];
    } finally {
      ownRequest = false;
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
    if (!container) lastRequest = null;
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
    writing = true;
    for (const row of extra) row.remove();
    writing = false;
    log("page: took back", extra.length, "added rows before moving");
  }
  function removeExtraRows(container) {
    for (const row of container.querySelectorAll(`[${EXTRA_ROW_ATTR}]`)) {
      row.remove();
    }
  }
  async function fillList(target, size, step) {
    const { container } = target;
    const have = rowsOf(container).length;
    if (have >= size) return;
    if (!container.isConnected) return;
    const start2 = currentStart();
    const key = `${generation}:${start2}:${size}`;
    if (filling && filling.key === key && filling.container === container) return;
    if (failedFills.has(key)) return;
    if (have < step) {
      const ended = !hasLaterPages(target.widget);
      if (ended) failedFills.add(key);
      log(
        "fill: skipped -",
        have,
        "rows is short of",
        step,
        ended ? "- this is the end" : "- the list is still filling in"
      );
      return;
    }
    const mine = generation;
    filling = { key, container };
    let added = 0;
    let abandoned = false;
    const requests = Math.ceil(size / step);
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
        const rows = await fetchRows(start2 + index * step, container);
        if (mine !== generation) {
          log("fill: abandoned, the page moved on");
          abandoned = true;
          return;
        }
        if (!container.isConnected) {
          log("fill: abandoned, Torn replaced the list");
          abandoned = true;
          return;
        }
        if (rows.length === 0) {
          log("fill: stopped, that request returned no rows");
          break;
        }
        writing = true;
        try {
          for (const row of rows) {
            disarm(row).setAttribute(EXTRA_ROW_ATTR, "");
            if (spacer) container.insertBefore(row, spacer);
            else container.appendChild(row);
            added += 1;
          }
        } catch (problem) {
          log("fill: stopped, that row would not go in -", problem);
          break;
        } finally {
          writing = false;
        }
        if (rows.length < step) break;
        if (index + 1 < requests) await delay(THROTTLE_MS);
        if (mine !== generation) {
          abandoned = true;
          return;
        }
      }
      log("fill: done,", rowsOf(container).length, "rows now showing");
    } finally {
      writing = false;
      if (added === 0 && !abandoned) {
        failedFills.add(key);
        log("fill: nothing came back, so this page is left as Torn sent it");
      }
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
  function buildControl(step) {
    const bar = document.createElement("div");
    bar.id = CONTROL_ID;
    bar.className = "aue-per-page";
    bar.dataset.aueStep = String(step);
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
    for (const size of sizeChoices(step)) {
      const option = document.createElement("option");
      option.value = String(size);
      option.textContent = String(size);
      select.appendChild(option);
    }
    select.value = String(pageSize(step));
    select.addEventListener("change", () => onSizeChange(Number(select.value)));
    bar.appendChild(select);
    return bar;
  }
  function onSizeChange(chosen) {
    writeSetting(sizeSetting(), String(chosen));
    newGeneration();
    setStatus("");
    const target = findTarget();
    if (!target || target.step === null) return;
    const size = pageSize(target.step);
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
    goToPage(target.widget, page, size);
    if (location.hash === before) setTimeout(() => void apply2(), 0);
  }
  var OWN_SIZE_LABEL = "per page";
  function offersOnlyNumbers(select) {
    if (select.options.length === 0) return false;
    return [...select.options].every(
      (option) => /^\d+$/.test((option.textContent ?? "").trim())
    );
  }
  function labelledPerPage(select) {
    const nearby = [];
    const collectSiblings = (of) => {
      for (const sibling of of?.parentElement?.childNodes ?? []) {
        if (sibling === of) continue;
        if (sibling instanceof Element && sibling.closest(`#${CONTROL_ID}`)) {
          continue;
        }
        nearby.push(sibling.textContent ?? "");
      }
    };
    collectSiblings(select);
    collectSiblings(select.parentElement);
    if (select.id) {
      const label = document.querySelector(
        `label[for="${CSS.escape(select.id)}"]`
      );
      if (label && !label.closest(`#${CONTROL_ID}`)) {
        nearby.push(label.textContent ?? "");
      }
    }
    return nearby.join(" ").toLowerCase().includes(OWN_SIZE_LABEL);
  }
  function tornSetsTheSizeHere(target) {
    let scope = target.block.parentElement;
    while (scope && !scope.contains(target.pagerBlock)) {
      scope = scope.parentElement;
    }
    if (!scope) return false;
    for (const select of scope.querySelectorAll("select")) {
      if (select.closest(`#${CONTROL_ID}`)) continue;
      if (offersOnlyNumbers(select) && labelledPerPage(select)) return true;
    }
    return false;
  }
  var TOP_PAGER_ATTR = "data-aue-top-pager";
  function tornsOwnPager() {
    for (const widget of document.querySelectorAll(
      PAGINATION_SELECTOR
    )) {
      if (widget.hasAttribute(TOP_PAGER_ATTR)) continue;
      if (widget.querySelector(PAGE_LINK_SELECTOR)) return widget;
    }
    return null;
  }
  function ensureTopPager(target, step) {
    const existing = document.querySelector(`[${TOP_PAGER_ATTR}]`);
    if (!existing && target.pagerIsAbove) return null;
    const source = tornsOwnPager();
    if (!source) return existing;
    const stamp = String(generation);
    if (existing && existing.getAttribute(TOP_PAGER_ATTR) === stamp) {
      return existing;
    }
    const markup = originalPagers.get(source) ?? source.innerHTML;
    const copy = existing ?? source.cloneNode(false);
    writing = true;
    copy.innerHTML = markup;
    copy.setAttribute(TOP_PAGER_ATTR, stamp);
    copy.removeAttribute(PAGER_STATE_ATTR);
    originalPagers.delete(copy);
    basePageCounts.delete(copy);
    if (!copy.isConnected) target.block.insertAdjacentElement("beforebegin", copy);
    writing = false;
    adoptStep(copy, step);
    return copy;
  }
  function removeTopPager() {
    const copy = document.querySelector(`[${TOP_PAGER_ATTR}]`);
    if (!copy) return;
    writing = true;
    copy.remove();
    writing = false;
  }
  function ensureControl(anchor, step) {
    const stale = document.getElementById(CONTROL_ID);
    if (stale instanceof HTMLElement && stale.dataset.aueStep !== String(step)) {
      writing = true;
      stale.remove();
      writing = false;
    }
    const existing = document.getElementById(CONTROL_ID);
    if (existing) {
      const select = existing.querySelector(`#${SELECT_ID}`);
      const wanted = String(pageSize(step));
      if (select && select.value !== wanted) select.value = wanted;
      if (existing.nextElementSibling === anchor) return;
      writing = true;
      anchor.insertAdjacentElement("beforebegin", existing);
      writing = false;
      return;
    }
    writing = true;
    anchor.insertAdjacentElement("beforebegin", buildControl(step));
    writing = false;
  }
  function removeControl() {
    document.getElementById(CONTROL_ID)?.remove();
  }
  function primeRequest(target, size) {
    if (primed || START_IN_HASH.test(location.hash)) return;
    primed = true;
    log("prime: asking Torn for this list so its request can be replayed");
    goToPage(target.widget, Math.floor(currentStart() / size) + 1, size);
  }
  async function apply2() {
    if (!isEnabled(LIST_DISPLAY_EXTENSION)) {
      removeControl();
      removeTopPager();
      return;
    }
    const target = findTarget();
    if (!target) {
      removeControl();
      removeTopPager();
      return;
    }
    const step = target.step;
    if (step === null) {
      log("apply: cannot tell how many rows this list sends, so leaving it be");
      removeControl();
      removeTopPager();
      return;
    }
    if (tornSetsTheSizeHere(target)) {
      log("apply: Torn sets the page size on this list, so leaving it to it");
      removeControl();
      removeTopPager();
      return;
    }
    const topPager = ensureTopPager(target, step);
    ensureControl(topPager ?? target.pagerBlock, step);
    const size = pageSize(step);
    if (size <= step) {
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
      if (!saidNoRequest) {
        saidNoRequest = true;
        log("apply: no list request to replay yet, leaving the page alone");
      }
      writing = true;
      removeExtraRows(target.container);
      for (const widget of document.querySelectorAll(
        PAGINATION_SELECTOR
      )) {
        restorePager(widget);
      }
      writing = false;
      primeRequest(target, size);
      return;
    }
    await fillList(target, size, step);
    if (filling && filling.container === target.container) return;
    const filled2 = rowsOf(target.container).length;
    if (filled2 <= step) {
      log("fill: still", filled2, "rows, so Torn's own pager stands");
    }
    writing = true;
    for (const widget of document.querySelectorAll(
      PAGINATION_SELECTOR
    )) {
      if (!widget.querySelector(PAGE_LINK_SELECTOR)) continue;
      const own = pageStepFor(widget) ?? step;
      adoptStep(widget, own);
      if (filled2 > own) rewritePager(widget, pageSize(own), own);
      else restorePager(widget);
    }
    writing = false;
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
          void apply2();
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
      removeAllExtraRows();
      newGeneration();
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

  // src/autumns-ui-enhancer/localChat.ts
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
  var HEADER_DEPTH = 34;
  var DRAG_THRESHOLD = 24;
  var TASKBAR_CLIMB = 4;
  var NOT_A_HANDLE = `input, textarea, a, ${MINIMISE_SELECTOR}, ${CLOSE_SELECTOR}`;
  var FAILSAFE_MS = 5e3;
  var SETTLE_MS3 = 120;
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
    if (!isEnabled(INDEPENDENT_CHAT_TABS)) return "right";
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
  function setOffset(wrapper, x, instant = false) {
    const wanted = Math.abs(x) < 0.5 ? "" : `${Math.round(x * 10) / 10}px 0`;
    if (wrapper.style.translate === wanted) return;
    const placeAtOnce = instant || wrapper.style.translate === "";
    if (placeAtOnce) wrapper.classList.add(INSTANT_CLASS);
    allowSmoothOffset(wrapper);
    if (wanted === "") wrapper.style.removeProperty("translate");
    else wrapper.style.setProperty("translate", wanted, "important");
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
  function chatWindows() {
    const found = [];
    for (const button of document.querySelectorAll(MINIMISE_SELECTOR)) {
      const box2 = boxOf(button);
      const wrapper = box2 && wrapperOf(box2);
      if (box2 && wrapper) found.push({ id: box2.id, wrapper });
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
      bar.style.setProperty("flex-direction", "row-reverse", "important");
    } else {
      bar.style.removeProperty("flex-direction");
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
  function barOrder() {
    return [...document.querySelectorAll(TASKBAR_SELECTOR)].map(
      (button) => button.id.slice(TASKBAR_PREFIX.length)
    );
  }
  function slotOf(item, bar) {
    const id = windowIdOf(item);
    const panel = PANEL_ORDER.indexOf(id);
    if (panel >= 0) return panel;
    const chat = bar.indexOf(id);
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
  function relayout() {
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
  function hide(id) {
    const hidden = readSet(HIDDEN_KEY);
    hidden.add(id);
    writeSet(HIDDEN_KEY, hidden);
    apply3();
    log("chat:", id, "hidden in this tab only");
  }
  function show(id) {
    const hidden = readSet(HIDDEN_KEY);
    hidden.delete(id);
    writeSet(HIDDEN_KEY, hidden);
    apply3();
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
  function apply3() {
    if (!isEnabled(INDEPENDENT_CHAT_TABS)) {
      for (const hiddenWindow of document.querySelectorAll(`.${HIDDEN_CLASS}`)) {
        hiddenWindow.classList.remove(HIDDEN_CLASS);
      }
      relayout();
      return;
    }
    const hidden = readSet(HIDDEN_KEY);
    const known = readSet(KNOWN_KEY);
    const openedHere = focusedOnArrival;
    let changed = false;
    let seen2 = 0;
    for (const button of document.querySelectorAll(MINIMISE_SELECTOR)) {
      const box2 = boxOf(button);
      const wrapper = box2 && wrapperOf(box2);
      if (!box2 || !wrapper) continue;
      seen2 += 1;
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
      wrapper.classList.toggle(HIDDEN_CLASS, hidden.has(box2.id));
    }
    if (changed) {
      writeSet(KNOWN_KEY, known);
      writeSet(HIDDEN_KEY, hidden);
    }
    if (seen2 > 0) liftEarlyHide();
    measureRow();
    relayout();
  }
  function swallow(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
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
      swallow(event);
      hide(box2.id);
      return;
    }
    const tab = target.closest(TASKBAR_SELECTOR);
    if (tab) {
      const id = tab.id.slice(TASKBAR_PREFIX.length);
      if (!id) return;
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
      hide(id);
    }
  }
  var dragFrom = null;
  function dropSelection() {
    try {
      getSelection()?.removeAllRanges();
    } catch {
    }
  }
  function onPointerDown(event) {
    dragFrom = null;
    if (!isEnabled(INDEPENDENT_CHAT_TABS)) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest(NOT_A_HANDLE)) return;
    const box2 = boxOf(target);
    if (!box2) return;
    const wrapper = wrapperOf(box2);
    if (!wrapper || wrapper.parentElement !== windowRow()) return;
    const depth = event.clientY - box2.getBoundingClientRect().top;
    if (depth > HEADER_DEPTH) {
      log("chat: grab", Math.round(depth), "px down, below the top strip");
      return;
    }
    dragFrom = event.clientX;
    log("chat: grabbed", box2.id, "- drag across the screen to move the bar");
  }
  function onPointerMove(event) {
    if (dragFrom === null) return;
    if (Math.abs(event.clientX - dragFrom) < DRAG_THRESHOLD) return;
    const wanted = event.clientX < window.innerWidth / 2 ? "left" : "right";
    if (wanted === barSide()) return;
    setBarSide(wanted);
    relayout();
    dropSelection();
    log("chat: bar moved to the", wanted);
  }
  function onPointerUp() {
    dragFrom = null;
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
      new MutationObserver(queueRelayout).observe(item, {
        attributes: true,
        attributeFilter: ["style"],
        childList: true
      });
    }
  }
  var layoutQueued = false;
  function queueRelayout() {
    if (layoutQueued) return;
    layoutQueued = true;
    queueMicrotask(() => {
      layoutQueued = false;
      relayout();
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
        apply3();
      },
      Math.max(0, Math.min(SETTLE_MS3, passDeadline - now))
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
    apply3();
  }
  function installLocalChat() {
    addEventListener("click", onClick, true);
    addEventListener("click", onMenuClick, true);
    addEventListener("pointerdown", onPointerDown, true);
    addEventListener("pointermove", onPointerMove, true);
    addEventListener("pointerup", onPointerUp, true);
    addEventListener("pointercancel", onPointerUp, true);
    addEventListener("resize", schedulePass);
    new MutationObserver(() => {
      focusedOnArrival = isTheActiveTab();
      if (!rowIsWatched) queueRelayout();
      schedulePass();
    }).observe(document.body, { childList: true, subtree: true });
    apply3();
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
    const box2 = document.createElement("div");
    box2.innerHTML = html;
    return (box2.textContent ?? "").replace(/[[d:s]+]s*$/, "").replace(/s+/g, " ").trim().toLowerCase();
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
      countdown.textContent = countdownText2(item.endTime);
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
  function apply4() {
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
      timer = window.setTimeout(apply4, 120);
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
        countdown.textContent = countdownText2(item.endTime);
      }
    }, 1e3);
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

  // src/autumns-ui-enhancer/styles.ts
  var STYLE_ID = "aue-styles";
  var PANEL_ID = "aue-prefs-panel";
  var CSS2 = `

  #${PANEL_ID} {
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
  .aue-send {
    display: block;
    margin: 0 0 10px;
    overflow: hidden;
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
  .aue-send-status {
    padding: 6px 8px;
    background: #111;
    color: #ccc;
    font-size: 11px;
  }
  /* Invisible but full height: at no height, the items page never loads the
     items past its first chunk, which it only does as its list is scrolled. */
  .aue-send-frame-waiting {
    visibility: hidden;
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
  /* As when the send option worked: tall enough for the row and its form. */
  .aue-send-frame {
    display: block;
    width: 100%;
    height: 320px;
    border: 0;
    background: #111;
  }
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
  #${PANEL_ID}.aue-collapsed .aue-title {
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
`;
  function injectStyles() {
    document.documentElement.setAttribute("data-aue", "0.20.26");
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
    const field = document.createElement("span");
    field.className = "aue-field";
    row.appendChild(field);
    const input = document.createElement("input");
    input.className = "aue-input";
    input.type = "text";
    input.placeholder = "name or ID";
    input.value = readSetting(RECIPIENT_LABEL, readSetting(RECIPIENT_SETTING, ""));
    field.appendChild(input);
    const list = document.createElement("div");
    list.className = "aue-suggest";
    list.hidden = true;
    field.appendChild(list);
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
    const field = document.createElement("span");
    field.className = "aue-field aue-key-field";
    row.appendChild(field);
    const note = document.createElement("span");
    note.className = "aue-note aue-key-note";
    note.textContent = "The custom key fetches City shop purchase logs and shop stock only.";
    row.appendChild(note);
    const box2 = document.createElement("span");
    box2.className = "aue-key-box";
    field.appendChild(box2);
    const input = document.createElement("input");
    input.className = "aue-input aue-key-input";
    input.type = "password";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.placeholder = "custom key";
    input.value = readSetting(API_KEY_SETTING, "");
    box2.appendChild(input);
    const reveal = document.createElement("button");
    reveal.type = "button";
    reveal.className = "aue-key-reveal";
    reveal.textContent = "Show";
    reveal.addEventListener("click", () => {
      const hidden = input.type === "password";
      input.type = hidden ? "text" : "password";
      reveal.textContent = hidden ? "Hide" : "Show";
    });
    box2.appendChild(reveal);
    const check = document.createElement("button");
    check.type = "button";
    check.className = "torn-btn aue-key-check";
    check.textContent = "Check";
    field.appendChild(check);
    const result = document.createElement("span");
    result.className = "aue-key-result";
    field.appendChild(result);
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
  function buildPanel() {
    const panel = document.createElement("div");
    panel.id = PANEL_ID;
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

  // src/autumns-ui-enhancer/recipient.ts
  var SEND_PROMPT = /who would you like to send/i;
  var TEXT_FIELD_SELECTOR = "input[type='text'], input[type='number'], input:not([type])";
  var USER_FIELD_SELECTOR = "input[name*='user' i], input[placeholder*='user' i], input[id*='user' i]";
  var AMOUNT_FIELD_SELECTOR = "input[name*='amount' i], input[placeholder*='amount' i], input[id*='amount' i], input[type='number']";
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
    for (const delay2 of REFILL_DELAYS_MS) {
      setTimeout(() => {
        if (userBox.isConnected && userBox.value === "") {
          fillField(userBox, recipient);
          log("send: recipient put back after Torn cleared it");
        }
      }, delay2);
    }
    return true;
  }

  // src/autumns-ui-enhancer/itemSend.ts
  var ITEMS_PATH = "/item.php";
  var SETTLE_MS4 = 120;
  var filled = /* @__PURE__ */ new WeakSet();
  function pass2() {
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
    pass2();
    let timer = 0;
    new MutationObserver(() => {
      clearTimeout(timer);
      timer = window.setTimeout(pass2, SETTLE_MS4);
    }).observe(document.body, { childList: true, subtree: true });
  }

  // src/autumns-ui-enhancer/shopSend.ts
  var SHOP_PATHS = ["/shops.php", "/bigalgunshop.php"];
  var ITEMS_URL = "https://www.torn.com/item.php";
  var ALL_TAB_SELECTOR = "a[href='#all-items']";
  var ITEM_ATTR = "data-aue-item";
  var AMOUNT_ATTR = "data-aue-amount";
  var NAME_ATTR = "data-aue-name";
  var PANEL_ATTR = "data-aue-panel";
  var MARKED_ATTR = "data-aue-send";
  var BOUGHT_TEXT = /\byou (?:bought|purchased|have bought)\b/i;
  var BOUGHT_ITEM = /\byou (?:bought|purchased|have bought)\s+(?:(?:a|an|the)\s+)?(?:([\d,]+)\s*x?\s+)?(.+?)(?:\s+at\s+\$[\d,]+\s+each)?\s+for\s/i;
  var MESSAGE_MAX_LENGTH = 300;
  var ITEM_IMAGE = /\/items\/(\d+)\//;
  var ANCESTOR_LIMIT = 6;
  var FRAME_READY_MS = 2e4;
  var POLL_MS = 250;
  var SETTLE_MS5 = 150;
  var FORM_TRIES = 28;
  var FORM_CLICK_EVERY = 3;
  var BOX_LIMIT = 8;
  var CONTENT_ROOT_SELECTOR2 = ".content-wrapper, #mainContainer";
  var SEND_PANEL_MAX_LENGTH = 220;
  var FORM_WATCH_MS = 500;
  var CLOSE_LINK_ATTR = "data-aue-closes";
  var CLOSE_LIMIT = 4;
  var MESSAGE_CLOSE_SELECTOR = "button[aria-label='Close' i], .close-icon";
  var OPTION_TEXT = /your items|equip|use item|read|open|start|abroad/i;
  var ROW_SELECTOR = "li, tr";
  var SEND_TEXT = /^\s*send\s*$/i;
  var CLICKABLE_SELECTOR = "button, a, li, span, div, [role='button']";
  var SEND_SELECTORS = [
    "[aria-label='Send' i]",
    "[title='Send' i]",
    "a[href*='send' i]",
    "[class*='send' i]"
  ];
  var ROW_MAX_LENGTH = 300;
  var PLANE_PATH = "M2 21l21-9L2 3v7l15 2-15 2v7z";
  var SVG_NS = "http://www.w3.org/2000/svg";
  var QUIET_ATTR = "data-aue-quiet-list";
  var SUGGESTIONS_SELECTOR = ".autocomplete-wrap";
  var ENGAGED_ATTR = "data-aue-recipient-used";
  var HOLD_PAGE_MS = 4e3;
  var FRAME_MIN_HEIGHT = 50;
  var FRAME_MAX_HEIGHT = 220;
  var WAITING_CLASS = "aue-send-frame-waiting";
  var ONLY_CLASS = "aue-send-only";
  var HIDE_CLASS = "aue-send-hidden";
  var KEEP_CLASS = "aue-send-kept";
  var FRAME_CSS = `
  .${ONLY_CLASS} .${HIDE_CLASS} {
    display: none !important;
  }
  .${ONLY_CLASS} .${KEEP_CLASS} {
    position: static !important;
    transform: none !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    width: auto !important;
    min-width: 0 !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow: visible !important;
    background: transparent !important;
    display: block !important;
  }
  .${ONLY_CLASS} body {
    margin: 0 !important;
    padding: 0 !important;
  }
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
  [${QUIET_ATTR}] {
    display: none !important;
  }
  body { background: transparent !important; }
`;
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
  function findRow(doc, itemId) {
    if (!itemId) return null;
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
    for (const scope of [row, row.nextElementSibling, row.parentElement]) {
      if (!scope) continue;
      let best = null;
      const clickable = scope.querySelectorAll(CLICKABLE_SELECTOR);
      for (const element of clickable) {
        if (!SEND_TEXT.test(element.textContent ?? "")) continue;
        if (!best || best.contains(element)) best = element;
      }
      if (best) return best;
      for (const selector of SEND_SELECTORS) {
        const control = scope.querySelector(selector);
        if (control) return control;
      }
    }
    return null;
  }
  function expandRow(row) {
    const handle = row.querySelector("img[src*='/items/']") ?? row;
    handle.click();
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
  function findRowByName(doc, name) {
    if (!name) return null;
    const wanted = name.toLowerCase();
    let best = null;
    for (const row of doc.querySelectorAll(ROW_SELECTOR)) {
      const text = (row.textContent ?? "").toLowerCase();
      if (!text.includes(wanted) || text.length > ROW_MAX_LENGTH) continue;
      if (!best || text.length < (best.textContent ?? "").length) best = row;
    }
    return best;
  }
  function sendFormScope(row) {
    if (row.querySelector(TEXT_FIELD_SELECTOR)) return row;
    const next = row.nextElementSibling;
    if (next?.querySelector(TEXT_FIELD_SELECTOR)) return next;
    return row;
  }
  function isElement(value) {
    return typeof value === "object" && value !== null && value.nodeType === Node.ELEMENT_NODE;
  }
  function quietSuggestions(scope) {
    const doc = scope.ownerDocument;
    if (doc.documentElement.hasAttribute(ENGAGED_ATTR)) return;
    const input = scope.querySelector(USER_FIELD_SELECTOR);
    if (!input) return;
    const dropdown = (input.id ? doc.getElementById(`${input.id}-cont`) : null) ?? input.parentElement?.querySelector(SUGGESTIONS_SELECTOR) ?? null;
    if (dropdown && !dropdown.hasAttribute(QUIET_ATTR)) dropdown.setAttribute(QUIET_ATTR, "");
  }
  function wakeSuggestions(doc) {
    if (doc.documentElement.dataset.aueWakeWatched === "1") return;
    doc.documentElement.dataset.aueWakeWatched = "1";
    const wake = (event) => {
      const target = event.target;
      if (!event.isTrusted || !isElement(target) || !target.matches(USER_FIELD_SELECTOR)) return;
      doc.documentElement.setAttribute(ENGAGED_ATTR, "");
      for (const hidden of doc.querySelectorAll(`[${QUIET_ATTR}]`)) hidden.removeAttribute(QUIET_ATTR);
    };
    doc.addEventListener("pointerdown", wake, true);
    doc.addEventListener("keydown", wake, true);
  }
  function fillSendForm(row, amount) {
    const scope = sendFormScope(row);
    const boxes = Array.from(
      scope.querySelectorAll(TEXT_FIELD_SELECTOR)
    ).filter((box2) => !box2.disabled && !box2.readOnly);
    if (boxes.length === 0) return;
    const recipient = recipientText();
    const userBox = scope.querySelector(USER_FIELD_SELECTOR) ?? boxes[0];
    const amountBox = scope.querySelector(AMOUNT_FIELD_SELECTOR) ?? (boxes[1] === userBox ? boxes[0] : boxes[1]);
    if (recipient && userBox && userBox.value === "") {
      fillField(userBox, recipient);
      log("send: recipient", recipient);
      wakeSuggestions(userBox.ownerDocument);
      quietSuggestions(scope);
    }
    if (amount && amountBox && amountBox !== userBox) {
      fillField(amountBox, amount);
      log("send: amount", amount);
    }
  }
  function isolateRow(doc, target, toTop = true) {
    const keep = /* @__PURE__ */ new Set();
    for (let node = target; node; node = node.parentElement) {
      keep.add(node);
    }
    for (const node of keep) {
      for (const sibling of Array.from(node.parentElement?.children ?? [])) {
        if (!keep.has(sibling) && !sibling.classList.contains(HIDE_CLASS)) {
          sibling.classList.add(HIDE_CLASS);
        }
      }
      if (node !== target && !node.classList.contains(KEEP_CLASS)) node.classList.add(KEEP_CLASS);
    }
    if (!doc.documentElement.classList.contains(ONLY_CLASS)) {
      doc.documentElement.classList.add(ONLY_CLASS);
    }
    if (toTop) doc.defaultView?.scrollTo(0, 0);
  }
  function findSendPanel(row) {
    const scope = sendFormScope(row);
    const user = scope.querySelector(USER_FIELD_SELECTOR) ?? scope.querySelector(TEXT_FIELD_SELECTOR);
    if (!user) return null;
    let best = user;
    for (let node = user.parentElement; node && node !== row; ) {
      if ((node.textContent ?? "").length > SEND_PANEL_MAX_LENGTH) break;
      best = node;
      node = node.parentElement;
    }
    return best;
  }
  function watchForm(frame, doc, form) {
    const panel = frame.closest(".aue-send");
    if (!panel) return;
    const holder = form.parentElement;
    let shown = form;
    const keepHidden = () => {
      if (!shown.isConnected && holder?.isConnected) {
        shown = holder;
        log("send: the form was replaced, showing what took its place");
      }
      if (!shown.isConnected) return;
      isolateRow(doc, shown, false);
      quietSuggestions(shown);
      fitFrame(frame, shown);
    };
    const FrameObserver = doc.defaultView?.MutationObserver ?? MutationObserver;
    const observer = new FrameObserver(keepHidden);
    observer.observe(doc.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"]
    });
    const timer = window.setInterval(() => {
      if (!panel.isConnected || panel.hidden) {
        clearInterval(timer);
        observer.disconnect();
        return;
      }
      keepHidden();
    }, FORM_WATCH_MS);
  }
  function fitFrame(frame, shown) {
    const view = shown.ownerDocument.defaultView;
    const scrolled = view?.scrollY ?? 0;
    let bottom = 0;
    for (const element of [shown, ...shown.querySelectorAll("*")]) {
      const box2 = element.getBoundingClientRect();
      if (box2.height > 0) bottom = Math.max(bottom, box2.bottom + scrolled);
    }
    const height = Math.min(FRAME_MAX_HEIGHT, Math.max(FRAME_MIN_HEIGHT, Math.ceil(bottom) + 6));
    const wanted = `${height}px`;
    if (frame.style.height !== wanted) frame.style.height = wanted;
  }
  function showFrame(frame, status) {
    frame.classList.remove(WAITING_CLASS);
    frame.inert = false;
    status.hidden = true;
  }
  function failPanel(status, reason) {
    status.hidden = false;
    status.textContent = `${reason} `;
    const link = document.createElement("a");
    link.className = "aue-send-link";
    link.href = ITEMS_URL;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Open items page";
    status.appendChild(link);
  }
  function sendFormOpen(row) {
    return sendFormScope(row).querySelector(TEXT_FIELD_SELECTOR) !== null;
  }
  var FRAME_CLOSE_SELECTOR = ".close-icon, a, button";
  var CLOSE_TEXT = /^\s*close\s*$/i;
  function watchFrameClicks(frame, doc) {
    if (doc.documentElement.dataset.aueClicksWatched === "1") return;
    doc.documentElement.dataset.aueClicksWatched = "1";
    doc.addEventListener("click", (event) => {
      const target = event.target;
      if (!isElement(target)) return;
      const control = target.closest(FRAME_CLOSE_SELECTOR);
      const isClose = control !== null && (control.matches(".close-icon") || CLOSE_TEXT.test(control.textContent ?? "") || /^close$/i.test(control.getAttribute("aria-label") ?? ""));
      if (isClose) {
        const panel = frame.closest(".aue-send");
        setTimeout(() => panel && closePanel(panel), 0);
        log("send: Torn's Close pressed, putting the panel away");
        return;
      }
      const link = target.closest("a[href]");
      const href = link?.getAttribute("href") ?? "";
      if (!link || href === "" || href.startsWith("#") || href.startsWith("javascript:")) return;
      if (link.target !== "_blank" && link.target !== "_top") {
        link.target = "_top";
        log("send: a link in the frame will open in the whole window", href);
      }
    }, true);
  }
  function openSendForm(frame, doc, item, status) {
    let polls = 0;
    const step = () => {
      const row = findRow(doc, item.itemId) ?? findRowByName(doc, item.name);
      if (row && sendFormOpen(row)) {
        fillSendForm(row, item.amount);
        const form = findSendPanel(row) ?? row;
        isolateRow(doc, form);
        showFrame(frame, status);
        fitFrame(frame, form);
        watchForm(frame, doc, form);
        log("send: the form is open for", item.itemId);
        return;
      }
      if (row && polls % FORM_CLICK_EVERY === 0) {
        const control = findSendControl(row);
        if (control) control.click();
        else expandRow(row);
      }
      polls += 1;
      if (polls < FORM_TRIES) {
        setTimeout(step, POLL_MS);
        return;
      }
      failPanel(status, `Couldn't open the send form for ${item.name}.`);
      log("send: the form never opened for", item.itemId);
    };
    step();
  }
  function styleFrame(doc) {
    if (doc.getElementById("aue-send-frame-styles")) return;
    const style = doc.createElement("style");
    style.id = "aue-send-frame-styles";
    style.textContent = FRAME_CSS;
    (doc.head ?? doc.documentElement).appendChild(style);
  }
  function showAllItems(doc) {
    const tab = doc.querySelector(ALL_TAB_SELECTOR);
    const selected = tab?.closest("[role='tab']")?.getAttribute("aria-selected") === "true";
    if (!tab || selected || tab.dataset.aueClicked === "1") return;
    tab.dataset.aueClicked = "1";
    tab.addEventListener("click", (event) => event.preventDefault(), { once: true });
    tab.click();
    log("send: switched the items page to All");
  }
  function openInFrame(frame, item, status) {
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
        failPanel(status, "Torn would not show your items here.");
        log("send: the items page never loaded in the frame");
        return;
      }
      styleFrame(doc);
      const row = findRow(doc, item.itemId) ?? findRowByName(doc, item.name);
      if (!row) {
        showAllItems(doc);
        const view = doc.defaultView;
        view?.scrollTo(0, doc.documentElement.scrollHeight);
        if (!expired) {
          setTimeout(attempt, POLL_MS);
          return;
        }
        failPanel(status, `Couldn't find ${item.name} in your items.`);
        log("send: item", item.itemId, item.name, "not found on the items page");
        return;
      }
      watchFrameClicks(frame, doc);
      openSendForm(frame, doc, item, status);
      log("send: found item", item.itemId, "in your items");
    };
    attempt();
  }
  function buildFrame(item, status) {
    const frame = document.createElement("iframe");
    frame.className = `aue-send-frame ${WAITING_CLASS}`;
    frame.inert = true;
    frame.src = ITEMS_URL;
    frame.addEventListener("load", () => openInFrame(frame, item, status));
    return frame;
  }
  function buildTrigger(panelId) {
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "aue-send-trigger";
    trigger.title = "Send item";
    trigger.setAttribute("aria-label", "Send item");
    trigger.setAttribute(PANEL_ATTR, panelId);
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", PLANE_PATH);
    path.setAttribute("fill", "currentColor");
    svg.appendChild(path);
    trigger.appendChild(svg);
    return trigger;
  }
  function buildPanel2(panelId, itemId, name, amount) {
    const panel = document.createElement("div");
    panel.className = "aue-send";
    panel.id = panelId;
    panel.hidden = true;
    panel.setAttribute(ITEM_ATTR, itemId);
    panel.setAttribute(NAME_ATTR, name);
    if (amount) panel.setAttribute(AMOUNT_ATTR, amount);
    const status = document.createElement("div");
    status.className = "aue-send-status";
    panel.appendChild(status);
    return panel;
  }
  function openPanel(panel) {
    const status = panel.querySelector(".aue-send-status");
    const itemId = panel.getAttribute(ITEM_ATTR) ?? "";
    const name = panel.getAttribute(NAME_ATTR) ?? "";
    if (!status || !itemId && !name) return;
    panel.hidden = false;
    status.hidden = false;
    status.textContent = name ? `Opening the send form for ${name}...` : "Opening the send form...";
    if (!panel.querySelector("iframe")) {
      holdPage();
      const amount = panel.getAttribute(AMOUNT_ATTR);
      panel.appendChild(buildFrame({ itemId, name, amount }, status));
    }
    log("send: opened item", itemId);
  }
  function holdPage() {
    const x = scrollX;
    const y = scrollY;
    const until = Date.now() + HOLD_PAGE_MS;
    const events = ["wheel", "touchstart", "keydown", "mousedown"];
    const stop = () => {
      removeEventListener("scroll", restore);
      for (const type of events) removeEventListener(type, stop, true);
    };
    const restore = () => {
      if (Date.now() > until) {
        stop();
        return;
      }
      if (scrollX !== x || scrollY !== y) {
        scrollTo(x, y);
        log("send: kept the shop page from jumping");
      }
    };
    addEventListener("scroll", restore);
    for (const type of events) addEventListener(type, stop, true);
    setTimeout(stop, HOLD_PAGE_MS);
  }
  function closePanel(panel) {
    panel.hidden = true;
    panel.querySelector("iframe")?.remove();
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
          const panel = document.getElementById(
            trigger.getAttribute(PANEL_ATTR) ?? ""
          );
          if (!panel) return;
          if (panel.hidden) openPanel(panel);
          else closePanel(panel);
          return;
        }
        const dismissing = target.closest(`[${CLOSE_LINK_ATTR}]`);
        if (dismissing) dropPanel(dismissing.getAttribute(CLOSE_LINK_ATTR) ?? "");
      },
      true
    );
    document.addEventListener("keydown", (event) => {
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
    if (!itemId && !name) {
      message.setAttribute(MARKED_ATTR, "none");
      log("send: neither an item id nor a name in", message.textContent);
      return;
    }
    if (!itemId) log("send: no item id near the message, going by the name", name);
    panelCount += 1;
    const panelId = `aue-send-${panelCount}`;
    message.setAttribute(MARKED_ATTR, panelId);
    const panel = buildPanel2(panelId, itemId, name, amountBought(message));
    const box2 = purchaseBox(message);
    box2.insertAdjacentElement("afterend", panel);
    ensureTrigger(message, panelId);
    log("send: offering item", itemId);
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
      const marked = message.getAttribute(MARKED_ATTR);
      if (!marked) offerSend(message);
      else if (marked !== "none") ensureTrigger(message, marked);
    }
  }
  function installShopSend() {
    if (!on2()) return;
    installClicks();
    scan(document.body);
    let timer = 0;
    new MutationObserver(() => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (on2()) scan(document.body);
      }, SETTLE_MS5);
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
  function start(name, install) {
    try {
      install();
    } catch (error) {
      log("failed to start", name, error);
    }
  }
  if (onGame) {
    start("page jump block", installPageJumpBlock);
    start("request capture", installRequestCapture);
    start("chat pre-hide", hideChatsEarly);
  } else {
    start("wiki theme", installWikiTheme);
  }
  function onReady() {
    start("styles", injectStyles);
    if (!onGame) {
      start("list sort", installListSort);
      return;
    }
    start("per-tab chat", installLocalChat);
    start("news ticker", installNewsTicker);
    start("city shop alert", installCityShopAlert);
    if (location.pathname === PREFERENCES_PATH) {
      start("preferences panel", installPreferencesPanel);
      return;
    }
    if (location.pathname === ITEMS_PATH) start("item send", installItemSend);
    if (SHOP_PATHS.includes(location.pathname)) start("shop send", installShopSend);
    start("list display", installListDisplay);
    start("list sort", installListSort);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady, { once: true });
  } else {
    onReady();
  }
})();
