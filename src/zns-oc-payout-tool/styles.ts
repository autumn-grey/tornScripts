// Every style ZNS OC Payout tool injects.

const STYLE_ID = "ocp-styles";

export const PANEL_ID = "ocp-panel";

/** Put on the panel while it shows its title bar only. */
export const COLLAPSED_CLASS = "ocp-collapsed";

const CSS = `
  #${PANEL_ID} {
    margin: 0 0 10px;
    border-radius: 5px;
    overflow: hidden;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    color: #fff !important;
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
    background: linear-gradient(180deg, #4e565e 0%, #303840 100%);
    font-weight: bold;
    text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
  }
  #${PANEL_ID} .ocp-caret {
    font-size: 10px;
    transition: transform 0.15s ease;
  }
  #${PANEL_ID}.${COLLAPSED_CLASS} .ocp-caret { transform: rotate(-90deg); }
  #${PANEL_ID}.${COLLAPSED_CLASS} .ocp-body { display: none; }
  #${PANEL_ID} .ocp-body {
    background: linear-gradient(180deg, #4a4a4a 0%, #333 100%);
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
  #${PANEL_ID} input.ocp-input {
    box-sizing: border-box;
    width: 100%;
    padding: 4px 28px 4px 7px;
    border: 1px solid rgba(0, 0, 0, 0.5);
    border-radius: 4px;
    background: #f2f2f2;
    color: #000 !important;
    font-size: 12px;
    line-height: 18px;
  }
  /* Hides the key's characters while keeping it a text box, so password
     managers leave it alone. */
  #${PANEL_ID} input.ocp-input.ocp-masked {
    -webkit-text-security: disc;
  }
  #${PANEL_ID} input.ocp-percent {
    box-sizing: border-box;
    width: 52px;
    padding: 3px 5px;
    border: 1px solid rgba(0, 0, 0, 0.5);
    border-radius: 4px;
    background: #f2f2f2;
    color: #000 !important;
    font-size: 12px;
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
    color: #555 !important;
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
    border: 1px solid #1c2228;
    border-radius: 3px;
    background: linear-gradient(180deg, #5b646d 0%, #333b43 100%);
    font-family: "Fjalla One", "Arial Narrow", Arial, sans-serif;
    text-transform: uppercase;
  }
  #${PANEL_ID} .ocp-button[disabled] { opacity: 0.5; cursor: default; }
  #${PANEL_ID} .ocp-status { font-size: 11px; font-weight: bold; }
  #${PANEL_ID} .ocp-ok    { color: #5ed17c !important; }
  #${PANEL_ID} .ocp-error { color: #ff6b6b !important; }

  /* --------------------------------------------------------- crime list */

  #${PANEL_ID} .ocp-scroll {
    overflow-x: auto;
  }
  #${PANEL_ID} table.ocp-table {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid #1a1a1a;
  }
  #${PANEL_ID} .ocp-table th {
    padding: 5px 6px;
    background: linear-gradient(180deg, #4e565e 0%, #303840 100%);
    font-size: 11px;
    font-weight: bold;
    text-align: center;
    vertical-align: bottom;
  }
  #${PANEL_ID} .ocp-table td {
    padding: 5px 6px;
    border-top: 1px solid rgba(0, 0, 0, 0.35);
    white-space: nowrap;
    text-align: center;
  }
  #${PANEL_ID} .ocp-payout { font-weight: bold; }
  #${PANEL_ID} tr.ocp-crime { cursor: pointer; background: #444; }
  #${PANEL_ID} tr.ocp-crime:hover { background: #4f4f4f; }
  #${PANEL_ID} tr.ocp-crime td { color: #ff7b7b !important; }
  #${PANEL_ID} tr.ocp-crime.ocp-done td { color: #6fdc8c !important; }
  #${PANEL_ID} tr.ocp-crime.ocp-waiting td { color: #c8c8c8 !important; }
  #${PANEL_ID} .ocp-caret-cell { width: 10px; font-size: 9px; }
  #${PANEL_ID} .ocp-chain {
    display: inline-block;
    margin-left: 6px;
    padding: 0 4px;
    border: 1px solid currentColor;
    border-radius: 3px;
    font-size: 10px;
  }
  #${PANEL_ID} tr.ocp-detail > td {
    padding: 6px 8px 10px 22px;
    background: #2e2e2e;
    white-space: normal;
  }
  #${PANEL_ID} .ocp-summary {
    margin: 0 0 6px;
    font-size: 11px;
    line-height: 16px;
  }
  #${PANEL_ID} .ocp-summary span + span::before {
    content: " | ";
    color: #888 !important;
  }
  #${PANEL_ID} table.ocp-players th { font-size: 10px; white-space: normal; }
  #${PANEL_ID} tr.ocp-player td { color: #ff7b7b !important; background: #3a3a3a; }
  #${PANEL_ID} tr.ocp-player.ocp-clickable { cursor: pointer; }
  #${PANEL_ID} tr.ocp-player.ocp-clickable:hover td { background: #454545; }
  #${PANEL_ID} tr.ocp-player.ocp-selected td { background: #5a4a1e; }
  #${PANEL_ID} tr.ocp-player.ocp-paid td { color: #6fdc8c !important; background: #2a2a2a; }
  #${PANEL_ID} .ocp-player-id { opacity: 0.7; }
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
