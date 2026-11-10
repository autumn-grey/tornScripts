// City Shop Alert: while fewer than 100 city shop items have been bought today,
// lights up the City link in the side menu. A shop icon among the status icons
// gives the count in its tooltip, opens the watched stock, and turns green at 100.
//
// The count comes from the "Item shop buy" log since midnight TCT. The
// cityitemsbought personal stat was tried first and lags behind purchases.

import {
  CityShop,
  fetchCityShops,
  forgetStock,
  loadStock,
  readCheckedItems,
  readStock,
} from "./cityStock";
import { log } from "./debug";
import { onlyOurs } from "./ownChanges";
import { isLogEntry } from "./purchaseText";
import {
  API_KEY_SETTING,
  CITY_SHOP_ALERT,
  CITY_SHOP_STOCK,
  PANEL_OPEN_SETTING,
  isEnabled,
  readSetting,
  writeSetting,
} from "./settings";

// Every selector this feature matches on. Checked against the live page.
const SELECTORS = {
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
  bankIcon: 'a[href*="bank.php"]',
};

// The stable prefix of the class Torn puts on a side menu item that wants
// attention (Crimes, Community Events). The hashed suffix is looked up live.
const ATTENTION_CLASS_PREFIX = "attention___";
// The class that turns a side menu item's icon blue, on the icon's span:
// <span class="defaultIcon___GnL0d mobile___nUzYc blue___A2XHG">.
const BLUE_CLASS_PREFIX = "blue___";

/** Returns Bits 'n' Bobs' shopping bag, redrawn in the given colours, as a data URI. */
function bagIcon(top: string, bottom: string, handle: string): string {
  // The viewBox is cropped to the bag so it fills the icon box like Torn's own.
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

/** The bag while there are buys left today. */
const BAG_OPEN = bagIcon("#f2cd92", "#c38d55", "#e9c48c");
/** The bag once all of today's buys are used. */
const BAG_DONE = bagIcon("#a8e67a", "#4f9a2e", "#93d665");
/** The bag while the count or the stock check is on with no API key to use. */
const BAG_NO_KEY = bagIcon("#f28a7e", "#b8392c", "#ec7a6d");

const LOG_URL = "https://api.torn.com/v2/user/log";
// The log type for a city shop purchase, "Item shop buy", from torn/logtypes.
// Abroad purchases are a separate type (4201) and are not counted.
const SHOP_BUY_LOG_ID = 4200;
const DAILY_LIMIT = 100;
const DAY_S = 86_400;

/** How long a fetched count is used before it is fetched again. */
const REFRESH_MS = 2 * 60_000;
/** How often the watched stock is fetched, as shelves empty faster than the count moves. */
const STOCK_REFRESH_MS = 30_000;
// A timer firing a moment early would find the stock not quite stale and skip
// a round, so anything within this of the limit counts as stale.
const STOCK_SLACK_MS = 2_000;
/** How long after a purchase the log is read, giving Torn time to write it. */
const AFTER_BUY_MS = 1_500;
/** The least time between two fetches, so a burst of purchases is one call. */
const MIN_GAP_MS = 5_000;
// Torn's confirmation after a city shop purchase: "You bought 2x Plain Silver
// Ring ..." for several, but "You bought a Plain Silver Ring ..." for one.
const PURCHASE_TEXT = /\byou bought\s+(?:([\d,]+)\s*x\b|an?\s)/i;
/** Where the last fetched count is kept, so every page load does not ask. */
const STATE_SETTING = "CITY_SHOP_STATE";

const SHOPS_PATH = "/shops.php";
/** Where this script's settings panel is, and so where the API key goes. */
const SETTINGS_URL = "/preferences.php";
const ICON_ID = "aue-city-shop-icon";
const TIP_ID = "aue-city-shop-tip";
const STOCK_ID = "aue-city-shop-stock";
const LIT_ATTR = "data-aue-city-lit";
const BLUE_ATTR = "data-aue-city-blue";

/** The count as last fetched. */
interface ShopState {
  /** Midnight TCT, in Unix seconds, of the day the count belongs to. */
  day: number;
  bought: number;
  fetchedAt: number;
}

/** Items bought today, or null when it is not known. */
let bought: number | null = null;
/** When the count was last fetched in this tab. */
let lastFetch = 0;
/** A fetch put off by MIN_GAP_MS, waiting to run. */
let deferred = 0;
/** Starts a refresh and redraws when it is done; set by installCityShopAlert. */
let update: (force?: boolean) => void = () => {};

/** Returns the last midnight TCT in Unix seconds. TCT is UTC. */
function tctMidnight(): number {
  return Math.floor(Date.now() / 1000 / DAY_S) * DAY_S;
}

/** Returns the stored count, or null when there is none for today. */
function readState(): ShopState | null {
  try {
    const parsed = JSON.parse(readSetting(STATE_SETTING, "")) as Partial<ShopState>;
    if (
      typeof parsed.day !== "number" ||
      typeof parsed.bought !== "number" ||
      typeof parsed.fetchedAt !== "number" ||
      parsed.day !== tctMidnight()
    ) {
      return null;
    }
    return parsed as ShopState;
  } catch {
    return null;
  }
}

/** Drops the stored count and stock, which belong to whichever key fetched them. */
export function forgetCityShopCount(): void {
  writeSetting(STATE_SETTING, "");
  forgetStock();
}

/** One log entry, as far as this feature reads it. */
interface LogEntry {
  data?: Record<string, unknown>;
}

/** Returns today's city shop purchase log entries, or throws Torn's error. */
async function fetchShopBuys(key: string, from: number, limit: number): Promise<LogEntry[]> {
  const params = new URLSearchParams({
    log: String(SHOP_BUY_LOG_ID),
    from: String(from),
    limit: String(limit),
    key,
  });
  const response = await fetch(`${LOG_URL}?${params}`, { credentials: "omit" });
  const body = (await response.json()) as { error?: { error?: string }; log?: unknown };
  if (body.error) throw new Error(body.error.error ?? "API error");
  const entries = Array.isArray(body.log) ? (body.log as LogEntry[]) : [];
  log("city shop: log entries", entries);
  return entries;
}

/** Returns how many items one purchase entry bought. */
function quantityOf(entry: LogEntry): number {
  const data = entry.data ?? {};
  for (const field of ["quantity", "qty", "amount"]) {
    const value = data[field];
    if (typeof value === "number") return value;
  }
  // Several items in one purchase come as a list.
  const items = data.items;
  if (Array.isArray(items)) {
    return items.reduce<number>((sum, item) => {
      const row = (item ?? {}) as Record<string, unknown>;
      const qty = row.qty ?? row.quantity ?? 1;
      return sum + (typeof qty === "number" ? qty : 1);
    }, 0);
  }
  return 1;
}

/** Returns why a key cannot read the purchase log or the shop stock, or null when it can. */
export async function checkApiKey(key: string): Promise<string | null> {
  const reason = (error: unknown): string => (error instanceof Error ? error.message : "API error");
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

/** Brings the watched stock up to date, when the stock check is on and has items picked. */
async function refreshStock(force: boolean): Promise<void> {
  const key = readSetting(API_KEY_SETTING, "").trim();
  if (!key || !isEnabled(CITY_SHOP_STOCK) || readCheckedItems().size === 0) return;
  if (document.hidden) return;
  // A purchase takes stock off the shelf, so it asks again then.
  await loadStock(key, force ? 0 : STOCK_REFRESH_MS - STOCK_SLACK_MS);
}

/** Brings the count up to date, asking the API only when the stored one is stale or forced. */
async function refresh(force = false): Promise<void> {
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
  // Yesterday's count is no use, and today's stays until a fetch replaces it.
  bought = stored ? stored.bought : null;

  // A hidden tab has nobody looking at it, so it waits until it is shown.
  if (document.hidden) return;
  const wait = lastFetch + MIN_GAP_MS - Date.now();
  if (wait > 0) {
    // Put off, not dropped: a purchase straight after a fetch still lands.
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
    // A purchase buys at least one item, so 100 entries already reach the limit.
    const entries = await fetchShopBuys(key, day, DAILY_LIMIT);
    const total = entries.reduce((sum, entry) => sum + quantityOf(entry), 0);
    writeSetting(STATE_SETTING, JSON.stringify({ day, bought: total, fetchedAt: Date.now() }));
    bought = total;
    log("city shop:", bought, "bought today");
  } catch (error) {
    log("city shop: could not read the count", error);
  }
}

/** Counts a purchase as soon as Torn confirms it, then checks the log. */
function onPurchase(quantity: number): void {
  // Shown at once, and stored so a refresh in the meantime does not undo it.
  // The log read that follows replaces it with Torn's own figure.
  const stored = readState();
  if (stored) {
    bought = stored.bought + quantity;
    writeSetting(STATE_SETTING, JSON.stringify({ ...stored, bought }));
    apply();
  }
  window.setTimeout(() => update(true), AFTER_BUY_MS);
}

/** Returns the quantity in a purchase confirmation inside a node, or 0. */
function purchaseIn(node: Node): number {
  if (node instanceof Element && node.closest(`#${TIP_ID}, #${ICON_ID}`)) return 0;
  // Opening the log on a shop page would otherwise count every entry in it.
  if (isLogEntry(node)) return 0;
  const match = PURCHASE_TEXT.exec(node.textContent ?? "");
  if (!match) return 0;
  // No number means "a" or "an", which is one.
  return match[1] ? Number(match[1].replace(/,/g, "")) : 1;
}

/** Returns one of Torn's classes, hash and all, or null when it cannot be found. */
function tornClass(prefix: string, scope: string, ruleContext: string): string | null {
  // A prefix alone is no class: only a match with its hash is used.
  const pattern = new RegExp(String.raw`(?:^|\s)(${prefix}\w+)`);
  for (const element of document.querySelectorAll(`${scope}[class*="${prefix}"]`)) {
    const match = pattern.exec(element.getAttribute("class") ?? "");
    if (match?.[1]) return match[1];
  }
  // Nothing on the page uses it right now, so it is read off Torn's
  // stylesheets, from a rule that also names the context (other modules have
  // their own classes with the same prefix).
  const rulePattern = new RegExp(String.raw`\.(${prefix}\w+)`);
  for (const sheet of document.styleSheets) {
    let rules: CSSRuleList;
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

/** Returns the element Torn puts the attention class on, for the City link. */
function cityNavItem(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>(SELECTORS.cityItem) ??
    document
      .querySelector(SELECTORS.cityLink)
      ?.closest<HTMLElement>(SELECTORS.cityItemFromLink) ??
    null
  );
}

/** Adds or takes off a Torn class this feature lends an element, leaving Torn's own alone. */
function lendClass(element: HTMLElement, on: boolean, attr: string, find: () => string | null): void {
  const owned = element.getAttribute(attr);
  if (on) {
    // Torn's redraws reset the class list, so the class is put back each time.
    if (owned) {
      if (!element.classList.contains(owned)) element.classList.add(owned);
      return;
    }
    const name = find();
    // Torn already using the class for its own reason is left alone.
    if (!name || element.classList.contains(name)) return;
    element.classList.add(name);
    element.setAttribute(attr, name);
  } else if (owned) {
    element.classList.remove(owned);
    element.removeAttribute(attr);
  }
}

/** Lights the City link and turns its icon blue, or puts both back as Torn drew them. */
function setCityLit(lit: boolean): void {
  const item = cityNavItem();
  if (!item) return;

  lendClass(item, lit, LIT_ATTR, () =>
    tornClass(ATTENTION_CLASS_PREFIX, "#sidebarroot ", "area-"),
  );
  const icon = item.querySelector<HTMLElement>(SELECTORS.navIcon);
  if (icon) {
    lendClass(icon, lit, BLUE_ATTR, () =>
      tornClass(BLUE_CLASS_PREFIX, `#sidebarroot ${SELECTORS.navIcon}`, "defaultIcon___"),
    );
  }
}

// Two boxes hang off the bag: a small grey one above it on hover (or a first
// tap), styled like Torn's own status icon tooltips, with the count; and a
// list below it on click (or a second tap), with the watched stock.

/** Returns one of the bag's boxes, made on first use. */
function box(id: string): HTMLElement {
  let element = document.getElementById(id);
  if (!element) {
    element = document.createElement("div");
    element.id = id;
    element.hidden = true;
    document.body.appendChild(element);
  }
  return element;
}

/** Returns the checked items' stock, by shop, or an empty list when the stock check is off. */
function watchedStock(): CityShop[] {
  if (!isEnabled(CITY_SHOP_STOCK)) return [];
  const checked = readCheckedItems();
  if (checked.size === 0) return [];
  return (readStock()?.shops ?? [])
    .map((shop) => ({ ...shop, items: shop.items.filter((item) => checked.has(item.id)) }))
    .filter((shop) => shop.items.length > 0);
}

/** Whether the purchase count or the stock check is on but has no API key to fetch with. */
function needsKey(): boolean {
  const wanted = isEnabled(CITY_SHOP_ALERT) || isEnabled(CITY_SHOP_STOCK);
  return wanted && readSetting(API_KEY_SETTING, "").trim() === "";
}

/** Opens the settings panel on the preferences page, where the key is entered. */
function openSettings(): void {
  writeSetting(PANEL_OPEN_SETTING, "1");
  location.assign(SETTINGS_URL);
}

/** Fills the hover box with the count, or with what the stock check is missing. */
function fillTip(tip: HTMLElement): void {
  const title = document.createElement("b");
  title.textContent = "City Shops";
  if (needsKey()) {
    // The count needs the key too, so without one there is nothing to show
    // but the way to fix it. The icon itself is what "click here" means.
    const message = document.createElement("div");
    message.className = "aue-tip-message";
    const here = document.createElement("span");
    here.className = "aue-tip-link";
    here.textContent = "click here";
    message.append(
      "This feature requires an API key. Please ",
      here,
      " to open Autumn's UI Enhancer settings.",
    );
    tip.replaceChildren(title, message);
    return;
  }
  const count = document.createElement("div");
  count.textContent = `${bought ?? 0}/${DAILY_LIMIT} items bought today`;
  tip.replaceChildren(title, count);
}

/** Fills the stock list with the watched items, by shop, each shop linking to its page. */
function fillStock(list: HTMLElement): void {
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
      // A figure the API reply did not give is shown as unknown, not as 0.
      stock.textContent = typeof item.stock === "number" ? item.stock.toLocaleString() : "?";
      row.append(name, stock);
      group.appendChild(row);
    }
    list.appendChild(group);
  }
}

/** Refills a box, touching it only when its contents differ. */
function refill(element: HTMLElement, fill: (target: HTMLElement) => void): void {
  const fresh = document.createElement("div");
  // Whatever the stock data holds, the box must still open.
  try {
    fill(fresh);
  } catch (error) {
    log("city shop: could not fill", element.id, error);
  }
  // Rewriting it unchanged would wake the page observer, which calls apply(),
  // which would rewrite it again, every 120 ms for as long as it is open.
  if (fresh.innerHTML !== element.innerHTML) element.replaceChildren(...fresh.childNodes);
}

/** Shows the count above the icon, its arrow pointing down at it. */
function showTip(icon: HTMLElement): void {
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
  // The arrow stays on the icon when the box is pushed in from a screen edge.
  tip.style.setProperty("--aue-arrow-left", `${centre - left}px`);
}

/** Hides the count. */
function hideTip(): void {
  const tip = document.getElementById(TIP_ID);
  if (tip) tip.hidden = true;
}

/** Opens the stock list below the icon. */
function openStock(icon: HTMLElement): void {
  hideTip();
  const list = box(STOCK_ID);
  refill(list, fillStock);
  list.hidden = false;

  const place = icon.getBoundingClientRect();
  const width = list.offsetWidth;
  const left = Math.min(
    Math.max(4, place.left + place.width / 2 - width / 2),
    innerWidth - width - 4,
  );
  list.style.left = `${left + scrollX}px`;
  list.style.top = `${place.bottom + scrollY + 6}px`;
}

/** Closes the stock list. */
function closeStock(): void {
  const list = document.getElementById(STOCK_ID);
  if (list) list.hidden = true;
}

/** Returns the status icon, made on first use. */
function buildIcon(): HTMLElement {
  const item = document.createElement("li");
  item.id = ICON_ID;

  // No href: on mobile a tap that reached the City left before the stock list
  // could open. The shop links inside the list do the navigating instead.
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
  link.addEventListener("pointerdown", (event) => (touch = event.pointerType === "touch"));
  link.addEventListener("pointerenter", (event) => {
    if (event.pointerType !== "touch") showTip(link);
  });
  link.addEventListener("pointerleave", (event) => {
    if (event.pointerType !== "touch") hideTip();
  });
  link.addEventListener("click", (event) => {
    event.preventDefault();
    // On a touch screen the first tap shows the count, the second the list.
    if (touch && box(TIP_ID).hidden && box(STOCK_ID).hidden) {
      showTip(link);
      return;
    }
    if (needsKey()) {
      openSettings();
      return;
    }
    // With nothing to list, a second tap just puts the count away.
    if (watchedStock().length === 0) {
      if (touch) hideTip();
      return;
    }
    if (box(STOCK_ID).hidden) openStock(link);
    else closeStock();
  });

  return item;
}

/** Puts the icon after the faction icon, or before Bank Investment. */
function placeIcon(): void {
  const list = document.querySelector<HTMLElement>(SELECTORS.statusList);
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

  // Sized from a neighbour, as the icons are smaller on mobile than on desktop.
  const neighbour = faction ?? bank ?? list.querySelector(`li:not(#${ICON_ID})`);
  if (neighbour) {
    const style = getComputedStyle(neighbour);
    if (icon.style.width !== style.width) icon.style.width = style.width;
    if (icon.style.height !== style.height) icon.style.height = style.height;
    if (icon.style.margin !== style.margin) icon.style.margin = style.margin;
  }
}

/** Brings the City link and the icon in line with the count. */
function apply(): void {
  const missingKey = needsKey();
  const known = isEnabled(CITY_SHOP_ALERT) && bought !== null && !missingKey;
  const left = known && (bought ?? 0) < DAILY_LIMIT;
  setCityLit(left);
  // Without a key the icon still shows, so the message saying so has somewhere to be.
  if (known || missingKey) {
    placeIcon();
    // The icon stays once the day's buys are used, but turns green.
    const link = document.querySelector<HTMLElement>(`#${ICON_ID} a`);
    const state = missingKey ? "nokey" : left ? "open" : "done";
    // Compared by a flag: browsers rewrite a style's url() text when read back.
    if (link && link.dataset.bag !== state) {
      link.dataset.bag = state;
      const bag = missingKey ? BAG_NO_KEY : left ? BAG_OPEN : BAG_DONE;
      link.style.backgroundImage = `url("${bag}")`;
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

/** Shows when today's city shop allowance has not been used up. */
export function installCityShopAlert(): void {
  // The stock check on its own still needs the icon, if only to ask for a key.
  if (!isEnabled(CITY_SHOP_ALERT) && !isEnabled(CITY_SHOP_STOCK)) return;

  update = (force = false): void =>
    void Promise.all([refresh(force), refreshStock(force)]).then(apply);
  update();

  // A purchase shows Torn's confirmation on the shop page, so the count
  // moves then rather than at the next two-minute refresh.
  if (location.pathname === SHOPS_PATH) {
    new MutationObserver((records) => {
      for (const record of records) {
        // A message box Torn reuses gets new text rather than new nodes.
        const nodes = record.type === "characterData" ? [record.target] : record.addedNodes;
        for (const node of nodes) {
          const quantity = purchaseIn(node.nodeType === Node.TEXT_NODE ? (node.parentNode ?? node) : node);
          if (quantity > 0) {
            log("city shop: purchase seen", quantity);
            onPurchase(quantity);
            return;
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  // Ticks at the stock's pace; the count still only asks once its own REFRESH_MS is up.
  setInterval(() => update(), STOCK_REFRESH_MS);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) update();
  });

  // A click or tap anywhere else puts both boxes away.
  document.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest(`#${ICON_ID}, #${STOCK_ID}`)) return;
    hideTip();
    closeStock();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeStock();
  });

  // Torn redraws the side menu, taking the icon and the class with it.
  let timer = 0;
  new MutationObserver((records) => {
    if (onlyOurs(records)) return;
    clearTimeout(timer);
    timer = window.setTimeout(apply, 120);
  }).observe(document.body, { childList: true, subtree: true });
}
