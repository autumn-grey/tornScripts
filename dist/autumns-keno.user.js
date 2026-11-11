// ==UserScript==
// @name         Autumn's Keno
// @namespace    https://github.com/autumn-grey
// @version      1.0.3
// @description  Records every Keno round you play, with your picks and the numbers drawn, to your own Google Sheet so every device shares one history. Shades the board by how often each number comes up or wins, and outlines the ten most drawn.
// @author       AutumnGrey
// @license      MIT
// @match        https://www.torn.com/page.php?sid=keno*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @run-at       document-idle
// @noframes     true
// @downloadURL  https://raw.githubusercontent.com/autumn-grey/tornScripts/main/dist/autumns-keno.user.js
// @updateURL    https://raw.githubusercontent.com/autumn-grey/tornScripts/main/dist/autumns-keno.user.js
// ==/UserScript==

"use strict";
(() => {
  // src/autumns-keno/board.ts
  var SELECTORS = {
    /** The whole game; the panel goes after it. */
    game: "#kenoGame",
    /** The 8 x 10 grid of numbers. */
    board: "#boardContainer",
    /** The bet shown under the board, like "10K". */
    bet: "#betAmount"
  };
  var CELL_PREFIX = "keno_item_";
  var NOT_PICKED = /* @__PURE__ */ new Set(["lost"]);
  function cell(n) {
    return document.getElementById(CELL_PREFIX + n);
  }
  function readPicks() {
    const picks = [];
    for (let n = 1; n <= 80; n++) {
      const tokens = [...cell(n)?.classList ?? []];
      if (tokens.some((t) => !NOT_PICKED.has(t))) picks.push(n);
    }
    return picks;
  }
  function readBet() {
    const text = document.querySelector(SELECTORS.bet)?.textContent?.trim().toUpperCase() ?? "";
    const match = /^([\d.,]+)\s*([KMB]?)$/.exec(text);
    if (!match?.[1]) return 0;
    const scale = { "": 1, K: 1e3, M: 1e6, B: 1e9 }[match[2] ?? ""] ?? 1;
    return Math.round(Number(match[1].replace(/,/g, "")) * scale);
  }
  function waitForBoard() {
    return new Promise((resolve) => {
      const found = document.querySelector(SELECTORS.board);
      if (found) return resolve(found);
      const observer = new MutationObserver(() => {
        const board = document.querySelector(SELECTORS.board);
        if (!board) return;
        observer.disconnect();
        resolve(board);
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  // src/autumns-keno/debug.ts
  var DEBUG_KEY = "AKN_DEBUG";
  function debugging() {
    try {
      return localStorage.getItem(DEBUG_KEY) === "1";
    } catch {
      return false;
    }
  }
  function log(...parts) {
    if (!debugging()) return;
    console.log("[AKN]", ...parts);
  }

  // src/autumns-keno/capture.ts
  function parseResult(text) {
    if (!text.includes("randomNumbers")) return null;
    try {
      const data = JSON.parse(text);
      if (!Array.isArray(data.randomNumbers) || typeof data.matches !== "number") return null;
      return { matches: data.matches, winnings: Number(data.winnings) || 0, randomNumbers: data.randomNumbers.map(Number) };
    } catch {
      return null;
    }
  }
  function toRound(result, snapshot) {
    const drawn = result.randomNumbers;
    let picks = snapshot.picks;
    const matched = picks.filter((n) => drawn.includes(n)).length;
    if (matched !== result.matches) {
      log("picks did not match the result", picks, drawn, result.matches);
      picks = [];
    }
    return {
      id: crypto.randomUUID(),
      time: (/* @__PURE__ */ new Date()).toISOString(),
      picks,
      drawn,
      matches: result.matches,
      bet: snapshot.bet,
      won: result.winnings
    };
  }
  function responseText(xhr) {
    try {
      if (xhr.responseType === "" || xhr.responseType === "text") return xhr.responseText;
      if (xhr.responseType === "json") return JSON.stringify(xhr.response);
    } catch {
    }
    return "";
  }
  function installCapture(onRound) {
    const page = unsafeWindow;
    const handle = (text, snapshot) => {
      const result = parseResult(text);
      if (result) onRound(toRound(result, snapshot));
    };
    const proto = page.XMLHttpRequest.prototype;
    const send = proto.send;
    proto.send = function(body) {
      const snapshot = { picks: readPicks(), bet: readBet() };
      this.addEventListener("load", () => handle(responseText(this), snapshot));
      return send.call(this, body);
    };
    const pageFetch = page.fetch;
    page.fetch = function(...args) {
      const snapshot = { picks: readPicks(), bet: readBet() };
      const reply = pageFetch.apply(this, args);
      reply.then((response) => response.clone().text()).then((text) => handle(text, snapshot)).catch(() => void 0);
      return reply;
    };
  }

  // src/autumns-keno/stats.ts
  var BALLS = 80;
  var CALLED = 10;
  var P_CALLED = CALLED / BALLS;
  function numberRecords(rounds) {
    const records = [];
    for (let n = 0; n <= BALLS; n++) {
      records.push({ number: n, drawn: 0, picked: 0, hits: 0, wins: 0, staked: 0, returned: 0 });
    }
    for (const round of rounds) {
      const called = new Set(round.drawn);
      for (const n of called) {
        const record = records[n];
        if (record) record.drawn++;
      }
      for (const n of round.picks) {
        const record = records[n];
        if (!record) continue;
        record.picked++;
        if (called.has(n)) record.hits++;
        if (round.won > round.bet) record.wins++;
        record.staked += round.bet;
        record.returned += round.won;
      }
    }
    return records;
  }
  function drawZ(drawn, rounds) {
    if (rounds === 0) return 0;
    const sd = Math.sqrt(rounds * P_CALLED * (1 - P_CALLED));
    return (drawn - rounds * P_CALLED) / sd;
  }

  // src/autumns-keno/heatmap.ts
  var HEAT_ATTR = "data-akn-heat";
  var TOP_ATTR = "data-akn-top";
  var TOP_COUNT = 10;
  var FULL_Z = 3;
  function drawColour(z) {
    const strength = Math.min(Math.abs(z) / FULL_Z, 1);
    const alpha = (0.08 + 0.5 * strength).toFixed(2);
    return z >= 0 ? `rgba(230, 40, 30, ${alpha})` : `rgba(30, 90, 230, ${alpha})`;
  }
  function winColour(rate, best) {
    const alpha = (0.1 + 0.5 * (best > 0 ? rate / best : 0)).toFixed(2);
    return `rgba(40, 190, 60, ${alpha})`;
  }
  function paintHeatmap(rounds, mode) {
    const records = numberRecords(rounds);
    const bestRate = Math.max(0, ...records.slice(1).map((r) => r.picked > 0 ? r.wins / r.picked : 0));
    const expected = (rounds.length * P_CALLED).toFixed(1);
    const top = new Set(
      records.slice(1).filter((r) => r.drawn > 0).sort((a, b) => b.drawn - a.drawn || a.number - b.number).slice(0, TOP_COUNT).map((r) => r.number)
    );
    for (let n = 1; n <= BALLS; n++) {
      const target = cell(n);
      const record = records[n];
      if (!target || !record) continue;
      target.toggleAttribute(TOP_ATTR, mode !== "off" && top.has(n));
      let colour = null;
      let title = "";
      if (mode === "drawn" && rounds.length > 0) {
        colour = drawColour(drawZ(record.drawn, rounds.length));
        title = `Drawn ${record.drawn} times in ${rounds.length} rounds (expected ${expected})`;
      } else if (mode === "wins" && record.picked > 0) {
        const rate = record.wins / record.picked;
        colour = winColour(rate, bestRate);
        title = `Profit in ${record.wins} of ${record.picked} rounds you picked it (${Math.round(rate * 100)}%)`;
      }
      if (colour) {
        target.setAttribute(HEAT_ATTR, "");
        target.style.setProperty("--akn-heat", colour);
        target.title = title;
      } else {
        target.removeAttribute(HEAT_ATTR);
        target.style.removeProperty("--akn-heat");
        target.removeAttribute("title");
      }
    }
  }

  // src/autumns-keno/sheet.ts
  function request(method, url, body) {
    return new Promise((resolve, reject) => {
      const details = {
        method,
        url,
        timeout: 3e4,
        onload: (response) => {
          try {
            resolve(JSON.parse(response.responseText));
          } catch {
            reject(new Error(`not JSON (HTTP ${response.status})`));
          }
        },
        onerror: () => reject(new Error("network error")),
        ontimeout: () => reject(new Error("timed out"))
      };
      if (body !== void 0) {
        details.data = body;
        details.headers = { "Content-Type": "text/plain;charset=utf-8" };
      }
      GM_xmlhttpRequest(details);
    });
  }
  function numbers(text) {
    return text.split(/\s+/).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 80);
  }
  async function fetchHistory(url) {
    const answer = await request("GET", url);
    if (!answer || answer.ok !== true || !Array.isArray(answer.rounds)) {
      throw new Error("not the Autumn's Keno web app");
    }
    return answer.rounds.map((r) => ({
      id: String(r.id),
      time: String(r.time),
      picks: numbers(String(r.picks)),
      drawn: numbers(String(r.drawn)),
      matches: Number(r.matches) || 0,
      bet: Number(r.bet) || 0,
      won: Number(r.won) || 0
    }));
  }
  async function postRounds(url, rounds) {
    const answer = await request("POST", url, JSON.stringify({ rounds }));
    if (!answer || answer.ok !== true) throw new Error("sheet refused the rounds");
    return Number(answer.added) || 0;
  }

  // src/autumns-keno/settings.ts
  var PREFIX = "AKN_";
  var SHEET_URL = "SHEET_URL";
  var PENDING = "PENDING";
  var HISTORY = "HISTORY";
  var HEAT_MODE = "HEAT_MODE";
  function readSetting(key, fallback) {
    return GM_getValue(PREFIX + key, fallback);
  }
  function writeSetting(key, value) {
    GM_setValue(PREFIX + key, value);
  }

  // src/autumns-keno/rounds.ts
  var history = readSetting(HISTORY, []);
  var pending = readSetting(PENDING, []);
  var state = readSetting(SHEET_URL, "") ? "syncing" : "no sheet";
  var flushing = false;
  var flushAgain = false;
  var listeners = /* @__PURE__ */ new Set();
  function notify() {
    for (const listener of listeners) listener();
  }
  function onRoundsChange(listener) {
    listeners.add(listener);
  }
  function allRounds() {
    const known = new Set(history.map((r) => r.id));
    const all = history.concat(pending.filter((r) => !known.has(r.id)));
    return all.sort((a, b) => a.time.localeCompare(b.time));
  }
  function syncStatus() {
    return { state, unsent: pending.length };
  }
  function addRound(round) {
    pending.push(round);
    writeSetting(PENDING, pending);
    notify();
    void flush();
  }
  async function flush() {
    const url = readSetting(SHEET_URL, "");
    if (!url || pending.length === 0) return;
    if (flushing) {
      flushAgain = true;
      return;
    }
    flushing = true;
    const batch = pending.slice();
    try {
      await postRounds(url, batch);
      const sent = new Set(batch.map((r) => r.id));
      const known = new Set(history.map((r) => r.id));
      history = history.concat(batch.filter((r) => !known.has(r.id)));
      pending = pending.filter((r) => !sent.has(r.id));
      writeSetting(HISTORY, history);
      writeSetting(PENDING, pending);
      state = "synced";
    } catch (error) {
      log("upload failed", error);
      state = "offline";
    } finally {
      flushing = false;
      notify();
    }
    if (flushAgain) {
      flushAgain = false;
      void flush();
    }
  }
  async function syncWithSheet() {
    const url = readSetting(SHEET_URL, "");
    if (!url) {
      state = "no sheet";
      notify();
      return;
    }
    state = "syncing";
    notify();
    try {
      history = await fetchHistory(url);
      writeSetting(HISTORY, history);
      state = "synced";
    } catch (error) {
      log("history fetch failed", error);
      state = "offline";
    }
    notify();
    await flush();
  }

  // src/autumns-keno/styles.ts
  var STYLE_ID = "akn-styles";
  var PANEL_ID = "akn-panel";
  var CSS = `
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
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  // src/autumns-keno/panel.ts
  var heatMode = readSetting(HEAT_MODE, "drawn");
  var sheetControl = null;
  var sheetStatus = null;
  function el(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function updateStatus(rounds) {
    if (!sheetStatus) return;
    const { state: state2, unsent } = syncStatus();
    let text = "no sheet set";
    let tone = "akn-warn";
    if (unsent > 0 && state2 !== "no sheet") text = `${unsent} waiting to save`;
    else if (state2 === "synced") [text, tone] = ["all saved", "akn-good"];
    else if (state2 === "syncing") text = "saving";
    else if (state2 === "offline") [text, tone] = ["can't reach sheet", "akn-bad"];
    sheetStatus.className = `akn-link ${tone}`;
    sheetStatus.textContent = `${rounds} rounds, ${text}`;
  }
  function render() {
    const rounds = allRounds();
    paintHeatmap(rounds, heatMode);
    updateStatus(rounds.length);
  }
  function buildSheetControl() {
    const control = el("span", "akn-control");
    if (readSetting(SHEET_URL, "")) control.classList.add("akn-hidden");
    control.appendChild(el("span", "", "Sheet"));
    const box = el("span", "akn-url-box");
    const input = el("input", "akn-url");
    input.type = "password";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.placeholder = "web app URL";
    input.value = readSetting(SHEET_URL, "");
    box.appendChild(input);
    const reveal = el("button", "akn-reveal", "show");
    reveal.type = "button";
    reveal.addEventListener("click", () => {
      const hidden = input.type === "password";
      input.type = hidden ? "text" : "password";
      reveal.textContent = hidden ? "hide" : "show";
    });
    box.appendChild(reveal);
    control.appendChild(box);
    const check = el("button", "torn-btn akn-btn", "Check");
    check.type = "button";
    control.appendChild(check);
    const result = el("span");
    control.appendChild(result);
    check.addEventListener("click", async () => {
      const url = input.value.trim();
      result.className = "";
      result.textContent = "checking";
      try {
        if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) throw new Error("not a web app URL");
        await fetchHistory(url);
        writeSetting(SHEET_URL, url);
        result.textContent = "";
        control.classList.add("akn-hidden");
        void syncWithSheet();
      } catch {
        result.className = "akn-bad";
        result.textContent = "invalid";
      }
    });
    return control;
  }
  function buildHeatControl() {
    const control = el("span", "akn-control");
    control.appendChild(el("span", "", "Heat map"));
    const modes = [
      ["drawn", "Drawn"],
      ["wins", "Wins"],
      ["off", "Off"]
    ];
    const buttons = [];
    for (const [mode, label] of modes) {
      const button = el("button", "torn-btn akn-btn", label);
      button.type = "button";
      button.classList.toggle("akn-active", mode === heatMode);
      button.addEventListener("click", () => {
        heatMode = mode;
        writeSetting(HEAT_MODE, mode);
        buttons.forEach((b, i) => b.classList.toggle("akn-active", modes[i]?.[0] === mode));
        render();
      });
      buttons.push(button);
      control.appendChild(button);
    }
    return control;
  }
  function installPanel() {
    injectStyles();
    const game = document.querySelector(SELECTORS.game);
    if (game && !document.getElementById(PANEL_ID)) {
      const panel = el("div", "akn-controls");
      panel.id = PANEL_ID;
      sheetStatus = el("span");
      sheetStatus.title = "Change sheet";
      sheetStatus.addEventListener("click", () => sheetControl?.classList.toggle("akn-hidden"));
      sheetControl = buildSheetControl();
      panel.append(buildHeatControl(), sheetStatus, sheetControl);
      game.after(panel);
    }
    onRoundsChange(render);
    render();
  }

  // src/autumns-keno/index.ts
  if (new URLSearchParams(location.search).get("sid") === "keno") {
    installCapture(addRound);
    void waitForBoard().then(() => {
      try {
        installPanel();
      } catch (error) {
        log("panel failed", error);
      }
      void syncWithSheet();
    });
  }
})();
