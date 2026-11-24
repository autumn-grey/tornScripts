// ==UserScript==
// @name         Chat Enhanced - Summary ENHANCED
// @namespace    https://github.com/autumn-grey
// @version      1.0.5
// @description  Summarises chat but better
// @author       AutumnGrey
// @license      MIT
// @match        https://www.torn.com/*
// @grant        none
// @run-at       document-idle
// @noframes     true
// @downloadURL  https://raw.githubusercontent.com/autumn-grey/tornScripts/main/dist/chat-enhanced-summary-enhanced.user.js
// @updateURL    https://raw.githubusercontent.com/autumn-grey/tornScripts/main/dist/chat-enhanced-summary-enhanced.user.js
// ==/UserScript==

"use strict";
(() => {
  // src/shared/hashedClass.ts
  function hashedClass(name, atStart = false) {
    const forms = [`${name}___`, `_${name}_`];
    const parts = atStart ? forms.flatMap((form) => [`[class^="${form}"]`, `[class*=" ${form}"]`]) : forms.map((form) => `[class*="${form}"]`);
    return `:is(${parts.join(", ")})`;
  }

  // src/chat-enhanced-summary-enhanced/chat.ts
  var SELECTORS = {
    root: "#chatRoot",
    sender: `${hashedClass("sender")}, [class*="message__sender"]`,
    text: `${hashedClass("message")}, [class*="message__text"]`,
    header: `${hashedClass("header")}, [class*="chat-box-header"]`
  };
  var MAX_MESSAGES = 300;
  var STEP_DELAY = 130;
  var LOAD_DELAY = 900;
  var MAX_STEPS = 400;
  var BOX_ATTR = "data-adc";
  var OPEN_CLASS = "adc-open";
  function wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  function scrolls(el) {
    const o = getComputedStyle(el).overflowY;
    return o === "auto" || o === "scroll";
  }
  function findScroller(node, stop) {
    let p = node.parentElement;
    while (p && p !== stop && p !== document.body) {
      if (scrolls(p)) return p;
      p = p.parentElement;
    }
    return null;
  }
  function findBox(scroller) {
    let p = scroller.parentElement;
    for (let tries = 0; p && tries < 6; tries++) {
      const h = p.querySelector(SELECTORS.header);
      if (h && !scroller.contains(h)) return [p, h];
      p = p.parentElement;
    }
    return null;
  }
  function tornOwned(el) {
    return !!el && typeof el.className === "string" && el.className.includes("___");
  }
  function tornParts(header) {
    const parts = [];
    const keep = (r) => {
      if (r.width && r.height) parts.push({ left: r.left, right: r.right });
    };
    const walker = document.createTreeWalker(header, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent?.trim() || !tornOwned(n.parentElement)) continue;
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) keep(r);
    }
    header.querySelectorAll('button, [role="button"], svg').forEach((el) => {
      if (el.closest(`.${OPEN_CLASS}`)) return;
      if (tornOwned(el) || el.tagName.toLowerCase() === "svg" && tornOwned(el.parentElement)) {
        keep(el.getBoundingClientRect());
      }
    });
    return parts;
  }
  function titleGap(header) {
    const box = header.getBoundingClientRect();
    const parts = tornParts(header).sort((a, b) => b.right - a.right);
    const first = parts[0];
    if (!first) return [box.left, box.right];
    let end = first.left;
    for (const p of parts) if (p.right >= end - 10) end = Math.min(end, p.left);
    let start2 = box.left;
    for (const p of parts) if (p.right < end) start2 = Math.max(start2, p.right);
    return [start2, end];
  }
  function placeButton(header) {
    const btn = header.querySelector(`:scope > .${OPEN_CLASS}`);
    if (!btn) return;
    const box = header.getBoundingClientRect();
    if (!box.width) return;
    const [start2, end] = titleGap(header);
    const centre = (start2 + end) / 2 - box.left - header.clientLeft;
    btn.style.left = `${Math.round(centre - btn.offsetWidth / 2)}px`;
  }
  function addButton(box, header, scroller, onOpen) {
    box.setAttribute(BOX_ATTR, "1");
    box._adcScroller = scroller;
    if (header.querySelector(`.${OPEN_CLASS}`)) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = OPEN_CLASS;
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.2l3.2 7 7.6.8-5.7 5.1 1.6 7.5L12 17.8l-6.7 3.8 1.6-7.5L1.2 9l7.6-.8z"/></svg><span>Σ</span>';
    btn.title = `Word cloud of the last ${MAX_MESSAGES} messages`;
    btn.addEventListener("mousedown", (e) => e.stopPropagation());
    btn.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: true });
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const title = (header.textContent ?? "").replace(/Σ/g, "").trim().slice(0, 40) || "Chat";
      onOpen(box, box._adcScroller ?? scroller, title);
    });
    if (getComputedStyle(header).position === "static") header.style.position = "relative";
    header.appendChild(btn);
    placeButton(header);
    new ResizeObserver(() => placeButton(header)).observe(header);
  }
  function lookForChats(onOpen) {
    const root = document.querySelector(SELECTORS.root) ?? document.body;
    root.querySelectorAll(`[${BOX_ATTR}]`).forEach((box) => {
      if (!box._adcScroller?.isConnected) {
        box.removeAttribute(BOX_ATTR);
        return;
      }
      const h = box.querySelector(SELECTORS.header);
      if (!h) return;
      if (!h.querySelector(`.${OPEN_CLASS}`)) addButton(box, h, box._adcScroller, onOpen);
      else placeButton(h);
    });
    const done = /* @__PURE__ */ new Set();
    root.querySelectorAll(SELECTORS.sender).forEach((s) => {
      if (s.closest(`[${BOX_ATTR}]`)) return;
      const sc = findScroller(s, root);
      if (!sc || done.has(sc)) return;
      done.add(sc);
      const found = findBox(sc);
      if (found) addButton(found[0], found[1], sc, onOpen);
    });
  }
  function isReaction(text) {
    if (!/\p{Extended_Pictographic}/u.test(text)) return false;
    const left = text.replace(/^\s*>.*$/gm, " ").replace(/"[^"]*"|“[^”]*”|«[^»]*»|\[[^\]]*\]/g, " ").replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}‍️⃣]/gu, " ").replace(/[\s\p{P}\p{S}]+/gu, "");
    return left.length === 0;
  }
  function movingScroller(sc) {
    let p = sc.querySelector(SELECTORS.sender)?.parentElement ?? null;
    while (p && p !== document.body && !p.hasAttribute(BOX_ATTR)) {
      if (scrolls(p) && p.scrollHeight > p.clientHeight + 8) return p;
      p = p.parentElement;
    }
    return sc;
  }
  function sendersIn(el) {
    const out = [];
    el.querySelectorAll(SELECTORS.sender).forEach((s) => {
      const outer = s.parentElement?.closest(SELECTORS.sender);
      if (!outer || !el.contains(outer)) out.push(s);
    });
    return out;
  }
  function rowFor(sender, sc) {
    let row = sender;
    while (row.parentElement && row.parentElement !== sc && sc.contains(row.parentElement)) {
      if (sendersIn(row.parentElement).length > 1) break;
      row = row.parentElement;
    }
    return row === sender ? sender.parentElement ?? sender : row;
  }
  function textFor(row, sender, rawName) {
    const t = row.querySelector(SELECTORS.text);
    if (t && !t.contains(sender) && !sender.contains(t) && t.textContent?.trim()) {
      return t.textContent.trim();
    }
    sender.setAttribute("data-adc-me", "1");
    const copy = row.cloneNode(true);
    sender.removeAttribute("data-adc-me");
    copy.querySelectorAll("[data-adc-me], button, svg, style, script").forEach((x) => x.remove());
    let text = (copy.textContent ?? "").trim();
    if (text.startsWith(rawName)) text = text.slice(rawName.length).trim();
    return text.replace(/^:\s*/, "");
  }
  function readRow(sender, sc, scVisible) {
    const rawName = (sender.textContent ?? "").trim();
    const name = rawName.replace(/:\s*$/, "").replace(/^[^\p{L}\p{N}_]+/u, "").trim();
    if (!name) return null;
    const text = textFor(rowFor(sender, sc), sender, rawName);
    if (!text) return null;
    const hidden = scVisible && sender.getClientRects().length === 0;
    const key = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 90) || text.slice(0, 20);
    return { id: `${name}|${key}`, name, text, reaction: hidden || isReaction(text) };
  }
  function readVisible(sc, seen) {
    const vis = sc.getClientRects().length > 0;
    const out = [];
    for (const s of sendersIn(sc)) {
      if (!seen.has(s)) seen.set(s, readRow(s, sc, vis));
      const m = seen.get(s);
      if (m) out.push(m);
    }
    return out;
  }
  function same(a, ai, b, bi, len) {
    for (let i = 0; i < len; i++) if (a[ai + i]?.id !== b[bi + i]?.id) return false;
    return true;
  }
  function stitch(all, chunk) {
    if (!chunk.length) return 0;
    if (!all.length) {
      all.push(...chunk);
      return chunk.length;
    }
    for (let i = 0; i + chunk.length <= all.length; i++) {
      if (same(all, i, chunk, 0, chunk.length)) return 0;
    }
    for (let p = 0; p < chunk.length; p++) {
      const len = Math.min(chunk.length - p, all.length);
      if (!same(chunk, p, all, 0, len)) continue;
      const newer = chunk.slice(p + len);
      all.unshift(...chunk.slice(0, p));
      all.push(...newer);
      return p + newer.length;
    }
    for (let q = Math.max(0, all.length - chunk.length); q < all.length; q++) {
      const len = all.length - q;
      if (!same(all, q, chunk, 0, len)) continue;
      all.push(...chunk.slice(len));
      return chunk.length - len;
    }
    all.unshift(...chunk);
    return chunk.length;
  }
  function countReal(list) {
    return list.reduce((n, m) => n + (m.reaction ? 0 : 1), 0);
  }
  async function readBack(scroller, progress, cancelled) {
    const sc = movingScroller(scroller);
    const flipped = getComputedStyle(sc).flexDirection === "column-reverse";
    const toBottom = () => {
      sc.scrollTop = flipped ? 0 : sc.scrollHeight;
    };
    const seen = /* @__PURE__ */ new WeakMap();
    const all = [];
    toBottom();
    await wait(250);
    stitch(all, readVisible(sc, seen));
    let stuck = 0;
    for (let i = 0; i < MAX_STEPS; i++) {
      if (countReal(all) >= MAX_MESSAGES || stuck >= 3 || cancelled()) break;
      const was = sc.scrollTop;
      const height = sc.scrollHeight;
      try {
        sc.dispatchEvent(new WheelEvent("wheel", { deltaY: -300, bubbles: true, cancelable: true }));
      } catch {
      }
      sc.scrollTop = was - Math.max(120, Math.round(sc.clientHeight * 0.7));
      await wait(STEP_DELAY);
      let got = stitch(all, readVisible(sc, seen));
      if (sc.scrollTop === was) {
        sc.scrollTop = was + 3;
        sc.scrollTop = was;
        sc.dispatchEvent(new Event("scroll", { bubbles: true }));
        await wait(LOAD_DELAY);
        got += stitch(all, readVisible(sc, seen));
        if (got || sc.scrollHeight > height + 4 || sc.scrollTop !== was) stuck = 0;
        else stuck++;
      }
      progress(countReal(all));
    }
    toBottom();
    return all.filter((m) => !m.reaction).slice(-MAX_MESSAGES);
  }

  // src/chat-enhanced-summary-enhanced/cloud.ts
  var LINES = ["ASK", "DIVA"];
  var MASK_FONT = '"Helvetica Neue LT Std", "HelveticaNeue-Black", "Helvetica Neue Black", "Helvetica Black", "Arial Black", "Helvetica Neue", Helvetica, Arial, sans-serif';
  var WORD_FONT = '"Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif';
  var MASK_SIZE = 520;
  var TRACKING = -0.085;
  var LINE_GAP = 0.1;
  var MARGIN = 24;
  var CELL = 4;
  var WORD_PAD = 2;
  var MAX_WORD = 120;
  var MIN_WORD = 9;
  var MAX_UNIQUE = 160;
  var VERTICAL_SHARE = 0.3;
  var BACKGROUND = "#ffffff";
  var PALETTE = ["#a0413b", "#3456c8", "#5c9f2e", "#8e2aa6", "#2ea4cc", "#7b3b8f"];
  var STOPWORDS = new Set(
    `the and for you that this with have not but are was all can get got just what your out from they them then than
  too its it's i'm im ive i've dont don't didnt didn't cant can't wont won't thats that's isnt isn't doesnt doesn't
  one will would could should about there their here been were has had him her his she who how why when where which
  any some more most much many very also now yes yeah yep nah nope lol lmao haha hahaha ok okay like well still only
  even into over back off our did does doing going gonna gotta want need know think see say said make made take took
  really right thing things mate guys anyone someone something nothing because cause though you're youre we're
  they're let let's lets ill i'll i'd id ya yea ur u these those other just bit way been being after before
  http https www com torn php`.split(/\s+/)
  );
  function countWords(texts) {
    const counts = /* @__PURE__ */ new Map();
    for (const text of texts) {
      const words = text.toLowerCase().replace(/https?:\/\/\S+/g, " ").match(/\p{L}[\p{L}\p{N}'’-]{2,}/gu);
      for (const raw of words ?? []) {
        const w = raw.replace(/’/g, "'").replace(/['-]+$/, "");
        if (w.length < 3 || STOPWORDS.has(w)) continue;
        counts.set(w, (counts.get(w) ?? 0) + 1);
      }
    }
    return [...counts.entries()].map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count).slice(0, MAX_UNIQUE);
  }
  function eStyle(word) {
    return word.replace(/e/g, () => {
      const roll = Math.random();
      const times = roll < 0.1 ? 3 : roll < 0.35 ? 2 : 1;
      return "E".repeat(times);
    });
  }
  function canvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available");
    return [c, ctx];
  }
  function buildGrid() {
    const [, probe] = canvas(1, 1);
    probe.font = `900 ${MASK_SIZE}px ${MASK_FONT}`;
    const track = MASK_SIZE * TRACKING;
    const cap = probe.measureText("H").actualBoundingBoxAscent;
    const lines = LINES.map((line) => {
      const letters = [...line].map((ch) => ({ ch, w: probe.measureText(ch).width }));
      const width = letters.reduce((s, l) => s + l.w, 0) + track * (letters.length - 1);
      return { letters, width };
    });
    const textW = Math.max(...lines.map((l) => l.width));
    const w = Math.ceil(textW + MARGIN * 2);
    const h = Math.ceil(cap * lines.length + cap * LINE_GAP * (lines.length - 1) + MARGIN * 2);
    const [, ctx] = canvas(w, h);
    ctx.fillStyle = "#000";
    ctx.font = probe.font;
    ctx.textBaseline = "alphabetic";
    lines.forEach((line, i) => {
      let x = (w - line.width) / 2;
      const y = MARGIN + cap * (i + 1) + cap * LINE_GAP * i;
      for (const l of line.letters) {
        ctx.fillText(l.ch, x, y);
        x += l.w + track;
      }
    });
    const px = ctx.getImageData(0, 0, w, h).data;
    const gw = Math.floor(w / CELL);
    const gh = Math.floor(h / CELL);
    const blocked = new Uint8Array(gw * gh);
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        let inside = true;
        for (let y = gy * CELL; inside && y < gy * CELL + CELL; y++) {
          for (let x = gx * CELL; x < gx * CELL + CELL; x++) {
            if ((px[(y * w + x) * 4 + 3] ?? 0) < 200) {
              inside = false;
              break;
            }
          }
        }
        blocked[gy * gw + gx] = inside ? 0 : 1;
      }
    }
    const grid = { w, h, gw, gh, blocked, sums: new Int32Array((gw + 1) * (gh + 1)) };
    rebuildSums(grid);
    return grid;
  }
  function rebuildSums(g) {
    const stride = g.gw + 1;
    for (let y = 0; y < g.gh; y++) {
      let row = 0;
      for (let x = 0; x < g.gw; x++) {
        row += g.blocked[y * g.gw + x] ?? 0;
        g.sums[(y + 1) * stride + x + 1] = (g.sums[y * stride + x + 1] ?? 0) + row;
      }
    }
  }
  function findSpot(g, cw, ch) {
    const stride = g.gw + 1;
    const s = g.sums;
    let pick = null;
    let seen = 0;
    for (let y = 0; y + ch <= g.gh; y++) {
      const top = y * stride;
      const bottom = (y + ch) * stride;
      for (let x = 0; x + cw <= g.gw; x++) {
        const n = s[bottom + x + cw] - s[top + x + cw] - s[bottom + x] + s[top + x];
        if (n !== 0) continue;
        seen++;
        if (Math.random() * seen < 1) pick = [x, y];
      }
    }
    return pick;
  }
  function block(g, x, y, cw, ch) {
    for (let yy = y; yy < y + ch; yy++) g.blocked.fill(1, yy * g.gw + x, yy * g.gw + x + cw);
    rebuildSums(g);
  }
  function tryPlace(g, ctx, text, size, vertical) {
    ctx.font = `bold ${size}px ${WORD_FONT}`;
    const m = ctx.measureText(text);
    const left = m.actualBoundingBoxLeft;
    const right = m.actualBoundingBoxRight;
    const ascent = m.actualBoundingBoxAscent;
    const descent = m.actualBoundingBoxDescent;
    const long = left + right + WORD_PAD;
    const short = ascent + descent + WORD_PAD;
    const cw = Math.ceil((vertical ? short : long) / CELL);
    const chh = Math.ceil((vertical ? long : short) / CELL);
    const spot = findSpot(g, cw, chh);
    if (!spot) return null;
    block(g, spot[0], spot[1], cw, chh);
    const colour = PALETTE[Math.floor(Math.random() * PALETTE.length)] ?? "#000";
    return { text, size, vertical, x: spot[0] * CELL, y: spot[1] * CELL, left, ascent, right, colour };
  }
  function placeShrinking(g, ctx, word, size) {
    const vertical = Math.random() < VERTICAL_SHARE;
    let s = Math.max(size, MIN_WORD);
    for (; ; ) {
      const text = eStyle(word);
      const placed = tryPlace(g, ctx, text, s, vertical) ?? tryPlace(g, ctx, text, s, !vertical);
      if (placed) return placed;
      if (s === MIN_WORD) return null;
      s = Math.max(MIN_WORD, Math.floor(s * 0.88));
    }
  }
  function breathe() {
    return new Promise((r) => setTimeout(r, 0));
  }
  async function drawCloud(words, progress) {
    const g = buildGrid();
    const [out, ctx] = canvas(g.w, g.h);
    const placed = [];
    const most = words[0]?.count ?? 1;
    const least = words[words.length - 1]?.count ?? 1;
    const span = Math.max(1, most - least);
    for (const [i, { word, count }] of words.entries()) {
      const size = Math.round(16 + (MAX_WORD - 16) * Math.pow((count - least) / span, 0.6));
      const p = placeShrinking(g, ctx, word, size);
      if (p) placed.push(p);
      if (i % 8 === 0) {
        progress(placed.length);
        await breathe();
      }
    }
    const pool = words.slice(0, 80);
    const weights = pool.map((w) => Math.sqrt(w.count));
    const total = weights.reduce((a, b) => a + b, 0);
    let misses = 0;
    for (let n = 0; pool.length && misses < 250 && n < 5e3; n++) {
      let r = Math.random() * total;
      let k = 0;
      while (k < pool.length - 1 && (r -= weights[k]) > 0) k++;
      const size = MIN_WORD + Math.floor(Math.random() * 22);
      const p = placeShrinking(g, ctx, pool[k].word, size);
      if (p) {
        placed.push(p);
        misses = 0;
      } else {
        misses++;
      }
      if (n % 20 === 0) {
        progress(placed.length);
        await breathe();
      }
    }
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, g.w, g.h);
    ctx.textBaseline = "alphabetic";
    const pad = WORD_PAD / 2;
    for (const p of placed) {
      ctx.save();
      ctx.font = `bold ${p.size}px ${WORD_FONT}`;
      ctx.fillStyle = p.colour;
      if (p.vertical) {
        ctx.translate(p.x + pad + p.ascent, p.y + pad + p.right);
        ctx.rotate(-Math.PI / 2);
      } else {
        ctx.translate(p.x + pad + p.left, p.y + pad + p.ascent);
      }
      ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
    return new Promise(
      (resolve, reject) => out.toBlob((b) => b ? resolve(b) : reject(new Error("Could not make the PNG")), "image/png")
    );
  }

  // src/chat-enhanced-summary-enhanced/styles.ts
  var POPUP_ID = "adc-popup";
  function addStyles() {
    const style = document.createElement("style");
    style.textContent = `
/* Sits on top of the header so it stays in front of any other script's icon there. */
.adc-open {
  position: absolute;
  top: 50%;
  left: 0;
  z-index: 50;
  width: 30px;
  height: 30px;
  margin: -15px 0 0;
  padding: 0;
  background: none;
  border: 0;
  cursor: pointer;
}
.adc-open svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  fill: #ffd21f;
  stroke: #8a6a00;
  stroke-width: .8;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, .6));
}
.adc-open span {
  position: relative;
  display: block;
  color: #222 !important;
  font: bold 14px/30px Arial, sans-serif;
  text-align: center;
  /* The star's body sits below the middle of its box, so the Σ drops to match. */
  padding-top: 2px;
}
.adc-open:hover svg { fill: #ffe25c; }

#${POPUP_ID} {
  position: fixed; inset: 0; z-index: 999999;
  display: flex; align-items: center; justify-content: center;
  padding: 8px; background: rgba(0, 0, 0, .6);
  color: #ddd !important;
}
#${POPUP_ID} * { color: inherit !important; }
#${POPUP_ID} .adc-win {
  display: flex; flex-direction: column;
  width: 100%; max-width: 760px; max-height: 92vh;
  background: #333; border-radius: 5px; box-shadow: 0 0 12px #000;
  font: 13px/17px Arial, Helvetica, sans-serif;
}
#${POPUP_ID} .adc-title {
  display: flex; justify-content: space-between; align-items: center;
  height: 34px; padding: 0 4px 0 10px;
  background: linear-gradient(to bottom, #555 0, #333 100%);
  border-radius: 5px 5px 0 0;
  color: #fff !important; font-weight: bold; text-shadow: 0 0 2px #000;
}
#${POPUP_ID} .adc-title span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
#${POPUP_ID} .adc-x {
  width: 30px; background: none; border: 0;
  color: #ccc !important; font-size: 22px; line-height: 30px; cursor: pointer;
}
#${POPUP_ID} .adc-body { padding: 10px; overflow: auto; text-align: center; }
#${POPUP_ID} .adc-body img { display: block; max-width: 100%; max-height: 74vh; margin: 0 auto; border-radius: 3px; }
#${POPUP_ID} .adc-foot {
  display: flex; justify-content: flex-end; gap: 6px; padding: 8px;
  background: #2b2b2b; border-top: 1px solid #111; border-radius: 0 0 5px 5px;
}
#${POPUP_ID} .adc-btn { min-width: 90px; }
#${POPUP_ID} .adc-btn:not(.torn-btn) {
  padding: 4px 12px; background: linear-gradient(to bottom, #646464 0, #3a3a3a 100%);
  border: 1px solid #111; border-radius: 5px; color: #eee !important; cursor: pointer;
}
#${POPUP_ID} .adc-btn[disabled] { opacity: .5; cursor: default; }
`;
    document.head.appendChild(style);
  }

  // src/chat-enhanced-summary-enhanced/index.ts
  var popup = null;
  var running = false;
  var imageUrl = "";
  function closePopup() {
    popup?.remove();
    popup = null;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = "";
  }
  function openPopup(title) {
    closePopup();
    popup = document.createElement("div");
    popup.id = POPUP_ID;
    popup.innerHTML = `
    <div class="adc-win">
      <div class="adc-title"><span></span><button type="button" class="adc-x">×</button></div>
      <div class="adc-body"></div>
      <div class="adc-foot"></div>
    </div>`;
    popup.querySelector(".adc-title span").textContent = `Ask Diva - ${title}`;
    popup.querySelector(".adc-x").onclick = closePopup;
    popup.addEventListener("click", (e) => {
      if (e.target === popup) closePopup();
    });
    document.body.appendChild(popup);
    return {
      body: popup.querySelector(".adc-body"),
      foot: popup.querySelector(".adc-foot")
    };
  }
  async function copyImage(png) {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
  }
  async function run(_box, scroller, title) {
    if (running) return;
    running = true;
    const { body, foot } = openPopup(title);
    const status = document.createElement("div");
    status.textContent = "Reading chat...";
    body.appendChild(status);
    const mine = popup;
    try {
      if (!scroller.isConnected) {
        status.textContent = "Lost the chat window, close and reopen it.";
        return;
      }
      const messages = await readBack(
        scroller,
        (n) => status.textContent = `Reading back... ${Math.min(n, MAX_MESSAGES)} / ${MAX_MESSAGES}`,
        () => popup !== mine
      );
      if (popup !== mine) return;
      const words = countWords(messages.map((m) => m.text));
      if (!words.length) {
        status.textContent = "Could not read any messages.";
        return;
      }
      status.textContent = "Drawing...";
      const png = await drawCloud(words, (n) => status.textContent = `Drawing... ${n} words`);
      if (popup !== mine) return;
      imageUrl = URL.createObjectURL(png);
      const img = document.createElement("img");
      img.src = imageUrl;
      img.alt = "Ask Diva word cloud";
      body.replaceChildren(img);
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "torn-btn adc-btn";
      copy.textContent = "Copy";
      copy.onclick = async () => {
        try {
          await copyImage(png);
          copy.textContent = "Copied";
        } catch (err) {
          console.error("[Chat Enhanced - Summary ENHANCED]", err);
          copy.textContent = "Copy failed";
        }
        setTimeout(() => copy.textContent = "Copy", 1500);
      };
      foot.appendChild(copy);
    } catch (err) {
      console.error("[Chat Enhanced - Summary ENHANCED]", err);
      status.textContent = `Something broke: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      running = false;
    }
  }
  function start() {
    addStyles();
    const onOpen = (box, sc, title) => void run(box, sc, title);
    let pending = null;
    new MutationObserver(() => {
      if (pending !== null) return;
      pending = window.setTimeout(() => {
        pending = null;
        lookForChats(onOpen);
      }, 800);
    }).observe(document.body, { childList: true, subtree: true });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closePopup();
    });
    lookForChats(onOpen);
  }
  start();
})();
