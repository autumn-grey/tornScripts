// Autumn's Keno: the Google Apps Script behind the shared round history.
//
// A standalone Apps Script project, deployed as a web app (execute as me,
// anyone with the link). The userscript POSTs new rounds here and GETs the
// full history back, so every device shares one list. It is not built by
// build.mjs; it is kept here so the deployed copy can be rebuilt from the repo.
//
// Standalone rather than bound to the sheet because Extensions > Apps Script
// fails with "unable to open the file" when Chrome has several Google
// accounts signed in.

/** The spreadsheet's ID, from its URL; filled in on the deployed copy only. */
const SPREADSHEET_ID = "PASTE_SPREADSHEET_ID";
const SHEET_NAME = "Rounds";
const HEADERS = ["Round ID", "Time", "Picks", "Drawn", "Matches", "Bet", "Won"];

// Picks and Drawn are space-separated lists, which Sheets would turn into a
// number or a date when only one value is present, so those columns are text.
const ROW_FORMATS = ["@", "@", "@", "@", "0", "#,##0", "#,##0"];

/** Returns the Rounds sheet, creating it with its header row if missing. */
function roundsSheet_() {
  const book = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = book.getSheetByName(SHEET_NAME) || book.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Returns every stored row below the header. */
function allRows_(sheet) {
  const count = sheet.getLastRow() - 1;
  if (count < 1) return [];
  return sheet.getRange(2, 1, count, HEADERS.length).getValues();
}

/** Wraps a value as a JSON response. */
function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Returns the whole round history. */
function doGet() {
  const rounds = allRows_(roundsSheet_()).map((row) => ({
    id: String(row[0]),
    time: String(row[1]),
    picks: String(row[2]),
    drawn: String(row[3]),
    matches: Number(row[4]),
    bet: Number(row[5]),
    won: Number(row[6]),
  }));
  return json_({ ok: true, rounds: rounds });
}

/** Appends the posted rounds whose ID is not already stored. */
function doPost(e) {
  // Two devices can post at once; without the lock both would read the same
  // last row and overwrite each other.
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const body = JSON.parse(e.postData.contents);
    const sheet = roundsSheet_();
    const seen = new Set(allRows_(sheet).map((row) => String(row[0])));

    // A retry after a timeout resends rounds that did land; the ID drops them.
    const fresh = (body.rounds || []).filter((r) => r && r.id && !seen.has(String(r.id)));
    if (fresh.length > 0) {
      const rows = fresh.map((r) => [
        String(r.id),
        String(r.time),
        (r.picks || []).join(" "),
        (r.drawn || []).join(" "),
        Number(r.matches) || 0,
        Number(r.bet) || 0,
        Number(r.won) || 0,
      ]);
      const range = sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADERS.length);
      range.setNumberFormats(rows.map(() => ROW_FORMATS));
      range.setValues(rows);
    }
    return json_({ ok: true, added: fresh.length });
  } finally {
    lock.releaseLock();
  }
}
