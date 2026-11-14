// Every style the script injects, in one sheet.

const STYLE_ID = "doodle-styles";

const CSS = `
  /* The palette in the Notes header. */
  #doodle-icon {
    display: inline-flex;
    align-items: center;
    margin: 0 6px 0 14px;
    color: #fff !important;
    opacity: 0.9;
    cursor: pointer;
  }
  #doodle-icon:hover {
    opacity: 1;
  }
  /* Lit while drawing: white all over, glowing. A blue glow was lost on the
     blue header. */
  #doodle-icon.doodle-active {
    opacity: 1;
    filter: drop-shadow(0 0 2px #fff) drop-shadow(0 0 5px rgba(255, 255, 255, 0.8));
  }
  #doodle-icon.doodle-active svg > g {
    fill: #fff;
  }
  /* Covers the visible part of the note body; only the frames take clicks.
     Above every chat window, which Torn stacks high. */
  #doodle-layer {
    position: fixed;
    z-index: 2147483000;
    overflow: hidden;
    pointer-events: none;
  }
  #doodle-layer[hidden],
  #doodle-toolbar[hidden],
  .doodle-popup[hidden] {
    display: none !important;
  }
  .doodle-frame {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: auto;
    border: 1px solid #555;
    border-radius: 3px;
    box-sizing: border-box;
    /* Covers the marker line, even while its canvas is out in full screen. */
    background: #fff;
  }
  /* A closed drawing can be dragged to another line. */
  .doodle-frame:not(.doodle-active) {
    cursor: grab;
  }
  .doodle-frame.doodle-dragging {
    z-index: 1;
    opacity: 0.75;
    cursor: grabbing;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6);
  }
  /* Where a dragged drawing will land. */
  .doodle-drop {
    position: absolute;
    top: 0;
    left: 0;
    height: 3px;
    border-radius: 2px;
    background: #9fd3ff;
    box-shadow: 0 0 6px rgba(150, 210, 255, 0.8);
    pointer-events: none;
  }
  .doodle-drop[hidden] {
    display: none;
  }
  .doodle-frame.doodle-active {
    border: 2px solid #9fd3ff;
    box-shadow: 0 0 10px 4px rgba(150, 210, 255, 0.85);
    cursor: crosshair;
  }
  /* One more Backspace deletes this drawing. */
  .doodle-frame.doodle-armed {
    border-color: #ff5a5a;
    box-shadow: 0 0 6px 2px rgba(255, 90, 90, 0.6);
  }
  .doodle-frame canvas,
  #doodle-full canvas {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
  }
  .doodle-expand {
    display: none;
    position: absolute;
    top: 3px;
    right: 3px;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    cursor: pointer;
    align-items: center;
    justify-content: center;
  }
  .doodle-frame.doodle-active .doodle-expand {
    display: inline-flex;
  }
  #doodle-toolbar {
    position: fixed;
    z-index: 2147483001;
    box-sizing: border-box;
    padding: 6px;
    border-radius: 5px;
    background: #2e2e2e;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
    color: #fff !important;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
  }
  #doodle-toolbar * {
    color: inherit;
  }
  .doodle-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
  }
  .doodle-row + .doodle-row {
    margin-top: 4px;
  }
  .doodle-holder {
    position: relative;
    display: inline-flex;
  }
  .doodle-colour,
  .doodle-size,
  .doodle-shape {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    /* The width of the icon buttons, so the two rows line up. */
    width: 30px;
    height: 24px;
    padding: 0;
    border: 2px solid #777;
    border-radius: 4px;
    background: #1b1b1b;
    cursor: pointer;
  }
  .doodle-size span {
    display: block;
    border-radius: 50%;
    background: #fff;
  }
  .doodle-shape-icon {
    display: block;
    border: 2px solid #fff;
    box-sizing: border-box;
  }
  .doodle-shape-l { width: 18px; height: 12px; }
  .doodle-shape-p { width: 12px; height: 18px; }
  .doodle-shape-s { width: 15px; height: 15px; }
  .doodle-popup {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 1;
    padding: 6px;
    border-radius: 5px;
    background: #2e2e2e;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
  }
  .doodle-popup[data-popup="shape"] {
    display: flex;
    gap: 4px;
  }
  .doodle-shape-option {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 2px solid #555;
    border-radius: 4px;
    background: #1b1b1b;
    cursor: pointer;
  }
  .doodle-swatches {
    display: grid;
    grid-template-columns: repeat(16, 16px);
    gap: 1px;
  }
  .doodle-swatch {
    width: 16px;
    height: 16px;
    padding: 0;
    border: 0;
    cursor: pointer;
  }
  .doodle-swatch:hover {
    outline: 2px solid #fff;
    position: relative;
  }
  .doodle-popup input[type="range"] {
    width: 140px;
  }
  .doodle-on {
    outline: 2px solid #9fd3ff;
    outline-offset: 1px;
  }
  .torn-btn.doodle-btn {
    height: 24px;
    padding: 0 8px;
    font-size: 12px;
    line-height: 22px;
  }
  .torn-btn.doodle-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    padding: 0;
  }
  .doodle-status {
    margin-left: 4px;
    opacity: 0.85;
  }
  /* Full screen: the drawing and its tools centred together, the tools to
     the drawing's left on a desktop and under it on a phone. */
  #doodle-full {
    position: fixed;
    inset: 0;
    z-index: 2147483002;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 12px;
    background: rgba(0, 0, 0, 0.88);
  }
  #doodle-full .doodle-stage {
    position: relative;
    display: block;
  }
  /* Just off the drawing's top right corner. */
  .doodle-full-exit {
    position: absolute;
    top: 0;
    right: -34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.15);
    color: #fff;
    cursor: pointer;
  }
  .doodle-full-exit:hover {
    background: rgba(255, 255, 255, 0.3);
  }
  #doodle-full canvas {
    box-shadow: 0 0 8px 3px rgba(150, 210, 255, 0.55);
  }
  #doodle-toolbar.doodle-docked {
    position: relative;
    top: auto !important;
    left: auto !important;
    width: auto !important;
    max-width: calc(100vw - 32px);
    overflow: visible;
  }
  #doodle-toolbar.doodle-docked .doodle-row {
    flex-direction: column;
    flex-wrap: nowrap;
    align-items: stretch;
  }
  #doodle-toolbar.doodle-docked .doodle-popup {
    top: 0;
    left: calc(100% + 6px);
  }
  #doodle-full:has(.doodle-docked-bottom) {
    flex-direction: column-reverse;
  }
  #doodle-toolbar.doodle-docked-bottom .doodle-row {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
  }
  #doodle-toolbar.doodle-docked-bottom .doodle-popup {
    top: auto;
    bottom: calc(100% + 6px);
    left: 0;
  }
  /* The drawing as a plain picture, to press and hold and copy. */
  #doodle-picture {
    position: fixed;
    inset: 0;
    z-index: 2147483004;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    background: rgba(0, 0, 0, 0.85);
  }
  #doodle-picture img {
    max-width: 92vw;
    max-height: 80vh;
    box-shadow: 0 0 10px 4px rgba(150, 210, 255, 0.6);
    /* iOS hides its own copy menu on pictures unless told to show it. */
    -webkit-touch-callout: default;
    -webkit-user-select: auto;
    user-select: auto;
  }
  #doodle-picture p {
    margin: 0;
    color: #fff !important;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 14px;
  }
  #doodle-confirm {
    position: fixed;
    z-index: 2147483003;
    max-width: 320px;
    padding: 14px 16px;
    border-radius: 6px;
    background: #2e2e2e;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.7);
    color: #fff !important;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 13px;
  }
  #doodle-confirm p {
    margin: 0 0 10px;
    color: #fff !important;
  }
  #doodle-confirm label {
    display: block;
    margin: 0 0 10px;
    color: #fff !important;
  }
  .doodle-name {
    display: block;
    box-sizing: border-box;
    width: 240px;
    margin-top: 6px;
    padding: 4px 6px;
    border: 1px solid #777;
    border-radius: 4px;
    background: #f2f2f2;
    color: #000 !important;
    font-size: 13px;
  }
  #doodle-confirm .torn-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  #doodle-confirm .doodle-link {
    max-width: 260px;
    overflow-wrap: anywhere;
    user-select: all;
  }
  #doodle-confirm .doodle-row {
    justify-content: flex-end;
  }
`;

/** Adds the script's styles to the page, once. */
export function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  (document.head ?? document.documentElement).appendChild(style);
}
