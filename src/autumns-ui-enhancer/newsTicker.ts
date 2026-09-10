// Scrolling headlines and stepping arrows for Torn's news ticker.

import { log } from "./debug";
import { NEWS_TICKER, isEnabled } from "./settings";

/** The strip the ticker lives in; everything else is found inside it. */
const BAR_SELECTOR = ".header-bottom-text.news-ticker-new";
/** One headline, as Torn renders it. */
const SLIDE_SELECTOR = ".news-ticker-slide";
/** The overflowing box inside a slide - what actually scrolls. */
const SCROLLER_SELECTOR = ".scroll-wrap";
/** The headline text itself, without the type icon beside it. */
const HEADLINE_SELECTOR = ".headline";

const BAR_CLASS = "aue-ticker-bar";
const NAV_ID = "aue-ticker-nav";
const OVERLAY_ID = "aue-ticker-overlay";
/** Put on the bar while an arrow-chosen headline is showing. */
const MANUAL_CLASS = "aue-ticker-manual";

/** Anything narrower than this much overflow is not worth scrolling. */
const OVERFLOW_SLACK = 4;
/** Reading pace, pixels a second. Slow enough to read as it goes. */
const SCROLL_SPEED = 34;
/** Pause at each end of the travel, so both ends can be read. */
const HOLD_MS = 1500;
/** How long an arrow-chosen headline stays up before the ticker resumes. */
const MANUAL_IDLE_MS = 45_000;

interface Headline {
  /** Torn's own id where we have it, the text where we don't. */
  id: string;
  /** Torn's markup for the headline - bold runs, mostly. */
  html: string;
  link: string | null;
  /** Unix seconds for the headlines that carry a countdown; 0 for the rest. */
  endTime: number;
}

/** Every headline this page has watched go past, in the order first seen. */
const seen: Headline[] = [];
/** Index into the headline list while the arrows are in charge. */
let manualIndex: number | null = null;
/** When the last arrow was clicked, for handing the ticker back. */
let manualAt = 0;
/** Set while this module is the one changing the DOM. */
let writing = false;

interface FiberNode {
  memoizedProps?: unknown;
  memoizedState?: { memoizedState?: unknown; next?: unknown } | unknown;
  return?: FiberNode;
}

/** Whether a value is Torn's array of headlines. */
function isHeadlineList(value: unknown): value is Record<string, unknown>[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    typeof value[0] === "object" &&
    value[0] !== null &&
    "headline" in value[0]
  );
}

/** Returns the headline array found inside a React value. */
function digForList(
  value: unknown,
  depth: number,
): Record<string, unknown>[] | null {
  if (isHeadlineList(value)) return value;
  if (!value || typeof value !== "object" || depth > 3) return null;
  if (value instanceof Element) return null;
  let keys: string[];
  try {
    keys = Object.keys(value);
  } catch {
    return null;
  }
  for (const key of keys.slice(0, 30)) {
    let child: unknown;
    try {
      child = (value as Record<string, unknown>)[key];
    } catch {
      continue;
    }
    const found = digForList(child, depth + 1);
    if (found) return found;
  }
  return null;
}

/** Returns Torn's own headline list. */
function readHeadlines(bar: Element): Headline[] | null {
  try {
    const key = Object.keys(bar).find((name) =>
      name.startsWith("__reactFiber$"),
    );
    if (!key) return null;

    let node = (bar as unknown as Record<string, FiberNode>)[key] as
      FiberNode | undefined;
    for (let depth = 0; node && depth < 30; depth += 1) {
      let list = digForList(node.memoizedProps, 0);
      if (!list) {
        let hook = node.memoizedState as
          { memoizedState?: unknown; next?: unknown } | undefined;
        for (let i = 0; hook && i < 15 && !list; i += 1) {
          list = digForList(hook.memoizedState, 1);
          hook = hook.next as typeof hook;
        }
      }
      if (list) {
        return list.map((item) => ({
          id: String(item.ID ?? item.headline),
          html: String(item.headline ?? ""),
          link: typeof item.link === "string" && item.link ? item.link : null,
          endTime: Number(item.endTime) || 0,
        }));
      }
      node = node.return;
    }
  } catch {}
  return null;
}

/** Returns the headlines the arrows step through. */
function headlines(bar: Element): Headline[] {
  return readHeadlines(bar) ?? seen;
}

/** Records the headline on show. */
function remember(bar: Element): void {
  const headline = bar.querySelector(HEADLINE_SELECTOR);
  const html = headline?.innerHTML ?? "";
  if (!html) return;
  const id = headline?.textContent?.trim() ?? html;
  if (seen.some((item) => item.id === id)) return;
  const link = bar.querySelector<HTMLAnchorElement>(`${SLIDE_SELECTOR} a`);
  seen.push({ id, html, link: link?.getAttribute("href") ?? null, endTime: 0 });
}

/** Returns which headline the live ticker is showing. */
function liveIndex(bar: Element, list: Headline[]): number {
  const showing = bar
    .querySelector(HEADLINE_SELECTOR)
    ?.textContent?.trim()
    .toLowerCase();
  if (!showing) return 0;
  const strip = (html: string) =>
    html
      .replace(/<[^>]*>/g, "")
      .trim()
      .toLowerCase();
  const at = list.findIndex((item) => strip(item.html) === showing);
  return at === -1 ? 0 : at;
}

/** The box the marquee is currently walking, and what it was told to walk. */
let scroller: HTMLElement | null = null;
let scrollKey = "";
let startedAt = 0;
let pausedAt = 0;

/** Hovering the strip hands it back, so it can be read or dragged by hand. */
let pointerOver = false;

/** Returns a value that changes when the scrolling text does. */
function marqueeKey(box: HTMLElement): string {
  return `${box.scrollWidth}:${box.clientWidth}:${box.textContent?.length ?? 0}`;
}

/** Walks the headline left, holds, and walks it back. */
function tick(now: number): void {
  requestAnimationFrame(tick);
  const box = scroller;
  if (!box || !box.isConnected) return;

  const distance = box.scrollWidth - box.clientWidth;
  if (distance <= OVERFLOW_SLACK) {
    box.scrollLeft = 0;
    return;
  }

  const key = marqueeKey(box);
  if (key !== scrollKey) {
    scrollKey = key;
    startedAt = now;
    box.scrollLeft = 0;
    return;
  }

  if (pointerOver || document.hidden) {
    pausedAt = pausedAt || now;
    return;
  }
  if (pausedAt) {
    startedAt += now - pausedAt;
    pausedAt = 0;
  }

  const travel = (distance / SCROLL_SPEED) * 1000;
  const cycle = 2 * (travel + HOLD_MS);
  const at = (now - startedAt) % cycle;

  if (at < HOLD_MS) box.scrollLeft = 0;
  else if (at < HOLD_MS + travel) {
    box.scrollLeft = (distance * (at - HOLD_MS)) / travel;
  } else if (at < 2 * HOLD_MS + travel) box.scrollLeft = distance;
  else {
    box.scrollLeft = distance * (1 - (at - 2 * HOLD_MS - travel) / travel);
  }
}

/** Points the marquee at a box to scroll. */
function watchScroller(box: HTMLElement | null): void {
  if (box === scroller) return;
  scroller = box;
  scrollKey = "";
  pausedAt = 0;
}

/** Returns a stepping arrow. */
function buildArrow(step: -1 | 1): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `aue-ticker-arrow aue-ticker-arrow-${step === -1 ? "prev" : "next"}`;
  button.setAttribute(
    "aria-label",
    step === -1 ? "Previous headline" : "Next headline",
  );
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    stepBy(step);
  });
  return button;
}

/** Puts the arrows in the corner of the strip. */
function ensureNav(bar: HTMLElement): void {
  bar.classList.add(BAR_CLASS);
  if (bar.querySelector(`#${NAV_ID}`)) return;
  writing = true;
  const nav = document.createElement("div");
  nav.id = NAV_ID;
  nav.appendChild(buildArrow(-1));
  nav.appendChild(buildArrow(1));
  bar.appendChild(nav);
  writing = false;
}

/** Shows the headline a step away from the current one. */
function stepBy(step: -1 | 1): void {
  const bar = document.querySelector<HTMLElement>(BAR_SELECTOR);
  if (!bar) return;
  const list = headlines(bar);
  if (list.length === 0) return;

  const from = manualIndex ?? liveIndex(bar, list);
  manualIndex = (from + step + list.length) % list.length;
  manualAt = Date.now();
  log("ticker: showing headline", manualIndex + 1, "of", list.length);
  render(bar);
}

/** Hands the strip back to Torn's rotation. */
function toLive(bar: HTMLElement): void {
  manualIndex = null;
  writing = true;
  bar.classList.remove(MANUAL_CLASS);
  bar.querySelector(`#${OVERLAY_ID}`)?.remove();
  writing = false;
  watchScroller(bar.querySelector<HTMLElement>(SCROLLER_SELECTOR));
}

/** Returns the time left in Torn's countdown format. */
function countdownText(endTime: number): string {
  const left = Math.max(0, endTime - Math.floor(Date.now() / 1000));
  const pad = (value: number) => String(value).padStart(2, "0");
  const days = Math.floor(left / 86400);
  const hours = Math.floor((left % 86400) / 3600);
  return ` [${days}:${pad(hours)}:${pad(Math.floor((left % 3600) / 60))}:${pad(left % 60)}]`;
}

/** Draws the arrow-chosen headline over the live one. */
function render(bar: HTMLElement): void {
  const list = headlines(bar);
  if (manualIndex === null || list.length === 0) {
    toLive(bar);
    return;
  }
  const item = list[Math.min(manualIndex, list.length - 1)];
  if (!item) {
    toLive(bar);
    return;
  }

  writing = true;
  bar.classList.add(MANUAL_CLASS);
  let overlay = bar.querySelector<HTMLElement>(`#${OVERLAY_ID}`);
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    bar.appendChild(overlay);
  }

  const text = document.createElement("span");
  text.className = "aue-ticker-text";
  text.innerHTML = item.html;
  if (item.endTime > 0) {
    const countdown = document.createElement("span");
    countdown.className = "aue-ticker-countdown";
    countdown.textContent = countdownText(item.endTime);
    text.appendChild(countdown);
  }

  overlay.replaceChildren(
    item.link ? wrapInLink(text, item.link) : (text as Element),
  );
  writing = false;
  watchScroller(overlay);
}

/** Returns the headline wrapped in its link. */
function wrapInLink(text: HTMLElement, href: string): HTMLAnchorElement {
  const link = document.createElement("a");
  link.href = href;
  link.className = "aue-ticker-link";
  link.appendChild(text);
  return link;
}

/** Brings the arrows, the overlay and the marquee up to date. */
function apply(): void {
  const bar = document.querySelector<HTMLElement>(BAR_SELECTOR);
  if (!bar) return;

  if (!isEnabled(NEWS_TICKER)) {
    if (bar.querySelector(`#${NAV_ID}`)) {
      writing = true;
      bar.querySelector(`#${NAV_ID}`)?.remove();
      bar.classList.remove(BAR_CLASS);
      writing = false;
      toLive(bar);
    }
    watchScroller(null);
    return;
  }

  ensureNav(bar);
  remember(bar);

  if (manualIndex === null) {
    watchScroller(bar.querySelector<HTMLElement>(SCROLLER_SELECTOR));
  } else if (!bar.querySelector(`#${OVERLAY_ID}`)) {
    render(bar);
  }
}

/** Scrolls long headlines and adds arrows for stepping through them. */
export function installNewsTicker(): void {
  requestAnimationFrame(tick);

  addEventListener(
    "pointerover",
    (event) => {
      const target = event.target;
      pointerOver =
        target instanceof Element && target.closest(BAR_SELECTOR) !== null;
    },
    true,
  );
  addEventListener("pointerleave", () => (pointerOver = false), true);

  let timer = 0;
  const schedule = () => {
    if (writing) return;
    clearTimeout(timer);
    timer = window.setTimeout(apply, 120);
  };
  new MutationObserver(schedule).observe(document.body, {
    childList: true,
    subtree: true,
  });

  setInterval(() => {
    const bar = document.querySelector<HTMLElement>(BAR_SELECTOR);
    if (!bar || manualIndex === null) return;
    if (Date.now() - manualAt > MANUAL_IDLE_MS) {
      log("ticker: idle, back to Torn's rotation");
      toLive(bar);
      return;
    }
    const list = headlines(bar);
    const item = list[Math.min(manualIndex, list.length - 1)];
    const countdown = bar.querySelector(`#${OVERLAY_ID} .aue-ticker-countdown`);
    if (item && item.endTime > 0 && countdown) {
      countdown.textContent = countdownText(item.endTime);
    }
  }, 1000);

  apply();
}
