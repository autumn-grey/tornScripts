// A send option after a shop purchase, hosting Torn's own item page send form.
//
// Parked from 0.18.6 to 0.20.7. It broke because the items page opens on the
// category last used, so the bought item was often not on it. The frame now
// switches to All, and keeps hiding the rest of the list as more rows load.

import { readStock } from "./cityStock";
import { log } from "./debug";
import { isLogEntry } from "./purchaseText";
import {
  AMOUNT_FIELD_SELECTOR,
  TEXT_FIELD_SELECTOR,
  USER_FIELD_SELECTOR,
  fillField,
  recipientText,
} from "./recipient";
import { PREFERRED_RECIPIENT, isEnabled } from "./settings";

/** The shop pages this feature runs on. */
export const SHOP_PATHS = ["/shops.php", "/bigalgunshop.php"];

// Do not open the frame at item.php#all-items. A "#" address makes the browser
// scroll to that spot, in the page around the frame as well, and that was the
// shop page jumping when the plane was clicked. The All tab is clicked instead.
const ITEMS_URL = "https://www.torn.com/item.php";
/** The items page's "All" tab: <a href="#all-items" class="all-category-icon ...">. */
const ALL_TAB_SELECTOR = "a[href='#all-items']";
/** Where a panel keeps what was bought. */
const ITEM_ATTR = "data-aue-item";
const AMOUNT_ATTR = "data-aue-amount";
const NAME_ATTR = "data-aue-name";
/** Ties an aeroplane to the panel it opens. */
const PANEL_ATTR = "data-aue-panel";
/** Marks a purchase message that has already been given a send option. */
const MARKED_ATTR = "data-aue-send";
/** The text Torn puts on a purchase message. */
const BOUGHT_TEXT = /\byou (?:bought|purchased|have bought)\b/i;
/**
 * The quantity and the name in a purchase message, such as "You bought 1x
 * Plain Silver Ring at $100 each for a total of $100". The "at $100 each" is
 * left out of the name, or the item cannot be found by it.
 */
const BOUGHT_ITEM =
  /\byou (?:bought|purchased|have bought)\s+(?:(?:a|an|the)\s+)?(?:([\d,]+)\s*x?\s+)?(.+?)(?:\s+at\s+\$[\d,]+\s+each)?\s+for\s/i;
/** Longer than this is the page rather than a single message. */
const MESSAGE_MAX_LENGTH = 300;
/** The item id in an item image's path. */
const ITEM_IMAGE = /\/items\/(\d+)\//;
/** How far up from a message the item row is looked for. */
const ANCESTOR_LIMIT = 6;
/** How long the items page is given to show the bought item. */
const FRAME_READY_MS = 20000;
const POLL_MS = 250;
/** Settles a burst of Torn's own rendering before the page is read again. */
const SETTLE_MS = 150;
/** How many polls a row's send form is given to appear. */
const FORM_TRIES = 28;
/** Polls between one press of a row's send control and the next. */
const FORM_CLICK_EVERY = 3;

/** How high above a purchase message the shop's own block is looked for. */
const BOX_LIMIT = 8;
/** As high as that walk goes: past this it is out of the page's content. */
const CONTENT_ROOT_SELECTOR = ".content-wrapper, #mainContainer";
/** Longer than this is the item's row rather than its send form. */
const SEND_PANEL_MAX_LENGTH = 220;
/** How often an open panel checks that its form is still there. */
const FORM_WATCH_MS = 500;
/** Ties a dismiss button to the panel it ends. */
const CLOSE_LINK_ATTR = "data-aue-closes";
/** How high above a message its own dismiss button is looked for. */
const CLOSE_LIMIT = 4;
/** Torn's own dismiss button on a purchase message. */
const MESSAGE_CLOSE_SELECTOR = "button[aria-label='Close' i], .close-icon";
/** The options Torn offers beside a purchase message. */
const OPTION_TEXT = /your items|equip|use item|read|open|start|abroad/i;
/** The row for one item on the items page. */
const ROW_SELECTOR = "li, tr";
/** The label Torn puts on the control that opens a send form. */
const SEND_TEXT = /^\s*send\s*$/i;
/** Anything on the items page that can be clicked. */
const CLICKABLE_SELECTOR = "button, a, li, span, div, [role='button']";
/** The control that opens a row's send form. */
const SEND_SELECTORS = [
  "[aria-label='Send' i]",
  "[title='Send' i]",
  "a[href*='send' i]",
  "[class*='send' i]",
];
/** Longer than this is a list rather than one item's row. */
const ROW_MAX_LENGTH = 300;
/** Torn's send aeroplane. */
const PLANE_PATH = "M2 21l21-9L2 3v7l15 2-15 2v7z";
const SVG_NS = "http://www.w3.org/2000/svg";
/** Marks Torn's name suggestions, hidden until the player clicks the recipient box. */
const QUIET_ATTR = "data-aue-quiet-list";
/** The recipient box's drop-down of suggested names. */
const SUGGESTIONS_SELECTOR = ".autocomplete-wrap";
/** Put on the framed page once the player has used the recipient box. */
const ENGAGED_ATTR = "data-aue-recipient-used";
/** How long after the plane is clicked the shop page is held where it was. */
const HOLD_PAGE_MS = 4000;
/** The frame's height is kept between these, fitted to what it shows. */
const FRAME_MIN_HEIGHT = 50;
const FRAME_MAX_HEIGHT = 220;
/** Put on the frame until its send form is ready to look at. */
const WAITING_CLASS = "aue-send-frame-waiting";
/** Put on the framed page while only the bought item is on show. */
const ONLY_CLASS = "aue-send-only";
/** Put on everything the framed page is hiding. */
const HIDE_CLASS = "aue-send-hidden";
/** Put on the wrappers the send form is left sitting in. */
const KEEP_CLASS = "aue-send-kept";
/** The stylesheet the framed items page is given. */
const FRAME_CSS = `
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

/** How many panels this page has made. */
let panelCount = 0;

/** Whether the feature is switched on. */
function on(): boolean {
  return isEnabled(PREFERRED_RECIPIENT);
}

/** Returns the item id carried by an element or its contents. */
function itemIdIn(scope: Element): string | null {
  const tagged = scope.matches("[data-item], [data-itemid]")
    ? scope
    : scope.querySelector("[data-item], [data-itemid]");
  const attribute =
    tagged?.getAttribute("data-item") ??
    tagged?.getAttribute("data-itemid") ??
    null;
  if (attribute && /^\d+$/.test(attribute)) return attribute;

  const image = scope.querySelector<HTMLImageElement>("img[src*='/items/']");
  const match = ITEM_IMAGE.exec(image?.getAttribute("src") ?? "");
  return match?.[1] ?? null;
}

/** Returns the item id of the row a purchase message sits in. */
function itemIdFor(message: Element): string | null {
  let node: Element | null = message;
  for (let depth = 0; node && depth < ANCESTOR_LIMIT; depth += 1) {
    const id = itemIdIn(node);
    if (id) return id;
    node = node.parentElement;
  }
  return null;
}

/** Returns the row of options Torn offers beside a purchase message. */
function findOptionRow(message: Element): Element | null {
  let node: Element | null = message;
  for (let depth = 0; node && depth < ANCESTOR_LIMIT; depth += 1) {
    const links = Array.from(node.querySelectorAll("a"));
    const option = links.find((link) => OPTION_TEXT.test(link.textContent ?? ""));
    if (option?.parentElement) return option.parentElement;
    node = node.parentElement;
  }
  return null;
}

/** Returns the row for an item on the items page. */
function findRow(doc: Document, itemId: string): Element | null {
  // No id means the caller goes by the name instead.
  if (!itemId) return null;
  const tagged = doc.querySelector(
    `[data-item="${itemId}"], [data-itemid="${itemId}"]`,
  );
  if (tagged) return tagged.closest(ROW_SELECTOR) ?? tagged;

  const images = doc.querySelectorAll<HTMLImageElement>("img[src*='/items/']");
  for (const image of images) {
    const match = ITEM_IMAGE.exec(image.getAttribute("src") ?? "");
    if (match && match[1] === itemId) {
      return image.closest(ROW_SELECTOR) ?? image.parentElement;
    }
  }
  return null;
}

/** Returns the control that opens a row's send form. */
function findSendControl(row: Element): HTMLElement | null {
  for (const scope of [row, row.nextElementSibling, row.parentElement]) {
    if (!scope) continue;

    let best: HTMLElement | null = null;
    const clickable = scope.querySelectorAll<HTMLElement>(CLICKABLE_SELECTOR);
    for (const element of clickable) {
      if (!SEND_TEXT.test(element.textContent ?? "")) continue;
      if (!best || best.contains(element)) best = element;
    }
    if (best) return best;

    for (const selector of SEND_SELECTORS) {
      const control = scope.querySelector<HTMLElement>(selector);
      if (control) return control;
    }
  }
  return null;
}

/** Opens a row's own actions, which is where its send control lives. */
function expandRow(row: Element): void {
  const handle =
    row.querySelector<HTMLElement>("img[src*='/items/']") ??
    (row as HTMLElement);
  handle.click();
}

/** Returns the quantity a purchase message reports. */
function amountBought(message: Element): string | null {
  const match = BOUGHT_ITEM.exec(message.textContent ?? "");
  if (!match) return null;
  // "You bought a Plain Silver Ring" carries no number, and means one.
  const amount = match[1]?.replace(/,/g, "") ?? "1";
  return /^[1-9]\d*$/.test(amount) ? amount : null;
}

/** Returns the item name a purchase message reports. */
function nameBought(message: Element): string {
  const match = BOUGHT_ITEM.exec(message.textContent ?? "");
  return match?.[2]?.replace(/\s+/g, " ").trim() ?? "";
}

/** Returns the row for an item on the items page, found by its name. */
function findRowByName(doc: Document, name: string): Element | null {
  if (!name) return null;
  const wanted = name.toLowerCase();
  let best: Element | null = null;
  for (const row of doc.querySelectorAll(ROW_SELECTOR)) {
    const text = (row.textContent ?? "").toLowerCase();
    if (!text.includes(wanted) || text.length > ROW_MAX_LENGTH) continue;
    if (!best || text.length < (best.textContent ?? "").length) best = row;
  }
  return best;
}

/** Returns the element holding a row's send form. */
function sendFormScope(row: Element): Element {
  if (row.querySelector(TEXT_FIELD_SELECTOR)) return row;
  const next = row.nextElementSibling;
  if (next?.querySelector(TEXT_FIELD_SELECTOR)) return next;
  return row;
}

/**
 * Whether something is an element, for nodes in the framed page as well.
 *
 * Not instanceof Element: the frame has its own Element, so a node from it
 * is never an instance of this page's, and every click in the frame was
 * ignored that way.
 */
function isElement(value: unknown): value is Element {
  return typeof value === "object" && value !== null && (value as Node).nodeType === Node.ELEMENT_NODE;
}

/**
 * Hides the recipient box's suggestion list until the player clicks the box.
 *
 * Typing the name in makes Torn search and open the list, and a click
 * elsewhere did not close it. Hiding it leaves Torn's own state alone, so
 * the list works as normal once the player uses the box. Never closed by
 * picking a suggestion, which is the player's to do.
 */
function quietSuggestions(scope: Element): void {
  const doc = scope.ownerDocument;
  if (doc.documentElement.hasAttribute(ENGAGED_ATTR)) return;
  // Looked up afresh each time, as Torn's redraws can replace the box.
  const input = scope.querySelector<HTMLInputElement>(USER_FIELD_SELECTOR);
  if (!input) return;
  // A jQuery autocomplete: the box is <input id="ac-search-0"> and its
  // drop-down, tabs and all, is <div class="autocomplete-wrap"
  // id="ac-search-0-cont"> right beside it.
  const dropdown =
    (input.id ? doc.getElementById(`${input.id}-cont`) : null) ??
    input.parentElement?.querySelector(SUGGESTIONS_SELECTOR) ??
    null;
  if (dropdown && !dropdown.hasAttribute(QUIET_ATTR)) dropdown.setAttribute(QUIET_ATTR, "");
}

/**
 * Shows the suggestion list again once the player uses the recipient box.
 *
 * Only on the player's own click or key press. Not on focus: Torn moves the
 * cursor into the box itself a moment after the form opens, which brought
 * the list straight back.
 */
function wakeSuggestions(doc: Document): void {
  if (doc.documentElement.dataset.aueWakeWatched === "1") return;
  doc.documentElement.dataset.aueWakeWatched = "1";
  const wake = (event: Event): void => {
    const target = event.target;
    if (!event.isTrusted || !isElement(target) || !target.matches(USER_FIELD_SELECTOR)) return;
    doc.documentElement.setAttribute(ENGAGED_ATTR, "");
    for (const hidden of doc.querySelectorAll(`[${QUIET_ATTR}]`)) hidden.removeAttribute(QUIET_ATTR);
  };
  doc.addEventListener("pointerdown", wake, true);
  doc.addEventListener("keydown", wake, true);
}

/** Fills in the recipient and the quantity on a row's send form. */
function fillSendForm(row: Element, amount: string | null): void {
  const scope = sendFormScope(row);
  const boxes = Array.from(
    scope.querySelectorAll<HTMLInputElement>(TEXT_FIELD_SELECTOR),
  ).filter((box) => !box.disabled && !box.readOnly);
  if (boxes.length === 0) return;

  const recipient = recipientText();
  const userBox =
    scope.querySelector<HTMLInputElement>(USER_FIELD_SELECTOR) ?? boxes[0];
  const amountBox =
    scope.querySelector<HTMLInputElement>(AMOUNT_FIELD_SELECTOR) ??
    (boxes[1] === userBox ? boxes[0] : boxes[1]);

  if (recipient && userBox && userBox.value === "") {
    fillField(userBox, recipient);
    log("send: recipient", recipient);
    // Typing the name opens Torn's suggestions; they stay hidden until the
    // player clicks the box. The form watcher keeps them hidden as they load.
    wakeSuggestions(userBox.ownerDocument);
    quietSuggestions(scope);
  }
  if (amount && amountBox && amountBox !== userBox) {
    fillField(amountBox, amount);
    log("send: amount", amount);
  }
}

/** Shows nothing on the framed page but one element. */
function isolateRow(doc: Document, target: Element, toTop = true): void {
  const keep = new Set<Element>();
  for (let node: Element | null = target; node; node = node.parentElement) {
    keep.add(node);
  }

  // Only what is missing is added: this runs on every change Torn makes, and
  // rewriting a class that is already there would count as one.
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

/** Returns the send form on its own, without the row it belongs to. */
function findSendPanel(row: Element): Element | null {
  const scope = sendFormScope(row);
  const user =
    scope.querySelector<HTMLInputElement>(USER_FIELD_SELECTOR) ??
    scope.querySelector<HTMLInputElement>(TEXT_FIELD_SELECTOR);
  if (!user) return null;

  let best: Element = user;
  for (let node = user.parentElement; node && node !== row; ) {
    if ((node.textContent ?? "").length > SEND_PANEL_MAX_LENGTH) break;
    best = node;
    node = node.parentElement;
  }
  return best;
}

/**
 * Keeps only the form on show while the panel is open, sized to fit.
 *
 * Do not close the panel when the form goes: pressing Send swaps it for
 * Torn's "are you sure" step, and closing then was why nothing was sent.
 * Whatever takes the form's place, in the element that held it, is shown
 * instead, and the panel stays until it is put away.
 */
function watchForm(frame: HTMLIFrameElement, doc: Document, form: Element): void {
  const panel = frame.closest<HTMLElement>(".aue-send");
  if (!panel) return;
  const holder = form.parentElement;
  let shown = form;

  /** Puts the hiding back over whatever Torn has just changed. */
  const keepHidden = (): void => {
    if (!shown.isConnected && holder?.isConnected) {
      shown = holder;
      log("send: the form was replaced, showing what took its place");
    }
    if (!shown.isConnected) return;
    // The list goes on loading rows after the form is shown, and those
    // arrive without the class that hides them.
    isolateRow(doc, shown, false);
    quietSuggestions(shown);
    fitFrame(frame, shown);
  };

  // On every change, not on a timer: an observer's answer lands before the
  // browser draws the next frame, where a timer let the list flash up first.
  const FrameObserver = doc.defaultView?.MutationObserver ?? MutationObserver;
  const observer = new FrameObserver(keepHidden);
  observer.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class"],
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

/**
 * Sizes the frame to what the framed page is showing.
 *
 * Measured from the shown element and everything in it, not from the page:
 * a page is never shorter than the frame it is in, so it could not shrink,
 * and the suggestion list under the recipient box hangs outside its parent.
 */
function fitFrame(frame: HTMLIFrameElement, shown: Element): void {
  const view = shown.ownerDocument.defaultView;
  const scrolled = view?.scrollY ?? 0;
  let bottom = 0;
  for (const element of [shown, ...shown.querySelectorAll("*")]) {
    const box = element.getBoundingClientRect();
    if (box.height > 0) bottom = Math.max(bottom, box.bottom + scrolled);
  }
  const height = Math.min(FRAME_MAX_HEIGHT, Math.max(FRAME_MIN_HEIGHT, Math.ceil(bottom) + 6));
  const wanted = `${height}px`;
  if (frame.style.height !== wanted) frame.style.height = wanted;
}

interface FramedItem {
  itemId: string;
  name: string;
  amount: string | null;
}

/** Shows the frame, now that there is something worth looking at in it. */
function showFrame(frame: HTMLIFrameElement, status: HTMLElement): void {
  frame.classList.remove(WAITING_CLASS);
  frame.inert = false;
  status.hidden = true;
}

/** Says why a panel has nothing to show, and offers the items page instead. */
function failPanel(status: HTMLElement, reason: string): void {
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

/** Whether a row already shows its send form. */
function sendFormOpen(row: Element): boolean {
  return sendFormScope(row).querySelector(TEXT_FIELD_SELECTOR) !== null;
}

/** Opens the bought item's send form and fills it in, then shows the frame. */
/** Torn's own Close on the send form, and on the "You sent ..." line after it. */
const FRAME_CLOSE_SELECTOR = ".close-icon, a, button";
const CLOSE_TEXT = /^\s*close\s*$/i;

/**
 * Makes the framed page's clicks behave as they would on the items page itself.
 *
 * Torn's Close only closes its own box inside the frame, which left the
 * panel open on the rest of the page, so it puts the panel away too. And a
 * link that goes somewhere, such as the recipient's profile after a send,
 * opens in the whole window rather than inside the frame. Links that are
 * only buttons ("#", or handled by Torn's own script) are left alone.
 */
function watchFrameClicks(frame: HTMLIFrameElement, doc: Document): void {
  if (doc.documentElement.dataset.aueClicksWatched === "1") return;
  doc.documentElement.dataset.aueClicksWatched = "1";

  // Capture phase, on the way in: Torn's own handlers stop these clicks from
  // going any further, so listening on the way back out heard nothing.
  doc.addEventListener("click", (event) => {
    const target = event.target;
    if (!isElement(target)) return;

    const control = target.closest(FRAME_CLOSE_SELECTOR);
    const isClose =
      control !== null &&
      (control.matches(".close-icon") ||
        CLOSE_TEXT.test(control.textContent ?? "") ||
        /^close$/i.test(control.getAttribute("aria-label") ?? ""));
    if (isClose) {
      const panel = frame.closest<HTMLElement>(".aue-send");
      // After Torn has had the click, so its own state is tidied first.
      setTimeout(() => panel && closePanel(panel), 0);
      log("send: Torn's Close pressed, putting the panel away");
      return;
    }

    // Pointed at the whole window rather than followed by hand, so the
    // browser opens it there whatever Torn's own handlers do with the click.
    const link = target.closest<HTMLAnchorElement>("a[href]");
    const href = link?.getAttribute("href") ?? "";
    if (!link || href === "" || href.startsWith("#") || href.startsWith("javascript:")) return;
    if (link.target !== "_blank" && link.target !== "_top") {
      link.target = "_top";
      log("send: a link in the frame will open in the whole window", href);
    }
  }, true);
}

function openSendForm(
  frame: HTMLIFrameElement,
  doc: Document,
  item: FramedItem,
  status: HTMLElement,
): void {
  let polls = 0;

  const step = (): void => {
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

/** Puts this script's stylesheet on the framed items page. */
function styleFrame(doc: Document): void {
  if (doc.getElementById("aue-send-frame-styles")) return;
  const style = doc.createElement("style");
  style.id = "aue-send-frame-styles";
  style.textContent = FRAME_CSS;
  (doc.head ?? doc.documentElement).appendChild(style);
}

/**
 * Switches the framed items page to its "All" tab, once.
 *
 * The items page opens on whichever category was used last, and only that
 * category's items are on the page. This is what broke the send option a
 * day after it was written: it worked while Jewelry happened to be open.
 */
function showAllItems(doc: Document): void {
  const tab = doc.querySelector<HTMLElement>(ALL_TAB_SELECTOR);
  const selected = tab?.closest("[role='tab']")?.getAttribute("aria-selected") === "true";
  if (!tab || selected || tab.dataset.aueClicked === "1") return;
  tab.dataset.aueClicked = "1";
  // The tab is a "#all-items" link; followed, it would scroll the shop page
  // round the frame. Its own click handler still runs and switches the tab.
  tab.addEventListener("click", (event) => event.preventDefault(), { once: true });
  tab.click();
  log("send: switched the items page to All");
}

/** Brings the bought item's send form into view inside the frame. */
function openInFrame(
  frame: HTMLIFrameElement,
  item: FramedItem,
  status: HTMLElement,
): void {
  const started = Date.now();

  const attempt = (): void => {
    let doc: Document | null = null;
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
    // Do not type into a search box to find it: the first "search..." box on
    // the items page is the header's player search, not a filter of items.
    if (!row) {
      showAllItems(doc);
      // The list loads more of itself as it is scrolled, so it is taken to
      // the bottom until the item turns up.
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

/** Returns the frame the bought item's send form is taken from. */
function buildFrame(item: FramedItem, status: HTMLElement): HTMLIFrameElement {
  const frame = document.createElement("iframe");
  frame.className = `aue-send-frame ${WAITING_CLASS}`;
  // Inert until the form is shown: the items page takes the focus as it
  // loads, and the browser scrolled the shop page to it, which was the jump.
  frame.inert = true;
  frame.src = ITEMS_URL;
  frame.addEventListener("load", () => openInFrame(frame, item, status));
  return frame;
}

/** Returns the aeroplane that opens a panel. */
function buildTrigger(panelId: string): HTMLElement {
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

/** Returns the panel holding the framed send form. */
function buildPanel(
  panelId: string,
  itemId: string,
  name: string,
  amount: string | null,
): HTMLElement {
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

/** Shows the framed send form for the item a panel was built for. */
function openPanel(panel: HTMLElement): void {
  const status = panel.querySelector<HTMLElement>(".aue-send-status");
  const itemId = panel.getAttribute(ITEM_ATTR) ?? "";
  const name = panel.getAttribute(NAME_ATTR) ?? "";
  if (!status || (!itemId && !name)) return;

  panel.hidden = false;
  status.hidden = false;
  status.textContent = name
    ? `Opening the send form for ${name}...`
    : "Opening the send form...";
  if (!panel.querySelector("iframe")) {
    holdPage();
    const amount = panel.getAttribute(AMOUNT_ATTR);
    panel.appendChild(buildFrame({ itemId, name, amount }, status));
  }
  log("send: opened item", itemId);
}

/**
 * Keeps the shop page where it is while the framed items page loads.
 *
 * Something inside the frame taking the focus as it loads makes the browser
 * scroll the shop page to it, which is the jump on clicking the plane. Any
 * scroll of the player's own - wheel, touch, keys, the scrollbar - ends the
 * hold at once, so it never fights them.
 */
function holdPage(): void {
  const x = scrollX;
  const y = scrollY;
  const until = Date.now() + HOLD_PAGE_MS;
  const events = ["wheel", "touchstart", "keydown", "mousedown"] as const;

  const stop = (): void => {
    removeEventListener("scroll", restore);
    for (const type of events) removeEventListener(type, stop, true);
  };
  const restore = (): void => {
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

/** Puts a panel away. */
function closePanel(panel: HTMLElement): void {
  panel.hidden = true;
  panel.querySelector("iframe")?.remove();
}

// Do not bind to the buttons: Torn clones them, which drops their listeners.

/** Takes away the panel belonging to the message a close button sits in. */
function dropPanel(panelId: string): void {
  document.getElementById(panelId)?.remove();
  document.querySelector(`[${PANEL_ATTR}="${panelId}"]`)?.remove();
  document.querySelector(`[${MARKED_ATTR}="${panelId}"]`)?.removeAttribute(
    MARKED_ATTR,
  );
  log("send: purchase message dismissed, panel taken away");
}

/** Marks the message's own dismiss button as the one that ends its panel. */
function linkClose(message: Element, panelId: string): void {
  let node: Element | null = message;
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

/** Works the send panels from one listener on the page. */
function installClicks(): void {
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
          trigger.getAttribute(PANEL_ATTR) ?? "",
        );
        if (!panel) return;
        if (panel.hidden) openPanel(panel);
        else closePanel(panel);
        return;
      }

      const dismissing = target.closest(`[${CLOSE_LINK_ATTR}]`);
      if (dismissing) dropPanel(dismissing.getAttribute(CLOSE_LINK_ATTR) ?? "");
    },
    true,
  );

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    for (const panel of document.querySelectorAll<HTMLElement>(".aue-send")) {
      if (!panel.hidden) closePanel(panel);
    }
  });
}

/** Whether an element is a purchase message. */
function isPurchaseMessage(element: Element): boolean {
  if (element.closest(".aue-send") || isLogEntry(element)) return false;
  const text = element.textContent ?? "";
  return text.length <= MESSAGE_MAX_LENGTH && BOUGHT_TEXT.test(text);
}

/** Puts the aeroplane beside a message that has none. */
function ensureTrigger(message: Element, panelId: string): void {
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

/** Returns the shop's own block that a purchase message sits in. */
function purchaseBox(message: Element): Element {
  let box: Element = message;
  for (let depth = 0; depth < BOX_LIMIT; depth += 1) {
    const parent = box.parentElement;
    if (!parent || parent === document.body) break;
    if (parent.matches(CONTENT_ROOT_SELECTOR)) break;
    box = parent;
  }
  return box;
}

/** Returns a city shop item's id from the stored shop stock, by name, or "" when it is not there. */
function stockItemId(name: string): string {
  const wanted = name.toLowerCase();
  for (const shop of readStock()?.shops ?? []) {
    const item = shop.items.find((candidate) => candidate.name.toLowerCase() === wanted);
    if (item) return String(item.id);
  }
  return "";
}

/** Puts a send option beside a purchase message. */
function offerSend(message: Element): void {
  // The items page is searched by name as well as by id, so a message with
  // only a name is still enough. Needing the id is what stopped the option
  // appearing once Torn moved the message away from the item's picture.
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
  const panel = buildPanel(panelId, itemId, name, amountBought(message));
  const box = purchaseBox(message);
  box.insertAdjacentElement("afterend", panel);
  ensureTrigger(message, panelId);
  log("send: offering item", itemId);
}

/** Offers a send option beside the innermost purchase message in a subtree. */
function scan(root: Element): void {
  const found: Element[] = [];
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

/** Adds a send option to items bought from a shop. */
export function installShopSend(): void {
  if (!on()) return;
  installClicks();
  scan(document.body);

  let timer = 0;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (on()) scan(document.body);
    }, SETTLE_MS);
  }).observe(document.body, { childList: true, subtree: true });
}
