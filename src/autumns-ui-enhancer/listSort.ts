// Column sorting for Torn's paged lists and the wiki's tables.

import { log } from "./debug";
import { type ListTarget, findTarget, rowsOf } from "./listDisplay";
import { LIST_SORTING, isEnabled } from "./settings";

/** Class tokens that are layout, not a column. */
const NOT_A_COLUMN = new Set(["clear", "title", "divider"]);
/** At least this many columns have to line up before it is a header. */
const MIN_COLUMNS = 2;
/** And at least this many rows, or there is nothing to put in order. */
const MIN_ROWS = 2;
/** Tables MediaWiki's own tablesorter has already claimed. */
const ALREADY_SORTABLE = ".sortable, .jquery-tablesorter";
/** Settles the mutation observer before re-reading the page. */
const SETTLE_MS = 150;

const SORTABLE_CLASS = "aue-sort";
const MARK_CLASS = "aue-sort-mark";
const ACTIVE_CLASS = "aue-sort-active";
const DESCENDING_CLASS = "aue-sort-desc";
/** Marks a header we have already wired up, so a pass does not do it twice. */
const WIRED_ATTR = "data-aue-sort";

interface Column {
  /** Tells one column from another: a class name, or a position. */
  id: string;
  /** The header cell that is clicked. */
  cell: HTMLElement;
  /** This column's text in a given row. */
  read(row: Element): string;
}

interface Sortable {
  /** What the rows hang off, and what identifies this table. */
  container: HTMLElement;
  columns: Column[];
  rows(): Element[];
  /** Puts the rows back in the given order. */
  reorder(rows: Element[]): void;
}

interface SortState {
  id: string;
  descending: boolean;
}

/** The sort in force for each table, kept against the element itself. */
const sorts = new WeakMap<Element, SortState>();
/** Set while this module is the one moving rows. */
let writing = false;

/** Returns text with its whitespace collapsed. */
function clean(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

/** Returns the first number in a piece of text. */
function numberIn(text: string): number | null {
  const match = text.replace(/[,$]/g, "").match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

/** Whether every filled cell in a column reads as a number. */
function isNumericColumn(rows: Element[], column: Column): boolean {
  let seen = 0;
  for (const row of rows) {
    const text = column.read(row);
    if (text === "") continue;
    if (numberIn(text) === null) return false;
    seen += 1;
  }
  return seen > 0;
}

/** Returns the class a column is known by. */
function keyOf(cell: Element): string | null {
  for (const name of cell.classList) {
    if (!NOT_A_COLUMN.has(name)) return name;
  }
  return null;
}

/** Returns a row's cell for a column. */
function cellOf(row: Element, key: string): Element | null {
  try {
    return row.querySelector(`.${CSS.escape(key)}`);
  } catch {
    return null;
  }
}

/** Returns the elements before a list that could be its header. */
function headerCandidates(target: ListTarget): Element[] {
  const found: Element[] = [];
  for (const start of [target.container, target.container.parentElement]) {
    let node = start?.previousElementSibling ?? null;
    while (node) {
      found.push(node);
      node = node.previousElementSibling;
    }
  }
  return found;
}

/** Returns the columns a candidate header describes. */
function columnsOf(candidate: Element, rows: Element[]): Column[] {
  const sample = rows.slice(0, 3);
  const columns: Column[] = [];
  for (const cell of candidate.children) {
    const key = keyOf(cell);
    if (!key) continue;
    if (!sample.some((row) => cellOf(row, key))) continue;
    columns.push({
      id: key,
      cell: cell as HTMLElement,
      read: (row) => clean(cellOf(row, key)?.textContent),
    });
  }
  return columns;
}

/** Returns Torn's paged list as a sortable table. */
function listSortable(): Sortable | null {
  const target = findTarget();
  if (!target) return null;
  const rows = rowsOf(target.container);
  if (rows.length < MIN_ROWS) return null;

  for (const candidate of headerCandidates(target)) {
    if (candidate === target.container) continue;
    const columns = columnsOf(candidate, rows);
    if (columns.length < MIN_COLUMNS) continue;
    const container = target.container;
    return {
      container,
      columns,
      rows: () => rowsOf(container),
      reorder: (sorted) => container.append(...sorted),
    };
  }
  return null;
}

/** Returns a table's header row. */
function headerRowOf(table: HTMLTableElement): HTMLTableRowElement | null {
  const row = table.tHead?.rows[0] ?? table.rows[0];
  if (!row || row.cells.length < MIN_COLUMNS) return null;
  for (const cell of row.cells) {
    if (cell.tagName !== "TH") return null;
  }
  return row;
}

/** Returns an ordinary table as a sortable table. */
function tableSortable(table: HTMLTableElement): Sortable | null {
  if (table.parentElement?.closest("table")) return null;
  if (table.matches(ALREADY_SORTABLE)) return null;

  const header = headerRowOf(table);
  const container = header?.parentElement;
  if (!header || !container) return null;

  const bodyRows = () => {
    const found: Element[] = [];
    let node = header.nextElementSibling;
    while (node) {
      if (node.tagName === "TR") found.push(node);
      node = node.nextElementSibling;
    }
    return found;
  };
  if (bodyRows().length < MIN_ROWS) return null;

  const columns: Column[] = [...header.cells].map((cell, at) => ({
    id: String(at),
    cell,
    read: (row) => clean((row as HTMLTableRowElement).cells?.[at]?.textContent),
  }));

  return {
    container: container as HTMLElement,
    columns,
    rows: bodyRows,
    reorder: (sorted) => header.after(...sorted),
  };
}

/** Returns every table on the page worth wiring up. */
function sortables(): Sortable[] {
  const found: Sortable[] = [];
  const list = listSortable();
  if (list) found.push(list);
  for (const table of document.querySelectorAll("table")) {
    const sortable = tableSortable(table);
    if (sortable) found.push(sortable);
  }
  return found;
}

/** Puts a table's rows in the order its sort asks for. */
function applyOrder(table: Sortable): void {
  const state = sorts.get(table.container);
  if (!state) return;
  const column = table.columns.find((entry) => entry.id === state.id);
  if (!column) return;

  const rows = table.rows();
  if (rows.length < MIN_ROWS) return;

  const numeric = isNumericColumn(rows, column);
  const direction = state.descending ? -1 : 1;
  const sorted = [...rows].sort((left, right) => {
    const a = column.read(left);
    const b = column.read(right);
    if (a === "" || b === "") return a === b ? 0 : a === "" ? 1 : -1;
    if (numeric) return ((numberIn(a) ?? 0) - (numberIn(b) ?? 0)) * direction;
    return a.localeCompare(b, undefined, { numeric: true }) * direction;
  });

  if (sorted.every((row, at) => row === rows[at])) return;
  writing = true;
  table.reorder(sorted);
  writing = false;
  log("sort: column", state.id, state.descending ? "descending" : "ascending");
}

/** Marks the sorted column and the direction it is going. */
function paint(table: Sortable): void {
  const state = sorts.get(table.container);
  writing = true;
  for (const column of table.columns) {
    const active = state?.id === column.id;
    column.cell.classList.toggle(ACTIVE_CLASS, active);
    column.cell.classList.toggle(DESCENDING_CLASS, active && state!.descending);
  }
  writing = false;
}

/** Makes a table's column headers sort it when clicked. */
function wire(table: Sortable): void {
  writing = true;
  for (const column of table.columns) {
    if (!column.cell.querySelector(`.${MARK_CLASS}`)) {
      const mark = document.createElement("span");
      mark.className = MARK_CLASS;
      column.cell.appendChild(mark);
    }
    column.cell.classList.add(SORTABLE_CLASS);
    if (column.cell.getAttribute(WIRED_ATTR) === column.id) continue;
    column.cell.setAttribute(WIRED_ATTR, column.id);
    column.cell.addEventListener("click", (event) => {
      if (!isEnabled(LIST_SORTING)) return;
      event.preventDefault();
      event.stopPropagation();
      const state = sorts.get(table.container);
      sorts.set(table.container, {
        id: column.id,
        descending: state?.id === column.id ? !state.descending : false,
      });
      applyOrder(table);
      paint(table);
    });
  }
  writing = false;
}

/** Takes the sorting affordance back off a table. */
function unwire(table: Sortable): void {
  writing = true;
  for (const column of table.columns) {
    column.cell.classList.remove(
      SORTABLE_CLASS,
      ACTIVE_CLASS,
      DESCENDING_CLASS,
    );
    column.cell.querySelector(`.${MARK_CLASS}`)?.remove();
  }
  writing = false;
}

/** Brings every sortable table on the page up to date. */
function pass(): void {
  const enabled = isEnabled(LIST_SORTING);
  for (const table of sortables()) {
    if (!enabled) {
      sorts.delete(table.container);
      unwire(table);
      continue;
    }
    wire(table);
    applyOrder(table);
    paint(table);
  }
}

/** Makes Torn's lists and the wiki's tables sort by column. */
export function installListSort(): void {
  let timer = 0;
  const schedule = () => {
    if (writing) return;
    clearTimeout(timer);
    timer = window.setTimeout(pass, SETTLE_MS);
  };
  new MutationObserver(schedule).observe(document.body, {
    childList: true,
    subtree: true,
  });
  addEventListener("hashchange", schedule);
  schedule();
}
