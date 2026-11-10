// ==UserScript==
// @name         Autumn's Record Tracker
// @namespace    https://github.com/autumn-grey
// @version      1.0.5
// @description  Displays your progress towards achieving all merits requiring points purchases, estimates your level progress and allows you to see all car classes' record lists.
// @author       AutumnGrey
// @license      MIT
// @match        https://www.torn.com/preferences.php*
// @match        https://www.torn.com/page.php*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// @noframes     true
// @downloadURL  https://raw.githubusercontent.com/autumn-grey/tornScripts/main/dist/autumns-record-tracker.user.js
// @updateURL    https://raw.githubusercontent.com/autumn-grey/tornScripts/main/dist/autumns-record-tracker.user.js
// ==/UserScript==

"use strict";
(() => {
  // src/autumns-record-tracker/debug.ts
  var DEBUG_KEY = "ART_DEBUG";
  function debugging() {
    try {
      return localStorage.getItem(DEBUG_KEY) === "1";
    } catch {
      return false;
    }
  }
  function log(...parts) {
    if (!debugging()) return;
    console.log("[ART]", ...parts);
  }

  // src/autumns-record-tracker/settings.ts
  var SETTING_PREFIX = "ART_";
  var LEVEL_PROGRESS = {
    key: "LEVEL_PROGRESS",
    label: "Level Progress",
    defaultOn: true
  };
  var RACING_CLASS_RECORDS = {
    key: "RACING_CLASS_RECORDS",
    label: "Racing Class Records",
    defaultOn: true
  };
  var POINT_MERIT_TRACKER = {
    key: "POINT_MERIT_TRACKER",
    label: "Point Merit Tracker",
    defaultOn: true
  };
  var FEATURES = [LEVEL_PROGRESS, RACING_CLASS_RECORDS, POINT_MERIT_TRACKER];
  var API_KEY_SETTING = "API_KEY";
  var PANEL_OPEN_SETTING = "PANEL_OPEN";
  var TRACKER_OPEN_SETTING = "TRACKER_OPEN";
  function readSetting(key, fallback) {
    try {
      return GM_getValue(SETTING_PREFIX + key, fallback);
    } catch {
      return fallback;
    }
  }
  function writeSetting(key, value) {
    try {
      GM_setValue(SETTING_PREFIX + key, value);
    } catch {
    }
  }
  function isEnabled(feature) {
    return readSetting(feature.key, feature.defaultOn);
  }
  function setEnabled(feature, on) {
    writeSetting(feature.key, on);
  }
  function readKey() {
    return readSetting(API_KEY_SETTING, "").trim();
  }

  // src/autumns-record-tracker/api.ts
  var API_BASE = "https://api.torn.com/v2";
  var POINTS_BUILDING_CATEGORY = 113;
  var POINTS_BUILDING_TITLE = /^points building$/i;
  var CATEGORY_SETTING = "LOG_CATEGORY";
  var API_KEY_CREATE_URL = `https://www.torn.com/preferences.php#tab=api?step=addNewKey&title=AutumnRTv1&user=hof,log&torn=hof,logcategories&racing=records&market=pointsmarket&logIds=${POINTS_BUILDING_CATEGORY}`;
  var POINT_VALUE_MAX_AGE_MS = 10 * 6e4;
  var POINT_VALUE_SETTING = "POINT_VALUE";
  var ApiError = class extends Error {
    constructor(message, code) {
      super(message);
      this.code = code;
    }
  };
  async function tornGet(path, params, key) {
    const search = new URLSearchParams();
    for (const [name, value] of Object.entries(params)) search.set(name, String(value));
    search.set("comment", "AutumnRT");
    search.set("key", key);
    const response = await fetch(`${API_BASE}/${path}?${search}`, { credentials: "omit" });
    const body = await response.json();
    if (body.error) throw new ApiError(body.error.error ?? "API error", body.error.code ?? null);
    log(path, params, body);
    return body;
  }
  function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length === 0) return 0;
    if (sorted.length % 2) return sorted[mid] ?? 0;
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  async function fetchPointValue(key) {
    const stored = readSetting(POINT_VALUE_SETTING, null);
    if (stored && Date.now() - stored.fetchedAt < POINT_VALUE_MAX_AGE_MS) return stored;
    const body = await tornGet("market/pointsmarket", {}, key);
    const prices = (body.pointsmarket ?? []).map((listing) => listing.cost ?? 0).filter((cost) => cost > 0);
    const value = { price: median(prices), listings: prices.length, fetchedAt: Date.now() };
    writeSetting(POINT_VALUE_SETTING, value);
    return value;
  }
  var POINT_AVERAGE = { price: 32844, from: "2025-11-08", to: "2026-11-07" };
  async function fetchMyLevel(key) {
    const body = await tornGet("user/hof", {}, key);
    return { level: body.hof.level.value, position: body.hof.level.rank };
  }
  function pointsBuildingCategory() {
    return readSetting(CATEGORY_SETTING, POINTS_BUILDING_CATEGORY);
  }
  async function confirmCategory(key) {
    const body = await tornGet(
      "torn/logcategories",
      {},
      key
    );
    const found = (body.logcategories ?? []).find((category) => POINTS_BUILDING_TITLE.test(category.title));
    if (!found) return pointsBuildingCategory();
    writeSetting(CATEGORY_SETTING, found.id);
    return found.id;
  }
  var ACCESS_TOO_LOW = 16;
  async function checkApiKey(key) {
    const reason = (error) => error instanceof Error ? error.message : "API error";
    const steps = [
      ["Hall of Fame", () => fetchMyLevel(key)],
      ["Log categories", () => confirmCategory(key)],
      ["Level leaderboard", () => tornGet("torn/hof", { cat: "level", limit: 1 }, key)],
      ["Racing records", () => tornGet("racing/6/records", { cat: "A" }, key)],
      ["Points market", () => tornGet("market/pointsmarket", {}, key)]
    ];
    for (const [name, step] of steps) {
      try {
        await step();
      } catch (error) {
        return { problem: `${name}: ${reason(error)}`, logs: false, full: false };
      }
    }
    try {
      await tornGet("user/log", { cat: pointsBuildingCategory(), limit: 1 }, key);
    } catch (error) {
      if (error instanceof ApiError && error.code === ACCESS_TOO_LOW) return { problem: null, logs: false, full: false };
      return { problem: `Points Building log: ${reason(error)}`, logs: false, full: false };
    }
    const info = await tornGet("key/info", {}, key).catch(() => null);
    return { problem: null, logs: true, full: info?.info?.access?.type === "Full Access" };
  }

  // src/autumns-record-tracker/keyPrompt.ts
  var SETTINGS_FLAG = "art-settings";
  var SETTINGS_URL = `https://www.torn.com/preferences.php?${SETTINGS_FLAG}=1`;
  var KEY_ERRORS = /* @__PURE__ */ new Set([2, 16]);
  function isKeyProblem(error) {
    return error instanceof ApiError && error.code !== null && KEY_ERRORS.has(error.code);
  }
  function keyPrompt() {
    const link = document.createElement("a");
    link.className = "art-key-prompt";
    link.href = SETTINGS_URL;
    link.textContent = "Please load a valid API Key in script settings";
    return link;
  }

  // src/autumns-record-tracker/styles.ts
  var STYLE_ID = "art-styles";
  var STANDALONE_PANEL_ID = "art-prefs-panel";
  var CSS = `
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
  .art-key-prompt {
    color: #a9d1ff !important;
    text-decoration: none;
  }
  .art-key-prompt:hover {
    text-decoration: underline;
  }
  .art-key-note {
    font-size: 11px;
    line-height: 15px;
    color: #bbb;
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
  .art-warn {
    color: #f0c674;
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
  .art-has-tip {
    position: relative;
    cursor: help;
    outline: none;
  }
  /* Opens upwards over the table: the body scrolls sideways, so anything below the facts would be clipped. */
  .art-tip {
    display: none;
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 5;
    width: max-content;
    max-width: 260px;
    padding: 6px 9px;
    border: 1px solid #191919;
    border-radius: 4px;
    background: linear-gradient(#555, #333);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
    font-size: 12px;
    line-height: 17px;
    text-align: center;
  }
  .art-has-tip:hover .art-tip,
  .art-has-tip:focus .art-tip {
    display: block;
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
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head ?? document.documentElement).appendChild(style);
  }

  // src/autumns-record-tracker/hof.ts
  var SELECTORS = {
    root: "#hof-root",
    // The leaderboard table and its header: <div class="tableWrapper___Vgmq8">.
    table: '[class*="tableWrapper___"]',
    // "People ranked by Level", in the table header.
    heading: '[class*="heading___"]',
    // The category tiles above the table, whose look the widget borrows. A tile
    // is <div class="buttonWrapper___ up___"><button class="button___"> holding
    // an infoBox___ with a title___ ("faction respect") and a message___, which
    // is bold ("No change in 1 day") on an open tile and plain ("Revive people
    // to increase") on a locked___ one. Selected tiles are drawn differently.
    tile: '[class*="tabsList___"] [class*="buttonWrapper___"]:not([class*="selected___"]):not([class*="locked___"])',
    tileButton: '[class*="button___"]',
    tileTitle: '[class*="infoBox___"] [class*="title___"]',
    tileMessage: '[class*="infoBox___"] [class*="message___"]',
    lockedMessage: '[class*="tabsList___"] [class*="locked___"] [class*="message___"]'
  };
  var BOX_STYLES = [
    "background-color",
    "background-image",
    "border-top-left-radius",
    "border-top-right-radius",
    "border-bottom-left-radius",
    "border-bottom-right-radius",
    "border-top",
    "border-right",
    "border-bottom",
    "border-left",
    "box-shadow"
  ];
  var TEXT_STYLES = [
    "color",
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "line-height",
    "letter-spacing",
    "text-transform"
  ];
  var LEVEL_HEADING = /ranked by level/i;
  var WIDGET_ID = "art-level-progress";
  var PAGE_SIZE = 100;
  var BAND_MAX_AGE_MS = 60 * 6e4;
  var BAND_SETTING = "LEVEL_BAND";
  function levelLookup(key) {
    const pages = /* @__PURE__ */ new Map();
    return async (position2) => {
      const offset = Math.floor((position2 - 1) / PAGE_SIZE) * PAGE_SIZE;
      let levels = pages.get(offset);
      if (!levels) {
        const body = await tornGet(
          "torn/hof",
          { cat: "level", limit: PAGE_SIZE, offset },
          key
        );
        levels = (body.hof ?? []).map((entry) => entry.level ?? 0);
        pages.set(offset, levels);
      }
      return levels[position2 - 1 - offset] ?? null;
    };
  }
  async function findBand(key, me) {
    const levelAt = levelLookup(key);
    const atMyLevel = async (position2) => position2 >= 1 && await levelAt(position2) === me.level;
    let inside = me.position;
    let outside = 0;
    for (let step = PAGE_SIZE; ; step *= 2) {
      const probe = inside - step;
      if (probe < 1) break;
      if (!await atMyLevel(probe)) {
        outside = probe;
        break;
      }
      inside = probe;
    }
    while (inside - outside > 1) {
      const mid = Math.floor((inside + outside) / 2);
      if (await atMyLevel(mid)) inside = mid;
      else outside = mid;
    }
    const best = inside;
    inside = me.position;
    for (let step = PAGE_SIZE; ; step *= 2) {
      const probe = inside + step;
      if (!await atMyLevel(probe)) {
        outside = probe;
        break;
      }
      inside = probe;
    }
    while (outside - inside > 1) {
      const mid = Math.floor((inside + outside) / 2);
      if (await atMyLevel(mid)) inside = mid;
      else outside = mid;
    }
    return { level: me.level, best, worst: inside, fetchedAt: Date.now() };
  }
  async function loadProgress(key) {
    const me = await fetchMyLevel(key);
    const stored = readSetting(BAND_SETTING, null);
    const fresh = stored && stored.level === me.level && Date.now() - stored.fetchedAt < BAND_MAX_AGE_MS && me.position >= stored.best && me.position <= stored.worst;
    if (fresh) return { me, band: stored };
    const band = await findBand(key, me);
    log("level band", band);
    writeSetting(BAND_SETTING, band);
    return { me, band };
  }
  function position(value) {
    return value.toLocaleString("en-US");
  }
  function copyStyles(from, to, properties) {
    if (!from) return;
    const computed = getComputedStyle(from);
    for (const property of properties) to.style.setProperty(property, computed.getPropertyValue(property));
  }
  function borrowTileLook(widget, title, place4, note) {
    const tile = document.querySelector(SELECTORS.tile);
    if (!tile) return;
    const button = tile.querySelector(SELECTORS.tileButton);
    const painted = [button, tile].find((box) => box && getComputedStyle(box).backgroundImage !== "none") ?? button;
    copyStyles(painted, widget, BOX_STYLES);
    const tileTitle = tile.querySelector(SELECTORS.tileTitle);
    if (tileTitle) widget.style.color = getComputedStyle(tileTitle).color;
    copyStyles(tileTitle, title, TEXT_STYLES);
    copyStyles(tile.querySelector(SELECTORS.tileMessage), place4, TEXT_STYLES);
    place4.style.color = "#fff";
    copyStyles(document.querySelector(SELECTORS.lockedMessage), note, TEXT_STYLES);
  }
  function drawBar(widget, me, band) {
    const span = band.worst - band.best;
    const percent = span > 0 ? (band.worst - me.position) / span * 100 : 100;
    const clamped = Math.min(100, Math.max(0, percent));
    const title = document.createElement("div");
    title.className = "art-level-title";
    title.textContent = `Level ${me.level} progress`;
    const track = document.createElement("div");
    track.className = "art-level-track";
    const left = document.createElement("span");
    left.className = "art-level-end";
    left.textContent = position(band.worst);
    const meter = document.createElement("div");
    meter.className = "art-level-meter";
    const bar = document.createElement("div");
    bar.className = "art-level-bar";
    const fill = document.createElement("div");
    fill.className = "art-level-fill";
    fill.style.width = `${clamped}%`;
    bar.appendChild(fill);
    const marker = document.createElement("div");
    marker.className = "art-level-marker";
    marker.style.left = `${clamped}%`;
    const label = document.createElement("span");
    label.className = "art-level-percent";
    label.textContent = `${percent.toFixed(1)}%`;
    const pointer = document.createElement("span");
    pointer.className = "art-level-pointer";
    const gap = document.createElement("span");
    gap.className = "art-level-gap";
    const rank = document.createElement("span");
    rank.textContent = position(me.position);
    marker.append(label, pointer, gap, rank);
    meter.append(bar, marker);
    const right = document.createElement("span");
    right.className = "art-level-end";
    right.textContent = position(band.best);
    track.append(left, meter, right);
    const place4 = document.createElement("div");
    place4.className = "art-level-place";
    const players = (band.worst - band.best + 1).toLocaleString("en-US");
    const within = (me.position - band.best + 1).toLocaleString("en-US");
    place4.textContent = `You are in position ${within} of ${players} players at level ${me.level}`;
    const note = document.createElement("div");
    note.className = "art-level-note";
    note.textContent = "Please be advised this is an estimate only. Level holding players and large gaps in experience at higher levels will skew results.";
    borrowTileLook(widget, title, place4, note);
    widget.replaceChildren(title, track, place4, note);
  }
  var progress = null;
  function place() {
    const root = document.querySelector(SELECTORS.root);
    const table = root?.querySelector(SELECTORS.table);
    const heading = table?.querySelector(SELECTORS.heading);
    const existing = document.getElementById(WIDGET_ID);
    if (!table || !LEVEL_HEADING.test(heading?.textContent ?? "")) {
      existing?.remove();
      return;
    }
    if (existing && existing.previousElementSibling === table) return;
    if (existing) {
      table.insertAdjacentElement("afterend", existing);
      return;
    }
    const widget = document.createElement("div");
    widget.id = WIDGET_ID;
    widget.className = "art-level";
    table.insertAdjacentElement("afterend", widget);
    const key = readKey();
    if (!key) {
      widget.replaceChildren(keyPrompt());
      return;
    }
    widget.textContent = "Loading level progress…";
    progress ?? (progress = loadProgress(key));
    progress.then(
      ({ me, band }) => drawBar(widget, me, band),
      (error) => {
        progress = null;
        if (isKeyProblem(error)) widget.replaceChildren(keyPrompt());
        else widget.textContent = `Level Progress: ${error instanceof Error ? error.message : "API error"}`;
      }
    );
  }
  function installLevelProgress() {
    injectStyles();
    place();
    new MutationObserver(place).observe(document.body, { childList: true, subtree: true });
  }

  // src/autumns-record-tracker/panel.ts
  var SELECTORS2 = {
    // The UI Enhancer's panel body, which the rows join the bottom of.
    enhancerContent: "#aue-prefs-panel .aue-content",
    // Unhashed Torn classes, most specific first; a standalone panel goes after the first found.
    prefsAnchors: [".preferences-container", ".preferences-wrap", ".content-wrapper"]
  };
  var SECTION_ID = "art-prefs-section";
  var JOIN_WAIT_MS = 2e3;
  var cameForSettings = new URLSearchParams(location.search).has(SETTINGS_FLAG);
  var scrolled = false;
  function buildApiKeyRow() {
    const row = document.createElement("div");
    row.className = "art-row art-row-wide";
    const heading = document.createElement("span");
    heading.className = "art-heading";
    row.appendChild(heading);
    const label = document.createElement("span");
    label.className = "art-label";
    label.textContent = "Record API Key";
    heading.appendChild(label);
    const generate = document.createElement("a");
    generate.className = "art-field-link";
    generate.href = API_KEY_CREATE_URL;
    generate.target = "_blank";
    generate.rel = "noopener";
    generate.textContent = "Generate key";
    heading.appendChild(generate);
    const note = document.createElement("span");
    note.className = "art-key-note";
    note.textContent = "Custom key fetches your points purchase logs, point market prices, race records and hall of fame positions. If you don't need the point merit tracker a public key will work.";
    row.appendChild(note);
    const field = document.createElement("span");
    field.className = "art-key-field";
    row.appendChild(field);
    const box = document.createElement("span");
    box.className = "art-key-box";
    field.appendChild(box);
    const input = document.createElement("input");
    input.className = "art-key-input";
    input.type = "password";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.placeholder = "custom key";
    input.value = readSetting(API_KEY_SETTING, "");
    box.appendChild(input);
    const reveal = document.createElement("button");
    reveal.type = "button";
    reveal.className = "art-key-reveal";
    reveal.textContent = "Show";
    reveal.addEventListener("click", () => {
      const hidden = input.type === "password";
      input.type = hidden ? "text" : "password";
      reveal.textContent = hidden ? "Hide" : "Show";
    });
    box.appendChild(reveal);
    const check = document.createElement("button");
    check.type = "button";
    check.className = "torn-btn art-key-check";
    check.textContent = "Check";
    field.appendChild(check);
    const result = document.createElement("span");
    result.className = "art-key-result";
    field.appendChild(result);
    input.addEventListener("input", () => {
      result.textContent = "";
      result.className = "art-key-result";
    });
    check.addEventListener("click", () => {
      const key = input.value.trim();
      if (!key) {
        writeSetting(API_KEY_SETTING, "");
        result.textContent = "Removed";
        result.className = "art-key-result";
        return;
      }
      check.disabled = true;
      result.textContent = "Checking…";
      result.className = "art-key-result";
      void checkApiKey(key).then(({ problem, logs, full }) => {
        check.disabled = false;
        if (problem) {
          result.textContent = problem;
          result.className = "art-key-result art-bad";
          return;
        }
        writeSetting(API_KEY_SETTING, key);
        if (full) {
          result.textContent = "Full Access will work but is not required for this script. For your security, the custom API key, which has significantly less permission, is suggested.";
          result.className = "art-key-result art-warn";
          return;
        }
        result.textContent = logs ? "Saved" : "Saved, without log access";
        result.className = "art-key-result art-good";
      });
    });
    return row;
  }
  function buildSwitchRow(feature) {
    const row = document.createElement("div");
    row.className = "art-row";
    const label = document.createElement("span");
    label.className = "art-label";
    label.textContent = feature.label;
    row.appendChild(label);
    const toggle = document.createElement("label");
    toggle.className = "art-switch";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = isEnabled(feature);
    input.addEventListener("change", () => setEnabled(feature, input.checked));
    toggle.appendChild(input);
    const slider = document.createElement("span");
    slider.className = "art-slider";
    toggle.appendChild(slider);
    row.appendChild(toggle);
    return row;
  }
  function buildSection() {
    const section2 = document.createElement("div");
    section2.id = SECTION_ID;
    section2.className = "art-section";
    const label = document.createElement("div");
    label.className = "art-section-label";
    label.textContent = "Record Tracker";
    section2.appendChild(label);
    const body = document.createElement("div");
    body.className = "art-body";
    body.appendChild(buildApiKeyRow());
    for (const feature of FEATURES) body.appendChild(buildSwitchRow(feature));
    section2.appendChild(body);
    return section2;
  }
  function buildStandalonePanel() {
    const panel = document.createElement("div");
    panel.id = STANDALONE_PANEL_ID;
    const title = document.createElement("div");
    title.className = "art-title";
    title.setAttribute("role", "button");
    title.tabIndex = 0;
    title.textContent = "Autumn's Scripts";
    panel.appendChild(title);
    const content = document.createElement("div");
    content.className = "art-content";
    panel.appendChild(content);
    const set = (open) => {
      title.setAttribute("aria-expanded", String(open));
      content.hidden = !open;
      panel.classList.toggle("art-collapsed", !open);
    };
    title.addEventListener("click", () => {
      if (getSelection()?.toString()) return;
      const open = title.getAttribute("aria-expanded") !== "true";
      writeSetting(PANEL_OPEN_SETTING, open);
      set(open);
    });
    title.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      title.click();
    });
    set(cameForSettings || readSetting(PANEL_OPEN_SETTING, true));
    return panel;
  }
  function findAnchor() {
    for (const selector of SELECTORS2.prefsAnchors) {
      const element = document.querySelector(selector);
      if (element) return element;
    }
    return null;
  }
  var section = null;
  var startedAt = Date.now();
  function scrollToSettings() {
    if (!cameForSettings || scrolled || !section?.isConnected) return;
    scrolled = true;
    const target = section.offsetParent ? section : section.closest("#aue-prefs-panel, #" + STANDALONE_PANEL_ID);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function place2() {
    section ?? (section = buildSection());
    const host = document.querySelector(SELECTORS2.enhancerContent);
    if (host) {
      if (host.lastElementChild !== section) host.appendChild(section);
      document.getElementById(STANDALONE_PANEL_ID)?.remove();
      scrollToSettings();
      return;
    }
    if (Date.now() - startedAt < JOIN_WAIT_MS) return;
    let panel = document.getElementById(STANDALONE_PANEL_ID);
    if (!panel) {
      const anchor = findAnchor();
      if (!anchor) return;
      panel = buildStandalonePanel();
      anchor.insertAdjacentElement("afterend", panel);
    }
    const content = panel.querySelector(".art-content");
    if (content && section.parentElement !== content) content.appendChild(section);
    scrollToSettings();
  }
  function installPreferencesPanel() {
    injectStyles();
    place2();
    window.setTimeout(place2, JOIN_WAIT_MS + 50);
    new MutationObserver(place2).observe(document.body, { childList: true, subtree: true });
  }

  // src/autumns-record-tracker/pointsLog.ts
  var LOG_SETTING = "POINTS_LOG";
  var PAGE_SIZE2 = 100;
  var MAX_PAGES = 200;
  async function syncPointsLog(key) {
    const category = pointsBuildingCategory();
    const stored = readSetting(LOG_SETTING, null);
    const kept = stored && stored.category === category ? stored : { category, complete: false, entries: [] };
    const known = new Set(kept.entries.map((entry) => entry.id));
    let cursor = null;
    let complete = kept.complete;
    for (let page = 0; page < MAX_PAGES; page++) {
      const params = { cat: category, limit: PAGE_SIZE2 };
      if (cursor) params.nanostamp = cursor;
      const body = await tornGet("user/log", params, key);
      const rows = body.log ?? [];
      let reachedKnown = false;
      for (const row of rows) {
        const id = String(row.id ?? "");
        if (!id) continue;
        if (known.has(id)) {
          reachedKnown = true;
          continue;
        }
        known.add(id);
        kept.entries.push({
          id,
          timestamp: row.timestamp ?? 0,
          title: row.details?.title ?? "",
          data: row.data && typeof row.data === "object" ? row.data : {}
        });
      }
      const next = body._metadata?.nanostamp;
      if (rows.length < PAGE_SIZE2 || next === null || next === void 0) {
        complete = true;
        break;
      }
      if (reachedKnown && kept.complete) break;
      cursor = String(next);
    }
    kept.complete = complete;
    kept.entries.sort((a, b) => b.timestamp - a.timestamp);
    writeSetting(LOG_SETTING, kept);
    log("points log", kept.entries.length, "entries", kept.entries.slice(0, 5));
    return kept.entries;
  }
  var KIND_PATTERNS = [
    ["honor", /\bhonou?r/],
    ["reset", /\breset/],
    ["merit", /\bmerit/],
    ["energy", /\benergy/],
    ["nerve", /\bnerve/],
    ["token", /\btoken|\bcasino/],
    ["stockTicker", /stock ticker/],
    ["racingLicense", /racing licen[cs]e/],
    ["displayCase", /display case/],
    ["bazaar", /\bbazaar/],
    ["hairstyle", /\bhair/],
    ["backdrop", /\bbackdrop/]
  ];
  function numberField(data, names) {
    for (const [name, value] of Object.entries(data)) {
      if (names.test(name) && typeof value === "number") return value;
    }
    return null;
  }
  function readPurchase(entry) {
    const text = `${entry.title} ${JSON.stringify(entry.data)}`.toLowerCase();
    const kind = KIND_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0] ?? "other";
    return {
      kind,
      quantity: numberField(entry.data, /^(quantity|qty|amount)$/i) ?? 1,
      points: numberField(entry.data, /point|cost|price/i),
      text
    };
  }

  // src/autumns-record-tracker/points.ts
  var SELECTORS3 = {
    // <div class="pointsBuildingPage___FgoKX">, holding the header and then the items.
    page: '#points-building-root [class*="pointsBuildingPage___"]',
    // The items to buy, which the tracker goes above.
    content: '[class*="pageContent___"]'
  };
  var TRACKER_ID = "art-merit-tracker";
  var TRACKER_LABEL = "Point Merit Tracker";
  var HONOR_BARS = [
    { name: "Globule", price: 500, level: 5 },
    { name: "Acute", price: 500, level: 10 },
    { name: "Retro", price: 500, level: 15 },
    { name: "The Socialist", price: 600, level: 20 },
    { name: "Jack Of All Trades", price: 600, level: 25 },
    { name: "Serenity", price: 600, level: 30 },
    { name: "Futurity", price: 700, level: 35 },
    { name: "Constellations", price: 700, level: 40 },
    { name: "Parallel", price: 700, level: 45 },
    { name: "Labyrinth", price: 700, level: 50 },
    { name: "Proven Capacity", price: 800, level: 55 },
    { name: "Master Of One", price: 800, level: 60 },
    { name: "Globally Effective", price: 800, level: 65 },
    { name: "Glimmer", price: 800, level: 70 },
    { name: "Supernova", price: 900, level: 75 },
    { name: "Pepperoni", price: 900, level: 80 },
    { name: "Resistance", price: 1e3, level: 85 },
    { name: "Electric Dream", price: 1e3, level: 90 },
    { name: "Brainz", price: 1300, level: 95 },
    { name: "Survivor", price: 1500, level: 100 }
  ];
  var HONOR_TOTAL = HONOR_BARS.reduce((sum, bar) => sum + bar.price, 0);
  var MERIT_PRICE = 300;
  var MERIT_TARGET = 50;
  var LEVELS_PER_MERIT = 2;
  var REFILLS = [
    { kind: "energy", label: "Energy Refill", price: 30, amount: 250 },
    { kind: "nerve", label: "Nerve Refill", price: 30, amount: 250 },
    { kind: "token", label: "Token Refill", price: 30, amount: 250 }
  ];
  var MERIT = { kind: "merit", label: "One Merit", price: MERIT_PRICE, amount: MERIT_TARGET };
  var MISC = [
    { kind: "reset", label: "Reset Merits", price: 500, amount: 1 },
    { kind: "stockTicker", label: "Stock Ticker", price: 50, amount: 1 },
    { kind: "racingLicense", label: "Racing License", price: 50, amount: 1 },
    { kind: "displayCase", label: "Display Case", price: 100, amount: 1 },
    { kind: "bazaar", label: "Bazaar", price: 250, amount: 1 },
    { kind: "hairstyle", label: "Hairstyles", price: 50, amount: 1 },
    { kind: "backdrop", label: "Backdrops", price: 100, amount: 1 }
  ];
  var TARGETS = [...REFILLS, MERIT, ...MISC];
  var SHORT_UNITS = [
    [1e12, "t"],
    [1e9, "b"],
    [1e6, "m"],
    [1e3, "k"]
  ];
  function short(value) {
    for (const [size, suffix] of SHORT_UNITS) {
      if (Math.abs(value) >= size) return `${Number((value / size).toFixed(3))}${suffix}`;
    }
    return String(Math.round(value));
  }
  function honorsBought(purchases) {
    const names = /* @__PURE__ */ new Set();
    for (const purchase of purchases) {
      if (purchase.kind !== "honor") continue;
      const bar = HONOR_BARS.find((candidate) => purchase.text.includes(candidate.name.toLowerCase()));
      if (bar) names.add(bar.name);
    }
    return names;
  }
  function pointsOf(purchase) {
    if (purchase.points !== null) return purchase.points;
    const target = TARGETS.find((candidate) => candidate.kind === purchase.kind);
    if (target) return target.price * purchase.quantity;
    if (purchase.kind === "honor") {
      return HONOR_BARS.find((bar) => purchase.text.includes(bar.name.toLowerCase()))?.price ?? 0;
    }
    return 0;
  }
  function cell(tag, text, className = "") {
    const element = document.createElement(tag);
    element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function lineOf(target, bought) {
    return {
      label: target.label,
      cost: short(target.price),
      amount: target.amount,
      total: target.price * target.amount,
      bought,
      remaining: Math.max(0, target.amount - bought) * target.price
    };
  }
  function pairCell(points, price, className) {
    const element = cell("td", "", className);
    const top = document.createElement("div");
    top.textContent = short(points);
    const bottom = document.createElement("div");
    bottom.textContent = `$${short(points * price)}`;
    element.append(top, bottom);
    return element;
  }
  function groupBody(group, price) {
    const tbody = document.createElement("tbody");
    tbody.className = `art-group art-group-${group.name}`;
    const total = group.lines.reduce((sum, line) => sum + line.total, 0);
    const remaining = group.lines.reduce((sum, line) => sum + line.remaining, 0);
    group.lines.forEach((line, index) => {
      const tr = document.createElement("tr");
      if (index === 0) {
        const side = cell("td", "", "art-side");
        side.rowSpan = group.lines.length;
        if (group.side) {
          const words = document.createElement("span");
          words.textContent = group.side;
          side.appendChild(words);
        }
        tr.appendChild(side);
      }
      const done = line.remaining === 0 ? "art-done" : "";
      tr.append(
        cell("td", line.label, `art-item art-split ${done}`),
        cell("td", line.cost, done),
        cell("td", short(line.amount), done),
        cell("td", short(line.total), `art-split ${done}`),
        cell("td", short(line.bought), done),
        cell("td", short(line.remaining), `art-split art-last ${done}`)
      );
      if (index === 0) {
        for (const sum of [total, remaining]) {
          const sumCell = pairCell(sum, price, "art-money");
          sumCell.rowSpan = group.lines.length;
          tr.appendChild(sumCell);
        }
      }
      tbody.appendChild(tr);
    });
    return tbody;
  }
  var COLUMNS = 9;
  function ruleRow(className = "") {
    const tr = document.createElement("tr");
    tr.className = `art-rule ${className}`;
    const td = document.createElement("td");
    td.colSpan = COLUMNS;
    const line = document.createElement("div");
    line.className = "art-rule-line";
    td.appendChild(line);
    tr.appendChild(td);
    return tr;
  }
  function fact(title, value, className = "") {
    const element = document.createElement("div");
    element.className = "art-fact";
    const inner = document.createElement("div");
    inner.className = "art-fact-inner";
    const heading = document.createElement("div");
    heading.className = "art-fact-title";
    heading.textContent = title;
    const line = document.createElement("div");
    line.className = "art-fact-line";
    const figure = document.createElement("div");
    figure.className = `art-fact-value ${className}`;
    figure.textContent = value;
    inner.append(heading, line, figure);
    element.appendChild(inner);
    return element;
  }
  var USUAL_PRICE_RANGE = 250;
  function priceClass(price) {
    if (Math.abs(price - POINT_AVERAGE.price) <= USUAL_PRICE_RANGE) return "";
    return price > POINT_AVERAGE.price ? "art-dear" : "art-cheap";
  }
  function addAverageTip(element, price) {
    const dollars = (value) => `$${Math.round(value).toLocaleString("en-US")}`;
    const gap = Math.round(price - POINT_AVERAGE.price);
    const tip = document.createElement("div");
    tip.className = "art-tip";
    const first = document.createElement("div");
    first.textContent = `Annual average point value: ${dollars(POINT_AVERAGE.price)}`;
    const second = document.createElement("div");
    second.textContent = gap === 0 ? "Current value matches the annual average" : `Current value is ${dollars(Math.abs(gap))} ${gap > 0 ? "above" : "below"} the annual average`;
    tip.append(first, second);
    const inner = element.querySelector(".art-fact-inner");
    if (!inner) return;
    inner.tabIndex = 0;
    inner.classList.add("art-has-tip");
    inner.appendChild(tip);
  }
  function drawTracker(body, purchases, value, level) {
    const price = value.price;
    const bought = /* @__PURE__ */ new Map();
    for (const purchase of purchases) {
      bought.set(purchase.kind, (bought.get(purchase.kind) ?? 0) + purchase.quantity);
    }
    const honorPurchases = purchases.filter((purchase) => purchase.kind === "honor");
    const named = honorsBought(purchases);
    const honorSpent = honorPurchases.reduce((sum, purchase) => sum + pointsOf(purchase), 0);
    const honorRemaining = named.size === honorPurchases.length ? HONOR_BARS.filter((bar) => !named.has(bar.name)).reduce((sum, bar) => sum + bar.price, 0) : Math.max(0, HONOR_TOTAL - honorSpent);
    const prices = HONOR_BARS.map((bar) => bar.price);
    const honorLine = {
      label: "Honor Bars",
      cost: `${short(Math.min(...prices))}-${short(Math.max(...prices))}`,
      amount: HONOR_BARS.length,
      total: HONOR_TOTAL,
      bought: honorPurchases.length,
      remaining: honorRemaining
    };
    const have = (target) => bought.get(target.kind) ?? 0;
    const groups = [
      { name: "refill", side: "Refills", lines: REFILLS.map((target) => lineOf(target, have(target))) },
      { name: "merit", side: "", lines: [lineOf(MERIT, have(MERIT))] },
      { name: "misc", side: "Misc", lines: MISC.map((target) => lineOf(target, have(target))) },
      { name: "honor", side: "", lines: [honorLine] }
    ];
    const table = document.createElement("table");
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    headRow.append(
      cell("th", ""),
      cell("th", "Item", "art-split"),
      cell("th", "Cost"),
      cell("th", "Amount"),
      cell("th", "Total", "art-split"),
      cell("th", "Bought"),
      cell("th", "Remaining", "art-split art-last"),
      cell("th", "Combined", "art-money"),
      cell("th", "Remaining", "art-money")
    );
    head.append(headRow, ruleRow("art-rule-head"));
    table.appendChild(head);
    groups.forEach((group, index) => {
      const tbody = groupBody(group, price);
      if (index > 0) tbody.prepend(ruleRow());
      table.appendChild(tbody);
    });
    const lines = groups.flatMap((group) => group.lines);
    const total = lines.reduce((sum, line) => sum + line.total, 0);
    const remaining = lines.reduce((sum, line) => sum + line.remaining, 0);
    const foot = document.createElement("tfoot");
    const footRow = document.createElement("tr");
    footRow.className = "art-sum-row";
    const footLabel = cell("td", "Sum Total", "art-split");
    footLabel.colSpan = 2;
    footRow.append(
      footLabel,
      cell("td", ""),
      cell("td", ""),
      cell("td", short(total), "art-split"),
      cell("td", ""),
      cell("td", short(remaining), "art-split art-last"),
      pairCell(total, price, "art-money"),
      pairCell(remaining, price, "art-money")
    );
    const moneyRow = document.createElement("tr");
    moneyRow.className = "art-money-row";
    const moneyGap = cell("td", "", "art-split");
    moneyGap.colSpan = 2;
    moneyRow.append(
      moneyGap,
      cell("td", ""),
      cell("td", ""),
      cell("td", `$${short(total * price)}`, "art-split"),
      cell("td", ""),
      cell("td", `$${short(remaining * price)}`, "art-split art-last")
    );
    foot.append(ruleRow("art-rule-total"), footRow, moneyRow);
    table.appendChild(foot);
    const unlocked = HONOR_BARS.filter((bar) => bar.level <= level);
    const unlockedPoints = unlocked.reduce((sum, bar) => sum + bar.price, 0);
    const meritsUnlocked = Math.min(MERIT_TARGET, Math.floor(level / LEVELS_PER_MERIT));
    const meritPoints = meritsUnlocked * MERIT_PRICE;
    const spent = purchases.reduce((sum, purchase) => sum + pointsOf(purchase), 0);
    const both = (points) => `${short(points)} | $${short(points * price)}`;
    const pointValue = fact("Point Value", `${short(price)}`, priceClass(price));
    addAverageTip(pointValue, price);
    const facts = document.createElement("div");
    facts.className = "art-tracker-facts";
    facts.append(
      pointValue,
      fact("Honors Unlocked", `${unlocked.length} of ${HONOR_BARS.length}`),
      fact("Unlocked Honors Cost", both(unlockedPoints)),
      fact("Merits Unlocked", `${meritsUnlocked} of ${MERIT_TARGET}`),
      fact("Unlocked Merits Cost", both(meritPoints)),
      fact("Points Spent So Far", both(spent))
    );
    body.replaceChildren(table, facts);
  }
  function wireTitle(title, body) {
    title.setAttribute("role", "button");
    title.tabIndex = 0;
    const set = (open) => {
      title.setAttribute("aria-expanded", String(open));
      body.hidden = !open;
    };
    title.addEventListener("click", () => {
      if (getSelection()?.toString()) return;
      const open = title.getAttribute("aria-expanded") !== "true";
      writeSetting(TRACKER_OPEN_SETTING, open);
      set(open);
    });
    title.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      title.click();
    });
    set(readSetting(TRACKER_OPEN_SETTING, true));
  }
  function buildTracker() {
    const title = document.createElement("div");
    title.className = "art-tracker-title";
    const label = document.createElement("span");
    label.textContent = TRACKER_LABEL;
    const arrow = document.createElement("span");
    arrow.className = "art-tracker-arrow";
    title.append(label, arrow);
    const body = document.createElement("div");
    body.className = "art-tracker-body";
    wireTitle(title, body);
    load(body);
    const tracker2 = document.createElement("div");
    tracker2.id = TRACKER_ID;
    tracker2.className = "art-tracker";
    tracker2.append(title, body);
    return tracker2;
  }
  var tracker = null;
  function load(body) {
    const status = document.createElement("div");
    status.className = "art-tracker-status";
    body.appendChild(status);
    const key = readKey();
    if (!key) {
      status.replaceChildren(keyPrompt());
      return;
    }
    status.textContent = "Loading…";
    void (async () => {
      try {
        const value = await fetchPointValue(key);
        const me = await fetchMyLevel(key);
        const entries = await syncPointsLog(key);
        drawTracker(body, entries.map(readPurchase), value, me.level);
      } catch (error) {
        if (isKeyProblem(error)) status.replaceChildren(keyPrompt());
        else status.textContent = `Point Merit Tracker: ${error instanceof Error ? error.message : "API error"}`;
      }
    })();
  }
  function place3() {
    const page = document.querySelector(SELECTORS3.page);
    const content = page?.querySelector(`:scope > ${SELECTORS3.content}`);
    if (!page || !content) return;
    tracker ?? (tracker = buildTracker());
    if (tracker.nextElementSibling !== content) content.insertAdjacentElement("beforebegin", tracker);
  }
  function installMeritTracker() {
    injectStyles();
    place3();
    new MutationObserver(place3).observe(document.body, { childList: true, subtree: true });
  }

  // src/autumns-record-tracker/racing.ts
  var SELECTORS4 = {
    // <div class="racing-main-wrap class-A m-top10">: the class is in the class list.
    mainWrap: ".racing-main-wrap",
    classLetter: ".racing-main-wrap .class-letter",
    // Each track's records: <ul id="class-records-6" class="records left">,
    // where 6 is the track's id in the API.
    classList: 'ul[id^="class-records-"]'
  };
  var CLASSES = ["A", "B", "C", "D", "E"];
  var ALL_LABEL = "All Class Records";
  var PICKED_ATTR = "data-art-picker";
  var MENU_ID = "art-class-menu";
  var fetched = /* @__PURE__ */ new Map();
  function ownClass() {
    const letter = document.querySelector(SELECTORS4.classLetter)?.textContent?.trim().toUpperCase();
    if (letter && CLASSES.includes(letter)) return letter;
    const match = /\bclass-([A-E])\b/.exec(document.querySelector(SELECTORS4.mainWrap)?.className ?? "");
    return match?.[1] ?? null;
  }
  function labelOf(choice) {
    return choice === "all" ? ALL_LABEL : `Class ${choice} Records`;
  }
  function lapTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const rest = seconds - minutes * 60;
    return `${String(minutes).padStart(2, "0")}:${rest.toFixed(2).padStart(5, "0")}`;
  }
  function recordItem(record, raceClass) {
    const item = document.createElement("li");
    const car = document.createElement("div");
    car.className = "car";
    const image = document.createElement("img");
    image.className = "torn-item small";
    const base = `/images/items/${record.car_item_id}/small`;
    image.src = `${base}.png`;
    image.srcset = `${base}.png 1x, ${base}@2x.png 2x, ${base}@3x.png 3x, ${base}@4x.png 4x`;
    image.width = 38;
    image.height = 19;
    image.title = `${record.car_item_name} (class ${raceClass})`;
    car.appendChild(image);
    const time = document.createElement("div");
    time.className = "time";
    time.textContent = lapTime(record.lap_time);
    const driver = document.createElement("div");
    driver.className = "driver";
    const link = document.createElement("a");
    link.href = `/profiles.php?XID=${record.driver_id}`;
    link.textContent = record.driver_name;
    driver.appendChild(link);
    const clear = document.createElement("div");
    clear.className = "clear";
    item.append(car, time, driver, clear);
    return item;
  }
  function recordsFor(track, raceClass, key) {
    const id = `${track}:${raceClass}`;
    let pending = fetched.get(id);
    if (!pending) {
      pending = tornGet(`racing/${track}/records`, { cat: raceClass }, key).then(
        (body) => (body.records ?? []).slice(0, 5)
      );
      pending.catch(() => fetched.delete(id));
      fetched.set(id, pending);
    }
    return pending;
  }
  var TrackPicker = class {
    constructor(track, list, label) {
      this.track = track;
      this.list = list;
      this.label = label;
      this.choice = "all";
      this.shown = 0;
      this.original = [...list.childNodes].map((node) => node.cloneNode(true));
    }
    /** Shows a choice in the label and the list. */
    show(choice) {
      this.choice = choice;
      this.label.textContent = labelOf(choice);
      const shown = ++this.shown;
      if (choice === "all") {
        this.list.replaceChildren(...this.original.map((node) => node.cloneNode(true)));
        return;
      }
      const key = readKey();
      const status = document.createElement("li");
      status.className = "art-class-status";
      if (!key) {
        status.replaceChildren(keyPrompt());
        this.list.replaceChildren(status);
        return;
      }
      status.textContent = "Loading…";
      this.list.replaceChildren(status);
      recordsFor(this.track, choice, key).then(
        (records) => {
          if (shown !== this.shown) return;
          if (records.length === 0) {
            status.textContent = "No records";
            return;
          }
          this.list.replaceChildren(...records.map((record) => recordItem(record, choice)));
        },
        (error) => {
          if (shown !== this.shown) return;
          if (isKeyProblem(error)) status.replaceChildren(keyPrompt());
          else status.textContent = error instanceof Error ? error.message : "API error";
        }
      );
    }
    /** Opens the class menu under the tab. */
    openMenu(anchor) {
      closeMenu();
      const menu = document.createElement("div");
      menu.id = MENU_ID;
      menu.className = "art-class-menu";
      menu.setAttribute("role", "listbox");
      for (const choice of ["all", ...CLASSES]) {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "art-class-option";
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", String(choice === this.choice));
        option.textContent = labelOf(choice);
        option.addEventListener("click", (event) => {
          event.stopPropagation();
          closeMenu();
          this.show(choice);
        });
        menu.appendChild(option);
      }
      const rect = anchor.getBoundingClientRect();
      menu.style.left = `${rect.left + window.scrollX}px`;
      menu.style.top = `${rect.bottom + window.scrollY + 2}px`;
      document.body.appendChild(menu);
    }
  };
  function closeMenu() {
    document.getElementById(MENU_ID)?.remove();
  }
  function upgradeTabs() {
    const key = readKey();
    const own = ownClass();
    const start2 = own && own !== "A" ? own : "all";
    for (const list of document.querySelectorAll(SELECTORS4.classList)) {
      const track = list.id.replace("class-records-", "");
      const tab = document.querySelector(`a[href="#class-records-${track}"]`);
      if (!tab || tab.hasAttribute(PICKED_ATTR)) continue;
      tab.setAttribute(PICKED_ATTR, "");
      const label = document.createElement("span");
      label.className = "art-class-pick";
      tab.replaceChildren(label);
      tab.title = "";
      const picker = new TrackPicker(track, list, label);
      tab.addEventListener("click", () => {
        if (document.getElementById(MENU_ID)?.dataset.track === track) {
          closeMenu();
          return;
        }
        picker.openMenu(tab);
        const menu = document.getElementById(MENU_ID);
        if (menu) menu.dataset.track = track;
      });
      picker.show(key ? start2 : "all");
    }
  }
  function installClassRecords() {
    injectStyles();
    upgradeTabs();
    new MutationObserver(upgradeTabs).observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", (event) => {
      const menu = document.getElementById(MENU_ID);
      const target = event.target;
      if (!menu || menu.contains(target) || target?.closest(`[${PICKED_ATTR}]`)) return;
      closeMenu();
    });
  }

  // src/autumns-record-tracker/index.ts
  var PREFERENCES_PATH = "/preferences.php";
  var PAGE_PATH = "/page.php";
  function start(name, install) {
    try {
      install();
    } catch (error) {
      log("failed to start", name, error);
    }
  }
  var sid = new URLSearchParams(location.search).get("sid");
  if (location.pathname === PREFERENCES_PATH) {
    start("preferences panel", installPreferencesPanel);
  } else if (location.pathname === PAGE_PATH) {
    if (sid === "hof" && isEnabled(LEVEL_PROGRESS)) start("level progress", installLevelProgress);
    if (sid === "points" && isEnabled(POINT_MERIT_TRACKER)) start("merit tracker", installMeritTracker);
    if (sid === "racing" && isEnabled(RACING_CLASS_RECORDS)) start("class records", installClassRecords);
  }
})();
