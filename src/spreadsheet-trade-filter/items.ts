import { log } from "./debug";

// Torn's trade list, unhashed and stable, kept together here because these
// are the first things to break when the page changes.

/** Every item in the list is drawn with one of these images. */
const ITEM_IMAGE = 'img[alt][src*="/images/items/"]';

/** The box holding one item. */
const ROW = "li, tr";

/** The item's name, without the amount the list writes either side of it. */
const NAME = ".name-wrap .t-overflow";

/** The amount held, beneath the item's thumbnail. */
const AMOUNT_HELD = ".item-amount";

/** The amount written into the name, for a list that drops the thumbnail. */
const AMOUNT_IN_NAME = /\bx\s?([\d,]+)\b/;

/**
 * Torn's quantity box, named several different ways across the page. Typed
 * boxes only: a single item is offered as a checkbox of the same name.
 */
export const QTY_INPUT = [
  'input[type="text"][name="amount"]',
  'input[type="text"][placeholder*="qty" i]',
  'input[type="text"][placeholder*="quantity" i]',
  'input[type="number"][name="amount"]',
  'input[type="number"][placeholder*="qty" i]',
].join(", ");

/** How far up the page to look for the row before giving up. */
const MAX_WALK_DEPTH = 8;

/** One item as the trade list shows it. */
export interface TradeRow {
  element: HTMLElement;
  name: string;
  /** How many are held, or null when the list does not say. */
  amount: number | null;
  qtyInput: HTMLInputElement | null;
}

/** The row an item image belongs to. */
function findRow(image: Element): HTMLElement | null {
  const row = image.closest<HTMLElement>(ROW);
  if (row) return row;

  let node = image.parentElement;
  for (let depth = 0; node && depth < MAX_WALK_DEPTH; depth++) {
    if (node.querySelector(QTY_INPUT)) return node;
    node = node.parentElement;
  }

  return null;
}

/** A written number, or null when it is not one. */
function parseAmount(text: string | null | undefined): number | null {
  if (!text) return null;
  const value = Number(text.replace(/,/g, "").trim());
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** The item's name as the row displays it. */
function findName(row: HTMLElement, image: Element): string {
  const displayed = row.querySelector(NAME)?.textContent?.trim();
  if (displayed) return displayed;

  const alt = image.getAttribute("alt")?.trim() ?? "";
  return alt.replace(AMOUNT_IN_NAME, "").trim();
}

/** How many of the item the row says are held. */
function findAmount(row: HTMLElement): number | null {
  const beneathThumbnail = parseAmount(row.querySelector(AMOUNT_HELD)?.textContent);
  if (beneathThumbnail !== null) return beneathThumbnail;

  const written = AMOUNT_IN_NAME.exec(row.querySelector(".name-wrap")?.textContent ?? "");
  return parseAmount(written?.[1]);
}

/** The row's quantity box, if it has one the user could type into. */
function findQtyInput(row: HTMLElement): HTMLInputElement | null {
  const input = row.querySelector<HTMLInputElement>(QTY_INPUT);
  if (!input) return null;

  // An equipped or untradable item still carries a box, switched off.
  if (input.disabled || input.readOnly) return null;
  if (!input.offsetParent) return null;

  return input;
}

/** Every item row currently on the page. */
export function readRows(): TradeRow[] {
  const rows: TradeRow[] = [];
  const seen = new Set<HTMLElement>();

  for (const image of document.querySelectorAll(ITEM_IMAGE)) {
    const element = findRow(image);
    // The same row carries the item's image several times over.
    if (!element || seen.has(element)) continue;
    seen.add(element);

    const name = findName(element, image);
    if (!name) continue;

    rows.push({
      element,
      name,
      amount: findAmount(element),
      qtyInput: findQtyInput(element),
    });
  }

  log(`read ${rows.length} item rows`);

  return rows;
}
