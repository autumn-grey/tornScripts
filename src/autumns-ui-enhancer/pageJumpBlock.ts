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
}
