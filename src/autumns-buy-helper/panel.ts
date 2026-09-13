// The "Autumn's Buy Helper" settings panel on preferences.php.
//
// One field so far: the source spreadsheet. Pressing enter in it checks the
// link there and then, and the line underneath says what happened - there is
// no save button to wonder about, and no way to leave the page believing a
// broken sheet is loaded.

import { loadSheet } from "./sheet";
import {
  SHEET_URL_KEY,
  clampMaxBuyValue,
  clearSetting,
  readMaxBuyValue,
  readSetting,
  writeMaxBuyValue,
  writeSetting,
  writeSheetCache,
} from "./settings";
import { PANEL_ID, injectStyles } from "./styles";

// ------------------------------------------------------------- selectors
//
// Unhashed Torn classes, most specific first. The panel goes directly after
// whichever of these is found, so it inherits that element's width.

const PREFS_PANEL_SELECTORS = [
  ".preferences-container",
  ".preferences-wrap",
  ".content-wrapper",
];

function findPrefsPanel(): Element | null {
  for (const selector of PREFS_PANEL_SELECTORS) {
    const element = document.querySelector(selector);
    if (element) return element;
  }
  return null;
}

// ---------------------------------------------------------------- status

type StatusKind = "ok" | "error" | "working" | "none";

function setStatus(element: HTMLElement, kind: StatusKind, text: string): void {
  element.className = kind === "none" ? "abh-status" : `abh-status abh-status-${kind}`;
  element.textContent = text;
}

// ------------------------------------------------------ source spreadsheet

/**
 * Checks are asynchronous and the user can type over one mid-flight, so each
 * carries a token and only the newest is allowed to write the status line.
 */
let checkToken = 0;

async function checkSheet(
  input: HTMLInputElement,
  status: HTMLElement,
  options: { announceEmpty: boolean },
): Promise<void> {
  const token = ++checkToken;
  const value = input.value.trim();

  if (!value) {
    clearSetting(SHEET_URL_KEY);
    setStatus(status, "none", options.announceEmpty ? "No source sheet set." : "");
    status.removeAttribute("title");
    return;
  }

  setStatus(status, "working", "Checking sheet...");
  status.removeAttribute("title");

  const result = await loadSheet(value);
  if (token !== checkToken) return; // Superseded by a newer check.

  // The URL is kept whatever the outcome, so a typo is there to correct
  // rather than silently wiped on the next page load.
  writeSetting(SHEET_URL_KEY, value);

  if (result.status === "invalid-url") {
    setStatus(status, "error", "invalid URL");
    status.title = result.detail;
    return;
  }

  if (result.status === "private") {
    setStatus(status, "error", "Please adjust your sheet's privacy settings");
    status.title = result.detail;
    return;
  }

  if (result.status === "bad-data") {
    setStatus(
      status,
      "error",
      "URL loaded but data is not formatted correctly for this script.",
    );
    status.title = result.detail;
    return;
  }

  writeSheetCache({
    csvUrl: result.csvUrl,
    fetchedAt: Date.now(),
    entries: [...result.table.prices],
  });

  setStatus(status, "ok", "valid source sheet loaded");
  status.title = `${result.table.prices.size} item prices read from the sheet.`;
}

function buildSourceSheetField(): HTMLElement {
  const field = document.createElement("div");
  field.className = "abh-field";

  const label = document.createElement("label");
  label.className = "abh-field-label";
  label.htmlFor = "abh-sheet-url";
  label.textContent = "Source Spreadsheet";
  field.appendChild(label);

  const input = document.createElement("input");
  input.id = "abh-sheet-url";
  input.className = "abh-text-input";
  input.type = "text";
  input.spellcheck = false;
  input.autocomplete = "off";
  input.placeholder = "Link to a public spreadsheet";
  input.value = readSetting(SHEET_URL_KEY, "");
  field.appendChild(input);

  const status = document.createElement("div");
  status.className = "abh-status";
  field.appendChild(status);

  const hint = document.createElement("div");
  hint.className = "abh-hint";
  hint.textContent =
    "Paste a link to a publicly viewable spreadsheet and press enter. " +
    "Google Sheets links work as they come; anything else should be a link " +
    "that hands out the sheet as CSV.";
  field.appendChild(hint);

  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    // Torn's preferences page is a form; enter would otherwise submit it.
    event.preventDefault();
    void checkSheet(input, status, { announceEmpty: true });
  });

  // Re-check whatever is stored when the panel appears, so the line under
  // the box describes the sheet as it is now, not as it was when it was set.
  if (input.value.trim()) {
    void checkSheet(input, status, { announceEmpty: false });
  }

  return field;
}

// ------------------------------------------------------ maximum buy value

function buildMaxBuyValueField(): HTMLElement {
  const field = document.createElement("div");
  field.className = "abh-field";

  const label = document.createElement("label");
  label.className = "abh-field-label";
  label.htmlFor = "abh-max-buy-value";
  label.textContent = "Maximum Buy Value";
  field.appendChild(label);

  const wrapper = document.createElement("span");
  wrapper.className = "abh-percent";

  const sign = document.createElement("span");
  sign.className = "abh-percent-sign";
  sign.textContent = "%";
  wrapper.appendChild(sign);

  const input = document.createElement("input");
  input.id = "abh-max-buy-value";
  input.className = "abh-text-input";
  input.type = "number";
  input.min = "0";
  input.max = "100";
  input.step = "1";
  input.value = String(readMaxBuyValue());
  wrapper.appendChild(input);

  field.appendChild(wrapper);

  const hint = document.createElement("div");
  hint.className = "abh-hint";
  hint.textContent =
    "How far under your sheet price a listing has to be before it is " +
    "outlined. At 30%, an item worth 1,000 on your sheet is only outlined " +
    "when someone is asking $700 or less.";
  field.appendChild(hint);

  // Written on every change so the market pages see it immediately, and
  // pulled back into range in case the box was typed into rather than
  // stepped - the browser does not enforce min and max on typed input.
  const save = (): void => {
    const value = clampMaxBuyValue(Number(input.value));
    writeMaxBuyValue(value);
    input.value = String(value);
  };

  input.addEventListener("change", save);
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    // Torn's preferences page is a form; enter would otherwise submit it.
    event.preventDefault();
    save();
  });

  return field;
}

// ----------------------------------------------------------------- panel

function buildPanel(): HTMLElement {
  const panel = document.createElement("div");
  panel.id = PANEL_ID;

  const title = document.createElement("div");
  title.className = "abh-title";
  title.textContent = "Autumn's Buy Helper";
  panel.appendChild(title);

  const body = document.createElement("div");
  body.className = "abh-body";
  body.appendChild(buildSourceSheetField());
  body.appendChild(buildMaxBuyValueField());
  panel.appendChild(body);

  return panel;
}

function injectPanel(): void {
  if (document.getElementById(PANEL_ID)) return;
  const anchor = findPrefsPanel();
  if (!anchor) return;
  injectStyles();
  anchor.insertAdjacentElement("afterend", buildPanel());
}

/** Preferences is a React page, so the anchor can appear or be replaced. */
export function installPreferencesPanel(): void {
  injectPanel();
  new MutationObserver(() => injectPanel()).observe(document.body, {
    childList: true,
    subtree: true,
  });
}
