// An items-per-page control for Torn's paged lists, and a pager that steps by it.

import { log } from "./debug";
import {
  LIST_DISPLAY_EXTENSION,
  isEnabled,
  readSetting,
  writeSetting,
} from "./settings";

/** The pager widget. Pages usually carry two, above and below the list. */
const PAGINATION_SELECTOR = ".pagination";
/** A numbered page link; the attribute holds Torn's own 20-per-page index. */
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

/** Rows the server returns per request, whatever we ask it for. */
const PAGE_STEP = 20;
/** Offered page sizes. Capped at 100 - that is five requests at most. */
const PAGE_SIZES = [20, 40, 60, 80, 100];
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

interface CapturedRequest {
  url: string;
  body: string;
}

/** Matches the paging offset in a form-encoded request body. */
const START_IN_BODY = /(^|&)start=\d+/;
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
/** Whether Torn has already been nudged into making a list request. */
let primed = false;
/** Runs a pass once a replayable request appears. */
let onRequestCaptured: (() => void) | null = null;

/** Each pager's markup as Torn rendered it, for putting back on 20. */
const originalPagers = new WeakMap<Element, string>();
/** Torn's own page count for each pager, read once before its numbers are rewritten. */
const basePageCounts = new WeakMap<Element, number>();

/** Returns the page size the reader has chosen. */
function pageSize(): number {
  const stored = Number(readSetting(SIZE_SETTING, String(PAGE_STEP)));
  return PAGE_SIZES.includes(stored) ? stored : PAGE_STEP;
}

interface XhrWithUrl extends XMLHttpRequest {
  __aueUrl?: string;
}

/** Records a request when it is one that could fetch this list. */
function rememberRequest(url: string, body: string): boolean {
  if (!START_IN_BODY.test(body)) return false;
  let path: string;
  try {
    path = new URL(url, location.href).pathname;
  } catch {
    return false;
  }
  if (path !== location.pathname) return false;
  lastRequest = { url, body };
  log("capture: list request for", path, body.replace(/=[^&]*/g, "=*"));
  return true;
}

/** Starts recording the list requests Torn makes. */
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
      const captured = rememberRequest(
        this.__aueUrl ?? location.pathname,
        body,
      );
      if (captured) {
        this.addEventListener("loadend", () => onRequestCaptured?.(), {
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
    if (!ownRequest && typeof body === "string") {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      captured = rememberRequest(url, body);
    }
    const sent = (
      fetchOriginal as (...a: unknown[]) => Promise<Response>
    ).apply(this, args);
    if (captured) void sent.then(() => onRequestCaptured?.()).catch(() => {});
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
function findRowContainer(root: Element): HTMLElement | null {
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

  const full = candidates.filter((c) => rowsOf(c).length >= PAGE_STEP);
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
function findList(widget: HTMLElement): ListTarget | null {
  let node: Element | null = widget;
  for (let level = 0; node && node !== document.body && level <= MAX_CLIMB;) {
    if (node.matches(CONTENT_ROOT_SELECTOR)) break;
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

/** Returns the list on the page, with the pager to hang the control off. */
export function findTarget(): ListTarget | null {
  let below: ListTarget | null = null;
  for (const widget of document.querySelectorAll<HTMLElement>(
    PAGINATION_SELECTOR,
  )) {
    if (!widget.querySelector(PAGE_LINK_SELECTOR)) continue;
    const target = findList(widget);
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
function goToPage(widget: Element, page: number): void {
  const template = hashTemplate(widget);
  if (!template) return;
  const size = pageSize();
  const start = Math.max(0, page - 1) * size;
  generation += 1; // abandon any top-up still running for the old page
  location.hash = `${template}start=${start}`;
}

interface PagerModel {
  /** Torn's own page count, at its fixed 20 per page. */
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
    "pages of",
    PAGE_STEP,
    last ? "" : "(pager unfinished, not cached)",
  );
  return pages;
}

/** Returns which page of how many the reader is on. */
function pagerModel(widget: Element, size: number): PagerModel | null {
  const pages20 = basePageCount(widget);
  if (pages20 === null) return null;
  const total = Math.max(1, Math.ceil((pages20 * PAGE_STEP) / size));
  const current = Math.min(total, Math.floor(currentStart() / size) + 1);
  return { base: pages20, current, total };
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
function rewritePager(widget: HTMLElement, size: number): void {
  const model = pagerModel(widget, size);
  if (!model) return;

  const state = `${size}:${model.current}:${model.total}`;
  if (widget.getAttribute(PAGER_STATE_ATTR) === state) return;
  log("pager: page", model.current, "of", model.total, "at", size, "per page");

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

/** Returns the rows of the list at a given offset. */
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
  return rows;
}

/** Removes the rows this script added to a list. */
function removeExtraRows(container: HTMLElement): void {
  for (const row of container.querySelectorAll(`[${EXTRA_ROW_ATTR}]`)) {
    row.remove();
  }
}

/** Fills a list out to the chosen page size. */
async function fillList(target: ListTarget, size: number): Promise<void> {
  const { container } = target;
  const have = rowsOf(container).length;
  if (have >= size) return;
  if (have < PAGE_STEP) {
    log("fill: skipped -", have, "rows is a short page, so this is the end");
    return;
  }

  if (!container.isConnected) return;

  const start = currentStart();
  const key = `${start}:${size}`;
  if (filling && filling.key === key && filling.container === container) return;

  const mine = generation;
  filling = { key, container };
  const requests = Math.ceil(size / PAGE_STEP);
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
      const rows = await fetchRows(start + index * PAGE_STEP, container);
      if (mine !== generation) {
        log("fill: abandoned, the page moved on");
        return;
      }
      if (!container.isConnected) {
        log("fill: abandoned, Torn replaced the list");
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

/** Returns the items-per-page control. */
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

/** Applies a newly chosen page size. */
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

  const page = Math.floor(currentStart() / size) + 1;
  const before = location.hash;
  goToPage(target.widget, page);
  if (location.hash === before) setTimeout(() => void apply(), 0);
}

/** Puts the control above the list and keeps it there. */
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

/** Takes the control off the page. */
function removeControl(): void {
  document.getElementById(CONTROL_ID)?.remove();
}

/** Gets Torn to make a list request that can be replayed. */
function primeRequest(target: ListTarget): void {
  if (primed || START_IN_HASH.test(location.hash)) return;
  primed = true;
  log("prime: asking Torn for this list so its request can be replayed");
  goToPage(target.widget, Math.floor(currentStart() / pageSize()) + 1);
}

/** Brings the list, the pager and the control into line with the chosen size. */
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
    schedule();
  }).observe(document.body, { childList: true, subtree: true });

  addEventListener("hashchange", () => {
    generation += 1; // whatever was loading is for the previous page
    schedule();
  });

  schedule();
}
