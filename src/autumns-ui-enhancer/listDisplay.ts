// A "Show more" button under Torn's paged lists: each click adds the next page's rows.
//
// Torn's scripting rule allows one request per click, so the button sends
// exactly one: the list request Torn itself made, replayed at the next offset.
// Nothing is fetched on load, on a timer or on a page change, and the page's
// address and pager are left as Torn drew them.

import { log } from "./debug";
import { rowsFromJson } from "./jsonRows";
import { LIST_DISPLAY_EXTENSION, isEnabled } from "./settings";
import { tornButton } from "./tornForms";

/** The pager widget. Pages usually carry two, above and below the list. */
const PAGINATION_SELECTOR = ".pagination";
/** A numbered page link; the attribute holds Torn's own page number. */
const PAGE_LINK_SELECTOR = "a.page-number[page]";
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

const CONTROL_ID = "aue-show-more";
/** Marks a row this script appended, so it can be told from Torn's own. */
const EXTRA_ROW_ATTR = "data-aue-extra";

const SHOW_MORE_LABEL = "Show more";
const LOADING_LABEL = "Loading";
const FAILED_LABEL = "Nothing more to show";

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
/** Matches the paging offset anywhere in a page link's href. */
const START_IN_LINK = /(?:^|[?&#])start=(\d+)/;

/** The last list request Torn made. */
let lastRequest: CapturedRequest | null = null;
/** Set while this script is issuing its own request, so it isn't captured. */
let ownRequest = false;
/** True while this script is changing the page, so the observer ignores it. */
let writing = false;
/** Bumped whenever the list moves on, so a load in flight knows it is stale. */
let generation = 0;
/**
 * Which list the captured request fetched: the hash, offset aside, as it
 * stood when the response came back. Null while the request is in flight.
 *
 * The auction market keeps a list per tab on one page, so a request captured
 * on Weapons would otherwise add weapons to Armour.
 */
let requestKey: string | null = null;
/** Runs a pass once a replayable request appears. */
let onRequestCaptured: (() => void) | null = null;

/** What has been added under the list being shown. */
interface MoreState {
  container: Element;
  /** The offset of the page Torn is showing. */
  base: number;
  /** The offset the next click asks for. */
  next: number;
  /** Set once the list has run out, or a load brought nothing back. */
  done: boolean;
  loading: boolean;
}
let more: MoreState | null = null;

/** Each list's rows per request, read once from its own pager. */
const pageSteps = new WeakMap<Element, number>();

/** Returns which list the page is showing, from its hash with the offset taken out. */
function listKey(): string {
  return location.hash.replace(START_IN_HASH, "");
}

/** Records which list a captured request belonged to, then runs a pass. */
function requestLanded(): void {
  requestKey = listKey();
  onRequestCaptured?.();
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

/** Returns the page a pager marks as current, and its last page. */
function pagerPages(widget: Element): { active: number; last: number } {
  let active = 1;
  let last = 1;
  for (const link of widget.querySelectorAll(PAGE_LINK_SELECTOR)) {
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

interface XhrWithUrl extends XMLHttpRequest {
  __aueUrl?: string;
  __aueMethod?: string;
}

/** Hides the values in a form body or query, leaving its shape readable. */
function redact(text: string): string {
  return text.replace(/=[^&]*/g, "=*");
}

/**
 * Returns the hash route's parameters, offset aside.
 *
 * The forums route by the hash ("#/p=forums&f=2&b=0&a=0") and send the same
 * pairs in the body of the request that loads the list, so a body carrying
 * all of them is the list asking for itself, even before it carries a start.
 */
function hashParams(): string[] {
  return location.hash
    .replace(/^#\/?/, "")
    .split("&")
    .filter((pair) => pair.includes("=") && !pair.startsWith("start="));
}

/**
 * Records a request when it is one that could fetch this list.
 *
 * A request qualifies by carrying a paging offset: in its body, which is how
 * Torn's older pages ask for a list, or in its query, which is how the newer
 * ones do. A form body that repeats the hash route also qualifies, which is
 * how a forum's first page is caught before the reader has paged at all. A
 * wrong guess costs one click that brings nothing back, and clears it.
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
  if (address.pathname !== location.pathname) return false;

  if (body !== null) {
    const pairs = body.split("&");
    const route = hashParams();
    const repeatsRoute =
      route.length > 0 && route.every((pair) => pairs.includes(pair));
    if (START_IN_BODY.test(body) || repeatsRoute) {
      lastRequest = { method: method || "POST", url, body, offsetIn: "body" };
      requestKey = null;
      log("capture: list request to", address.pathname, redact(body));
      return true;
    }
  }

  if (START_IN_URL.test(address.search)) {
    // Never over the top of a request that pages by its body: that one is
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
        this.addEventListener("loadend", requestLanded, { once: true });
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
  /** The block holding the pager. */
  pagerBlock: HTMLElement;
  /** The block holding the list itself; the button goes directly below it. */
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
          step: step ?? pageStepFor(widget, container),
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

/** Returns the list on the page, found from its pager. */
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

/** Returns the offset of the page Torn is showing, from its pager or else the hash. */
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

/** Sends the captured list request once, at the given offset, and returns its rows. */
async function fetchRows(
  start: number,
  live: HTMLElement,
): Promise<HTMLElement[]> {
  if (!lastRequest) return [];

  const { offsetIn } = lastRequest;
  const method = lastRequest.method.toUpperCase();
  const at = (_match: string, lead: string) => `${lead}start=${start}`;

  const url =
    offsetIn === "url"
      ? lastRequest.url.replace(START_IN_URL, at)
      : lastRequest.url;
  let body = lastRequest.body;
  if (offsetIn === "body" && body !== null) {
    // A first page caught by its route has no start of its own to rewrite.
    body = START_IN_BODY.test(body)
      ? body.replace(START_IN_BODY, at)
      : `${body}&start=${start}`;
  }

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
  log("more: took back", extra.length, "added rows");
}

/** Starts afresh, dropping the added rows and anything still loading. */
function reset(): void {
  removeAllExtraRows();
  more = null;
  generation += 1;
}

/** Whether the captured request belongs to the list being shown. */
function haveRequest(): boolean {
  return lastRequest !== null && requestKey === listKey();
}

/** Loads the next page's rows under the list: one click, one request. */
async function loadMore(button: HTMLButtonElement): Promise<void> {
  const state = more;
  if (!state || state.loading || state.done) return;
  const target = findTarget();
  if (!target || target.container !== state.container || target.step === null) return;
  const { container, step } = target;

  const mine = generation;
  state.loading = true;
  button.disabled = true;
  button.textContent = LOADING_LABEL;

  const rows = await fetchRows(state.next, container);
  state.loading = false;
  if (mine !== generation || !container.isConnected) {
    log("more: abandoned, the list moved on");
    return;
  }

  const spacer = container.querySelector(`:scope > .${SPACER_CLASS}`);
  writing = true;
  try {
    for (const row of rows) {
      disarm(row).setAttribute(EXTRA_ROW_ATTR, "");
      if (spacer) container.insertBefore(row, spacer);
      else container.appendChild(row);
    }
  } finally {
    writing = false;
  }
  log("more: added", rows.length, "rows from start", state.next);

  state.next += step;
  const lastStart = (pagerPages(target.widget).last - 1) * step;
  if (rows.length < step || state.next > lastStart) state.done = true;

  if (rows.length === 0) {
    button.textContent = FAILED_LABEL;
    return;
  }
  button.disabled = false;
  button.textContent = SHOW_MORE_LABEL;
  if (state.done) removeControl();
}

/** Returns the button bar, built on first use. */
function buildControl(): HTMLElement {
  const bar = document.createElement("div");
  bar.id = CONTROL_ID;
  bar.className = "aue-show-more";
  const button = tornButton(SHOW_MORE_LABEL, "aue-show-more-button");
  button.addEventListener("click", () => void loadMore(button));
  bar.appendChild(button);
  return bar;
}

/** Puts the button directly below the list and keeps it there. */
function ensureControl(target: ListTarget): void {
  const existing = document.getElementById(CONTROL_ID) ?? buildControl();
  if (target.block.nextElementSibling === existing) return;
  writing = true;
  target.block.insertAdjacentElement("afterend", existing);
  writing = false;
}

/** Takes the button off the page. */
function removeControl(): void {
  const control = document.getElementById(CONTROL_ID);
  if (!control) return;
  writing = true;
  control.remove();
  writing = false;
}

/** Brings the button into line with the list on the page. */
function apply(): void {
  if (!isEnabled(LIST_DISPLAY_EXTENSION)) {
    removeControl();
    if (more) reset();
    return;
  }

  const target = findTarget();
  if (!target || target.step === null) {
    removeControl();
    return;
  }
  const { step } = target;

  // A new list, or Torn moved to another page of it: what was added belonged
  // to the page before.
  const base = shownStart(target.widget, step);
  if (!more || more.container !== target.container || more.base !== base) {
    if (more) reset();
    const lastStart = (pagerPages(target.widget).last - 1) * step;
    more = {
      container: target.container,
      base,
      next: base + step,
      done: base + step > lastStart,
      loading: false,
    };
  }

  if (more.done || !haveRequest()) {
    // The button stays while it shows its last word, so the reader sees it.
    const control = document.getElementById(CONTROL_ID);
    if (!control?.querySelector("button:disabled")) removeControl();
    return;
  }
  ensureControl(target);
}

/** Adds a "Show more" button under Torn's paged lists. */
export function installListDisplay(): void {
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

  onRequestCaptured = schedule;

  new MutationObserver(() => {
    if (writing) return;
    schedule();
  }).observe(document.body, { childList: true, subtree: true });

  addEventListener("hashchange", () => {
    // Torn's own list sync has to find the list as it left it.
    reset();
    removeControl();
    schedule();
  });

  schedule();
}
