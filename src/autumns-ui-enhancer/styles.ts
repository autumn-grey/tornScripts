// Every style the script injects, in one sheet.

const STYLE_ID = "aue-styles";
export const PANEL_ID = "aue-prefs-panel";

const CSS = `

  #${PANEL_ID} {
    container-type: inline-size;
    margin: 10px 0 0;
    border-radius: 5px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    font-family: Arial, Helvetica, sans-serif;
    color: #fff;
  }
  .aue-title {
    display: block;
    box-sizing: border-box;
    width: 100%;
    border: 0;
    text-align: left;
    cursor: pointer;
    border-radius: 5px 5px 0 0;
    height: 30px;
    line-height: 30px;
    padding: 0 0 0 10px;
    background: linear-gradient(180deg, #4e565e 0%, #303840 100%);
    font-family: Arial, Helvetica, sans-serif;
    font-weight: bold;
    font-size: 12px;
    color: #fff;
    text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
  }
  .aue-body {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    background: linear-gradient(180deg, #656565 0%, #373737 100%);
  }
  @container (max-width: 620px) {
    .aue-body { grid-template-columns: repeat(2, 1fr); }
  }
  @container (max-width: 400px) {
    .aue-body { grid-template-columns: 1fr; }
  }
  @supports not (container-type: inline-size) {
    @media (max-width: 1000px) {
      .aue-body { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 700px) {
      .aue-body { grid-template-columns: 1fr; }
    }
  }
  .aue-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 12px;
    font-size: 13px;
    color: #fff;
    box-shadow:
      1px 0 0 rgba(0, 0, 0, 0.4),
      0 1px 0 rgba(0, 0, 0, 0.4);
    transition: background 0.15s;
    -webkit-tap-highlight-color: transparent;
  }
  .aue-row:hover,
  .aue-row:active,
  .aue-row:focus-within {
    background: linear-gradient(180deg, #525252 0%, #414141 100%);
  }
  .aue-label {
    line-height: 22px;
  }
  .aue-row-stack {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
  .aue-heading {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .aue-note {
    display: block;
    margin-top: -4px;
    font-size: 11px;
    line-height: 14px;
    opacity: 0.7;
  }
  .aue-footnote {
    padding: 6px 12px;
    background: linear-gradient(180deg, #3a3a3a 0%, #2e2e2e 100%);
    box-shadow: inset 0 1px 0 rgba(0, 0, 0, 0.4);
    font-size: 11px;
    line-height: 15px;
    color: #fff;
    opacity: 0.75;
  }
  .aue-switch {
    position: relative;
    display: inline-block;
    width: 42px;
    height: 22px;
    flex-shrink: 0;
    /* Only the switch: clicking it quickly should not highlight it, but the
       panel's words must stay selectable. */
    user-select: none;
  }
  .aue-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }
  .aue-switch .aue-slider {
    position: absolute;
    inset: 0;
    box-sizing: border-box;
    border: 2px solid #8c8c8c;
    border-radius: 999px;
    background: linear-gradient(180deg, #1c1c1c 0%, #0d0d0d 100%);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
    cursor: pointer;
    transition: background 0.2s, border-color 0.15s, box-shadow 0.15s;
  }
  .aue-switch .aue-slider::before {
    content: "";
    position: absolute;
    left: 2px;
    top: 2px;
    height: 14px;
    width: 14px;
    border-radius: 50%;
    background: linear-gradient(180deg, #7d7d7d 0%, #5a5a5a 100%);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    transition: transform 0.2s, background 0.15s;
  }
  .aue-switch input:checked + .aue-slider {
    background: linear-gradient(180deg, #9e9e9e 0%, #6e6e6e 100%);
  }
  .aue-switch input:checked + .aue-slider::before {
    transform: translateX(20px);
    background: linear-gradient(180deg, #4c4c4c 0%, #343434 100%);
  }
  .aue-row:hover .aue-slider,
  .aue-row:active .aue-slider,
  .aue-row:focus-within .aue-slider {
    border-color: #fff;
    background: linear-gradient(180deg, #262626 0%, #141414 100%);
    box-shadow: 0 2px 3px rgba(0, 0, 0, 0.6);
  }
  .aue-row:hover .aue-slider::before,
  .aue-row:active .aue-slider::before,
  .aue-row:focus-within .aue-slider::before {
    background: linear-gradient(180deg, #9a9a9a 0%, #6e6e6e 100%);
  }
  .aue-row:hover input:checked + .aue-slider,
  .aue-row:active input:checked + .aue-slider,
  .aue-row:focus-within input:checked + .aue-slider {
    background: linear-gradient(180deg, #ffffff 0%, #bdbdbd 100%);
  }
  .aue-row:hover input:checked + .aue-slider::before,
  .aue-row:active input:checked + .aue-slider::before,
  .aue-row:focus-within input:checked + .aue-slider::before {
    background: linear-gradient(180deg, #666666 0%, #444444 100%);
  }

  .aue-per-page {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 8px;
    margin: 0 0 6px;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    color: inherit;
  }
  .aue-per-page-status {
    font-size: 11px;
    opacity: 0.75;
    font-variant-numeric: tabular-nums;
  }
  .aue-per-page-select {
    padding: 2px 6px;
    border: 1px solid rgba(0, 0, 0, 0.5);
    border-radius: 4px;
    background: #f2f2f2;
    color: #000;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    cursor: pointer;
  }
  .aue-per-page-select option {
    background: #fff;
    color: #000;
  }

  .aue-sort {
    position: relative;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .aue-sort-mark {
    position: absolute;
    right: 3px;
    top: 50%;
    margin-top: -2px;
    width: 0;
    height: 0;
    border-left: 4px solid transparent;
    border-right: 4px solid transparent;
    border-bottom: 5px solid currentColor;
    opacity: 0;
    transition: opacity 0.15s;
    pointer-events: none;
  }
  .aue-sort-active .aue-sort-mark {
    opacity: 1;
  }
  .aue-sort:hover .aue-sort-mark {
    opacity: 0.5;
  }
  .aue-sort-active:hover .aue-sort-mark {
    opacity: 1;
  }
  .aue-sort-desc .aue-sort-mark {
    transform: rotate(180deg);
  }

  .aue-ticker-bar {
    position: relative;
  }
  .aue-ticker-bar .header-swiper-container {
    box-sizing: border-box;
    padding-right: 38px;
  }
  .aue-ticker-manual > *:not(#aue-ticker-overlay):not(#aue-ticker-nav) {
    visibility: hidden;
  }

  #aue-ticker-nav {
    position: absolute;
    right: 4px;
    top: 0;
    bottom: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .aue-ticker-arrow {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 100%;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    cursor: pointer;
    transition: color 0.15s;
    -webkit-tap-highlight-color: transparent;
  }
  .aue-ticker-arrow:hover,
  .aue-ticker-arrow:active,
  .aue-ticker-arrow:focus-visible {
    color: #fff;
  }
  .aue-ticker-arrow::before {
    content: "";
    width: 0;
    height: 0;
    border-top: 5px solid transparent;
    border-bottom: 5px solid transparent;
  }
  .aue-ticker-arrow-prev::before {
    border-right: 7px solid currentColor;
  }
  .aue-ticker-arrow-next::before {
    border-left: 7px solid currentColor;
  }

  #aue-ticker-overlay {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    right: 38px;
    z-index: 1;
    display: flex;
    align-items: center;
    overflow: hidden;
    white-space: nowrap;
  }
  #aue-ticker-overlay .aue-ticker-link {
    color: inherit;
    text-decoration: none;
  }
  #aue-ticker-overlay .aue-ticker-text {
    white-space: nowrap;
  }
  .aue-field {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  .aue-input {
    width: 166px;
    padding: 2px 6px;
    border: 1px solid rgba(0, 0, 0, 0.5);
    border-radius: 4px;
    background: #f2f2f2;
    color: #000;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
  }
  .aue-field-link {
    color: #a9d1ff;
    font-size: 11px;
    text-decoration: none;
  }
  .aue-field-link:hover {
    text-decoration: underline;
  }

  .aue-suggest {
    position: absolute;
    z-index: 60;
    top: 100%;
    left: 0;
    width: 200px;
    max-height: 190px;
    overflow-y: auto;
    border: 1px solid rgba(0, 0, 0, 0.6);
    border-radius: 4px;
    background: #2e2e2e;
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.6);
  }
  .aue-suggest-option {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 4px 8px;
    border: 0;
    background: none;
    color: #a9d1ff;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }
  .aue-suggest-option:hover,
  .aue-suggest-option:focus-visible {
    background: #414141;
  }
  .aue-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #777;
    flex-shrink: 0;
  }
  .aue-dot-on {
    background: #6ac46a;
  }

  .aue-send-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    margin: 0 0 0 10px;
    padding: 0;
    border: 0;
    background: none;
    color: #64a4ff;
    vertical-align: middle;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .aue-send-trigger svg {
    width: 15px;
    height: 15px;
  }
  .aue-send-trigger:hover,
  .aue-send-trigger:focus-visible {
    color: #fff;
  }
  .aue-send-trigger-loose {
    display: block;
    margin: 4px auto;
  }
  .aue-send {
    display: block;
    margin: 0 0 10px;
    overflow: hidden;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    text-align: left;
  }
  .aue-send[hidden] {
    display: none;
  }
  .aue-send-link {
    color: #a9d1ff;
    text-decoration: none;
  }
  .aue-send-link:hover {
    text-decoration: underline;
  }
  .aue-send-status {
    padding: 6px 8px;
    background: #111;
    color: #ccc;
    font-size: 11px;
  }
  .aue-send-frame-waiting {
    height: 0 !important;
    visibility: hidden;
  }
  .aue-chat-hidden {
    display: none !important;
  }
  /*
   * Laid out from the left, Torn's own placement is switched off and every
   * window is put where this script says. Leaving Torn to place them and
   * correcting it afterwards meant each window travelled to Torn's idea of
   * its place before being moved to ours.
   */
  .aue-chat-left > * {
    transform: none !important;
  }
  .aue-chat-instant {
    transition-duration: 0s !important;
  }
  .aue-send-frame {
    display: block;
    width: 100%;
    height: 220px;
    border: 0;
    background: transparent;
  }
  .aue-key-box {
    position: relative;
    display: inline-flex;
  }
  .aue-input.aue-key-input {
    width: 150px;
    padding-right: 36px;
  }
  .aue-key-reveal {
    position: absolute;
    top: 50%;
    right: 3px;
    transform: translateY(-50%);
    padding: 0 3px;
    border: 0;
    background: none;
    color: #555;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10px;
    cursor: pointer;
  }
  .aue-key-reveal:hover {
    color: #000;
  }
  .torn-btn.aue-key-check {
    height: 22px;
    padding: 0 8px;
    line-height: 20px;
    font-size: 12px;
  }
  .aue-key-check:not(.torn-btn) {
    padding: 2px 8px;
    border: 1px solid rgba(0, 0, 0, 0.5);
    border-radius: 4px;
    background: linear-gradient(180deg, #8a8a8a 0%, #555 100%);
    color: #fff;
    font-size: 12px;
  }
  .aue-title::after,
  .aue-section-toggle::after {
    content: "▾";
    float: right;
    margin-right: 10px;
    transition: transform 0.15s;
  }
  .aue-title[aria-expanded="false"]::after,
  .aue-section-toggle[aria-expanded="false"]::after {
    transform: rotate(-90deg);
  }
  #${PANEL_ID}.aue-collapsed .aue-title {
    border-radius: 5px;
  }
  .aue-body-api {
    border-radius: 0 0 5px 5px;
  }
  .aue-row-wide {
    grid-column: 1 / -1;
  }
  .aue-note.aue-key-note {
    margin-top: 0;
  }
  .aue-section-toggle {
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    color: #fff;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 13px;
    line-height: 22px;
    text-align: left;
    cursor: pointer;
  }
  .aue-section-toggle::after {
    margin-right: 0;
  }
  /* A long list under the pointer should not light up as one big row. */
  .aue-row.aue-stock-row:hover,
  .aue-row.aue-stock-row:active,
  .aue-row.aue-stock-row:focus-within {
    background: none;
  }
  .aue-stock-list {
    width: 100%;
  }
  .aue-stock-shop {
    margin-top: 8px;
  }
  .aue-stock-shop-name {
    margin-bottom: 4px;
    font-size: 12px;
    font-weight: bold;
  }
  .aue-stock-items {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 2px 12px;
  }
  .aue-stock-item {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    cursor: pointer;
  }
  .aue-key-field {
    flex-wrap: wrap;
    flex-shrink: 1;
  }
  /* A long error from Torn takes its own line instead of a narrow column. */
  .aue-key-result {
    flex-basis: 100%;
    font-size: 11px;
  }
  .aue-key-result:empty {
    display: none;
  }
  .aue-key-good {
    color: #9fdf6f;
  }
  .aue-key-bad {
    color: #ff8f8f;
  }
  #aue-city-shop-icon {
    list-style: none;
    /* Torn's own rule for these items paints a default sprite (a green dot). */
    background: none !important;
  }
  #aue-city-shop-icon a {
    display: block;
    width: 100%;
    height: 100%;
    background: center / contain no-repeat;
  }
  /* Matches Torn's own status icon tooltips: grey, above the icon, arrow down. */
  #aue-city-shop-tip {
    position: absolute;
    z-index: 999999;
    padding: 8px 10px;
    border-radius: 6px;
    background: #4a4a4a;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45);
    font-family: Arial, Helvetica, sans-serif;
    font-size: 13px;
    line-height: 17px;
    color: #fff;
    white-space: nowrap;
    pointer-events: none;
  }
  #aue-city-shop-tip::after {
    content: "";
    position: absolute;
    top: 100%;
    left: var(--aue-arrow-left, 50%);
    margin-left: -6px;
    border: 6px solid transparent;
    border-top-color: #4a4a4a;
  }
  #aue-city-shop-stock {
    position: absolute;
    z-index: 999999;
    padding: 6px 9px;
    border-radius: 5px;
    background: #2e2e2e;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    line-height: 16px;
    color: #fff;
    white-space: nowrap;
  }
  #aue-city-shop-stock[hidden] {
    display: none;
  }
  .aue-tip-shop + .aue-tip-shop {
    margin-top: 6px;
  }
  .aue-tip-shop a {
    color: #a9d1ff;
    font-weight: bold;
    text-decoration: none;
  }
  .aue-tip-shop a:hover {
    text-decoration: underline;
  }
  .aue-tip-item {
    display: flex;
    justify-content: space-between;
    gap: 16px;
  }
  #aue-city-shop-tip[hidden] {
    display: none;
  }
`;

/** Puts this script's stylesheet on the page. */
export function injectStyles(): void {
  document.documentElement.setAttribute("data-aue", __SCRIPT_VERSION__);
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  (document.head ?? document.documentElement).appendChild(style);
}
