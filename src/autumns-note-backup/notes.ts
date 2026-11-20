// Watches the chat bar's Notes window and saves a version of the open note.
//
// A version is taken when a note is first seen (so every note opened gets a
// copy, including changes made on another device), a moment after typing
// stops, and just before the note's delete button or another note is picked.
//
// Torn's fields are React's: switching notes sets their values without an
// input event. So typing is caught from input events, and a switch is caught
// by checking the fields on a short timer. That timer only reads the page
// already on screen; this script sends no requests at all.

import { log } from "./debug";
import { addVersion, latestWithTitle, prune, putVersion, type Reason, versionsOf } from "./store";

// Every selector this script matches on, from the live Notes window.
export const SELECTORS = {
  panel: "#notes_panel",
  // The header is itself a button: icon, "Notes", minimise, maximise.
  header: "#notes_panel > button",
  minimize: '[class*="minimizeIcon___"]',
  title: '#notes_panel input[class*="title___"]',
  body: '#notes_panel textarea[class*="text___"]',
  // The cross beside the note picker, which deletes the open note.
  remove: '#notes_panel [class*="menu___"] > button',
  // The note picker's entries.
  pick: '#notes_panel [class*="list___"] [class*="item___"]',
};

/** How long after the last keystroke a version is taken. */
const TYPING_PAUSE_MS = 1500;
/** How often the fields are checked for another note having opened. */
const CHECK_MS = 700;
/**
 * Edits within this long of a version's start are folded into it, so typing
 * a paragraph leaves one version rather than dozens.
 */
const FOLD_MS = 60_000;
/**
 * The most of a version's text an edit may take out and still be folded into
 * it. Anything bigger (a cut, a paste over a selection) starts a new version,
 * so the text before it can still be brought back.
 */
const FOLD_LOSS = 20;
/** The most versions kept per note; the oldest go first. */
const KEEP = 300;

/** The open note: its key, and its fields as last read. */
interface Snapshot {
  key: string;
  title: string;
  body: string;
}

/** The newest stored version of a note, as this session knows it. */
interface Latest {
  id: number;
  title: string;
  body: string;
  reason: Reason;
  /** When this session started it, if it did; only those are folded into. */
  started?: number;
}

let open: Snapshot | null = null;
/** True while the note just seen is being matched to a key. */
let opening = false;
/** The last read that differed from the open note; a switch counts once a read repeats it. */
let candidate: { title: string; body: string } | null = null;
/** Typing not yet saved. */
let pending: Snapshot | null = null;
let pendingTimer = 0;
const latest = new Map<string, Latest>();
/** Every database step runs in order, so a fold never races its own add. */
let chain: Promise<void> = Promise.resolve();

/** Queues a database step behind the others. */
function enqueue(step: () => Promise<void>): Promise<void> {
  chain = chain.then(step).catch((error) => log("save failed", error));
  return chain;
}

/** Returns the open note's fields, when Notes is showing one. */
function readFields(): { title: string; body: string } | null {
  const title = document.querySelector<HTMLInputElement>(SELECTORS.title);
  const body = document.querySelector<HTMLTextAreaElement>(SELECTORS.body);
  if (!title || !body) return null;
  return { title: title.value, body: body.value };
}

/** Returns a new note key. */
function newKey(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Returns how many characters of `before` are gone from `after`, outside what they share at either end. */
function removed(before: string, after: string): number {
  const most = Math.min(before.length, after.length);
  let start = 0;
  while (start < most && before[start] === after[start]) start++;
  let end = 0;
  while (end < most - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
  return before.length - start - end;
}

/** Stores a version of a note, folding it into the last one where that loses nothing. */
async function write(snap: Snapshot, reason: Reason): Promise<void> {
  // An empty note holds nothing to bring back.
  if (snap.body.trim() === "") return;
  const known = latest.get(snap.key);
  if (known && known.body === snap.body && known.title === snap.title) return;
  const now = Date.now();
  const fold =
    reason === "edited" &&
    known?.reason === "edited" &&
    known.started !== undefined &&
    now - known.started < FOLD_MS &&
    removed(known.body, snap.body) <= FOLD_LOSS;
  const version = { note: snap.key, title: snap.title, body: snap.body, saved: now, reason };
  if (fold && known) {
    await putVersion({ ...version, id: known.id });
    latest.set(snap.key, { ...known, title: snap.title, body: snap.body });
    log("folded into", known.id, snap.title);
    return;
  }
  const id = await addVersion(version);
  latest.set(snap.key, { id, title: snap.title, body: snap.body, reason, started: now });
  log("saved", reason, id, snap.title);
  await prune(snap.key, KEEP);
}

/** Saves typing that is waiting for its pause, now. */
export function flush(): Promise<void> {
  window.clearTimeout(pendingTimer);
  const snap = pending;
  pending = null;
  return snap ? enqueue(() => write(snap, "edited")) : chain;
}

/** Saves the open note as it is now, before something replaces it. */
export function backup(reason: Reason): Promise<void> {
  void flush();
  const fields = readFields();
  if (!open || !fields || opening) return chain;
  const snap = { ...open, ...fields };
  return enqueue(async () => {
    await write(snap, reason);
    // Whatever replaces the note next starts a version of its own, never
    // folded into the one that holds what it replaced.
    const known = latest.get(snap.key);
    if (known) delete known.started;
  });
}

/** Matches a note that has just come into view to its key, and takes a version of it. */
function noteOpened(fields: { title: string; body: string }): void {
  opening = true;
  void enqueue(async () => {
    try {
      const key = (await latestWithTitle(fields.title))?.note ?? newKey();
      if (!latest.has(key)) {
        const newest = (await versionsOf(key))[0];
        if (newest?.id !== undefined) {
          latest.set(key, { id: newest.id, title: newest.title, body: newest.body, reason: newest.reason });
        }
      }
      open = { key, ...fields };
      await write(open, "opened");
    } finally {
      opening = false;
    }
  });
}

/** Checks whether another note is showing than the one last seen. */
function check(): void {
  if (document.hidden || opening) return;
  const fields = readFields();
  if (!fields) return;
  if (open && fields.title === open.title && fields.body === open.body) {
    candidate = null;
    return;
  }
  // Torn may fill the title a moment before the body, so one read could pair
  // the new title with the old note's text. Only a read that holds still for
  // two checks counts.
  if (!candidate || candidate.title !== fields.title || candidate.body !== fields.body) {
    candidate = fields;
    return;
  }
  candidate = null;
  void flush();
  noteOpened(fields);
}

/** Records typing in the open note, and saves it once the typing pauses. */
function onInput(event: Event): void {
  const target = event.target;
  if (!(target instanceof Element) || !target.matches(`${SELECTORS.title}, ${SELECTORS.body}`)) return;
  if (!open || opening) return;
  const fields = readFields();
  if (!fields) return;
  // A title typed here is a rename of the open note, which keeps its key.
  open = { ...open, ...fields };
  candidate = null;
  pending = { ...open };
  window.clearTimeout(pendingTimer);
  pendingTimer = window.setTimeout(() => void flush(), TYPING_PAUSE_MS);
}

/** Takes a version before the note is deleted or swapped for another. */
function onPress(event: Event): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest(SELECTORS.remove)) void backup("deleted");
  else if (target.closest(SELECTORS.pick)) void flush();
}

/** Starts watching Notes. */
export function watchNotes(): void {
  document.addEventListener("input", onInput, true);
  // Pointerdown rather than click: Torn may act on the press, and a version
  // has to be under way before the note leaves the page.
  document.addEventListener("pointerdown", onPress, true);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) void flush();
  });
  window.addEventListener("pagehide", () => void flush());
  window.setInterval(check, CHECK_MS);
  check();
}

/**
 * Puts text in the open note's body, as one edit its own undo can take back.
 * Returns false when no note is open.
 *
 * execCommand is the one way to change a textarea that both React and the
 * textarea's undo history pick up; setting the value misses both.
 */
export function replaceBody(text: string): boolean {
  const body = document.querySelector<HTMLTextAreaElement>(SELECTORS.body);
  if (!body) return false;
  body.focus({ preventScroll: true });
  body.select();
  if (!document.execCommand("insertText", false, text)) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(body, text);
    body.dispatchEvent(new Event("input", { bubbles: true }));
  }
  return true;
}

/** Whether Notes is showing a note that a version could be put into. */
export function noteIsOpen(): boolean {
  return document.querySelector(SELECTORS.body) !== null;
}

/** Returns the titles in Torn's note picker, or null when it is not on the page. */
export function pickerTitles(): Set<string> | null {
  const items = document.querySelectorAll(SELECTORS.pick);
  if (items.length === 0) return null;
  return new Set(Array.from(items, (item) => item.textContent?.trim() ?? ""));
}
