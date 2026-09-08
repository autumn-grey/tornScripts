// Every style the script injects, in one sheet.
//
// The preferences panel borrows Torn's own panel-title gradient for its
// header and the OC Travel Guard's grey module gradient for its body, so
// the two scripts read as one set.

const STYLE_ID = "aue-styles";
export const PANEL_ID = "aue-prefs-panel";

const CSS = `
  /* ------------------------------------------------ preferences panel */

  /* Sits directly under the main preferences panel and inherits its width,
     so the two read as one stack. The columns below size themselves against
     this box rather than the viewport, so the panel lays itself out
     correctly whatever Torn does with the page around it. */
  #${PANEL_ID} {
    container-type: inline-size;
    margin: 10px 0 0;
    border-radius: 5px;
    overflow: hidden;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    font-family: Arial, Helvetica, sans-serif;
    color: #fff;
  }
  /* Torn's own panel-title bar: blue-grey, lighter at the top. */
  .aue-title {
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
  /* Three toggles to a line. The gradient is on the body rather than the
     cells, so it stays one continuous fill however the grid reflows. */
  .aue-body {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    background: linear-gradient(180deg, #656565 0%, #373737 100%);
  }
  /* Narrower panel, fewer columns, so a label never has to be cropped. */
  @container (max-width: 620px) {
    .aue-body { grid-template-columns: repeat(2, 1fr); }
  }
  @container (max-width: 400px) {
    .aue-body { grid-template-columns: 1fr; }
  }
  /* For anything without container queries - the same steps, read off the
     viewport instead, which is close enough on Torn's fixed-width layout. */
  @supports not (container-type: inline-size) {
    @media (max-width: 1000px) {
      .aue-body { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 700px) {
      .aue-body { grid-template-columns: 1fr; }
    }
  }
  /* Seams are drawn to the right of and below every cell; the panel's own
     overflow clips the ones that land on its outside edges, so this needs
     no per-column or per-row arithmetic. */
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
    user-select: none;
  }
  /* Highlights the row on hover, press, or keyboard focus. */
  .aue-row:hover,
  .aue-row:active,
  .aue-row:focus-within {
    background: linear-gradient(180deg, #525252 0%, #414141 100%);
  }
  /* Down to one column a long label wraps rather than being cropped. The
     line height matches the switch so the first line still sits level with
     it, and the switch stays pinned to that top line. */
  .aue-label {
    line-height: 22px;
  }
  .aue-switch {
    position: relative;
    display: inline-block;
    width: 42px;
    height: 22px;
    flex-shrink: 0;
  }
  .aue-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }
  /* Off state: near-black track, mid-grey knob on the left. */
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
  /* On state: filled track, dark knob slid to the right. */
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

  /* ------------------------------------------- items-per-page control */

  /* Sits above the top right of the list it controls. The text colour is
     inherited so it reads correctly in both of Torn's themes; only the
     select carries a colour of its own. */
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
    background: linear-gradient(180deg, #4e565e 0%, #303840 100%);
    color: #fff;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    cursor: pointer;
  }
`;

export function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  (document.head ?? document.documentElement).appendChild(style);
}
