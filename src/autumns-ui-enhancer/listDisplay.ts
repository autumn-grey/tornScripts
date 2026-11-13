// An items-per-page control for Torn's paged lists, and a pager that steps by it.

import { log } from "./debug";
import { rowsFromJson } from "./jsonRows";
import {
  LIST_DISPLAY_EXTENSION,
  isEnabled,
  readSetting,
  writeSetting,
} from "./settings";

/** The pager widget. Pages usually carry two, above and below the list. */
const PAGINATION_SELECTOR = ".pagination";
/** A numbered page link; the attribute holds Torn's own page number. */
const PAGE_LINK_SELECTOR = "a.page-number[page]";
/** The "..." between runs of page numbers. */
const PAGE_GAP_SELECTOR = "span.points";
const ARROW_PREV_SELECTOR = "i.pagination-left";
const ARROW_NEXT_SELECTOR = "i.pagination-right";
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

/**
 * The most requests one page of a list may cost.
 *
 * Nothing here assumes how many rows a request returns. Torn's lists differ -
 * the bounty board sends 20, the auction market 10 - so the step is read from
 * each list's own pager, and a list it cannot be read from is left alone.
 */
const MAX_REQUESTS = 5;
/** Gap between top-up requests, so a size change is a trickle not a burst. */
const THROTTLE_MS = 150;
/** Settles the mutation observer before re-reading the page. */
const SETTLE_MS = 150;
/** The longest a pass can be held off. */
const MAX_SETTLE_MS = 1000;

const SIZE_SETTING = "ITEMS_PER_PAGE";
const CONTROL_ID = "aue-per-page";
const SELECT_ID = "aue-per-page-select";
const STATUS_CLASS = "aue-per-page-status";
/** Marks a row this script appended, so it can be told from Torn's own. */
const EXTRA_ROW_ATTR = "data-aue-extra";
/** Stops the pager being rebuilt on every mutation it causes itself. */
const PAGER_STATE_ATTR = "data-aue-pager";
/** Marks a page link this script drew, so Torn redrawing the pager over it shows. */
const OWN_LINK_ATTR = "data-aue-page";
/** How long after a page move Torn's redrawn pager is renumbered on the spot. */
const PAGING_HOLD_MS = 8000;
/** Matches the post a forum link points at, which Torn pages to on its own. */
const POST_IN_HASH = /[?&]to=(\d+)/;

interface CapturedRequest {
  method: string;
  url: string;
  body: string | null;
  /**
   * Where this request's paging offset lives.
   *
   * Torn's older pages POST a form body carrying `start`; newer ones GET a
   * URL carrying it in the query. Either can be replayed, but the offset has
   * to be rewritten in the right place.
   */
  offsetIn: "body" | "url";
}

/** Matches the paging offset in a form-encoded request body. */
const START_IN_BODY = /(^|&)start=\d+/;
/** Matches the paging offset in a request's query string. */
const START_IN_URL = /([?&])start=\d+/;
/** Matches the paging offset in the URL hash. */
const START_IN_HASH = /[?&]start=(\d+)/;

/** The last list request Torn made. */
let lastRequest: CapturedRequest | null = null;
/** Set while this script is issuing its own requests, so they aren't captured. */
let ownRequest = false;
/** Identifies the page a top-up belongs to. */
let generation = 0;
/** True while this script is changing the list. */
let writing = false;
/** The fill in progress, if any. */
let filling: { key: string; container: Element } | null = null;
/** Fills that came back with nothing, so they are not attempted again. */
const failedFills = new Set<string>();
/** The most requests one page of the list may ever cost, faults included. */
const FETCH_BUDGET = 12;
/** Requests left for this page, so no fault can turn into a flood. */
let fetchBudget = FETCH_BUDGET;
/** Said once per page, not once per tick of whatever is counting down. */
let saidNoRequest = false;
/** The lists Torn has already been nudged into making a request for. */
const primed = new WeakSet<Element>();
/**
 * Which list the captured request fetched: the hash, offset aside, as it
 * stood when the response came back. Null while the request is in flight.
 *
 * The auction market keeps a list per tab on one page, so a request captured
 * on Weapons would otherwise fill Armour with weapons. Waiting for the
 * response also keeps a fill from starting while Torn is still drawing.
 */
let requestKey: string | null = null;

/** Returns which list the page is showing, from its hash with the offset taken out. */
function listKey(): string {
  return location.hash.replace(START_IN_HASH, "");
}

/** Records which list a captured request belonged to, then runs a pass. */
function requestLanded(): void {
  requestKey = listKey();
  onRequestCaptured?.();
}
/** The size setting a fill has worked under, so its pager can be trusted early. */
let trustedSetting: string | null = null;
/** Until when a page move is in flight and Torn's pager is renumbered as it lands. */
let pagingUntil = 0;
/** Hashes already pulled back onto a page boundary, so Torn and this cannot fight over one. */
const realigned = new Set<string>();
/** A forum post the reader was sent to, to scroll to once its page is filled. */
let pendingPost: { id: string; at: number } | null = null;
/** Runs a pass once a replayable request appears. */
let onRequestCaptured: (() => void) | null = null;

/** Each pager's markup as Torn rendered it, for putting back unchanged. */
const originalPagers = new WeakMap<Element, string>();
/** Torn's own page count for each pager, read once before its numbers are rewritten. */
const basePageCounts = new WeakMap<Element, number>();
/** Each list's rows per request, read once from its own pager. */
const pageSteps = new WeakMap<Element, number>();

/** Matches the paging offset anywhere in a page link's href. */
const START_IN_LINK = /(?:^|[?&#])start=(\d+)/;

/**
 * Starts afresh: a new page, or a new size on the same page.
 *
 * Anything in flight belongs to what came before, and so does everything
 * learnt about what failed, so both are let go together.
 */
function newGeneration(): void {
  generation += 1;
  failedFills.clear();
  fetchBudget = FETCH_BUDGET;
  saidNoRequest = false;
}

/** Whether a number could be a list's rows per request. */
function isPlausibleStep(step: number): boolean {
  return Number.isInteger(step) && step >= 1 && step <= 100;
}

/**
 * Returns a list's rows per request, read from its pager's own links.
 *
 * Each link carries the page it stands for and the offset it jumps to, so the
 * gap between two links is the step: 20 on the bounty board, 10 on the auction
 * market, whatever a page happens to use.
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
 * Whether a pager says there are pages after the one being shown.
 *
 * Read from the page numbers alone, so it holds before anything is known
 * about how big a page is. If it is true, the page in front of us is a full
 * one, and the rows on it are worth counting.
 */
function hasLaterPages(widget: Element): boolean {
  let active = 1;
  let last = 1;
  for (const link of widget.querySelectorAll(PAGE_LINK_SELECTOR)) {
    const page = Number(link.getAttribute("page"));
    if (!Number.isInteger(page) || page < 1) continue;
    if (link.classList.contains("active")) active = page;
    if (page > last) last = page;
  }
  return last > active;
}

/**
 * Returns a list's rows per request, caching the first good reading.
 *
 * The cache matters: once a pager has been renumbered, its links are ours and
 * no longer say anything about what the server sends.
 */
function pageStepFor(widget: Element, container?: Element): number | null {
  const cached = pageSteps.get(widget);
  if (cached !== undefined) return cached;

  let step = stepFromLinks(widget);
  let how = "its page links";

  // Failing that, the rows on a full page are themselves the step.
  if (step === null && container && hasLaterPages(widget)) {
    const own = rowsOf(container).filter(
      (row) => !row.hasAttribute(EXTRA_ROW_ATTR),
    ).length;
    if (isPlausibleStep(own) && own > 1) {
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
 * Lends a pager the step of the list it sits with.
 *
 * A page carries a pager above its list and another below. Only one of them
 * needs to be readable: they page the same list, so what is read from one
 * stands for both, and both then renumber and click alike.
 */
function adoptStep(widget: Element, step: number): void {
  if (pageSteps.has(widget)) return;
  pageSteps.set(widget, step);
}

/** Returns the page sizes a list can offer, each a whole number of requests. */
function sizeChoices(step: number): number[] {
  return Array.from({ length: MAX_REQUESTS }, (_, index) => step * (index + 1));
}

/**
 * Returns where this page's chosen size is kept.
 *
 * Each list keeps its own. They do not serve the same number of rows, so one
 * shared number cannot mean the same thing twice: 50 on the auction market,
 * which sends 10 a page, would land on the bounty board as 60, the nearest
 * whole number of its own 20-row requests.
 */
function sizeSetting(): string {
  return `${SIZE_SETTING}:${location.pathname}`;
}

/**
 * Returns the page size to use on a list with the given step.
 *
 * The reader's choice is a row count, but a page has to be a whole number of
 * requests, so it is rounded to the nearest the list can actually serve. A
 * list not yet chosen for shows Torn's own size, the smallest on offer.
 */
function pageSize(step: number): number {
  const stored = Number(readSetting(sizeSetting(), String(step)));
  const wanted = Number.isFinite(stored) && stored > 0 ? stored : step;
  const requests = Math.min(
    MAX_REQUESTS,
    Math.max(1, Math.round(wanted / step)),
  );
  return step * requests;
}

interface XhrWithUrl extends XMLHttpRequest {
  __aueUrl?: string;
  __aueMethod?: string;
}

/** Hides the values in a form body or query, leaving its shape readable. */
function redact(text: string): string {
  return text.replace(/=[^&]*/g, "=*");
}

/**
 * Records a request when it is one that could fetch this list.
 *
 * A request qualifies by carrying a paging offset: in its body, which is how
 * Torn's older pages ask for a list, or in its query, which is how the newer
 * ones do. A body offset has to come from this very page; a query offset may
 * come from anywhere on the site, because those pages fetch their lists from
 * endpoints of their own. A replay that turns out to return no list clears
 * what was captured, so a wrong guess here costs one request and no more.
 */
function rememberRequest(
  method: string,
  url: string,
  body: string | null,
): boolean {
  let address: URL;
  try {
    address = new URL(url, location.href);
  } catch {
    return false;
  }
  if (address.origin !== location.origin) return false;

  if (body !== null && START_IN_BODY.test(body)) {
    if (address.pathname !== location.pathname) return false;
    lastRequest = { method: method || "POST", url, body, offsetIn: "body" };
    requestKey = null;
    log("capture: list request to", address.pathname, redact(body));
    return true;
  }

  if (START_IN_URL.test(address.search)) {
    // Same path only. A paging offset in a query is common enough across the
    // site that anything looser captures requests belonging to other things,
    // and those get replayed four times over.
    if (address.pathname !== location.pathname) return false;
    // And never over the top of a request that pages by its body: that one is
    // the list asking for itself, while this may be any GET of the page.
    if (lastRequest?.offsetIn === "body") return false;
    lastRequest = { method: method || "GET", url, body, offsetIn: "url" };
    requestKey = null;
    log(
      "capture: list request to",
      address.pathname + redact(address.search),
      body === null ? "(no body)" : redact(body),
    );
    return true;
  }
  return false;
}

/** Starts recording the list requests Torn makes. */
export function installRequestCapture(): void {
  const openOriginal = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (
    this: XhrWithUrl,
    ...args: unknown[]
  ) {
    this.__aueMethod = String(args[0]);
    this.__aueUrl = String(args[1]);
    (openOriginal as (...a: unknown[]) => void).apply(this, args);
  } as typeof XMLHttpRequest.prototype.open;

  const sendOriginal = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (
    this: XhrWithUrl,
    body?: Document | XMLHttpRequestBodyInit | null,
  ) {
    if (!ownRequest) {
      const captured = rememberRequest(
        this.__aueMethod ?? "GET",
        this.__aueUrl ?? location.pathname,
        typeof body === "string" ? body : null,
      );
      if (captured) {
        this.addEventListener("loadend", requestLanded, {
          once: true,
        });
      }
    }
    sendOriginal.call(this, body);
  };

  const fetchOriginal = window.fetch;
  window.fetch = function (this: Window, ...args: unknown[]) {
    const input = args[0] as RequestInfo | URL;
    const init = args[1] as RequestInit | undefined;
    const body = init?.body;
    let captured = false;
    if (!ownRequest) {
      const request = input instanceof Request ? input : null;
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : (request?.url ?? "");
      captured = rememberRequest(
        init?.method ?? request?.method ?? "GET",
        url,
        typeof body === "string" ? body : null,
      );
    }
    const sent = (
      fetchOriginal as (...a: unknown[]) => Promise<Response>
    ).apply(this, args);
    if (captured) void sent.then(requestLanded).catch(() => {});
    return sent;
  } as typeof window.fetch;
}

export interface ListTarget {
  widget: HTMLElement;
  /** The block holding the pager; our dropdown goes directly above it. */
  pagerBlock: HTMLElement;
  /** The block holding the list itself. */
  block: HTMLElement;
  /** The element whose children are the result rows. */
  container: HTMLElement;
  /**
   * Rows the server sends per request for this list, or null if it could not
   * be read - in which case the page size control stays off this list.
   */
  step: number | null;
  /** Whether the pager sits above the list, where a reader meets it first. */
  pagerIsAbove: boolean;
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

/** Returns the busiest result list inside a subtree. */
function findRowContainer(root: Element, step: number | null): HTMLElement | null {
  if (root.id === CONTROL_ID) return null;
  if (root.closest(NOT_A_LIST)) return null;
  const candidates: HTMLElement[] = [];
  for (const element of root.querySelectorAll<HTMLElement>(
    ROW_CONTAINER_SELECTOR,
  )) {
    if (element.closest(PAGINATION_SELECTOR)) continue;
    if (element.closest(NOT_A_LIST)) continue;
    if (rowsOf(element).length >= 2) candidates.push(element);
  }
  if (candidates.length === 0) return null;

  const full =
    step === null ? [] : candidates.filter((c) => rowsOf(c).length >= step);
  const pool = full.length > 0 ? full : candidates;
  return pool.reduce((best, c) =>
    rowsOf(c).length > rowsOf(best).length ? c : best,
  );
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
      if (sibling.id !== CONTROL_ID && !isSpacer(sibling)) into.push(sibling);
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

/** Returns the list a pager belongs to. */
function findList(widget: HTMLElement, step: number | null): ListTarget | null {
  let node: Element | null = widget;
  for (let level = 0; node && node !== document.body && level <= MAX_CLIMB;) {
    if (node.matches(CONTENT_ROOT_SELECTOR)) break;
    for (const sibling of siblingsOf(node)) {
      const container = findRowContainer(sibling, step);
      if (container) {
        return {
          widget,
          pagerBlock: node as HTMLElement,
          block: sibling as HTMLElement,
          container,
          // A pager with no offsets in its links may still be measurable
          // from the rows it has in front of it.
          step: step ?? pageStepFor(widget, container),
          pagerIsAbove: Boolean(
            node.compareDocumentPosition(sibling) &
              Node.DOCUMENT_POSITION_FOLLOWING,
          ),
        };
      }
    }
    node = node.parentElement;
    level += 1;
  }
  return null;
}

/** Whether an element is on screen, rather than in a tab Torn has hidden. */
function isShown(element: Element): boolean {
  return element.getClientRects().length > 0;
}

/** Returns the list on the page, with the pager to hang the control off. */
export function findTarget(): ListTarget | null {
  let below: ListTarget | null = null;
  for (const widget of document.querySelectorAll<HTMLElement>(
    PAGINATION_SELECTOR,
  )) {
    if (!widget.querySelector(PAGE_LINK_SELECTOR)) continue;
    // The auction market draws every tab's list and pager and hides all but
    // one, and the first in the page is not the one being looked at.
    if (!isShown(widget)) continue;
    const target = findList(widget, pageStepFor(widget));
    if (!target) continue;
    const listIsAfterPager =
      target.pagerBlock.compareDocumentPosition(target.block) &
      Node.DOCUMENT_POSITION_FOLLOWING;
    if (listIsAfterPager) return target;
    below ??= target;
  }
  return below;
}

/** Returns the hash prefix a page link points at. */
function hashTemplate(widget: Element): string | null {
  const link = widget.querySelector<HTMLAnchorElement>(PAGE_LINK_SELECTOR);
  let href = link?.getAttribute("href") ?? "";
  if (href.length < 2 || href[0] !== "#") {
    href = location.hash.replace(START_IN_HASH, "");
  }
  if (href.length < 2) return null;
  href = href.replace(START_IN_HASH, "");
  return /[?&]$/.test(href) ? href : `${href}&`;
}

/** Returns the paging offset the page is currently at. */
function currentStart(): number {
  const match = START_IN_HASH.exec(location.hash);
  return match ? Number(match[1]) : 0;
}

/** Sends the reader to a page of the list. */
function goToPage(widget: Element, page: number, size: number): void {
  const template = hashTemplate(widget);
  if (!template) {
    log("page: no hash to build on, so this list cannot be paged by us");
    return;
  }
  const start = Math.max(0, page - 1) * size;
  log("page: going to page", page, "- start", start);
  // Torn's own list sync has to find the list as it left it.
  removeAllExtraRows();
  newGeneration(); // abandon any top-up still running for the old page
  const hash = `${template}start=${start}`;
  const step = pageStepFor(widget);
  const clicked = step !== null && pagedByClicks(widget);
  if (clicked) clickTornPage(widget, start, step);
  else if (location.hash === hash) return;
  // Kept in step either way: the offset in the hash is what the fill reads.
  if (location.hash !== hash) location.hash = hash;
  // Torn redraws its pager in its own numbering before the extra rows can
  // load; holding ours in place meanwhile stops it reading "page 6 of 217".
  if (trustedSetting === sizeSetting()) {
    pagingUntil = Date.now() + PAGING_HOLD_MS;
    holdPagers();
  }
}

/**
 * Whether a list moves page on a click on its pager rather than on a hash change.
 *
 * The auction market's links point at "amarket.php#itemtab=armor&start=10"
 * and its own handler loads the page; changing the hash alone loads nothing.
 * Lists that page by the hash link to a bare "#...".
 */
function pagedByClicks(widget: Element): boolean {
  const href = widget.querySelector(`${PAGE_LINK_SELECTOR}[href]`)?.getAttribute("href") ?? "";
  return href !== "" && href[0] !== "#";
}

/** Set while a click is being passed to Torn's own pager handler. */
let passingClick = false;

/**
 * Gets Torn's own handler to load the page at an offset.
 *
 * A stand-in link in Torn's numbering is put in the pager and clicked, so
 * Torn loads the page exactly as if the reader had clicked one of its own.
 * It is one click, answered with one request, as Torn would make it.
 */
function clickTornPage(widget: Element, start: number, step: number): void {
  const source = widget.querySelector<HTMLAnchorElement>(PAGE_LINK_SELECTOR);
  if (!source) return;
  const proxy = source.cloneNode(true) as HTMLAnchorElement;
  proxy.removeAttribute(OWN_LINK_ATTR);
  proxy.classList.remove("active", "first", "last");
  proxy.setAttribute("page", String(start / step + 1));
  const base = (source.getAttribute("href") ?? "").replace(/[?&]start=\d+/, "");
  proxy.setAttribute("href", `${base}${base.includes("#") ? "&" : "#"}start=${start}`);
  proxy.style.display = "none";
  writing = true;
  widget.appendChild(proxy);
  passingClick = true;
  try {
    proxy.click();
  } finally {
    passingClick = false;
    proxy.remove();
    writing = false;
  }
}

/**
 * Renumbers the shown pagers straight away while a page move is in flight.
 *
 * Run from the mutation observer, which fires before the browser paints, so
 * a pager Torn has just redrawn in its own numbering is never seen.
 */
function holdPagers(): void {
  if (Date.now() > pagingUntil) return;
  const target = findTarget();
  if (!target || target.step === null) return;
  if (pageSize(target.step) <= target.step) return;
  syncPagers(target.step, true);
}

/**
 * Renumbers the shown pagers for the chosen size, or puts them back as Torn
 * drew them. Pagers in a hidden tab are always put back: their list is not
 * the one being filled.
 */
function syncPagers(step: number, renumber: boolean): void {
  writing = true;
  for (const widget of document.querySelectorAll<HTMLElement>(
    PAGINATION_SELECTOR,
  )) {
    if (!widget.querySelector(PAGE_LINK_SELECTOR)) continue;
    const own = pageStepFor(widget) ?? step;
    adoptStep(widget, own);
    if (renumber && isShown(widget)) rewritePager(widget, pageSize(own), own);
    else restorePager(widget);
  }
  writing = false;
}

/**
 * Moves an offset that falls mid-page back to the start of its page.
 *
 * A forum link to a post lands on Torn's page for it, start=60 say. At 100
 * a page that is no page boundary, so the pager would call it page 1 while
 * showing posts 60 on, with no way back to the first 60. The post is kept
 * and scrolled to once its page has filled.
 */
function realign(start: number, size: number): void {
  const aligned = Math.floor(start / size) * size;
  const post = POST_IN_HASH.exec(location.hash)?.[1];
  if (post) pendingPost = { id: post, at: Date.now() };
  log("page: start", start, "is mid-page at", size, "a page, moving to", aligned);
  realigned.add(location.hash);
  removeAllExtraRows();
  newGeneration();
  // The post goes from the hash, or Torn would page straight back to it.
  location.hash = location.hash
    .replace(START_IN_HASH, (match) => match.replace(/\d+$/, String(aligned)))
    .replace(POST_IN_HASH, "");
}

/** Returns the row a forum post sits in, matched on an id or data attribute ending in its number. */
function rowHolding(container: Element, id: string): HTMLElement | null {
  const ending = new RegExp(`(?:^|\\D)${id}$`);
  const holds = (element: Element) =>
    [...element.attributes].some(
      (attribute) =>
        (attribute.name === "id" || attribute.name.startsWith("data-")) &&
        ending.test(attribute.value),
    );
  const rows = rowsOf(container);
  // The row's own marks first: a quote inside an earlier post can carry the
  // number of the post it quotes.
  return (
    rows.find(holds) ??
    rows.find((row) => [...row.querySelectorAll("*")].some(holds)) ??
    null
  );
}

/** Scrolls to the post a realigned forum link pointed at, once its row is in. */
function scrollToPendingPost(container: Element): void {
  if (!pendingPost) return;
  const { id, at } = pendingPost;
  pendingPost = null;
  if (Date.now() - at > 30_000) return;
  const row = rowHolding(container, id);
  if (!row) {
    log("page: post", id, "is not in this page's rows");
    return;
  }
  // The jump block swallows scrolls for a second after a navigation.
  setTimeout(() => row.scrollIntoView({ block: "start" }), Math.max(0, at + 1200 - Date.now()));
}

interface PagerModel {
  /** Torn's own page count, at the step it serves. */
  base: number;
  current: number;
  total: number;
}

/** Returns Torn's own page count for a pager. */
function basePageCount(widget: Element): number | null {
  const stored = basePageCounts.get(widget);
  if (stored !== undefined) return stored;

  const links = [
    ...widget.querySelectorAll<HTMLAnchorElement>(PAGE_LINK_SELECTOR),
  ];
  if (links.length === 0) return null;

  const pageOf = (link: Element) => Number(link.getAttribute("page")) || 1;
  const last = widget.querySelector(`${PAGE_LINK_SELECTOR}.last`);
  const pages = last ? pageOf(last) : Math.max(1, ...links.map(pageOf));

  if (last) basePageCounts.set(widget, pages);
  log(
    "pager: Torn reports",
    pages,
    "pages",
    last ? "" : "(pager unfinished, not cached)",
  );
  return pages;
}

/** Returns which page of how many the reader is on. */
function pagerModel(
  widget: Element,
  size: number,
  step: number,
): PagerModel | null {
  const basePages = basePageCount(widget);
  if (basePages === null) return null;
  const total = Math.max(1, Math.ceil((basePages * step) / size));
  const current = Math.min(total, Math.floor(currentStart() / size) + 1);
  return { base: basePages, current, total };
}

/** Returns the page numbers a pager should offer. */
function pagesToShow(model: PagerModel): number[] {
  const wanted = new Set<number>([1, model.total]);
  for (let page = model.current - 2; page <= model.current + 2; page += 1) {
    if (page >= 1 && page <= model.total) wanted.add(page);
  }
  return [...wanted].sort((a, b) => a - b);
}

/** Clears an element's inline display. */
function unhide(element: HTMLElement): void {
  element.style.removeProperty("display");
}

/** Renumbers a pager to count in the chosen page size. */
function rewritePager(widget: HTMLElement, size: number, step: number): void {
  // Torn can redraw a pager inside the same element, leaving our state mark
  // on markup that is Torn's again. That markup is the fresh original.
  const tornsAgain =
    widget.querySelector(`${PAGE_LINK_SELECTOR}:not([${OWN_LINK_ATTR}])`) !== null;
  if (tornsAgain && originalPagers.has(widget)) {
    originalPagers.delete(widget);
    basePageCounts.delete(widget);
    widget.removeAttribute(PAGER_STATE_ATTR);
  }

  const model = pagerModel(widget, size, step);
  if (!model) return;

  const state = `${size}:${model.current}:${model.total}`;
  if (widget.getAttribute(PAGER_STATE_ATTR) === state) return;
  log(
    "pager: page",
    model.current,
    "of",
    model.total,
    "at",
    size,
    "per page, in steps of",
    step,
  );

  if (!originalPagers.has(widget)) {
    originalPagers.set(widget, widget.innerHTML);
    basePageCounts.set(widget, model.base);
  }

  const template = widget.querySelector<HTMLAnchorElement>(PAGE_LINK_SELECTOR);
  const gap = widget.querySelector(PAGE_GAP_SELECTOR);
  if (!template) return;

  const nextArrow = widget.querySelector(ARROW_NEXT_SELECTOR)?.closest("a");
  const anchorPoint =
    nextArrow ?? widget.querySelector(".pagination-r") ?? null;

  const blank = template.cloneNode(true) as HTMLAnchorElement;
  const blankGap = gap?.cloneNode(true) ?? null;
  unhide(blank);
  if (blankGap instanceof HTMLElement) unhide(blankGap);

  for (const old of widget.querySelectorAll(
    `${PAGE_LINK_SELECTOR}, ${PAGE_GAP_SELECTOR}`,
  )) {
    old.remove();
  }

  const pages = pagesToShow(model);
  const fragment = document.createDocumentFragment();
  let previous = 0;

  for (const page of pages) {
    if (previous !== 0 && page !== previous + 1 && blankGap) {
      fragment.appendChild(blankGap.cloneNode(true));
    }
    const link = blank.cloneNode(true) as HTMLAnchorElement;
    link.setAttribute("page", String(page));
    link.setAttribute(OWN_LINK_ATTR, "");
    link.classList.remove("first", "last", "active");
    if (page === 1) link.classList.add("first");
    if (page === model.total) link.classList.add("last");
    if (page === model.current) link.classList.add("active");
    const number = link.querySelector(".page-nb") ?? link;
    number.textContent = String(page);
    fragment.appendChild(link);
    previous = page;
  }

  if (anchorPoint) widget.insertBefore(fragment, anchorPoint);
  else widget.appendChild(fragment);

  const prev = widget.querySelector(ARROW_PREV_SELECTOR);
  const next = widget.querySelector(ARROW_NEXT_SELECTOR);
  prev?.classList.toggle(ARROW_DISABLED_CLASS, model.current <= 1);
  next?.classList.toggle(ARROW_DISABLED_CLASS, model.current >= model.total);

  widget.setAttribute(PAGER_STATE_ATTR, state);
}

/** Puts a pager back the way Torn rendered it. */
function restorePager(widget: HTMLElement): void {
  const original = originalPagers.get(widget);
  if (original === undefined) return;
  widget.innerHTML = original;
  widget.removeAttribute(PAGER_STATE_ATTR);
  originalPagers.delete(widget);
  basePageCounts.delete(widget);
}

/** Takes over pager clicks while a custom page size is in force. */
function installPagerClicks(): void {
  document.addEventListener(
    "click",
    (event) => {
      if (passingClick || !isEnabled(LIST_DISPLAY_EXTENSION)) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("a");
      const widget = link?.closest<HTMLElement>(PAGINATION_SELECTOR);
      if (!link || !widget) return;

      // Only a pager we have actually renumbered is ours to drive. If its
      // numbers are still Torn's, they mean Torn's page size, and Torn's own
      // handler knows what to do with them.
      const state = widget.getAttribute(PAGER_STATE_ATTR);
      const step = pageStepFor(widget);
      if (state === null || step === null) return;

      // The size the numbers on screen were drawn for, not the stored one.
      const size = Number(state.split(":")[0]);
      if (!Number.isInteger(size) || size <= step) return;

      const model = pagerModel(widget, size, step);
      if (!model) return;

      let page: number | null = null;
      const pageAttribute = link.getAttribute("page");
      if (pageAttribute !== null) {
        // A number Torn has just redrawn is in Torn's page size, so Torn handles it.
        if (!link.hasAttribute(OWN_LINK_ATTR)) return;
        page = Number(pageAttribute);
      } else if (link.querySelector(ARROW_PREV_SELECTOR)) {
        page = model.current - 1;
      } else if (link.querySelector(ARROW_NEXT_SELECTOR)) {
        page = model.current + 1;
      }
      if (page === null || Number.isNaN(page)) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (page < 1 || page > model.total || page === model.current) return;
      goToPage(widget, page, size);
    },
    true,
  );
}

/** Waits for a number of milliseconds. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

/** Returns the rows of the list at a given offset. */
async function fetchRows(
  start: number,
  live: HTMLElement,
): Promise<HTMLElement[]> {
  if (!lastRequest) return [];
  if (fetchBudget <= 0) {
    log("fetch: this page has had its allowance, so nothing more is asked for");
    return [];
  }
  fetchBudget -= 1;

  const { offsetIn } = lastRequest;
  const method = lastRequest.method.toUpperCase();
  const at = (_match: string, lead: string) => `${lead}start=${start}`;

  const url =
    offsetIn === "url"
      ? lastRequest.url.replace(START_IN_URL, at)
      : lastRequest.url;
  const body =
    offsetIn === "body" && lastRequest.body !== null
      ? lastRequest.body.replace(START_IN_BODY, at)
      : lastRequest.body;

  const headers: Record<string, string> = {
    "X-Requested-With": "XMLHttpRequest",
  };
  const sendsBody = method !== "GET" && method !== "HEAD" && body !== null;
  if (sendsBody) headers["Content-Type"] = "application/x-www-form-urlencoded";

  ownRequest = true;
  let html: string;
  try {
    const init: RequestInit = { method, headers, credentials: "same-origin" };
    if (sendsBody) init.body = body;
    const response = await fetch(url, init);
    if (!response.ok) {
      log("fetch: start", start, "->", response.status, response.statusText);
      return [];
    }
    html = await response.text();
  } catch {
    return [];
  } finally {
    ownRequest = false;
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
  if (!container) lastRequest = null;
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
  // What came back, when it held no rows: the one thing that says whether a
  // list can be read out of this page at all, or whether the answer is data
  // the page itself turns into rows.
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
  writing = true;
  for (const row of extra) row.remove();
  writing = false;
  log("page: took back", extra.length, "added rows before moving");
}

/** Removes the rows this script added to a list. */
function removeExtraRows(container: HTMLElement): void {
  for (const row of container.querySelectorAll(`[${EXTRA_ROW_ATTR}]`)) {
    row.remove();
  }
}

/** Fills a list out to the chosen page size. */
async function fillList(
  target: ListTarget,
  size: number,
  step: number,
): Promise<void> {
  const { container } = target;
  const have = rowsOf(container).length;
  if (have >= size) return;
  if (!container.isConnected) return;

  const start = currentStart();
  const key = `${generation}:${start}:${size}`;
  if (filling && filling.key === key && filling.container === container) return;

  // Settled already, one way or another. Without this the next tick of a
  // countdown on the page would start the whole thing over.
  if (failedFills.has(key)) return;

  if (have < step) {
    const ended = !hasLaterPages(target.widget);
    if (ended) failedFills.add(key);
    log(
      "fill: skipped -",
      have,
      "rows is short of",
      step,
      ended ? "- this is the end" : "- the list is still filling in",
    );
    return;
  }

  const mine = generation;
  filling = { key, container };
  let added = 0;
  let abandoned = false;
  const requests = Math.ceil(size / step);
  log(
    "fill:",
    have,
    "rows present, want",
    size,
    "-",
    requests - 1,
    "more request(s)",
  );
  const spacer = container.querySelector(`:scope > .${SPACER_CLASS}`);

  try {
    for (let index = 1; index < requests; index += 1) {
      setStatus(`Loading ${index + 1}/${requests}`);
      const rows = await fetchRows(start + index * step, container);
      if (mine !== generation) {
        log("fill: abandoned, the page moved on");
        abandoned = true;
        return;
      }
      if (!container.isConnected) {
        log("fill: abandoned, Torn replaced the list");
        abandoned = true;
        return;
      }
      if (rows.length === 0) {
        log("fill: stopped, that request returned no rows");
        break;
      }

      writing = true;
      try {
        for (const row of rows) {
          disarm(row).setAttribute(EXTRA_ROW_ATTR, "");
          if (spacer) container.insertBefore(row, spacer);
          else container.appendChild(row);
          added += 1;
        }
      } catch (problem) {
        log("fill: stopped, that row would not go in -", problem);
        break;
      } finally {
        writing = false;
      }

      if (rows.length < step) break;
      if (index + 1 < requests) await delay(THROTTLE_MS);
      if (mine !== generation) {
        abandoned = true;
        return;
      }
    }
    log("fill: done,", rowsOf(container).length, "rows now showing");
  } finally {
    writing = false;
    if (added === 0 && !abandoned) {
      failedFills.add(key);
      log("fill: nothing came back, so this page is left as Torn sent it");
    }
    if (filling && filling.container === container && filling.key === key) {
      filling = null;
    }
    setStatus("");
  }
}

/** Shows progress beside the dropdown. */
function setStatus(text: string): void {
  const status = document.querySelector<HTMLElement>(`.${STATUS_CLASS}`);
  if (status) status.textContent = text;
}

/** Returns the items-per-page control for a list with the given step. */
function buildControl(step: number): HTMLElement {
  const bar = document.createElement("div");
  bar.id = CONTROL_ID;
  bar.className = "aue-per-page";
  bar.dataset.aueStep = String(step);

  const status = document.createElement("span");
  status.className = STATUS_CLASS;
  bar.appendChild(status);

  const label = document.createElement("label");
  label.className = "aue-per-page-label";
  label.htmlFor = SELECT_ID;
  label.textContent = "Items per page";
  bar.appendChild(label);

  const select = document.createElement("select");
  select.id = SELECT_ID;
  select.className = "aue-per-page-select";
  for (const size of sizeChoices(step)) {
    const option = document.createElement("option");
    option.value = String(size);
    option.textContent = String(size);
    select.appendChild(option);
  }
  select.value = String(pageSize(step));
  select.addEventListener("change", () => onSizeChange(Number(select.value)));
  bar.appendChild(select);

  return bar;
}

/** Applies a newly chosen page size. */
function onSizeChange(chosen: number): void {
  writeSetting(sizeSetting(), String(chosen));
  newGeneration();
  setStatus("");

  const target = findTarget();
  if (!target || target.step === null) return;
  const size = pageSize(target.step);

  writing = true;
  removeExtraRows(target.container);
  writing = false;
  syncPagers(target.step, false);

  const page = Math.floor(currentStart() / size) + 1;
  const before = location.hash;
  goToPage(target.widget, page, size);
  if (location.hash === before) setTimeout(() => void apply(), 0);
}

/** Words Torn puts beside a page size control of its own. */
const OWN_SIZE_LABEL = "per page";

/** Whether every choice in a dropdown is a plain number. */
function offersOnlyNumbers(select: HTMLSelectElement): boolean {
  if (select.options.length === 0) return false;
  return [...select.options].every((option) =>
    /^\d+$/.test((option.textContent ?? "").trim()),
  );
}

/**
 * Whether a dropdown is labelled as setting a page size.
 *
 * Only what sits beside the dropdown counts: its own siblings, its parent's
 * siblings, and a label pointing at it by id. Reading whole ancestors was
 * too blunt in two ways - any mention of the words further up the page
 * matched, and so did this script's own "Items per page", which would have
 * had the control switch itself off wherever it had placed itself near
 * another dropdown of numbers.
 */
function labelledPerPage(select: HTMLSelectElement): boolean {
  const nearby: string[] = [];

  const collectSiblings = (of: Element | null): void => {
    for (const sibling of of?.parentElement?.childNodes ?? []) {
      if (sibling === of) continue;
      // Never read this script's own control: its label says the very words
      // being looked for, which would make the test answer itself.
      if (sibling instanceof Element && sibling.closest(`#${CONTROL_ID}`)) {
        continue;
      }
      nearby.push(sibling.textContent ?? "");
    }
  };

  collectSiblings(select);
  collectSiblings(select.parentElement);

  if (select.id) {
    const label = document.querySelector(
      `label[for="${CSS.escape(select.id)}"]`,
    );
    if (label && !label.closest(`#${CONTROL_ID}`)) {
      nearby.push(label.textContent ?? "");
    }
  }

  return nearby.join(" ").toLowerCase().includes(OWN_SIZE_LABEL);
}

/**
 * Whether Torn already lets the reader set this list's page size.
 *
 * Some lists come with the thing this feature adds - the faction armoury has
 * its own "Items per page" - and on those there is nothing to improve and a
 * second set of controls to trip over. A dropdown of nothing but numbers,
 * labelled as being per page, is Torn's own, and this list is left to it.
 */
function tornSetsTheSizeHere(target: ListTarget): boolean {
  let scope: HTMLElement | null = target.block.parentElement;
  while (scope && !scope.contains(target.pagerBlock)) {
    scope = scope.parentElement;
  }
  if (!scope) return false;

  for (const select of scope.querySelectorAll<HTMLSelectElement>("select")) {
    if (select.closest(`#${CONTROL_ID}`)) continue;
    if (offersOnlyNumbers(select) && labelledPerPage(select)) return true;
  }
  return false;
}

/** Marks the pager this script put above a list, and the page it was cut for. */
const TOP_PAGER_ATTR = "data-aue-top-pager";

/** Returns the pager Torn drew, rather than the copy of it we may have made. */
function tornsOwnPager(): HTMLElement | null {
  for (const widget of document.querySelectorAll<HTMLElement>(
    PAGINATION_SELECTOR,
  )) {
    if (widget.hasAttribute(TOP_PAGER_ATTR) || !isShown(widget)) continue;
    if (widget.querySelector(PAGE_LINK_SELECTOR)) return widget;
  }
  return null;
}

/**
 * Puts a copy of the pager above the list, where Torn only put one below.
 *
 * Some lists carry a pager at each end and some only at the foot, which on a
 * long page means scrolling past everything to go anywhere. The copy is cut
 * from the markup Torn rendered, never from a pager this script has already
 * renumbered, so it starts out saying what Torn says and is then renumbered
 * with the rest of them.
 */
function ensureTopPager(target: ListTarget, step: number): HTMLElement | null {
  let existing = document.querySelector<HTMLElement>(`[${TOP_PAGER_ATTR}]`);

  // A copy cut for another tab's list goes; this list gets its own.
  if (
    existing &&
    existing !== target.widget &&
    existing.nextElementSibling !== target.block
  ) {
    removeTopPager();
    existing = null;
  }

  // Nothing to do for a list that already has one, unless ours is the one
  // being found - which it will be, once it is there.
  if (!existing && target.pagerIsAbove) return null;

  const source = existing === target.widget ? tornsOwnPager() : target.widget;
  if (!source) return existing;

  // Cut afresh each time the page moves, so the copy never shows the
  // numbering of the page before it.
  const stamp = String(generation);
  if (existing && existing.getAttribute(TOP_PAGER_ATTR) === stamp) {
    return existing;
  }

  const markup = originalPagers.get(source) ?? source.innerHTML;
  const copy = existing ?? (source.cloneNode(false) as HTMLElement);

  writing = true;
  copy.innerHTML = markup;
  copy.setAttribute(TOP_PAGER_ATTR, stamp);
  copy.removeAttribute(PAGER_STATE_ATTR);
  originalPagers.delete(copy);
  basePageCounts.delete(copy);
  if (!copy.isConnected) target.block.insertAdjacentElement("beforebegin", copy);
  writing = false;

  adoptStep(copy, step);
  return copy;
}

/** Takes the copied pager off the page. */
function removeTopPager(): void {
  const copy = document.querySelector(`[${TOP_PAGER_ATTR}]`);
  if (!copy) return;
  writing = true;
  copy.remove();
  writing = false;
}

/** Puts the control above the list and keeps it there. */
function ensureControl(anchor: HTMLElement, step: number): void {
  // A control built for a list of another step offers the wrong choices.
  const stale = document.getElementById(CONTROL_ID);
  if (stale instanceof HTMLElement && stale.dataset.aueStep !== String(step)) {
    writing = true;
    stale.remove();
    writing = false;
  }

  const existing = document.getElementById(CONTROL_ID);
  if (existing) {
    const select = existing.querySelector<HTMLSelectElement>(`#${SELECT_ID}`);
    const wanted = String(pageSize(step));
    if (select && select.value !== wanted) select.value = wanted;
    if (existing.nextElementSibling === anchor) return;
    writing = true;
    anchor.insertAdjacentElement("beforebegin", existing);
    writing = false;
    return;
  }
  writing = true;
  anchor.insertAdjacentElement("beforebegin", buildControl(step));
  writing = false;
}

/** Takes the control off the page. */
function removeControl(): void {
  placed = false;
  document.getElementById(CONTROL_ID)?.remove();
}

/** How long the list may be missing before the control is taken away. */
const VANISH_GRACE_MS = 2000;
/** When the list was first found missing, or 0 while it is there. */
let missingSince = 0;
/** Whether the control is meant to be on the page. */
let placed = false;

/** Gets Torn to make a list request that can be replayed. */
function primeRequest(target: ListTarget, size: number): void {
  if (primed.has(target.block) || START_IN_HASH.test(location.hash)) return;
  // On a list paged by clicks a prime would be a request nobody clicked for.
  if (pagedByClicks(target.widget)) return;
  primed.add(target.block);
  log("prime: asking Torn for this list so its request can be replayed");
  goToPage(target.widget, Math.floor(currentStart() / size) + 1, size);
}

/** Puts the control, and a copied pager where the list needs one, above the list. */
function place(target: ListTarget, step: number): void {
  missingSince = 0;
  // The control sits above the pager, so where a copied pager goes in, the
  // control goes above that rather than wherever Torn's own pager sits.
  const topPager = ensureTopPager(target, step);
  ensureControl(topPager ?? target.pagerBlock, step);
  placed = true;
}

/**
 * Takes the control away, once the list has been gone for a grace period.
 *
 * Torn hides or redraws a list while a page loads, and a pager mid-redraw
 * has nothing to read. Taking the control away then and putting it back
 * makes the page jump, so it waits to see whether the list comes back.
 */
function withdraw(reason: string): void {
  if (!placed) {
    removeControl();
    removeTopPager();
    return;
  }
  if (missingSince === 0) {
    missingSince = Date.now();
    log("apply:", reason, "- holding the control a moment");
  }
  if (Date.now() - missingSince < VANISH_GRACE_MS) {
    setTimeout(() => void apply(), VANISH_GRACE_MS);
    return;
  }
  log("apply:", reason, "- taking the control away");
  placed = false;
  missingSince = 0;
  removeControl();
  removeTopPager();
}

/**
 * Puts the control straight back when a redraw of Torn's has taken it.
 *
 * Run from the mutation observer, before the browser paints, so the gap the
 * control leaves is never drawn and the page does not jump.
 */
function restoreControl(): void {
  if (!placed || document.getElementById(CONTROL_ID)) return;
  const target = findTarget();
  if (!target || target.step === null) return;
  log("apply: Torn's redraw took the control, putting it back");
  place(target, target.step);
}

/** Brings the list, the pager and the control into line with the chosen size. */
async function apply(): Promise<void> {
  if (!isEnabled(LIST_DISPLAY_EXTENSION)) {
    removeControl();
    removeTopPager();
    return;
  }

  const target = findTarget();
  if (!target) {
    withdraw("no list on the page");
    return;
  }

  // Without a step there is no telling where a page of this list begins, so
  // leave the list and its pager exactly as Torn drew them. A pager caught
  // mid-redraw has no links to read one from yet, so this waits as well.
  const step = target.step;
  if (step === null) {
    withdraw("cannot tell how many rows this list sends");
    return;
  }

  if (tornSetsTheSizeHere(target)) {
    log("apply: Torn sets the page size on this list, so leaving it to it");
    removeControl();
    removeTopPager();
    return;
  }

  place(target, step);

  const size = pageSize(step);
  if (size <= step) {
    writing = true;
    removeExtraRows(target.container);
    writing = false;
    syncPagers(step, false);
    return;
  }

  const start = currentStart();
  if (start % size !== 0 && !realigned.has(location.hash)) {
    realign(start, size);
    return;
  }

  // While a page move is landing, the held pager stays: putting Torn's back
  // only for the hold to renumber it again is a fight, a redraw every pass.
  const holding = Date.now() < pagingUntil;

  if (!lastRequest || requestKey !== listKey()) {
    if (!saidNoRequest) {
      saidNoRequest = true;
      log("apply: no list request to replay yet, leaving the page alone");
    }
    writing = true;
    removeExtraRows(target.container);
    writing = false;
    if (!holding) syncPagers(step, false);
    primeRequest(target, size);
    return;
  }

  await fillList(target, size, step);

  // A fill still running will come back through here when it finishes.
  // Renumbering now would count pages against a half-filled list.
  if (filling && filling.container === target.container) return;

  // Renumber only once the list holds more than one of Torn's pages. A pager
  // counting in pages we failed to build is worse than no change at all: the
  // numbers would be ours and the rows still Torn's.
  const filled = rowsOf(target.container).length;
  if (filled <= step) {
    if (holding) return;
    log("fill: still", filled, "rows, so Torn's own pager stands");
  } else {
    trustedSetting = sizeSetting();
    pagingUntil = 0;
    scrollToPendingPost(target.container);
  }
  syncPagers(step, filled > step);
}

/** Adds an items-per-page control to Torn's paged lists. */
export function installListDisplay(): void {
  installPagerClicks();

  let timer = 0;
  let deadline = 0;
  const schedule = () => {
    const now = Date.now();
    if (deadline === 0) deadline = now + MAX_SETTLE_MS;
    clearTimeout(timer);
    timer = window.setTimeout(
      () => {
        deadline = 0;
        void apply();
      },
      Math.max(0, Math.min(SETTLE_MS, deadline - now)),
    );
  };

  onRequestCaptured = schedule;

  new MutationObserver(() => {
    if (writing) return;
    restoreControl();
    holdPagers();
    schedule();
  }).observe(document.body, { childList: true, subtree: true });

  addEventListener("hashchange", () => {
    // Covers the moves we do not drive ourselves - a tab, a filter, Torn's
    // own link - so its sync never finds our rows in a list it is rebuilding.
    removeAllExtraRows();
    newGeneration(); // whatever was loading is for the previous page
    schedule();
  });

  schedule();
}
