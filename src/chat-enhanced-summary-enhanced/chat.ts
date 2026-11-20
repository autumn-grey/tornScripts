// Finding Torn chat boxes, putting the Σ button in their header, and reading
// a box's history back by scrolling it.
//
// Torn only keeps about ten messages in the page at a time and fetches older
// ones as the box scrolls up, so reading 300 means scrolling while reading and
// stitching each screenful onto what has been read so far.

/** Every selector this script matches on. Class names are hashed, so only the front is matched. */
const SELECTORS = {
  root: "#chatRoot",
  sender: '[class*="sender___"], [class*="message__sender"]',
  text: '[class*="message___"], [class*="message__text"]',
  header: '[class*="header___"], [class*="chat-box-header"]',
};

/** How many messages one click reads back. */
export const MAX_MESSAGES = 300;

const STEP_DELAY = 130;
// Torn takes a moment to fetch older history once the box reaches the top.
const LOAD_DELAY = 900;
const MAX_STEPS = 400;

const BOX_ATTR = "data-adc";
const OPEN_CLASS = "adc-open";

/** One message as read from the page. */
export interface Message {
  id: string;
  name: string;
  text: string;
  reaction: boolean;
}

/** A chat box with the scroller its messages live in. */
interface ChatBox extends HTMLElement {
  _adcScroller?: HTMLElement;
}

/** Waits the given number of milliseconds. */
function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Whether an element scrolls vertically. */
function scrolls(el: Element): boolean {
  const o = getComputedStyle(el).overflowY;
  return o === "auto" || o === "scroll";
}

/** Returns the nearest scrolling ancestor of a node, stopping at the given element. */
function findScroller(node: Element, stop: Element): HTMLElement | null {
  let p = node.parentElement;
  while (p && p !== stop && p !== document.body) {
    if (scrolls(p)) return p;
    p = p.parentElement;
  }
  return null;
}

/** Returns the chat box around a scroller and that box's header. */
function findBox(scroller: HTMLElement): [HTMLElement, HTMLElement] | null {
  let p = scroller.parentElement;
  for (let tries = 0; p && tries < 6; tries++) {
    const h = p.querySelector<HTMLElement>(SELECTORS.header);
    if (h && !scroller.contains(h)) return [p, h];
    p = p.parentElement;
  }
  return null;
}

/** Whether an element carries one of Torn's hashed class names (title___aB3x). */
function tornOwned(el: Element | null): boolean {
  return !!el && typeof el.className === "string" && el.className.includes("___");
}

/** Returns the horizontal extents of Torn's own text and icons in a header, skipping other scripts' additions. */
function tornParts(header: HTMLElement): { left: number; right: number }[] {
  const parts: { left: number; right: number }[] = [];
  const keep = (r: DOMRect) => {
    if (r.width && r.height) parts.push({ left: r.left, right: r.right });
  };
  // Text is measured itself, because the title element often stretches across the header.
  const walker = document.createTreeWalker(header, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent?.trim() || !tornOwned(n.parentElement)) continue;
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) keep(r);
  }
  header.querySelectorAll('button, [role="button"], svg').forEach((el) => {
    if (el.closest(`.${OPEN_CLASS}`)) return;
    if (tornOwned(el) || (el.tagName.toLowerCase() === "svg" && tornOwned(el.parentElement))) {
      keep(el.getBoundingClientRect());
    }
  });
  return parts;
}

/** Returns the gap between the title's last piece (its dropdown arrow included) and the minimise button. */
function titleGap(header: HTMLElement): [number, number] {
  const box = header.getBoundingClientRect();
  const parts = tornParts(header).sort((a, b) => b.right - a.right);
  const first = parts[0];
  if (!first) return [box.left, box.right];
  // The controls at the right end sit close together; the gap before them is the one we want.
  let end = first.left;
  for (const p of parts) if (p.right >= end - 10) end = Math.min(end, p.left);
  let start = box.left;
  for (const p of parts) if (p.right < end) start = Math.max(start, p.right);
  return [start, end];
}

/** Centres the Σ button in the gap between a header's title and its minimise button. */
function placeButton(header: HTMLElement): void {
  const btn = header.querySelector<HTMLElement>(`:scope > .${OPEN_CLASS}`);
  if (!btn) return;
  const box = header.getBoundingClientRect();
  if (!box.width) return;
  const [start, end] = titleGap(header);
  const centre = (start + end) / 2 - box.left - header.clientLeft;
  btn.style.left = `${Math.round(centre - btn.offsetWidth / 2)}px`;
}

/** Puts the Σ button into a chat box header and keeps it centred. */
function addButton(
  box: ChatBox,
  header: HTMLElement,
  scroller: HTMLElement,
  onOpen: (box: HTMLElement, scroller: HTMLElement, title: string) => void,
): void {
  box.setAttribute(BOX_ATTR, "1");
  box._adcScroller = scroller;
  if (header.querySelector(`.${OPEN_CLASS}`)) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = OPEN_CLASS;
  btn.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.2l3.2 7 7.6.8-5.7 5.1 1.6 7.5L12 17.8l-6.7 3.8 1.6-7.5L1.2 9l7.6-.8z"/></svg><span>Σ</span>';
  btn.title = `Word cloud of the last ${MAX_MESSAGES} messages`;

  // A click on the header minimises the chat, so ours must not reach it.
  btn.addEventListener("mousedown", (e) => e.stopPropagation());
  btn.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: true });
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const title = (header.textContent ?? "").replace(/Σ/g, "").trim().slice(0, 40) || "Chat";
    onOpen(box, box._adcScroller ?? scroller, title);
  });

  // Positioned over the header rather than in its flow, so it cannot push the minimise button.
  if (getComputedStyle(header).position === "static") header.style.position = "relative";
  header.appendChild(btn);
  placeButton(header);
  new ResizeObserver(() => placeButton(header)).observe(header);
}

/** Adds the button to every chat box on the page that lacks one. */
export function lookForChats(
  onOpen: (box: HTMLElement, scroller: HTMLElement, title: string) => void,
): void {
  const root = document.querySelector(SELECTORS.root) ?? document.body;

  // React re-renders headers and throws the button away, so put it back.
  root.querySelectorAll<ChatBox>(`[${BOX_ATTR}]`).forEach((box) => {
    if (!box._adcScroller?.isConnected) {
      box.removeAttribute(BOX_ATTR);
      return;
    }
    const h = box.querySelector<HTMLElement>(SELECTORS.header);
    if (!h) return;
    if (!h.querySelector(`.${OPEN_CLASS}`)) addButton(box, h, box._adcScroller, onOpen);
    // Titles and other scripts' icons change without resizing the header, so recentre on every pass.
    else placeButton(h);
  });

  const done = new Set<HTMLElement>();
  root.querySelectorAll(SELECTORS.sender).forEach((s) => {
    if (s.closest(`[${BOX_ATTR}]`)) return;
    const sc = findScroller(s, root);
    if (!sc || done.has(sc)) return;
    done.add(sc);
    const found = findBox(sc);
    if (found) addButton(found[0], found[1], sc, onOpen);
  });
}

/** Whether a message is only a quote and emoji, which is how reactions come through. */
function isReaction(text: string): boolean {
  if (!/\p{Extended_Pictographic}/u.test(text)) return false;
  const left = text
    .replace(/^\s*>.*$/gm, " ")
    .replace(/"[^"]*"|“[^”]*”|«[^»]*»|\[[^\]]*\]/g, " ")
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}‍️⃣]/gu, " ")
    .replace(/[\s\p{P}\p{S}]+/gu, "");
  return left.length === 0;
}

/** Returns the element that scrolls, which may sit inside the saved wrapper. */
function movingScroller(sc: HTMLElement): HTMLElement {
  let p = sc.querySelector(SELECTORS.sender)?.parentElement ?? null;
  while (p && p !== document.body && !p.hasAttribute(BOX_ATTR)) {
    if (scrolls(p) && p.scrollHeight > p.clientHeight + 8) return p;
    p = p.parentElement;
  }
  return sc;
}

/** Returns the outermost sender elements inside an element. */
function sendersIn(el: Element): Element[] {
  const out: Element[] = [];
  el.querySelectorAll(SELECTORS.sender).forEach((s) => {
    const outer = s.parentElement?.closest(SELECTORS.sender);
    if (!outer || !el.contains(outer)) out.push(s);
  });
  return out;
}

/** Returns the row holding one sender's message. */
function rowFor(sender: Element, sc: Element): Element {
  let row = sender;
  while (row.parentElement && row.parentElement !== sc && sc.contains(row.parentElement)) {
    if (sendersIn(row.parentElement).length > 1) break;
    row = row.parentElement;
  }
  return row === sender ? (sender.parentElement ?? sender) : row;
}

/** Returns the message text of a row, without the sender's name. */
function textFor(row: Element, sender: Element, rawName: string): string {
  const t = row.querySelector(SELECTORS.text);
  if (t && !t.contains(sender) && !sender.contains(t) && t.textContent?.trim()) {
    return t.textContent.trim();
  }
  sender.setAttribute("data-adc-me", "1");
  const copy = row.cloneNode(true) as Element;
  sender.removeAttribute("data-adc-me");
  copy.querySelectorAll("[data-adc-me], button, svg, style, script").forEach((x) => x.remove());
  let text = (copy.textContent ?? "").trim();
  if (text.startsWith(rawName)) text = text.slice(rawName.length).trim();
  return text.replace(/^:\s*/, "");
}

/** Reads one message row, or null when it holds nothing. */
function readRow(sender: Element, sc: Element, scVisible: boolean): Message | null {
  const rawName = (sender.textContent ?? "").trim();
  const name = rawName.replace(/:\s*$/, "").replace(/^[^\p{L}\p{N}_]+/u, "").trim();
  if (!name) return null;
  const text = textFor(rowFor(sender, sc), sender, rawName);
  if (!text) return null;

  // Chat Enhanced hides reaction messages, so a hidden row is a reaction.
  const hidden = scVisible && sender.getClientRects().length === 0;
  // Reaction chips render late, so the id leaves out emoji and punctuation or a row would look new twice.
  const key = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 90) || text.slice(0, 20);
  return { id: `${name}|${key}`, name, text, reaction: hidden || isReaction(text) };
}

/** Reads every message currently rendered in the scroller. */
function readVisible(sc: Element, seen: WeakMap<Element, Message | null>): Message[] {
  const vis = sc.getClientRects().length > 0;
  const out: Message[] = [];
  for (const s of sendersIn(sc)) {
    if (!seen.has(s)) seen.set(s, readRow(s, sc, vis));
    const m = seen.get(s);
    if (m) out.push(m);
  }
  return out;
}

/** Whether two runs of messages match over the given length. */
function same(a: Message[], ai: number, b: Message[], bi: number, len: number): boolean {
  for (let i = 0; i < len; i++) if (a[ai + i]?.id !== b[bi + i]?.id) return false;
  return true;
}

/** Joins a screenful onto the messages read so far and returns how many were new. */
function stitch(all: Message[], chunk: Message[]): number {
  if (!chunk.length) return 0;
  if (!all.length) {
    all.push(...chunk);
    return chunk.length;
  }
  for (let i = 0; i + chunk.length <= all.length; i++) {
    if (same(all, i, chunk, 0, chunk.length)) return 0;
  }
  // Scrolling up: the end of the screenful overlaps the start of what we have.
  for (let p = 0; p < chunk.length; p++) {
    const len = Math.min(chunk.length - p, all.length);
    if (!same(chunk, p, all, 0, len)) continue;
    const newer = chunk.slice(p + len);
    all.unshift(...chunk.slice(0, p));
    all.push(...newer);
    return p + newer.length;
  }
  // Someone posted while we were reading.
  for (let q = Math.max(0, all.length - chunk.length); q < all.length; q++) {
    const len = all.length - q;
    if (!same(all, q, chunk, 0, len)) continue;
    all.push(...chunk.slice(len));
    return chunk.length - len;
  }
  all.unshift(...chunk);
  return chunk.length;
}

/** Counts the messages that are not reactions. */
function countReal(list: Message[]): number {
  return list.reduce((n, m) => n + (m.reaction ? 0 : 1), 0);
}

/** Scrolls a chat box back and returns up to MAX_MESSAGES of its messages, oldest first. */
export async function readBack(
  scroller: HTMLElement,
  progress: (n: number) => void,
  cancelled: () => boolean,
): Promise<Message[]> {
  const sc = movingScroller(scroller);
  const flipped = getComputedStyle(sc).flexDirection === "column-reverse";
  const toBottom = () => {
    sc.scrollTop = flipped ? 0 : sc.scrollHeight;
  };
  const seen = new WeakMap<Element, Message | null>();
  const all: Message[] = [];

  toBottom();
  await wait(250);
  stitch(all, readVisible(sc, seen));

  let stuck = 0;
  for (let i = 0; i < MAX_STEPS; i++) {
    if (countReal(all) >= MAX_MESSAGES || stuck >= 3 || cancelled()) break;
    const was = sc.scrollTop;
    const height = sc.scrollHeight;
    try {
      sc.dispatchEvent(new WheelEvent("wheel", { deltaY: -300, bubbles: true, cancelable: true }));
    } catch {
      // Older webviews cannot construct a WheelEvent; the scrollTop change still works.
    }
    sc.scrollTop = was - Math.max(120, Math.round(sc.clientHeight * 0.7));
    await wait(STEP_DELAY);
    let got = stitch(all, readVisible(sc, seen));

    if (sc.scrollTop === was) {
      // At the top: nudge it so Torn notices and loads older history.
      sc.scrollTop = was + 3;
      sc.scrollTop = was;
      sc.dispatchEvent(new Event("scroll", { bubbles: true }));
      await wait(LOAD_DELAY);
      got += stitch(all, readVisible(sc, seen));
      if (got || sc.scrollHeight > height + 4 || sc.scrollTop !== was) stuck = 0;
      else stuck++;
    }
    progress(countReal(all));
  }

  toBottom();
  return all.filter((m) => !m.reaction).slice(-MAX_MESSAGES);
}
