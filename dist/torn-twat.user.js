// ==UserScript==
// @name         TornTwat
// @namespace    https://github.com/autumn-grey
// @version      1.0.0
// @description  T.W.A.T., the Torn War Analysis Tool, for The ZOO - Night Shift's lost ranked wars. Music: "Blame It on the Boogie" Sega Genesis remix (https://www.youtube.com/watch?v=-d3loT714ZM) and "Kiss From a Rose" by seals (https://www.youtube.com/watch?v=G76nKGWRLPU). Font: IBM 3270 by Ricardo Banffy and contributors, BSD 3-Clause (https://github.com/rbanffy/3270font).
// @author       AutumnGrey
// @license      MIT
// @match        https://www.torn.com/war.php?step=rankreport*
// @grant        GM_getResourceURL
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @resource     boogie https://raw.githubusercontent.com/autumn-grey/tornScripts/main/assets/torn-twat/boogie.mp3
// @resource     seals https://raw.githubusercontent.com/autumn-grey/tornScripts/main/assets/torn-twat/seals.mp3
// @resource     font https://raw.githubusercontent.com/autumn-grey/tornScripts/main/assets/torn-twat/3270-Regular.woff
// @connect      raw.githubusercontent.com
// @run-at       document-idle
// @noframes     true
// @downloadURL  https://raw.githubusercontent.com/autumn-grey/tornScripts/main/dist/torn-twat.user.js
// @updateURL    https://raw.githubusercontent.com/autumn-grey/tornScripts/main/dist/torn-twat.user.js
// ==/UserScript==

"use strict";
(() => {
  // src/torn-twat/bigtext.ts
  var GLYPHS = {
    T: ["████████╗", "╚══██╔══╝", "   ██║   ", "   ██║   ", "   ██║   ", "   ╚═╝   "],
    W: ["██╗    ██╗", "██║    ██║", "██║ █╗ ██║", "██║███╗██║", "╚███╔███╔╝", " ╚══╝╚══╝ "],
    A: [" █████╗ ", "██╔══██╗", "███████║", "██╔══██║", "██║  ██║", "╚═╝  ╚═╝"],
    ".": ["   ", "   ", "   ", "   ", "██╗", "╚═╝"],
    B: ["██████╗ ", "██╔══██╗", "██████╔╝", "██╔══██╗", "██████╔╝", "╚═════╝ "],
    L: ["██╗     ", "██║     ", "██║     ", "██║     ", "███████╗", "╚══════╝"],
    M: ["███╗   ███╗", "████╗ ████║", "██╔████╔██║", "██║╚██╔╝██║", "██║ ╚═╝ ██║", "╚═╝     ╚═╝"],
    E: ["███████╗", "██╔════╝", "█████╗  ", "██╔══╝  ", "███████╗", "╚══════╝"],
    D: ["██████╗ ", "██╔══██╗", "██║  ██║", "██║  ██║", "██████╔╝", "╚═════╝ "],
    P: ["██████╗ ", "██╔══██╗", "██████╔╝", "██╔═══╝ ", "██║     ", "╚═╝     "],
    H: ["██╗  ██╗", "██║  ██║", "███████║", "██╔══██║", "██║  ██║", "╚═╝  ╚═╝"],
    O: [" ██████╗ ", "██╔═══██╗", "██║   ██║", "██║   ██║", "╚██████╔╝", " ╚═════╝ "],
    K: ["██╗  ██╗", "██║ ██╔╝", "█████╔╝ ", "██╔═██╗ ", "██║  ██╗", "╚═╝  ╚═╝"],
    " ": ["   ", "   ", "   ", "   ", "   ", "   "]
  };
  function bigText(text) {
    const rows = ["", "", "", "", "", ""];
    for (const ch of text.toUpperCase()) {
      const glyph = GLYPHS[ch];
      if (!glyph) continue;
      glyph.forEach((part, i) => rows[i] += part);
    }
    return rows.map((r) => r.replace(/\s+$/, ""));
  }

  // src/torn-twat/seal.ts
  var SEAL = [
    "                        ::;;;;;;:.",
    "                   :+++++++++++++++++;.",
    "                .++++++++++++++++++++++++.",
    "               ;+++++++++++++++++++++++++++",
    "              ++++++++++++++++++++++++++++++",
    "             +++:  :+++++++++++++++++:  :+++;",
    "            +++  :&+ ++++++++++++++;  X&::+++.",
    "           .++;      ++++++++++++++:     :+++;",
    "           :+++;.  :++++++;;;;++++++;   ;+++++",
    "           ;++++++++++++.   ;&$ ++++++++++++++:",
    "           ;++++++++++++     :$ ++++++++++++++:",
    "           :++++++++X&&&&      X&&&$++++++++++;",
    "           :++++++x&&&&&&&$  $&&&&&&&$++++++++;",
    "           .+++++;&&&&&&&&x  &&&&&&&&&x+++++++;",
    "            ++++; ;&&&&&&&:  $&&&&&&&; +++++++;",
    "            +++++  &&&&&&. ;  &&&&&&$ :+++++++: ++++++;.",
    "            ++++++: .;;. .+++: :xx:  ;++++++++:.+++++++++++++:.",
    "            :++++++++;;+++++++++;;++++++++++++.:+++++++++++++++++:",
    "             +++++++++++++++++++++++++++++++++.:++++++++++++++++++++:",
    "             ++X$&&&&&&&&$X+++++++++++++++++++ :++++++++++++++++++++++;.",
    "             $&&&&&&&&&&&&&&&$+++++++++++++++++++++++++++++++++++++++++++",
    "             &&&&&&&&&&&&&&&&&&$++++++++++++++++++++++++++++++++++++++++++.",
    "            x&&&&&&&&&&&&&&&&&&&&++++++++++++++++++++++++++++++++++++++++++:",
    "            &&&&&&&&&&&&&&&&&&&&&&++++++++++++++++++++++++++++++++++++++++++.",
    "           :&&&&&&&&&&&&&&&&&&&&&&X+++++++++++++++++++++++++++++++++++++++++;",
    "           ;&&&&&&&&&&&&&&&&&&&&&&&++++++++++++++++++++++++++++++++++++++++++",
    "           $&&&&&&&&&&&&&&&&&&&&&&&X++++++++++++++++++++++++++++++++++++++++;",
    "           &&&&&&&&&&&&&&&&&&&&&&&&$++++++++++++++++++++++++++++++++++++++++.",
    "          .&&&&&&&&&&&&&&&&&&&&&&&&$+++++++++++++++++++++++++++++++++++++++. +++++++;:",
    "           &&&&&&&&&&&&&&&&&&&&&&&&$++++++++.;++++++++++++++++++++++++++++  ++++;..::;;;;:.",
    "           :&&&&&&&&&&&&&&&&&&&&&&$ +++++++++..+++++++++++++++++++++++++; :+++++++++++++++++:",
    "         :+  &&&&&&&&&&&&&&&&&&&&&x ++++++++++; :+++++++++++++++++++++;  ++++++++++++;;++;:..",
    "       .++++; .$&&&&&&&&&&&&&&&&&&x ++++++++++++: :+++++++++++++++++.   :++++++++++++++;:;++++.",
    "     :+++++++++:  +X&&&&&&&&&&&&&&+.++++++++++++++: :++++++++++;:           .:;+++++++++++++;",
    "   +++++++++++++;      .:;$&&&&&&&+.++++++++++++++++; :++;:",
    " +++++++++++++++                    ++++++++++++++++++:",
    "++: ;+++..++++:                     ;++++++++++++++++++;",
    "  :++++ .+++                         +++++++++++++++++++",
    "                                      +++++++++++++..+++:",
    "                                       ;++++ ;++++++..++",
    "                                         .++; ;++++++;"
  ];

  // src/torn-twat/index.ts
  var SEL = {
    report: ".war-report-wrap",
    headline: ".report-title-info",
    factionLink: 'a[href*="factions.php?step=profile&ID="]',
    chart: ".chart-placeholder",
    warList: ".f-war-list",
    sideNames: ".faction-names .name",
    sideNameText: '[class*="text___"]',
    memberList: (side) => `.tab-menu-cont.${side} ul.members-list > li`,
    profileLink: 'a[href*="profiles.php?XID="]',
    attacks: ".points",
    score: ".status"
  };
  var ZOO_ID = "47226";
  var CULPRIT_ID = "3866147";
  var CULPRIT_NAME = "DaPhok";
  var CUT_AT = 40;
  var RESOURCE_BASE = "https://raw.githubusercontent.com/autumn-grey/tornScripts/main/assets/torn-twat";
  var RESOURCES = {
    boogie: `${RESOURCE_BASE}/boogie.mp3`,
    seals: `${RESOURCE_BASE}/seals.mp3`,
    font: `${RESOURCE_BASE}/3270-Regular.woff`
  };
  var FONT_FAMILY = "TWAT 3270";
  var TEXT_COLS = 58;
  var TEXT_ROWS = 22;
  var MUTED_KEY = "tornTwat.muted";
  function factionId(link) {
    return /[?&]ID=(\d+)/.exec(link.getAttribute("href") ?? "")?.[1] ?? "";
  }
  function loserLink(report) {
    return report.querySelectorAll(`${SEL.headline} ${SEL.factionLink}`)[1] ?? null;
  }
  function zooMembers(report) {
    const loserName = (loserLink(report)?.textContent ?? "").trim().toLowerCase();
    let side = null;
    for (const el of report.querySelectorAll(SEL.sideNames)) {
      const name = (el.querySelector(SEL.sideNameText)?.textContent ?? el.textContent ?? "").trim().toLowerCase();
      if (loserName && name === loserName) side = el.classList.contains("right") ? "right" : "left";
    }
    const read = (s) => [...report.querySelectorAll(SEL.memberList(s))].flatMap((li) => {
      const link = li.querySelector(SEL.profileLink);
      if (!link) return [];
      const id = /XID=(\d+)/.exec(link.getAttribute("href") ?? "")?.[1] ?? "";
      const label = /View profile of (.+)/.exec(link.getAttribute("aria-label") ?? "")?.[1];
      const name = (label ?? link.textContent ?? "").trim();
      const text = (sel) => (li.querySelector(sel)?.textContent ?? "").trim();
      return [{ id, name, attacks: text(SEL.attacks), score: text(SEL.score) }];
    });
    if (side) return read(side);
    const left = read("left");
    return left.some((m) => m.id === CULPRIT_ID) ? left : read("right");
  }
  function dataUriBytes(uri) {
    const bin = atob(uri.slice(uri.indexOf(",") + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }
  function gmBytes(url) {
    return new Promise(
      (resolve, reject) => GM_xmlhttpRequest({
        url,
        method: "GET",
        responseType: "arraybuffer",
        onload: (r) => r.status === 200 ? resolve(r.response) : reject(new Error(`HTTP ${r.status}`)),
        onerror: reject,
        ontimeout: reject
      })
    );
  }
  var bytesCache = /* @__PURE__ */ new Map();
  function resourceBytes(name) {
    let p = bytesCache.get(name);
    if (!p) {
      p = (async () => {
        try {
          const url = GM_getResourceURL(name, false);
          if (url?.startsWith("data:")) return dataUriBytes(url);
          if (url) return await (await fetch(url)).arrayBuffer();
        } catch {
        }
        return gmBytes(RESOURCES[name]);
      })();
      bytesCache.set(name, p);
      p.catch(() => bytesCache.delete(name));
    }
    return p;
  }
  var fontReady = null;
  function loadFont() {
    fontReady ?? (fontReady = resourceBytes("font").then((buf) => new FontFace(FONT_FAMILY, buf).load()).then((face) => {
      document.fonts.add(face);
    }).catch((e) => console.warn("[TornTwat] font did not load", e)));
    return fontReady;
  }
  var CANCELLED = Symbol("cancelled");
  var Run = class {
    /** Sets up audio inside the click that started the show; browsers only allow sound after one. */
    constructor(muted) {
      this.cancelled = false;
      this.ctx = null;
      this.gain = null;
      this.sources = [];
      /** Clock reading at show time 0: AudioContext seconds, or performance.now() ms without audio. */
      this.origin = 0;
      this.pausedAt = null;
      this.waiters = [];
      this.raf = 0;
      /** Show time the script has scheduled up to. */
      this.cue = 0;
      this.tick = () => {
        if (this.cancelled) return;
        const now = this.now();
        const due = this.waiters.filter((w) => w.t <= now);
        this.waiters = this.waiters.filter((w) => w.t > now);
        for (const w of due) w.resolve();
        this.raf = requestAnimationFrame(this.tick);
      };
      try {
        this.ctx = new AudioContext();
        this.gain = this.ctx.createGain();
        this.gain.gain.value = muted ? 0 : 1;
        this.gain.connect(this.ctx.destination);
        void this.ctx.resume();
      } catch (e) {
        console.warn("[TornTwat] no audio", e);
        this.ctx = null;
      }
    }
    /** Decodes both songs and starts the clock, with the seals cover queued to start on the cut. */
    async start() {
      if (this.ctx) {
        try {
          const ctx = this.ctx;
          const decode = async (n) => ctx.decodeAudioData((await resourceBytes(n)).slice(0));
          const [boogie, seals] = await Promise.all([decode("boogie"), decode("seals")]);
          if (this.cancelled) throw CANCELLED;
          this.origin = ctx.currentTime + 0.1;
          this.play(boogie, this.origin);
          this.play(seals, this.origin + CUT_AT);
        } catch (e) {
          if (e === CANCELLED) throw e;
          console.warn("[TornTwat] audio did not load, running silent", e);
          void this.ctx?.close();
          this.ctx = null;
        }
      }
      if (!this.ctx) this.origin = performance.now();
      if (document.hidden) this.pause();
      this.tick();
    }
    play(buffer, when) {
      if (!this.ctx || !this.gain) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(this.gain);
      src.start(when);
      this.sources.push(src);
    }
    setMuted(muted) {
      if (this.gain) this.gain.gain.value = muted ? 0 : 1;
    }
    /** Seconds of show time so far. */
    now() {
      if (this.ctx) return this.ctx.currentTime - this.origin;
      return ((this.pausedAt ?? performance.now()) - this.origin) / 1e3;
    }
    /** Freezes the show and its music (the tab went into the background). */
    pause() {
      if (this.ctx) void this.ctx.suspend();
      else this.pausedAt ?? (this.pausedAt = performance.now());
    }
    resume() {
      if (this.ctx) void this.ctx.resume();
      else if (this.pausedAt !== null) {
        this.origin += performance.now() - this.pausedAt;
        this.pausedAt = null;
      }
    }
    /** Stops everything for good. */
    cancel() {
      if (this.cancelled) return;
      this.cancelled = true;
      cancelAnimationFrame(this.raf);
      for (const s of this.sources) {
        try {
          s.stop();
        } catch {
        }
      }
      void this.ctx?.close();
      for (const w of this.waiters.splice(0)) w.reject(CANCELLED);
    }
    until(t) {
      if (this.cancelled) return Promise.reject(CANCELLED);
      if (t <= this.now()) return Promise.resolve();
      return new Promise((resolve, reject) => this.waiters.push({ t, resolve, reject }));
    }
    /** Resolves on the next animation frame. */
    frame() {
      if (this.cancelled) return Promise.reject(CANCELLED);
      return new Promise((resolve, reject) => this.waiters.push({ t: -Infinity, resolve, reject }));
    }
    /** Waits a number of seconds after the last cue. */
    sleep(seconds) {
      this.cue += seconds;
      return this.until(this.cue);
    }
    /** Waits for a fixed point in the show. */
    at(t) {
      if (this.cue > t + 0.01) console.warn(`[TornTwat] timeline overran ${t}s by ${(this.cue - t).toFixed(2)}s`);
      this.cue = Math.max(this.cue, t);
      return this.until(this.cue);
    }
    /** Calls fn with progress 0 to 1 on every frame for the given seconds after the last cue. */
    async animate(seconds, fn) {
      const start = this.cue;
      const end = start + seconds;
      this.cue = end;
      for (; ; ) {
        const now = this.now();
        fn(Math.min(1, Math.max(0, (now - start) / seconds)));
        if (now >= end) return;
        await this.frame();
      }
    }
  };
  var Term = class {
    constructor(out, run) {
      this.out = out;
      this.run = run;
    }
    /** Adds a line straight away. */
    line(text = "", cls, parent = this.out) {
      const div = document.createElement("div");
      div.className = cls ? `ln ${cls}` : "ln";
      div.textContent = text || " ";
      parent.appendChild(div);
      this.scroll();
      return div;
    }
    /** Types a line out a character at a time, with the cursor on the end. */
    async type(text, seconds = text.length / 45, cls) {
      const div = this.line("", cls);
      const cursor = document.createElement("span");
      cursor.className = "cursor";
      cursor.textContent = "█";
      let shown = -1;
      await this.run.animate(seconds, (p) => {
        const n = Math.floor(p * text.length);
        if (n === shown) return;
        shown = n;
        div.textContent = text.slice(0, n);
        if (p < 1) div.appendChild(cursor);
      });
      div.textContent = text || " ";
      return div;
    }
    /** Prints lines with a fixed gap between each. */
    async lines(texts, gap, cls) {
      for (const t of texts) {
        this.line(t, cls);
        await this.run.sleep(gap);
      }
    }
    /**
     * A label with dots counting to 100%. The count moves in uneven hops the way a slow job reports.
     * Counts from `from` to `to` percent over the given seconds and returns the line for reuse.
     */
    async bar(label, seconds, from = 0, to = 100, div) {
      const el = div ?? this.line(label);
      const draw = (pct2) => {
        el.textContent = `${label} ${".".repeat(Math.round(pct2 / 5) + 1)}${pct2}%`;
      };
      let pct = from;
      let next = 0;
      draw(pct);
      await this.run.animate(seconds, (p) => {
        const now = this.run.now();
        if (p < 1 && now < next) return;
        next = now + 0.06 + Math.random() * 0.16;
        pct = Math.max(pct, Math.floor(from + (to - from) * p));
        draw(pct);
      });
      draw(to);
      return el;
    }
    /** A progress line drawn with filled squares. */
    blocks(div, label, pct) {
      const filled = Math.round(pct / 5);
      div.textContent = `${label} ${"■".repeat(filled)}${"-".repeat(20 - filled)} ${String(pct).padStart(3)}%`;
    }
    clear() {
      this.out.replaceChildren();
    }
    /** Keeps the newest line in view; old ones scroll off the top like a real terminal. */
    scroll() {
      this.out.scrollTop = this.out.scrollHeight;
    }
  };
  function hexLine(addr) {
    const bytes = Array.from({ length: 8 }, () => Math.floor(Math.random() * 256));
    const hex = bytes.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
    const chars = bytes.map((b) => b >= 33 && b < 127 ? String.fromCharCode(b) : ".").join("");
    return `${addr.toString(16).toUpperCase().padStart(6, "0")}  ${hex}  |${chars}|`;
  }
  async function bootSequence(t, run) {
    await run.sleep(0.3);
    await t.type("TWAT-OS 1.0 (C) 1974 TORN SYSTEMS CORP.", 0.8);
    t.line("MEMORY CHECK .... 640K OK");
    await run.sleep(0.4);
    await t.type("cd C:\\TORNSYSTEM\\LOG>rwstats.json", 0.9);
    await run.sleep(0.2);
    await t.lines(["dir set.. successful", "Checking existing server format"], 0.3);
    await t.bar("Verifying 5.6M", 0.8);
    await t.lines(["Format complete", "Data log transferred"], 0.3);
    await t.type(`faction profile&ID = ${ZOO_ID}`, 0.6);
    await run.sleep(0.2);
    t.line("Loading volume profile...");
    await run.sleep(0.25);
    let addr = 31744;
    for (let i = 0; i < 14; i++, addr += 8) {
      t.line(hexLine(addr), "dim");
      await run.sleep(0.07);
    }
    t.line("VOLUME PROFILE LOADED. TWAT.SYS RESIDENT.");
  }
  async function troubledBar(t, run, label, stall, recover) {
    const div = await t.bar(label, 0.8, 0, stall);
    await run.sleep(0.2);
    const lines = await recover();
    for (const el of lines) el.remove();
    await t.bar(label, 0.5, stall, 100, div);
    await run.sleep(0.25);
    div.remove();
  }
  async function attempt(t, run, text, seconds, result) {
    const div = await t.type(text, seconds);
    await run.sleep(0.2);
    div.textContent += ` ${result}`;
    return div;
  }
  async function analysis(t, run) {
    t.clear();
    await t.type("Performing T.W.A.T. Analysis", 0.8);
    t.line();
    const plain = async (label, seconds) => {
      const div = await t.bar(label, seconds);
      await run.sleep(0.25);
      div.remove();
    };
    await plain("Calculating RW Hit Effectiveness", 1.6);
    await plain("Assessing Shortfalls", 1.3);
    await troubledBar(t, run, "Bypassing security hypernodes", 63, async () => {
      const err = t.line("ERR 0x00C4: HYPERNODE HANDSHAKE REFUSED", "inverse");
      await run.sleep(0.6);
      const fb = await attempt(t, run, "FALLBACK: rerouting via auxiliary bus 7...", 0.6, "OK");
      await run.sleep(0.3);
      return [err, fb];
    });
    await plain("Engaging powercore fixtures", 1.3);
    await plain("Filtering carbon monoxide", 1.3);
    await troubledBar(t, run, "Diagnosing target selections", 41, async () => {
      const err = t.line("*** STACK OVERFLOW IN BLAME.SYS AT 0x0BAD ***", "flash");
      await run.sleep(0.4);
      const retry = await attempt(t, run, "Retrying...", 0.3, "FAILED");
      await run.sleep(0.15);
      const dump = t.line("Core dumped to c:\\local>oops.dmp", "dim");
      await run.sleep(0.2);
      const fix = await attempt(t, run, "Lowering standards to 12%...", 0.45, "ACCEPTED");
      await run.sleep(0.3);
      return [err, retry, dump, fix];
    });
    await plain("Summarising loss drawback", 0.9);
    await t.type("Performing T.W.A.T. Protocol", 0.7);
    await run.sleep(0.3);
    await t.type("Data absorption completed. Stored in c:\\local>log4962.txt", 1);
    await run.sleep(0.5);
  }
  var VERDICTS = ["NOMINAL", "ACCEPTABLE", "MARGINAL", "INCONCLUSIVE", "NOMINAL", "TOLERABLE"];
  async function profiles(t, run, members, end) {
    t.clear();
    await t.type("Analysing Profile Contributions", 0.8);
    t.line();
    const id = t.line("Player ID:   ");
    const name = t.line("Player Name: ");
    const verdict2 = t.line("Assessment:  ");
    t.line();
    const log = document.createElement("div");
    log.className = "log";
    t.line("", void 0).replaceWith(log);
    t.line();
    const progress = t.line();
    t.blocks(progress, "Protocol Completion", 0);
    const list = members.length ? members : [{ id: CULPRIT_ID, name: CULPRIT_NAME, attacks: "", score: "" }];
    const step = Math.max(0.05, (end - 0.4 - run.cue) / list.length);
    for (const [i, m] of list.entries()) {
      id.textContent = `Player ID:   ${m.id}`;
      name.textContent = `Player Name: ${m.name}`;
      verdict2.textContent = `Assessment:  ${VERDICTS[i % VERDICTS.length] ?? "NOMINAL"}`;
      const stats = [m.attacks && `${m.attacks} hits`, m.score].filter(Boolean).join("  ");
      t.line(`> ${m.id.padEnd(8)} ${m.name.slice(0, 18).padEnd(18)} ${stats.padEnd(16)} OK`, void 0, log);
      log.scrollTop = log.scrollHeight;
      t.blocks(progress, "Protocol Completion", Math.round((i + 1) / list.length * 100));
      await run.sleep(step);
    }
    await run.at(end);
  }
  async function verdict(t, run) {
    t.clear();
    await run.sleep(0.3);
    await t.type("T.W.A.T. ASSESSMENT COMPLETE", 0.9, "bright");
    t.line();
    t.line();
    await run.sleep(0.4);
    t.line("WAR LOSS CULPRIT VERIFIED", "flash bright");
  }
  async function sealRise(screen, out, run) {
    screen.classList.add("black");
    const stage = document.createElement("div");
    stage.className = "stage";
    const title = document.createElement("pre");
    title.className = "art title hidden";
    title.textContent = bigText("BLAME DAPHOK").join("\n");
    const sea = document.createElement("div");
    sea.className = "sea";
    stage.append(title, sea);
    out.replaceChildren(stage);
    await run.sleep(0.4);
    for (const row of SEAL) {
      const pre = document.createElement("pre");
      pre.className = "art row";
      pre.textContent = row || " ";
      sea.appendChild(pre);
      await run.sleep(0.15);
    }
    await run.sleep(0.5);
    title.classList.remove("hidden");
    title.classList.add("flash");
  }
  async function show(screen, out, run, members) {
    const t = new Term(out, run);
    await bootSequence(t, run);
    await run.at(8);
    await analysis(t, run);
    await run.at(26.4);
    await profiles(t, run, members, 36);
    await verdict(t, run);
    await run.at(CUT_AT);
    await sealRise(screen, out, run);
  }
  var CSS = `
:host { display: block; margin: 10px 0; }
.wrap {
  --green: #33ff66;
  --dim: #1f9940;
  --glow: 0 0 2px rgba(51, 255, 102, 0.9), 0 0 8px rgba(51, 255, 102, 0.45);
  --text: 14px;
  --fit: 800px;
  --ratio: 0.5;
  font-family: "${FONT_FAMILY}", "IBM 3270", "Courier New", monospace;
  color: var(--green);
  font-size: var(--text);
  line-height: 1.25;
}
.controls { display: flex; justify-content: flex-end; gap: 6px; margin-bottom: 6px; }
button {
  font: inherit;
  color: var(--green);
  background: #000;
  border: 1px solid var(--green);
  text-shadow: var(--glow);
  cursor: pointer;
  padding: 0;
}
button:hover, button:focus-visible { background: var(--green); color: #000; text-shadow: none; outline: none; }
.ctl { width: 30px; height: 26px; display: flex; align-items: center; justify-content: center; font-size: 16px; }
.ctl svg { width: 18px; height: 18px; }
.screen {
  position: relative;
  background: #000;
  border: 2px dashed var(--green);
  box-shadow: 0 0 10px rgba(51, 255, 102, 0.25);
  padding: 12px;
  height: calc(var(--text) * 1.25 * ${TEXT_ROWS});
  overflow: hidden;
  text-shadow: var(--glow);
}
.screen::after {
  /* Scanlines over everything. */
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(to bottom, rgba(0, 0, 0, 0) 0, rgba(0, 0, 0, 0) 2px, rgba(0, 0, 0, 0.28) 3px);
}
.screen.black { border-color: transparent; box-shadow: none; height: auto; }
.out { height: 100%; overflow: hidden; }
.ln { white-space: pre; overflow: hidden; }
.dim { color: var(--dim); }
.bright { color: #b6ffc8; }
.inverse { background: var(--green); color: #000; text-shadow: none; display: inline-block; }
/* Hard on/off flashing at an even rate. Opacity on its own layer is redrawn by the graphics card,
   so the big glowing titles do not stutter when the page is busy repainting them. */
.flash, .cursor { animation: blink 1s linear infinite; will-change: opacity; }
.cursor { animation-duration: 0.6s; }
@keyframes blink { 0%, 49.99% { opacity: 1; } 50%, 100% { opacity: 0; } }
.log { height: calc(var(--text) * 1.25 * 10); overflow: hidden; }
pre { margin: 0; font: inherit; line-height: 1; white-space: pre; }
.home { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 4px; }
.home .art { font-size: min(calc(var(--fit) / 52), calc(var(--text) * 1.4)); margin-bottom: 14px; text-align: left; }
.go { padding: 6px 18px; margin-top: 18px; font-size: calc(var(--text) * 1.15); }
.stage {
  /* Font size for the seal scene: as wide as the screen allows, but short enough to fit the window. */
  --a: min(calc(var(--fit) / 96), calc(88vh / ${SEAL.length + 7}));
  display: flex; flex-direction: column; align-items: center; font-size: var(--a);
}
.stage .title { margin-bottom: var(--a); width: calc(var(--a) * var(--ratio) * 96); }
.hidden { visibility: hidden; }
.sea { height: calc(var(--a) * ${SEAL.length}); width: calc(var(--a) * var(--ratio) * 96); overflow: hidden; display: flex; flex-direction: column; justify-content: flex-end; }
.sea .row { flex: none; }
.collapsed { display: block; width: 100%; padding: 10px; border-style: dashed; border-width: 2px; }
.collapsed pre { font-size: min(calc(var(--fit) / 52), var(--text)); display: inline-block; text-align: left; }
.probe { position: absolute; visibility: hidden; white-space: pre; font-size: 100px; line-height: 1; }
`;
  var ICON_SOUND = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9c1.5 1.5 1.5 4.5 0 6M19 6c3 3 3 9 0 12"/></svg>`;
  var ICON_MUTED = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l6 6M22 9l-6 6"/></svg>`;
  var Panel = class {
    constructor(host, report) {
      this.report = report;
      this.run = null;
      this.muted = GM_getValue(MUTED_KEY, false);
      this.ratio = 0.5;
      this.root = host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = CSS;
      this.wrap = document.createElement("div");
      this.wrap.className = "wrap";
      this.probe = document.createElement("span");
      this.probe.className = "probe";
      this.probe.textContent = "M".repeat(20);
      this.root.append(style, this.wrap);
      new ResizeObserver(() => this.fit()).observe(host);
      void loadFont().then(() => this.fit());
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) this.run?.pause();
        else this.run?.resume();
      });
      this.collapse();
    }
    /** Sizes the text so a screen's worth of columns fits the width Torn gives us (phones are narrow). */
    fit() {
      this.wrap.appendChild(this.probe);
      const w = this.probe.getBoundingClientRect().width;
      if (w > 0) this.ratio = w / 2e3;
      this.probe.remove();
      const inner = Math.max(200, this.wrap.clientWidth - 28);
      const fit = inner / this.ratio;
      const text = Math.min(17, Math.max(8, fit / TEXT_COLS));
      this.wrap.style.setProperty("--fit", `${fit}px`);
      this.wrap.style.setProperty("--text", `${text}px`);
      this.wrap.style.setProperty("--ratio", String(this.ratio));
    }
    stop() {
      this.run?.cancel();
      this.run = null;
    }
    controls() {
      const bar = document.createElement("div");
      bar.className = "controls";
      const snd = document.createElement("button");
      snd.className = "ctl";
      const paint = () => {
        snd.innerHTML = this.muted ? ICON_MUTED : ICON_SOUND;
        snd.setAttribute("aria-label", this.muted ? "Sound off" : "Sound on");
      };
      paint();
      snd.addEventListener("click", () => {
        this.muted = !this.muted;
        GM_setValue(MUTED_KEY, this.muted);
        this.run?.setMuted(this.muted);
        paint();
      });
      const close = document.createElement("button");
      close.className = "ctl";
      close.textContent = "X";
      close.setAttribute("aria-label", "Close");
      close.addEventListener("click", () => this.collapse());
      bar.append(snd, close);
      return bar;
    }
    screen() {
      const screen = document.createElement("div");
      screen.className = "screen";
      const out = document.createElement("div");
      out.className = "out";
      screen.appendChild(out);
      this.wrap.replaceChildren(this.controls(), screen);
      return { screen, out };
    }
    /** The start screen with the Initiate button. */
    home() {
      this.stop();
      const { out } = this.screen();
      const box = document.createElement("div");
      box.className = "home";
      const title = document.createElement("pre");
      title.className = "art";
      title.textContent = bigText("T.W.A.T.").join("\n");
      const name = document.createElement("div");
      name.textContent = "Torn War Analysis Tool™";
      const ver = document.createElement("div");
      ver.className = "dim";
      ver.textContent = `v${"1.0.0"} 2026`;
      const go = document.createElement("button");
      go.className = "go";
      go.textContent = "Initiate Analysis";
      go.addEventListener("click", () => this.start());
      box.append(title, name, ver, go);
      out.appendChild(box);
      this.fit();
    }
    /** Runs the show from the top. */
    start() {
      this.stop();
      const run = new Run(this.muted);
      this.run = run;
      const { screen, out } = this.screen();
      const members = zooMembers(this.report);
      out.textContent = "";
      const t = new Term(out, run);
      t.line("INITIALISING...", "dim");
      void run.start().then(() => {
        out.replaceChildren();
        return show(screen, out, run, members);
      }).catch((e) => {
        if (e !== CANCELLED) console.error("[TornTwat]", e);
      });
    }
    /** Shrinks to the T.W.A.T. title and stops the show; clicking it goes back to the start screen. */
    collapse() {
      this.stop();
      const btn = document.createElement("button");
      btn.className = "collapsed";
      btn.setAttribute("aria-label", "Open T.W.A.T.");
      const pre = document.createElement("pre");
      pre.textContent = bigText("T.W.A.T.").join("\n");
      btn.appendChild(pre);
      btn.addEventListener("click", () => this.home());
      this.wrap.replaceChildren(btn);
    }
  };
  var seen = /* @__PURE__ */ new WeakSet();
  function tryMount() {
    const report = document.querySelector(SEL.report);
    if (!report || seen.has(report)) return;
    const loser = loserLink(report);
    if (!loser) return;
    if (factionId(loser) !== ZOO_ID) {
      seen.add(report);
      return;
    }
    const chart = report.querySelector(SEL.chart);
    const list = report.querySelector(SEL.warList);
    if (!chart && !list) return;
    seen.add(report);
    const host = document.createElement("div");
    host.className = "torn-twat-host";
    if (chart) chart.after(host);
    else list?.before(host);
    new Panel(host, report);
  }
  tryMount();
  new MutationObserver(tryMount).observe(document.body, { childList: true, subtree: true });
})();
