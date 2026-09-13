const STYLE_ID = "stf-styles";

export const PANEL_ID = "stf-panel";

/** Put on the panel while it is showing its title bar only. */
export const COLLAPSED_CLASS = "stf-collapsed";

/** Put on the max button beside a quantity box. */
export const MAX_BUTTON_CLASS = "stf-max";

/** Put on the wrapper the max button hangs off the left of. */
export const QTY_WRAP_CLASS = "stf-qty-wrap";

/** Put on a row whose price column holds a max button. */
export const HAS_MAX_CLASS = "stf-has-max";

/** Put on a row whose item is on the source spreadsheet. */
export const ON_SHEET_CLASS = "stf-on-sheet";

const CSS = `
  /* ------------------------------------------------------ source panel */

  #${PANEL_ID} {
    margin: 0 0 10px;
    border-radius: 5px;
    overflow: hidden;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    font-family: Arial, Helvetica, sans-serif;
    color: #fff;
  }
  .stf-title {
    display: flex;
    align-items: center;
    gap: 7px;
    cursor: pointer;
    user-select: none;
    height: 30px;
    line-height: 30px;
    padding: 0 0 0 10px;
    background: linear-gradient(180deg, #4e565e 0%, #303840 100%);
    font-weight: bold;
    font-size: 12px;
    color: #fff;
    text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
  }
  .stf-caret {
    font-size: 10px;
    line-height: 1;
    transition: transform 0.15s ease;
  }
  .${COLLAPSED_CLASS} .stf-caret {
    transform: rotate(-90deg);
  }
  .${COLLAPSED_CLASS} .stf-body {
    display: none;
  }
  .stf-body {
    background: linear-gradient(180deg, #656565 0%, #373737 100%);
    padding: 10px 12px;
  }
  .stf-field-label {
    display: block;
    margin: 0 0 5px;
    font-size: 13px;
    line-height: 18px;
    color: #fff;
  }
  .stf-text-input {
    box-sizing: border-box;
    width: 100%;
    max-width: 560px;
    padding: 4px 7px;
    border: 1px solid rgba(0, 0, 0, 0.5);
    border-radius: 4px;
    background: #f2f2f2;
    color: #000;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    line-height: 18px;
  }
  .stf-text-input:focus {
    outline: none;
    border-color: #fff;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.6);
  }
  .stf-status {
    margin: 4px 0 0;
    font-size: 11px;
    line-height: 15px;
    font-weight: bold;
    text-shadow: 0 1px 1px rgba(0, 0, 0, 0.6);
  }
  .stf-status-ok      { color: #5ed17c; }
  .stf-status-error   { color: #ff6b6b; }
  .stf-status-working { color: #d6d6d6; font-weight: normal; }
  .stf-hint {
    margin: 4px 0 0;
    font-size: 11px;
    line-height: 15px;
    color: #d0d0d0;
  }

  /* -------------------------------------------------------- max button */

  /* Paint, font and border come from Torn's own torn-btn; only the size is
     ours, because a full-size button does not fit the row. */
  .${MAX_BUTTON_CLASS} {
    box-sizing: border-box;
    width: auto;
    min-width: 0;
    height: 22px;
    line-height: 20px;
    margin: 0;
    padding: 0 7px;
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
  }

  /* Other scripts write their own price text into this column and position
     it against the right edge, where the button now is. */
  .${HAS_MAX_CLASS} .tt-item-price {
    margin-right: 48px;
  }

  /* Against the left edge of the quantity box, centred on it. */
  .${QTY_WRAP_CLASS} {
    position: relative;
  }
  .${QTY_WRAP_CLASS} > .${MAX_BUTTON_CLASS} {
    position: absolute;
    right: 100%;
    top: 50%;
    transform: translateY(-50%);
    margin-right: 2px;
  }
  /* Only when Torn's own button styling is not there to be borrowed. */
  .${MAX_BUTTON_CLASS}:not(.torn-btn) {
    border: 1px solid #1c2228;
    border-radius: 3px;
    background: linear-gradient(180deg, #5b646d 0%, #333b43 100%);
    color: #fff;
    font-family: "Fjalla One", "Arial Narrow", Arial, sans-serif;
    text-transform: uppercase;
    text-shadow: 0 1px 1px rgba(0, 0, 0, 0.6);
  }

  /* ---------------------------------------------------- on-sheet outline */

  .${ON_SHEET_CLASS} {
    outline: 1px solid #3fbf5f !important;
    outline-offset: -1px !important;
    border-radius: 5px;
    background-color: rgba(40, 150, 70, 0.13);
    box-shadow: 0 0 4px rgba(63, 191, 95, 0.3);
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
