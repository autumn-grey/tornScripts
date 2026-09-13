// Which pages this script marks up, and noticing when you move between them.
//
// Two places sell items to other players:
//
//   /page.php?sid=ItemMarket      the item market
//   /bazaar.php                   any bazaar, including your own
//
// Both pages are single-page apps: moving from one bazaar to the next, or
// opening the market from the sidebar, changes the address bar without ever
// reloading the page. So the script cannot decide once at startup where it
// is; it has to keep watching.

export type MarkupPage = "item-market" | "bazaar";

/** Torn sometimes carries its routing in the hash, so both are checked. */
function readParam(name: string): string | null {
  const fromQuery = new URLSearchParams(location.search).get(name);
  if (fromQuery) return fromQuery;

  // e.g. #/userId=4220333 or #userId=4220333&foo=bar
  const pattern = new RegExp(`[#/&?]${name}=([^&/#]+)`, "i");
  const fromHash = pattern.exec(location.hash);
  return fromHash?.[1] ?? null;
}

/** The page we are on right now, or null if it is not one we touch. */
export function currentPage(): MarkupPage | null {
  const path = location.pathname.toLowerCase();

  if (path === "/page.php") {
    const sid = readParam("sid");
    return sid?.toLowerCase() === "itemmarket" ? "item-market" : null;
  }

  // Every bazaar, whoever owns it: yours has no userId on the address, other
  // people's carry one, and both are marked up the same way.
  if (path === "/bazaar.php") return "bazaar";

  return null;
}

/**
 * Call `handler` whenever the address changes, however it changed: back and
 * forward buttons, a link that only moves the hash, or Torn's own code
 * swapping the URL out from under us. The two history methods are wrapped
 * because neither of them fires an event of its own.
 */
export function onLocationChange(handler: () => void): void {
  let last = location.href;

  const check = (): void => {
    if (location.href === last) return;
    last = location.href;
    handler();
  };

  addEventListener("popstate", check);
  addEventListener("hashchange", check);

  for (const name of ["pushState", "replaceState"] as const) {
    const original = history[name];
    history[name] = function (this: History, ...args: Parameters<History["pushState"]>) {
      const result = original.apply(this, args);
      // After the call, so location already reflects the new address.
      check();
      return result;
    };
  }
}
