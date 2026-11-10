// A send option after a shop purchase: a small form that sends the item with
// Torn's own send requests.
//
// It used to host the items page in a hidden frame and press its buttons, which
// broke whenever that page changed and sent requests nobody had clicked for.
// Now each request is one of the player's clicks, the same two Torn's own form
// takes: Send asks Torn to check the send, Yes confirms it.

import { readStock } from "./cityStock";
import { log } from "./debug";
import { onlyOurs } from "./ownChanges";
import { cleanAmount, field, postTorn, showReply, tornButton } from "./tornForms";
import { isLogEntry } from "./purchaseText";
import { recipientText } from "./recipient";
import { FoundUser, MIN_QUERY, searchUsers } from "./userSearch";
import { PREFERRED_RECIPIENT, isEnabled } from "./settings";

/** The shop pages this feature runs on. */
export const SHOP_PATHS = ["/shops.php", "/bigalgunshop.php"];

/** Where Torn's item send form posts, both for the check and the confirmation. */
const SEND_URL = "https://www.torn.com/item.php";
/** The longest message Torn's send form allows. */
const MESSAGE_MAX = 200;

/** Where a panel keeps what was bought. */
const ITEM_ATTR = "data-aue-item";
const AMOUNT_ATTR = "data-aue-amount";
const NAME_ATTR = "data-aue-name";
/** Where a panel keeps how many of the item are held; empty while it is being asked. */
const MAX_ATTR = "data-aue-max";
/** The amount held, in Torn's send form: <input ... name="amount" data-max="67">. */
const HELD_IN_FORM = /name="amount"[^>]*data-max="(\d+)"|data-max="(\d+)"[^>]*name="amount"/;
/** How long typing in the User ID box settles before Torn is asked for names. */
const SEARCH_DELAY_MS = 250;
/** How long a suggestion stays clickable after the box loses focus. */
const BLUR_MS = 150;
/** Where a panel keeps what Torn agreed to, waiting for Yes, as JSON. */
const PENDING_ATTR = "data-aue-pending";
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
/** How high above a purchase message the shop's own block is looked for. */
const BOX_LIMIT = 8;
/** As high as that walk goes: past this it is out of the page's content. */
const CONTENT_ROOT_SELECTOR = ".content-wrapper, #mainContainer";
/** Item pictures closer than this side to side are taken to be in one column. */
const COLUMN_SLACK_PX = 5;
/** Ties a dismiss button to the panel it ends. */
const CLOSE_LINK_ATTR = "data-aue-closes";
/** How high above a message its own dismiss button is looked for. */
const CLOSE_LIMIT = 4;
/** Torn's own dismiss button on a purchase message. */
const MESSAGE_CLOSE_SELECTOR = "button[aria-label='Close' i], .close-icon";
/** The options Torn offers beside a purchase message. */
const OPTION_TEXT = /your items|equip|use item|read|open|start|abroad/i;
/** Torn's send aeroplane. */
const PLANE_PATH = "M2 21l21-9L2 3v7l15 2-15 2v7z";
const SVG_NS = "http://www.w3.org/2000/svg";
/** Settles a burst of Torn's own rendering before the page is read again. */
const SETTLE_MS = 150;

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

/**
 * Torn's reply to a send request.
 *
 * The check answers {success, confirm, text, itemID, userID, ...}, where
 * itemID is no longer the kind of item but the one copy in the inventory that
 * would go, and userID is the recipient as a number. The confirmation answers
 * {success, text, ...}. Either can come back with success false and a text
 * saying why.
 */
interface SendReply {
  success?: boolean;
  confirm?: boolean;
  text?: string;
  itemID?: number | string;
  userID?: number | string;
}

/** Sends one of Torn's item send requests and returns its reply. */
async function postSend(fields: Record<string, string>): Promise<SendReply> {
  return JSON.parse(await postTorn(SEND_URL, fields)) as SendReply;
}

/**
 * Learns how many of the item the player holds, for the Amount box's limit.
 *
 * Asks for Torn's own send form for the item, the request its items page
 * makes when Send is pressed there, and reads the amount box's data-max. Run
 * when the plane is clicked, once per panel.
 */
async function learnHeld(panel: HTMLElement): Promise<void> {
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
      id: itemId,
    });
    const found = HELD_IN_FORM.exec(html);
    const held = found?.[1] ?? found?.[2];
    if (!held) {
      log("send: Torn's send form gave no amount held");
      return;
    }
    panel.setAttribute(MAX_ATTR, held);
    const amount = panel.querySelector<HTMLInputElement>(".aue-send-amount input");
    if (amount) amount.value = cleanAmount(amount.value, held);
    log("send: holding", held, "of item", itemId);
  } catch (error) {
    log("send: couldn't learn the amount held", error);
  }
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

/** Returns the panel holding the send form for one purchase. */
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

/** Returns the value typed into one of a panel's boxes. */
function valueOf(panel: HTMLElement, className: string): string {
  return panel.querySelector<HTMLInputElement>(`.${className} input`)?.value.trim() ?? "";
}

/** Shows a line under the form, as a problem or as news. */
function say(panel: HTMLElement, html: string, failed: boolean): void {
  const status = panel.querySelector<HTMLElement>(".aue-send-status");
  if (!status) return;
  showReply(status, html);
  status.classList.toggle("aue-send-failed", failed);
  status.hidden = false;
}

/** Returns a part of a panel by its class. */
function part<T extends HTMLElement = HTMLElement>(panel: HTMLElement, className: string): T | null {
  return panel.querySelector<T>(`.${className}`);
}

/**
 * Asks Torn whether a panel's send is possible, and shows its question.
 *
 * Torn's answer names the one copy of the item that would go, which is what
 * Yes then sends. Nothing is asked of Torn without a click, and each click
 * asks once.
 */
async function askToSend(panel: HTMLElement): Promise<void> {
  const send = part<HTMLButtonElement>(panel, "aue-send-go");
  if (!send || send.disabled) return;
  const itemId = panel.getAttribute(ITEM_ATTR) ?? "";
  const user = valueOf(panel, "aue-send-user");
  const amount = valueOf(panel, "aue-send-amount");
  const tag = valueOf(panel, "aue-send-message");
  if (!itemId) {
    say(panel, "Couldn't tell which item this is, so it can't be sent from here.", true);
    return;
  }
  if (!user) {
    say(panel, "Who should it go to?", true);
    return;
  }

  send.disabled = true;
  try {
    const reply = await postSend({ step: "sendItemAction", tag, userID: user, amount, itemID: itemId });
    log("send: check answered", reply);
    if (!reply.success || !reply.confirm || reply.itemID === undefined || reply.userID === undefined) {
      say(panel, reply.text || "Torn wouldn't send that.", true);
      return;
    }
    panel.setAttribute(
      PENDING_ATTR,
      JSON.stringify({
        step: "sendItemAction",
        confirm: "1",
        XID: String(reply.itemID),
        userID: String(reply.userID),
        tag,
        amount,
      }),
    );
    const question = part(panel, "aue-send-question");
    if (question) showReply(question, reply.text ?? "Send it?");
    part(panel, "aue-send-form")?.setAttribute("hidden", "");
    part(panel, "aue-send-status")?.setAttribute("hidden", "");
    part(panel, "aue-send-confirm")?.removeAttribute("hidden");
    part(panel, "aue-send-yes")?.focus();
  } catch (error) {
    say(panel, "Couldn't reach Torn. Try again.", true);
    log("send: check failed", error);
  } finally {
    send.disabled = false;
  }
}

/** Sends what Torn agreed to, on Yes. */
async function confirmSend(panel: HTMLElement): Promise<void> {
  const yes = part<HTMLButtonElement>(panel, "aue-send-yes");
  const raw = panel.getAttribute(PENDING_ATTR);
  if (!yes || yes.disabled || !raw) return;
  const fields = JSON.parse(raw) as Record<string, string>;

  yes.disabled = true;
  try {
    const reply = await postSend(fields);
    log("send: confirmation answered", reply);
    panel.removeAttribute(PENDING_ATTR);
    part(panel, "aue-send-confirm")?.setAttribute("hidden", "");
    if (reply.success) {
      say(panel, reply.text || "Sent.", false);
      // What went is no longer held, so the limit comes down with it.
      const held = Number(panel.getAttribute(MAX_ATTR));
      if (held > 0) panel.setAttribute(MAX_ATTR, String(Math.max(0, held - Number(fields.amount))));
    } else {
      part(panel, "aue-send-form")?.removeAttribute("hidden");
      say(panel, reply.text || "Torn wouldn't send that.", true);
    }
  } catch (error) {
    say(panel, "Couldn't reach Torn. Try again.", true);
    log("send: confirmation failed", error);
  } finally {
    yes.disabled = false;
  }
}

/** Drops what Torn agreed to, on No, and goes back to the form. */
function cancelSend(panel: HTMLElement): void {
  panel.removeAttribute(PENDING_ATTR);
  part(panel, "aue-send-confirm")?.setAttribute("hidden", "");
  part(panel, "aue-send-form")?.removeAttribute("hidden");
}

/** Offers the names Torn found for what was typed in a panel's User ID box. */
function offerUsers(panel: HTMLElement, users: FoundUser[]): void {
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

let searchTimer = 0;

/** Looks up names as they are typed in a User ID box, the way Torn's own box does. */
function onUserTyped(panel: HTMLElement, input: HTMLInputElement): void {
  const typed = input.value.trim();
  clearTimeout(searchTimer);
  // An ID, or a name already picked, needs no list.
  if (typed.length < MIN_QUERY || /^\d+$/.test(typed) || /\[\d+\]$/.test(typed)) {
    part(panel, "aue-suggest")?.setAttribute("hidden", "");
    return;
  }
  searchTimer = window.setTimeout(() => {
    void searchUsers(typed).then((users) => {
      if (input.value.trim() === typed) offerUsers(panel, users);
    });
  }, SEARCH_DELAY_MS);
}

/** Opens a panel. */
function openPanel(panel: HTMLElement): void {
  void learnHeld(panel);
  panel.hidden = false;
  log("send: opened item", panel.getAttribute(ITEM_ATTR));
}

/** Puts a panel away. */
function closePanel(panel: HTMLElement): void {
  panel.hidden = true;
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

/** Works the aeroplanes and dismiss buttons from one listener on the page. */
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
        const panelId = trigger.getAttribute(PANEL_ATTR) ?? "";
        // A panel Torn's redraw took is put back before the settled scan would.
        const message = document.querySelector(`[${MARKED_ATTR}="${panelId}"]`);
        const panel =
          document.getElementById(panelId) ?? (message && ensurePanel(message, panelId));
        if (!panel) {
          log("send: no panel to open for", panelId);
          return;
        }
        if (panel.hidden) openPanel(panel);
        else closePanel(panel);
        return;
      }

      // The panel's own buttons are worked from here too: Torn copies the
      // shop's markup as it redraws, and a copy carries no listeners.
      const panel = target.closest<HTMLElement>(".aue-send");
      if (panel) {
        if (target.closest(".aue-send-go")) void askToSend(panel);
        else if (target.closest(".aue-send-yes")) void confirmSend(panel);
        else if (target.closest(".aue-send-no")) cancelSend(panel);
        return;
      }

      const dismissing = target.closest(`[${CLOSE_LINK_ATTR}]`);
      if (dismissing) dropPanel(dismissing.getAttribute(CLOSE_LINK_ATTR) ?? "");
    },
    true,
  );

  // Mousedown, not click: the box losing focus would hide the list first.
  document.addEventListener(
    "mousedown",
    (event) => {
      const target = event.target;
      const option = target instanceof Element ? target.closest<HTMLElement>(".aue-send .aue-suggest-option") : null;
      const panel = option?.closest<HTMLElement>(".aue-send");
      if (!option || !panel) return;
      event.preventDefault();
      const input = panel.querySelector<HTMLInputElement>(".aue-send-user input");
      if (input) input.value = option.dataset.aueUser ?? "";
      part(panel, "aue-suggest")?.setAttribute("hidden", "");
    },
    true,
  );

  // Anything but digits is refused as it is typed or pasted, before it lands.
  document.addEventListener(
    "beforeinput",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || !target.closest(".aue-send-amount")) return;
      if (event.data && /\D/.test(event.data)) event.preventDefault();
    },
    true,
  );

  document.addEventListener(
    "input",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      const panel = target.closest<HTMLElement>(".aue-send");
      if (!panel) return;
      if (target.closest(".aue-send-user")) onUserTyped(panel, target);
      if (target.closest(".aue-send-amount")) {
        // Catches what beforeinput cannot, such as a drop, and pulls a number
        // above what is held back down to it.
        const cleaned = cleanAmount(target.value, panel.getAttribute(MAX_ATTR) ?? "");
        if (cleaned !== target.value) target.value = cleaned;
      }
    },
    true,
  );

  document.addEventListener(
    "focusout",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(".aue-send-user")) return;
      const panel = target.closest<HTMLElement>(".aue-send");
      if (panel) setTimeout(() => part(panel, "aue-suggest")?.setAttribute("hidden", ""), BLUR_MS);
    },
    true,
  );

  document.addEventListener("keydown", (event) => {
    // Enter never sends, so a slip of the key cannot give an item away. In
    // the User ID box it takes the one name left in the list, if only one is.
    const target = event.target;
    if (event.key === "Enter" && target instanceof HTMLInputElement && target.closest(".aue-send-form")) {
      event.preventDefault();
      const panel = target.closest<HTMLElement>(".aue-send");
      const list = panel && part(panel, "aue-suggest");
      const options = list && !list.hidden ? list.querySelectorAll<HTMLElement>(".aue-suggest-option") : [];
      if (target.closest(".aue-send-user") && options.length === 1 && list) {
        target.value = options[0]?.dataset.aueUser ?? target.value;
        list.hidden = true;
      }
      return;
    }
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

/**
 * Returns the block the panel goes after.
 *
 * With the items in a grid, the shop's whole block: the message's own box
 * there does not show what is put after it. With the items stacked in one
 * column, the message sits inside that list, so the shop's block would put
 * the panel below every item, and the message's own box, the one holding
 * Torn's dismiss button, is used. Decided by the shop's layout rather than
 * the window's width, as the shop changes layout at a width of its own.
 */
function purchaseBox(message: Element): Element {
  const shop = shopBox(message);
  let node: Element | null = message;
  for (let depth = 0; node && depth < CLOSE_LIMIT; depth += 1) {
    if (node.querySelector(MESSAGE_CLOSE_SELECTOR)) {
      return itemsInOneColumn(shop, node) ? node : shop;
    }
    node = node.parentElement;
  }
  return shop;
}

/** Whether a shop shows its items stacked in one column, judged from two item pictures outside the message. */
function itemsInOneColumn(shop: Element, messageBox: Element): boolean {
  const pictures = [...shop.querySelectorAll("img[src*='/items/']")]
    .filter((picture) => !messageBox.contains(picture))
    .slice(0, 2)
    .map((picture) => picture.getBoundingClientRect());
  const [first, second] = pictures;
  if (!first || !second) return false;
  return Math.abs(first.left - second.left) < COLUMN_SLACK_PX;
}

/** Returns the shop's own block that a purchase message sits in. */
function shopBox(message: Element): Element {
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
  // Torn's send request needs the kind of item by number. The message's own
  // picture usually gives it; failing that, the shop stock does, by name.
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

/**
 * Puts a message's panel under it, building it again if it has gone.
 *
 * On mobile the panel sits inside Torn's item list, and Torn throws away what
 * it did not draw whenever it redraws that list. A panel lost that way comes
 * back closed, at its form.
 */
function ensurePanel(message: Element, panelId: string): HTMLElement | null {
  const existing = document.getElementById(panelId);
  if (existing) return existing;
  const name = nameBought(message);
  const itemId = itemIdFor(message) ?? stockItemId(name);
  if (!itemId) return null;
  const panel = buildPanel(panelId, itemId, name, amountBought(message));
  purchaseBox(message).insertAdjacentElement("afterend", panel);
  return panel;
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
    else if (marked !== "none") {
      ensurePanel(message, marked);
      ensureTrigger(message, marked);
    }
  }
}

/** Adds a send option to items bought from a shop. */
export function installShopSend(): void {
  if (!on()) return;
  installClicks();
  scan(document.body);

  let timer = 0;
  new MutationObserver((records) => {
    if (onlyOurs(records)) return;
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (on()) scan(document.body);
    }, SETTLE_MS);
  }).observe(document.body, { childList: true, subtree: true });
}
