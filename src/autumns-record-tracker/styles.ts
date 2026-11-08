// Every style the script injects, in one sheet.
//
// The preferences rows copy the look of Autumn's UI Enhancer panel under their
// own class names, so they look the same whether they join that panel or stand alone.

const STYLE_ID = "art-styles";
export const STANDALONE_PANEL_ID = "art-prefs-panel";

const CSS = `
  #${STANDALONE_PANEL_ID} {
    margin: 10px 0 0;
    border-radius: 5px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  }
  #${STANDALONE_PANEL_ID}, .art-section {
    container-type: inline-size;
    font-family: Arial, Helvetica, sans-serif;
    color: #fff;
  }
  /* The UI Enhancer rounds its last block; once ours follows, ours is last. */
  #aue-prefs-panel .aue-content > .aue-body-api:not(:last-child) {
    border-radius: 0;
  }
  .art-title, .art-section-label {
    box-sizing: border-box;
    width: 100%;
    padding: 0 0 0 10px;
    background: linear-gradient(180deg, #4e565e 0%, #303840 100%);
    font-weight: bold;
    font-size: 12px;
    color: #fff;
    text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
  }
  .art-title {
    display: block;
    height: 30px;
    line-height: 30px;
    border-radius: 5px 5px 0 0;
    cursor: pointer;
  }
  .art-section-label {
    height: 24px;
    line-height: 24px;
    box-shadow: inset 0 1px 0 rgba(0, 0, 0, 0.4);
  }
  .art-title::after {
    content: "▾";
    float: right;
    margin-right: 10px;
    transition: transform 0.15s;
  }
  .art-title[aria-expanded="false"]::after {
    transform: rotate(-90deg);
  }
  #${STANDALONE_PANEL_ID}.art-collapsed .art-title {
    border-radius: 5px;
  }
  .art-body {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    background: linear-gradient(180deg, #656565 0%, #373737 100%);
    border-radius: 0 0 5px 5px;
  }
  @container (max-width: 620px) {
    .art-body { grid-template-columns: repeat(2, 1fr); }
  }
  @container (max-width: 400px) {
    .art-body { grid-template-columns: 1fr; }
  }
  .art-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 12px;
    font-size: 13px;
    color: #fff;
    box-shadow: 1px 0 0 rgba(0, 0, 0, 0.4), 0 1px 0 rgba(0, 0, 0, 0.4);
    transition: background 0.15s;
  }
  .art-row:hover, .art-row:focus-within {
    background: linear-gradient(180deg, #525252 0%, #414141 100%);
  }
  .art-row-wide {
    grid-column: 1 / -1;
    flex-direction: column;
    gap: 4px;
  }
  .art-label {
    line-height: 22px;
  }
  .art-heading {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .art-field-link {
    color: #a9d1ff;
    font-size: 11px;
    text-decoration: none;
  }
  .art-field-link:hover {
    text-decoration: underline;
  }
  .art-key-field {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .art-key-box {
    position: relative;
    display: inline-flex;
  }
  .art-key-input {
    width: 150px;
    padding: 2px 36px 2px 6px;
    border: 1px solid rgba(0, 0, 0, 0.5);
    border-radius: 4px;
    background: #f2f2f2;
    color: #000;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
  }
  .art-key-reveal {
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
  .art-key-reveal:hover {
    color: #000;
  }
  .torn-btn.art-key-check {
    height: 22px;
    padding: 0 8px;
    line-height: 20px;
    font-size: 12px;
  }
  .art-key-result {
    flex-basis: 100%;
    font-size: 11px;
  }
  .art-key-result:empty {
    display: none;
  }
  .art-good {
    color: #9fdf6f;
  }
  .art-bad {
    color: #ff8f8f;
  }
  .art-switch {
    position: relative;
    display: inline-block;
    width: 42px;
    height: 22px;
    flex-shrink: 0;
    /* Only the switch: the panel's words must stay selectable. */
    user-select: none;
  }
  .art-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }
  .art-slider {
    position: absolute;
    inset: 0;
    box-sizing: border-box;
    border: 2px solid #8c8c8c;
    border-radius: 999px;
    background: linear-gradient(180deg, #1c1c1c 0%, #0d0d0d 100%);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
    cursor: pointer;
    transition: background 0.2s, border-color 0.15s;
  }
  .art-slider::before {
    content: "";
    position: absolute;
    left: 2px;
    top: 2px;
    height: 14px;
    width: 14px;
    border-radius: 50%;
    background: linear-gradient(180deg, #7d7d7d 0%, #5a5a5a 100%);
    transition: transform 0.2s;
  }
  .art-switch input:checked + .art-slider {
    background: linear-gradient(180deg, #9e9e9e 0%, #6e6e6e 100%);
  }
  .art-switch input:checked + .art-slider::before {
    transform: translateX(20px);
    background: linear-gradient(180deg, #4c4c4c 0%, #343434 100%);
  }
  .art-row:hover .art-slider {
    border-color: #fff;
  }
  .art-row:hover input:checked + .art-slider {
    background: linear-gradient(180deg, #ffffff 0%, #bdbdbd 100%);
  }

  /* Hall of Fame level progress */
  .art-level {
    margin: 10px 0 0;
    padding: 10px 16px 12px;
    border-radius: 5px;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
  }
  .art-level-title {
    margin-bottom: 6px;
  }
  .art-level-place {
    margin-top: 6px;
  }
  .art-level-note {
    margin-top: 4px;
  }
  .art-level-track {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .art-level-end {
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }
  .art-level-meter {
    position: relative;
    flex: 1;
    padding: 22px 0 30px;
  }
  .art-level-bar {
    height: 10px;
    border-radius: 5px;
    background: rgba(127, 127, 127, 0.3);
    overflow: hidden;
  }
  .art-level-fill {
    height: 100%;
    background: linear-gradient(180deg, #a9e34b 0%, #66a80f 100%);
  }
  .art-level-marker {
    position: absolute;
    top: 0;
    bottom: 0;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .art-level-percent {
    height: 16px;
    line-height: 16px;
    font-weight: bold;
    color: #82c91e;
  }
  .art-level-pointer {
    width: 0;
    height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 6px solid #82c91e;
  }
  /* The bar's height plus 10px, so the position sits just under the bar. */
  .art-level-gap {
    height: 20px;
  }

  /* Points Building merit tracker */
  .art-tracker {
    container-type: inline-size;
    --art-title-font: "Fjalla One", arial, helvetica, sans-serif;
    margin: 10px 0;
    border-radius: 5px;
    overflow: hidden;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
  }
  /* Torn's own rules colour divs and cells dark, and outrank a plain class.
     Everything inside inherits, so a colour set on a group or figure reaches its words. */
  #art-merit-tracker {
    color: #fff !important;
  }
  #art-merit-tracker .art-tracker-body * {
    color: inherit !important;
  }
  /* The Points Building's Hairstyles header, as Torn draws it. */
  .art-tracker-title {
    position: relative;
    height: 34px;
    box-sizing: border-box;
    padding: 9px 10px 8px;
    border-bottom: 1px solid #191919;
    background: linear-gradient(#555, #333);
    color: #fff;
    font-family: var(--art-title-font);
    font-size: 14px;
    line-height: 17px;
    text-shadow: 0 0 2px #000;
    cursor: pointer;
  }
  .art-tracker-title[aria-expanded="false"] {
    border-bottom: 0;
  }
  /* A triangle as tall as a capital letter, centred on the right of the title. */
  .art-tracker-arrow {
    position: absolute;
    top: 50%;
    right: 12px;
    width: 0;
    height: 0;
    border-left: 0.4em solid transparent;
    border-right: 0.4em solid transparent;
    border-top: 0.7em solid currentColor;
    transform: translateY(-50%);
    transition: transform 0.15s;
  }
  .art-tracker-title[aria-expanded="false"] .art-tracker-arrow {
    transform: translateY(-50%) rotate(90deg);
  }
  /* The empty square after Big Al's Bunker. */
  .art-tracker-body {
    padding: 8px 10px 10px;
    background: linear-gradient(#333, #222);
    overflow-x: auto;
  }
  /* Torn's own table rules outrank a class, so every rule here goes through the id. */
  #art-merit-tracker table {
    width: 100%;
    border-collapse: collapse !important;
    font-variant-numeric: tabular-nums;
  }
  #art-merit-tracker th,
  #art-merit-tracker td {
    padding: 6px 8px !important;
    border: 0 !important;
    text-align: center !important;
    vertical-align: middle !important;
    white-space: nowrap;
  }
  #art-merit-tracker td.art-item {
    font-weight: bold !important;
  }
  /* Vertical lines, drawn as a 1px background so they fade in through the
     column titles and out through the total row. Not borders: a collapsed
     table ignores border-image, so a border cannot fade. */
  #art-merit-tracker .art-split {
    background: linear-gradient(rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.3)) right / 1px 100% no-repeat !important;
  }
  #art-merit-tracker thead .art-split {
    background: linear-gradient(transparent, rgba(255, 255, 255, 0.3)) right / 1px 100% no-repeat !important;
  }
  /* The Sum Total section: white fading to light grey, with words in the body gradient's grey.
     Painted per cell, which reads as one band because every cell in a row is the row's height. */
  #art-merit-tracker .art-tracker-body tfoot tr:not(.art-rule) {
    --art-sum-fill: linear-gradient(#fff, #d4d4d4);
    color: #2b2b2b !important;
  }
  #art-merit-tracker tfoot tr:not(.art-rule) td {
    background: var(--art-sum-fill) !important;
  }
  #art-merit-tracker tfoot tr:not(.art-rule) td.art-split {
    background: linear-gradient(rgba(0, 0, 0, 0.25), transparent) right / 1px 100% no-repeat, var(--art-sum-fill) !important;
  }
  #art-merit-tracker .art-money-row {
    display: none !important;
  }
  #art-merit-tracker th,
  #art-merit-tracker tfoot td,
  #art-merit-tracker .art-side {
    font-family: var(--art-title-font) !important;
    font-size: 14px !important;
    font-weight: normal !important;
  }
  /* Horizontal lines are rows of their own, so one line can fade across the whole table. */
  #art-merit-tracker tr.art-rule td {
    padding: 0 !important;
  }
  .art-rule-line {
    height: 1px;
    margin: 0 4%;
    background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.35) 25%, rgba(255, 255, 255, 0.35) 75%, transparent);
  }
  .art-rule-head .art-rule-line {
    height: 2px;
    background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.5) 25%, rgba(255, 255, 255, 0.5) 75%, transparent);
  }
  .art-rule-total .art-rule-line {
    height: 3px;
    background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.6) 25%, rgba(255, 255, 255, 0.6) 75%, transparent);
  }
  /* Reads upwards, bottom to top. */
  #art-merit-tracker .art-side {
    width: 1px;
    padding: 6px 4px !important;
  }
  #art-merit-tracker .art-side span {
    display: inline-block;
    writing-mode: vertical-rl;
    transform: rotate(180deg);
  }
  /* Group colours, taken from the sidebar bars: energy, nerve, life and happy.
     Set on the group and inherited, so a finished cell can fade its own colour. */
  #art-merit-tracker .art-group-refill {
    color: #7cc13a !important;
  }
  #art-merit-tracker .art-group-merit {
    color: #e8643a !important;
  }
  #art-merit-tracker .art-group-misc {
    color: #6a80f5 !important;
  }
  #art-merit-tracker .art-group-honor {
    color: #e8d23a !important;
  }
  /* The colour fades rather than the cell, which would fade the vertical lines too. */
  #art-merit-tracker td.art-done {
    color: color-mix(in srgb, currentColor 40%, transparent) !important;
  }
  .art-tracker-facts {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px 16px;
    margin-top: 14px;
    text-align: center;
  }
  /* As wide as the longer of its title and figure, so the line under the title can match. */
  .art-fact-inner {
    display: inline-block;
  }
  .art-fact-title {
    font-family: var(--art-title-font);
    font-size: 14px;
  }
  .art-fact-line {
    height: 2px;
    margin: 3px -8px 4px;
    background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.4) 25%, rgba(255, 255, 255, 0.4) 75%, transparent);
  }
  #art-merit-tracker .art-dear {
    color: #ff6b6b !important;
  }
  #art-merit-tracker .art-cheap {
    color: #7cc13a !important;
  }
  /* Narrow screens, such as Torn on a phone: tighter columns, and no dollar columns. */
  @container (max-width: 700px) {
    #art-merit-tracker th,
    #art-merit-tracker td {
      padding: 5px 3px !important;
      font-size: 11px !important;
    }
    #art-merit-tracker th,
    #art-merit-tracker tfoot td {
      font-size: 12px !important;
    }
    #art-merit-tracker .art-side {
      padding: 5px 1px !important;
    }
    #art-merit-tracker .art-money {
      display: none !important;
    }
    /* The last column left showing needs no line after it. */
    #art-merit-tracker .art-split.art-last {
      background: none !important;
    }
    #art-merit-tracker .art-money-row {
      display: table-row !important;
    }
    #art-merit-tracker .art-money-row td {
      padding-top: 0 !important;
    }
    /* Two rows here, so the fill is split between them to run as one gradient. */
    #art-merit-tracker .art-tracker-body tfoot tr.art-sum-row {
      --art-sum-fill: linear-gradient(#fff, #eaeaea);
    }
    #art-merit-tracker .art-tracker-body tfoot tr.art-money-row {
      --art-sum-fill: linear-gradient(#eaeaea, #d4d4d4);
    }
    /* The lines run on into the dollar row and fade out there instead. */
    #art-merit-tracker tfoot tr.art-sum-row:not(.art-rule) td.art-split {
      background: linear-gradient(rgba(0, 0, 0, 0.25), rgba(0, 0, 0, 0.25)) right / 1px 100% no-repeat, var(--art-sum-fill) !important;
    }
    #art-merit-tracker tfoot tr:not(.art-rule) td.art-split.art-last {
      background: var(--art-sum-fill) !important;
    }
    .art-tracker-body {
      padding: 6px 4px 8px;
    }
    .art-tracker-facts {
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    }
  }
  .art-tracker-status {
    padding: 4px 0;
  }

  /* Racing class records */
  .art-class-pick {
    cursor: pointer;
  }
  .art-class-pick::after {
    content: " ▾";
  }
  .art-class-menu {
    position: absolute;
    z-index: 100000;
    min-width: 140px;
    padding: 3px 0;
    border: 1px solid #000;
    border-radius: 4px;
    background: #333;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
  }
  .art-class-option {
    display: block;
    width: 100%;
    padding: 4px 10px;
    border: 0;
    background: none;
    color: #ddd;
    text-align: left;
    cursor: pointer;
  }
  .art-class-option:hover, .art-class-option[aria-selected="true"] {
    background: #555;
    color: #fff;
  }
  .art-class-status {
    padding: 6px 4px;
    font-size: 12px;
  }
`;

/** Adds the sheet once. */
export function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  (document.head ?? document.documentElement).appendChild(style);
}
