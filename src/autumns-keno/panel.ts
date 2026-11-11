// The bar under the Keno board: the heat map switch and the sheet link.

import { SELECTORS } from "./board";
import { paintHeatmap, type HeatMode } from "./heatmap";
import { allRounds, onRoundsChange, syncStatus, syncWithSheet } from "./rounds";
import { HEAT_MODE, SHEET_URL, readSetting, writeSetting } from "./settings";
import { fetchHistory } from "./sheet";
import { PANEL_ID, injectStyles } from "./styles";

let heatMode = readSetting<HeatMode>(HEAT_MODE, "drawn");
/** The sheet URL field, hidden once a working URL is saved. */
let sheetControl: HTMLElement | null = null;
/** The sheet sync status, which also opens the URL field. */
let sheetStatus: HTMLElement | null = null;

/** Returns a new element with an optional class and text. */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** Shows how many rounds are recorded and whether they have reached the sheet. */
function updateStatus(rounds: number): void {
  if (!sheetStatus) return;
  const { state, unsent } = syncStatus();
  let text = "no sheet set";
  let tone = "akn-warn";
  if (unsent > 0 && state !== "no sheet") text = `${unsent} waiting to save`;
  else if (state === "synced") [text, tone] = ["all saved", "akn-good"];
  else if (state === "syncing") text = "saving";
  else if (state === "offline") [text, tone] = ["can't reach sheet", "akn-bad"];
  sheetStatus.className = `akn-link ${tone}`;
  sheetStatus.textContent = `${rounds} rounds, ${text}`;
}

/** Repaints the heat map and the status from the current history. */
function render(): void {
  const rounds = allRounds();
  paintHeatmap(rounds, heatMode);
  updateStatus(rounds.length);
}

/** Returns the sheet URL field with its show/hide and Check buttons, hidden when already set. */
function buildSheetControl(): HTMLElement {
  const control = el("span", "akn-control");
  if (readSetting<string>(SHEET_URL, "")) control.classList.add("akn-hidden");
  control.appendChild(el("span", "", "Sheet"));

  const box = el("span", "akn-url-box");
  const input = el("input", "akn-url");
  input.type = "password";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = "web app URL";
  input.value = readSetting<string>(SHEET_URL, "");
  box.appendChild(input);

  const reveal = el("button", "akn-reveal", "show");
  reveal.type = "button";
  reveal.addEventListener("click", () => {
    const hidden = input.type === "password";
    input.type = hidden ? "text" : "password";
    reveal.textContent = hidden ? "hide" : "show";
  });
  box.appendChild(reveal);
  control.appendChild(box);

  const check = el("button", "torn-btn akn-btn", "Check");
  check.type = "button";
  control.appendChild(check);

  const result = el("span");
  control.appendChild(result);

  check.addEventListener("click", async () => {
    const url = input.value.trim();
    result.className = "";
    result.textContent = "checking";
    try {
      if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) throw new Error("not a web app URL");
      await fetchHistory(url);
      writeSetting(SHEET_URL, url);
      result.textContent = "";
      control.classList.add("akn-hidden");
      void syncWithSheet();
    } catch {
      result.className = "akn-bad";
      result.textContent = "invalid";
    }
  });
  return control;
}

/** Returns the heat map mode buttons. */
function buildHeatControl(): HTMLElement {
  const control = el("span", "akn-control");
  control.appendChild(el("span", "", "Heat map"));
  const modes: [HeatMode, string][] = [
    ["drawn", "Drawn"],
    ["wins", "Wins"],
    ["off", "Off"],
  ];
  const buttons: HTMLButtonElement[] = [];
  for (const [mode, label] of modes) {
    const button = el("button", "torn-btn akn-btn", label);
    button.type = "button";
    button.classList.toggle("akn-active", mode === heatMode);
    button.addEventListener("click", () => {
      heatMode = mode;
      writeSetting(HEAT_MODE, mode);
      buttons.forEach((b, i) => b.classList.toggle("akn-active", modes[i]?.[0] === mode));
      render();
    });
    buttons.push(button);
    control.appendChild(button);
  }
  return control;
}

/** Puts the bar under the Keno game and keeps it and the heat map current. */
export function installPanel(): void {
  injectStyles();
  const game = document.querySelector(SELECTORS.game);
  if (game && !document.getElementById(PANEL_ID)) {
    const panel = el("div", "akn-controls");
    panel.id = PANEL_ID;
    sheetStatus = el("span");
    sheetStatus.title = "Change sheet";
    sheetStatus.addEventListener("click", () => sheetControl?.classList.toggle("akn-hidden"));
    sheetControl = buildSheetControl();
    panel.append(buildHeatControl(), sheetStatus, sheetControl);
    game.after(panel);
  }
  onRoundsChange(render);
  render();
}
