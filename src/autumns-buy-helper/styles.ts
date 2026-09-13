// Every style the script injects, in one sheet.
//
// The settings panel deliberately matches Autumn's UI Enhancer: Torn's own
// panel-title gradient on the header, the grey module gradient on the body,
// so a user running both sees one consistent set rather than two skins.

const STYLE_ID = "abh-styles";
export const PANEL_ID = "abh-prefs-panel";

/** Put on a listing that is at or under the buy price. */
export const GOOD_BUY_CLASS = "abh-good-buy";

const CSS = `
  /* ---------------------------------------------------- settings panel */

  /* Sits under the main preferences panel and inherits its width, so the
     two read as one stack. */
  #${PANEL_ID} {
    margin: 10px 0 0;
    border-radius: 5px;
    overflow: hidden;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    font-family: Arial, Helvetica, sans-serif;
    color: #fff;
  }
  /* Torn's own panel-title bar: blue-grey, lighter at the top. */
  .abh-title {
    height: 30px;
    line-height: 30px;
    padding: 0 0 0 10px;
    background: linear-gradient(180deg, #4e565e 0%, #303840 100%);
    font-weight: bold;
    font-size: 12px;
    color: #fff;
    text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
  }
  /* The gradient sits on the body rather than on each field, so it stays
     one continuous fill however many settings end up in here. */
  .abh-body {
    background: linear-gradient(180deg, #656565 0%, #373737 100%);
    padding: 10px 12px;
  }
  .abh-field + .abh-field {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid rgba(0, 0, 0, 0.4);
  }
  .abh-field-label {
    display: block;
    margin: 0 0 5px;
    font-size: 13px;
    line-height: 18px;
    color: #fff;
  }
  /* Plain and readable rather than themed - same reasoning as the UI
     Enhancer's dropdown: the browser draws its own chrome around inputs. */
  .abh-text-input {
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
  .abh-text-input:focus {
    outline: none;
    border-color: #fff;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.6);
  }
  /* Under the input, and always present once a check has run, so the field
     does not jump around as the message changes. */
  .abh-status {
    margin: 4px 0 0;
    font-size: 11px;
    line-height: 15px;
    font-weight: bold;
    text-shadow: 0 1px 1px rgba(0, 0, 0, 0.6);
  }
  .abh-status-ok      { color: #5ed17c; }
  .abh-status-error   { color: #ff6b6b; }
  /* Neutral, for the moment between pressing enter and Google answering. */
  .abh-status-working { color: #d6d6d6; font-weight: normal; }
  /* The hint under a setting, explaining what it wants. */
  .abh-hint {
    margin: 4px 0 0;
    font-size: 11px;
    line-height: 15px;
    color: #d0d0d0;
  }

  /* --------------------------------------------- percentage input box */

  /* The % sits inside the box rather than beside it, so it reads as part of
     the value. The input is padded out of its way, and the sign ignores
     clicks so tapping it still puts the cursor in the box. */
  .abh-percent {
    position: relative;
    display: inline-block;
  }
  .abh-percent .abh-percent-sign {
    position: absolute;
    left: 7px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 12px;
    line-height: 1;
    color: #555;
    pointer-events: none;
  }
  .abh-percent .abh-text-input {
    width: 90px;
    padding-left: 20px;
  }
  /* Torn's pages are narrow enough that the spinner arrows crowd the value,
     and the number is easier to type than to click up to anyway. */
  .abh-percent .abh-text-input::-webkit-outer-spin-button,
  .abh-percent .abh-text-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .abh-percent .abh-text-input {
    -moz-appearance: textfield;
    appearance: textfield;
  }

  /* ----------------------------------------------- worth-buying outline */

  /* An outline rather than a border: it is drawn outside the box model, so
     nothing on Torn's page shifts by two pixels when a listing lights up.
     Pulled inwards so it lands on the edge of the listing rather than in the
     gap beside it, and !important because Torn's own styles are heavy
     handed about outlines on the things it draws. */
  .${GOOD_BUY_CLASS} {
    outline: 2px solid #3fbf5f !important;
    outline-offset: -2px !important;
    border-radius: 5px;
    background-color: rgba(40, 150, 70, 0.13);
    box-shadow: 0 0 6px rgba(63, 191, 95, 0.45);
  }
`;

export function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  (document.head ?? document.documentElement).appendChild(style);
}
