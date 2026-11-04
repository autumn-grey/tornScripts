// A send option after a shop purchase, hosting Torn's own item page send form.

import { log } from "./debug";
import {
  AMOUNT_FIELD_SELECTOR,
  TEXT_FIELD_SELECTOR,
  USER_FIELD_SELECTOR,
  fillField,
  recipientText,
} from "./recipient";
import { SHOP_SEND, isEnabled } from "./settings";

/** The shop pages this feature runs on. */
export const SHOP_PATHS = ["/shops.php", "/bigalgunshop.php"];

const ITEMS_URL = "https://www.torn.com/item.php";
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
/** The quantity and the name in a purchase message. */
const BOUGHT_ITEM =
  /\byou (?:bought|purchased|have bought)\s+(?:(?:a|an|the)\s+)?(?:([\d,]+)\s*x?\s+)?(.+?)\s+for\s/i;
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
/** The box that filters the items page. */
const SEARCH_SELECTOR =
  "input[type='search'], input[placeholder*='search' i], input[name*='search' i]";
/** Longer than this is a list rather than one item's row. */
const ROW_MAX_LENGTH = 300;
/** Torn's send aeroplane. */
const PLANE_PATH = "M2 21l21-9L2 3v7l15 2-15 2v7z";
const SVG_NS = "http://www.w3.org/2000/svg";
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
  body { background: transparent !important; }
`;

/** How many panels this page has made. */
let panelCount = 0;

/** Whether the feature is switched on. */
function on(): boolean {
  return isEnabled(SHOP_SEND);
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
  const amount = match?.[1]?.replace(/,/g, "") ?? "";
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

/** Keeps the items page search box holding an item name. */
function searchFrame(doc: Document, name: string): void {
  const box = doc.querySelector<HTMLInputElement>(SEARCH_SELECTOR);
  if (!box || !name || box.value === name) return;
  fillField(box, name);
  log("send: searching the items page for", name);
}

/** Returns the element holding a row's send form. */
function sendFormScope(row: Element): Element {
  if (row.querySelector(TEXT_FIELD_SELECTOR)) return row;
  const next = row.nextElementSibling;
  if (next?.querySelector(TEXT_FIELD_SELECTOR)) return next;
  return row;
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
  }
  if (amount && amountBox && amountBox !== userBox) {
    fillField(amountBox, amount);
    log("send: amount", amount);
  }
}

/** Shows nothing on the framed page but one element. */
function isolateRow(doc: Document, target: Element): void {
  const keep = new Set<Element>();
  for (let node: Element | null = target; node; node = node.parentElement) {
    keep.add(node);
  }

  for (const node of keep) {
    for (const sibling of Array.from(node.parentElement?.children ?? [])) {
      if (!keep.has(sibling)) sibling.classList.add(HIDE_CLASS);
    }
    if (node !== target) node.classList.add(KEEP_CLASS);
  }
  doc.documentElement.classList.add(ONLY_CLASS);
  doc.defaultView?.scrollTo(0, 0);
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

/** Closes a panel once its form goes away. */
function watchForm(frame: HTMLIFrameElement, form: Element): void {
  const panel = frame.closest<HTMLElement>(".aue-send");
  if (!panel) return;

  const timer = window.setInterval(() => {
    if (!panel.isConnected || panel.hidden) {
      clearInterval(timer);
      return;
    }
    if (form.isConnected) return;
    clearInterval(timer);
    closePanel(panel);
    log("send: the form closed, putting the panel away");
  }, FORM_WATCH_MS);
}

interface FramedItem {
  itemId: string;
  name: string;
  amount: string | null;
}

/** Shows the frame, now that there is something worth looking at in it. */
function showFrame(frame: HTMLIFrameElement, status: HTMLElement): void {
  frame.classList.remove(WAITING_CLASS);
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
      watchForm(frame, form);
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
    if (!row) {
      searchFrame(doc, item.name);
      if (!expired) {
        setTimeout(attempt, POLL_MS);
        return;
      }
      failPanel(status, `Couldn't find ${item.name} in your items.`);
      log("send: item", item.itemId, item.name, "not found on the items page");
      return;
    }

    openSendForm(frame, doc, item, status);
    log("send: found item", item.itemId, "in your items");
  };

  attempt();
}

/** Returns the frame the bought item's send form is taken from. */
function buildFrame(item: FramedItem, status: HTMLElement): HTMLIFrameElement {
  const frame = document.createElement("iframe");
  frame.className = `aue-send-frame ${WAITING_CLASS}`;
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
  const itemId = panel.getAttribute(ITEM_ATTR);
  if (!status || !itemId) return;

  const name = panel.getAttribute(NAME_ATTR) ?? "";
  panel.hidden = false;
  status.hidden = false;
  status.textContent = name
    ? `Opening the send form for ${name}...`
    : "Opening the send form...";
  if (!panel.querySelector("iframe")) {
    const amount = panel.getAttribute(AMOUNT_ATTR);
    panel.appendChild(buildFrame({ itemId, name, amount }, status));
  }
  log("send: opened item", itemId);
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
  if (element.closest(".aue-send")) return false;
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

/** Puts a send option beside a purchase message. */
function offerSend(message: Element): void {
  const itemId = itemIdFor(message);
  if (!itemId) {
    message.setAttribute(MARKED_ATTR, "none");
    log("send: no item id near", message);
    return;
  }

  panelCount += 1;
  const panelId = `aue-send-${panelCount}`;
  message.setAttribute(MARKED_ATTR, panelId);
  const panel = buildPanel(
    panelId,
    itemId,
    nameBought(message),
    amountBought(message),
  );
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
