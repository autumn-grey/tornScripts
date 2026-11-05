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

import { log } from "./debug";
import { INDEPENDENT_CHAT_TABS, isEnabled } from "./settings";

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

/** The strip at the top of a chat window that can be taken hold of. */
const HEADER_DEPTH = 34;
/** How far a grab travels before it is a drag and not a slipped click. */
const DRAG_THRESHOLD = 24;
/** How far above a button the row that holds the whole bar is looked for. */
const TASKBAR_CLIMB = 4;
/** Controls a grab must not start on, since they already do something. */
const NOT_A_HANDLE = `input, textarea, a, ${MINIMISE_SELECTOR}, ${CLOSE_SELECTOR}`;

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
  if (!isEnabled(INDEPENDENT_CHAT_TABS)) return "right";
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
function setOffset(wrapper: HTMLElement, x: number): void {
  const wanted = Math.abs(x) < 0.5 ? "" : `${Math.round(x * 10) / 10}px 0`;
  if (wrapper.style.translate === wanted) return;

  // A window being placed for the first time has nowhere to travel from,
  // so it must not travel: it is put where it belongs with the movement
  // switched off for that one write. Only a window already in place and
  // going somewhere else should be seen to move.
  const firstPlacing = wrapper.style.translate === "";
  if (firstPlacing) wrapper.classList.add(INSTANT_CLASS);

  allowSmoothOffset(wrapper);
  if (wanted === "") wrapper.style.removeProperty("translate");
  else wrapper.style.setProperty("translate", wanted, "important");

  if (firstPlacing) {
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

/** Returns every chat window Torn currently has on the page. */
function chatWindows(): ChatWindow[] {
  const found: ChatWindow[] = [];
  for (const button of document.querySelectorAll(MINIMISE_SELECTOR)) {
    const box = boxOf(button);
    const wrapper = box && wrapperOf(box);
    if (box && wrapper) found.push({ id: box.id, wrapper });
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
    bar.style.setProperty("flex-direction", "row-reverse", "important");
  } else {
    bar.style.removeProperty("flex-direction");
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
  if (element.style.transform.includes("translateX(")) return true;

  // A window only just added has not been given a position yet, and
  // skipping it until Torn gets round to that is what left it sitting at
  // the far end of the row for a moment and then jumping. Holding a window
  // is enough to make it ours to place, position or no position.
  return element.querySelector(":scope > div > div[id]") !== null;
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
  const chat = bar.indexOf(id);
  return PANEL_ORDER.length + (chat >= 0 ? chat : bar.length);
}

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

  // Any width already known stands in for one not yet measured.
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
    .filter((item) => item.width > 0);

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
    return;
  }
  // From the left the order is ours and fixed. From the right the row is
  // Torn's own and only the holes are being closed, so its order stands:
  // its offsets run 0, -303, -606 away from the edge, and sorting by them
  // descending puts the windows back in the order it drew them.
  if (side === "left") {
    const bar = barOrder();
    visible.sort((a, b) => slotOf(a.wrapper, bar) - slotOf(b.wrapper, bar));
  } else {
    visible.sort((a, b) => b.torn - a.torn);
  }

  const first = visible[0];
  if (!first) return;
  if (rowWidth === 0) measureRow();
  const containerWidth = rowWidth;
  if (containerWidth === 0) return;
  const gap = spacingGap(items, first.width);

  // Walk the row, giving each window the next place along. The distance
  // moved is each window's own width, never the distance between what is
  // left: hide the middle of three and the two survivors sit twice a
  // window apart, which says nothing about how wide a window is.
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
    setOffset(chat.wrapper, target - natural);
    used += chat.width + gap;
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
 * A chat this tab has not met before has either just been opened here, which
 * a click a moment ago stands for, or been opened in another tab and arrived
 * through Torn's sync - and the second kind is hidden on arrival, so opening
 * a chat somewhere else does not open it here.
 */
function apply(): void {
  if (!isEnabled(INDEPENDENT_CHAT_TABS)) {
    for (const hiddenWindow of document.querySelectorAll(`.${HIDDEN_CLASS}`)) {
      hiddenWindow.classList.remove(HIDDEN_CLASS);
    }
    relayout();
    return;
  }

  const hidden = readSet(HIDDEN_KEY);
  const known = readSet(KNOWN_KEY);
  const fresh = tabIsNew();
  const openedHere = focusedOnArrival;
  let changed = false;
  let seen = 0;

  for (const button of document.querySelectorAll(MINIMISE_SELECTOR)) {
    const box = boxOf(button);
    const wrapper = box && wrapperOf(box);
    if (!box || !wrapper) continue;
    seen += 1;

    if (!known.has(box.id)) {
      known.add(box.id);
      changed = true;
      // A tab opening for the first time takes what is already on screen as
      // its own. After that, a chat appearing in the tab being used was
      // opened there, and one appearing in a background tab was not.
      if (!fresh && !openedHere) {
        hidden.add(box.id);
        log("chat:", box.id, "was opened in another tab, so hidden here");
      }
    }

    wrapper.classList.toggle(HIDDEN_CLASS, hidden.has(box.id));
  }

  if (changed || fresh) {
    writeSet(KNOWN_KEY, known);
    writeSet(HIDDEN_KEY, hidden);
  }

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
    swallow(event);
    hide(box.id);
    return;
  }

  const tab = target.closest(TASKBAR_SELECTOR);
  if (tab) {
    const id = tab.id.slice(TASKBAR_PREFIX.length);
    if (!id) return;

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

/** The window being dragged, and where the grab started. */
let dragFrom: number | null = null;

/** Clears text a drag swept over on its way across the screen. */
function dropSelection(): void {
  try {
    getSelection()?.removeAllRanges();
  } catch {}
}

/**
 * Starts a drag, but only from a window's top edge.
 *
 * Anywhere else in a chat is for reading and selecting text, and a drag
 * begun there would fight with both. The top strip is where a window is
 * taken hold of in every other program, so it is where it is taken hold of
 * here.
 */
function onPointerDown(event: PointerEvent): void {
  dragFrom = null;
  if (!isEnabled(INDEPENDENT_CHAT_TABS)) return;

  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest(NOT_A_HANDLE)) return;

  const box = boxOf(target);
  if (!box) return;

  const depth = event.clientY - box.getBoundingClientRect().top;
  if (depth > HEADER_DEPTH) {
    log("chat: grab", Math.round(depth), "px down, below the top strip");
    return;
  }

  dragFrom = event.clientX;
  log("chat: grabbed", box.id, "- drag across the screen to move the bar");
}

/**
 * Moves the bar once a drag crosses the middle of the screen.
 *
 * The bar follows as soon as the pointer is past halfway rather than waiting
 * to be let go, so it is clear what the drag is doing while it is happening.
 *
 * Nothing here cancels the browser's own handling. A title bar is a line of
 * text as well as a handle, and refusing the default is what stops it being
 * selected. A drag short of the middle is therefore an ordinary selection,
 * and one that does move the bar clears up after itself below.
 */
function onPointerMove(event: PointerEvent): void {
  if (dragFrom === null) return;
  if (Math.abs(event.clientX - dragFrom) < DRAG_THRESHOLD) return;

  const wanted = event.clientX < window.innerWidth / 2 ? "left" : "right";
  if (wanted === barSide()) return;
  setBarSide(wanted);
  relayout();
  dropSelection();
  log("chat: bar moved to the", wanted);
}

/** Ends a drag, whatever came of it. */
function onPointerUp(): void {
  dragFrom = null;
}

/** Windows already being watched, and rows already being watched. */
const watchedItems = new WeakSet<Element>();
const watchedRows = new WeakSet<Element>();

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
    new MutationObserver(queueRelayout).observe(row, { childList: true });
  }
  for (const item of items) {
    if (watchedItems.has(item)) continue;
    watchedItems.add(item);
    new MutationObserver(queueRelayout).observe(item, {
      attributes: true,
      attributeFilter: ["style"],
    });
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
  const hidden = [...readSet(HIDDEN_KEY)].filter((id) => SAFE_ID.test(id));
  if (hidden.length === 0) return;

  const style = document.createElement("style");
  style.textContent = hidden
    .map((id) => `div:has(> div > div[id="${id}"]) { display: none !important; }`)
    .join("\n");
  (document.head ?? document.documentElement).appendChild(style);
  earlyHide = style;
  log("chat: holding back", hidden.length, "window(s) until the page settles");

  setTimeout(liftEarlyHide, FAILSAFE_MS);
}

/** Keeps chat windows open and minimised per tab rather than per account. */
export function installLocalChat(): void {
  addEventListener("click", onClick, true);
  addEventListener("pointerdown", onPointerDown, true);
  addEventListener("pointermove", onPointerMove, true);
  addEventListener("pointerup", onPointerUp, true);
  addEventListener("pointercancel", onPointerUp, true);
  // A narrower window moves the right-hand edge, and with it every sum above.
  addEventListener("resize", schedulePass);

  // Torn's pages never stop changing - messages arriving, timers counting
  // down - and a pass measures windows, which forces the browser to lay the
  // page out. Running one per mutation would do that many times a second,
  // so a burst is allowed to settle first.
  new MutationObserver(() => {
    focusedOnArrival = isTheActiveTab();
    schedulePass();
  }).observe(document.body, { childList: true, subtree: true });

  apply();
}
