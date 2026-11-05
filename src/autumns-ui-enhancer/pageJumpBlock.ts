// Stops Torn scrolling the page after a click or a navigation.

import { PAGE_JUMP_BLOCK, isEnabled } from "./settings";

/** How long a scroll counts as a navigation's or a click's doing. */
const SUPPRESS_MS = 1000;

let navigationUntil = 0;
let clickUntil = 0;
let clicked: Element | null = null;

/** Whether the feature is switched on. */
function on(): boolean {
  return isEnabled(PAGE_JUMP_BLOCK);
}

/** Whether a navigation-driven scroll is currently expected. */
function suppressingNavigation(): boolean {
  return Date.now() < navigationUntil && on();
}

/** Whether a scroll onto this element counts as a jump. */
function suppressingClick(target: Element): boolean {
  if (Date.now() >= clickUntil || !on()) return false;
  if (clicked && (target.contains(clicked) || clicked.contains(target))) {
    return false;
  }
  return true;
}

/** Opens the window in which a navigation's follow-up scroll is swallowed. */
function armNavigation(): void {
  navigationUntil = Date.now() + SUPPRESS_MS;
}

/** Opens the window in which a click's follow-up scroll is swallowed. */
function armClick(target: Element): void {
  clicked = target;
  clickUntil = Date.now() + SUPPRESS_MS;
}

/** Whether a history URL stays on the page we are already on. */
function isSamePage(url: unknown): boolean {
  if (typeof url !== "string") return false;
  try {
    return new URL(url, location.href).pathname === location.pathname;
  } catch {
    return false;
  }
}

/** Whether an href is hash navigation. */
function isHashLink(href: string | null | undefined): boolean {
  return typeof href === "string" && href.length > 1 && href[0] === "#";
}

/** Arms the suppression windows from whatever the reader just clicked. */
function onClick(event: Event): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  armClick(target);
  if (isHashLink(target.closest("a")?.getAttribute("href"))) armNavigation();
}

/** Makes the History API arm suppression on same-page navigation. */
function patchHistory(name: "pushState" | "replaceState"): void {
  const original = history[name];
  history[name] = function (this: History, ...args: unknown[]) {
    if (isSamePage(args[2])) armNavigation();
    return (original as (...a: unknown[]) => unknown).apply(this, args);
  } as History[typeof name];
}

/** Makes scrollIntoView do nothing while a jump is expected. */
function patchScrollIntoView(): void {
  const original = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (
    this: Element,
    ...args: unknown[]
  ) {
    if (suppressingNavigation() || suppressingClick(this)) return;
    (original as (...a: unknown[]) => void).apply(this, args);
  } as typeof Element.prototype.scrollIntoView;
}

/** Whether an element is the page's own scroller, not a box inside it. */
function isPageScroller(element: Element): boolean {
  return element === document.documentElement || element === document.body;
}

/**
 * Makes writes to the page's own scroll position do nothing while a jump is
 * expected.
 *
 * The scroll methods are not the only way up the page: setting `scrollTop`
 * moves it just as well, and that is what jQuery does when it animates a
 * scroll - a frame at a time, straight onto the property, past every method
 * patched above. Torn runs jQuery, so without this a jump on the forums goes
 * through untouched.
 *
 * Only the page's own scrollers are held back. A box with its own scrollbar -
 * a chat panel, a long dropdown - keeps working, because stopping those would
 * break scrolling that nobody asked to have blocked.
 */
function patchScrollTop(): void {
  const descriptor = Object.getOwnPropertyDescriptor(
    Element.prototype,
    "scrollTop",
  );
  const read = descriptor?.get;
  const write = descriptor?.set;
  if (!read || !write || descriptor.configurable === false) return;

  Object.defineProperty(Element.prototype, "scrollTop", {
    configurable: true,
    enumerable: descriptor.enumerable ?? false,
    get: read,
    set(this: Element, value: number) {
      if (isPageScroller(this) && suppressingNavigation()) return;
      write.call(this, value);
    },
  });
}

/** Makes the window scroll methods do nothing while a jump is expected. */
function patchWindowScrolling(): void {
  for (const name of ["scrollTo", "scroll", "scrollBy"] as const) {
    const original = window[name];
    if (typeof original !== "function") continue;
    window[name] = function (this: Window, ...args: unknown[]) {
      if (suppressingNavigation()) return;
      (original as (...a: unknown[]) => void).apply(this, args);
    } as (typeof window)[typeof name];
  }
}

/** Stops Torn scrolling the page for you after a click or a navigation. */
export function installPageJumpBlock(): void {
  addEventListener("click", onClick, true);
  addEventListener("hashchange", armNavigation, true);
  addEventListener("popstate", armNavigation, true);
  patchHistory("pushState");
  patchHistory("replaceState");
  patchScrollIntoView();
  patchWindowScrolling();
  patchScrollTop();
}
