// Hide Chats: an X on each private chat that moves it to a "Hidden chats" list.
//
// Torn keeps every conversation on its server, so nothing is deleted. The
// people hidden are kept here, and their chats are taken out of the list as it
// arrives: Torn loads the private chats list 20 at a time from a "dm" request,
// and the people hidden are removed from each reply before Torn sees it. Its
// list, scrolling and loading then run as they always do.
//
// Torn never sees a hidden chat, so the Hidden chats list is this script's
// own, drawn from what it kept of each one as it went past: name, picture,
// last message and when. A chat that turns up anyway (hidden this visit, or
// brought to the top of the list by a new message over Torn's live connection)
// is taken off the screen instead, with the rows under it moved up.
//
// The title of the panel becomes a menu between the two lists, and glows
// green while the list not shown has something new in it.

import { hashedClass } from "../shared/hashedClass";
import { log } from "./debug";
import { HIDE_CHATS, isEnabled, readSetting, writeSetting } from "./settings";

// Torn's markup, kept together: these are what breaks when Torn changes the panel.
const SELECTORS = {
  panel: "#people_panel",
  /** The title in the panel's header, "Your private chats" while the chats tab is open. */
  title: `button span${hashedClass("headingH1")}`,
  /** The block holding the search box and the list. */
  content: hashedClass("content"),
  /** The scrolling list Torn draws the rows into. */
  list: "#private-channel-list",
  /** One conversation; its id ends in the other player's id. */
  card: 'button[id^="private_chat_card_"]',
  /** The row holding the name and the time of the last message. */
  header: hashedClass("header"),
  /** The name link. */
  name: `a${hashedClass("title")}`,
  /** The time of the last message, "4 days ago". */
  time: hashedClass("metadata"),
  /** The last message, "Name : text". */
  description: hashedClass("description"),
} as const;

/** The private chats list request: ".../dm?offset=20". */
const DM_PATH = /\/dm$/;
/** The height Torn gives each row, which places them in its own layout. */
const ROW_HEIGHT = 68;
const CARD_PREFIX = "private_chat_card_";
/** Torn's title for the panel while its chats tab is open. */
const CHATS_TITLE = "Your private chats";

/** On the panel while the chats tab is open and this feature is at work. */
const ON_CLASS = "aue-hide-chats";
/** On the panel while the Hidden chats list is showing. */
const HIDDEN_MODE_CLASS = "aue-hide-chats-hidden";
/** On a row of Torn's that belongs to someone hidden. */
const OUT_CLASS = "aue-hide-chats-out";
/** On the menu while the list not shown has something new. */
const GLOW_CLASS = "aue-hide-chats-glow";
/** On the menu while its drop-down is open. */
const OPEN_CLASS = "aue-hide-chats-open";
const MENU_ID = "aue-hide-chats-menu";
const HIDDEN_LIST_ID = "aue-hide-chats-list";
/** The X on each row. Also read by the per-tab chat feature, which ignores clicks on it. */
export const HIDE_BUTTON_CLASS = "aue-hide-chats-x";

/** Where the ids of the people hidden are kept, as JSON. */
const HIDDEN_SETTING = "HIDE_CHATS_PEOPLE";
/** Where what is known of each hidden chat is kept, as JSON. */
const SAVED_SETTING = "HIDE_CHATS_SAVED";

type Mode = "shown" | "hidden";

/** What is kept of a hidden chat, to show it in the Hidden chats list. */
interface Saved {
  name: string;
  avatar: string;
  /** The last message as Torn shows it: "Name : text". */
  preview: string;
  /** When the last message was sent, or null when only Torn's "4 days ago" was seen. */
  when: number | null;
  whenText: string;
  /** A message from them has come in since the Hidden chats list was last looked at. */
  unread: boolean;
  /**
   * The last message as Torn's row on the page showed it. Kept apart from the
   * one from Torn's reply because the two are written differently (line
   * breaks, emoji), and comparing one with the other would read every hidden
   * chat as having a new message.
   */
  domPreview?: string | undefined;
}

/** One chat in Torn's "dm" reply, as far as this feature reads it. */
interface DmItem {
  otherUser?: { userId?: number; name?: string; avatar?: string };
  lastMessage?: { content?: string; createdAt?: number; sender?: { userId?: number; name?: string } };
}

/** Which list is showing. Every page opens on the chats not hidden. */
let mode: Mode = "shown";
/** A chat in Torn's list has a new message while the Hidden chats list is showing. */
let newInShown = false;
/** What Torn's list last showed as each chat's last message, to notice a new one. */
const lastPreview = new Map<string, string>();
/** Each chat Torn has been sent, by id, so one hidden from the list can be kept with its details. */
const seen = new Map<string, Saved>();
/** Where in Torn's list each hidden row was last seen, to move the rows under it up. */
const hiddenIndex = new Map<string, number>();

/** The values this feature last wrote into each element style, so it writes only on a change. */
const written = new WeakMap<HTMLElement, Map<string, string>>();

/**
 * Sets a style property only when it differs from what was last set. Every
 * write is a change to the page, which would wake this feature up again, so a
 * write of the same value would keep it running every frame.
 */
function setStyle(element: HTMLElement, property: string, value: string): void {
  let mine = written.get(element);
  if (!mine) written.set(element, (mine = new Map()));
  if (mine.get(property) === value) return;
  mine.set(property, value);
  element.style.setProperty(property, value);
}

/** Returns the ids of the people hidden. */
function hiddenIds(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(readSetting(HIDDEN_SETTING, "[]"));
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

/** Returns what is kept of each hidden chat. */
function savedChats(): Record<string, Saved> {
  try {
    const parsed: unknown = JSON.parse(readSetting(SAVED_SETTING, "{}"));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, Saved>) : {};
  } catch {
    return {};
  }
}

function writeSaved(saved: Record<string, Saved>): void {
  writeSetting(SAVED_SETTING, JSON.stringify(saved));
}

/** Returns text with Torn's HTML entities ("&quot;") turned back into characters. */
function decode(text: string): string {
  const box = document.createElement("textarea");
  box.innerHTML = text;
  return box.value;
}

/** Collapses runs of space and line breaks, so Torn's reply and its page compare equal. */
function flat(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Returns what to keep of one chat from Torn's reply. */
function fromItem(item: DmItem): Saved | null {
  const other = item.otherUser;
  const last = item.lastMessage;
  if (!other?.userId) return null;
  return {
    name: other.name ?? "",
    avatar: other.avatar ?? "",
    preview: last ? flat(`${last.sender?.name ?? ""} : ${decode(last.content ?? "")}`) : "",
    when: typeof last?.createdAt === "number" ? last.createdAt : null,
    whenText: "",
    unread: false,
  };
}

/** Whether a hidden chat's last message is from the other person. */
function fromThem(chat: Saved): boolean {
  return chat.preview.startsWith(`${chat.name} :`);
}

/**
 * Brings a hidden chat up to date from Torn's reply, and marks it unread when
 * a newer message than the one kept is theirs. Returns whether it changed.
 */
function updateFromReply(saved: Record<string, Saved>, id: string, fresh: Saved): boolean {
  const old = saved[id];
  if (!old) {
    saved[id] = fresh;
    return true;
  }
  const newer =
    old.when !== null && fresh.when !== null ? fresh.when > old.when : flat(old.preview) !== flat(fresh.preview);
  if (!newer && old.name === fresh.name && old.avatar === fresh.avatar) return false;
  saved[id] = { ...old, ...fresh, domPreview: old.domPreview, unread: old.unread || (newer && fromThem(fresh)) };
  return true;
}

/**
 * Brings a hidden chat up to date from its row on the page, which only shows
 * when a message brought it back over Torn's live connection or it was hidden
 * this visit. Only a change from the row as last seen is a new message.
 */
function updateFromRow(saved: Record<string, Saved>, id: string, card: Element): boolean {
  const row = fromCard(card);
  const dom = row.preview;
  const old = saved[id];
  if (!old) {
    saved[id] = { ...row, domPreview: dom };
    return true;
  }
  if (old.domPreview === dom) return false;
  if (old.domPreview === undefined) {
    saved[id] = { ...old, domPreview: dom };
    return true;
  }
  saved[id] = { ...old, ...row, when: Date.now(), domPreview: dom, unread: old.unread || fromThem(row) };
  return true;
}

/**
 * Takes the people hidden out of one "dm" reply, keeping what it says of them.
 * The total is lowered by those taken out, so Torn's count stays true.
 */
function filterReply(data: { items?: DmItem[]; total?: number }): number {
  if (!Array.isArray(data.items)) return 0;
  const hidden = hiddenIds();
  const saved = savedChats();
  let changed = false;
  const kept: DmItem[] = [];
  for (const item of data.items) {
    const id = String(item.otherUser?.userId ?? "");
    const fresh = fromItem(item);
    if (fresh) seen.set(id, fresh);
    if (!hidden.has(id)) {
      kept.push(item);
      continue;
    }
    if (fresh && updateFromReply(saved, id, fresh)) changed = true;
  }
  if (changed) writeSaved(saved);
  const removed = data.items.length - kept.length;
  data.items = kept;
  return removed;
}

/**
 * How far into Torn's list the server has been read, and how many chats
 * Torn has been given from it. They differ by the chats taken out.
 */
let serverRead = 0;
let givenToTorn = 0;

/**
 * Returns the offset to ask the server for. Torn asks for its next batch
 * either from the number of chats it holds, or from how far the server has
 * been read. In the first case, with chats taken out, the two differ, and the
 * offset is moved on to where the server was read to, or Torn would be sent
 * chats it already has.
 */
function serverOffset(asked: number): number {
  if (asked === 0) {
    serverRead = 0;
    givenToTorn = 0;
    return 0;
  }
  return asked === givenToTorn && givenToTorn !== serverRead ? serverRead : asked;
}

/** Returns the request with its offset changed, or as it was. */
function withOffset(input: RequestInfo | URL, offset: number): RequestInfo | URL {
  const url = new URL(input instanceof Request ? input.url : String(input), location.href);
  if (url.searchParams.get("offset") === String(offset)) return input;
  url.searchParams.set("offset", String(offset));
  return input instanceof Request ? new Request(url, input) : url.toString();
}

/**
 * Wraps the page's fetch so each private chats reply has the people hidden
 * taken out. Sends nothing of its own: the only request is Torn's, at most
 * with its offset moved on.
 */
export function installChatFilter(): void {
  if (!isEnabled(HIDE_CHATS)) return;
  const original = window.fetch;
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let url: URL;
    try {
      url = new URL(input instanceof Request ? input.url : String(input), location.href);
    } catch {
      return original.call(this, input, init);
    }
    if (!DM_PATH.test(url.pathname)) return original.call(this, input, init);

    const asked = Number(url.searchParams.get("offset") ?? "0") || 0;
    const offset = serverOffset(asked);
    if (offset !== asked) log("hide chats: Torn asked from", asked, "- moved on to", offset);
    const response = await original.call(this, withOffset(input, offset), init);
    try {
      const data = (await response.clone().json()) as { items?: DmItem[]; total?: number };
      if (!Array.isArray(data.items)) return response;
      const read = data.items.length;
      const removed = filterReply(data);
      serverRead = offset + read;
      givenToTorn += data.items.length;
      if (typeof data.total === "number") data.total -= serverRead - givenToTorn;
      if (removed > 0) log("hide chats: took", removed, "hidden chat(s) out of", read);
      schedule();
      const headers = new Headers(response.headers);
      headers.delete("content-length");
      headers.delete("content-encoding");
      return new Response(JSON.stringify(data), { status: response.status, statusText: response.statusText, headers });
    } catch {
      return response;
    }
  };
}

/** Reads what Torn's row shows of a chat, for one that turned up without passing the filter. */
function fromCard(card: Element): Saved {
  const link = card.querySelector(SELECTORS.name);
  // The link also holds status icons other scripts add, so only its own text is the name.
  const name = link
    ? [...link.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? "")
        .join("")
        .trim()
    : "";
  return {
    name,
    avatar: card.querySelector("img")?.getAttribute("src") ?? "",
    preview: flat(card.querySelector(SELECTORS.description)?.textContent ?? ""),
    when: null,
    whenText: (card.querySelector(SELECTORS.time)?.textContent ?? "").trim(),
    unread: false,
  };
}

/** Hides a chat, keeping what is known of it for the Hidden chats list. */
function hide(id: string, card: Element | null): void {
  const ids = hiddenIds();
  ids.add(id);
  writeSetting(HIDDEN_SETTING, JSON.stringify([...ids]));
  const saved = savedChats();
  const details = seen.get(id) ?? (card ? fromCard(card) : null);
  // The row as it reads now is the starting point, so only a later message counts as new.
  if (details) saved[id] = { ...details, unread: false, domPreview: card ? fromCard(card).preview : undefined };
  writeSaved(saved);
  log("hide chats: hid", id);
}

/** Brings a chat back. It shows in Torn's list again once the list next loads. */
function unhide(id: string): void {
  const ids = hiddenIds();
  ids.delete(id);
  writeSetting(HIDDEN_SETTING, JSON.stringify([...ids]));
  const saved = savedChats();
  delete saved[id];
  writeSaved(saved);
  hiddenIndex.delete(id);
  log("hide chats: brought back", id);
}

/** Returns a button that stops presses reaching the row it sits in. */
function rowButton(symbol: string, title: string, action: () => void): HTMLElement {
  const button = document.createElement("span");
  button.className = HIDE_BUTTON_CLASS;
  button.setAttribute("role", "button");
  button.tabIndex = 0;
  button.textContent = symbol;
  button.title = title;
  // The row is Torn's button for opening the chat, so a press on the X must not reach it.
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
    button.addEventListener(type, (event) => event.stopPropagation());
  }
  const run = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    action();
    pass();
  };
  button.addEventListener("click", run);
  button.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") run(event);
  });
  return button;
}

/** Returns a time as Torn writes it: "10 minutes ago", "4 days ago". */
function ago(when: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - when) / 60_000));
  const say = (count: number, unit: string) => (count === 1 ? `1 ${unit} ago` : `${count} ${unit}s ago`);
  if (minutes < 1) return "just now";
  if (minutes < 60) return say(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return say(hours, "hour");
  return say(Math.round(hours / 24), "day");
}

/** Returns one row of the Hidden chats list. */
function hiddenRow(id: string, chat: Saved): HTMLElement {
  const row = document.createElement("div");
  row.className = "aue-hide-chats-row";
  row.classList.toggle("aue-hide-chats-unread", chat.unread);

  const picture = document.createElement("img");
  picture.className = "aue-hide-chats-avatar";
  picture.alt = "";
  if (/^(https:\/\/|\/)/.test(chat.avatar)) picture.src = chat.avatar;

  const body = document.createElement("div");
  body.className = "aue-hide-chats-body";
  const head = document.createElement("div");
  head.className = "aue-hide-chats-head";
  const name = document.createElement("a");
  name.className = "aue-hide-chats-name";
  name.href = `/profiles.php?XID=${encodeURIComponent(id)}`;
  name.textContent = chat.name || `[${id}]`;
  const time = document.createElement("span");
  time.className = "aue-hide-chats-time";
  time.textContent = chat.when !== null ? ago(chat.when) : chat.whenText;
  head.append(
    name,
    time,
    rowButton("↩", "Unhide", () => unhide(id)),
  );
  const preview = document.createElement("div");
  preview.className = "aue-hide-chats-preview";
  preview.textContent = chat.preview;
  body.append(head, preview);
  row.append(picture, body);
  return row;
}

/** Draws the Hidden chats list over Torn's list: unread first, then newest first. */
function drawHiddenList(list: HTMLElement): void {
  const content = list.parentElement;
  if (!content) return;
  let box = document.getElementById(HIDDEN_LIST_ID);
  if (mode !== "hidden") {
    box?.remove();
    return;
  }
  if (!box) {
    box = document.createElement("div");
    box.id = HIDDEN_LIST_ID;
    content.append(box);
  }
  if (getComputedStyle(content).position === "static") setStyle(content, "position", "relative");
  // Over Torn's list rather than in place of it: Torn keeps its list drawn, so
  // a new message there can still be noticed and the menu lit up.
  setStyle(box, "top", `${list.offsetTop}px`);
  setStyle(box, "height", `${list.offsetHeight}px`);

  const hidden = hiddenIds();
  const saved = savedChats();
  const chats = [...hidden]
    .map((id): [string, Saved] => [id, saved[id] ?? { name: "", avatar: "", preview: "", when: null, whenText: "", unread: false }])
    .sort(([, a], [, b]) => Number(b.unread) - Number(a.unread) || (b.when ?? 0) - (a.when ?? 0));
  const key = JSON.stringify(chats);
  if (box.dataset.drawn === key) return;
  box.dataset.drawn = key;
  if (chats.length === 0) {
    const empty = document.createElement("div");
    empty.className = "aue-hide-chats-empty";
    empty.textContent = "No hidden chats";
    box.replaceChildren(empty);
  } else {
    box.replaceChildren(...chats.map(([id, chat]) => hiddenRow(id, chat)));
  }
}

/** Marks every hidden chat as seen, once the Hidden chats list has been looked at. */
function markHiddenRead(): void {
  const saved = savedChats();
  let changed = false;
  for (const chat of Object.values(saved)) {
    if (chat.unread) {
      chat.unread = false;
      changed = true;
    }
  }
  if (changed) writeSaved(saved);
}

/** The two lists the title menu offers. */
const MODES: [Mode, string][] = [
  ["shown", CHATS_TITLE],
  ["hidden", "Hidden chats"],
];

/** Returns the menu that replaces the panel's title: the list showing, and a drop-down of both. */
function buildMenu(): HTMLElement {
  const menu = document.createElement("div");
  menu.id = MENU_ID;
  const label = document.createElement("span");
  label.className = "aue-hide-chats-label";
  const drop = document.createElement("div");
  drop.className = "aue-hide-chats-drop";
  for (const [value, text] of MODES) {
    const item = document.createElement("div");
    item.className = "aue-hide-chats-item";
    item.dataset.mode = value;
    item.textContent = text;
    drop.append(item);
  }
  menu.append(label, drop);
  return menu;
}

/** Whether a point falls inside an element's box. */
function inside(element: Element, x: number, y: number): boolean {
  const box = element.getBoundingClientRect();
  return box.width > 0 && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
}

/** Switches between the two lists. */
function setMode(picked: Mode): void {
  if (picked === mode) return;
  if (mode === "hidden") markHiddenRead();
  mode = picked;
  newInShown = false;
  pass();
}

/**
 * Handles presses on the title menu before Torn sees them.
 *
 * The header is Torn's minimise button, and presses on the menu reached it
 * even with the menu drawn on top, so they are caught on the window, before
 * any of Torn's handlers, and matched to the menu by where they land.
 */
function onMenuPress(event: Event): void {
  const menu = document.getElementById(MENU_ID);
  if (!menu) return;
  const point = event instanceof TouchEvent ? event.changedTouches[0] : (event as MouseEvent);
  if (!point) return;
  const { clientX: x, clientY: y } = point;
  const open = menu.classList.contains(OPEN_CLASS);
  const items = [...menu.querySelectorAll<HTMLElement>(".aue-hide-chats-item")];
  const onLabel = inside(menu, x, y);
  const onItem = open ? items.find((item) => inside(item, x, y)) : undefined;
  if (!onLabel && !onItem) {
    if (open && event.type === "click") menu.classList.remove(OPEN_CLASS);
    return;
  }
  event.stopPropagation();
  if (event.cancelable && event.type !== "touchstart") event.preventDefault();
  if (event.type !== "click") return;
  if (onItem) {
    menu.classList.remove(OPEN_CLASS);
    setMode(onItem.dataset.mode === "hidden" ? "hidden" : "shown");
  } else {
    menu.classList.toggle(OPEN_CLASS, !open);
  }
}

/** Puts the menu over Torn's title, or takes it away while another tab of the panel is open. */
function placeMenu(panel: HTMLElement): HTMLElement | null {
  const title = panel.querySelector<HTMLElement>(SELECTORS.title);
  let menu = document.getElementById(MENU_ID);
  const onChats = title !== null && (title.textContent ?? "").trim() === CHATS_TITLE;
  if (!onChats || !title) {
    menu?.remove();
    if (title) setStyle(title, "visibility", "");
    return null;
  }
  if (!menu) {
    menu = buildMenu();
    panel.append(menu);
  }
  const label = menu.querySelector(".aue-hide-chats-label");
  const text = MODES.find(([value]) => value === mode)?.[1] ?? CHATS_TITLE;
  if (label && label.textContent !== text) label.textContent = text;
  setStyle(title, "visibility", "hidden");
  if (getComputedStyle(panel).position === "static") setStyle(panel, "position", "relative");
  const box = panel.getBoundingClientRect();
  const at = title.getBoundingClientRect();
  setStyle(menu, "left", `${at.left - box.left}px`);
  setStyle(menu, "top", `${at.top - box.top}px`);
  setStyle(menu, "height", `${at.height}px`);
  setStyle(menu, "font", getComputedStyle(title).font);
  return menu;
}

/** Returns a row's place in Torn's list, read from where Torn put it. */
function rowIndex(card: HTMLElement): number | null {
  const y = /translateY\((-?[\d.]+)px\)/.exec(card.style.transform)?.[1];
  return y === undefined ? null : Math.round(Number(y) / ROW_HEIGHT);
}

/**
 * Takes the rows of hidden people off the screen and moves the rows under
 * them up by as many rows. Torn places each row by its number in the list,
 * so the rows below one taken out are moved with a translate, which adds to
 * Torn's own placing instead of fighting it. Only a chat that got past the
 * filter is here, so there are few, and Torn's extra drawn rows cover the gap.
 */
function tidyTornList(list: HTMLElement, hidden: Set<string>, saved: Record<string, Saved>): boolean {
  let savedChanged = false;
  const cards = [...list.querySelectorAll<HTMLElement>(SELECTORS.card)];
  for (const card of cards) {
    const id = card.id.slice(CARD_PREFIX.length);
    const index = rowIndex(card);
    const isHidden = hidden.has(id);
    card.classList.toggle(OUT_CLASS, isHidden);
    if (isHidden && index !== null) hiddenIndex.set(id, index);

    const preview = flat(card.querySelector(SELECTORS.description)?.textContent ?? "");
    const before = lastPreview.get(id);
    lastPreview.set(id, preview);
    if (isHidden) {
      // Brought here over Torn's live connection: kept, and marked unread if it is theirs.
      if (updateFromRow(saved, id, card)) savedChanged = true;
    } else if (before !== undefined && before !== preview && mode === "hidden") {
      const name = fromCard(card).name;
      if (preview.startsWith(`${name} :`)) newInShown = true;
    }

    if (!card.querySelector(`.${HIDE_BUTTON_CLASS}`)) {
      card.querySelector(SELECTORS.header)?.append(rowButton("✕", "Hide", () => hide(id, card)));
    }
  }
  for (const id of hiddenIndex.keys()) if (!hidden.has(id)) hiddenIndex.delete(id);
  for (const card of cards) {
    const index = rowIndex(card);
    if (index === null) continue;
    let above = 0;
    for (const at of hiddenIndex.values()) if (at < index) above++;
    setStyle(card, "translate", above > 0 ? `0 ${-above * ROW_HEIGHT}px` : "");
  }
  return savedChanged;
}

let scheduled = false;

/** Brings the panel into line with the people hidden and the list being shown. */
function pass(): void {
  scheduled = false;
  const panel = document.querySelector<HTMLElement>(SELECTORS.panel);
  if (!panel) return;
  const list = panel.querySelector<HTMLElement>(SELECTORS.list);
  const menu = placeMenu(panel);
  const on = list !== null && menu !== null;
  panel.classList.toggle(ON_CLASS, on);
  panel.classList.toggle(HIDDEN_MODE_CLASS, on && mode === "hidden");
  if (!list || !menu) {
    document.getElementById(HIDDEN_LIST_ID)?.remove();
    return;
  }

  const hidden = hiddenIds();
  const saved = savedChats();
  if (tidyTornList(list, hidden, saved)) writeSaved(saved);
  drawHiddenList(list);

  const unreadHidden = [...hidden].some((id) => saved[id]?.unread);
  const glow = mode === "shown" ? unreadHidden : newInShown;
  menu.classList.toggle(GLOW_CLASS, glow);
}

/** Runs a pass once Torn has finished its current change. */
function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(pass);
}

/** Adds the hide buttons, the title menu and the Hidden chats list to the private chats panel. */
export function installHideChats(): void {
  if (!isEnabled(HIDE_CHATS)) return;
  // The panel is drawn and taken away as it opens and closes, and Torn moves
  // its rows by their style as the list scrolls, so both are watched.
  new MutationObserver((records) => {
    // Style changes count only inside the panel; elsewhere Torn animates all the time.
    const matters = records.some(
      (record) =>
        record.type !== "attributes" ||
        (record.target instanceof Element && record.target.closest(SELECTORS.panel) !== null),
    );
    if (matters) schedule();
  }).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["id", "style"],
  });
  for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend", "click"]) {
    addEventListener(type, onMenuPress, { capture: true, passive: false });
  }
  addEventListener("resize", schedule);
  // Leaving the page while looking at the hidden list counts as having seen it.
  addEventListener("pagehide", () => {
    if (mode === "hidden") markHiddenRead();
  });
  schedule();
}
