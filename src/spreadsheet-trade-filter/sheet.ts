/** A spreadsheet we know how to ask for, resolved from whatever was pasted. */
export interface SheetRef {
  csvUrl: string;
}

const DOCUMENT_ID = /^[A-Za-z0-9_-]{20,}$/;

const SHARED_PATH = /\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/;
const PUBLISHED_PATH = /\/spreadsheets\/d\/e\/([A-Za-z0-9_-]{20,})/;

/** The tab of the workbook the link pointed at, if it named one. */
function findGid(url: URL): string | null {
  const fromHash = /[#&?]gid=(\d+)/.exec(url.hash);
  if (fromHash?.[1]) return fromHash[1];

  const fromQuery = url.searchParams.get("gid");
  if (fromQuery && /^\d+$/.test(fromQuery)) return fromQuery;

  return null;
}

/** Google's CSV address for a spreadsheet link, or null for any other link. */
function googleCsvUrl(url: URL): string | null {
  const gid = findGid(url);

  // Do not reorder: the published path also matches the shared pattern.
  const published = PUBLISHED_PATH.exec(url.pathname);
  if (published?.[1]) {
    const base = `https://docs.google.com/spreadsheets/d/e/${published[1]}/pub?output=csv`;
    return gid ? `${base}&gid=${gid}` : base;
  }

  const shared = SHARED_PATH.exec(url.pathname);
  if (shared?.[1]) {
    const base = `https://docs.google.com/spreadsheets/d/${shared[1]}/gviz/tq?tqx=out:csv`;
    return gid ? `${base}&gid=${gid}` : base;
  }

  return null;
}

/** Turns what the user pasted into an address we can ask for data. */
export function parseSheetRef(input: string): SheetRef | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (DOCUMENT_ID.test(trimmed)) {
    return {
      csvUrl: `https://docs.google.com/spreadsheets/d/${trimmed}/gviz/tq?tqx=out:csv`,
    };
  }

  let url: URL;
  try {
    const absolute = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    url = new URL(absolute);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  if (url.hostname === "docs.google.com") {
    const csvUrl = googleCsvUrl(url);
    return csvUrl ? { csvUrl } : null;
  }

  return { csvUrl: url.href };
}

/** Reads rows out of spreadsheet text split on the given delimiter. */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  const endRow = (): void => {
    row.push(value);
    value = "";
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
    row = [];
  };

  const QUOTE = '"';

  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    const next = text[i + 1];

    if (quoted && character === QUOTE && next === QUOTE) {
      value += QUOTE;
      i++;
    } else if (character === QUOTE) {
      quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") i++;
      endRow();
    } else {
      value += character;
    }
  }

  if (value !== "" || row.length > 0) endRow();

  return rows;
}

/** Reads rows out of spreadsheet text, whether it is comma or tab separated. */
export function parseSheetText(text: string): string[][] {
  const sample = text.slice(0, 5000);
  const commas = (sample.match(/,/g) ?? []).length;
  const tabs = (sample.match(/\t/g) ?? []).length;

  return parseDelimited(text, tabs > commas ? "\t" : ",");
}

/** An item name in the one form everything here compares against. */
export function normalizeItemName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** The heading the item column is found by. */
const ITEM_HEADING = /^\s*item(\s*name)?\s*$/i;

const MONEY_OR_NUMBER = /^[$£€]?\s*-?[\d,]+(\.\d+)?\s*[kmb%]?$/i;
const LONGEST_ITEM_NAME = 60;

/** Says whether a cell reads like an item name rather than a figure or a note. */
function looksLikeItemName(cell: string): boolean {
  const text = cell.trim();
  if (!text || text.length > LONGEST_ITEM_NAME) return false;
  if (MONEY_OR_NUMBER.test(text)) return false;
  return /[a-z]/i.test(text);
}

/** The item names in one column of the sheet. */
function columnNames(rows: string[][], column: number): Set<string> {
  const names = new Set<string>();
  for (const row of rows) {
    const cell = row[column] ?? "";
    if (!looksLikeItemName(cell)) continue;
    names.add(normalizeItemName(cell));
  }
  return names;
}

/** The column carrying the most item-shaped cells. */
function widestNameColumn(rows: string[][]): Set<string> {
  const width = Math.max(0, ...rows.map((row) => row.length));
  let best = new Set<string>();

  for (let column = 0; column < width; column++) {
    const names = columnNames(rows, column);
    if (names.size > best.size) best = names;
  }

  return best;
}

/** A heading row, and every column of it that names items. */
export interface SheetHeader {
  row: number;
  items: number[];
}

/** Every heading row in the sheet, in the order they appear. */
export function findHeaders(rows: string[][]): SheetHeader[] {
  const headers: SheetHeader[] = [];

  rows.forEach((row, index) => {
    const items: number[] = [];
    row.forEach((cell, column) => {
      if (ITEM_HEADING.test(cell)) items.push(column);
    });

    if (items.length > 0) headers.push({ row: index, items });
  });

  return headers;
}

/** The item names the sheet lists, or null when it lists none. */
export function readItemList(rows: string[][]): Set<string> | null {
  const headers = findHeaders(rows);
  if (headers.length === 0) {
    const fallback = widestNameColumn(rows);
    return fallback.size > 0 ? fallback : null;
  }

  const names = new Set<string>();

  headers.forEach((header, index) => {
    // A heading further down starts a new section, so this one ends there.
    const end = headers[index + 1]?.row ?? rows.length;
    const section = rows.slice(header.row + 1, end);

    for (const column of header.items) {
      for (const name of columnNames(section, column)) names.add(name);
    }
  });

  return names.size > 0 ? names : null;
}

const REQUEST_TIMEOUT_MS = 15_000;

export type SheetLoad =
  /** Not a usable web address, or nothing is there. */
  | { status: "invalid-url"; detail: string }
  /** The sheet exists but will not be handed out to the public. */
  | { status: "private"; detail: string }
  /** Fetched fine, but there is nothing in it this script can use. */
  | { status: "bad-data"; detail: string }
  | { status: "ok"; csvUrl: string; items: Set<string> };

interface Fetched {
  body: string;
  status: number;
}

/** Asks the spreadsheet host for the sheet as plain text. */
function requestSheet(csvUrl: string): Promise<Fetched> {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: "GET",
      url: csvUrl,
      timeout: REQUEST_TIMEOUT_MS,
      onload(response) {
        resolve({ body: response.responseText, status: response.status });
      },
      onerror() {
        reject(new Error("Could not reach that address"));
      },
      ontimeout() {
        reject(new Error("That address did not respond in time"));
      },
    });
  });
}

/** Says whether a sign-in or preview page came back instead of the data. */
function looksLikeWebPage(body: string): boolean {
  const start = body.slice(0, 500).trimStart().toLowerCase();
  return (
    start.startsWith("<!doctype html") ||
    start.startsWith("<html") ||
    start.startsWith("<?xml") ||
    start.includes("<head")
  );
}

/** Says whether an Office file came back instead of the data. */
function looksLikeOfficeFile(body: string): boolean {
  return body.startsWith("PK");
}

/** Resolves a pasted link all the way to an item list, or says why it could not. */
export async function loadSheet(input: string): Promise<SheetLoad> {
  const ref = parseSheetRef(input);
  if (!ref) {
    return { status: "invalid-url", detail: "That is not a web address." };
  }

  let fetched: Fetched;
  try {
    fetched = await requestSheet(ref.csvUrl);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { status: "invalid-url", detail };
  }

  if (fetched.status === 401 || fetched.status === 403) {
    return {
      status: "private",
      detail: `The host refused the request (HTTP ${fetched.status}).`,
    };
  }

  if (fetched.status < 200 || fetched.status >= 300) {
    return {
      status: "invalid-url",
      detail: `That address returned HTTP ${fetched.status}.`,
    };
  }

  if (looksLikeWebPage(fetched.body)) {
    return {
      status: "private",
      detail:
        "A web page came back instead of the data, which is what a sign-in " +
        "or preview screen looks like. Share the sheet so that anyone with " +
        "the link can view it, and use its published CSV link.",
    };
  }

  if (looksLikeOfficeFile(fetched.body)) {
    return {
      status: "bad-data",
      detail:
        "That link hands out an Excel file rather than plain data. Publish " +
        "the sheet as CSV and use that link instead.",
    };
  }

  const items = readItemList(parseSheetText(fetched.body));
  if (!items) {
    return {
      status: "bad-data",
      detail:
        "Item names are read from every column headed Item, falling back to " +
        "whichever column holds the most names, and no column held any.",
    };
  }

  return { status: "ok", csvUrl: ref.csvUrl, items };
}
