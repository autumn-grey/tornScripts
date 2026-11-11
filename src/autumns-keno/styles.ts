// Every style the script injects, in one sheet.

const STYLE_ID = "akn-styles";
export const PANEL_ID = "akn-panel";

const CSS = `
  #boardContainer [data-akn-heat],
  #boardContainer [data-akn-top] {
    position: relative;
  }
  #boardContainer [data-akn-heat]::after,
  #boardContainer [data-akn-top]::after {
    content: "";
    position: absolute;
    inset: 1px;
    border-radius: 3px;
    background: var(--akn-heat, transparent);
    pointer-events: none;
  }
  /* Drawn on the overlay rather than the cell, so the shading cannot cover it. */
  #boardContainer [data-akn-top]::after {
    box-shadow: inset 0 0 0 3px #ff1a1a;
  }
  #${PANEL_ID} {
    clear: both;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
    margin: 10px 0 0;
    padding: 8px 10px;
    border-radius: 5px;
    background: linear-gradient(180deg, #4a4a4a 0%, #2e2e2e 100%);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    font-family: Arial, Helvetica, sans-serif;
  }
  /* Torn's own rules colour, size and float spans, which turned the text black
     and stacked it; force what that touches. Tone classes keep the id prefix
     and come after so they still win. */
  #${PANEL_ID},
  #${PANEL_ID} span {
    color: #fff !important;
    float: none !important;
    height: auto !important;
    line-height: 22px !important;
    font-size: 12px !important;
  }
  #${PANEL_ID} span.akn-good { color: #9fdf6f !important; }
  #${PANEL_ID} span.akn-warn { color: #f0c674 !important; }
  #${PANEL_ID} span.akn-bad { color: #ff8f8f !important; }
  #${PANEL_ID} .akn-hidden { display: none !important; }
  .akn-control {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .akn-link {
    cursor: pointer;
    text-decoration: underline dotted;
  }
  .akn-url-box {
    position: relative;
    display: inline-flex;
  }
  .akn-url {
    width: 200px;
    padding: 2px 40px 2px 6px;
    border: 1px solid rgba(0, 0, 0, 0.5);
    border-radius: 4px;
    background: #f2f2f2;
    color: #000;
    font-size: 12px;
  }
  .akn-reveal {
    position: absolute;
    top: 50%;
    right: 3px;
    transform: translateY(-50%);
    padding: 0 3px;
    border: 0;
    background: none;
    color: #555;
    font-size: 10px;
    cursor: pointer;
  }
  .akn-reveal:hover {
    color: #000;
  }
  .torn-btn.akn-btn {
    height: 22px;
    padding: 0 8px;
    line-height: 20px;
    font-size: 12px;
  }
  .torn-btn.akn-btn.akn-active {
    outline: 2px solid #9fdf6f;
    outline-offset: -2px;
  }
`;

/** Adds the stylesheet once. */
export function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
