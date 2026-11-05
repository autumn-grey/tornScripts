// Rows built from the data a list sends when it answers with JSON, not markup.
//
// Not every list on Torn sends HTML. The auction market replies with
// `{success, list, start, pagination}` and leaves its own script to draw the
// rows, so there is nothing in the response to lift out and splice in. A row
// gets made the other way round instead: take one Torn has already drawn,
// clone it, and write a listing's values into the clone.
//
// Nothing here writes markup or invents a class name. Every row is a copy of
// the page's own, so a restyle is inherited for free, and the page's delegated
// click handlers treat a copy exactly as they treat the original - which is
// what keeps the bid button working on a row this file built.

import { log } from "./debug";

/** One entry out of a JSON list response. */
type Listing = Record<string, unknown>;

/** Knows how to write a listing's values into a row cloned from one page. */
interface RowBuilder {
  /** The page whose rows this can fill. */
  path: string;
  fill(row: HTMLElement, listing: Listing): void;
}

/**
 * The auction market's row, as Torn draws it.
 *
 * Kept together and at the top: these are the first thing to break when Torn
 * changes the page, and a row that silently half-fills is worse than one that
 * does not appear at all.
 */
const AUCTION_PARTS = {
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
} as const;

/**
 * Torn's mark on a row its own sync is looking after.
 *
 * A clone carries it, which tells that sync a row is one of its own when it
 * is not. The attribute stays - the page's styling selects on it being there
 * - but the value changes, so whatever Torn is tracking skips ours.
 */
const SYNC_ATTR = "data-w3b-sync";
const SYNC_MARK = "aue";

/** The class Torn puts on a countdown that is running out. */
const URGENT_CLASS = "t-red";
/** The class marking which plate glow a row has, so an old one can come off. */
const GLOW_PREFIX = "glow-";

/** Returns a value as text, with nothing standing in for null. */
function asText(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

/** Returns a value as a number, or zero if it is not one. */
function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** A person as Torn sends them: a display name and a link to their profile. */
interface Person {
  link?: string;
  name?: string;
}

/** Torn's own breakdown of a countdown, already split into units. */
interface Countdown {
  value?: number;
  d?: number;
  h?: number;
  m?: number;
  s?: number;
  /** The largest unit worth showing: "d", "h", "m" or "s". */
  max?: string;
}

/**
 * Returns the countdown text Torn would show.
 *
 * Two units, largest first, with the trailing space the page's own markup
 * carries. The units come already worked out in the response, so this only
 * has to pick which pair to show.
 */
function countdownText(timer: Countdown): string {
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

/** Writes a name and its profile link into a cell, leaving the label alone. */
function setPerson(cell: Element | null, person: unknown): void {
  const link = cell?.querySelector("a");
  const who = person as Person | undefined;
  if (!link || !who) return;
  link.setAttribute("href", asText(who.link));
  link.textContent = asText(who.name);
}

/**
 * Writes a countdown into one of a row's time cells.
 *
 * The `timer` attribute is what Torn's own ticker reads, so it is set as well
 * as the text: a row built here then counts down with the rest of the list
 * rather than sitting frozen at the moment it arrived.
 */
function setCountdown(
  cell: Element | null,
  timer: Countdown,
  endsAt: string,
): void {
  if (!cell) return;

  const titled = cell.querySelector<HTMLElement>("span[title]");
  if (titled) titled.title = `Ends on ${endsAt}`;

  const time = cell.querySelector(".time");
  if (time) time.setAttribute("timer", String(asNumber(timer.value)));

  // Under an hour Torn shows the countdown in red, which its own `max` field
  // says exactly: minutes or seconds as the largest unit means under an hour.
  const urgent = timer.max === "m" || timer.max === "s";
  const shown = countdownText(timer);
  for (const slot of cell.querySelectorAll(".dh-time, .max-time")) {
    slot.textContent = shown;
    slot.classList.toggle(URGENT_CLASS, urgent);
  }
}

/** Puts an expanding panel back to the state an untouched row has. */
function collapse(panel: Element): void {
  const preloader = panel.querySelector(".ajax-preloader");
  panel.replaceChildren();
  if (preloader) panel.appendChild(preloader.cloneNode(true));
}

/** Returns the srcset Torn builds for an item's picture. */
function itemSrcset(base: string, extension: string): string {
  return [1, 2, 3, 4]
    .map((scale) => {
      const suffix = scale === 1 ? "" : `@${scale}x`;
      return `${base}${suffix}${extension} ${scale}x`;
    })
    .join(", ");
}

/** The auction market: one row per lot, in the order the board shows them. */
const AUCTION_MARKET: RowBuilder = {
  path: "/amarket.php",

  fill(row, listing) {
    const parts = AUCTION_PARTS;
    row.id = asText(listing.ID);

    // The glow is the coloured ring around an item's picture, and says how
    // rare it is. The cloned row carries the template's, so it has to go.
    const plate = row.querySelector(parts.plate);
    if (plate) {
      for (const name of [...plate.classList]) {
        if (name.startsWith(GLOW_PREFIX)) plate.classList.remove(name);
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
          asText(listing.itemSrcSetExt),
        ),
      );
    }

    // What the item-info popup asks about when the row is hovered. `loaded`
    // back to zero, or it shows whatever the template row had fetched.
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

    // Torn sends the bonus icons and the damage and accuracy figures as a
    // ready-made fragment, which is simpler and safer than rebuilding it.
    const bonuses = row.querySelector(parts.bonuses);
    if (bonuses) bonuses.innerHTML = asText(listing.item_image_icons);

    setPerson(row.querySelector(parts.seller), listing.seller);
    // Torn's own spelling, kept so the field is found.
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
        `BID: ${asText(listing.itemName)} (${asText(listing.rare)})`,
      );
    }

    const timer = (listing.timer ?? {}) as Countdown;
    const endsAt = asText(listing.enddate);
    setCountdown(row.querySelector(parts.time), timer, endsAt);
    setCountdown(row.querySelector(parts.mobTime), timer, endsAt);

    // The narrow-screen copies of the same three facts.
    setPerson(row.querySelector(parts.mobSeller), listing.seller);
    setPerson(row.querySelector(parts.mobBidder), listing.hightbidder);
    const mobBid = row.querySelector(parts.mobBid);
    if (mobBid) mobBid.textContent = `Bid: ${topBid}`;

    for (const panel of row.querySelectorAll(parts.panels)) collapse(panel);
  },
};

const BUILDERS: RowBuilder[] = [AUCTION_MARKET];

/** Returns the rows held in a JSON response, or null if there are none to build. */
export function rowsFromJson(
  body: string,
  template: HTMLElement,
): HTMLElement[] | null {
  if (body.trimStart()[0] !== "{") return null;

  let data: { list?: unknown };
  try {
    data = JSON.parse(body) as { list?: unknown };
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

  const rows: HTMLElement[] = [];
  for (const listing of list) {
    if (typeof listing !== "object" || listing === null) continue;
    const row = template.cloneNode(true) as HTMLElement;
    if (row.hasAttribute(SYNC_ATTR)) row.setAttribute(SYNC_ATTR, SYNC_MARK);
    try {
      builder.fill(row, listing as Listing);
    } catch (problem) {
      log("build: a row would not fill -", problem);
      return null;
    }
    rows.push(row);
  }

  log("build:", rows.length, "rows drawn from data");
  return rows;
}
