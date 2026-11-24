// Every style ZNS OC Payout tool injects.

const STYLE_ID = "ocp-styles";

export const PANEL_ID = "ocp-panel";

/** Put on the panel while it shows its title bar only. */
export const COLLAPSED_CLASS = "ocp-collapsed";

/**
 * The panel's colours, sampled from the VS Code theme Dizzy chose
 * (screenshot, 2026-11-25), plus its green for finished work.
 */
const COLOURS = {
  background: "#121314",
  bar: "#202122",
  /* Dizzy's screenshot shade (#191919, 10% bright) made 10% lighter. */
  feeder: "#333333",
  hover: "#1e1f20",
  /* An open crime's row, the colour of the editor's panel tab bar. */
  open: "#202122",
  /* Everything inside an open crime, the colour of the editor's terminal. */
  inside: "#191a1b",
  /* The editor's current-line colour, tinted towards the row's text colour. */
  selectedRed: "#3a2e2e",
  selectedGreen: "#263928",
  border: "#2a2b2c",
  text: "#bbbebf",
  muted: "#858889",
  red: "#ff7b72",
  green: "#35e935",
};

/** Height of one line of the OC table, in pixels. */
const ROW_HEIGHT = 27;
/** Most lines the OC table shows before it scrolls. */
const MAX_LINES = 30;

const CSS = `
  #${PANEL_ID} {
    margin: 10px 0;
    border-radius: 5px;
    overflow: hidden;
    border: 1px solid ${COLOURS.border};
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    color: ${COLOURS.text} !important;
  }
  /* Torn colours divs and table cells dark and outranks a colour set on the
     panel, so every cell inherits with !important. Coloured classes below
     use the same id prefix to win back. */
  #${PANEL_ID} .ocp-body * {
    color: inherit !important;
  }
  #${PANEL_ID} .ocp-title {
    display: flex;
    align-items: center;
    gap: 7px;
    cursor: pointer;
    height: 30px;
    line-height: 30px;
    padding: 0 10px;
    background: ${COLOURS.bar};
    color: ${COLOURS.text} !important;
    font-weight: bold;
  }
  #${PANEL_ID} .ocp-caret {
    font-size: 10px;
    transition: transform 0.15s ease;
  }
  #${PANEL_ID}.${COLLAPSED_CLASS} .ocp-caret { transform: rotate(-90deg); }
  #${PANEL_ID}.${COLLAPSED_CLASS} .ocp-body { display: none; }
  #${PANEL_ID} .ocp-body {
    background: ${COLOURS.background};
    padding: 10px 12px;
  }

  /* --------------------------------------------------------- controls */

  #${PANEL_ID} .ocp-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    margin: 0 0 8px;
  }
  #${PANEL_ID} .ocp-key-field {
    position: relative;
    display: flex;
    align-items: center;
    flex: 0 1 220px;
    min-width: 0;
  }
  #${PANEL_ID} input.ocp-input,
  #${PANEL_ID} input.ocp-percent {
    box-sizing: border-box;
    border: 1px solid ${COLOURS.border};
    border-radius: 4px;
    background: #000;
    color: #fff !important;
    font-size: 12px;
  }
  #${PANEL_ID} input.ocp-input {
    width: 100%;
    padding: 4px 28px 4px 7px;
    line-height: 18px;
  }
  /* Hides the key's characters while keeping it a text box, so password
     managers leave it alone. */
  #${PANEL_ID} input.ocp-input.ocp-masked {
    -webkit-text-security: disc;
  }
  #${PANEL_ID} input.ocp-percent {
    width: 52px;
    padding: 3px 5px;
    text-align: right;
  }
  #${PANEL_ID} .ocp-percent-label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  #${PANEL_ID} .ocp-eye {
    position: absolute;
    right: 5px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    width: 20px;
    height: 20px;
    padding: 0;
    border: 0;
    background: none;
    color: ${COLOURS.text} !important;
    cursor: pointer;
  }
  #${PANEL_ID} .ocp-eye svg { width: 15px; height: 15px; margin: auto; }
  /* Paint, font and border come from Torn's own torn-btn; only the size is ours. */
  #${PANEL_ID} .ocp-button {
    height: 24px;
    line-height: 22px;
    margin: 0;
    padding: 0 10px;
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
  }
  #${PANEL_ID} .ocp-button:not(.torn-btn) {
    border: 1px solid ${COLOURS.border};
    border-radius: 3px;
    background: ${COLOURS.bar};
    font-family: "Fjalla One", "Arial Narrow", Arial, sans-serif;
    text-transform: uppercase;
  }
  #${PANEL_ID} .ocp-button[disabled] { opacity: 0.5; cursor: default; }
  #${PANEL_ID} .ocp-status { font-size: 11px; font-weight: bold; }
  #${PANEL_ID} .ocp-ok    { color: ${COLOURS.green} !important; }
  #${PANEL_ID} .ocp-error { color: ${COLOURS.red} !important; }

  /* --------------------------------------------------------- crime list */

  /* Every line of the table is ROW_HEIGHT tall, so the box holds at most
     MAX_LINES of them, headings and crime details included, and scrolls. */
  #${PANEL_ID} .ocp-scroll {
    overflow: auto;
    max-height: ${MAX_LINES * ROW_HEIGHT}px;
  }
  #${PANEL_ID} .ocp-table th,
  #${PANEL_ID} .ocp-table td {
    box-sizing: border-box;
    height: ${ROW_HEIGHT}px;
    line-height: 16px;
  }
  /* The OC table's own headings stay in view while it scrolls. */
  #${PANEL_ID} .ocp-scroll > table > tbody > tr:first-child > th,
  #${PANEL_ID} .ocp-scroll > table > tr:first-child > th {
    position: sticky;
    top: 0;
    z-index: 1;
  }
  #${PANEL_ID} table.ocp-table {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid ${COLOURS.border};
  }
  #${PANEL_ID} .ocp-table th {
    padding: 5px 6px;
    background: ${COLOURS.bar};
    font-size: 11px;
    font-weight: bold;
    text-align: center;
    vertical-align: bottom;
  }
  #${PANEL_ID} .ocp-table td {
    padding: 5px 6px;
    border-top: 1px solid ${COLOURS.border};
    white-space: nowrap;
    text-align: center;
  }
  #${PANEL_ID} .ocp-payout { font-weight: bold; }
  #${PANEL_ID} .ocp-tip { cursor: help; }
  #${PANEL_ID} tr.ocp-crime { cursor: pointer; background: ${COLOURS.background}; }
  /* A crime that unlocked the one above it, stacked under it. */
  #${PANEL_ID} tr.ocp-crime.ocp-feeder { background: ${COLOURS.feeder}; }
  #${PANEL_ID} tr.ocp-crime:hover { background: ${COLOURS.hover}; }
  #${PANEL_ID} tr.ocp-crime.ocp-open { background: ${COLOURS.open}; }
  #${PANEL_ID} tr.ocp-crime td { color: ${COLOURS.red} !important; }
  #${PANEL_ID} tr.ocp-crime.ocp-done td { color: ${COLOURS.green} !important; }
  #${PANEL_ID} .ocp-caret-cell { width: 10px; font-size: 9px; }
  #${PANEL_ID} tr.ocp-detail > td {
    padding: 0;
    background: ${COLOURS.inside};
    white-space: normal;
  }
  #${PANEL_ID} .ocp-summary {
    padding: 6px;
    font-size: 11px;
    line-height: 16px;
  }
  #${PANEL_ID} .ocp-summary span + span::before {
    content: " | ";
    color: ${COLOURS.muted} !important;
  }
  #${PANEL_ID} table.ocp-players { border-width: 1px 0 0; }
  #${PANEL_ID} table.ocp-players th { font-size: 10px; white-space: normal; }
  #${PANEL_ID} tr.ocp-player td { color: ${COLOURS.red} !important; background: ${COLOURS.inside}; }
  #${PANEL_ID} tr.ocp-player.ocp-clickable { cursor: pointer; }
  #${PANEL_ID} tr.ocp-player.ocp-clickable:hover td { background: ${COLOURS.hover}; }
  #${PANEL_ID} tr.ocp-player.ocp-paid td { color: ${COLOURS.green} !important; }
  /* Listed with :hover so the chosen row keeps its colour while the mouse is
     still on it; red text gets the red tint, green (paid) the green one. */
  #${PANEL_ID} tr.ocp-player.ocp-selected td,
  #${PANEL_ID} tr.ocp-player.ocp-selected:hover td { background: ${COLOURS.selectedRed}; }
  #${PANEL_ID} tr.ocp-player.ocp-paid.ocp-selected td,
  #${PANEL_ID} tr.ocp-player.ocp-paid.ocp-selected:hover td { background: ${COLOURS.selectedGreen}; }
  #${PANEL_ID} .ocp-player-id { color: ${COLOURS.muted} !important; }
  #${PANEL_ID} .ocp-footer {
    display: flex;
    gap: 8px;
    margin: 8px 0 0;
  }
`;

/** Puts this script's stylesheet on the page. */
export function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  (document.head ?? document.documentElement).appendChild(style);
}
