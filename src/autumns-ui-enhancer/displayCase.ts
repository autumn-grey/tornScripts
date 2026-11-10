// A display case button on each item on the items page, which adds that item
// to the display case with Torn's own request.
//
// Torn's display case page adds any number of items at once. Here it is one
// item, in any amount, per go: the button opens a small panel, ADD asks for
// a confirmation, and YES makes the one request.

import { log } from "./debug";
import { onlyOurs } from "./ownChanges";
import { DISPLAY_CASE_BUTTON, isEnabled } from "./settings";
import { cleanAmount, field, postTorn, showReply, tornButton } from "./tornForms";

/** Where Torn's display case page sends the items it adds. */
const DISPLAY_URL = "https://www.torn.com/displaycase.php";
/** Where Torn's display case page reads the inventory list from. */
const INVENTORY_URL = "https://www.torn.com/inventory.php";

// Every selector this feature matches on, from the live items page.
const SELECTORS = {
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
  body: ".cont-wrap",
};

/** Marks the narrow layout's bar once it holds five slots. */
const FIVE_CLASS = "aue-display-five";
/** Marks a row's button, and ties a panel to its row. */
const ROW_ATTR = "data-aue-display-row";
/** Where a panel keeps what YES will add, as JSON. */
const PENDING_ATTR = "data-aue-pending";
/** Settles Torn's own drawing before the rows are read again. */
const SETTLE_MS = 150;
const SVG_NS = "http://www.w3.org/2000/svg";
/** The two-door display case Torn shows on a profile: a frame round two tall panes. */
const CASE_PATH = "M3 2h18v20H3zM5.5 4.5v15h5.25v-15zM13.25 4.5v15h5.25v-15z";

/** One item on the items page, as far as the display case needs to know it. */
interface Row {
  key: string;
  itemId: string;
  category: string;
  /** The copy in the inventory, where the row says; stackable items mostly do not. */
  copyId: string;
  name: string;
  /** How many are held; 1 for a single item. */
  held: number;
}

/** Reads what the display case needs from an item's row. */
function readRow(row: HTMLElement): Row | null {
  const key = row.dataset.rowkey ?? "";
  const itemId = row.dataset.item ?? "";
  const category = row.dataset.category ?? "";
  if (!/^[\w-]+$/.test(key) || !/^\d+$/.test(itemId) || !category) return null;
  const copyId =
    row.dataset.armoryid ??
    row.querySelector<HTMLElement>(SELECTORS.equip)?.dataset.id ??
    "";
  const name = row.querySelector(SELECTORS.name)?.textContent?.trim() ?? "";
  const held = Number(row.dataset.qty) || 1;
  return { key, itemId, category, copyId: /^\d+$/.test(copyId) ? copyId : "", name, held };
}

/** Returns the display case icon. */
function caseIcon(): SVGSVGElement {
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

/** Returns the empty slot that stands in for the button on an item that cannot go in. */
function buildBlank(key: string): HTMLElement {
  const item = document.createElement("li");
  item.className = "left aue-display-slot aue-display-blank";
  item.id = `aue-display-blank-${key}`;
  return item;
}

/** Returns the button that goes among a row's own, made to look like them. */
function buildOption(key: string, name: string): HTMLElement {
  const item = document.createElement("li");
  item.className = "left aue-display-slot aue-display-option";
  item.id = `aue-display-${key}`;
  item.setAttribute(ROW_ATTR, key);

  const wrap = document.createElement("span");
  wrap.className = "icon-h";
  // Worded like Torn's own, which its tooltips show on one line.
  wrap.title = "Display this Item";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "wai-btn aue-display-button";
  button.setAttribute("aria-label", `Add ${name} to your display case`);
  button.appendChild(caseIcon());

  const label = document.createElement("span");
  label.className = "opt-name";
  label.append("Display ");
  const more = document.createElement("span");
  more.className = "t-hide";
  more.textContent = "this Item";
  label.appendChild(more);

  wrap.append(button, label);
  item.appendChild(wrap);
  return item;
}

/** Returns the panel for one row: an amount where there is more than one, ADD, then YES or NO. */
function buildPanel(row: Row): HTMLElement {
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

/** Returns the row a button or panel belongs to. */
function rowFor(key: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`${SELECTORS.row}[data-rowkey="${key}"]`);
}

/** Shows a line under the panel's form, as a problem or as news. */
function say(panel: HTMLElement, html: string, failed: boolean): void {
  const status = panel.querySelector<HTMLElement>(".aue-send-status");
  if (!status) return;
  showReply(status, html);
  status.classList.toggle("aue-send-failed", failed);
  status.hidden = false;
}

/** Opens or closes a row's panel, making it on first use. */
function togglePanel(key: string): void {
  const rowElement = rowFor(key);
  const row = rowElement && readRow(rowElement);
  if (!rowElement || !row) return;
  let panel = document.getElementById(`aue-display-panel-${key}`);
  if (!panel) {
    panel = buildPanel(row);
    const body = rowElement.querySelector(SELECTORS.body);
    if (body) body.insertAdjacentElement("afterend", panel);
    else rowElement.appendChild(panel);
  }
  panel.hidden = !panel.hidden;
  if (panel.hidden) return;
  closePanels(panel);
  // Opened again, it starts at its form, without the last word from Torn.
  cancelAdd(panel);
  panel.querySelector(".aue-send-status")?.setAttribute("hidden", "");
  if (!row.copyId && !panel.hasAttribute(COPY_ATTR)) void lookUp(panel, row);
}

/** Closes every open panel but the one given. */
function closePanels(except: Element | null): void {
  for (const open of document.querySelectorAll<HTMLElement>(".aue-display:not([hidden])")) {
    if (open !== except) open.hidden = true;
  }
}

/**
 * Brings an item's row up to date after some of it went in the display case.
 *
 * Torn does not redraw the row, and its count is what the Amount limit is
 * read from. The row's own counts are rewritten as Torn writes them, "x5"
 * beside the name and "5" on the picture, nothing at all for one, and a row
 * with nothing left is hidden.
 */
function updateCount(rowElement: HTMLElement, held: number): void {
  if (held <= 0) {
    rowElement.style.display = "none";
    return;
  }
  rowElement.dataset.qty = String(held);
  for (const label of rowElement.querySelectorAll(SELECTORS.nameCount)) {
    label.textContent = held > 1 ? `x${held}` : "";
  }
  const badge = rowElement.querySelector(SELECTORS.pictureCount);
  if (badge) badge.textContent = held > 1 ? String(held) : "";
}

/** Where a panel keeps the inventory copy it looked up; empty while looking. */
const COPY_ATTR = "data-aue-copy";
/** Where a panel keeps the inventory list's category for its item. */
const TYPE_ATTR = "data-aue-type";

/**
 * One entry of Torn's inventory list, as its display case page reads it:
 * {"armoryID":21706369740,"itemID":1199,"Qty":5,"type2":"Other","equiped":0,…}.
 */
interface ListEntry {
  armoryID?: number | string;
  itemID?: number | string;
  ID?: number | string;
  type2?: string;
  equiped?: number;
}

/** A page of the list: {"list":[…],"start":33,"total":33,"loaded":true}, start being where the next page begins. */
interface ListPage {
  list?: ListEntry[];
  start?: number;
  loaded?: boolean;
}

/** Every list entry read so far on this page, by kind of item. */
const inventory = new Map<string, ListEntry>();
/** For each list asked for, where its next page starts, or null once it is all read. */
const listNext = new Map<string, number | null>();
/** The most pages one lookup reads, so a fault cannot keep asking. */
const LIST_PAGES_MAX = 10;

/**
 * Finds the copy of an item in the inventory, reading Torn's inventory list
 * the way its display case page does, a page at a time, until it turns up.
 *
 * Run when the display case button is clicked on an item whose row does not
 * name its copy. The "All" list is read first, then the item's own category,
 * in case "All" leaves some out. Pages already read are kept, so another
 * item seldom costs a request.
 */
async function findCopy(itemId: string, category: string): Promise<ListEntry | null> {
  for (const type of ["All", category]) {
    for (let page = 0; page < LIST_PAGES_MAX && !inventory.has(itemId); page += 1) {
      const start = listNext.get(type) ?? 0;
      if (listNext.get(type) === null) break;
      const reply = JSON.parse(
        await postTorn(INVENTORY_URL, { step: "getList", type, start: String(start) }),
      ) as ListPage;
      for (const entry of reply.list ?? []) {
        const kind = String(entry.itemID ?? entry.ID ?? "");
        if (kind && !entry.equiped && !inventory.has(kind)) inventory.set(kind, entry);
      }
      const next = reply.start;
      const done = reply.loaded === true || !reply.list?.length || typeof next !== "number" || next <= start;
      listNext.set(type, done ? null : next);
    }
    if (inventory.has(itemId)) break;
  }
  return inventory.get(itemId) ?? null;
}

/** Looks up a panel's item in the inventory, for the copy and category the add needs. */
async function lookUp(panel: HTMLElement, row: Row): Promise<void> {
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
    // Left unset, so opening the panel again tries again.
    panel.removeAttribute(COPY_ATTR);
    say(panel, "Couldn't reach Torn. Try again.", true);
    log("display case: inventory lookup failed", error);
  }
}

/** Returns how many of a panel's item are held, as its row says. */
function heldFor(panel: HTMLElement): number {
  const rowElement = rowFor(panel.getAttribute(ROW_ATTR) ?? "");
  return (rowElement && readRow(rowElement)?.held) ?? 0;
}

/** Shows the confirmation for what ADD would add. Nothing is sent to Torn yet. */
function askToAdd(panel: HTMLElement): void {
  const rowElement = rowFor(panel.getAttribute(ROW_ATTR) ?? "");
  const row = rowElement && readRow(rowElement);
  if (!row) {
    say(panel, "This item is no longer on the page.", true);
    return;
  }
  const typed = panel.querySelector<HTMLInputElement>(".aue-send-amount input")?.value ?? "1";
  const amount = cleanAmount(typed, String(heldFor(panel)));
  if (!amount || amount === "0") {
    say(panel, "How many should go in?", true);
    return;
  }

  // Torn needs the copy in the inventory. An equippable item's row names it;
  // anything else was looked up in the inventory list when the panel opened.
  const copyId = row.copyId || panel.getAttribute(COPY_ATTR) || "";
  if (!copyId) {
    say(
      panel,
      panel.hasAttribute(COPY_ATTR) ? "Still finding this item, try again in a moment." : "Couldn't find this item in your inventory.",
      true,
    );
    return;
  }
  const fields: Record<string, string> = {
    "items[0][amount]": amount,
    // The inventory list's own category name where it was looked up, as the
    // row's can differ: the row's Miscellaneous is the list's Other.
    "items[0][type]": panel.getAttribute(TYPE_ATTR) || row.category,
    "items[0][id]": copyId,
    "items[0][itemID]": row.itemId,
    step: "addInventoryItems",
  };
  panel.setAttribute(PENDING_ATTR, JSON.stringify(fields));

  const question = panel.querySelector<HTMLElement>(".aue-send-question");
  if (question) {
    question.replaceChildren(`Add ${amount} x `);
    const name = document.createElement("b");
    name.textContent = row.name || "this item";
    question.append(name, " to your display case?");
  }
  panel.querySelector(".aue-send-form")?.setAttribute("hidden", "");
  panel.querySelector(".aue-send-status")?.setAttribute("hidden", "");
  panel.querySelector(".aue-send-confirm")?.removeAttribute("hidden");
  panel.querySelector<HTMLElement>(".aue-display-yes")?.focus();
}

/** Torn's reply to adding items: {success, text, logs: ["You have added 2 x <b>…</b> …"]}. */
interface AddReply {
  success?: boolean;
  text?: string;
  logs?: string[];
}

/** Adds what was confirmed, on YES. */
async function addNow(panel: HTMLElement): Promise<void> {
  const yes = panel.querySelector<HTMLButtonElement>(".aue-display-yes");
  const raw = panel.getAttribute(PENDING_ATTR);
  if (!yes || yes.disabled || !raw) return;
  const fields = JSON.parse(raw) as Record<string, string>;

  yes.disabled = true;
  try {
    const reply = JSON.parse(await postTorn(DISPLAY_URL, fields)) as AddReply;
    log("display case: Torn answered", reply);
    panel.removeAttribute(PENDING_ATTR);
    panel.querySelector(".aue-send-confirm")?.setAttribute("hidden", "");
    const text = reply.logs?.join(" ") || reply.text || "";
    if (reply.success) {
      // Torn's word and a way to close; opening the panel again starts afresh.
      const left = heldFor(panel) - Number(fields["items[0][amount]"]);
      const amount = panel.querySelector<HTMLInputElement>(".aue-send-amount input");
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

/** Drops what was about to be added, on NO, and goes back to the form. */
function cancelAdd(panel: HTMLElement): void {
  panel.removeAttribute(PENDING_ATTR);
  panel.querySelector(".aue-send-confirm")?.setAttribute("hidden", "");
  panel.querySelector(".aue-send-form")?.removeAttribute("hidden");
}

/** Puts the button on every item row that has none. */
function scan(): void {
  if (!isEnabled(DISPLAY_CASE_BUTTON)) return;
  let added = 0;
  for (const rowElement of document.querySelectorAll<HTMLElement>(SELECTORS.row)) {
    const row = readRow(rowElement);
    const actions = rowElement.querySelector(SELECTORS.actions);
    if (!row || !actions) continue;
    const existing = rowElement.querySelector<HTMLElement>(".aue-display-option");
    const blank = rowElement.querySelector<HTMLElement>(".aue-display-blank");
    // An item in use, or one that is not the player's to give, has no button:
    // Torn would only refuse it. It gets an empty slot instead, so every row
    // has five and the columns stay even. Equipping one later swaps them.
    if (!canDisplay(rowElement)) {
      if (existing) removeFrom(rowElement);
      if (!blank) actions.prepend(buildBlank(row.key));
      if (rowElement.querySelector(SELECTORS.accordion)) actions.classList.add(FIVE_CLASS);
      continue;
    }
    if (existing) continue;
    blank?.remove();

    // First, left of the tick, with the dark line moved onto its left edge.
    const option = buildOption(row.key, row.name);
    actions.prepend(option);
    // Torn's narrow layout gives its bar four slots of a quarter each; with
    // a fifth, every slot becomes a fifth, or the rest wrap underneath.
    if (rowElement.querySelector(SELECTORS.accordion)) actions.classList.add(FIVE_CLASS);
    added += 1;
  }
  if (added > 0) log("display case: buttons added to", added, "items");
  for (const rowElement of document.querySelectorAll<HTMLElement>(SELECTORS.row)) {
    // Torn can switch a row to its narrow layout after the button went in,
    // so the bar's five fifths follow the layout it has now.
    const narrowLayout = rowElement.querySelector(SELECTORS.accordion) !== null;
    rowElement.querySelector(SELECTORS.actions)?.classList.toggle(FIVE_CLASS, narrowLayout);
    matchNeighbour(rowElement);
    widen(rowElement);
  }
}

/**
 * Works the rows out afresh for the window's new width.
 *
 * Widths set for one layout are wrong for the next: the full list view's
 * wider actions box, left on a row Torn has since switched to its narrow
 * layout, squeezes its bar into a strip.
 */
function relayout(): void {
  for (const rowElement of document.querySelectorAll<HTMLElement>(SELECTORS.row)) {
    unwiden(rowElement);
    rowElement.querySelector(SELECTORS.actionsBox)?.removeAttribute(WIDE_ATTR);
    rowElement.querySelector(".aue-display-option")?.removeAttribute(MATCHED_ATTR);
    const button = rowElement.querySelector<HTMLElement>(".aue-display-button");
    button?.removeAttribute("style");
  }
  scan();
}

/** Whether an item can go in the display case: not equipped, and not on loan from a faction. */
function canDisplay(rowElement: HTMLElement): boolean {
  // Torn marks an equipped item both ways: data-equipped, and its green row.
  if (rowElement.dataset.equipped === "true" || rowElement.classList.contains("bg-green")) return false;
  return rowElement.querySelector(SELECTORS.loaned) === null;
}

/** Takes a row's button and panel away, and gives the actions back their own width. */
function removeFrom(rowElement: HTMLElement): void {
  rowElement.querySelector(".aue-display-option")?.remove();
  rowElement.querySelector(".aue-display")?.remove();
  unwiden(rowElement);
  rowElement.querySelector<HTMLElement>(SELECTORS.actionsBox)?.removeAttribute(WIDE_ATTR);
}

/** Marks a button already sized to its neighbour. */
const MATCHED_ATTR = "data-aue-matched";

/**
 * Sizes the button and places its icon like the Torn button beside it.
 *
 * Torn's icons are pictures on its buttons, sized and placed by its own
 * stylesheet, so the neighbour is measured rather than its numbers copied.
 */
function matchNeighbour(rowElement: HTMLElement): void {
  const option = rowElement.querySelector<HTMLElement>(".aue-display-option");
  const button = option?.querySelector<HTMLElement>(".aue-display-button");
  const neighbour = option?.nextElementSibling;
  const theirs = neighbour?.querySelector<HTMLElement>("button");
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

/** Marks an actions box already widened, holding the width it was given. */
const WIDE_ATTR = "data-aue-wide";

/** What can give up room beside the actions, so the widths it was given can be taken off again. */
const NARROWED = [SELECTORS.title, SELECTORS.nameWrap, SELECTORS.bonuses];

/** Gives a row back the widths Torn gave it. */
function unwiden(rowElement: HTMLElement): void {
  const box = rowElement.querySelector<HTMLElement>(SELECTORS.actionsBox);
  box?.style.removeProperty("width");
  for (const selector of NARROWED) {
    rowElement.querySelector<HTMLElement>(selector)?.style.removeProperty("width");
  }
  rowElement.querySelector<HTMLElement>(SELECTORS.bonuses)?.style.removeProperty("right");
}

/** Takes a slot's width off an element, as Torn's stylesheet states it, padding not included. */
function narrow(element: HTMLElement | null, by: number): void {
  if (!element) return;
  const own = parseFloat(getComputedStyle(element).width);
  if (own > by) element.style.setProperty("width", `${own - by}px`, "important");
}

/** Whether an element sits on the same line as another. */
function level(a: Element, b: Element): boolean {
  return Math.abs(a.getBoundingClientRect().top - b.getBoundingClientRect().top) <= 2;
}

/**
 * Makes room for the fifth slot beside the item.
 *
 * The actions are a box floated right, sized by Torn for four slots, and
 * whatever shares their line is sized to fill the rest: the picture and name
 * in the full list view, the damage and accuracy in the middle-width one,
 * where the name has a line to itself above. The box grows by what its slots
 * measure, and that line's neighbour gives up the same. Bonuses pinned from
 * the right, as in the full list view, move over with it.
 *
 * Torn fixes each row's height, so something that wraps does not make the
 * row taller; it spills over the next one. Whether it worked is told by the
 * box staying where it was with its slots on one line, and a neighbour that
 * did not wrap; if not, all of it is undone.
 *
 * A row in a category not on show measures nothing and is left until it is.
 */
function widen(rowElement: HTMLElement): void {
  const box = rowElement.querySelector<HTMLElement>(SELECTORS.actionsBox);
  const option = rowElement.querySelector<HTMLElement>(".aue-display-slot");
  if (!box || !option || box.hasAttribute(WIDE_ATTR)) return;

  const boxWidth = box.getBoundingClientRect().width;
  if (boxWidth === 0) return;
  // The narrow layout's bar makes room by narrowing its slots instead.
  if (getComputedStyle(box).float !== "right" || rowElement.querySelector(SELECTORS.accordion)) {
    box.setAttribute(WIDE_ATTR, "");
    return;
  }

  // What the slots take side by side, borders and all, rounded up: adding
  // one slot's width was a couple of pixels short, and the last one wrapped.
  const slots = [...box.querySelectorAll<HTMLElement>(".actions-wrap > li.left")];
  const needed = Math.ceil(slots.reduce((sum, slotElement) => {
    const style = getComputedStyle(slotElement);
    return sum + slotElement.getBoundingClientRect().width + parseFloat(style.marginLeft) + parseFloat(style.marginRight);
  }, 0));
  const slot = needed - boxWidth;
  if (slot <= 0) {
    box.setAttribute(WIDE_ATTR, String(boxWidth));
    return;
  }

  const boxTop = box.getBoundingClientRect().top;
  const title = rowElement.querySelector<HTMLElement>(SELECTORS.title);
  const bonuses = rowElement.querySelector<HTMLElement>(SELECTORS.bonuses);
  const pinned = bonuses !== null && getComputedStyle(bonuses).position === "absolute";
  const titleBeside = title !== null && level(title, box);
  const bonusesBeside = bonuses !== null && !pinned && level(bonuses, box);
  const neighbour = titleBeside ? title : bonusesBeside ? bonuses : null;
  const neighbourHeight = neighbour?.getBoundingClientRect().height ?? 0;

  const width = boxWidth + slot;
  box.style.setProperty("width", `${width}px`, "important");
  if (titleBeside) {
    narrow(title, slot);
    narrow(rowElement.querySelector<HTMLElement>(SELECTORS.nameWrap), slot);
  }
  if (bonusesBeside) narrow(bonuses, slot);
  if (pinned) bonuses.style.setProperty("right", `${width}px`, "important");

  const lastSlot = slots[slots.length - 1];
  const stayed = Math.abs(box.getBoundingClientRect().top - boxTop) <= 1;
  const oneLine = !lastSlot || level(lastSlot, option);
  const neighbourKept = !neighbour || neighbour.getBoundingClientRect().height <= neighbourHeight + 1;
  if (!stayed || !oneLine || !neighbourKept) {
    unwiden(rowElement);
    box.setAttribute(WIDE_ATTR, "");
    log("display case: no room for a fifth slot in", rowElement.dataset.rowkey);
    return;
  }
  box.setAttribute(WIDE_ATTR, String(width));
}

/**
 * Works the buttons and panels from listeners on the page.
 *
 * Torn redraws its item rows, and a copy of an element carries no listeners,
 * so nothing is bound to the elements themselves. Caught on the way down, so
 * Torn's own handler for the row's buttons never takes ours for one of its.
 */
function installListeners(): void {
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      // Showing a category already loaded changes no rows, so the page
      // watcher does not see it. Its rows are measured once it is drawn.
      if (!target.closest(".aue-display")) setTimeout(scan, SETTLE_MS * 2);

      // Clicking a different item puts away a panel open on another.
      const clickedRow = target.closest(SELECTORS.row);
      if (clickedRow) closePanels(clickedRow.querySelector(".aue-display"));

      const option = target.closest(".aue-display-option");
      if (option) {
        event.preventDefault();
        event.stopPropagation();
        togglePanel(option.getAttribute(ROW_ATTR) ?? "");
        return;
      }

      const panel = target.closest<HTMLElement>(".aue-display");
      if (!panel) return;
      event.stopPropagation();
      if (target.closest(".aue-display-close")) {
        event.preventDefault();
        panel.hidden = true;
      } else if (target.closest(".aue-display-add")) askToAdd(panel);
      else if (target.closest(".aue-display-yes")) void addNow(panel);
      else if (target.closest(".aue-display-no")) cancelAdd(panel);
    },
    true,
  );

  // Anything but digits is refused before it lands, and too many is pulled
  // back to how many are held.
  document.addEventListener(
    "beforeinput",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || !target.closest(".aue-display .aue-send-amount")) return;
      if (event.data && /\D/.test(event.data)) event.preventDefault();
    },
    true,
  );
  document.addEventListener(
    "input",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || !target.closest(".aue-display .aue-send-amount")) return;
      const panel = target.closest<HTMLElement>(".aue-display");
      const held = panel ? String(heldFor(panel)) : "";
      const cleaned = cleanAmount(target.value, held);
      if (cleaned !== target.value) target.value = cleaned;
    },
    true,
  );

  // Enter adds nothing, so a slip of the key cannot move an item.
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Enter") return;
      const target = event.target;
      if (target instanceof Element && target.closest(".aue-display")) event.preventDefault();
    },
    true,
  );
}

/** Adds a display case button to each item on the items page. */
export function installDisplayCase(): void {
  if (!isEnabled(DISPLAY_CASE_BUTTON)) {
    log("display case: switched off");
    return;
  }
  installListeners();
  scan();

  // Torn changes layout as the window narrows, after a pause for the
  // resize to finish, as its own layout lands a moment later.
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
