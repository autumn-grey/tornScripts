import { refreshMarks } from "./markup";
import { loadSheet } from "./sheet";
import {
  SHEET_URL_KEY,
  clearSetting,
  readPanelOpen,
  readSetting,
  writePanelOpen,
  writeSetting,
  writeSheetCache,
} from "./settings";
import { COLLAPSED_CLASS, PANEL_ID, injectStyles } from "./styles";

// Unhashed Torn landmarks, most specific first. The panel goes directly after
// whichever is found.
const HEADER_SELECTORS = [
  ".content-title",
  "#skip-to-content",
  ".title-black",
  ".content-wrapper > h4",
];

/** The page heading the panel sits under. */
function findHeader(): Element | null {
  for (const selector of HEADER_SELECTORS) {
    const element = document.querySelector(selector);
    if (element) return element;
  }
  return null;
}

type StatusKind = "ok" | "error" | "working" | "none";

/** Writes the line under the input. */
function setStatus(element: HTMLElement, kind: StatusKind, text: string): void {
  element.className = kind === "none" ? "stf-status" : `stf-status stf-status-${kind}`;
  element.textContent = text;
}

let checkToken = 0;

/** Checks the pasted link and stores what it hands back. */
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
  if (token !== checkToken) return;

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
    items: [...result.items],
  });

  setStatus(status, "ok", `valid source sheet loaded - ${result.items.size} items`);
  status.title = "Items on the list are outlined in the trade list below.";
  refreshMarks();
}

/** Builds the source spreadsheet field. */
function buildSourceSheetField(): HTMLElement {
  const field = document.createElement("div");
  field.className = "stf-field";

  const label = document.createElement("label");
  label.className = "stf-field-label";
  label.htmlFor = "stf-sheet-url";
  label.textContent = "Source Spreadsheet";
  field.appendChild(label);

  const input = document.createElement("input");
  input.id = "stf-sheet-url";
  input.className = "stf-text-input";
  input.type = "text";
  input.spellcheck = false;
  input.autocomplete = "off";
  input.placeholder = "Link to a public spreadsheet";
  input.value = readSetting(SHEET_URL_KEY, "");
  field.appendChild(input);

  const status = document.createElement("div");
  status.className = "stf-status";
  field.appendChild(status);

  const hint = document.createElement("div");
  hint.className = "stf-hint";
  hint.textContent = "Paste a link to a publicly viewable spreadsheet and press enter.";
  field.appendChild(hint);

  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void checkSheet(input, status, { announceEmpty: true });
  });

  if (input.value.trim()) {
    void checkSheet(input, status, { announceEmpty: false });
  }

  return field;
}

/** Builds the title bar, which opens and closes the panel. */
function buildTitle(panel: HTMLElement): HTMLElement {
  const title = document.createElement("div");
  title.className = "stf-title";
  title.setAttribute("role", "button");
  title.tabIndex = 0;

  const caret = document.createElement("span");
  caret.className = "stf-caret";
  caret.textContent = "▾";
  title.appendChild(caret);

  const text = document.createElement("span");
  text.textContent = "Spreadsheet Trade Filter";
  title.appendChild(text);

  const apply = (open: boolean): void => {
    panel.classList.toggle(COLLAPSED_CLASS, !open);
    title.setAttribute("aria-expanded", String(open));
  };

  apply(readPanelOpen());

  const toggle = (): void => {
    const open = panel.classList.contains(COLLAPSED_CLASS);
    writePanelOpen(open);
    apply(open);
  };

  title.addEventListener("click", toggle);
  title.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggle();
  });

  return title;
}

/** Builds the panel. */
function buildPanel(): HTMLElement {
  const panel = document.createElement("div");
  panel.id = PANEL_ID;
  panel.appendChild(buildTitle(panel));

  const body = document.createElement("div");
  body.className = "stf-body";
  body.appendChild(buildSourceSheetField());
  panel.appendChild(body);

  return panel;
}

/** Puts the panel under the page heading, once. */
export function installPanel(): void {
  if (document.getElementById(PANEL_ID)) return;

  const anchor = findHeader();
  if (!anchor) return;

  injectStyles();
  anchor.insertAdjacentElement("afterend", buildPanel());
}
