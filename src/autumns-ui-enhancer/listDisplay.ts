// List Display Extension
//
// Torn's paged lists (bounties, and everything else built on the same
// "gallery-wrapper pagination" widget) show 20 rows and step by 20. This
// adds an "Items per page" dropdown above the top right of the list, fills
// the list out to the chosen size, and re-points the pager so next/previous
// and the page numbers all step by that size instead.
//
// The server will not budge on 20: a request with count/limit/length/rows/
// perPage/amount/size all still come back with exactly 20 rows. So a larger
// page is assembled here by repeating the request Torn itself just made
// with a higher start, and appending the rows. At the 100 cap that is five
// requests for one view - the same five the pager would have made if you
// had clicked next four times.
//
// Navigation is entirely hash-driven on these pages: setting
// location.hash to "...&start=60" makes Torn fetch and render that page on
// its own. That is what the pager rewrite uses, so nothing here has to know
// which endpoint a given page talks to.

import { log } from "./debug";
import {
  LIST_DISPLAY_EXTENSION,
  isEnabled,
  readSetting,
  writeSetting,
} from "./settings";

// ------------------------------------------------------------- selectors
//
// Torn's hashed class names change between deploys, so everything matched
// here is either a stable unhashed class or plain structure. Kept together
// because these are the first things to break.

/** The pager widget. Pages usually carry two, above and below the list. */
const PAGINATION_SELECTOR = ".pagination";
/** A numbered page link; the attribute holds Torn's own 20-per-page index. */
const PAGE_LINK_SELECTOR = "a.page-number[page]";
/** The "..." between runs of page numbers. */
const PAGE_GAP_SELECTOR = "span.points";
const ARROW_PREV_SELECTOR = "i.pagination-left";
const ARROW_NEXT_SELECTOR = "i.pagination-right";
/** Torn marks a dead arrow rather than removing it. */
const ARROW_DISABLED_CLASS = "disable";
/** Layout spacer rows that sit inside a list but are not results. */
const SPACER_CLASS = "clear";
/** Candidates for the element that actually holds the result rows. */
const ROW_CONTAINER_SELECTOR = "ul, ol, tbody";

// --------------------------------------------------------------- tuning

/** Rows the server returns per request, whatever we ask it for. */
const PAGE_STEP = 20;
/** Offered page sizes. Capped at 100 - that is five requests at most. */
const PAGE_SIZES = [20, 40, 60, 80, 100];
/** Gap between top-up requests, so a size change is a trickle not a burst. */
const THROTTLE_MS = 150;
/** Settles the mutation observer before re-reading the page. */
const SETTLE_MS = 150;
/**
 * The longest a pass can be held off. Torn and any other script on the page
 * mutate it more or less continuously, and a plain debounce restarts its
 * timer on every one of those - so without a ceiling a pass can be deferred
 * indefinitely on a busy page.
 */
const MAX_SETTLE_MS = 1000;

const SIZE_SETTING = "ITEMS_PER_PAGE";
const CONTROL_ID = "aue-per-page";
const SELECT_ID = "aue-per-page-select";
const STATUS_CLASS = "aue-per-page-status";
/** Marks a row this script appended, so it can be told from Torn's own. */
const EXTRA_ROW_ATTR = "data-aue-extra";
/** Stops the pager being rebuilt on every mutation it causes itself. */
const PAGER_STATE_ATTR = "data-aue-pager";

// ---------------------------------------------------------------- state

interface CapturedRequest {
  url: string;
  body: string;
}

/** Matches the paging offset in a form-encoded request body. */
const START_IN_BODY = /(^|&)start=\d+/;
/** Matches the paging offset in the URL hash. */
const START_IN_HASH = /[?&]start=(\d+)/;

/**
 * The last list request Torn made. Repeating it with a different start is
 * how extra rows are fetched, and it means this file never has to know a
 * page's endpoint or step name.
 */
let lastRequest: CapturedRequest | null = null;
/** Set while this script is issuing its own requests, so they aren't captured. */
let ownRequest = false;
/** Bumped to abandon a top-up whose page has since changed underneath it. */
let generation = 0;
/** True while rows are being appended, so the observer ignores our writes. */
let writing = false;
/** The page currently being filled ("<start>:<size>"), so it is not restarted. */
let filling: string | null = null;
/** Whether Torn has already been nudged into making a list request. */
let primed = false;
/**
 * Runs a pass once a replayable request appears.
 *
 * Passes are otherwise only driven by DOM mutations, so a request captured
 * after the last mutation of a render would sit unused until something else
 * happened to move the page - in practice until the reader clicked. The
 * capture is the event worth acting on, so it says so directly.
 */
let onRequestCaptured: (() => void) | null = null;

/** Each pager's markup as Torn rendered it, for putting back on 20. */
const originalPagers = new WeakMap<Element, string>();
/**
 * Torn's own page count for each pager, read once before its numbers are
 * rewritten. Without this the rewrite would go on to read back its own
 * renumbered links and shrink the count on every pass. Torn builds a fresh
 * pager element on every render, so these entries never go stale.
 */
const basePageCounts = new WeakMap<Element, number>();

function pageSize(): number {
  const stored = Number(readSetting(SIZE_SETTING, String(PAGE_STEP)));
  return PAGE_SIZES.includes(stored) ? stored : PAGE_STEP;
}

// ---------------------------------------------------- request capture

interface XhrWithUrl extends XMLHttpRequest {
  __aueUrl?: string;
}

/**
 * Remembers the shape of Torn's list requests. Installed unconditionally at
 * document-start - it only records, and the feature switch is checked before
 * anything is actually fetched.
 */
/**
 * Records a request only if it could be this list.
 *
 * Torn makes plenty of other POSTs while a page lives, and some carry a
 * "start" of their own. Topping up from one of those fetches a document
 * with no list in it, so nothing gets added and the failure is silent -
 * hence the check that the request goes to the page we are actually on.
 */
function rememberRequest(url: string, body: string): void {
  if (!START_IN_BODY.test(body)) return;
  let path: string;
  try {
    path = new URL(url, location.href).pathname;
  } catch {
    return;
  }
  if (path !== location.pathname) return;
  lastRequest = { url, body };
  // Values are stripped - request bodies carry tokens.
  log("capture: list request for", path, body.replace(/=[^&]*/g, "=*"));
  onRequestCaptured?.();
}

export function installRequestCapture(): void {
  const openOriginal = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (
    this: XhrWithUrl,
    ...args: unknown[]
  ) {
    this.__aueUrl = String(args[1]);
    (openOriginal as (...a: unknown[]) => void).apply(this, args);
  } as typeof XMLHttpRequest.prototype.open;

  const sendOriginal = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (
    this: XhrWithUrl,
    body?: Document | XMLHttpRequestBodyInit | null,
  ) {
    if (!ownRequest && typeof body === "string") {
      rememberRequest(this.__aueUrl ?? location.pathname, body);
    }
    sendOriginal.call(this, body);
  };

  const fetchOriginal = window.fetch;
  window.fetch = function (this: Window, ...args: unknown[]) {
    const input = args[0] as RequestInfo | URL;
    const init = args[1] as RequestInit | undefined;
    const body = init?.body;
    if (!ownRequest && typeof body === "string") {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      rememberRequest(url, body);
    }
    return (fetchOriginal as (...a: unknown[]) => Promise<Response>).apply(
      this,
      args,
    );
  } as typeof window.fetch;
}

// ------------------------------------------------------------ the list

interface ListTarget {
  widget: HTMLElement;
  /** The block holding the pager; our dropdown goes directly above it. */
  pagerBlock: HTMLElement;
  /** The block holding the list itself. */
  block: HTMLElement;
  /** The element whose children are the result rows. */
  container: HTMLElement;
}

/**
 * How far out from the pager the list is looked for. A pager and its list
 * are always structurally close; without a limit the walk can escape into
 * the surrounding page and mistake something like a nav menu for a list.
 */
const MAX_CLIMB = 4;

function isRow(element: Element): boolean {
  if (element.classList.contains(SPACER_CLASS)) return false;
  return (
    element.childElementCount > 0 || (element.textContent ?? "").trim() !== ""
  );
}

function rowsOf(container: Element): HTMLElement[] {
  return [...container.children].filter(isRow) as HTMLElement[];
}

/**
 * The busiest list inside a subtree. A full page of results beats a header
 * row, so anything holding a whole page wins outright; failing that, the
 * longest list is the best guess available.
 */
function findRowContainer(root: Element): HTMLElement | null {
  if (root.id === CONTROL_ID) return null;
  const candidates: HTMLElement[] = [];
  for (const element of root.querySelectorAll<HTMLElement>(
    ROW_CONTAINER_SELECTOR,
  )) {
    if (element.closest(PAGINATION_SELECTOR)) continue;
    if (rowsOf(element).length >= 2) candidates.push(element);
  }
  if (candidates.length === 0) return null;

  const full = candidates.filter((c) => rowsOf(c).length >= PAGE_STEP);
  const pool = full.length > 0 ? full : candidates;
  return pool.reduce((best, c) =>
    rowsOf(c).length > rowsOf(best).length ? c : best,
  );
}

/**
 * The siblings either side of a node, stepping over our own control.
 *
 * Without that step the control hides the list from the walk the moment it
 * is inserted: the next pass would fail at this level, climb higher, and
 * settle on something else entirely - then move back once the control was
 * out of the way again, ping-ponging on every mutation.
 */
function siblingsOf(node: Element): Element[] {
  const found: Element[] = [];
  for (const direction of [
    "nextElementSibling",
    "previousElementSibling",
  ] as const) {
    let sibling = node[direction];
    while (sibling && sibling.id === CONTROL_ID) sibling = sibling[direction];
    if (sibling) found.push(sibling);
  }
  return found;
}

/**
 * Walks out from the pager looking for the list it belongs to. The widget
 * usually sits immediately before the list block, sometimes after it, and
 * on some pages both - either way one of them is a sibling at some level.
 */
function findList(widget: HTMLElement): ListTarget | null {
  let node: Element | null = widget;
  for (let level = 0; node && node !== document.body && level <= MAX_CLIMB; ) {
    for (const sibling of siblingsOf(node)) {
      const container = findRowContainer(sibling);
      if (container) {
        return {
          widget,
          pagerBlock: node as HTMLElement,
          block: sibling as HTMLElement,
          container,
        };
      }
    }
    node = node.parentElement;
    level += 1;
  }
  return null;
}

function findTarget(): ListTarget | null {
  for (const widget of document.querySelectorAll<HTMLElement>(
    PAGINATION_SELECTOR,
  )) {
    if (!widget.querySelector(PAGE_LINK_SELECTOR)) continue;
    const target = findList(widget);
    if (target) return target;
  }
  return null;
}

// ------------------------------------------------------------ the hash

/**
 * The hash prefix a page link points at, ready for a start to be appended.
 * Torn writes these itself ("#/!p=main&"), so reading one back means this
 * never has to know a page's own hash format.
 */
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

function currentStart(): number {
  const match = START_IN_HASH.exec(location.hash);
  return match ? Number(match[1]) : 0;
}

function goToPage(widget: Element, page: number): void {
  const template = hashTemplate(widget);
  if (!template) return;
  const size = pageSize();
  const start = Math.max(0, page - 1) * size;
  generation += 1; // abandon any top-up still running for the old page
  location.hash = `${template}start=${start}`;
}

// ----------------------------------------------------------- the pager

interface PagerModel {
  /** Torn's own page count, at its fixed 20 per page. */
  base: number;
  current: number;
  total: number;
}

/**
 * Torn's own highest page number, which is always counted 20 to a page
 * whatever we are showing. Read once per pager, before the rewrite below
 * replaces those numbers with ours.
 */
function basePageCount(widget: Element): number | null {
  const stored = basePageCounts.get(widget);
  if (stored !== undefined) return stored;

  const links = [
    ...widget.querySelectorAll<HTMLAnchorElement>(PAGE_LINK_SELECTOR),
  ];
  if (links.length === 0) return null;

  const pageOf = (link: Element) => Number(link.getAttribute("page")) || 1;
  // Torn tags its highest page. Trust that over scanning, because a scan can
  // catch a pager Torn has only partly built and read far too low a count.
  const last = widget.querySelector(`${PAGE_LINK_SELECTOR}.last`);
  const pages = last ? pageOf(last) : Math.max(1, ...links.map(pageOf));

  // Only a pager carrying that marker is known to be finished, so only its
  // count is worth keeping. An unfinished one is used but re-read next pass.
  if (last) basePageCounts.set(widget, pages);
  log(
    "pager: Torn reports",
    pages,
    "pages of",
    PAGE_STEP,
    last ? "" : "(pager unfinished, not cached)",
  );
  return pages;
}

function pagerModel(widget: Element, size: number): PagerModel | null {
  const pages20 = basePageCount(widget);
  if (pages20 === null) return null;
  const total = Math.max(1, Math.ceil((pages20 * PAGE_STEP) / size));
  const current = Math.min(total, Math.floor(currentStart() / size) + 1);
  return { base: pages20, current, total };
}

/** 1, the pages either side of the current one, and the last page. */
function pagesToShow(model: PagerModel): number[] {
  const wanted = new Set<number>([1, model.total]);
  for (let page = model.current - 2; page <= model.current + 2; page += 1) {
    if (page >= 1 && page <= model.total) wanted.add(page);
  }
  return [...wanted].sort((a, b) => a - b);
}

/**
 * Rebuilds the numbers so they count in the chosen page size. Torn's own
 * markup is cloned rather than recreated, so the pager keeps its styling
 * whatever the current theme is doing.
 */
function rewritePager(widget: HTMLElement, size: number): void {
  const model = pagerModel(widget, size);
  if (!model) return;

  log("pager: page", model.current, "of", model.total, "at", size, "per page");
  const state = `${size}:${model.current}:${model.total}`;
  if (widget.getAttribute(PAGER_STATE_ATTR) === state) return;

  if (!originalPagers.has(widget)) {
    originalPagers.set(widget, widget.innerHTML);
    // Torn's numbering is about to be replaced by ours, so its count has to
    // be remembered now even if the pager had not finished rendering.
    basePageCounts.set(widget, model.base);
  }

  const template = widget.querySelector<HTMLAnchorElement>(PAGE_LINK_SELECTOR);
  const gap = widget.querySelector(PAGE_GAP_SELECTOR);
  if (!template) return;

  // Everything after the numbers - usually the next arrow and the right-hand
  // cap - stays put; the numbers are rebuilt in front of it.
  const nextArrow = widget.querySelector(ARROW_NEXT_SELECTOR)?.closest("a");
  const anchorPoint =
    nextArrow ?? widget.querySelector(".pagination-r") ?? null;

  const blank = template.cloneNode(true) as HTMLAnchorElement;
  const blankGap = gap?.cloneNode(true) ?? null;

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

  // Torn disables an arrow by class rather than removing it, so match that.
  const prev = widget.querySelector(ARROW_PREV_SELECTOR);
  const next = widget.querySelector(ARROW_NEXT_SELECTOR);
  prev?.classList.toggle(ARROW_DISABLED_CLASS, model.current <= 1);
  next?.classList.toggle(ARROW_DISABLED_CLASS, model.current >= model.total);

  widget.setAttribute(PAGER_STATE_ATTR, state);
}

/** Puts a pager back the way Torn rendered it, for a return to 20. */
function restorePager(widget: HTMLElement): void {
  const original = originalPagers.get(widget);
  if (original === undefined) return;
  widget.innerHTML = original;
  widget.removeAttribute(PAGER_STATE_ATTR);
  originalPagers.delete(widget);
  basePageCounts.delete(widget);
}

/**
 * Takes over pager clicks while a custom page size is in force. Torn's own
 * handler is delegated to the document, so stopping the event during the
 * capture phase keeps it from ever running and jumping by 20.
 */
function installPagerClicks(): void {
  document.addEventListener(
    "click",
    (event) => {
      if (!isEnabled(LIST_DISPLAY_EXTENSION)) return;
      const size = pageSize();
      if (size <= PAGE_STEP) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("a");
      const widget = link?.closest<HTMLElement>(PAGINATION_SELECTOR);
      if (!link || !widget) return;

      const model = pagerModel(widget, size);
      if (!model) return;

      let page: number | null = null;
      const pageAttribute = link.getAttribute("page");
      if (pageAttribute !== null) {
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
      goToPage(widget, page);
    },
    true,
  );
}

// -------------------------------------------------------- fetching rows

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The same list in a fetched page. Torn's response is a whole page
 * fragment, so the list is picked out the same way it was on the live page,
 * preferring one that shares a class with it.
 */
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

async function fetchRows(
  start: number,
  live: HTMLElement,
): Promise<HTMLElement[]> {
  if (!lastRequest) return [];
  const body = lastRequest.body.replace(
    START_IN_BODY,
    (_match, lead: string) => `${lead}start=${start}`,
  );

  ownRequest = true;
  let html: string;
  try {
    const response = await fetch(lastRequest.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
      },
      body,
      credentials: "same-origin",
    });
    if (!response.ok) return [];
    html = await response.text();
  } catch {
    return [];
  } finally {
    ownRequest = false;
  }

  const parsed = new DOMParser().parseFromString(html, "text/html");
  const container = matchingContainer(parsed, live);
  // No list in the reply means the captured request was not this list after
  // all. Forget it so the next one Torn makes can replace it, rather than
  // fetching the same useless page again.
  if (!container) lastRequest = null;
  const rows = container ? rowsOf(container) : [];
  log(
    "fetch: start",
    start,
    "->",
    html.length,
    "chars,",
    container ? `matched ${container.tagName}.${container.className}` : "NO LIST FOUND",
    `${rows.length} rows`,
  );
  return rows;
}

function removeExtraRows(container: HTMLElement): void {
  for (const row of container.querySelectorAll(`[${EXTRA_ROW_ATTR}]`)) {
    row.remove();
  }
}

/**
 * Fills the list out to the chosen size by repeating Torn's own request at
 * higher offsets. Runs one request at a time, and gives up the moment the
 * page changes underneath it.
 */
async function fillList(target: ListTarget, size: number): Promise<void> {
  const { container } = target;
  const have = rowsOf(container).length;
  if (have >= size) return;
  // A short page is the end of the list, so there is nothing to add.
  if (have < PAGE_STEP) {
    log("fill: skipped -", have, "rows is a short page, so this is the end");
    return;
  }

  const start = currentStart();
  const key = `${start}:${size}`;
  // Every DOM change on the page schedules another pass, and Torn plus any
  // other script mutate it constantly. Without this a pass starting mid-fetch
  // would abandon the one already in flight, and on a busy page no fill would
  // ever get to finish.
  if (filling === key) return;

  const mine = generation;
  filling = key;
  const requests = Math.ceil(size / PAGE_STEP);
  log("fill:", have, "rows present, want", size, "-", requests - 1, "more request(s)");
  const spacer = container.querySelector(`:scope > .${SPACER_CLASS}`);

  try {
    for (let index = 1; index < requests; index += 1) {
      setStatus(`Loading ${index + 1}/${requests}`);
      const rows = await fetchRows(start + index * PAGE_STEP, container);
      // Only a real navigation or a size change bumps the epoch.
      if (mine !== generation) {
        log("fill: abandoned, the page moved on");
        return;
      }
      if (rows.length === 0) {
        log("fill: stopped, that request returned no rows");
        break;
      }

      writing = true;
      for (const row of rows) {
        row.setAttribute(EXTRA_ROW_ATTR, "");
        if (spacer) container.insertBefore(row, spacer);
        else container.appendChild(row);
      }
      writing = false;

      if (rows.length < PAGE_STEP) break;
      if (index + 1 < requests) await delay(THROTTLE_MS);
      if (mine !== generation) return;
    }
    log("fill: done,", rowsOf(container).length, "rows now showing");
  } finally {
    writing = false;
    if (filling === key) filling = null;
    setStatus("");
  }
}

// -------------------------------------------------------- the dropdown

function setStatus(text: string): void {
  const status = document.querySelector<HTMLElement>(`.${STATUS_CLASS}`);
  if (status) status.textContent = text;
}

function buildControl(): HTMLElement {
  const bar = document.createElement("div");
  bar.id = CONTROL_ID;
  bar.className = "aue-per-page";

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
  for (const size of PAGE_SIZES) {
    const option = document.createElement("option");
    option.value = String(size);
    option.textContent = String(size);
    select.appendChild(option);
  }
  select.value = String(pageSize());
  select.addEventListener("change", () => onSizeChange(Number(select.value)));
  bar.appendChild(select);

  return bar;
}

function onSizeChange(size: number): void {
  writeSetting(SIZE_SETTING, String(size));
  generation += 1;
  setStatus("");

  const target = findTarget();
  if (!target) return;

  writing = true;
  removeExtraRows(target.container);
  for (const widget of document.querySelectorAll<HTMLElement>(
    PAGINATION_SELECTOR,
  )) {
    restorePager(widget);
  }
  writing = false;

  // Land on a boundary of the new size, so the pages line up from here on.
  const page = Math.floor(currentStart() / size) + 1;
  const before = location.hash;
  goToPage(target.widget, page);
  // An unchanged hash fires no hashchange, so nothing would re-render.
  if (location.hash === before) setTimeout(() => void apply(), 0);
}

/**
 * Puts the dropdown directly above the pager and leaves it there. Moving it
 * is deliberately the exception: a move mid-interaction would close the
 * select under the pointer.
 */
function ensureControl(target: ListTarget): void {
  const existing = document.getElementById(CONTROL_ID);
  if (existing) {
    const select = existing.querySelector<HTMLSelectElement>(`#${SELECT_ID}`);
    if (select && select.value !== String(pageSize())) {
      select.value = String(pageSize());
    }
    if (existing.nextElementSibling === target.pagerBlock) return;
    writing = true;
    target.pagerBlock.insertAdjacentElement("beforebegin", existing);
    writing = false;
    return;
  }
  writing = true;
  target.pagerBlock.insertAdjacentElement("beforebegin", buildControl());
  writing = false;
}

function removeControl(): void {
  document.getElementById(CONTROL_ID)?.remove();
}

// ----------------------------------------------------------------- run

/**
 * Gets Torn to fetch the list it has already drawn, purely so its request
 * can be captured and replayed at other offsets.
 *
 * Only done when the hash carries no offset yet, which is how these pages
 * are normally entered - that navigation is one Torn would have made itself
 * and lands on the same page the reader is already looking at. Reloading
 * straight onto an offset is left alone rather than bounced through another
 * page: the list simply stays at Torn's own 20 until the next click, which
 * captures a request and brings everything back.
 */
function primeRequest(target: ListTarget): void {
  if (primed || START_IN_HASH.test(location.hash)) return;
  primed = true;
  log("prime: asking Torn for this list so its request can be replayed");
  goToPage(target.widget, Math.floor(currentStart() / pageSize()) + 1);
}

async function apply(): Promise<void> {
  if (!isEnabled(LIST_DISPLAY_EXTENSION)) {
    removeControl();
    return;
  }

  const target = findTarget();
  if (!target) {
    removeControl();
    return;
  }

  ensureControl(target);

  const size = pageSize();
  if (size <= PAGE_STEP) {
    writing = true;
    removeExtraRows(target.container);
    for (const widget of document.querySelectorAll<HTMLElement>(
      PAGINATION_SELECTOR,
    )) {
      restorePager(widget);
    }
    writing = false;
    return;
  }

  // Nothing can be topped up until Torn has made a list request worth
  // replaying, and on a fresh load it renders the list server-side and makes
  // none. Renumbering the pager over a list that cannot grow is the worst of
  // both worlds - it looks changed and no rows arrive - so leave the page
  // exactly as Torn built it until there is something to replay.
  if (!lastRequest) {
    log("apply: no list request to replay yet, leaving the page alone");
    writing = true;
    removeExtraRows(target.container);
    for (const widget of document.querySelectorAll<HTMLElement>(
      PAGINATION_SELECTOR,
    )) {
      restorePager(widget);
    }
    writing = false;
    primeRequest(target);
    return;
  }

  writing = true;
  for (const widget of document.querySelectorAll<HTMLElement>(
    PAGINATION_SELECTOR,
  )) {
    if (widget.querySelector(PAGE_LINK_SELECTOR)) rewritePager(widget, size);
  }
  writing = false;

  await fillList(target, size);
}

export function installListDisplay(): void {
  installPagerClicks();

  // Torn re-renders the whole list block on every page change, so the work
  // is redone whenever the DOM settles rather than hooked to one event.
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
    schedule();
  }).observe(document.body, { childList: true, subtree: true });

  addEventListener("hashchange", () => {
    generation += 1; // whatever was loading is for the previous page
    schedule();
  });

  schedule();
}
