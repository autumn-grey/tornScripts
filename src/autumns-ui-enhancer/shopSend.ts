// A send option after a shop purchase, hosting Torn's own item page send form.

import { log } from "./debug";
import {
  RECIPIENT_SETTING,
  SHOP_SEND,
  isEnabled,
  readSetting,
} from "./settings";

/** The shop pages this feature runs on. */
export const SHOP_PATHS = ["/shops.php", "/bigalgunshop.php"];

const ITEMS_URL = "https://www.torn.com/item.php";
/** Marks a purchase message that has already been given a send option. */
const MARKED_ATTR = "data-aue-send";
/** The text Torn puts on a purchase message. */
const BOUGHT_TEXT = /\byou (?:bought|purchased|have bought)\b/i;
/** The quantity in a purchase message. */
const BOUGHT_AMOUNT =
  /\byou (?:bought|purchased|have bought)\s+(?:a|an|the)?\s*([\d,]+)\s*x?\b/i;
/** Longer than this is the page rather than a single message. */
const MESSAGE_MAX_LENGTH = 300;
/** The item id in an item image's path. */
const ITEM_IMAGE = /\/items\/(\d+)\//;
/** How far up from a message the item row is looked for. */
const ANCESTOR_LIMIT = 6;
/** How long the items page is given to show the bought item. */
const FRAME_READY_MS = 20000;
const POLL_MS = 250;
/** Settles the send form before its boxes are filled in. */
const FILL_DELAY_MS = 300;

/** The row for one item on the items page. */
const ROW_SELECTOR = "li, tr";
/** The control that opens a row's send form. */
const SEND_SELECTORS = [
  "[aria-label='Send' i]",
  "[title='Send' i]",
  "a[href*='send' i]",
  "[class*='send' i]",
];
/** The recipient box on a send form. */
const USER_FIELD_SELECTOR =
  "input[name*='user' i], input[placeholder*='user' i], input[id*='user' i]";
/** The quantity box on a send form. */
const AMOUNT_FIELD_SELECTOR =
  "input[name*='amount' i], input[placeholder*='amount' i], input[id*='amount' i], input[type='number']";
/** Any box on a send form that takes typing. */
const TEXT_FIELD_SELECTOR =
  "input[type='text'], input[type='number'], input:not([type])";
/** Page furniture the framed items page does not need to show. */
const FRAME_CSS = `
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
  body { background: #111 !important; }
`;

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
  for (const selector of SEND_SELECTORS) {
    const control = row.querySelector<HTMLElement>(selector);
    if (control) return control;
  }
  return null;
}

/** Returns the recipient the reader has chosen, if any. */
function defaultRecipient(): string {
  return readSetting(RECIPIENT_SETTING, "").replace(/\D+/g, "");
}

/** Returns the quantity a purchase message reports. */
function amountBought(message: Element): string | null {
  const match = BOUGHT_AMOUNT.exec(message.textContent ?? "");
  const amount = match?.[1]?.replace(/,/g, "") ?? "";
  return /^[1-9]\d*$/.test(amount) ? amount : null;
}

/** Puts a value into a box the way typing into it would. */
function fillField(input: HTMLInputElement, value: string): void {
  const view = input.ownerDocument.defaultView;
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(input) as object,
    "value",
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

  const recipient = defaultRecipient();
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

/** Whether a row already shows its send form. */
function sendFormOpen(row: Element): boolean {
  return row.querySelector("input[type='text'], input[type='number']") !== null;
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
  itemId: string,
  amount: string | null,
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
      if (!expired) setTimeout(attempt, POLL_MS);
      return;
    }

    styleFrame(doc);
    const row = findRow(doc, itemId);
    if (!row) {
      if (!expired) {
        setTimeout(attempt, POLL_MS);
        return;
      }
      status.textContent =
        "Couldn't find that item in the panel below - scroll to it there.";
      log("send: item", itemId, "not found on the items page");
      return;
    }

    if (!sendFormOpen(row)) findSendControl(row)?.click();
    setTimeout(() => fillSendForm(row, amount), FILL_DELAY_MS);

    const view = frame.contentWindow;
    if (view) {
      const top = row.getBoundingClientRect().top + view.scrollY - 6;
      view.scrollTo(0, Math.max(0, top));
    }
    status.hidden = true;
    log("send: showing item", itemId);
  };

  attempt();
}

/** Returns the frame showing the bought item's send form. */
function buildFrame(
  itemId: string,
  amount: string | null,
  status: HTMLElement,
): HTMLIFrameElement {
  const frame = document.createElement("iframe");
  frame.className = "aue-send-frame";
  frame.src = ITEMS_URL;
  frame.addEventListener("load", () =>
    openInFrame(frame, itemId, amount, status),
  );
  return frame;
}

/** Returns the send option for a bought item. */
function buildPanel(itemId: string, amount: string | null): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "aue-send";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "torn-btn aue-send-btn";
  button.textContent = "Send this item";
  panel.appendChild(button);

  const body = document.createElement("div");
  body.className = "aue-send-body";
  body.hidden = true;
  panel.appendChild(body);

  const bar = document.createElement("div");
  bar.className = "aue-send-bar";
  body.appendChild(bar);

  const link = document.createElement("a");
  link.className = "aue-send-link";
  link.href = ITEMS_URL;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "Open items page";
  bar.appendChild(link);

  const close = document.createElement("button");
  close.type = "button";
  close.className = "aue-send-close";
  close.textContent = "X";
  close.setAttribute("aria-label", "Close");
  bar.appendChild(close);

  const status = document.createElement("div");
  status.className = "aue-send-status";
  body.appendChild(status);

  close.addEventListener("click", () => {
    body.hidden = true;
    body.querySelector("iframe")?.remove();
    button.hidden = false;
  });

  button.addEventListener("click", () => {
    button.hidden = true;
    body.hidden = false;
    status.hidden = false;
    status.textContent = "Loading your items...";
    if (!body.querySelector("iframe")) {
      body.appendChild(buildFrame(itemId, amount, status));
    }
  });

  return panel;
}

/** Whether an element is a purchase message with no send option yet. */
function isPurchaseMessage(element: Element): boolean {
  if (element.hasAttribute(MARKED_ATTR)) return false;
  if (element.closest(".aue-send")) return false;
  const text = element.textContent ?? "";
  return text.length <= MESSAGE_MAX_LENGTH && BOUGHT_TEXT.test(text);
}

/** Puts a send option under a purchase message. */
function offerSend(message: Element): void {
  message.setAttribute(MARKED_ATTR, "1");
  const itemId = itemIdFor(message);
  if (!itemId) {
    log("send: no item id near", message);
    return;
  }
  message.insertAdjacentElement(
    "afterend",
    buildPanel(itemId, amountBought(message)),
  );
}

/** Offers a send option under the innermost purchase message in a subtree. */
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
    offerSend(message);
  }
}

/** Adds a send option to items bought from a shop. */
export function installShopSend(): void {
  if (!on()) return;
  scan(document.body);
  new MutationObserver((records) => {
    if (!on()) return;
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof Element) scan(node);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}
