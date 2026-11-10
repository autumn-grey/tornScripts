// Chat windows that open and minimise in one tab without following you round.
//
// Torn keeps one set of open chats for your account, so minimising in one tab
// minimises everywhere and opening in one opens everywhere. That state is the
// server's and is not ours to change - but it does not have to be obeyed to
// the pixel. This takes over the minimise button before Torn hears the click
// and hides the window here instead, leaving Torn's own idea of the chat
// untouched and so unsynced. Torn still thinks it is open, which is what puts
// it in the taskbar, and that button is taken over the same way to bring it
// back.
//
// Close is left alone. It stays the one control that means everywhere, and is
// the way out if a chat should go for good.
//
// Written after reading Deviyl's Torn Chat Hider, which is where the idea of
// a second, local hide kept in sessionStorage comes from.

import { noteUndone } from "./clash";
import { log } from "./debug";
import { onlyOurs } from "./ownChanges";
import { CHAT_SIDE_BUTTON, INDEPENDENT_CHAT_TABS, isEnabled } from "./settings";

/** Everything chat lives inside. */
const CHAT_ROOT_SELECTOR = "#chatRoot";
/**
 * The ids Torn gives its chat windows, the same prefixes TornW3B matches on.
 * Steadier than the minimise control's wording, which is the second net.
 */
const CHAT_ID_SELECTOR =
  'div[id^="public_"], div[id^="private-"], div[id^="faction"], div[id^="company"], div#staff';
/** Torn's minimise control. The label carries the chat's name after it. */
const MINIMISE_SELECTOR = 'svg[aria-label^="Minimize"]';
/** Torn's close control, which this feature never interferes with. */
const CLOSE_SELECTOR = 'svg[aria-label^="Close chat"]';
/** A chat's button along the bottom bar. */
const TASKBAR_PREFIX = "chat_panel_button:";
const TASKBAR_SELECTOR = `button[id^="${TASKBAR_PREFIX}"]`;
/** The element carrying a chat's id. Its grandparent is what gets moved. */
const BOX_SELECTOR = "div[id]";
/** Ids belonging to the panel furniture rather than to a chat. */
const NOT_A_CHAT = /_panel$/;

/** The class that takes a chat window out of this tab. */
const HIDDEN_CLASS = "aue-chat-hidden";
/**
 * Marks the row as being laid out from the left.
 *
 * Its stylesheet rule switches Torn's own positioning off. Everything then
 * sits where this file puts it, in a plain order, and no movement of Torn's
 * has to be answered or undone - which is what made windows swing across
 * and shake when their place was worked out relative to Torn's.
 */
const LEFT_CLASS = "aue-chat-left";
/** Marks a window that is being put somewhere without being seen to move. */
const INSTANT_CLASS = "aue-chat-instant";

/**
 * Where a tab's own chat state lives.
 *
 * sessionStorage, not localStorage, and that is the whole feature: a tab gets
 * its own copy and shares it with nobody, which is precisely what Torn's own
 * state refuses to do.
 */
const HIDDEN_KEY = "AUE_CHAT_HIDDEN";
const KNOWN_KEY = "AUE_CHAT_KNOWN";
const SIDE_KEY = "AUE_CHAT_SIDE";
/** The private chats list, whose entries open a chat. */
const PEOPLE_PANEL_SELECTOR = "#people_panel";
/** How long after a click in that list the chat it opens is waited for. */
const MENU_OPEN_MS = 3000;

/** How far above a button the row that holds the whole bar is looked for. */
const TASKBAR_CLIMB = 4;
/** The button in the bar that moves the chats from one side to the other. */
const SIDE_BUTTON_ID = "aue-chat-side";
/** Marks the button as showing the chats on the left. */
const SIDE_BUTTON_LEFT = "aue-chat-side-left";

/** How long the pre-hide may last before it lifts whatever else happens. */
const FAILSAFE_MS = 5000;
/** Settles a burst of Torn's own rendering before the page is read again. */
const SETTLE_MS = 120;
/** The longest a pass can be held off while mutations keep arriving. */
const MAX_SETTLE_MS = 600;

/** Ids are read back into selectors, so only these characters are allowed. */
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

/** The rules holding hidden windows back until the first pass has run. */
let earlyHide: HTMLStyleElement | null = null;

/**
 * Takes the pre-hide away.
 *
 * Called once a pass has seen Torn's chat windows and put its own class on
 * them, since from that moment the class does the hiding and the stylesheet
 * is only in the way - and called by a timer regardless, so that a fault
 * cannot leave a tab with its chats invisible.
 */
function liftEarlyHide(): void {
  if (!earlyHide) return;
  earlyHide.remove();
  earlyHide = null;
}

/**
 * Whether the tab held the focus when Torn last changed the page.
 *
 * Read as the mutation arrives rather than when the pass runs: the pass is
 * held back to let a burst settle, and by then the reader may have moved to
 * another tab, which would attribute a chat to the wrong one.
 */
let focusedOnArrival = true;

/**
 * Whether this is the tab the reader is working in.
 *
 * When a chat appears, this says whether they opened it here or whether it
 * arrived from another tab through Torn's sync. The tab being used has the
 * focus; the ones sitting in the background do not. Nothing is timed and
 * nothing waits - the question is answered the instant the window turns up.
 */
function isTheActiveTab(): boolean {
  try {
    return document.hasFocus();
  } catch {
    return true;
  }
}

/** Returns a stored set of chat ids. */
function readSet(key: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

/** Stores a set of chat ids for this tab alone. */
function writeSet(key: string, ids: Set<string>): void {
  try {
    sessionStorage.setItem(key, JSON.stringify([...ids]));
  } catch {}
}

/**
 * Whether this page load is a new tab starting with every chat hidden.
 *
 * Torn believes every chat is open, so a new tab would otherwise show the
 * lot. It lasts FAILSAFE_MS from the page starting, long enough for Torn to
 * draw the chats it already had, so a chat opened later in the tab is not
 * caught. Torn can draw them one at a time, which is why it is not ended by
 * the first one turning up.
 */
let startHidden = false;

/** A click in the private chats list: each piece of text in the entry, and until when they count. */
let menuOpen: { texts: string[]; until: number } | null = null;

/** Returns the name a chat window's minimise control carries. */
function chatName(box: Element): string {
  const label = box.querySelector(MINIMISE_SELECTOR)?.getAttribute("aria-label") ?? "";
  return label.replace(/^Minimi[sz]e\s*(chat\s*(with)?\s*)?/i, "").trim();
}

/**
 * Whether a chat is the one just picked from the private chats list.
 *
 * A match uses the pick up, so minimising the chat straight afterwards is
 * not undone by the same pick a moment later.
 */
function pickedFromMenu(box: Element): boolean {
  if (!menuOpen || Date.now() > menuOpen.until) return false;
  const name = chatName(box);
  // The whole of one piece of text, so picking "Alex" does not open "Al",
  // and a name run together with the last message beside it still matches.
  if (name === "" || !menuOpen.texts.includes(name)) return false;
  menuOpen = null;
  return true;
}

/** Whether this tab has been here before, or is opening its first page. */
function tabIsNew(): boolean {
  try {
    return sessionStorage.getItem(KNOWN_KEY) === null;
  } catch {
    return true;
  }
}

/** Returns which side of the screen this tab keeps its chats on. */
function barSide(): "left" | "right" {
  // Off, or on mobile, puts the chats back where Torn keeps them.
  if (!isEnabled(CHAT_SIDE_BUTTON)) return "right";
  try {
    return sessionStorage.getItem(SIDE_KEY) === "left" ? "left" : "right";
  } catch {
    return "right";
  }
}

/** Remembers the side, for this tab only. */
function setBarSide(side: "left" | "right"): void {
  try {
    sessionStorage.setItem(SIDE_KEY, side);
  } catch {}
}

/** Returns the horizontal offset Torn has given a chat window. */
function tornOffset(wrapper: HTMLElement): number {
  const match = /translateX\((-?[\d.]+)px\)/.exec(wrapper.style.transform);
  return match ? Number(match[1]) : 0;
}

/**
 * Lets a window's `translate` animate the way its `transform` already does.
 *
 * Torn transitions `transform`, and only `transform`. Our offset lives on
 * `translate`, a separate property, so without this it jumps to its new
 * value while Torn's part of the movement glides - which reads as a window
 * snapping into place. Adding `translate` to the list it already transitions
 * borrows Torn's own duration and easing, so the two halves of the movement
 * travel together. Done once per window; the marker says it has been.
 */
function allowSmoothOffset(wrapper: HTMLElement): void {
  if (wrapper.dataset.aueEased === "1") return;
  wrapper.dataset.aueEased = "1";

  const already = getComputedStyle(wrapper).transitionProperty;
  if (already.includes("translate") || already.includes("all")) return;
  const widened = already === "none" ? "translate" : `${already}, translate`;
  wrapper.style.setProperty("transition-property", widened, "important");
}

/** The offset last written to each window, so one changed by someone else is noticed. */
const writtenOffsets = new WeakMap<HTMLElement, string>();

/**
 * Puts our own offset on a window, over the top of Torn's.
 *
 * `translate` is its own property, separate from `transform`, and the two
 * compose. Torn goes on animating its `transform` exactly as it always did,
 * and this rides along on top instead of overwriting it.
 *
 * Writing nothing when nothing has changed matters: these writes are watched,
 * so a write that changes no value would wake the watcher that caused it.
 */
function setOffset(wrapper: HTMLElement, x: number, instant = false): void {
  const wanted = Math.abs(x) < 0.5 ? "" : `${Math.round(x * 10) / 10}px 0`;
  if (wrapper.style.translate === wanted) return;

  // A window being placed for the first time has nowhere to travel from,
  // so it must not travel. Nor should the rest when one joins or leaves
  // the row: everything behind it shifts along by a window's width, and
  // watching that shift happen, once per window as a page loads, is the
  // stuttering. Moving them in the same instant the newcomer appears
  // leaves the row looking as though it was always that way.
  const placeAtOnce = instant || wrapper.style.translate === "";
  if (placeAtOnce) wrapper.classList.add(INSTANT_CLASS);

  allowSmoothOffset(wrapper);
  if (wanted === "") wrapper.style.removeProperty("translate");
  else wrapper.style.setProperty("translate", wanted, "important");
  // Read back rather than kept as written, since the browser may tidy the value.
  writtenOffsets.set(wrapper, wrapper.style.translate);

  if (placeAtOnce) {
    // Reading a size here makes the browser take the new position as the
    // starting point, so removing the class cannot set off a movement.
    void wrapper.offsetWidth;
    wrapper.classList.remove(INSTANT_CLASS);
  }
}

/** Returns the window that holds a chat and carries its position. */
function wrapperOf(box: Element): HTMLElement | null {
  const wrapper = box.parentElement?.parentElement;
  return wrapper instanceof HTMLElement ? wrapper : null;
}

/** Returns the chat box an element sits inside, if it is one. */
function boxOf(element: Element): HTMLElement | null {
  const box = element.closest<HTMLElement>(BOX_SELECTOR);
  if (!box || !box.id || NOT_A_CHAT.test(box.id)) return null;
  return box;
}

/** One chat window: the id it answers to, and the element that moves. */
interface ChatWindow {
  id: string;
  wrapper: HTMLElement;
}

/**
 * Whether an element with a chat-like id is a window's box.
 *
 * A message or panel inside a chat could carry a matching id too. A window's
 * box sits in a row item, and row items are the only things Torn gives an
 * inline translateX.
 */
function isWindowBox(box: HTMLElement): boolean {
  if (NOT_A_CHAT.test(box.id)) return false;
  return wrapperOf(box)?.style.transform.includes("translateX(") ?? false;
}

/** Returns every chat box Torn has on the page, found by id and by minimise control. */
function chatBoxes(): HTMLElement[] {
  const found = new Set<HTMLElement>();
  const root = document.querySelector(CHAT_ROOT_SELECTOR) ?? document;
  for (const box of root.querySelectorAll<HTMLElement>(CHAT_ID_SELECTOR)) {
    if (isWindowBox(box)) found.add(box);
  }
  // Catches a window Torn has not positioned yet, and any new kind of chat.
  for (const button of document.querySelectorAll(MINIMISE_SELECTOR)) {
    const box = boxOf(button);
    if (box) found.add(box);
  }
  return [...found];
}

/** Returns every chat window Torn currently has on the page. */
function chatWindows(): ChatWindow[] {
  const found: ChatWindow[] = [];
  for (const box of chatBoxes()) {
    const wrapper = wrapperOf(box);
    if (wrapper) found.push({ id: box.id, wrapper });
  }
  return found;
}

/**
 * Returns the bar of chat buttons and icons along the bottom.
 *
 * Found by climbing from one of its buttons to the row that holds the lot,
 * rather than by name: the class on it is hashed and will not survive Torn's
 * next deploy, while the shape of it - a flex row with the buttons inside -
 * will.
 */
function findTaskbar(): HTMLElement | null {
  let node = document.querySelector(TASKBAR_SELECTOR)?.parentElement ?? null;
  for (let step = 0; node && step < TASKBAR_CLIMB; step += 1) {
    const laidOutInARow = getComputedStyle(node).display === "flex";
    if (laidOutInARow && node.children.length > 1) return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * Turns the bottom bar round to match the side the chats are on.
 *
 * The bar is a flex row packed to its end, so reversing the row does both
 * halves of the job at once: the end it packs against becomes the left edge,
 * and the order mirrors, which puts the settings cog - last in the row, and
 * so furthest out - on the outside again at the other side of the screen.
 */
function layOutTaskbar(side: "left" | "right"): void {
  const bar = findTaskbar();
  if (!bar) return;
  if (side === "left") {
    if (reversedBar === bar && bar.style.flexDirection !== "row-reverse") {
      noteUndone(CHAT_SIDE_BUTTON.label, "the chat bar's direction", chatRoot());
    }
    bar.style.setProperty("flex-direction", "row-reverse", "important");
    reversedBar = bar;
  } else {
    bar.style.removeProperty("flex-direction");
    reversedBar = null;
  }
  placeSideButton(bar, side);
}

/** The bar last turned round, so a reversal undone by someone else is noticed. */
let reversedBar: HTMLElement | null = null;
/** The bar the left/right button was last put in, for the same reason. */
let buttonBar: HTMLElement | null = null;

/** Returns the element all of chat lives in, where other scripts' marks are looked for. */
function chatRoot(): Element | null {
  return document.querySelector(CHAT_ROOT_SELECTOR);
}

/**
 * Returns the classes of Torn's own round-icon bar buttons, closed and open.
 *
 * Worn by the left/right button so Torn's colours apply to it and follow any
 * restyle. Taken from the icon buttons, never a private chat's name tab, whose
 * classes give it a different shape. Null when there is nothing to copy.
 */
function nativeClasses(): { closed: string[]; opened: string[] } | null {
  let closed: string[] | null = null;
  const opened = new Set<string>();
  for (const button of document.querySelectorAll<HTMLElement>(TASKBAR_SELECTOR)) {
    // Private chats are listed by the person's numeric id.
    if (/^\d+$/.test(button.id.slice(TASKBAR_PREFIX.length))) continue;
    const classes = [...button.classList];
    for (const name of classes) if (name.startsWith("opened")) opened.add(name);
    // Only what every icon button shares: a chat with unread messages carries
    // a class that turns it green, and copying that turned this green too.
    const base = classes.filter((name) => !STATE_CLASS.test(name));
    closed = closed ? closed.filter((name) => base.includes(name)) : base;
  }
  return closed && closed.length > 0 ? { closed, opened: [...opened] } : null;
}

/** Classes on a bar button that say what state its chat is in, never copied as they stand. */
const STATE_CLASS = /^(opened|message|unread|new)/i;

/** Returns the left/right button, made on first use. */
function sideButton(): HTMLButtonElement {
  const existing = document.getElementById(SIDE_BUTTON_ID);
  if (existing instanceof HTMLButtonElement) return existing;

  const button = document.createElement("button");
  button.type = "button";
  button.id = SIDE_BUTTON_ID;
  // Coloured through CSS classes on the stops, the way Torn colours its own icons.
  button.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true">
<defs><linearGradient id="aue-arrow-fill" x1="0" y1="0" x2="0" y2="1">
<stop class="aue-arrow-start" offset="0"/><stop class="aue-arrow-end" offset="1"/>
</linearGradient></defs>
<path fill="url(#aue-arrow-fill)" d="M2 10 9.5 2.5V7H18v6H9.5v4.5Z"/>
</svg>`;
  button.addEventListener("click", () => {
    setBarSide(barSide() === "left" ? "right" : "left");
    relayout();
    log("chat: bar moved to the", barSide());
  });
  return button;
}

/**
 * Keeps the left/right button in the bar, pointing the way the chats would go.
 *
 * Its place in the DOM does not matter: its stylesheet rule gives it
 * `order: -1`, so the browser draws it first in the bar whatever Torn adds
 * or moves, and nothing here ever has to put it back in line.
 */
function placeSideButton(bar: HTMLElement, side: "left" | "right"): void {
  if (!isEnabled(CHAT_SIDE_BUTTON)) {
    document.getElementById(SIDE_BUTTON_ID)?.remove();
    return;
  }
  const button = sideButton();
  if (button.parentElement !== bar) {
    // Torn swapping in a new bar is ordinary; the same bar losing it is not.
    if (buttonBar === bar) {
      noteUndone(CHAT_SIDE_BUTTON.label, "the left/right button's place in the chat bar", chatRoot());
    }
    bar.prepend(button);
    buttonBar = bar;
  }

  // Only written when it changes, since the row is watched and a write wakes it.
  const left = side === "left";
  const native = nativeClasses();
  // With no open button to copy from, the open look would come out closed.
  const useNative = native !== null && (!left || native.opened.length > 0);
  const classes = [
    ...(useNative ? native.closed : []),
    ...(useNative && left ? native.opened : []),
    ...(useNative ? ["aue-native"] : []),
    ...(left ? [SIDE_BUTTON_LEFT] : []),
  ].join(" ");
  if (button.className !== classes) button.className = classes;
  const label = left ? "Move chats to the right" : "Move chats to the left";
  if (button.title !== label) {
    button.title = label;
    button.setAttribute("aria-label", label);
    const arrow = button.querySelector("svg");
    if (arrow) arrow.style.transform = left ? "scaleX(-1)" : "";
  }
}

/**
 * Returns the row Torn lays its chat windows out in.
 *
 * Found from a chat window where there is one, and from the bottom bar's
 * own parent where there is not - the row is still there, and may still
 * hold a panel, when every chat is closed.
 */
function windowRow(): HTMLElement | null {
  const fromChat = chatWindows()[0]?.wrapper.parentElement;
  if (fromChat) return fromChat;

  const bar = findTaskbar();
  const shell = bar?.parentElement;
  if (!bar || !shell) return null;
  for (const child of shell.children) {
    if (child !== bar && child instanceof HTMLElement) return child;
  }
  return null;
}

/**
 * Returns everything sitting in that row.
 *
 * Chat windows are not the only things in it. The settings panel and the
 * private chat list are laid out alongside them, by the same rules and in
 * the same steps, so they have to move with them - which is why this reads
 * the row itself rather than going looking for minimise buttons. Those
 * panels are deliberately not chats as far as hiding goes: they are nothing
 * to do with which conversations a tab is showing.
 */
function rowItems(): HTMLElement[] {
  const row = windowRow();
  if (!row) return [];
  return [...row.children].filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && isPositionedByTorn(child),
  );
}

/**
 * Whether an element in the row is one of the windows Torn places.
 *
 * The row holds more than windows: empty placeholders, and one-pixel spans
 * parked off-screen for screen readers. Those are not laid out and must not
 * be counted, or the spacing is read off a 1px element and the whole row
 * scatters. A window is told by the inline translateX Torn gives it, which
 * nothing else in the row has.
 */
function isPositionedByTorn(element: HTMLElement): boolean {
  // Said the other way round, because a menu opening for the first time is
  // built there and then: for a moment it is in the row with no position,
  // no size and nothing inside it, and anything that asks what it holds
  // will say it is not a window yet. It would then be left wherever it
  // landed - the far end of the row - until something looked again, which
  // is the menu seen to open on the right and come back. The row has only
  // two other kinds of child, and both say what they are.
  if (element.style.display === "none") return false;
  if (element.style.position === "fixed") return false;
  return true;
}

/** What each window measured last time anything was measured. */
const itemWidths = new WeakMap<Element, number>();
/** What the row measured, the figure every position is worked back from. */
let rowWidth = 0;

/**
 * Measures the row and everything in it.
 *
 * This is the only step that asks the browser where anything is, and asking
 * makes it work out the page's layout there and then. Doing that while
 * answering a window that has just moved would settle Torn's new position
 * first and leave our offset a frame behind it - which is the window being
 * seen to set off the wrong way. So measuring happens on the settled pass
 * and on a resize, and the answer uses what was measured then.
 */
function measureRow(): void {
  const row = windowRow();
  if (!row) return;
  rowWidth = row.getBoundingClientRect().width;
  for (const item of rowItems()) {
    itemWidths.set(item, item.getBoundingClientRect().width);
  }
}

/**
 * Returns a window's width without asking the browser where it is.
 *
 * A window opening has never been measured, and measuring it then would
 * cost the frame this whole arrangement exists to save - and a window
 * opening is exactly when the others have to move. So a stand-in is used:
 * the width of one already known, since Torn gives them all the same. The
 * settled pass measures properly a moment later and puts right anything
 * the stand-in got wrong.
 */
function widthOf(item: HTMLElement, standIn: number): number {
  const known = itemWidths.get(item);
  if (known !== undefined) return known;
  if (standIn > 0) return standIn;
  const measured = item.getBoundingClientRect().width;
  itemWidths.set(item, measured);
  return measured;
}

/** The fixed panels, in the order they sit counting in from the edge. */
const PANEL_ORDER = ["settings_panel", "people_panel", "notes_panel"];

/** Returns the id of the window held inside a row item. */
function windowIdOf(item: HTMLElement): string {
  return item.querySelector<HTMLElement>("div[id]")?.id ?? "";
}

/**
 * Whether a chat window belongs to a bar button.
 *
 * The two ids differ for all but faction and company: the bar says "trade"
 * for the window "public_trade", and gives a private chat the person's
 * numeric id where the window has a "private-" id built from both players'.
 */
function belongsTo(windowId: string, barId: string): boolean {
  if (windowId === barId || windowId === `public_${barId}`) return true;
  return windowId.startsWith("private-") && windowId.slice(8).split(/[-_]/).includes(barId);
}

/** Returns the id of the window a bar button stands for, or the button's own id when none is known. */
function windowIdFor(barId: string): string {
  const known = [...readSet(HIDDEN_KEY), ...chatBoxes().map((box) => box.id)];
  return known.find((id) => belongsTo(id, barId)) ?? barId;
}

/** Returns the chats in the order the bottom bar lists them. */
function barOrder(): string[] {
  return [...document.querySelectorAll<HTMLElement>(TASKBAR_SELECTOR)].map(
    (button) => button.id.slice(TASKBAR_PREFIX.length),
  );
}

/**
 * Returns where a window belongs in the row, counting in from the edge.
 *
 * Decided by what the window is, never by where Torn currently has it.
 * Torn slides its windows about and takes time doing it, so an order read
 * off their positions answers differently from one moment to the next -
 * which is a window opening somewhere unexpected and then moving. Settings
 * is always first, then the chat list, then notes, then the chats in the
 * order the bar lists them.
 */
function slotOf(item: HTMLElement, bar: string[]): number {
  const id = windowIdOf(item);

  const panel = PANEL_ORDER.indexOf(id);
  if (panel >= 0) return panel;

  const chat = bar.findIndex((barId) => belongsTo(id, barId));
  if (chat >= 0) {
    const place = PANEL_ORDER.length + chat;
    lastSlots.set(item, place);
    return place;
  }

  // A chat window can be on the page before its button reaches the bar.
  // Sending it to the end for those few moments and bringing it back is a
  // move nobody asked to see, so it keeps the place it had, and only a
  // window that has never had one goes to the end.
  return lastSlots.get(item) ?? PANEL_ORDER.length + bar.length;
}

/** The last arrangement written, so the log only says what changed. */
let lastLayout = "";
/** Which windows were in the row last time, to tell a join from a hide. */
let lastMembership = "";

/** Says something in the log, but not again until it changes. */
function sayOnce(what: string): void {
  if (what === lastLayout) return;
  lastLayout = what;
  log("layout:", what);
}

/** Where each window sat last time the bar was in a position to say. */
const lastSlots = new WeakMap<Element, number>();

/**
 * Returns the space Torn leaves between one item in the row and the next.
 *
 * Taken from the closest pair of positions it has handed out, across the
 * whole row including anything hidden here, since those still hold their
 * place in Torn's own reckoning and so still show its spacing.
 */
function spacingGap(items: HTMLElement[], width: number): number {
  const offsets = items.map(tornOffset).sort((a, b) => b - a);

  for (let index = 1; index < offsets.length; index += 1) {
    const apart = Math.abs((offsets[index] ?? 0) - (offsets[index - 1] ?? 0));
    if (apart > 0.5) return Math.max(0, apart - width);
  }
  return 0;
}

/**
 * Lays the row out along the chosen edge, leaving no holes.
 *
 * Torn positions each item from the right, a step apart, counting every
 * chat it believes is open - so a window hidden here leaves its place
 * empty. This works out where each visible item should actually go and
 * applies the difference. The same sum puts the row on the left instead.
 *
 * Reflecting the row with `scale` was tried instead of this and taken out
 * again: a scaled element becomes the reference for anything positioned
 * `fixed` inside it, which left the notes panel nowhere to be seen.
 */
function relayout(): void {
  const side = barSide();
  layOutTaskbar(side);
  windowRow()?.classList.toggle(LEFT_CLASS, side === "left");

  const row = windowRow();
  const items = rowItems();
  if (row) watchRow(row, items);

  // Sizes are taken again whenever the row gains or loses a window, since
  // a newcomer has none and a departure can change what is left.
  const membership = items.map(windowIdOf).join(",");
  if (membership !== lastMembership) {
    lastMembership = membership;
    measureRow();
  }

  // Any width already known stands in for one still unmeasured.
  let standIn = 0;
  for (const item of items) {
    const known = itemWidths.get(item);
    if (known !== undefined && known > standIn) standIn = known;
  }

  const visible = items
    .filter((item) => !item.classList.contains(HIDDEN_CLASS))
    .map((item) => ({
      wrapper: item,
      torn: tornOffset(item),
      width: widthOf(item, standIn),
    }))
    // Torn keeps empty placeholders in the row; they are not windows.
    .filter((item) => item.width > 0)
    // From the right, a window Torn has not positioned yet must be left
    // alone. Its place is worked out from where Torn has put it, so
    // placing it first and letting Torn place it second adds the two
    // together and lands it in the middle of the screen until the next
    // pass. From the left, Torn's placement is switched off, so there is
    // nothing to add and a new window can be put straight where it goes.
    .filter(
      (item) =>
        side === "left" ||
        item.wrapper.style.transform.includes("translateX("),
    );

  for (const item of items) {
    if (item.classList.contains(HIDDEN_CLASS)) setOffset(item, 0);
  }

  // With nothing hidden and the row where Torn puts it anyway, there is
  // nothing to correct. Saying so and stopping leaves the page exactly as
  // Torn drew it, rather than writing offsets that work out to roughly
  // zero - roughly is the difference between still and twitching.
  const anyHidden = items.some((item) =>
    item.classList.contains(HIDDEN_CLASS),
  );
  if (!anyHidden && side === "right") {
    for (const item of items) setOffset(item, 0);
    sayOnce("on the right with nothing hidden - left alone");
    return;
  }
  // From the left the order is ours and fixed. From the right the row is
  // Torn's own and only the holes are being closed, so its order stands:
  // its offsets run 0, -303, -606 away from the edge, and sorting by them
  // descending puts the windows back in the order it drew them.
  if (side === "left") {
    // The bar is shown reversed on this side, so the chat nearest the edge
    // is the last one the bar lists. Following the listed order instead
    // would read back to front against the buttons underneath it.
    const bar = barOrder().reverse();
    visible.sort((a, b) => slotOf(a.wrapper, bar) - slotOf(b.wrapper, bar));
  } else {
    visible.sort((a, b) => b.torn - a.torn);
  }

  const first = visible[0];
  if (!first) {
    sayOnce(`nothing to lay out - ${items.length} in the row`);
    return;
  }
  if (rowWidth === 0) measureRow();
  const containerWidth = rowWidth;

  // A row measured while the page is still being built can come back
  // narrower than a single window, and every position worked out from that
  // is wrong - which is a window landing in the middle of the screen and
  // correcting itself a moment later. Rather than place anything from a
  // figure that cannot be right, measure again and leave it for the next
  // pass, by which time the page has settled.
  if (containerWidth < first.width) {
    sayOnce(`row measured ${Math.round(containerWidth)} for a ${Math.round(first.width)} window - waiting`);
    measureRow();
    return;
  }
  const gap = spacingGap(items, first.width);

  // Walk the row, giving each window the next place along. The distance
  // moved is each window's own width, never the distance between what is
  // left: hide the middle of three and the two survivors sit twice a
  // window apart, which says nothing about how wide a window is.
  const placed: string[] = [];
  let used = 0;
  for (const chat of visible) {
    // From the left, Torn's own offset is switched off in the stylesheet,
    // so a window starts at the right-hand end of the row and is moved to
    // its slot from there. From the right it is still sitting where Torn
    // put it, so that has to be taken into account.
    const natural =
      side === "left"
        ? containerWidth - chat.width
        : containerWidth - chat.width + chat.torn;
    const target =
      side === "left" ? used : containerWidth - used - chat.width;
    // Only a window that has just arrived goes straight to its place.
    // The ones already there slide along to make room, which is the
    // movement worth seeing - putting them all at once made the row snap.
    setOffset(chat.wrapper, target - natural);
    placed.push(`${windowIdOf(chat.wrapper) || "?"}@${Math.round(target)}`);
    used += chat.width + gap;
  }

  const summary = `${side}: ${placed.join(" ")}`;
  if (summary !== lastLayout) {
    lastLayout = summary;
    log("layout", summary);
  }
}

/** The stylesheet giving hidden chats' bar buttons the closed look. */
const BAR_ICON_STYLE_ID = "aue-chat-bar-icons";

/**
 * Gives the bar buttons of chats hidden in this tab Torn's closed look.
 *
 * Torn still has them open, so it draws them dark. Done with a stylesheet
 * naming the buttons by id rather than a class on them, because Torn
 * rewrites their classes whenever it redraws them. The values are Torn's
 * own closed ones; a button with unread messages keeps its colour.
 */
function paintBarIcons(hidden: Set<string>): void {
  const buttons: string[] = [];
  for (const button of document.querySelectorAll<HTMLElement>(TASKBAR_SELECTOR)) {
    const barId = button.id.slice(TASKBAR_PREFIX.length);
    if ([...hidden].some((id) => belongsTo(id, barId))) buttons.push(`#${CSS.escape(button.id)}`);
  }
  const each = (suffix: string): string => buttons.map((button) => button + suffix).join(", ");
  const css =
    buttons.length === 0
      ? ""
      : `${each(':not([class*="message___"])')} {
  background: linear-gradient(#666666, #333333) !important;
  box-shadow: inset 0 0 4px rgba(255, 255, 255, 0.25), 0 -2px 4px rgba(0, 0, 0, 0.5) !important;
}
${each(':not([class*="message___"]):hover')} { background: linear-gradient(#888888, #444444) !important; }
${each(' svg defs stop[id="start"]')} { stop-color: #cccccc !important; }
${each(' svg defs stop[id="end"]')} { stop-color: #999999 !important; }
${each(':hover svg defs stop[id="start"]')} { stop-color: #ffffff !important; }
${each(':hover svg defs stop[id="end"]')} { stop-color: #cccccc !important; }`;

  let style = document.getElementById(BAR_ICON_STYLE_ID);
  if (!style) {
    if (css === "") return;
    style = document.createElement("style");
    style.id = BAR_ICON_STYLE_ID;
    (document.head ?? document.documentElement).appendChild(style);
  }
  if (style.textContent !== css) style.textContent = css;
}

/** The windows this tab wants hidden, so one shown again by someone else is noticed. */
const wantHidden = new WeakSet<HTMLElement>();

/** Hides or shows a window here, and remembers which was wanted. */
function setHidden(wrapper: HTMLElement, on: boolean): void {
  if (on) wantHidden.add(wrapper);
  else wantHidden.delete(wrapper);
  if (wrapper.classList.contains(HIDDEN_CLASS) !== on) {
    wrapper.classList.toggle(HIDDEN_CLASS, on);
  }
}

/** Takes a chat out of this tab, and remembers that it is out. */
function hide(id: string): void {
  const hidden = readSet(HIDDEN_KEY);
  hidden.add(id);
  writeSet(HIDDEN_KEY, hidden);
  apply();
  log("chat:", id, "hidden in this tab only");
}

/** Puts a chat back in this tab. */
function show(id: string): void {
  const hidden = readSet(HIDDEN_KEY);
  hidden.delete(id);
  writeSet(HIDDEN_KEY, hidden);
  apply();
  log("chat:", id, "back in this tab");
}

/** Forgets a chat, for when it is closed outright. */
function forget(id: string): void {
  const hidden = readSet(HIDDEN_KEY);
  const known = readSet(KNOWN_KEY);
  hidden.delete(id);
  known.delete(id);
  writeSet(HIDDEN_KEY, hidden);
  writeSet(KNOWN_KEY, known);
}

/**
 * Brings every chat window into line with what this tab wants.
 *
 * A new tab hides every chat it finds. After that, a chat this tab has not
 * met before has either just been opened here, which the tab having the
 * focus stands for, or been opened in another tab and arrived through Torn's
 * sync - and the second kind is hidden on arrival, so opening a chat
 * somewhere else does not open it here. A chat picked from the private chats
 * list is always shown, hidden or not.
 */
function apply(): void {
  if (!isEnabled(INDEPENDENT_CHAT_TABS)) {
    for (const hiddenWindow of document.querySelectorAll<HTMLElement>(`.${HIDDEN_CLASS}`)) {
      setHidden(hiddenWindow, false);
    }
    paintBarIcons(new Set());
    relayout();
    return;
  }

  const hidden = readSet(HIDDEN_KEY);
  const known = readSet(KNOWN_KEY);
  const openedHere = focusedOnArrival;
  let changed = false;
  let seen = 0;

  for (const box of chatBoxes()) {
    const wrapper = wrapperOf(box);
    if (!wrapper) continue;
    seen += 1;

    if (pickedFromMenu(box)) {
      if (hidden.delete(box.id)) {
        changed = true;
        log("chat:", box.id, "picked from the private chats list, so shown");
      }
      if (!known.has(box.id)) {
        known.add(box.id);
        changed = true;
      }
    } else if (!known.has(box.id)) {
      known.add(box.id);
      changed = true;
      // A chat appearing in the tab being used was opened there, and one
      // appearing in a background tab was not.
      if (startHidden || !openedHere) {
        hidden.add(box.id);
        log("chat:", box.id, startHidden ? "hidden as the tab is new" : "was opened in another tab, so hidden here");
      }
    }

    setHidden(wrapper, hidden.has(box.id));
  }

  if (changed) {
    writeSet(KNOWN_KEY, known);
    writeSet(HIDDEN_KEY, hidden);
  }
  paintBarIcons(hidden);

  // The class is on now, so the stylesheet that stood in for it can go.
  if (seen > 0) liftEarlyHide();

  // Sizes are taken here, where the cost of making the browser lay the page
  // out does not land in the middle of a window moving.
  measureRow();
  relayout();
}

/** Stops a click reaching Torn, so its own state is never told about it. */
function swallow(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

/**
 * Lets a Shift-click through to Torn, so it minimises or opens in every tab.
 *
 * Public chats have no close button, so without this Torn could never be
 * told one is closed. The tab's own hiding is dropped, leaving Torn's state
 * as the only one.
 */
function everywhere(id: string): void {
  forget(id);
  schedulePass();
  log("chat:", id, "left to Torn, for every tab");
}

/** Takes over the controls that would otherwise change the account's state. */
function onClick(event: MouseEvent): void {
  if (!isEnabled(INDEPENDENT_CHAT_TABS)) return;

  const target = event.target;
  if (!(target instanceof Element)) return;

  // Close keeps meaning close, everywhere, so it only needs tidying up after.
  const closing = target.closest(CLOSE_SELECTOR);
  if (closing) {
    const box = boxOf(closing);
    if (box) forget(box.id);
    return;
  }

  const minimising = target.closest(MINIMISE_SELECTOR);
  if (minimising) {
    const box = boxOf(minimising);
    if (!box) return;
    if (event.shiftKey) {
      everywhere(box.id);
      return;
    }
    swallow(event);
    hide(box.id);
    return;
  }

  const tab = target.closest(TASKBAR_SELECTOR);
  if (tab) {
    const barId = tab.id.slice(TASKBAR_PREFIX.length);
    if (!barId) return;
    const id = windowIdFor(barId);
    if (event.shiftKey) {
      everywhere(id);
      return;
    }

    // Hidden by us: ours to put back, and Torn must not hear about it.
    if (readSet(HIDDEN_KEY).has(id)) {
      swallow(event);
      show(id);
      return;
    }

    // Otherwise the click is only ours if the window is on screen, where
    // clicking the button means minimise. A window Torn is not showing -
    // absent, or present but collapsed because another tab minimised it -
    // is Torn's to restore, so the click goes through untouched and any
    // stale hiding of ours is dropped.
    const box = document.getElementById(id);
    const wrapper = box && wrapperOf(box);
    const onScreen = wrapper
      ? wrapper.getBoundingClientRect().width > 0
      : false;
    if (!onScreen) {
      forget(id);
      return;
    }

    swallow(event);
    hide(id);
  }
}

/** Windows already being watched, and rows already being watched. */
const watchedItems = new WeakSet<Element>();
const watchedRows = new WeakSet<Element>();
/** Whether a row has been found and put under watch yet. */
let rowIsWatched = false;

/**
 * Watches a row, and each window in it, for Torn moving things about.
 *
 * Narrow on purpose: the style attribute of the windows themselves, and
 * children arriving in or leaving the row. Watching the whole subtree would
 * fire on every message that lands in a chat.
 */
function watchRow(row: Element, items: Element[]): void {
  if (!watchedRows.has(row)) {
    watchedRows.add(row);
    rowIsWatched = true;
    new MutationObserver(queueRelayout).observe(row, { childList: true });
  }
  for (const item of items) {
    if (watchedItems.has(item)) continue;
    watchedItems.add(item);
    new MutationObserver((records) => {
      if (records.every(isOwnChange)) return;
      catchUndoing(item as HTMLElement);
      queueRelayout();
    }).observe(item, {
      attributes: true,
      attributeFilter: ["style", "class"],
      attributeOldValue: true,
      childList: true,
    });
  }
}

/** A detached element, used only to parse style attributes. */
const scratch = document.createElement("div");

/** Returns a style attribute with the properties this script writes taken out. */
function tornStyle(value: string | null): string {
  scratch.setAttribute("style", value ?? "");
  scratch.style.removeProperty("translate");
  scratch.style.removeProperty("transition-property");
  return scratch.style.cssText;
}

/** Returns a class attribute with this script's own classes taken out. */
function tornClasses(value: string | null): string {
  return (value ?? "")
    .split(/\s+/)
    .filter((name) => name !== "" && !name.startsWith("aue-"))
    .join(" ");
}

/**
 * Whether a change to a window touched only what this script writes.
 *
 * Those changes come from relayout itself, so answering them would only run
 * it again to reach the same answer. Compared with the attribute as it is now,
 * so a batch where Torn moved the window too is still seen as Torn's.
 */
function isOwnChange(record: MutationRecord): boolean {
  if (record.type !== "attributes" || !(record.target instanceof Element)) return false;
  const now = record.target.getAttribute(record.attributeName ?? "");
  if (record.attributeName === "class") {
    return tornClasses(record.oldValue) === tornClasses(now);
  }
  return tornStyle(record.oldValue) === tornStyle(now);
}

/**
 * Notices a window's hiding or offset taken off by something other than us.
 *
 * Puts the hiding back at once, since a chat this tab hid should not show.
 * The offset is put back by the relayout that follows. Each is counted, as
 * the same thing undone over and over is another script fighting this one.
 */
function catchUndoing(item: HTMLElement): void {
  if (wantHidden.has(item) && !item.classList.contains(HIDDEN_CLASS)) {
    item.classList.add(HIDDEN_CLASS);
    noteUndone(INDEPENDENT_CHAT_TABS.label, "a chat this tab has hidden", chatRoot());
  }
  const written = writtenOffsets.get(item);
  if (written !== undefined && item.style.translate !== written) {
    const feature = barSide() === "left" ? CHAT_SIDE_BUTTON : INDEPENDENT_CHAT_TABS;
    noteUndone(feature.label, "where the chat windows sit", chatRoot());
  }
}

/** Whether a layout is already waiting to run at the end of this batch. */
let layoutQueued = false;

/**
 * Lays the row out once, after everything in the current batch of changes.
 *
 * Opening one window moves every other, and each is watched separately, so
 * a single opening wakes this several times over. Running each time meant
 * laying the row out from half-finished information and then again from
 * the rest of it, which is the wobble. Waiting until the batch is done
 * gives one answer from the finished picture, still within the same frame.
 */
function queueRelayout(): void {
  if (layoutQueued) return;
  layoutQueued = true;
  queueMicrotask(() => {
    layoutQueued = false;
    relayout();
  });
}

/** When a settled pass is due, and how long it may be put off. */
let passTimer = 0;
let passDeadline = 0;

/**
 * Runs a pass once the page has stopped changing for a moment.
 *
 * Held off while mutations keep arriving, but never by more than
 * MAX_SETTLE_MS, so a page that never goes quiet is still brought into line.
 */
function schedulePass(): void {
  const now = Date.now();
  if (passDeadline === 0) passDeadline = now + MAX_SETTLE_MS;
  clearTimeout(passTimer);
  passTimer = window.setTimeout(
    () => {
      passDeadline = 0;
      apply();
    },
    Math.max(0, Math.min(SETTLE_MS, passDeadline - now)),
  );
}

/**
 * Hides, before Torn draws, whatever this tab had hidden when it last looked.
 *
 * Without this a hidden chat is painted and then taken away again, which is
 * a flash of the thing you asked not to see.
 *
 * It stays up until a pass has found the chat windows and put the class on
 * them, which is well after DOMContentLoaded: Torn builds its chat long
 * after the document is ready, so lifting at that point would leave nothing
 * hiding anything by the time there was anything to hide. The timer is the
 * backstop, so a fault cannot leave a tab with its chats invisible.
 */
export function hideChatsEarly(): void {
  if (!isEnabled(INDEPENDENT_CHAT_TABS)) return;

  let rules: string;
  if (tabIsNew()) {
    // A new tab has no ids yet and hides every chat, so the rule names none:
    // any window holding a minimise control, apart from Torn's own panels.
    startHidden = true;
    setTimeout(() => (startHidden = false), FAILSAFE_MS);
    rules = `div:has(> div > div[id]:not([id$="_panel"]) ${MINIMISE_SELECTOR}) { display: none !important; }`;
    log("chat: new tab, holding back every chat until the page settles");
  } else {
    const hidden = [...readSet(HIDDEN_KEY)].filter((id) => SAFE_ID.test(id));
    if (hidden.length === 0) return;
    rules = hidden
      .map((id) => `div:has(> div > div[id="${id}"]) { display: none !important; }`)
      .join("\n");
    log("chat: holding back", hidden.length, "window(s) until the page settles");
  }

  const style = document.createElement("style");
  style.textContent = rules;
  (document.head ?? document.documentElement).appendChild(style);
  earlyHide = style;
  setTimeout(liftEarlyHide, FAILSAFE_MS);
}

/**
 * Remembers a click in the private chats list, so the chat it opens is shown.
 *
 * Torn opens the chat for the whole account, and when it was already open
 * somewhere it changes nothing here - so a chat this tab had hidden would
 * stay hidden. The entry's words carry the person's name, which is matched
 * to the chat window's own name when it turns up or is already there.
 */
function onMenuClick(event: MouseEvent): void {
  if (!isEnabled(INDEPENDENT_CHAT_TABS)) return;
  const target = event.target;
  if (!(target instanceof Element) || !target.closest(PEOPLE_PANEL_SELECTOR)) return;

  const entry = target.closest("li, a, button, [role='button']") ?? target;
  // Each element's own text, without its children's: the name can sit beside
  // an icon in one element, and the last message in another.
  const texts: string[] = [];
  for (const element of [entry, ...entry.querySelectorAll("*")]) {
    const own = [...element.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? "")
      .join("")
      .trim();
    if (own === "") continue;
    texts.push(own);
    // The last message reads "Blaffle : i stole so much…", which names the
    // person even where nothing else in the entry does.
    const sender = /^(.+?)\s:\s/.exec(own)?.[1];
    if (sender) texts.push(sender.trim());
  }
  if (texts.length === 0) return;
  menuOpen = { texts, until: Date.now() + MENU_OPEN_MS };
  log("chat: picked from the private chats list:", texts);
  apply();
}

/** Keeps chat windows open and minimised per tab rather than per account. */
export function installLocalChat(): void {
  addEventListener("click", onClick, true);
  addEventListener("click", onMenuClick, true);
  // A narrower window moves the right-hand edge, and with it every sum above.
  // Crossing into the mobile layout also takes the button and the left side away.
  addEventListener("resize", schedulePass);

  // Torn's pages never stop changing - messages arriving, timers counting
  // down - and a pass measures windows, which forces the browser to lay the
  // page out. Running one per mutation would do that many times a second,
  // so a burst is allowed to settle first.
  new MutationObserver((records) => {
    if (onlyOurs(records)) return;
    focusedOnArrival = isTheActiveTab();
    // Until the row has been found there is nothing watching it, and the
    // settled pass is too far off: the first windows would be drawn where
    // Torn puts them and move afterwards. So until then, answer at once.
    if (!rowIsWatched) queueRelayout();
    schedulePass();
  }).observe(document.body, { childList: true, subtree: true });

  apply();
}
