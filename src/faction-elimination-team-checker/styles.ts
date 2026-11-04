const STYLE_ID = "et-styles";

export const PANEL_ID = "et-panel";

/** Put on the panel while it is showing its title bar only. */
export const COLLAPSED_CLASS = "et-collapsed";

/** Put on a team badge whose team is out of the competition. */
export const ELIMINATED_CLASS = "et-eliminated";

/** Put on a team badge for someone who is no longer on their team. */
export const LEFT_CLASS = "et-left";

const CSS = `
  #${PANEL_ID} {
    margin: 0 0 10px;
    border-radius: 5px;
    overflow: hidden;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    font-family: Arial, Helvetica, sans-serif;
    color: #fff;
  }
  .et-title {
    display: flex;
    align-items: center;
    gap: 7px;
    cursor: pointer;
    user-select: none;
    height: 30px;
    line-height: 30px;
    padding: 0 10px;
    background: linear-gradient(180deg, #4e565e 0%, #303840 100%);
    font-weight: bold;
    font-size: 12px;
    color: #fff;
    text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
  }
  .et-caret {
    font-size: 10px;
    line-height: 1;
    transition: transform 0.15s ease;
  }
  .${COLLAPSED_CLASS} .et-caret {
    transform: rotate(-90deg);
  }
  .${COLLAPSED_CLASS} .et-body {
    display: none;
  }
  .et-count {
    margin-left: auto;
    font-weight: normal;
    font-size: 11px;
    color: #cfcfcf;
  }
  .et-body {
    background: linear-gradient(180deg, #656565 0%, #373737 100%);
    padding: 10px 12px;
  }

  /* ------------------------------------------------------------ key field */

  .et-field-label {
    display: block;
    margin: 0 0 5px;
    font-size: 13px;
    line-height: 18px;
    color: #fff;
  }
  .et-key-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .et-key-field {
    position: relative;
    display: flex;
    align-items: center;
    flex: 1 1 260px;
    min-width: 0;
    max-width: 420px;
  }
  .et-text-input {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    padding: 4px 28px 4px 7px;
    border: 1px solid rgba(0, 0, 0, 0.5);
    border-radius: 4px;
    background: #f2f2f2;
    color: #000;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    line-height: 18px;
  }
  .et-text-input:focus {
    outline: none;
    border-color: #fff;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.6);
  }
  .et-eye {
    position: absolute;
    right: 5px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border: 0;
    border-radius: 3px;
    background: none;
    color: #555;
    cursor: pointer;
  }
  .et-eye:hover {
    color: #000;
  }
  .et-eye:focus-visible {
    outline: 1px solid #4a90d9;
  }
  .et-eye svg {
    width: 15px;
    height: 15px;
    display: block;
  }
  /* Paint, font and border come from Torn's own torn-btn; only the size is
     ours, because a full-size button crowds the field. */
  .et-button {
    box-sizing: border-box;
    width: auto;
    min-width: 0;
    height: 24px;
    line-height: 22px;
    margin: 0;
    padding: 0 10px;
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
  }
  .et-button:not(.torn-btn) {
    border: 1px solid #1c2228;
    border-radius: 3px;
    background: linear-gradient(180deg, #5b646d 0%, #333b43 100%);
    color: #fff;
    font-family: "Fjalla One", "Arial Narrow", Arial, sans-serif;
    text-transform: uppercase;
    text-shadow: 0 1px 1px rgba(0, 0, 0, 0.6);
  }
  .et-button[disabled] {
    opacity: 0.5;
    cursor: default;
  }
  .et-status {
    margin: 5px 0 0;
    font-size: 11px;
    line-height: 15px;
    font-weight: bold;
    text-shadow: 0 1px 1px rgba(0, 0, 0, 0.6);
  }
  .et-status-ok      { color: #5ed17c; }
  .et-status-error   { color: #ff6b6b; }
  .et-status-working { color: #d6d6d6; font-weight: normal; }
  .et-hint {
    margin: 4px 0 0;
    font-size: 11px;
    line-height: 15px;
    color: #d0d0d0;
  }

  /* ---------------------------------------------------------- member list */

  .et-table {
    margin: 10px 0 0;
    border: 1px solid #1a1a1a;
    border-radius: 5px;
    overflow: hidden;
  }
  .et-head {
    display: flex;
    background: linear-gradient(180deg, #4e565e 0%, #303840 100%);
  }
  .et-head-cell {
    flex: 1 1 50%;
    padding: 0 10px;
    height: 26px;
    line-height: 26px;
    font-size: 11px;
    font-weight: bold;
    color: #fff;
    text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .et-head-cell:hover {
    color: #8ecfff;
  }
  .et-arrow {
    margin-left: 4px;
    font-size: 9px;
  }
  .et-row {
    display: flex;
    align-items: center;
    min-height: 30px;
    border-top: 1px solid rgba(0, 0, 0, 0.35);
    background: #4a4a4a;
  }
  .et-row:nth-child(even) {
    background: #414141;
  }
  .et-cell {
    flex: 1 1 50%;
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    padding: 4px 10px;
    font-size: 12px;
    color: #eee;
  }
  .et-cell a {
    color: #a3d2ff;
    text-decoration: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .et-cell a:hover {
    text-decoration: underline;
  }
  .et-badge {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 26px;
    height: 26px;
  }
  .et-badge img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }
  .${ELIMINATED_CLASS} img {
    filter: grayscale(1);
    opacity: 0.55;
  }
  .${ELIMINATED_CLASS} + .et-team-name {
    color: #9a9a9a;
  }
  .${LEFT_CLASS} img {
    filter: grayscale(1);
    opacity: 0.45;
  }
  /* The two bars of the cross, drawn over whatever the badge holds. */
  .${LEFT_CLASS}::before,
  .${LEFT_CLASS}::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 50%;
    width: 130%;
    height: 2px;
    margin-left: -65%;
    background: #e03131;
    box-shadow: 0 0 2px rgba(0, 0, 0, 0.8);
  }
  .${LEFT_CLASS}::before { transform: rotate(45deg); }
  .${LEFT_CLASS}::after  { transform: rotate(-45deg); }
  .et-no-team {
    width: 20px;
    height: 20px;
    border: 1px dashed #8d8d8d;
    border-radius: 3px;
  }
  .et-team-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .et-empty {
    padding: 10px;
    font-size: 12px;
    color: #d0d0d0;
    background: #454545;
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
