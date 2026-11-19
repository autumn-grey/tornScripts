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
  #doodle-toolbar .doodle-row[hidden],
  #doodle-toolbar .doodle-holder[hidden],
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
  /* A hidden options row above leaves no gap behind it. */
  .doodle-row:not([hidden]) ~ .doodle-row {
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
    /* Above the top bar of tool options, which sits at 2. */
    z-index: 3;
    padding: 6px;
    border-radius: 5px;
    background: #2e2e2e;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
  }
  .doodle-popup[data-popup="shape"] {
    display: flex;
    gap: 4px;
  }
  .doodle-popup[data-popup="lasso"] {
    display: flex;
    gap: 4px;
  }
  /* Splits the lasso's ways of selecting from what it does with a selection. */
  .doodle-popup-gap {
    align-self: stretch;
    width: 1px;
    margin: 0 2px;
    background: #555;
  }
  .doodle-popup[data-popup="smooth"],
  .doodle-popup[data-popup="tip"] {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .doodle-popup .torn-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  /* The hardness slider, stood on end with its maximum at the top. Turned
     rather than made vertical, which browsers do in ways of their own. */
  .doodle-slider.doodle-vertical {
    position: relative;
    width: 34px;
  }
  /* Just smaller than the marker, so its blue rim still shows. */
  .doodle-hard-dot {
    position: absolute;
    left: 50%;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }
  .doodle-vertical .doodle-range {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-90deg);
  }
  /* The marching ants, over the open drawing. */
  .doodle-frame canvas.doodle-ants,
  #doodle-full canvas.doodle-ants {
    position: absolute;
    pointer-events: none;
    box-shadow: none;
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
  /* The sliders, drawn here rather than left to the browser so the marker is
     the same blue and size everywhere: the brush preview is placed over it by
     sum, so its 18px must match THUMB_SIZE in doodles.ts. Tall enough for the
     largest brush's ring. The popup round a slider is its own box, so the
     preview is placed from its edge. Each browser's parts in a rule of its
     own, as one it does not know voids the whole rule. */
  .doodle-range {
    -webkit-appearance: none;
    appearance: none;
    display: block;
    height: 34px;
    margin: 0;
    padding: 0;
    background: transparent;
    cursor: pointer;
    --doodle-fill: #0075ff;
  }
  .doodle-range::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 2px;
    background: #777;
  }
  .doodle-range::-moz-range-track {
    height: 4px;
    border-radius: 2px;
    background: #777;
  }
  .doodle-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 18px;
    height: 18px;
    margin-top: -7px;
    border: 0;
    border-radius: 50%;
    background: var(--doodle-fill);
    box-shadow: inset 0 0 0 2px #0075ff;
  }
  .doodle-range::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border: 0;
    border-radius: 50%;
    background: var(--doodle-fill);
    box-shadow: inset 0 0 0 2px #0075ff;
  }
  /* The brush at its true size over the marker: a dot, or a ring once it is
     bigger. The faint halo keeps a dark ring seen on the dark popup. */
  .doodle-brush {
    position: absolute;
    top: 50%;
    box-sizing: border-box;
    border: 0 solid transparent;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }
  .doodle-brush.doodle-brush-ring {
    border-width: 2px;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.35);
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
  /* A message just under the open drawing. Torn sets text black in notes. */
  .doodle-status {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 2;
    padding: 2px 6px;
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.8);
    color: #fff !important;
    font-size: 12px;
    line-height: 16px;
    white-space: nowrap;
    pointer-events: none;
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
  /* A landscape drawing fills the width, so the button sits above its corner instead. */
  .doodle-exit-above .doodle-full-exit {
    top: -34px;
    right: 0;
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
  /* Only the toolbar's own rows: rows inside its pop-ups, like the layers
     panel's buttons, keep running across. */
  #doodle-toolbar.doodle-docked > .doodle-row {
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
  #doodle-toolbar.doodle-docked-bottom > .doodle-row {
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
  /* See-through, with no background: a chequerboard under the drawing. */
  .doodle-frame canvas.doodle-see-through,
  #doodle-full canvas.doodle-see-through,
  .doodle-thumb {
    background: repeating-conic-gradient(#d6d6d6 0% 25%, #fff 0% 50%) 50% / 10px 10px;
  }
  /* A menu fixed to the screen beside its button, over everything. */
  .doodle-float {
    position: fixed;
    z-index: 2147483005;
    padding: 6px;
    border-radius: 5px;
    background: #2e2e2e;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.7);
  }
  .doodle-float[hidden] {
    display: none !important;
  }

  /* Choosing a colour. Its own width, whatever it hangs off: beside the
     narrow side toolbar in full screen, a pop-up is otherwise squeezed to
     the width of the button it opens from. */
  .doodle-chooser {
    width: max-content;
  }
  .doodle-chooser-top {
    display: flex;
    align-items: center;
    gap: 1px;
    margin-bottom: 5px;
  }
  .doodle-recent {
    display: flex;
    gap: 1px;
  }
  .doodle-chooser-gap {
    flex: 1;
    min-width: 8px;
  }
  .doodle-chooser-btn {
    width: 22px;
    height: 16px;
    margin-left: 4px;
    padding: 0;
    border: 1px solid #777;
    border-radius: 3px;
    cursor: pointer;
  }
  /* Four squares of colour, like the swatches it goes back to. */
  .doodle-swatches-btn {
    background: conic-gradient(#e53935 0 25%, #fdd835 0 50%, #1e88e5 0 75%, #43a047 0);
  }
  .doodle-custom-btn {
    background: conic-gradient(red, yellow, lime, cyan, blue, magenta, red);
  }
  .doodle-gradient-btn {
    background: linear-gradient(90deg, #000, #fff);
  }
  .doodle-chooser-btn.doodle-on {
    outline: 2px solid #9fd3ff;
    outline-offset: 1px;
  }
  /* No colour: white, crossed through in red from top right to bottom left. */
  .doodle-none,
  .doodle-bg-btn.doodle-none {
    background:
      linear-gradient(to bottom right, transparent calc(50% - 1px), #e00 calc(50% - 1px),
        #e00 calc(50% + 1px), transparent calc(50% + 1px)),
      #fff !important;
  }
  .doodle-chooser [hidden] {
    display: none !important;
  }
  .doodle-picker {
    display: flex;
    gap: 10px;
    padding: 2px 8px;
  }
  .doodle-picker-square,
  .doodle-picker-strip {
    position: relative;
    line-height: 0;
  }
  .doodle-picker canvas {
    display: block;
    cursor: crosshair;
    touch-action: none;
  }
  .doodle-picker-ring {
    position: absolute;
    width: 10px;
    height: 10px;
    border: 2px solid #fff;
    border-radius: 50%;
    box-shadow: 0 0 0 1px #000, inset 0 0 0 1px #000;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }
  /* A white arrow either side of the strip, pointing in at the hue. */
  .doodle-picker-arrows {
    position: absolute;
    left: -7px;
    right: -7px;
    height: 0;
    pointer-events: none;
  }
  .doodle-picker-arrows::before,
  .doodle-picker-arrows::after {
    content: "";
    position: absolute;
    top: -5px;
    border: 5px solid transparent;
    filter: drop-shadow(0 0 1px #000);
  }
  .doodle-picker-arrows::before {
    left: 0;
    border-left: 6px solid #fff;
    border-right-width: 0;
  }
  .doodle-picker-arrows::after {
    right: 0;
    border-right: 6px solid #fff;
    border-left-width: 0;
  }

  /* The gradient editor. */
  .doodle-gradient {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }
  .doodle-gradient-layout {
    display: block;
    border: 1px solid #777;
    touch-action: none;
    cursor: move;
    background: repeating-conic-gradient(#d6d6d6 0% 25%, #fff 0% 50%) 50% / 10px 10px;
  }
  .doodle-gradient-bar {
    position: relative;
    padding-bottom: 12px;
    line-height: 0;
  }
  .doodle-gradient-bar canvas {
    display: block;
    border: 1px solid #777;
    cursor: copy;
    touch-action: none;
    background: repeating-conic-gradient(#d6d6d6 0% 25%, #fff 0% 50%) 50% / 8px 8px;
  }
  .doodle-gradient-markers {
    position: absolute;
    left: 1px;
    right: 1px;
    bottom: 0;
    height: 12px;
  }
  .doodle-gradient-marker {
    position: absolute;
    top: 1px;
    width: 9px;
    height: 9px;
    border: 1px solid #fff;
    box-shadow: 0 0 0 1px #000;
    transform: translateX(-50%);
    cursor: ew-resize;
    touch-action: none;
  }
  .doodle-gradient-marker.doodle-on {
    outline: 2px solid #9fd3ff;
    outline-offset: 1px;
  }
  .doodle-gradient-alpha {
    width: 180px;
  }
  .doodle-swatch.doodle-gradient-swatch {
    width: 22px;
    border: 1px solid #777;
  }

  /* The gradient editor is tall; on a short screen its pop-up scrolls. */
  .doodle-popup[data-popup="colour"] {
    max-height: calc(100vh - 120px);
    overflow-y: auto;
  }
  /* The text being typed: its letters see-through, as the drawing shows them.
     It takes no presses, so its handles under it can be dragged. */
  .doodle-frame .doodle-text-input,
  #doodle-full .doodle-text-input {
    position: absolute;
    z-index: 2;
    box-sizing: content-box;
    margin: 0;
    padding: 0;
    border: 0 !important;
    outline: none !important;
    background: transparent !important;
    box-shadow: none !important;
    color: transparent !important;
    -webkit-text-fill-color: transparent;
    letter-spacing: normal;
    text-transform: none;
    white-space: pre;
    overflow: hidden;
    resize: none;
    pointer-events: none;
  }
  /* The font and size boxes, in the colour buttons' dark style. */
  #doodle-toolbar .doodle-font-select,
  #doodle-toolbar .doodle-text-size {
    box-sizing: border-box;
    height: 24px;
    margin: 0;
    border: 2px solid #777;
    border-radius: 4px;
    background: #1b1b1b;
    color: #fff !important;
    font-size: 13px;
  }
  #doodle-toolbar .doodle-font-select {
    width: 128px;
    padding: 0 2px;
    cursor: pointer;
  }
  #doodle-toolbar .doodle-font-select option {
    background: #1b1b1b;
    color: #fff !important;
    font-size: 14px;
  }
  #doodle-toolbar .doodle-text-size {
    width: 52px;
    padding: 0 4px;
  }
  .torn-btn.doodle-style-btn[data-style="bold"] {
    font-weight: bold;
  }
  .torn-btn.doodle-style-btn[data-style="italic"] {
    font-style: italic;
    font-family: Georgia, serif;
  }
  .torn-btn.doodle-style-btn[data-style="underline"] {
    text-decoration: underline;
  }
  /* A hollow square in the outline's colour; faded while the outline is off. */
  .doodle-outline-btn span {
    box-sizing: border-box;
    width: 16px;
    height: 14px;
    border: 3px solid #fff;
    border-radius: 2px;
    opacity: 0.4;
  }
  .doodle-outline-btn.doodle-on span {
    opacity: 1;
  }
  /* The tool's own options, in a bar along the drawing's top edge. */
  #doodle-toolbar .doodle-top-bar {
    position: fixed;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 5px;
    border-radius: 5px;
    background: #2e2e2e;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
  }
  /* Its items too: Torn's button style would otherwise show a hidden one. */
  #doodle-toolbar .doodle-top-bar[hidden],
  #doodle-toolbar .doodle-top-bar > [hidden] {
    display: none !important;
  }
  /* The ask for a gradient's path, standing in for the tool's options. */
  #doodle-toolbar .doodle-path-prompt {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-left: 4px;
    color: #fff !important;
    font-size: 13px;
  }
  /* Its pop-ups open down over the drawing, wherever the toolbar's open. */
  #doodle-toolbar .doodle-top-bar > .doodle-holder > .doodle-popup {
    top: calc(100% + 4px);
    bottom: auto;
    left: 0;
  }
  .doodle-outline-box {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }
  .doodle-slider-label {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #fff !important;
    font-size: 12px;
  }
  .doodle-slider-label .doodle-range {
    width: 140px;
  }
  /* The paint bucket's one setting. */
  .doodle-popup[data-popup="bucket"] {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .doodle-popup[data-popup="bucket"] .torn-btn {
    white-space: nowrap;
  }

  /* The layers panel: open to the left of its button, which sits at the
     right end of its row. */
  .doodle-popup[data-popup="layers"] {
    left: auto;
    right: 0;
    width: 270px;
  }
  #doodle-toolbar.doodle-docked:not(.doodle-docked-bottom) .doodle-popup[data-popup="layers"] {
    right: auto;
  }
  #doodle-toolbar.doodle-docked-bottom .doodle-popup[data-popup="layers"] {
    left: auto;
    right: 0;
  }
  .doodle-layer-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
    max-height: min(420px, 55vh);
    overflow-y: auto;
  }
  .doodle-layer-row {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px;
    border: 1px solid #444;
    border-radius: 4px;
    background: #262626;
    cursor: pointer;
    touch-action: pan-y;
  }
  .doodle-layer-row.doodle-current {
    border-color: #9fd3ff;
    background: #34404c;
  }
  .doodle-layer-row.doodle-picked {
    box-shadow: inset 0 0 0 2px #e6a700;
  }
  /* A clipped layer sits indented, hanging off the one below it. */
  .doodle-layer-row.doodle-clipped {
    margin-left: 14px;
  }
  /* Lifted while dragged: outlined, not dimmed. */
  .doodle-layer-row.doodle-layer-dragging {
    border-color: #9fd3ff;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
    cursor: grabbing;
  }
  .doodle-layer-bg {
    cursor: default;
  }
  .doodle-thumb {
    flex: none;
    border: 1px solid #777;
    touch-action: none;
  }
  .doodle-layer-main {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .doodle-layer-name {
    box-sizing: border-box;
    width: 100%;
    padding: 1px 4px;
    border: 1px solid #555;
    border-radius: 3px;
    background: #1b1b1b;
    color: #fff !important;
    font-size: 12px;
  }
  .doodle-layer-label {
    padding: 2px 4px;
    color: #fff !important;
    font-size: 12px;
  }
  .doodle-layer-under {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .doodle-range.doodle-layer-opacity {
    flex: 1;
    min-width: 0;
    height: 22px;
  }
  .doodle-mini {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 0;
    border-radius: 3px;
    background: transparent;
    color: #ddd !important;
    cursor: pointer;
  }
  .doodle-mini:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.12);
  }
  .doodle-mini.doodle-on {
    color: #9fd3ff !important;
  }
  .doodle-mini:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .doodle-blend-btn,
  .doodle-bg-btn {
    width: 26px;
    height: 26px;
    border: 1px solid #777;
  }
  .doodle-bg-btn {
    width: 22px;
    height: 22px;
    margin: 2px;
  }
  .doodle-blend-menu {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .doodle-blend-option {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 8px 3px 4px;
    border: 0;
    border-radius: 3px;
    background: transparent;
    color: #fff !important;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }
  .doodle-blend-option:hover {
    background: rgba(255, 255, 255, 0.12);
  }
  .doodle-blend-option.doodle-on {
    background: #34404c;
    outline: 1px solid #9fd3ff;
  }
  .doodle-layer-actions {
    margin-top: 6px;
    justify-content: flex-end;
  }
  .doodle-layer-actions .torn-btn:disabled {
    opacity: 0.4;
    cursor: default;
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
