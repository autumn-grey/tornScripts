// Every style the script injects, in one sheet.

import { ICON_ID, PANEL_ID } from "./panel";

const STYLE_ID = "anb-styles";

// Torn colours divs and spans dark with rules that outrank a colour on the
// panel, so text colour is forced with !important to stay readable.
const CSS = `
  #${ICON_ID} {
    display: inline-flex;
    align-items: center;
    margin: 0 6px 0 14px;
    opacity: 0.9;
    cursor: pointer;
  }
  #${ICON_ID}:hover {
    opacity: 1;
  }
  #${PANEL_ID} {
    position: fixed;
    inset: 0;
    z-index: 2147483100;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    color: #fff !important;
  }
  #${PANEL_ID}[hidden] {
    display: none;
  }
  #${PANEL_ID} .anb-box * {
    color: inherit !important;
  }
  #${PANEL_ID} .anb-box {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    width: min(960px, calc(100vw - 32px));
    height: min(600px, calc(100vh - 32px));
    background: #2e2e2e;
    border: 1px solid #555;
    border-radius: 5px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
    overflow: hidden;
  }
  #${PANEL_ID} .anb-head,
  #${PANEL_ID} .anb-foot {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: linear-gradient(180deg, #4e565e 0%, #303840 100%);
  }
  #${PANEL_ID} .anb-foot {
    justify-content: flex-end;
  }
  #${PANEL_ID} .anb-heading {
    flex: 1;
    font-weight: bold;
    font-size: 13px;
    text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
  }
  #${PANEL_ID} .torn-btn.anb-btn {
    height: 28px;
    line-height: 28px;
    padding: 0 12px;
  }
  #${PANEL_ID} .anb-main {
    flex: 1;
    display: grid;
    grid-template-columns: 220px 220px 1fr;
    min-height: 0;
  }
  #${PANEL_ID} .anb-list {
    overflow-y: auto;
    border-right: 1px solid #444;
  }
  #${PANEL_ID} .anb-row {
    padding: 6px 10px;
    border-bottom: 1px solid #3a3a3a;
    cursor: pointer;
  }
  #${PANEL_ID} .anb-row:hover {
    background: #383838;
  }
  #${PANEL_ID} .anb-row.anb-chosen {
    background: #44515c;
  }
  #${PANEL_ID} .anb-row-title {
    font-weight: bold;
    overflow-wrap: anywhere;
  }
  #${PANEL_ID} .anb-row-meta {
    margin-top: 2px;
    color: #bbb !important;
  }
  #${PANEL_ID} .anb-tag {
    margin-top: 3px;
    color: #f0b35a !important;
  }
  #${PANEL_ID} .anb-empty {
    padding: 10px;
    color: #bbb !important;
  }
  #${PANEL_ID} .anb-preview {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 10px;
    border: 0;
    resize: none;
    background: #262626;
    color: #fff !important;
    font: 13px/1.4 Arial, Helvetica, sans-serif;
    white-space: pre-wrap;
  }
  /* Torn's mobile layout: the columns stack. */
  @media (max-width: 784px) {
    #${PANEL_ID} .anb-main {
      grid-template-columns: 1fr;
      grid-template-rows: 1fr 1fr 2fr;
    }
    #${PANEL_ID} .anb-list {
      border-right: 0;
      border-bottom: 1px solid #444;
    }
  }
`;

/** Adds the style sheet once. */
export function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.append(style);
}
