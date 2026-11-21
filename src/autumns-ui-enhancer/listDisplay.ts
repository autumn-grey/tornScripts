// A "Show more" button in the pagers of Torn's paged lists, and pagers that keep up with it.
//
// Torn's scripting rule allows one request per click, so a Show more click
// sends exactly one: the request Torn's own page sends for that list, at the
// next offset, with the rows it returns added under the list. Nothing is
// fetched on load or on a timer. Only the lists in KNOWN_LISTS get a button.
//
// The pager keeps Torn's own page numbers. Pages added by Show more show as
// one range ("4-9"), Next goes to the first page not yet shown, and one "..."
// becomes a box to type a page number into. Moving page goes to the address
// Torn's own link for that page carries, never by a click made by script.

import { log } from "./debug";
import { rowsFromJson } from "./jsonRows";
import { LIST_DISPLAY_EXTENSION, isEnabled } from "./settings";

/** The pager widget. Pages usually carry two, above and below the list. */
const PAGINATION_SELECTOR = ".pagination";
/** A numbered page link; the attribute holds Torn's own page number. */
const PAGE_LINK_SELECTOR = "a.page-number[page]";
/** The "..." between runs of page numbers. */
const PAGE_GAP_SELECTOR = "span.points";
/** A pager arrow, however Torn marks it up on a given page. */
const ARROW_PREV_ANY = 'i.pagination-left, [class*="pagination-left"]';
const ARROW_NEXT_ANY = 'i.pagination-right, [class*="pagination-right"]';
/** The class Torn puts on a dead pager arrow. */
const ARROW_DISABLED_CLASS = "disable";
/** Layout spacer rows that sit inside a list but are not results. */
const SPACER_CLASS = "clear";
/** Candidates for the element that actually holds the result rows. */
const ROW_CONTAINER_SELECTOR = "ul, ol, tbody";
/** Page furniture that is full of `<ul>`s and is never a result list. */
const NOT_A_LIST =
  "#sidebarroot, #header-root, .header-wrapper-top, .header-wrapper-bottom, #chatRoot, .content-title, .breadcrumbs";
/** As high as the walk goes: past this it is out of the page's content. */
const CONTENT_ROOT_SELECTOR = ".content-wrapper, #mainContainer";

/** Settles the mutation observer before re-reading the page. */
const SETTLE_MS = 150;
/** The longest a pass can be held off. */
const MAX_SETTLE_MS = 1000;

/** The Show more button at the end of a pager. */
const MORE_BUTTON_CLASS = "aue-pager-more";
/** Space either side of the Show more button, matching its right: in styles.ts. */
const MORE_BUTTON_GAP_PX = 10;
/** The button that goes back to the top of the page once rows have been added. */
const TOP_BUTTON_ID = "aue-back-to-top";
/** Marks the page link standing for the loaded run, "4-9", which needs to widen to fit. */
const RANGE_CLASS = "aue-page-range";
/** Marks a row this script appended, so it can be told from Torn's own. */
const EXTRA_ROW_ATTR = "data-aue-extra";
/** Marks a pager this script has redrawn, with what it was drawn for. */
const PAGER_STATE_ATTR = "data-aue-pager";
/** Marks a page link this script drew, so Torn redrawing the pager over it shows. */
const OWN_LINK_ATTR = "data-aue-page";
/** The page number box that stands in for a "...". */
const JUMP_CLASS = "aue-page-jump";
/** Where earlier versions kept the list requests they learnt, cleared on start. */
const OLD_REQUEST_PREFIX = "AUE_LIST_REQUEST:";

const SHOW_MORE_LABEL = "Show more";
const LOADING_LABEL = "Loading";
const FAILED_LABEL = "Nothing more to show";
/** Read out for the back-to-top button, which shows only an arrow. */
const TOP_LABEL = "Back to top";
/** An up chevron, drawn in the button's text colour. */
const TOP_ICON =
  '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 15l7-7 7 7" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** Matches the paging offset in the URL hash. */
const START_IN_HASH = /[?&]start=(\d+)/;
/** Matches the paging offset anywhere in a page link's href. */
const START_IN_LINK = /(?:^|[?&#])start=(\d+)/;
/** Torn's request token, which its own requests carry as ?rfcv=. */
const RFCV_COOKIE = /(?:^|;\s*)rfc_v=([^;]+)/;

/** Watches the page for Torn's redraws; set by installListDisplay. */
let observer: MutationObserver | null = null;

/**
 * Drops the observer's record of changes this script has just made.
 *
 * An observer reports changes after the code that made them has finished, so
 * a flag set around our own changes is already clear by then. Taking the
 * records straight after is what keeps our changes from starting another pass.
 */
function forgetOwnChanges(): void {
  observer?.takeRecords();
}
/** Bumped whenever the list moves on, so a load in flight knows it is stale. */
let generation = 0;

/** What has been added under the list being shown. */
interface MoreState {
  container: Element;
  step: number;
  /** The offset of the page Torn is showing. */
  base: number;
  /** The offset the next click asks for. */
  next: number;
  /** The last page, when Torn's pager names it. */
  total: number | null;
  /** Set once the list has run out, or a load brought nothing back. */
  done: boolean;
  loading: boolean;
}
let more: MoreState | null = null;

/** Each list's rows per request, read once from its own pager. */
const pageSteps = new WeakMap<Element, number>();
/** Each pager's markup as Torn rendered it, for putting back unchanged. */
const originalPagers = new WeakMap<Element, string>();
/** Each pager's last page as Torn drew it, or null when it does not name one. */
const pagerTotals = new WeakMap<Element, number | null>();

/** Whether a number could be a list's rows per request. */
function isPlausibleStep(step: number): boolean {
  return Number.isInteger(step) && step >= 1 && step <= 100;
}

/**
 * Returns a list's rows per request, read from its pager's own links.
 *
 * Each link carries the page it stands for and the offset it jumps to, so the
 * gap between two links is the step: 20 on the bounty board, 10 on the auction
 * market, 30 on the forums.
 */
function stepFromLinks(widget: Element): number | null {
  const points: { page: number; start: number }[] = [];
  for (const link of widget.querySelectorAll(PAGE_LINK_SELECTOR)) {
    const page = Number(link.getAttribute("page"));
    const match = START_IN_LINK.exec(link.getAttribute("href") ?? "");
    if (!Number.isInteger(page) || page < 1 || !match) continue;
    points.push({ page, start: Number(match[1]) });
  }

  for (const a of points) {
    for (const b of points) {
      if (a.page === b.page) continue;
      const step = (a.start - b.start) / (a.page - b.page);
      if (isPlausibleStep(step)) return step;
    }
  }

  const beyondFirst = points.find((point) => point.page > 1);
  if (beyondFirst) {
    const step = beyondFirst.start / (beyondFirst.page - 1);
    if (isPlausibleStep(step)) return step;
  }
  return null;
}

/**
 * Whether a pager element is a "...": Torn's plain one, a "..." drawn as a
 * link that jumps a few pages, or the page number box standing in for one.
 */
function isGap(element: Element): boolean {
  if (element.matches(`${PAGE_GAP_SELECTOR}, .${JUMP_CLASS}`)) return true;
  return element.matches(PAGE_LINK_SELECTOR) && /^\s*(\.\.\.|…)\s*$/.test(element.textContent ?? "");
}

/** Returns a pager's numbered page links, leaving out any "..." drawn as a link. */
function numberLinks(widget: Element): HTMLAnchorElement[] {
  return [...widget.querySelectorAll<HTMLAnchorElement>(PAGE_LINK_SELECTOR)].filter((link) => !isGap(link));
}

/** Returns a pager's "..."s, in order, whether plain, drawn as links, or already boxes. */
function gapsOf(widget: Element): Element[] {
  return [...widget.querySelectorAll(`${PAGE_LINK_SELECTOR}, ${PAGE_GAP_SELECTOR}, .${JUMP_CLASS}`)].filter(isGap);
}

/** Returns the page a pager marks as current, and the highest page it numbers. */
function pagerPages(widget: Element): { active: number; last: number } {
  let active = 1;
  let last = 1;
  for (const link of numberLinks(widget)) {
    const page = Number(link.getAttribute("page"));
    if (!Number.isInteger(page) || page < 1) continue;
    if (link.classList.contains("active")) active = page;
    if (page > last) last = page;
  }
  return { active, last };
}

/**
 * Returns a list's rows per request, caching the first good reading.
 *
 * A pager with no offsets in its links is measured from the rows on a full
 * page instead, which is only safe when the pager says later pages exist.
 */
function pageStepFor(widget: Element, container?: Element): number | null {
  const cached = pageSteps.get(widget);
  if (cached !== undefined) return cached;

  let step = stepFromLinks(widget);
  let how = "its page links";

  if (step === null && container) {
    const { active, last } = pagerPages(widget);
    const own = rowsOf(container).filter(
      (row) => !row.hasAttribute(EXTRA_ROW_ATTR),
    ).length;
    if (last > active && isPlausibleStep(own) && own > 1) {
      step = own;
      how = "the rows on a full page";
    }
  }
  const hrefs = [...widget.querySelectorAll(PAGE_LINK_SELECTOR)]
    .slice(0, 3)
    .map((link) => link.getAttribute("href") ?? "(no href)");

  if (step === null) {
    log("step: cannot read one. Page links point at:", hrefs.join(" "));
    return null;
  }

  pageSteps.set(widget, step);
  log("step:", step, "rows per request, read from", how, "-", hrefs.join(" "));
  return step;
}

/**
 * Returns the page's route parameters, offset aside, as "name=value" pairs.
 *
 * Read from the hash, which Torn writes with any mix of "/" and "!" in front
 * ("#/p=forums", "#/!p=main"). A page opened at an ordinary address
 * ("forums.php?p=threads&...") carries its route in the query instead.
 */
function routeParams(): string[] {
  const pairs = (text: string) =>
    text.split("&").filter((pair) => pair.includes("=") && !pair.startsWith("start="));
  const fromHash = pairs(location.hash.replace(/^#[!/]*/, ""));
  return fromHash.length > 0 ? fromHash : pairs(location.search.replace(/^\?/, ""));
}

/** Returns the page route's value for a parameter, or null when it has none. */
function routeValue(name: string): string | null {
  const pair = routeParams().find((entry) => entry.split("=")[0] === name);
  return pair === undefined ? null : pair.slice(name.length + 1);
}

/**
 * A list Show more works on, and the request that loads its pages.
 *
 * Taken from the requests Torn made on each page (November 2026). The first
 * page of a list comes with the page itself, so there is no request of
 * Torn's on it to copy; knowing each one in advance is what puts the button
 * on page 1. A list not in here gets no button.
 *
 * `step` matches the page's ?step=, `when` the route values that pick the
 * list, `needs` the route parameters filled into the body, where "{name}"
 * stands for that parameter's value. `bare` lists are also the one shown when
 * the page is opened with no route in its hash at all, as Messages opens on
 * the inbox. `hashPrefix` is for a list whose page links are an ordinary
 * address but whose page only moves by its hash, given with what Torn puts
 * in front of the route there.
 */
interface KnownList {
  path: string;
  step?: string;
  when?: Record<string, string>;
  needs?: string[];
  bare?: boolean;
  hashPrefix?: string;
  body: string;
}

const KNOWN_LISTS: KnownList[] = [
  { path: "/messages.php", when: { p: "inbox" }, bare: true, body: "p=inbox&step=inbox" },
  { path: "/bounties.php", when: { p: "main" }, bare: true, body: "p=main&step=mainBounties" },
  {
    path: "/forums.php",
    when: { p: "forums" },
    needs: ["f", "b", "a"],
    body: "p=forums&f={f}&b={b}&a={a}&title=true&step=forums",
  },
  {
    path: "/forums.php",
    when: { p: "threads" },
    needs: ["f", "t", "b", "a"],
    body: "p=threads&f={f}&t={t}&b={b}&a={a}&title=true&step=threads",
  },
  // The tab is #itemtab= in the address but itemtype= in the request.
  { path: "/amarket.php", needs: ["itemtab"], body: "step=getAuctionItemsList&itemtype={itemtab}" },
  { path: "/joblist.php", when: { p: "main" }, bare: true, body: "p=main&step=mainJoblist" },
  { path: "/joblist.php", when: { p: "corp" }, needs: ["ID"], body: "p=corp&ID={ID}&step=corpJoblist" },
  { path: "/personals.php", when: { p: "main" }, bare: true, body: "p=main&step=mainPersonals" },
  {
    path: "/personals.php",
    when: { p: "search" },
    needs: ["type"],
    body: "p=search&type={type}&step=searchPersonals",
  },
  {
    path: "/comics.php",
    when: { p: "main" },
    bare: true,
    hashPrefix: "#!",
    body: "p=main&step=mainComics&cross_page_request=false",
  },
  {
    path: "/properties.php",
    step: "rentalmarket",
    needs: ["property"],
    body: "step=rentalMarket&property={property}",
  },
  {
    path: "/properties.php",
    step: "sellingmarket",
    needs: ["property"],
    body: "step=sellingMarket&property={property}",
  },
];

/** Returns the request body that loads the list being shown, without its offset, or null when it is not one we know. */
function listRequest(): string | null {
  const list = currentList();
  if (!list) return null;
  let body = list.body;
  for (const name of list.needs ?? []) body = body.replace(`{${name}}`, routeValue(name) ?? "");
  return body;
}

/** Returns the entry in KNOWN_LISTS for the list being shown, or null when it is not one we know. */
function currentList(): KnownList | null {
  const pageStep = new URLSearchParams(location.search).get("step");
  for (const list of KNOWN_LISTS) {
    if (list.path !== location.pathname) continue;
    if (list.step !== undefined && list.step !== pageStep) continue;
    const bare = list.bare === true && routeParams().length === 0;
    const matches = Object.entries(list.when ?? {}).every(([name, value]) => routeValue(name) === value);
    if (!matches && !bare) continue;
    const values = (list.needs ?? []).map((name) => [name, routeValue(name)] as const);
    if (values.some(([, value]) => value === null)) continue;
    return list;
  }
  return null;
}

export interface ListTarget {
  widget: HTMLElement;
  /** The block holding the pager. */
  pagerBlock: HTMLElement;
  /** The block holding the list itself. */
  block: HTMLElement;
  /** The element whose children are the result rows. */
  container: HTMLElement;
  /** Rows the server sends per request, or null if it could not be read. */
  step: number | null;
}

/** How far out from the pager the list is looked for. */
const MAX_CLIMB = 4;

/** Whether a child of a list is a result row. */
function isRow(element: Element): boolean {
  if (element.classList.contains(SPACER_CLASS)) return false;
  return (
    element.childElementCount > 0 || (element.textContent ?? "").trim() !== ""
  );
}

/** Returns a list's result rows. */
export function rowsOf(container: Element): HTMLElement[] {
  return [...container.children].filter(isRow) as HTMLElement[];
}

/**
 * Scores how well a run of rows fits a list paged in steps of `step`; lower is better.
 *
 * Other runs of rows sit beside the real list: the property market's type
 * options above its listings, the newspaper's section menu above the comics.
 * The list itself holds exactly one page of rows, or fewer on its last page,
 * and that is what tells them apart. Rows Show more added are not counted.
 */
function fitScore(container: Element, step: number | null): number {
  const own = rowsOf(container).filter((row) => !row.hasAttribute(EXTRA_ROW_ATTR)).length;
  if (step === null) return 1;
  if (own === step) return 0;
  return own < step ? 1 : 2;
}

/** Returns the best-fitting result list inside a subtree, with its score. */
function findRowContainer(
  root: Element,
  step: number | null,
): { container: HTMLElement; score: number } | null {
  if (root.closest(NOT_A_LIST)) return null;
  let best: { container: HTMLElement; score: number; rows: number } | null = null;
  const candidates = root.matches(ROW_CONTAINER_SELECTOR)
    ? [root as HTMLElement, ...root.querySelectorAll<HTMLElement>(ROW_CONTAINER_SELECTOR)]
    : [...root.querySelectorAll<HTMLElement>(ROW_CONTAINER_SELECTOR)];
  for (const element of candidates) {
    if (element.closest(PAGINATION_SELECTOR)) continue;
    if (element.closest(NOT_A_LIST)) continue;
    const rows = rowsOf(element).length;
    if (rows < 2) continue;
    const score = fitScore(element, step);
    if (!best || score < best.score || (score === best.score && rows > best.rows)) {
      best = { container: element, score, rows };
    }
  }
  return best;
}

/** Whether an element is an empty layout spacer. */
function isSpacer(element: Element): boolean {
  return (
    element.childElementCount === 0 && (element.textContent ?? "").trim() === ""
  );
}

/** Returns a node's siblings, nearest first. */
function siblingsOf(node: Element): Element[] {
  const after: Element[] = [];
  const before: Element[] = [];
  for (const [direction, into] of [
    ["nextElementSibling", after],
    ["previousElementSibling", before],
  ] as const) {
    let sibling = node[direction];
    while (sibling) {
      if (
        !sibling.matches(PAGINATION_SELECTOR) &&
        !isSpacer(sibling)
      ) {
        into.push(sibling);
      }
      sibling = sibling[direction];
    }
  }
  const found: Element[] = [];
  for (let step = 0; step < Math.max(after.length, before.length); step += 1) {
    const next = after[step];
    const previous = before[step];
    if (next) found.push(next);
    if (previous) found.push(previous);
  }
  return found;
}

/**
 * Returns the list a pager belongs to, with how well it fits.
 *
 * Every block beside the pager, and beside each of its parents a few levels
 * up, is weighed, and the best fit wins; between equal fits, the nearest.
 */
function findList(widget: HTMLElement, step: number | null): (ListTarget & { score: number }) | null {
  let best: (ListTarget & { score: number }) | null = null;
  let node: Element | null = widget;
  for (let level = 0; node && node !== document.body && level <= MAX_CLIMB; level += 1) {
    if (node.matches(CONTENT_ROOT_SELECTOR)) break;
    for (const sibling of siblingsOf(node)) {
      const found = findRowContainer(sibling, step);
      if (!found || (best && found.score >= best.score)) continue;
      best = {
        widget,
        pagerBlock: node as HTMLElement,
        block: sibling as HTMLElement,
        container: found.container,
        step: step ?? pageStepFor(widget, found.container),
        score: found.score,
      };
      if (found.score === 0) return best;
    }
    node = node.parentElement;
  }
  return best;
}

/** Whether an element is on screen, rather than in a tab Torn has hidden. */
function isShown(element: Element): boolean {
  return element.getClientRects().length > 0;
}

/** Whether the pager is above the list it belongs to. */
function pagerIsAbove(target: ListTarget): boolean {
  return Boolean(
    target.pagerBlock.compareDocumentPosition(target.block) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

/**
 * Returns the list on the page, found from its pagers.
 *
 * The best-fitting list wins; of the pagers that find it, one above it is
 * preferred, since that is where a reader meets it.
 */
export function findTarget(): ListTarget | null {
  let best: (ListTarget & { score: number }) | null = null;
  for (const widget of document.querySelectorAll<HTMLElement>(PAGINATION_SELECTOR)) {
    if (!widget.querySelector(PAGE_LINK_SELECTOR)) continue;
    // The auction market draws every tab's list and pager and hides all but
    // one, and the first in the page is not the one being looked at.
    if (!isShown(widget)) continue;
    const found = findList(widget, pageStepFor(widget));
    if (!found) continue;
    const better =
      !best ||
      found.score < best.score ||
      (found.score === best.score &&
        found.container === best.container &&
        pagerIsAbove(found) &&
        !pagerIsAbove(best));
    if (better) best = found;
  }
  return best;
}

/**
 * Returns the offset of the page Torn is showing, from its pager or else the hash.
 *
 * A pager this script redrew marks the first loaded page as active, so this
 * reads the same before and after a redraw.
 */
function shownStart(widget: Element, step: number): number {
  if (widget.querySelector(`${PAGE_LINK_SELECTOR}.active`)) {
    return (pagerPages(widget).active - 1) * step;
  }
  const match = START_IN_HASH.exec(location.hash);
  return match ? Number(match[1]) : 0;
}

/** Returns the same list, found inside a fetched page. */
function matchingContainer(
  parsed: Document,
  live: HTMLElement,
): HTMLElement | null {
  const sameTag = [
    ...parsed.querySelectorAll<HTMLElement>(live.tagName.toLowerCase()),
  ].filter((element) => rowsOf(element).length > 0);
  if (sameTag.length === 0) return null;

  const liveClasses = [...live.classList];
  const byClass = sameTag.filter((element) =>
    liveClasses.some((name) => element.classList.contains(name)),
  );
  const pool = byClass.length > 0 ? byClass : sameTag;
  return pool.reduce((best, element) =>
    rowsOf(element).length > rowsOf(best).length ? element : best,
  );
}

/**
 * Returns the rows in a response that is a bare run of rows.
 *
 * Some endpoints answer with the list element and its rows; others answer
 * with the rows alone and leave the page to put them where they go. In the
 * second case there is no list in the response to match against, so the
 * response body stands in for one when its children are the right shape.
 */
function looseRows(parsed: Document, live: HTMLElement): HTMLElement | null {
  const rowTag = live.firstElementChild?.tagName;
  const body = parsed.body;
  if (!rowTag || !body) return null;
  const matching = [...body.children].filter(
    (child) => child.tagName === rowTag,
  );
  return matching.length > 0 ? body : null;
}

/**
 * Returns the markup out of a list response.
 *
 * Torn's newer endpoints answer with JSON that carries the rows as a string
 * of HTML under some key or other, so the longest string in the response that
 * looks like markup is the one worth parsing.
 */
function markupIn(text: string): string {
  const head = text.trimStart()[0];
  if (head !== "{" && head !== "[") return text;

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return text;
  }

  let best = "";
  const looksLikeRows = /<\s*(li|tr|div|ul|ol|table|tbody)\b/i;
  const walk = (value: unknown, depth: number): void => {
    if (depth > 6) return;
    if (typeof value === "string") {
      if (looksLikeRows.test(value) && value.length > best.length) best = value;
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    if (value !== null && typeof value === "object") {
      for (const item of Object.values(value)) walk(item, depth + 1);
    }
  };
  walk(data, 0);
  return best === "" ? text : best;
}

/** Sends a list's request once, at the given offset, the way Torn's page does, and returns its rows. */
async function fetchRows(
  request: string,
  start: number,
  live: HTMLElement,
): Promise<HTMLElement[]> {
  // Torn's own requests carry its token as ?rfcv=.
  const rfcv = RFCV_COOKIE.exec(document.cookie)?.[1];
  const url = `${location.pathname.slice(1)}${rfcv ? `?rfcv=${rfcv}` : ""}`;
  const body = `${request}&start=${start}`;

  let html: string;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      credentials: "same-origin",
      body,
    });
    if (!response.ok) {
      log("fetch: start", start, "->", response.status, response.statusText);
      return [];
    }
    html = await response.text();
  } catch {
    return [];
  }

  // Data first. A list that answers with JSON has its rows built from the
  // values, by copying one the page has already drawn; checking this before
  // going looking for markup matters, because a response can hold both - the
  // auction market sends its pager as HTML inside the JSON, and that pager
  // would otherwise be mistaken for the list.
  const template = rowsOf(live)[0];
  const built = template ? rowsFromJson(html, template) : null;
  if (built) {
    log("fetch: start", start, "->", html.length, "chars,", built.length,
        "rows built from data");
    return built;
  }

  const parsed = new DOMParser().parseFromString(markupIn(html), "text/html");
  const container = matchingContainer(parsed, live) ?? looseRows(parsed, live);
  const rows = container ? rowsOf(container) : [];
  log(
    "fetch: start",
    start,
    "->",
    html.length,
    "chars,",
    container
      ? `matched ${container.tagName}.${container.className}`
      : "NO LIST FOUND",
    `${rows.length} rows`,
  );
  if (!container) log("fetch: the response began:", html.slice(0, 300));
  return rows;
}

/**
 * Strips anything executable out of a fetched row.
 *
 * These rows come off a response parsed with DOMParser, where scripts do not
 * run - but they would the moment the row is put into the live page. Nothing
 * fetched here needs to execute to be a row in a list.
 */
function disarm(row: HTMLElement): HTMLElement {
  for (const script of row.querySelectorAll("script, iframe, object, embed")) {
    script.remove();
  }
  for (const element of [row, ...row.querySelectorAll<HTMLElement>("*")]) {
    for (const attribute of [...element.attributes]) {
      if (attribute.name.toLowerCase().startsWith("on")) {
        element.removeAttribute(attribute.name);
      }
    }
  }
  return row;
}

/** Removes every row this script added, wherever it put them. */
function removeAllExtraRows(): void {
  const extra = document.querySelectorAll(`[${EXTRA_ROW_ATTR}]`);
  if (extra.length === 0) return;
  for (const row of extra) row.remove();
  forgetOwnChanges();
  log("more: took back", extra.length, "added rows");
}

/** Starts afresh, dropping the added rows and anything still loading. */
function reset(): void {
  removeAllExtraRows();
  more = null;
  generation += 1;
  showTopButton(false);
}

/**
 * Shows or hides the button that goes back to the top of the page.
 *
 * It appears once Show more has added rows, since a longer list is a longer
 * way back up to the pager and the page's own controls.
 */
function showTopButton(show: boolean): void {
  const existing = document.getElementById(TOP_BUTTON_ID);
  if (!show) {
    if (!existing) return;
    existing.remove();
    forgetOwnChanges();
    return;
  }
  if (existing) return;
  const button = document.createElement("button");
  button.type = "button";
  button.id = TOP_BUTTON_ID;
  button.setAttribute("aria-label", TOP_LABEL);
  button.title = TOP_LABEL;
  button.innerHTML = TOP_ICON;
  button.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  document.body.appendChild(button);
  forgetOwnChanges();
}

/** Sets the text of every Show more button, and whether they can be clicked. */
function setButtons(text: string, disabled: boolean): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>(`.${MORE_BUTTON_CLASS}`)) {
    button.textContent = text;
    button.disabled = disabled;
  }
}

/** Returns an element's tag and classes, as a name to find its like in another row by. */
function partName(element: Element): string {
  return [element.tagName, ...[...element.classList].sort()].join(".");
}

/**
 * Returns the parts hidden in every row Torn drew, by name.
 *
 * Torn's script closes some parts of a row once it draws it, such as each
 * property's details panel, so the markup a request returns has them open.
 * Only a part hidden in all of them counts: one hidden in some rows only,
 * such as a status icon, depends on the row.
 */
function closedParts(rows: Element[]): Set<string> {
  const perRow = rows.map((row) => {
    const hidden = new Set<string>();
    const shown = new Set<string>();
    for (const element of row.querySelectorAll("*")) {
      if (element.classList.length === 0) continue;
      const name = partName(element);
      if (getComputedStyle(element).display === "none") hidden.add(name);
      else shown.add(name);
    }
    for (const name of shown) hidden.delete(name);
    return hidden;
  });
  const [first, ...rest] = perRow;
  if (!first) return new Set<string>();
  return new Set<string>([...first].filter((name) => rest.every((hidden) => hidden.has(name))));
}

/** Hides the parts of an added row that are hidden in the rows Torn drew. */
function closeLikeTorn(row: HTMLElement, closed: Set<string>): HTMLElement {
  if (closed.size === 0) return row;
  for (const element of row.querySelectorAll<HTMLElement>("*")) {
    if (closed.has(partName(element))) element.style.display = "none";
  }
  return row;
}

/** Loads the next page's rows under the list: one click, one request. */
async function loadMore(): Promise<void> {
  const state = more;
  if (!state || state.loading || state.done) return;
  const target = findTarget();
  const request = listRequest();
  if (!target || target.container !== state.container || request === null) return;
  const { container } = target;
  const { step } = state;

  const mine = generation;
  state.loading = true;
  setButtons(LOADING_LABEL, true);

  const rows = await fetchRows(request, state.next, container);
  state.loading = false;
  if (mine !== generation || !container.isConnected) {
    log("more: abandoned, the list moved on");
    return;
  }

  const spacer = container.querySelector(`:scope > .${SPACER_CLASS}`);
  const closed = closedParts(rowsOf(container).filter((row) => !row.hasAttribute(EXTRA_ROW_ATTR)));
  try {
    for (const row of rows) {
      closeLikeTorn(disarm(row), closed).setAttribute(EXTRA_ROW_ATTR, "");
      if (spacer) container.insertBefore(row, spacer);
      else container.appendChild(row);
    }
  } finally {
    forgetOwnChanges();
  }
  log("more: added", rows.length, "rows from start", state.next);

  if (rows.length === 0) {
    state.done = true;
    setButtons(FAILED_LABEL, true);
    syncPagers(false);
    return;
  }
  state.next += step;
  // A short page is the last one; so is reaching a last page the pager named.
  if (rows.length < step) state.done = true;
  if (state.total !== null && state.next > (state.total - 1) * step) state.done = true;

  setButtons(SHOW_MORE_LABEL, false);
  showTopButton(true);
  syncPagers(!state.done);
}

/**
 * Returns the last page a pager of Torn's names, or null when it does not say.
 *
 * Torn shows a window of page numbers ("... 1 2 3 ..."), and a "..." after
 * the highest one means there are more pages it is not numbering. Only with
 * nothing after it is the highest number the last page.
 */
function readTotal(widget: Element): number | null {
  const items = [...widget.querySelectorAll(`${PAGE_LINK_SELECTOR}, ${PAGE_GAP_SELECTOR}`)];
  const lastLink = items.filter((item) => !isGap(item)).pop();
  if (!lastLink) return null;
  // Torn keeps a "..." in place but hidden while no pages are skipped there.
  const after = items.slice(items.indexOf(lastLink) + 1);
  if (after.some((item) => isGap(item) && isShown(item))) return null;
  return Number(lastLink.getAttribute("page")) || null;
}

/** Returns the last page of a pager as Torn drew it, or null when it does not say. */
function totalPages(widget: Element): number | null {
  return pagerTotals.has(widget) ? (pagerTotals.get(widget) ?? null) : readTotal(widget);
}

/** Returns the href of a pager's page links with the offset taken out, or null. */
function hrefBase(widget: Element): string | null {
  const links = [...widget.querySelectorAll(PAGE_LINK_SELECTOR)];
  const source =
    links.find((link) => START_IN_LINK.test(link.getAttribute("href") ?? "")) ??
    links.find((link) => (link.getAttribute("href") ?? "").length > 1);
  const href = source?.getAttribute("href");
  if (!href) return null;
  return href.replace(/(^|[#?&])start=\d+&?/, "$1").replace(/[?&]$/, "");
}

/** Returns a page link's href for an offset, in the format Torn wrote its own. */
function hrefWith(base: string, start: number): string {
  const separator = /[#?&]$/.test(base) ? "" : base.includes("#") || base.includes("?") ? "&" : "#";
  return `${base}${separator}start=${start}`;
}

/** Returns a page link's href in a pager for another offset, or null. */
function hrefAt(widget: Element, start: number): string | null {
  const base = hrefBase(widget);
  return base === null ? null : hrefWith(base, start);
}

/**
 * Whether a list only moves page through its own click handler.
 *
 * The auction market's links point at "amarket.php#itemtab=armor&start=10":
 * changing the hash alone loads nothing, and opening the address loads the
 * first tab. Lists whose links are a bare "#..." page by the hash, and lists
 * whose links are an ordinary address ("forums.php?p=threads&...&start=120",
 * "?p=main&start=8") load that page when it is opened.
 */
function pagedByClicks(widget: Element): boolean {
  const href = widget.querySelector(`${PAGE_LINK_SELECTOR}[href]`)?.getAttribute("href") ?? "";
  return href.includes("#") && href[0] !== "#";
}

/**
 * Moves to one of Torn's pages at the address its own link for that page carries.
 *
 * A "#..." link's hash is set; an ordinary address is opened, as following the
 * link would. Never by clicking a link from script: Torn logs every click and
 * whether a person made it, and a script-made click would read as one nobody
 * made.
 */
function goToPage(widget: HTMLElement, page: number, step: number): void {
  const href = hrefAt(widget, (page - 1) * step);
  if (!href || pagedByClicks(widget)) {
    log("page: no page link to follow, so cannot move to page", page);
    return;
  }
  const target = new URL(href, location.href);
  if (target.origin !== location.origin) return;
  log("page: going to page", page);
  if (href[0] === "#") location.hash = target.hash;
  else {
    // Comics links to "?p=main&start=8" but moves by "#!p=main&start=8".
    const prefix = currentList()?.hashPrefix;
    if (prefix !== undefined) location.hash = prefix + target.search.slice(1);
    else location.assign(target.href);
  }
}

/** Returns a page number box standing in for a "...". */
function buildJump(widget: HTMLElement, total: number | null, step: number): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "number";
  input.className = JUMP_CLASS;
  input.min = "1";
  if (total !== null) input.max = String(total);
  input.placeholder = "...";
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const page = Math.round(Number(input.value));
    if (!Number.isFinite(page) || page < 1) return;
    goToPage(widget, total === null ? page : Math.min(page, total), step);
  });
  return input;
}

/** Returns one page link for a redrawn pager, cut from one of Torn's. */
function pageLink(
  template: HTMLAnchorElement,
  base: string | null,
  page: number,
  step: number,
  label: string,
  active: boolean,
): HTMLAnchorElement {
  const link = template.cloneNode(true) as HTMLAnchorElement;
  link.style.removeProperty("display");
  link.setAttribute("page", String(page));
  link.setAttribute(OWN_LINK_ATTR, "");
  link.classList.remove("first", "last", "active");
  if (active) {
    link.classList.add("active");
    link.removeAttribute("href");
  } else if (base !== null) {
    link.setAttribute("href", hrefWith(base, (page - 1) * step));
  }
  const number = link.querySelector(".page-nb") ?? link;
  number.textContent = label;
  if (label !== String(page)) link.classList.add(RANGE_CLASS);
  return link;
}

/**
 * Turns one "..." of a pager into a page number box: the one after the page
 * numbers, or the one before them when there is none after.
 */
function convertOneGap(widget: HTMLElement, total: number | null, step: number): void {
  // Torn keeps a "..." in the pager but hides it while no pages are skipped there.
  const gaps = gapsOf(widget).filter(isShown);
  if (gaps.some((gap) => gap.classList.contains(JUMP_CLASS))) return;
  const active = numberLinks(widget).find((link) => link.classList.contains("active"));
  const after = active
    ? gaps.filter((gap) => active.compareDocumentPosition(gap) & Node.DOCUMENT_POSITION_FOLLOWING)
    : [];
  // The first "..." after the numbers, so a last page Torn numbers after it stays put.
  const chosen = after[0] ?? gaps[gaps.length - 1];
  chosen?.replaceWith(buildJump(widget, total, step));
}

/**
 * Brings one pager into line with what is shown.
 *
 * With nothing added, one "..." becomes a page number box. Once Show more
 * has added pages, the links are redrawn in Torn's own numbering around the
 * loaded run, which shows as one range, e.g. "4-9".
 */
function syncPager(widget: HTMLElement, step: number): void {
  // Markup with none of our marks is Torn's, freshly drawn: the new original.
  const ours = widget.querySelector(`[${OWN_LINK_ATTR}], .${JUMP_CLASS}`) !== null;
  if (!ours) {
    originalPagers.set(widget, widget.innerHTML);
    pagerTotals.set(widget, readTotal(widget));
    widget.removeAttribute(PAGER_STATE_ATTR);
  }
  const active = pagerPages(widget).active;
  const first = more ? more.base / step + 1 : active;
  const loaded = more ? more.next / step : active;
  // Once the list has run out, the last loaded page is the last page.
  const total = more?.done ? loaded : (more?.total ?? totalPages(widget));

  const state = `${first}:${loaded}:${total ?? "?"}`;
  if (widget.getAttribute(PAGER_STATE_ATTR) === state) return;

  try {
    // A page number box moves by the hash, which loads nothing on a list paged by clicks.
    const jumps = !pagedByClicks(widget);
    if (loaded <= first) {
      if (jumps) convertOneGap(widget, total, step);
      widget.setAttribute(PAGER_STATE_ATTR, state);
      return;
    }

    const numbers = numberLinks(widget);
    const template = numbers.find((link) => !link.classList.contains("active")) ?? numbers[0];
    if (!template) return;
    const anchor =
      widget.querySelector(ARROW_NEXT_ANY)?.closest("a") ?? widget.querySelector(".pagination-r");
    // Read before the old links go, since they are what these are read from.
    const base = hrefBase(widget);
    const gapTemplate = gapsOf(widget).find((gap) => !gap.classList.contains(JUMP_CLASS))?.cloneNode(true) ?? null;
    // Only ever placed where pages are skipped, so shown even if Torn's was hidden.
    const plainGap = (): Node => {
      const gap = gapTemplate?.cloneNode(true);
      if (!(gap instanceof HTMLElement)) return document.createTextNode(" ... ");
      gap.style.removeProperty("display");
      return gap;
    };

    // Torn's run of numbers, with page 1 and the last page named at the ends
    // when the pager knows the last page, as Torn's own does.
    const before = [first - 2, first - 1].filter((page) => page >= 1);
    const after = [loaded + 1, loaded + 2].filter((page) => total === null || page <= total);
    const showFirst = total !== null && (before[0] ?? first) > 1;
    const showLast = total !== null && (after[after.length - 1] ?? loaded) < total;
    const hiddenBefore = (before[0] ?? first) > (showFirst ? 2 : 1);
    const hiddenAfter = total === null || (after[after.length - 1] ?? loaded) < total - (showLast ? 1 : 0);

    const fragment = document.createDocumentFragment();
    const add = (page: number, label: string, isActive: boolean) =>
      fragment.appendChild(pageLink(template, base, page, step, label, isActive));
    // One page number box per pager: after the numbers, or before them if nothing is hidden after.
    if (showFirst) add(1, "1", false);
    if (hiddenBefore) {
      fragment.appendChild(jumps && !hiddenAfter ? buildJump(widget, total, step) : plainGap());
    }
    for (const page of before) add(page, String(page), false);
    add(first, `${first}-${loaded}`, true);
    for (const page of after) add(page, String(page), false);
    if (hiddenAfter) fragment.appendChild(jumps ? buildJump(widget, total, step) : plainGap());
    if (showLast && total !== null) {
      add(total, String(total), false);
      (fragment.lastChild as HTMLElement).classList.add("last");
    }

    for (const old of widget.querySelectorAll(
      `${PAGE_LINK_SELECTOR}, ${PAGE_GAP_SELECTOR}, .${JUMP_CLASS}`,
    )) {
      old.remove();
    }
    if (anchor && anchor.parentElement === widget) widget.insertBefore(fragment, anchor);
    else widget.appendChild(fragment);
    if (base === null) log("pager: no page link with an address, so the redrawn links have none");

    widget.querySelector(ARROW_PREV_ANY)?.classList.toggle(ARROW_DISABLED_CLASS, first <= 1);
    widget
      .querySelector(ARROW_NEXT_ANY)
      ?.classList.toggle(ARROW_DISABLED_CLASS, total !== null && loaded >= total);
    widget.setAttribute(PAGER_STATE_ATTR, state);
  } finally {
    forgetOwnChanges();
  }
}

/**
 * Puts a Show more button at the right end of a pager, styled from its current page.
 *
 * The button takes the current page's corners, colours and type, but shows
 * only its outline; the filled look comes while it is pressed.
 */
function ensurePagerButton(widget: HTMLElement): void {
  if (widget.querySelector(`.${MORE_BUTTON_CLASS}`)) return;
  const active = widget.querySelector<HTMLElement>(`${PAGE_LINK_SELECTOR}.active`);
  const button = document.createElement("button");
  button.type = "button";
  button.className = MORE_BUTTON_CLASS;
  const shown = document.querySelector<HTMLButtonElement>(`.${MORE_BUTTON_CLASS}`);
  button.textContent = shown?.textContent ?? SHOW_MORE_LABEL;
  button.disabled = shown?.disabled ?? false;
  if (active) {
    const style = getComputedStyle(active);
    const transparent = /rgba\(0, 0, 0, 0\)|transparent/.test(style.backgroundColor);
    button.style.setProperty("--aue-more-bg", style.backgroundColor);
    button.style.setProperty("--aue-more-img", style.backgroundImage);
    button.style.setProperty("--aue-more-edge", transparent ? "rgba(255, 255, 255, 0.3)" : style.backgroundColor);
    button.style.setProperty("--aue-more-radius", style.borderRadius);
    button.style.setProperty("--aue-more-color", style.color);
    button.style.setProperty("--aue-more-height", `${active.getBoundingClientRect().height || 26}px`);
    button.style.setProperty("--aue-more-font", style.fontFamily);
    button.style.setProperty("--aue-more-size", style.fontSize);
  }
  button.addEventListener("click", () => void loadMore());
  if (getComputedStyle(widget).position === "static") widget.style.position = "relative";
  widget.appendChild(button);
  // Room on the right for the button, so the page numbers move left rather
  // than run underneath it. The pager's own padding is kept to put back.
  if (widget.dataset.aueMorePadding === undefined) {
    widget.dataset.aueMorePadding = widget.style.paddingRight;
  }
  const room = button.offsetWidth + 2 * MORE_BUTTON_GAP_PX;
  if (parseFloat(getComputedStyle(widget).paddingRight) < room) widget.style.paddingRight = `${room}px`;
  forgetOwnChanges();
}

/** Brings every shown pager into line with what is shown, with or without a Show more button. */
function syncPagers(showButton: boolean): void {
  for (const widget of document.querySelectorAll<HTMLElement>(PAGINATION_SELECTOR)) {
    if (!widget.querySelector(PAGE_LINK_SELECTOR) || !isShown(widget)) continue;
    const step = pageStepFor(widget) ?? more?.step;
    if (step === undefined) continue;
    syncPager(widget, step);
    // A button showing its last word stays until the page moves, so it is seen.
    const failed = widget.querySelector(`.${MORE_BUTTON_CLASS}:disabled`) !== null && !more?.loading;
    if (showButton) ensurePagerButton(widget);
    else if (!failed) removeButtons(widget);
  }
}

/** Takes the Show more buttons out of a pager, or out of every pager. */
function removeButtons(root: ParentNode = document): void {
  const buttons = root.querySelectorAll(`.${MORE_BUTTON_CLASS}`);
  if (buttons.length === 0) return;
  for (const button of buttons) {
    const widget = button.parentElement;
    button.remove();
    if (widget?.dataset.aueMorePadding !== undefined) {
      widget.style.paddingRight = widget.dataset.aueMorePadding;
      delete widget.dataset.aueMorePadding;
    }
  }
  forgetOwnChanges();
}

/** Puts every redrawn pager back as Torn drew it. */
function restorePagers(): void {
  for (const widget of document.querySelectorAll<HTMLElement>(`[${PAGER_STATE_ATTR}]`)) {
    const original = originalPagers.get(widget);
    if (original !== undefined) widget.innerHTML = original;
    widget.removeAttribute(PAGER_STATE_ATTR);
  }
  forgetOwnChanges();
}

/**
 * Returns which way a click in a pager points: at its next arrow, its
 * previous arrow, or neither.
 *
 * Walked up from what was clicked, so it holds whether Torn wraps an arrow
 * in a link, a span or nothing at all.
 */
function arrowDirection(clicked: Element, widget: Element): "next" | "prev" | null {
  for (let node: Element | null = clicked; node && node !== widget; node = node.parentElement) {
    const next = node.matches(ARROW_NEXT_ANY) || node.querySelector(ARROW_NEXT_ANY) !== null;
    const prev = node.matches(ARROW_PREV_ANY) || node.querySelector(ARROW_PREV_ANY) !== null;
    if (next && !prev) return "next";
    if (prev && !next) return "prev";
    if (next && prev) return null;
  }
  return null;
}

/** Sends a click on a pager arrow past the pages Show more added. */
function installArrowClicks(): void {
  document.addEventListener(
    "click",
    (event) => {
      if (!isEnabled(LIST_DISPLAY_EXTENSION)) return;
      const state = more;
      if (!state || state.next - state.base <= state.step) return;
      const clicked = event.target;
      if (!(clicked instanceof Element)) return;
      const widget = clicked.closest<HTMLElement>(PAGINATION_SELECTOR);
      if (!widget || pagedByClicks(widget)) return;

      // Torn's own arrows go one page on from the page it drew, which is
      // already showing; these go to the first page not yet shown.
      const direction = arrowDirection(clicked, widget);
      if (direction === null) return;
      const page = direction === "next" ? state.next / state.step + 1 : state.base / state.step;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (page < 1 || (state.done && direction === "next")) return;
      goToPage(widget, page, state.step);
    },
    true,
  );
}

/** The last reason the button was kept off the page, so each is logged once. */
let lastHiddenReason = "";

/** Logs why the button is off the page, once per change of reason. */
function hiddenBecause(reason: string): void {
  if (reason === lastHiddenReason) return;
  lastHiddenReason = reason;
  log("more: no button -", reason);
}

/** Returns why no list was found, from what pagers the page has. */
function whyNoList(): string {
  const pagers = [...document.querySelectorAll(PAGINATION_SELECTOR)];
  if (pagers.length === 0) return "no element matches .pagination on this page";
  const withLinks = pagers.filter((widget) => widget.querySelector(PAGE_LINK_SELECTOR));
  if (withLinks.length === 0) {
    const sample = pagers[0]?.innerHTML.replace(/\s+/g, " ").slice(0, 300) ?? "";
    return `${pagers.length} pager(s), none with a.page-number[page] links. First pager: ${sample}`;
  }
  if (!withLinks.some(isShown)) return `${withLinks.length} pager(s) with links, all hidden`;
  return "a pager is shown, but no list of rows was found beside it";
}

/** Brings the buttons and pagers into line with the list on the page. */
function apply(): void {
  if (!isEnabled(LIST_DISPLAY_EXTENSION)) {
    removeButtons();
    restorePagers();
    if (more) reset();
    return;
  }

  const target = findTarget();
  if (!target) {
    hiddenBecause(whyNoList());
    removeButtons();
    return;
  }
  if (target.step === null) {
    hiddenBecause("the list was found, but its rows per page could not be read");
    removeButtons();
    return;
  }
  const { step } = target;

  // A new list, or Torn moved to another page of it: what was added belonged
  // to the page before. A pager this script redrew marks the first loaded
  // page as current, so this reads the same before and after a redraw.
  const base = shownStart(target.widget, step);
  if (!more || more.container !== target.container || more.base !== base) {
    if (more) reset();
    const total = totalPages(target.widget);
    more = {
      container: target.container,
      step,
      base,
      next: base + step,
      total,
      done: total !== null && base + step > (total - 1) * step,
      loading: false,
    };
    log("more: list of", step, "a page, at start", base, "of", total ?? "an unknown number of", "pages");
  }
  const state = more;

  const request = listRequest();
  syncPagers(!state.done && request !== null);

  if (state.done || request === null) {
    hiddenBecause(
      state.done
        ? `on the last page (start ${state.base}, ${step} a page)`
        : `not a list Show more knows: ${location.pathname}${location.search}${location.hash}`,
    );
    return;
  }
  lastHiddenReason = "";
}

/** Adds Show more buttons and page number boxes to the pagers of Torn's paged lists. */
export function installListDisplay(): void {
  installArrowClicks();

  // Earlier versions learnt list requests as the reader paged; those are no longer used.
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(OLD_REQUEST_PREFIX)) localStorage.removeItem(key);
    }
  } catch {}

  let timer = 0;
  let deadline = 0;
  const schedule = () => {
    const now = Date.now();
    if (deadline === 0) deadline = now + MAX_SETTLE_MS;
    clearTimeout(timer);
    timer = window.setTimeout(
      () => {
        deadline = 0;
        apply();
      },
      Math.max(0, Math.min(SETTLE_MS, deadline - now)),
    );
  };

  // Only elements coming or going matter. Text changing in place, such as
  // Torn's countdowns ticking, never moves a list or a pager.
  observer = new MutationObserver((records) => {
    const elements = (nodes: NodeList) => [...nodes].some((node) => node.nodeType === Node.ELEMENT_NODE);
    if (records.some((record) => elements(record.addedNodes) || elements(record.removedNodes))) schedule();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  addEventListener("hashchange", () => {
    // Torn's own list sync has to find the list as it left it.
    reset();
    removeButtons();
    schedule();
  });

  schedule();
}
