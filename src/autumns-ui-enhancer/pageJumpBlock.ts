// Page Jump Block
//
// Torn's React pages scroll their content into view whenever the URL hash
// changes (the "#type=offenses" style links on the Hall of Fame, faction
// pages, item lists, and so on). On a tall page that yanks you down the
// moment you click a filter.
//
// A hash change arms a short window; any scroll that lands inside it is
// swallowed. Scrolls outside the window - the ones you asked for - are left
// alone entirely.

import { PAGE_JUMP_BLOCK, isEnabled } from "./settings";

/**
 * How long after a hash change a scroll is treated as that navigation's
 * doing. Torn's scroll lands within a frame or two of the hashchange; the
 * window is generous enough to cover a slow render but short enough that a
 * scroll the user actually asked for straight afterwards still happens.
 */
const SUPPRESS_MS = 1000;

let suppressUntil = 0;

/** True while a hash-driven scroll is expected and the feature is on. */
function suppressing(): boolean {
  if (Date.now() >= suppressUntil) return false;
  // Read fresh rather than caching, so flipping the switch takes effect
  // everywhere without a reload.
  return isEnabled(PAGE_JUMP_BLOCK);
}

/** Open the window in which Torn's follow-up scroll gets swallowed. */
function armSuppression(): void {
  suppressUntil = Date.now() + SUPPRESS_MS;
}

export function installPageJumpBlock(): void {
  // Clicking the link is the earliest signal, and it fires before the
  // hashchange - arming here covers routers that never fire hashchange at
  // all and scroll straight out of the click handler.
  addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("a");
      const href = link?.getAttribute("href");
      // Bare "#" links are buttons in disguise, not hash navigation.
      if (!href || href.length < 2 || href[0] !== "#") return;
      armSuppression();
    },
    true,
  );

  addEventListener("hashchange", armSuppression, true);

  // Torn's router also swaps the hash through the History API, which fires
  // popstate rather than hashchange on a back/forward step.
  addEventListener("popstate", armSuppression, true);

  const patchHistory = (name: "pushState" | "replaceState") => {
    const original = history[name];
    history[name] = function (this: History, ...args: unknown[]) {
      const url = args[2];
      // Only hash navigation jumps; a real page change is left alone.
      if (typeof url === "string" && url.includes("#")) armSuppression();
      return (original as (...a: unknown[]) => unknown).apply(this, args);
    } as History[typeof name];
  };
  patchHistory("pushState");
  patchHistory("replaceState");

  // The scroll itself. Torn uses scrollIntoView on the content wrapper, but
  // the window-level calls are patched too so a change of method on their
  // side doesn't quietly bring the jump back.
  const originalScrollIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (
    this: Element,
    ...args: unknown[]
  ) {
    if (suppressing()) return;
    (originalScrollIntoView as (...a: unknown[]) => void).apply(this, args);
  } as typeof Element.prototype.scrollIntoView;

  for (const name of ["scrollTo", "scroll", "scrollBy"] as const) {
    const original = window[name];
    if (typeof original !== "function") continue;
    window[name] = function (this: Window, ...args: unknown[]) {
      if (suppressing()) return;
      (original as (...a: unknown[]) => void).apply(this, args);
    } as (typeof window)[typeof name];
  }
}
