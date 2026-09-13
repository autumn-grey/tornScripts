// Reading reference prices out of a public spreadsheet.
//
// The script does not care which app your sheet lives in. It asks the link
// you gave it for plain text and reads the rows out of that, so anything
// that can hand out a public CSV works: Google Sheets, an Excel sheet
// published to the web as CSV, a file on OneDrive or Dropbox, a plain CSV
// sitting on any web host.
//
// Google Sheets gets one piece of special handling, because a normal Google
// share link points at the editor rather than at the data. Those links are
// rewritten to Google's CSV address automatically, so you can paste the link
// straight out of the address bar.
//
// The request goes to another site, so it needs GM_xmlhttpRequest and the
// @connect grant; the browser blocks an ordinary request to another domain.

// ----------------------------------------------------------- the address

/** A spreadsheet we know how to ask for, resolved from whatever was pasted. */
export interface SheetRef {
  csvUrl: string;
}

/** Google document ids: long, and only these characters. */
const DOCUMENT_ID = /^[A-Za-z0-9_-]{20,}$/;

const SHARED_PATH = /\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/;
const PUBLISHED_PATH = /\/spreadsheets\/d\/e\/([A-Za-z0-9_-]{20,})/;

/** Which tab of the workbook, if the link pointed at one. */
function findGid(url: URL): string | null {
  const fromHash = /[#&?]gid=(\d+)/.exec(url.hash);
  if (fromHash?.[1]) return fromHash[1];

  const fromQuery = url.searchParams.get("gid");
  if (fromQuery && /^\d+$/.test(fromQuery)) return fromQuery;

  return null;
}

function googleCsvUrl(url: URL): string | null {
  const gid = findGid(url);

  // The published-to-web form has to be checked first: its path also matches
  // the shared pattern, but with "e" captured as the id.
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

/**
 * Turn what the user pasted into an address we can ask for data, or null if
 * it is not a usable web address at all. This only checks the shape of the
 * link - whether it actually leads anywhere is answered by fetching it.
 */
export function parseSheetRef(input: string): SheetRef | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // A bare Google document id, for anyone who pastes just the id.
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
    // A docs.google.com link that is not a spreadsheet is just wrong.
    return csvUrl ? { csvUrl } : null;
  }

  // Everything else is asked for exactly as given, on the assumption that
  // the user pointed us at something that serves the data directly.
  return { csvUrl: url.href };
}

// ------------------------------------------------------------ reading rows

/**
 * Minimal spreadsheet-text parser: quoted fields, doubled quotes inside
 * them, and either line ending. Blank lines are dropped rather than becoming
 * empty rows, which is what the trailing rows of a hand-kept sheet look like.
 */
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

  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    const next = text[i + 1];

    if (quoted && character === '"' && next === '"') {
      value += '"';
      i++;
    } else if (character === '"') {
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

/**
 * Commas or tabs, whichever the file actually uses. Exports labelled CSV are
 * sometimes tab separated, and guessing wrong turns every row into one cell.
 */
export function parseSheetText(text: string): string[][] {
  const sample = text.slice(0, 5000);
  const commas = (sample.match(/,/g) ?? []).length;
  const tabs = (sample.match(/\t/g) ?? []).length;

  return parseDelimited(text, tabs > commas ? "\t" : ",");
}

// --------------------------------------------------------- reading prices

export function normalizeItemName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Torn money as people actually write it: "1,250,000", "$1.25m", "900k".
 * Returns NaN for anything that is not a number, which is how a header cell
 * and a stray note both get skipped.
 */
export function parsePrice(value: string): number {
  const text = value.trim().toLowerCase().replace(/[$,\s]/g, "");
  if (!text) return NaN;

  const match = /^(-?\d*\.?\d+)([kmb])?$/.exec(text);
  if (!match?.[1]) return NaN;

  const suffix = match[2] ?? "";
  const scale = suffix === "k" ? 1e3 : suffix === "m" ? 1e6 : suffix === "b" ? 1e9 : 1;

  return Number(match[1]) * scale;
}

// The template sheet always puts the same thing in the same place, so the
// columns are fixed rather than searched for. Counting starts at zero, so
// column C is 2 and column D is 3.
const ITEM_NAME_COLUMN = 2;
const PRICE_COLUMN = 3;

export interface PriceTable {
  prices: Map<string, number>;
}

/**
 * Build the lookup the market pages will use, or null if there is nothing
 * usable in those two columns.
 *
 * Rows are taken as they come, and any row without a name and a sensible
 * price is skipped - which is how the header row, blank rows and notes all
 * get ignored without having to be recognised. A price of zero or less is
 * dropped too: nothing can be compared against it, and it would divide the
 * percentage maths by zero later.
 */
export function readPriceTable(rows: string[][]): PriceTable | null {
  const prices = new Map<string, number>();

  for (const row of rows) {
    const name = normalizeItemName(row[ITEM_NAME_COLUMN] ?? "");
    if (!name) continue;

    const price = parsePrice(row[PRICE_COLUMN] ?? "");
    if (!Number.isFinite(price) || price <= 0) continue;

    // First row wins, so a duplicate further down cannot quietly override it.
    if (!prices.has(name)) prices.set(name, price);
  }

  if (prices.size === 0) return null;

  return { prices };
}

// -------------------------------------------------------------- fetching

const REQUEST_TIMEOUT_MS = 15_000;

export type SheetLoad =
  /** Not a usable web address, or nothing is there. */
  | { status: "invalid-url"; detail: string }
  /** The sheet exists but will not be handed out to the public. */
  | { status: "private"; detail: string }
  /** Fetched fine, but there is nothing in it this script can use. */
  | { status: "bad-data"; detail: string }
  | { status: "ok"; csvUrl: string; table: PriceTable };

interface Fetched {
  body: string;
  status: number;
}

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

/**
 * A sheet that is not public usually does not fail the request - the host
 * answers with a sign-in or preview page instead of the data. Spreadsheet
 * text never starts with markup, so that is the tell.
 */
function looksLikeWebPage(body: string): boolean {
  const start = body.slice(0, 500).trimStart().toLowerCase();
  return (
    start.startsWith("<!doctype html") ||
    start.startsWith("<html") ||
    start.startsWith("<?xml") ||
    start.includes("<head")
  );
}

/** Every Office file is a zip underneath, and every zip starts "PK". */
function looksLikeOfficeFile(body: string): boolean {
  return body.startsWith("PK");
}

/** Resolve a pasted link all the way to a price table, or say why it could not. */
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

  // Refused outright: signed-out, no permission, or sharing switched off.
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

  const table = readPriceTable(parseSheetText(fetched.body));
  if (!table) {
    return {
      status: "bad-data",
      detail:
        "Item names are read from column C and prices from column D, and " +
        "no row had both. Check the sheet matches the template.",
    };
  }

  return { status: "ok", csvUrl: ref.csvUrl, table };
}
