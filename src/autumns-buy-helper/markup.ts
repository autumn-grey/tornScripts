// Outlining the listings worth buying.
//
// A listing qualifies when its asking price is at or under
//
//     sheet price - (sheet price * maximum buy value)
//
// so a magazine priced at 1,000 on the sheet, with the setting at 30%, is
// only outlined at 700 or less.
//
// ------------------------------------------------------------------ finding
//
// Torn names its page elements with a jumble of letters that changes every
// time the site is updated, so matching on those names would break within
// the month. Instead the script works off the one thing that stays put: every
// item on every one of these pages is drawn with an <img class="torn-item">
// whose alt text is the item's name.
//
// So for each item image, walk up the page one level at a time until reaching
// the first box that also contains a price. That box is the listing - it is
// the tile in the market's item grid, the row of a single seller's offer, or
// the row of an item in a bazaar, without needing to know which of those we
// are looking at.

import { log } from "./debug";
import { normalizeItemName } from "./sheet";
import { readCachedPrices, readMaxBuyValue } from "./settings";
import { GOOD_BUY_CLASS, injectStyles } from "./styles";

/** Every item on these pages is drawn with this image. */
const ITEM_IMAGE = "img.torn-item[alt]";

/**
 * Torn's own price element, when it is there. Preferred over reading numbers
 * out of the text because it is unambiguously the asking price - though the
 * name is half hashed, so only the readable half is matched on.
 */
const PRICE_ELEMENT = '[class*="priceAndTotal"] > span, [class*="price___"]';

/** Torn money as the page renders it: $1,234,567. */
const MONEY = /\$\s?([\d,]+)/g;

/** How far up the page to look for the listing before giving up. */
const MAX_WALK_DEPTH = 8;

function parseMoney(text: string): number[] {
  const found: number[] = [];
  for (const match of text.matchAll(MONEY)) {
    const digits = match[1]?.replace(/,/g, "");
    if (!digits) continue;
    const value = Number(digits);
    if (Number.isFinite(value) && value > 0) found.push(value);
  }
  return found;
}

/**
 * The asking price inside a listing.
 *
 * Torn's own price element is used when present. Otherwise the smallest
 * amount in the box wins: a listing that shows both a price and a total
 * always has the price as the lower of the two, and quantities are not
 * written as money so they are not in the running.
 */
function findPrice(listing: Element): number | null {
  for (const element of listing.querySelectorAll(PRICE_ELEMENT)) {
    const amounts = parseMoney(element.textContent ?? "");
    const first = amounts[0];
    if (first !== undefined) return first;
  }

  const amounts = parseMoney(listing.textContent ?? "");
  if (amounts.length === 0) return null;

  return Math.min(...amounts);
}

/**
 * The box that holds one listing: the nearest ancestor of the item image
 * that also carries a price. Walking up stops early if an ancestor picks up
 * a second item image, since by then it is the whole list rather than a row.
 */
function findListing(image: Element): HTMLElement | null {
  let node = image.parentElement;

  for (let depth = 0; node && depth < MAX_WALK_DEPTH; depth++) {
    if (node.querySelectorAll(ITEM_IMAGE).length > 1) return null;
    if (findPrice(node) !== null) return node;
    node = node.parentElement;
  }

  return null;
}

// ----------------------------------------------------------------- marking

/** The threshold a listing has to be at or under, given the setting. */
export function buyThreshold(sheetPrice: number, maxBuyValue: number): number {
  return sheetPrice - sheetPrice * (maxBuyValue / 100);
}

function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function markListing(
  listing: HTMLElement,
  itemName: string,
  prices: Map<string, number>,
  maxBuyValue: number,
): void {
  const sheetPrice = prices.get(normalizeItemName(itemName));
  const askingPrice = findPrice(listing);

  if (sheetPrice === undefined || askingPrice === null) {
    clearListing(listing);
    return;
  }

  const threshold = buyThreshold(sheetPrice, maxBuyValue);
  const worthBuying = askingPrice <= threshold;

  // Torn redraws these pages constantly. Doing nothing when nothing has
  // changed keeps the script off the critical path of every redraw.
  const signature = `${askingPrice}:${sheetPrice}:${maxBuyValue}`;
  if (listing.dataset.abhMark === signature) return;
  listing.dataset.abhMark = signature;

  listing.classList.toggle(GOOD_BUY_CLASS, worthBuying);

  listing.title = worthBuying
    ? `${itemName}: asking ${formatMoney(askingPrice)}, ` +
      `at or under your ${formatMoney(threshold)} buy price ` +
      `(${formatMoney(sheetPrice)} on your sheet, less ${maxBuyValue}%).`
    : `${itemName}: asking ${formatMoney(askingPrice)}, ` +
      `over your ${formatMoney(threshold)} buy price ` +
      `(${formatMoney(sheetPrice)} on your sheet, less ${maxBuyValue}%).`;

  log("marked", {
    itemName,
    askingPrice,
    sheetPrice,
    maxBuyValue,
    threshold,
    worthBuying,
  });
}

function clearListing(listing: HTMLElement): void {
  if (listing.dataset.abhMark === undefined) return;
  delete listing.dataset.abhMark;
  listing.classList.remove(GOOD_BUY_CLASS);
  listing.removeAttribute("title");
}

/** One pass over everything currently on the page. */
function markPage(): void {
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

// ---------------------------------------------------------------- watching

/** Redraws arrive in bursts, so settle before doing the work. */
const SETTLE_MS = 150;

let settleTimer: number | undefined;

function schedulePass(): void {
  clearTimeout(settleTimer);
  settleTimer = setTimeout(markPage, SETTLE_MS);
}

let watching = false;

/**
 * Start marking up this page and keep it marked up. Safe to call again when
 * moving between bazaars - the watchers are only set up once.
 */
export function installMarkup(): void {
  injectStyles();
  schedulePass();

  if (watching) return;
  watching = true;

  // Opening an item's listings, changing page, sorting: all of it arrives as
  // a redraw rather than a page load.
  new MutationObserver(schedulePass).observe(document.body, {
    childList: true,
    subtree: true,
  });

  // The settings live on another page, so a change usually happens in
  // another tab. This picks it up without needing a reload here.
  addEventListener("storage", (event) => {
    if (event.key?.startsWith("ABH_")) {
      forgetMarks();
      schedulePass();
    }
  });
}

/** Drop every recorded decision so the next pass re-judges from scratch. */
function forgetMarks(): void {
  for (const listing of document.querySelectorAll<HTMLElement>("[data-abh-mark]")) {
    clearListing(listing);
  }
}
