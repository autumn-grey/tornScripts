// ==UserScript==
// @name         Autumn's Note Doodles
// @namespace    https://github.com/autumn-grey
// @version      1.0.52
// @description  Lets you draw pics in your Torn notes tab. Save them to your device or copy them directly into chat using Pint-Shot-Riot's Chat enhancer script
// @author       AutumnGrey
// @license      MIT
// @match        https://www.torn.com/*
// @grant        none
// @run-at       document-idle
// @noframes     true
// @downloadURL  https://raw.githubusercontent.com/autumn-grey/tornScripts/main/dist/autumns-note-doodles.user.js
// @updateURL    https://raw.githubusercontent.com/autumn-grey/tornScripts/main/dist/autumns-note-doodles.user.js
// ==/UserScript==

"use strict";
(() => {
  // src/autumns-note-doodles/debug.ts
  var DEBUG_KEY = "AND_DEBUG";
  function debugging() {
    try {
      return localStorage.getItem(DEBUG_KEY) === "1";
    } catch {
      return false;
    }
  }
  function log(...parts) {
    if (!debugging()) return;
    console.log("[AND]", ...parts);
  }

  // src/shared/hashedClass.ts
  function hashedClass(name, atStart = false) {
    const forms = [`${name}___`, `_${name}_`];
    const parts = atStart ? forms.flatMap((form) => [`[class^="${form}"]`, `[class*=" ${form}"]`]) : forms.map((form) => `[class*="${form}"]`);
    return `:is(${parts.join(", ")})`;
  }

  // src/autumns-note-doodles/colours.ts
  function rgbOf(hex) {
    const value = parseInt(hex.slice(1), 16);
    return [value >> 16 & 255, value >> 8 & 255, value & 255];
  }
  function hexOf(r, g, b) {
    const part = (value) => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, "0");
    return `#${part(r)}${part(g)}${part(b)}`;
  }
  function hsvOf(hex) {
    const [r, g, b] = rgbOf(hex).map((value) => value / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const range = max - min;
    let hue = 0;
    if (range > 0) {
      if (max === r) hue = (g - b) / range % 6;
      else if (max === g) hue = (b - r) / range + 2;
      else hue = (r - g) / range + 4;
    }
    return [(hue * 60 + 360) % 360, max === 0 ? 0 : range / max, max];
  }
  function hexOfHsv(hue, saturation, value) {
    const chroma = value * saturation;
    const part = chroma * (1 - Math.abs(hue / 60 % 2 - 1));
    const sector = Math.floor(hue / 60) % 6;
    const [r, g, b] = [
      [chroma, part, 0],
      [part, chroma, 0],
      [0, chroma, part],
      [0, part, chroma],
      [part, 0, chroma],
      [chroma, 0, part]
    ][sector];
    const lift2 = value - chroma;
    return hexOf((r + lift2) * 255, (g + lift2) * 255, (b + lift2) * 255);
  }
  var RECENT_KEY = "AND_RECENT_COLOURS";
  var RECENT_MAX = 7;
  var recentWatchers = /* @__PURE__ */ new Set();
  function recentColours() {
    try {
      const kept = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
      return Array.isArray(kept) ? kept.filter((one) => typeof one === "string").slice(0, RECENT_MAX) : [];
    } catch {
      return [];
    }
  }
  function keepRecent(hex, replaceNewest) {
    const rest = recentColours().filter((one, index) => one !== hex && !(replaceNewest && index === 0));
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify([hex, ...rest].slice(0, RECENT_MAX)));
    } catch {
    }
    for (const watcher of recentWatchers) watcher();
  }
  function watchRecent(watcher) {
    recentWatchers.add(watcher);
  }
  var SQUARE = 150;
  var STRIP = 16;
  function colourPicker(onChange, onCommit) {
    const element = document.createElement("div");
    element.className = "doodle-picker";
    const squareBox = document.createElement("div");
    squareBox.className = "doodle-picker-square";
    const square = document.createElement("canvas");
    square.width = square.height = SQUARE;
    const ring = document.createElement("span");
    ring.className = "doodle-picker-ring";
    squareBox.append(square, ring);
    const stripBox = document.createElement("div");
    stripBox.className = "doodle-picker-strip";
    const strip = document.createElement("canvas");
    strip.width = STRIP;
    strip.height = SQUARE;
    const arrows = document.createElement("span");
    arrows.className = "doodle-picker-arrows";
    stripBox.append(strip, arrows);
    element.append(squareBox, stripBox);
    let hue = 0;
    let saturation = 1;
    let value = 1;
    const stripContext = strip.getContext("2d");
    if (stripContext) {
      const rainbow = stripContext.createLinearGradient(0, 0, 0, SQUARE);
      for (let step2 = 0; step2 <= 6; step2 += 1) rainbow.addColorStop(step2 / 6, hexOfHsv(step2 * 60 % 360, 1, 1));
      stripContext.fillStyle = rainbow;
      stripContext.fillRect(0, 0, STRIP, SQUARE);
    }
    const paint = () => {
      const context = square.getContext("2d");
      if (context) {
        context.fillStyle = hexOfHsv(hue, 1, 1);
        context.fillRect(0, 0, SQUARE, SQUARE);
        const white = context.createLinearGradient(0, 0, SQUARE, 0);
        white.addColorStop(0, "#ffffff");
        white.addColorStop(1, "rgba(255, 255, 255, 0)");
        context.fillStyle = white;
        context.fillRect(0, 0, SQUARE, SQUARE);
        const black = context.createLinearGradient(0, 0, 0, SQUARE);
        black.addColorStop(0, "rgba(0, 0, 0, 0)");
        black.addColorStop(1, "#000000");
        context.fillStyle = black;
        context.fillRect(0, 0, SQUARE, SQUARE);
      }
      ring.style.left = `${saturation * SQUARE}px`;
      ring.style.top = `${(1 - value) * SQUARE}px`;
      arrows.style.top = `${hue / 360 * SQUARE}px`;
    };
    const current = () => hexOfHsv(hue, saturation, value);
    const follow = (target, apply) => {
      target.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        target.setPointerCapture(event.pointerId);
        const at = (move) => {
          const rect = target.getBoundingClientRect();
          const x = Math.max(0, Math.min(1, (move.clientX - rect.left) / rect.width));
          const y = Math.max(0, Math.min(1, (move.clientY - rect.top) / rect.height));
          apply(x, y);
          paint();
          onChange(current());
        };
        at(event);
        const moved = (move) => at(move);
        const ended = () => {
          target.removeEventListener("pointermove", moved);
          target.removeEventListener("pointerup", ended);
          target.removeEventListener("pointercancel", ended);
          onCommit(current());
        };
        target.addEventListener("pointermove", moved);
        target.addEventListener("pointerup", ended);
        target.addEventListener("pointercancel", ended);
      });
    };
    follow(square, (x, y) => {
      saturation = x;
      value = 1 - y;
    });
    follow(strip, (_, y) => {
      hue = Math.min(359.9, y * 360);
    });
    paint();
    return {
      element,
      set(hex) {
        const [h, s, v] = hsvOf(hex);
        if (s > 0 && v > 0) hue = h;
        saturation = s;
        value = v;
        paint();
      }
    };
  }

  // src/autumns-note-doodles/gradient.ts
  function defaultGradient() {
    return {
      kind: "linear",
      repeat: "loop",
      x0: 0,
      y0: 0.5,
      x1: 1,
      y1: 0.5,
      path: [],
      shape: [],
      stops: [
        { at: 0, colour: "#000000", alpha: 1 },
        { at: 1, colour: "#ffffff", alpha: 1 }
      ]
    };
  }
  function copyGradient(gradient2) {
    return JSON.parse(JSON.stringify(gradient2));
  }
  function stopCss(stop) {
    return `rgba(${rgbOf(stop.colour).join(", ")}, ${stop.alpha})`;
  }
  function sorted(gradient2) {
    return gradient2.stops.slice().sort((a, b) => a.at - b.at);
  }
  function oneRun(gradient2, backwards) {
    const stops = sorted(gradient2);
    const first = stops[0];
    const last = stops[stops.length - 1];
    const run2 = [
      { at: 0, css: stopCss(first) },
      ...stops.map((stop) => ({ at: stop.at, css: stopCss(stop) })),
      { at: 1, css: stopCss(last) }
    ];
    return backwards ? run2.reverse().map((stop) => ({ at: 1 - stop.at, css: stop.css })) : run2;
  }
  var MOST_RUNS = 400;
  function addRuns(style, gradient2, from, to) {
    const span = to - from;
    for (let run2 = from; run2 < to; run2 += 1) {
      const backwards = gradient2.repeat === "reverse" && Math.abs(run2) % 2 === 1;
      for (const stop of oneRun(gradient2, backwards)) {
        style.addColorStop(Math.max(0, Math.min(1, (run2 + stop.at - from) / span)), stop.css);
      }
    }
  }
  var pathCache = /* @__PURE__ */ new Map();
  function gradientStyle(context, gradient2, width, height, dx = 0, dy = 0) {
    if (gradient2.kind === "path" || gradient2.kind === "shape") {
      const picture = gradient2.kind === "path" ? pathPicture(gradient2, width, height) : shapePicture(gradient2, width, height);
      const pattern = context.createPattern(picture, "no-repeat");
      pattern?.setTransform(new DOMMatrix().translate(dx, dy));
      return pattern ?? stopCss(sorted(gradient2)[0]);
    }
    const x0 = gradient2.x0 * width + dx;
    const y0 = gradient2.y0 * height + dy;
    const x1 = gradient2.x1 * width + dx;
    const y1 = gradient2.y1 * height + dy;
    const length = Math.max(1, Math.hypot(x1 - x0, y1 - y0));
    const corners = [
      [dx, dy],
      [dx + width, dy],
      [dx, dy + height],
      [dx + width, dy + height]
    ];
    if (gradient2.kind === "radial") {
      const furthest = Math.max(...corners.map(([x, y]) => Math.hypot(x - x0, y - y0)));
      const runs = Math.max(1, Math.min(MOST_RUNS, Math.ceil(furthest / length)));
      const style2 = context.createRadialGradient(x0, y0, 0, x0, y0, length * runs);
      addRuns(style2, gradient2, 0, runs);
      return style2;
    }
    const ux = (x1 - x0) / length;
    const uy = (y1 - y0) / length;
    const along = corners.map(([x, y]) => ((x - x0) * ux + (y - y0) * uy) / length);
    const half = MOST_RUNS / 2;
    const from = Math.max(-half, Math.min(0, Math.floor(Math.min(...along))));
    const to = Math.min(half, Math.max(1, Math.ceil(Math.max(...along))));
    const style = context.createLinearGradient(
      x0 + (x1 - x0) * from,
      y0 + (y1 - y0) * from,
      x0 + (x1 - x0) * to,
      y0 + (y1 - y0) * to
    );
    addRuns(style, gradient2, from, to);
    return style;
  }
  function gradientPixels(gradient2, width, height, across, down, dx = 0, dy = 0) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return new Uint8ClampedArray(width * height * 4);
    context.fillStyle = gradientStyle(context, gradient2, across, down, dx, dy);
    context.fillRect(0, 0, width, height);
    return context.getImageData(0, 0, width, height).data;
  }
  function gradientCss(gradient2) {
    return `linear-gradient(90deg, ${sorted(gradient2).map((stop) => `${stopCss(stop)} ${stop.at * 100}%`).join(", ")})`;
  }
  var CURVE_STEPS = 16;
  var MOST_ANCHORS = 10;
  function curveOf(path, width, height) {
    const points = path.map((spot) => ({ x: spot.x * width, y: spot.y * height }));
    if (points.length < 3) return points;
    const out = [];
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[Math.max(0, i - 1)];
      const b = points[i];
      const c = points[i + 1];
      const d = points[Math.min(points.length - 1, i + 2)];
      for (let step2 = 0; step2 < CURVE_STEPS; step2 += 1) {
        const t = step2 / CURVE_STEPS;
        const t2 = t * t;
        const t3 = t2 * t;
        const blend = (p, q, r, s) => 0.5 * (2 * q + (r - p) * t + (2 * p - 5 * q + 4 * r - s) * t2 + (3 * q - p - 3 * r + s) * t3);
        out.push({ x: blend(a.x, b.x, c.x, d.x), y: blend(a.y, b.y, c.y, d.y) });
      }
    }
    out.push(points[points.length - 1]);
    return out;
  }
  function anchorsOf(points) {
    if (points.length < 3) return points;
    const keep = /* @__PURE__ */ new Set([0, points.length - 1]);
    const tolerance = 0.02;
    const split = (from, to) => {
      const a = points[from];
      const b = points[to];
      const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      let furthest = 0;
      let at = -1;
      for (let i = from + 1; i < to; i += 1) {
        const p = points[i];
        const off = Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / length;
        if (off > furthest) {
          furthest = off;
          at = i;
        }
      }
      if (at < 0 || furthest < tolerance) return;
      keep.add(at);
      split(from, at);
      split(at, to);
    };
    split(0, points.length - 1);
    let anchors = [...keep].sort((a, b) => a - b).map((index) => points[index]);
    if (anchors.length > MOST_ANCHORS) {
      const step2 = (anchors.length - 1) / (MOST_ANCHORS - 1);
      anchors = Array.from({ length: MOST_ANCHORS }, (_, i) => anchors[Math.round(i * step2)]);
    }
    return anchors;
  }
  function pathPicture(gradient2, width, height) {
    const key = `${width}x${height}|${JSON.stringify(gradient2.path)}|${JSON.stringify(gradient2.stops)}`;
    const kept = pathCache.get(key);
    if (kept) return kept;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const context = canvas.getContext("2d");
    const curve = curveOf(gradient2.path, canvas.width, canvas.height);
    if (!context || curve.length < 2) return canvas;
    const reach = [0];
    for (let i = 1; i < curve.length; i += 1) {
      const a = curve[i - 1];
      const b = curve[i];
      reach.push((reach[i - 1] ?? 0) + Math.hypot(b.x - a.x, b.y - a.y));
    }
    const total = reach[reach.length - 1] || 1;
    const placeOf = (x, y) => {
      let best = Infinity;
      let place = 0;
      for (let i = 1; i < curve.length; i += 1) {
        const a = curve[i - 1];
        const b = curve[i];
        const ex = b.x - a.x;
        const ey = b.y - a.y;
        const span = ex * ex + ey * ey || 1;
        const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (y - a.y) * ey) / span));
        const px = a.x + ex * t - x;
        const py = a.y + ey * t - y;
        const distance = px * px + py * py;
        if (distance < best) {
          best = distance;
          place = ((reach[i - 1] ?? 0) + Math.sqrt(span) * t) / total;
        }
      }
      return place;
    };
    const step2 = Math.max(1, Math.round(Math.min(canvas.width, canvas.height) / 120));
    const columns = Math.ceil(canvas.width / step2) + 1;
    const rows = Math.ceil(canvas.height / step2) + 1;
    const grid = new Float32Array(columns * rows);
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) grid[row * columns + column] = placeOf(column * step2, row * step2);
    }
    const SHADES = 1024;
    const strip = document.createElement("canvas");
    strip.width = SHADES;
    strip.height = 1;
    const stripContext = strip.getContext("2d");
    if (!stripContext) return canvas;
    const sweep = stripContext.createLinearGradient(0, 0, SHADES, 0);
    for (const stop of oneRun(gradient2, false)) sweep.addColorStop(stop.at, stop.css);
    stripContext.fillStyle = sweep;
    stripContext.fillRect(0, 0, SHADES, 1);
    const shades = stripContext.getImageData(0, 0, SHADES, 1).data;
    const image = context.createImageData(canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y += 1) {
      const gy = y / step2;
      const row = Math.min(rows - 2, Math.floor(gy));
      const fy = gy - row;
      for (let x = 0; x < canvas.width; x += 1) {
        const gx = x / step2;
        const column = Math.min(columns - 2, Math.floor(gx));
        const fx = gx - column;
        const i = row * columns + column;
        const top = (grid[i] ?? 0) * (1 - fx) + (grid[i + 1] ?? 0) * fx;
        const bottom = (grid[i + columns] ?? 0) * (1 - fx) + (grid[i + columns + 1] ?? 0) * fx;
        const shade = Math.round((top * (1 - fy) + bottom * fy) * (SHADES - 1)) * 4;
        const o = (y * canvas.width + x) * 4;
        image.data[o] = shades[shade] ?? 0;
        image.data[o + 1] = shades[shade + 1] ?? 0;
        image.data[o + 2] = shades[shade + 2] ?? 0;
        image.data[o + 3] = shades[shade + 3] ?? 0;
      }
    }
    context.putImageData(image, 0, 0);
    if (pathCache.size >= 2) pathCache.delete(pathCache.keys().next().value);
    pathCache.set(key, canvas);
    return canvas;
  }
  function shadesOf(gradient2) {
    const strip = document.createElement("canvas");
    strip.width = 1024;
    strip.height = 1;
    const context = strip.getContext("2d");
    if (!context) return new Uint8ClampedArray(4096);
    const sweep = context.createLinearGradient(0, 0, 1024, 0);
    for (const stop of oneRun(gradient2, false)) sweep.addColorStop(stop.at, stop.css);
    context.fillStyle = sweep;
    context.fillRect(0, 0, 1024, 1);
    return context.getImageData(0, 0, 1024, 1).data;
  }
  var shapeCache = /* @__PURE__ */ new Map();
  var SHAPE_BINS = 720;
  function shapePicture(gradient2, width, height) {
    const outlineSpots = gradient2.shape ?? [];
    const key = `${width}x${height}|${gradient2.x0},${gradient2.y0}|${gradient2.repeat}|${JSON.stringify(outlineSpots)}|${JSON.stringify(gradient2.stops)}`;
    const kept = shapeCache.get(key);
    if (kept) return kept;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const context = canvas.getContext("2d");
    const outline = outlineSpots.map((spot) => ({ x: spot.x * canvas.width, y: spot.y * canvas.height }));
    if (!context || outline.length < 3) return canvas;
    const cx = gradient2.x0 * canvas.width;
    const cy = gradient2.y0 * canvas.height;
    const reach = new Float32Array(SHAPE_BINS);
    for (let bin = 0; bin < SHAPE_BINS; bin += 1) {
      const angle = bin / SHAPE_BINS * Math.PI * 2;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      let furthest = 0;
      for (let i = 0; i < outline.length; i += 1) {
        const a = outline[i];
        const b = outline[(i + 1) % outline.length];
        const ex = b.x - a.x;
        const ey = b.y - a.y;
        const across = dx * ey - dy * ex;
        if (Math.abs(across) < 1e-9) continue;
        const t = ((a.x - cx) * ey - (a.y - cy) * ex) / across;
        const u = ((a.x - cx) * dy - (a.y - cy) * dx) / across;
        if (t > 0 && u >= 0 && u <= 1) furthest = Math.max(furthest, t);
      }
      reach[bin] = Math.max(1, furthest);
    }
    const shades = shadesOf(gradient2);
    const image = context.createImageData(canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const px = x - cx;
        const py = y - cy;
        const turn = (Math.atan2(py, px) / (Math.PI * 2) + 1) % 1;
        const at = turn * SHAPE_BINS;
        const low = Math.floor(at) % SHAPE_BINS;
        const high = (low + 1) % SHAPE_BINS;
        const share = at - Math.floor(at);
        const distance = (reach[low] ?? 1) * (1 - share) + (reach[high] ?? 1) * share;
        const place = Math.hypot(px, py) / distance;
        const run2 = Math.floor(place);
        let along = place - run2;
        if (gradient2.repeat === "reverse" && run2 % 2 === 1) along = 1 - along;
        const shade = Math.round(along * 1023) * 4;
        const o = (y * canvas.width + x) * 4;
        image.data[o] = shades[shade] ?? 0;
        image.data[o + 1] = shades[shade + 1] ?? 0;
        image.data[o + 2] = shades[shade + 2] ?? 0;
        image.data[o + 3] = shades[shade + 3] ?? 0;
      }
    }
    context.putImageData(image, 0, 0);
    if (shapeCache.size >= 2) shapeCache.delete(shapeCache.keys().next().value);
    shapeCache.set(key, canvas);
    return canvas;
  }
  function middleOf(outline) {
    let area = 0;
    let x = 0;
    let y = 0;
    outline.forEach((a, i) => {
      const b = outline[(i + 1) % outline.length];
      const cross = a.x * b.y - b.x * a.y;
      area += cross;
      x += (a.x + b.x) * cross;
      y += (a.y + b.y) * cross;
    });
    if (Math.abs(area) < 1e-9) {
      return {
        x: outline.reduce((sum, p) => sum + p.x, 0) / (outline.length || 1),
        y: outline.reduce((sum, p) => sum + p.y, 0) / (outline.length || 1)
      };
    }
    return { x: x / (3 * area), y: y / (3 * area) };
  }
  var RECENT_KEY2 = "AND_RECENT_GRADIENTS";
  var RECENT_MAX2 = 7;
  function recentGradients() {
    try {
      const kept = JSON.parse(localStorage.getItem(RECENT_KEY2) ?? "[]");
      return Array.isArray(kept) ? kept.slice(0, RECENT_MAX2) : [];
    } catch {
      return [];
    }
  }
  function keepGradient(gradient2) {
    const text = JSON.stringify(gradient2);
    const rest = recentGradients().filter((one) => JSON.stringify(one) !== text);
    try {
      localStorage.setItem(RECENT_KEY2, JSON.stringify([gradient2, ...rest].slice(0, RECENT_MAX2)));
    } catch {
    }
  }
  function colourAt(gradient2, at) {
    const stops = sorted(gradient2);
    const after = stops.findIndex((stop) => stop.at >= at);
    const b = stops[after === -1 ? stops.length - 1 : after];
    const a = stops[Math.max(0, after - 1)];
    const t = b.at === a.at ? 0 : (at - a.at) / (b.at - a.at);
    const [ar, ag, ab] = rgbOf(a.colour);
    const [br, bg, bb] = rgbOf(b.colour);
    return {
      at,
      colour: hexOf(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t),
      alpha: a.alpha + (b.alpha - a.alpha) * t
    };
  }
  var PREVIEW = 180;
  var GRAB = 14;
  var DOUBLE_TAP_MS = 350;
  function gradientEditor(gradient2, ratio, onChange, onDrawPath, selectionOutline) {
    const element = document.createElement("div");
    element.className = "doodle-gradient";
    let picked2 = 0;
    const recent = document.createElement("div");
    recent.className = "doodle-recent";
    const choices = (options, read, pick) => {
      const row = document.createElement("div");
      row.className = "doodle-row";
      const buttons = options.map(([value, label]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "torn-btn doodle-btn";
        button.textContent = label;
        button.dataset.choice = value;
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          pick(value);
        });
        return button;
      });
      row.append(...buttons);
      return { row, light: () => buttons.forEach((button) => button.classList.toggle("doodle-on", button.dataset.choice === read())) };
    };
    const kinds = choices(
      [["linear", "Linear"], ["radial", "Radial"], ["path", "Path"], ["shape", "Match selection"]],
      () => gradient2.kind,
      (kind) => {
        if (kind === "path") {
          onDrawPath();
          return;
        }
        if (kind === "shape") {
          const outline = selectionOutline();
          if (!outline) return;
          gradient2.shape = outline;
          const middle = middleOf(outline);
          gradient2.x0 = middle.x;
          gradient2.y0 = middle.y;
        }
        if (kind === "radial" && gradient2.kind !== "radial") {
          gradient2.x0 = 0.5;
          gradient2.y0 = 0.5;
          gradient2.x1 = 0.5 + 0.5 * Math.min(1, 1 / ratio());
          gradient2.y1 = 0.5;
        } else if (kind === "linear" && gradient2.kind !== "linear") {
          gradient2.x0 = 0;
          gradient2.y0 = 0.5;
          gradient2.x1 = 1;
          gradient2.y1 = 0.5;
        }
        gradient2.kind = kind;
        changed();
      }
    );
    const repeats = choices(
      [["loop", "Loop"], ["reverse", "Reverse"]],
      () => gradient2.repeat,
      (repeat) => {
        gradient2.repeat = repeat;
        changed();
      }
    );
    const layout = document.createElement("canvas");
    layout.className = "doodle-gradient-layout";
    const barBox = document.createElement("div");
    barBox.className = "doodle-gradient-bar";
    const bar = document.createElement("canvas");
    bar.width = PREVIEW;
    bar.height = 14;
    const markers = document.createElement("div");
    markers.className = "doodle-gradient-markers";
    barBox.append(bar, markers);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "torn-btn doodle-btn";
    remove.textContent = "Remove stop";
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      if (gradient2.stops.length <= 2) return;
      gradient2.stops.splice(picked2, 1);
      picked2 = 0;
      changed();
    });
    const picker = colourPicker(
      (hex) => {
        const stop = gradient2.stops[picked2];
        if (!stop) return;
        stop.colour = hex;
        changed(false);
      },
      () => {
      }
    );
    const strength = document.createElement("input");
    strength.type = "range";
    strength.className = "doodle-range doodle-gradient-alpha";
    strength.min = "0";
    strength.max = "100";
    strength.title = "Stop opacity";
    strength.addEventListener("input", () => {
      const stop = gradient2.stops[picked2];
      if (!stop) return;
      stop.alpha = Number(strength.value) / 100;
      changed(false);
    });
    element.append(recent, kinds.row, repeats.row, layout, barBox, remove, picker.element, strength);
    const changed = (setPicker = true) => {
      draw(setPicker);
      onChange();
    };
    const handles = () => {
      const w = layout.width;
      const h = layout.height;
      const spots = gradient2.kind === "path" ? gradient2.path : gradient2.kind === "shape" ? [{ x: gradient2.x0, y: gradient2.y0 }] : [
        { x: gradient2.x0, y: gradient2.y0 },
        { x: gradient2.x1, y: gradient2.y1 }
      ];
      return spots.map((spot) => ({ x: spot.x * w, y: spot.y * h }));
    };
    const drawRecent = () => {
      recent.replaceChildren(
        ...recentGradients().map((one) => {
          const swatch = document.createElement("button");
          swatch.type = "button";
          swatch.className = "doodle-swatch doodle-gradient-swatch";
          swatch.style.background = gradientCss(one);
          swatch.title = "A gradient used before";
          swatch.setAttribute("aria-label", "A gradient used before");
          swatch.addEventListener("click", (event) => {
            event.stopPropagation();
            Object.assign(gradient2, copyGradient(one));
            picked2 = 0;
            changed();
          });
          return swatch;
        })
      );
    };
    const draw = (setPicker) => {
      drawRecent();
      kinds.light();
      repeats.light();
      const match = kinds.row.querySelector('[data-choice="shape"]');
      if (match) match.disabled = !selectionOutline();
      repeats.row.hidden = gradient2.kind === "path";
      const shape = ratio();
      const width = shape >= 1 ? PREVIEW : Math.round(PREVIEW * shape);
      const height = shape >= 1 ? Math.round(PREVIEW / shape) : PREVIEW;
      if (layout.width !== width) layout.width = width;
      if (layout.height !== height) layout.height = height;
      const context = layout.getContext("2d");
      if (context) {
        context.clearRect(0, 0, width, height);
        context.fillStyle = gradientStyle(context, gradient2, width, height);
        context.fillRect(0, 0, width, height);
        const points = handles();
        context.lineWidth = 1.5;
        context.strokeStyle = "#fff";
        context.beginPath();
        if (gradient2.kind === "path") {
          curveOf(gradient2.path, width, height).forEach((p, i) => i === 0 ? context.moveTo(p.x, p.y) : context.lineTo(p.x, p.y));
        } else if (gradient2.kind === "shape") {
          (gradient2.shape ?? []).forEach(
            (p, i) => i === 0 ? context.moveTo(p.x * width, p.y * height) : context.lineTo(p.x * width, p.y * height)
          );
          context.closePath();
        } else {
          points.forEach((p, i) => i === 0 ? context.moveTo(p.x, p.y) : context.lineTo(p.x, p.y));
        }
        context.stroke();
        points.forEach((point, index) => {
          context.beginPath();
          context.arc(point.x, point.y, index === 0 || index === points.length - 1 ? 6 : 4.5, 0, Math.PI * 2);
          context.fillStyle = index === 0 ? "#fff" : index === points.length - 1 ? "#0075ff" : "#9fd3ff";
          context.fill();
          context.strokeStyle = "#000";
          context.stroke();
        });
      }
      const barContext = bar.getContext("2d");
      if (barContext) {
        barContext.clearRect(0, 0, bar.width, bar.height);
        const sweep = barContext.createLinearGradient(0, 0, bar.width, 0);
        for (const stop2 of oneRun(gradient2, false)) sweep.addColorStop(stop2.at, stop2.css);
        barContext.fillStyle = sweep;
        barContext.fillRect(0, 0, bar.width, bar.height);
      }
      markers.replaceChildren(
        ...gradient2.stops.map((stop2, index) => {
          const marker = document.createElement("span");
          marker.className = `doodle-gradient-marker${index === picked2 ? " doodle-on" : ""}`;
          marker.style.left = `${stop2.at * 100}%`;
          marker.style.background = stop2.colour;
          holdMarker(marker, index);
          return marker;
        })
      );
      remove.disabled = gradient2.stops.length <= 2;
      const stop = gradient2.stops[picked2];
      if (stop) {
        if (setPicker) picker.set(stop.colour);
        strength.value = String(Math.round(stop.alpha * 100));
        strength.style.setProperty("--doodle-fill", `rgba(0, 117, 255, ${stop.alpha})`);
      }
    };
    let lastTap = { index: -1, time: 0 };
    const holdMarker = (marker, index) => {
      marker.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const now = Date.now();
        const doubleTap = event.pointerType !== "mouse" && lastTap.index === index && now - lastTap.time < DOUBLE_TAP_MS;
        lastTap = { index, time: now };
        const original = gradient2.stops[index];
        if (!original) return;
        if (event.altKey || doubleTap) {
          gradient2.stops.push({ ...original });
          picked2 = gradient2.stops.length - 1;
          lastTap = { index: -1, time: 0 };
        } else {
          picked2 = index;
        }
        draw(true);
        if (doubleTap) {
          onChange();
          return;
        }
        const stop = gradient2.stops[picked2];
        if (!stop) return;
        const slide = (move) => {
          const rect = bar.getBoundingClientRect();
          stop.at = Math.max(0, Math.min(1, (move.clientX - rect.left) / rect.width));
          changed(false);
        };
        const end = () => {
          document.removeEventListener("pointermove", slide);
          document.removeEventListener("pointerup", end);
          document.removeEventListener("pointercancel", end);
        };
        document.addEventListener("pointermove", slide);
        document.addEventListener("pointerup", end);
        document.addEventListener("pointercancel", end);
      });
    };
    bar.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const rect = bar.getBoundingClientRect();
      const at = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      gradient2.stops.push(colourAt(gradient2, at));
      picked2 = gradient2.stops.length - 1;
      changed();
    });
    layout.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const rect = layout.getBoundingClientRect();
      const scale = layout.width / rect.width;
      const x = (event.clientX - rect.left) * scale;
      const y = (event.clientY - rect.top) * scale;
      let nearest = -1;
      let best = GRAB * scale;
      handles().forEach((point, index) => {
        const distance = Math.hypot(x - point.x, y - point.y);
        if (distance <= best) {
          best = distance;
          nearest = index;
        }
      });
      if (nearest < 0) return;
      layout.setPointerCapture(event.pointerId);
      const drag2 = (move) => {
        const box = layout.getBoundingClientRect();
        const nx = Math.max(0, Math.min(1, (move.clientX - box.left) / box.width));
        const ny = Math.max(0, Math.min(1, (move.clientY - box.top) / box.height));
        if (gradient2.kind === "path") {
          gradient2.path[nearest] = { x: nx, y: ny };
        } else if (nearest === 0) {
          gradient2.x0 = nx;
          gradient2.y0 = ny;
        } else {
          gradient2.x1 = nx;
          gradient2.y1 = ny;
        }
        changed(false);
      };
      const end = () => {
        layout.removeEventListener("pointermove", drag2);
        layout.removeEventListener("pointerup", end);
        layout.removeEventListener("pointercancel", end);
      };
      layout.addEventListener("pointermove", drag2);
      layout.addEventListener("pointerup", end);
      layout.addEventListener("pointercancel", end);
    });
    draw(true);
    return { element, refresh: () => draw(true) };
  }

  // src/autumns-note-doodles/layers.ts
  var MAX_LAYERS = 10;
  var BLENDS = [
    { key: "normal", label: "Normal" },
    { key: "multiply", label: "Multiply" },
    { key: "screen", label: "Screen" },
    { key: "overlay", label: "Overlay" },
    { key: "soft-light", label: "Soft Light" },
    { key: "darken", label: "Darken" },
    { key: "lighten", label: "Lighten" },
    { key: "color", label: "Colour" }
  ];
  function newLayer(name, width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return {
      name,
      canvas,
      visible: true,
      opacity: 1,
      blend: "normal",
      clip: false,
      locked: false,
      text: null,
      png: null,
      dirty: true
    };
  }
  function propsOf(layer2) {
    const { name, visible, opacity: opacity2, blend, clip, locked, text } = layer2;
    return { name, visible, opacity: opacity2, blend, clip, locked, text: text ? { ...text } : null };
  }
  function newDoc(width, height) {
    const first = newLayer("Layer 1", width, height);
    return { background: "#ffffff", layers: [first], current: first, next: 2 };
  }
  var scratch = null;
  function spare(width, height) {
    scratch ?? (scratch = document.createElement("canvas"));
    if (scratch.width !== width || scratch.height !== height) {
      scratch.width = width;
      scratch.height = height;
    }
    const context = scratch.getContext("2d");
    context?.clearRect(0, 0, width, height);
    return context;
  }
  function operation(blend) {
    return blend === "normal" ? "source-over" : blend;
  }
  function stack(target, layers) {
    const context = target.getContext("2d");
    if (!context) return;
    let base = null;
    for (const layer2 of layers) {
      if (!layer2.clip || !base) {
        base = layer2;
        if (!layer2.visible) continue;
        context.globalAlpha = layer2.opacity;
        context.globalCompositeOperation = operation(layer2.blend);
        context.drawImage(layer2.canvas, 0, 0);
        continue;
      }
      if (!layer2.visible || !base.visible) continue;
      const cut = spare(target.width, target.height);
      if (!cut || !scratch) continue;
      cut.drawImage(layer2.canvas, 0, 0);
      cut.globalCompositeOperation = "destination-in";
      cut.drawImage(base.canvas, 0, 0);
      cut.globalCompositeOperation = "source-over";
      context.globalAlpha = layer2.opacity;
      context.globalCompositeOperation = operation(layer2.blend);
      context.drawImage(scratch, 0, 0);
    }
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
  }
  function composite(target, doc) {
    const context = target.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, target.width, target.height);
    if (doc.background) {
      context.fillStyle = doc.background;
      context.fillRect(0, 0, target.width, target.height);
    }
    stack(target, doc.layers);
  }
  var BEHIND = "#3a86ff";
  var OVER = "#ffbe0b";
  function mixChannel(blend, b, s) {
    switch (blend) {
      case "multiply":
        return b * s;
      case "screen":
        return b + s - b * s;
      case "overlay":
        return b <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s);
      case "soft-light": {
        if (s <= 0.5) return b - (1 - 2 * s) * b * (1 - b);
        const d = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);
        return b + (2 * s - 1) * (d - b);
      }
      case "darken":
        return Math.min(b, s);
      case "lighten":
        return Math.max(b, s);
      default:
        return s;
    }
  }
  function lightness([r, g, b]) {
    return 0.3 * (r ?? 0) + 0.59 * (g ?? 0) + 0.11 * (b ?? 0);
  }
  function overlapColour(blend) {
    const behind = rgbOf(BEHIND).map((value) => value / 255);
    const over = rgbOf(OVER).map((value) => value / 255);
    let mixed;
    if (blend === "color") {
      const shift = lightness(behind) - lightness(over);
      mixed = over.map((value) => value + shift);
      const light = lightness(mixed);
      const low = Math.min(...mixed);
      const high = Math.max(...mixed);
      if (low < 0) mixed = mixed.map((value) => light + (value - light) * light / (light - low));
      if (high > 1) mixed = mixed.map((value) => light + (value - light) * (1 - light) / (high - light));
    } else {
      mixed = behind.map((value, index) => mixChannel(blend, value, over[index] ?? 0));
    }
    return `rgb(${mixed.map((value) => Math.round(Math.max(0, Math.min(1, value)) * 255)).join(", ")})`;
  }
  function blendIcon(blend, size2 = 16) {
    return `<svg viewBox="0 0 24 24" width="${size2}" height="${size2}" aria-hidden="true">
<rect x="1.5" y="1.5" width="13" height="13" fill="${BEHIND}"/>
<circle cx="12.5" cy="12.5" r="8.5" fill="${OVER}"/>
<path d="M14.5 4.24A8.5 8.5 0 0 0 4.24 14.5H14.5Z" fill="${overlapColour(blend)}"/>
</svg>`;
  }

  // src/autumns-note-doodles/storage.ts
  var DB_NAME = "autumns-note-doodles";
  var STORE = "drawings";
  var OLD_PREFIXES = ["AND_DRAWING_", "AUE_DRAWING_"];
  var MOBILE_QUERY = "(max-width: 784px)";
  function isMobileView() {
    return matchMedia(MOBILE_QUERY).matches;
  }
  var opened = null;
  function database() {
    opened ?? (opened = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }));
    return opened;
  }
  async function run(mode, ask) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = ask(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error ?? request.error);
      transaction.onabort = () => reject(transaction.error ?? new Error("aborted"));
    });
  }
  async function readDrawing(id) {
    try {
      const stored = await run("readonly", (store) => store.get(id));
      if (stored) return stored;
    } catch {
    }
    return oldPicture(id);
  }
  async function writeDrawing(id, drawing) {
    try {
      await run("readwrite", (store) => store.put(drawing, id));
      forgetOld(id);
      return true;
    } catch {
      return false;
    }
  }
  function oldPicture(id) {
    for (const prefix of OLD_PREFIXES) {
      let text = null;
      try {
        text = localStorage.getItem(prefix + id);
      } catch {
      }
      if (text) return dataUrlToBlob(text);
    }
    return null;
  }
  function forgetOld(id) {
    for (const prefix of OLD_PREFIXES) {
      try {
        localStorage.removeItem(prefix + id);
      } catch {
      }
    }
  }
  async function moveOldPictures() {
    const found = [];
    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index) ?? "";
        const prefix = OLD_PREFIXES.find((one) => key.startsWith(one));
        const text = prefix ? localStorage.getItem(key) : null;
        if (prefix && text) found.push({ id: key.slice(prefix.length), text });
      }
    } catch {
      return 0;
    }
    let moved = 0;
    for (const { id, text } of found) {
      try {
        const existing = await run("readonly", (store) => store.get(id));
        if (!existing) await run("readwrite", (store) => store.put(dataUrlToBlob(text), id));
        forgetOld(id);
        moved += 1;
      } catch {
      }
    }
    return moved;
  }
  function dataUrlToBlob(text) {
    const [head = "", body = ""] = text.split(",", 2);
    const type = /data:([^;,]+)/.exec(head)?.[1] ?? "image/png";
    const bytes = atob(body);
    const array = new Uint8Array(bytes.length);
    for (let index = 0; index < bytes.length; index += 1) array[index] = bytes.charCodeAt(index);
    return new Blob([array], { type });
  }

  // src/autumns-note-doodles/text.ts
  var FONTS = [
    "Arial",
    "Verdana",
    "Trebuchet MS",
    "Georgia",
    "Times New Roman",
    "Courier New",
    "Impact",
    "Comic Sans MS"
  ];
  var LINE_HEIGHT = 1.25;
  function fontOf(look, scale = 1) {
    const family = /\s/.test(look.font) ? `"${look.font}"` : look.font;
    return `${look.italic ? "italic " : ""}${look.bold ? "bold " : ""}${look.size * scale}px ${family}, sans-serif`;
  }
  var ruler = null;
  function measureText(spec) {
    ruler ?? (ruler = document.createElement("canvas").getContext("2d"));
    const lines = spec.content.split("\n");
    if (ruler) ruler.font = fontOf(spec);
    const widths = lines.map((line) => ruler?.measureText(line).width ?? 0);
    const width = Math.max(spec.size * 0.5, ...widths);
    return { lines, widths, width, height: lines.length * spec.size * LINE_HEIGHT };
  }
  function middleOfText(spec) {
    const { width, height } = measureText(spec);
    return { x: spec.x + width / 2, y: spec.y + height / 2 };
  }
  function textCorners(spec) {
    const { width, height } = measureText(spec);
    const middle = { x: spec.x + width / 2, y: spec.y + height / 2 };
    const cos = Math.cos(spec.angle);
    const sin = Math.sin(spec.angle);
    return [
      [-width / 2, -height / 2],
      [width / 2, -height / 2],
      [width / 2, height / 2],
      [-width / 2, height / 2]
    ].map(([dx = 0, dy = 0]) => ({ x: middle.x + dx * cos - dy * sin, y: middle.y + dx * sin + dy * cos }));
  }
  function caretAt(spec, p) {
    ruler ?? (ruler = document.createElement("canvas").getContext("2d"));
    const { lines, width, height } = measureText(spec);
    const middle = middleOfText(spec);
    const cos = Math.cos(-spec.angle);
    const sin = Math.sin(-spec.angle);
    const dx = p.x - middle.x;
    const dy = p.y - middle.y;
    const x = dx * cos - dy * sin + width / 2;
    const y = dx * sin + dy * cos + height / 2;
    const row = Math.max(0, Math.min(lines.length - 1, Math.floor(y / (spec.size * LINE_HEIGHT))));
    let offset = 0;
    for (let index = 0; index < row; index += 1) offset += (lines[index]?.length ?? 0) + 1;
    const line = lines[row] ?? "";
    if (ruler) ruler.font = fontOf(spec);
    let best = 0;
    let bestGap = Infinity;
    for (let index = 0; index <= line.length; index += 1) {
      const gap = Math.abs((ruler?.measureText(line.slice(0, index)).width ?? 0) - x);
      if (gap > bestGap) break;
      bestGap = gap;
      best = index;
    }
    return offset + best;
  }
  function drawLines(context, spec, stroke) {
    const { lines, widths, width, height } = measureText(spec);
    const lineHeight = spec.size * LINE_HEIGHT;
    context.font = fontOf(spec);
    context.textBaseline = "middle";
    context.textAlign = "left";
    lines.forEach((line, index) => {
      const left = -width / 2;
      const middle = -height / 2 + lineHeight * (index + 0.5);
      if (stroke) context.strokeText(line, left, middle);
      else context.fillText(line, left, middle);
      if (spec.underline && line.length > 0) {
        const thick = Math.max(1, spec.size * 0.06);
        const under = middle + spec.size * 0.42;
        if (stroke) context.strokeRect(left, under, widths[index] ?? 0, thick);
        else context.fillRect(left, under, widths[index] ?? 0, thick);
      }
    });
  }
  function drawText(canvas, spec) {
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const middle = middleOfText(spec);
    const turn = (target) => {
      target.translate(middle.x, middle.y);
      target.rotate(spec.angle);
    };
    if (spec.outline && spec.outlineSize > 0) {
      const ring = document.createElement("canvas");
      ring.width = canvas.width;
      ring.height = canvas.height;
      const inked = ring.getContext("2d");
      if (inked) {
        turn(inked);
        inked.lineJoin = "round";
        inked.lineWidth = spec.outlineSize * 2;
        inked.strokeStyle = spec.outlineColour;
        inked.fillStyle = spec.outlineColour;
        drawLines(inked, spec, true);
        drawLines(inked, spec, false);
        const blur = spec.outlineSoft * (spec.outlineSize + spec.size * 0.1);
        if (blur > 0.3) {
          const shift = canvas.width + 100;
          context.save();
          context.shadowColor = spec.outlineColour;
          context.shadowBlur = blur;
          context.shadowOffsetX = shift;
          context.drawImage(ring, -shift, 0);
          context.restore();
        } else {
          context.drawImage(ring, 0, 0);
        }
      }
    }
    context.save();
    turn(context);
    context.fillStyle = spec.colour;
    drawLines(context, spec, false);
    context.restore();
  }

  // src/autumns-note-doodles/upload.ts
  var PASTEBOARD_URL = "https://www.pasteboard.co/api/upload";
  var PASTEBOARD_PAGE = "https://pasteboard.co/";
  var TIMEOUT_MS = 2e4;
  function pdaPost() {
    const page = window;
    if (typeof page.PDA_httpPost === "function") return (url, headers, body) => page.PDA_httpPost(url, headers, body);
    const bridge = page.flutter_inappwebview;
    if (typeof bridge?.callHandler === "function") {
      return (url, headers, body) => bridge.callHandler("PDA_httpPost", url, headers, body);
    }
    return null;
  }
  function canUpload() {
    return pdaPost() !== null;
  }
  function byteString(bytes) {
    let out = "";
    for (let at = 0; at < bytes.length; at += 32768) {
      out += String.fromCharCode(...bytes.subarray(at, at + 32768));
    }
    return out;
  }
  async function uploadPicture(png) {
    const post = pdaPost();
    if (!post) throw new Error("not in Torn PDA");
    const boundary = `----DoodleBoundary${Math.random().toString(36).slice(2)}`;
    const bytes = new Uint8Array(await png.arrayBuffer());
    const body = `--${boundary}\r
Content-Disposition: form-data; name="file"; filename="doodle.png"\r
Content-Type: image/png\r
\r
` + byteString(bytes) + `\r
--${boundary}--\r
`;
    const headers = { "Content-Type": `multipart/form-data; boundary=${boundary}; charset=ISO-8859-1` };
    let timer = 0;
    const late = new Promise((_, reject) => {
      timer = window.setTimeout(() => reject(new Error("timed out")), TIMEOUT_MS);
    });
    let reply;
    try {
      reply = await Promise.race([Promise.resolve(post(PASTEBOARD_URL, headers, body)), late]) ?? {};
    } finally {
      clearTimeout(timer);
    }
    const status = Number(reply.status ?? reply.statusCode ?? 0);
    const text = String(reply.responseText ?? reply.body ?? "");
    let name = null;
    try {
      name = JSON.parse(text).fileName;
    } catch {
    }
    if (status === 200 && typeof name === "string" && /^[\w-]+\.\w+$/.test(name)) return PASTEBOARD_PAGE + name;
    throw new Error(status ? `Pasteboard answered ${status}` : "no answer from Pasteboard");
  }

  // src/autumns-note-doodles/doodles.ts
  var SELECTORS = {
    panel: "#notes_panel",
    // The header is itself a button: icon, "Notes", minimise, maximise.
    header: "#notes_panel > button",
    minimize: hashedClass("minimizeIcon"),
    body: "#notes_panel textarea",
    // The note picker's drop-down, which opens over the body.
    noteList: `#notes_panel ${hashedClass("list")}`
  };
  var ICON_ID = "doodle-icon";
  var LAYER_ID = "doodle-layer";
  var TOOLBAR_ID = "doodle-toolbar";
  var FULL_ID = "doodle-full";
  var CONFIRM_ID = "doodle-confirm";
  var PICTURE_ID = "doodle-picture";
  var FRAME_CLASS = "doodle-frame";
  var ACTIVE_CLASS = "doodle-active";
  var ON_CLASS = "doodle-on";
  var DRAGGING_CLASS = "doodle-dragging";
  var ARMED_CLASS = "doodle-armed";
  var MARKER = /^\[drawing ([a-z0-9]{4,12})(?: ([lps]))?\]$/;
  var SHAPES = {
    l: { width: 720, height: 480, shown: 180, label: "Landscape" },
    p: { width: 480, height: 720, shown: 260, label: "Portrait" },
    s: { width: 600, height: 600, shown: 220, label: "Square" }
  };
  var DEFAULT_SHAPE = "l";
  var RESERVED = "⠀";
  var TALLEST = 0.85;
  var ICON_SIZE = 24;
  var BACKGROUND = "#ffffff";
  var SIZE_MIN = 2;
  var SIZE_MAX = 30;
  var SIZE_DEFAULT = 5;
  var OPACITY_MIN = 5;
  var MARKER_BLUE = [0, 117, 255];
  var THUMB_SIZE = 18;
  var SLIDER_WIDTH = 140;
  var SLIDER_PAD = 6;
  var NEAR_MARKER = 110;
  var UNDO_LIMIT = 30;
  var FILL_TOLERANCE = 60;
  var SWATCHES = [
    "#ff0000",
    "#ffff00",
    "#00ff00",
    "#00ffff",
    "#0000ff",
    "#ff00ff",
    "#ffffff",
    "#ebebeb",
    "#e1e1e1",
    "#d7d7d7",
    "#cccccc",
    "#c2c2c2",
    "#b7b7b7",
    "#acacac",
    "#a0a0a0",
    "#959595",
    "#ee1d24",
    "#fff100",
    "#00a650",
    "#00aeef",
    "#2f3192",
    "#ed008c",
    "#898989",
    "#7d7d7d",
    "#707070",
    "#626262",
    "#555555",
    "#464646",
    "#363636",
    "#262626",
    "#111111",
    "#000000",
    "#f7977a",
    "#fbad82",
    "#fdc68c",
    "#fff799",
    "#c6df9c",
    "#a4d49d",
    "#81ca9d",
    "#7bcdc9",
    "#6ccff7",
    "#7ca6d8",
    "#8293ca",
    "#8881be",
    "#a286bd",
    "#bc8cbf",
    "#f49bc1",
    "#f5999d",
    "#f26c4f",
    "#f68e55",
    "#fbaf5a",
    "#fff467",
    "#acd372",
    "#7dc473",
    "#39b778",
    "#16bcb4",
    "#00bff3",
    "#438ccb",
    "#5573b7",
    "#5e5ca7",
    "#855fa8",
    "#a763a9",
    "#ef6ea8",
    "#f16d7e",
    "#ee1d24",
    "#f16522",
    "#f7941d",
    "#fff100",
    "#8fc63d",
    "#37b44a",
    "#00a650",
    "#00a99e",
    "#00aeef",
    "#0072bc",
    "#0054a5",
    "#2f3192",
    "#652c91",
    "#91278f",
    "#ed008c",
    "#ee105a",
    "#9d0a0f",
    "#a1410d",
    "#a36209",
    "#aba000",
    "#588528",
    "#197b30",
    "#007236",
    "#00736a",
    "#0076a4",
    "#004a80",
    "#003370",
    "#1d1363",
    "#450e61",
    "#62055f",
    "#9e005c",
    "#9d0039",
    "#790000",
    "#7b3000",
    "#7c4900",
    "#827a00",
    "#3e6617",
    "#045f20",
    "#005824",
    "#005951",
    "#005b7e",
    "#003562",
    "#002056",
    "#0c004b",
    "#30004a",
    "#4b0048",
    "#7a0045",
    "#7a0026",
    "#c7b299",
    "#998675",
    "#736357",
    "#534741",
    "#37302d",
    "#c69c6d",
    "#a67c52",
    "#8c6239",
    "#754c24",
    "#603913"
  ];
  var frames = /* @__PURE__ */ new Map();
  var active = null;
  var full = false;
  var colour = "#000000";
  var size = SIZE_DEFAULT;
  var opacity = 1;
  var hardness = 1;
  var smoothing = 0;
  var tip = "round";
  var lassoMode = "free";
  var polygon = null;
  var lastEnd = null;
  var tool = "pen";
  var useGradient = false;
  var gradient = defaultGradient();
  var drawingPath = false;
  var refreshGradient = () => {
  };
  var bucketReadsAll = false;
  var undoStack = [];
  var redoStack = [];
  var toolsOpen = false;
  var focusOn = null;
  var measured = null;
  var lastCaret = 0;
  function noteBody() {
    const body = document.querySelector(SELECTORS.body);
    return body && body.getClientRects().length > 0 ? body : null;
  }
  function newId() {
    return Math.random().toString(36).slice(2, 8).padEnd(6, "0");
  }
  function blankLinesNeeded(shape, lineHeight) {
    return Math.max(1, Math.ceil(SHAPES[shape].shown / lineHeight) - 1);
  }
  function room(body) {
    const padding = parseFloat(getComputedStyle(body).paddingLeft) || 0;
    const seen = visibleBox(body);
    return { width: body.clientWidth - padding * 2, height: (seen.bottom - seen.top) * TALLEST };
  }
  function linesToReserve(body, shape) {
    const { width, height } = room(body);
    const tall = Math.min(width * (SHAPES[shape].height / SHAPES[shape].width), height);
    return Math.max(1, Math.round(tall / measure(body).lineHeight) - 1);
  }
  function mirrorOf(body) {
    const style = getComputedStyle(body);
    const mirror = document.createElement("div");
    mirror.id = "doodle-mirror";
    for (const name of [
      "fontFamily",
      "fontSize",
      "fontWeight",
      "fontStyle",
      "lineHeight",
      "letterSpacing",
      "wordSpacing",
      "textIndent",
      "textTransform",
      "tabSize",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "wordBreak"
    ]) {
      mirror.style[name] = style[name];
    }
    Object.assign(mirror.style, {
      position: "absolute",
      visibility: "hidden",
      top: "0",
      left: "-9999px",
      boxSizing: "border-box",
      width: `${body.clientWidth}px`,
      border: "0",
      whiteSpace: "pre-wrap",
      overflowWrap: "break-word"
    });
    document.body.appendChild(mirror);
    return mirror;
  }
  function dropSpots(body, blocks) {
    const mirror = mirrorOf(body);
    const lines = body.value.split("\n");
    const marks = [];
    let offset = 0;
    for (const line of lines) {
      const span = document.createElement("span");
      span.textContent = `${line}
`;
      mirror.appendChild(span);
      marks.push({ offset, span });
      offset += line.length + 1;
    }
    const end = document.createElement("span");
    end.textContent = "​";
    mirror.appendChild(end);
    const inside = (at) => blocks.some((block) => at > block.start && at <= block.end);
    const spots = marks.filter((mark) => !inside(mark.offset)).map((mark) => ({ offset: mark.offset, top: mark.span.offsetTop }));
    if (!body.value.endsWith("\n")) spots.push({ offset: body.value.length, top: end.offsetTop });
    mirror.remove();
    return spots;
  }
  function moveDrawing(body, block, to) {
    const value = body.value;
    const cutStart = block.end < value.length ? block.start : Math.max(0, block.start - 1);
    const cutEnd = block.end < value.length ? block.end + 1 : block.end;
    if (to >= cutStart && to <= cutEnd) return;
    const piece = value.slice(block.start, block.end);
    const without = value.slice(0, cutStart) + value.slice(cutEnd);
    const at = to > cutStart ? to - (cutEnd - cutStart) : to;
    const lone = at === without.length && without.length > 0 && !without.endsWith("\n");
    const placed = lone ? `${without}
${piece}
` : `${without.slice(0, at)}${piece}
${without.slice(at)}`;
    let head = 0;
    while (head < value.length && head < placed.length && value[head] === placed[head]) head += 1;
    let tail = 0;
    while (tail < value.length - head && tail < placed.length - head && value[value.length - 1 - tail] === placed[placed.length - 1 - tail]) {
      tail += 1;
    }
    replaceText(body, head, value.length - tail, placed.slice(head, placed.length - tail));
    log("notes draw: moved drawing", block.id);
  }
  var DRAG_START_PX = 6;
  var drag = null;
  function followDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.dx = event.clientX - drag.startX;
    drag.dy = event.clientY - drag.startY;
    const body = noteBody();
    if (!body) return;
    if (!drag.moving) {
      if (Math.hypot(drag.dx, drag.dy) < DRAG_START_PX) return;
      drag.moving = true;
      drag.spots = dropSpots(body, measure(body).blocks);
    }
    const rect = body.getBoundingClientRect();
    const y = event.clientY - (rect.top + body.clientTop - body.scrollTop);
    let best = null;
    for (const spot of drag.spots) {
      if (!best || Math.abs(spot.top - y) < Math.abs(best.top - y)) best = spot;
    }
    drag.target = best;
  }
  function endDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const ended = drag;
    drag = null;
    if (!ended.moving) {
      activate(ended.id);
      return;
    }
    const body = noteBody();
    const block = blockFor(ended.id);
    if (body && block && ended.target) moveDrawing(body, block, ended.target.offset);
  }
  function measure(body) {
    const key = `${body.clientWidth}|${body.value}`;
    if (measured?.key === key) return measured;
    const style = getComputedStyle(body);
    const mirror = mirrorOf(body);
    mirror.textContent = "M";
    const lineHeight = mirror.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) || 18;
    const blocks = [];
    const lines = body.value.split("\n");
    let offset = 0;
    lines.forEach((line, index) => {
      const match = MARKER.exec(line);
      if (match?.[1]) {
        const shape = match[2] ?? DEFAULT_SHAPE;
        let end = offset + line.length;
        let next = index + 1;
        while (lines[next] === RESERVED) {
          end += RESERVED.length + 1;
          next += 1;
        }
        const reserved = next > index + 1;
        if (!reserved) {
          const needed = blankLinesNeeded(shape, lineHeight);
          while (next - index - 1 < needed && lines[next] === "" && next < lines.length - 1) {
            end += 1;
            next += 1;
          }
        }
        mirror.textContent = body.value.slice(0, offset);
        const spot = document.createElement("span");
        spot.textContent = line;
        mirror.appendChild(spot);
        blocks.push({
          id: match[1],
          shape,
          named: match[2] !== void 0,
          top: spot.offsetTop,
          start: offset,
          end,
          lines: next - index,
          reserved
        });
      }
      offset += line.length + 1;
    });
    mirror.remove();
    measured = { key, blocks, lineHeight };
    return measured;
  }
  function blockFor(id) {
    const body = noteBody();
    return body ? measure(body).blocks.find((block) => block.id === id) ?? null : null;
  }
  function replaceText(body, start2, end, text) {
    body.focus({ preventScroll: true });
    body.setSelectionRange(start2, end);
    const done = text === "" ? document.execCommand("delete") : document.execCommand("insertText", false, text);
    if (done) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(body, body.value.slice(0, start2) + text + body.value.slice(end));
    body.dispatchEvent(new Event("input", { bubbles: true }));
    body.setSelectionRange(start2 + text.length, start2 + text.length);
  }
  function blockText(id, shape, reserve) {
    return `[drawing ${id} ${shape}]${`
${RESERVED}`.repeat(reserve)}`;
  }
  function refit(id) {
    const body = noteBody();
    const block = blockFor(id);
    if (!body || !block) return;
    const reserve = linesToReserve(body, block.shape);
    if (block.reserved && block.named && block.lines - 1 === reserve) return;
    replaceText(body, block.start, block.end, blockText(id, block.shape, reserve));
  }
  function insertDrawing(body, after) {
    const value = body.value;
    const caret = after ?? (document.activeElement === body ? body.selectionEnd : value.length);
    let lineEnd = value.indexOf("\n", caret);
    if (lineEnd === -1) lineEnd = value.length;
    const lineStart = value.lastIndexOf("\n", lineEnd - 1) + 1;
    const id = newId();
    const lead = lineEnd > lineStart ? "\n" : "";
    const tail = lineEnd === value.length ? "\n\n" : "\n";
    const text = `${lead}${blockText(id, DEFAULT_SHAPE, linesToReserve(body, DEFAULT_SHAPE))}${tail}`;
    replaceText(body, lineEnd, lineEnd, text);
    log("notes draw: added drawing", id);
    activate(id);
    return { id, lead, tail };
  }
  function newDrawing() {
    const body = noteBody();
    if (!body) return;
    const before = active;
    const open = active ? blockFor(active) : null;
    const { id, lead, tail } = insertDrawing(body, open ? open.end : void 0);
    undoStack.push({ kind: "created", id, lead, tail, before });
    focusOn = { id, tries: 30 };
  }
  function removeDrawing(id) {
    const body = noteBody();
    const block = blockFor(id);
    if (!body || !block) return;
    if (active === id) release();
    replaceText(body, block.start, Math.min(body.value.length, block.end + 1), "");
  }
  var unsaved = /* @__PURE__ */ new Set();
  var saving = Promise.resolve();
  function save(id, ...changed) {
    for (const layer2 of changed) layer2.dirty = true;
    refreshThumbs(changed);
    unsaved.add(id);
    saving = saving.then(async () => {
      if (!unsaved.delete(id)) return;
      const doc = frames.get(id)?.doc;
      if (!doc) return;
      const layers = doc.layers.slice();
      for (const layer2 of layers) {
        if (!layer2.dirty && layer2.png) continue;
        layer2.dirty = false;
        layer2.png = await new Promise((resolve) => layer2.canvas.toBlob(resolve, "image/png"));
      }
      const record = {
        version: 2,
        background: doc.background,
        layers: layers.flatMap((layer2) => layer2.png ? [{ ...propsOf(layer2), png: layer2.png }] : []),
        current: Math.max(0, layers.indexOf(doc.current)),
        next: doc.next
      };
      if (!await writeDrawing(id, record)) setStatus("Not saved: browser storage is full");
    });
  }
  function render(id = active) {
    const frame = id ? frames.get(id) : null;
    if (!frame) return;
    composite(frame.canvas, frame.doc);
    frame.canvas.classList.toggle("doodle-see-through", frame.doc.background === null);
  }
  function resize(canvas, width, height) {
    if (canvas.width === width && canvas.height === height) return;
    const copy = copyOf(canvas, true);
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(copy, 0, 0);
  }
  function fitShape(frame, shape) {
    const { width, height } = SHAPES[shape];
    if (frame.canvas.width === width && frame.canvas.height === height) return false;
    frame.canvas.width = width;
    frame.canvas.height = height;
    for (const layer2 of frame.doc.layers) resize(layer2.canvas, width, height);
    composite(frame.canvas, frame.doc);
    return true;
  }
  function loadImage(picture) {
    return new Promise((resolve) => {
      const address = URL.createObjectURL(picture);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(address);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(address);
        resolve(null);
      };
      image.src = address;
    });
  }
  async function loadDoc(id, frame) {
    const stored = await readDrawing(id);
    if (!stored) return;
    const { width, height } = frame.canvas;
    if (stored instanceof Blob) {
      const image = await loadImage(stored);
      const layer2 = frame.doc.layers[0];
      if (!image || !layer2) return;
      layer2.canvas.getContext("2d")?.drawImage(image, 0, 0);
      render(id);
      return;
    }
    const layers = [];
    for (const kept of stored.layers) {
      const image = await loadImage(kept.png);
      const layer2 = newLayer(kept.name, image?.width ?? width, image?.height ?? height);
      Object.assign(layer2, { ...kept, text: kept.text ?? null, png: kept.png, dirty: false });
      if (image) layer2.canvas.getContext("2d")?.drawImage(image, 0, 0);
      layers.push(layer2);
    }
    const first = layers[0];
    if (!first) return;
    for (const layer2 of layers) resize(layer2.canvas, width, height);
    frame.doc.background = stored.background;
    frame.doc.layers = layers;
    frame.doc.current = layers[stored.current] ?? first;
    frame.doc.next = stored.next;
    render(id);
    if (id === active) refreshLayers();
  }
  function frameFor(block, layer2) {
    const known = frames.get(block.id);
    if (known) {
      if (!known.element.isConnected) layer2.appendChild(known.element);
      return known;
    }
    const element = document.createElement("div");
    element.className = FRAME_CLASS;
    const canvas = document.createElement("canvas");
    const shape = SHAPES[block.shape];
    canvas.width = shape.width;
    canvas.height = shape.height;
    const doc = newDoc(shape.width, shape.height);
    composite(canvas, doc);
    const expand = document.createElement("button");
    expand.type = "button";
    expand.className = "doodle-expand";
    expand.setAttribute("aria-label", "Full screen");
    expand.innerHTML = svgIcon(ICONS.expand);
    expand.addEventListener("click", (event) => {
      event.stopPropagation();
      enterFull();
    });
    element.append(canvas, expand);
    layer2.appendChild(element);
    wireCanvas(block.id, element, canvas);
    const frame = { element, canvas, doc };
    frames.set(block.id, frame);
    void loadDoc(block.id, frame);
    return frame;
  }
  function paintAt(paint, pixel) {
    if ("solid" in paint) return [...paint.solid, 1];
    const i = pixel * 4;
    return [paint.pixels[i] ?? 0, paint.pixels[i + 1] ?? 0, paint.pixels[i + 2] ?? 0, (paint.pixels[i + 3] ?? 0) / 255];
  }
  function layOver(data, i, [r, g, b], strength) {
    const under = (data[i + 3] ?? 0) / 255;
    const alpha = strength + under * (1 - strength);
    if (alpha <= 0) return;
    const mix = (paint, there) => (paint * strength + there * under * (1 - strength)) / alpha;
    data[i] = mix(r ?? 0, data[i] ?? 0);
    data[i + 1] = mix(g ?? 0, data[i + 1] ?? 0);
    data[i + 2] = mix(b ?? 0, data[i + 2] ?? 0);
    data[i + 3] = alpha * 255;
  }
  function layUnder(data, i, [r, g, b], strength) {
    const over = (data[i + 3] ?? 0) / 255;
    const alpha = over + strength * (1 - over);
    if (alpha <= 0) return;
    const mix = (paint, there) => (there * over + paint * strength * (1 - over)) / alpha;
    data[i] = mix(r ?? 0, data[i] ?? 0);
    data[i + 1] = mix(g ?? 0, data[i + 1] ?? 0);
    data[i + 2] = mix(b ?? 0, data[i + 2] ?? 0);
    data[i + 3] = alpha * 255;
  }
  function floodFill(canvas, startX, startY, paint, alpha, mask = null, source = null) {
    const context = canvas.getContext("2d");
    if (!context) return;
    const { width, height } = canvas;
    const x0 = Math.floor(startX);
    const y0 = Math.floor(startY);
    if (x0 < 0 || y0 < 0 || x0 >= width || y0 >= height) return;
    if (mask && !mask[y0 * width + x0]) return;
    const image = context.getImageData(0, 0, width, height);
    const data = image.data;
    const read = source ?? data.slice();
    const at = (y0 * width + x0) * 4;
    const target = [read[at] ?? 0, read[at + 1] ?? 0, read[at + 2] ?? 0, read[at + 3] ?? 0];
    const like = (pixel) => {
      if (mask && !mask[pixel]) return false;
      const i = pixel * 4;
      return Math.abs((read[i] ?? 0) - (target[0] ?? 0)) + Math.abs((read[i + 1] ?? 0) - (target[1] ?? 0)) + Math.abs((read[i + 2] ?? 0) - (target[2] ?? 0)) + Math.abs((read[i + 3] ?? 0) - (target[3] ?? 0)) <= FILL_TOLERANCE;
    };
    const done = new Uint8Array(width * height);
    const stack2 = [[x0, y0]];
    while (stack2.length > 0) {
      const [sx, y] = stack2.pop() ?? [0, 0];
      let x = sx;
      let pixel = y * width + x;
      while (x > 0 && !done[pixel - 1] && like(pixel - 1)) {
        x -= 1;
        pixel -= 1;
      }
      let up = false;
      let down = false;
      while (x < width && !done[pixel] && like(pixel)) {
        done[pixel] = 1;
        const [r, g, b, strength] = paintAt(paint, pixel);
        layOver(data, pixel * 4, [r, g, b], strength * alpha);
        if (y > 0) {
          const above = pixel - width;
          const open = !done[above] && like(above);
          if (open && !up) stack2.push([x, y - 1]);
          up = open;
        }
        if (y < height - 1) {
          const below = pixel + width;
          const open = !done[below] && like(below);
          if (open && !down) stack2.push([x, y + 1]);
          down = open;
        }
        x += 1;
        pixel += 1;
      }
    }
    blendEdges(data, read, done, width, height, target, paint, alpha, mask);
    context.putImageData(image, 0, 0);
  }
  var EDGE_REACH = 2;
  function blendEdges(data, read, filled, width, height, old, paint, alpha, mask) {
    const away = (i) => Math.hypot(
      (read[i] ?? 0) - (old[0] ?? 0),
      (read[i + 1] ?? 0) - (old[1] ?? 0),
      (read[i + 2] ?? 0) - (old[2] ?? 0),
      (read[i + 3] ?? 0) - (old[3] ?? 0)
    );
    const swapped = data.slice();
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixel = y * width + x;
        if (filled[pixel] || mask && !mask[pixel]) continue;
        const top = Math.max(0, y - EDGE_REACH);
        const bottom = Math.min(height - 1, y + EDGE_REACH);
        const left = Math.max(0, x - EDGE_REACH);
        const right = Math.min(width - 1, x + EDGE_REACH);
        let nearFill = false;
        for (let ny = top; ny <= bottom && !nearFill; ny += 1) {
          for (let nx = left; nx <= right; nx += 1) {
            if (filled[ny * width + nx]) {
              nearFill = true;
              break;
            }
          }
        }
        if (!nearFill) continue;
        let line = 0;
        for (let ny = top; ny <= bottom; ny += 1) {
          for (let nx = left; nx <= right; nx += 1) {
            const near = ny * width + nx;
            if (!filled[near]) line = Math.max(line, away(near * 4));
          }
        }
        if (line < 1) continue;
        const i = pixel * 4;
        const oldShare = 1 - Math.min(1, away(i) / line);
        if (oldShare < 0.02) continue;
        const [r, g, b, strength] = paintAt(paint, pixel);
        const share = oldShare * strength * alpha;
        if ((swapped[i + 3] ?? 0) === 255 && (old[3] ?? 0) === 255) {
          const fill = [r, g, b];
          for (let c = 0; c < 3; c += 1) {
            data[i + c] = (swapped[i + c] ?? 0) + share * ((fill[c] ?? 0) - (old[c] ?? 0));
          }
        } else {
          layUnder(data, i, [r, g, b], share);
        }
      }
    }
  }
  function fillPaint(target) {
    if (!useGradient) return { solid: rgbOf(colour) };
    const shown = activeCanvas() ?? target.canvas;
    const { width, height } = target.canvas;
    return { pixels: gradientPixels(gradient, width, height, shown.width, shown.height, -target.x, -target.y) };
  }
  function snapshot(doc, pixels) {
    return {
      kind: "doc",
      layers: doc.layers.map((layer2) => ({ layer: layer2, props: propsOf(layer2) })),
      background: doc.background,
      current: doc.current,
      pixels: pixels.map((layer2) => ({
        layer: layer2,
        image: layer2.canvas.getContext("2d")?.getImageData(0, 0, layer2.canvas.width, layer2.canvas.height) ?? new ImageData(1, 1)
      })),
      selection: outlineNow()
    };
  }
  function outlineNow() {
    if (!selection) return null;
    const path = selection.path.map((p) => ({ ...p }));
    return selection.split ? { path, split: selection.split } : { path };
  }
  function rememberOutline(before) {
    if (!before && !selection) return;
    remember([]);
    const last = undoStack[undoStack.length - 1];
    if (last?.kind === "doc") last.selection = before;
  }
  function restore(doc, state) {
    doc.layers = state.layers.map(
      ({ layer: layer2, props }) => Object.assign(layer2, { ...props, text: props.text ? { ...props.text } : null })
    );
    doc.background = state.background;
    doc.current = doc.layers.includes(state.current) ? state.current : doc.layers[doc.layers.length - 1] ?? state.current;
    for (const { layer: layer2, image } of state.pixels) {
      if (layer2.canvas.width !== image.width || layer2.canvas.height !== image.height) {
        layer2.canvas.width = image.width;
        layer2.canvas.height = image.height;
      }
      layer2.canvas.getContext("2d")?.putImageData(image, 0, 0);
    }
    for (const layer2 of doc.layers) if (layer2.text) drawText(layer2.canvas, layer2.text);
    const kept = state.selection;
    selection = kept ? { path: kept.path.map((p) => ({ ...p })), float: null } : null;
    if (selection && kept?.split) selection.split = kept.split;
    lassoing = null;
    polygon = null;
    antsVersion += 1;
  }
  function remember(pixels = null) {
    const doc = activeDoc();
    if (!doc) return;
    undoStack.push(snapshot(doc, pixels ?? [doc.current]));
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    redoStack = [];
  }
  var SNAP_ANGLE = Math.PI / 4;
  function snapLine(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const angle = Math.round(Math.atan2(dy, dx) / SNAP_ANGLE) * SNAP_ANGLE;
    const reach = Math.max(0, dx * Math.cos(angle) + dy * Math.sin(angle));
    return { x: from.x + reach * Math.cos(angle), y: from.y + reach * Math.sin(angle) };
  }
  var SMOOTH_SPACING = 1.5;
  var SMOOTH_REACH = [0, 5, 8];
  var SMOOTH_HIGH_PASSES = 2;
  var CORNER_SPAN = 9;
  var CORNER_SETTLE = 2;
  var CORNER_ANGLE = 1.2;
  var STRAIGHT_SHARE = 0.03;
  var STRAIGHT_PX = 2;
  function copyOf(source, withPicture) {
    const copy = document.createElement("canvas");
    copy.width = source.width;
    copy.height = source.height;
    if (withPicture) copy.getContext("2d")?.drawImage(source, 0, 0);
    return copy;
  }
  function scaleOf(canvas) {
    return canvas.width / (canvas.getBoundingClientRect().width || canvas.width);
  }
  function drawTarget(canvas) {
    const float = selection?.float;
    return float ? { canvas: float.canvas, x: float.x, y: float.y } : { canvas, x: 0, y: 0 };
  }
  function startStroke(shown, layer2, at) {
    const target = drawTarget(layer2);
    const stroke = {
      target,
      layer: layer2,
      before: copyOf(target.canvas, true),
      sheet: copyOf(target.canvas, false),
      inked: copyOf(target.canvas, false),
      points: [at],
      scale: scaleOf(shown),
      joined: false
    };
    paintStroke(stroke);
    return stroke;
  }
  function paintStroke(stroke) {
    const { target, before, sheet, inked, scale } = stroke;
    const context = target.canvas.getContext("2d");
    const ink = sheet.getContext("2d");
    const tint = inked.getContext("2d");
    if (!context || !ink || !tint) return;
    const local = stroke.points.map((p) => ({ x: p.x - target.x, y: p.y - target.y }));
    const line = smoothLine(local, smoothing, scale);
    const first = line[0];
    if (!first) return;
    const soft = 1 - hardness;
    const width = size * scale;
    const blur = width * 0.25 * soft;
    ink.clearRect(0, 0, sheet.width, sheet.height);
    inkLine(ink, line, width * (1 - 0.4 * soft), scale);
    tint.clearRect(0, 0, inked.width, inked.height);
    if (blur > 0.3) {
      const shift = sheet.width + 100;
      tint.save();
      tint.shadowColor = "#000";
      tint.shadowBlur = blur;
      tint.shadowOffsetX = shift;
      tint.drawImage(sheet, -shift, 0);
      tint.restore();
    } else {
      tint.drawImage(sheet, 0, 0);
    }
    if (tool !== "eraser") {
      const shown = activeCanvas() ?? target.canvas;
      tint.globalCompositeOperation = "source-in";
      tint.fillStyle = useGradient ? gradientStyle(tint, gradient, shown.width, shown.height, -target.x, -target.y) : colour;
      tint.fillRect(0, 0, inked.width, inked.height);
      tint.globalCompositeOperation = "source-over";
    }
    context.globalCompositeOperation = "copy";
    context.drawImage(before, 0, 0);
    context.globalCompositeOperation = "source-over";
    context.save();
    if (selection) {
      tracePath(context, selection.path, -target.x, -target.y, true);
      context.clip();
    }
    context.globalAlpha = opacity;
    context.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    context.drawImage(inked, 0, 0);
    context.restore();
    if (selection?.float) showFloat(stroke.layer);
  }
  var TAPER_WIDTHS = 5;
  var TAPER_SHARE = 1 / 3;
  var TAPER_TIP = 0.06;
  function inkLine(ink, line, width, scale) {
    const first = line[0];
    if (!first) return;
    ink.fillStyle = ink.strokeStyle = "#000";
    if (tip === "round") {
      ink.lineWidth = width;
      ink.lineCap = "round";
      ink.lineJoin = "round";
      ink.beginPath();
      ink.moveTo(first.x, first.y);
      if (line.length === 1) ink.lineTo(first.x + 0.01, first.y);
      for (const p of line.slice(1)) ink.lineTo(p.x, p.y);
      ink.stroke();
      return;
    }
    ink.beginPath();
    if (tip === "square") {
      const half = width / 2;
      const corners = (p) => [
        { x: p.x - half, y: p.y - half },
        { x: p.x + half, y: p.y - half },
        { x: p.x + half, y: p.y + half },
        { x: p.x - half, y: p.y + half }
      ];
      const pieces = line.length === 1 ? [[first, first]] : line.slice(1).map((p, i) => [line[i], p]);
      for (const [a, b] of pieces) {
        const hull = convexHull([...corners(a), ...corners(b)]);
        hull.forEach((p, i) => i === 0 ? ink.moveTo(p.x, p.y) : ink.lineTo(p.x, p.y));
        ink.closePath();
      }
      ink.fill();
      return;
    }
    const points = resample(line, Math.max(1, width / 8));
    const along = [0];
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      along.push((along[i - 1] ?? 0) + Math.hypot(b.x - a.x, b.y - a.y));
    }
    const total = along[along.length - 1] ?? 0;
    const reach = Math.max(1, Math.min(width * TAPER_WIDTHS, total * TAPER_SHARE));
    const ease = (d) => Math.sqrt(Math.min(1, d / reach));
    const radii = along.map((d) => width / 2 * (total === 0 ? 1 : Math.max(TAPER_TIP, ease(d) * ease(total - d))));
    points.forEach((p, i) => {
      const r = radii[i] ?? 0;
      ink.moveTo(p.x + r, p.y);
      ink.arc(p.x, p.y, r, 0, Math.PI * 2);
      const next = points[i + 1];
      if (!next) return;
      const nr = radii[i + 1] ?? 0;
      const dx = next.x - p.x;
      const dy = next.y - p.y;
      const length = Math.hypot(dx, dy) || 1;
      const nx = -dy / length;
      const ny = dx / length;
      ink.moveTo(p.x - nx * r, p.y - ny * r);
      ink.lineTo(next.x - nx * nr, next.y - ny * nr);
      ink.lineTo(next.x + nx * nr, next.y + ny * nr);
      ink.lineTo(p.x + nx * r, p.y + ny * r);
      ink.closePath();
    });
    ink.fill();
  }
  function convexHull(points) {
    const sorted2 = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const half = (list) => {
      const out = [];
      for (const p of list) {
        while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
        out.push(p);
      }
      out.pop();
      return out;
    };
    return [...half(sorted2), ...half(sorted2.slice().reverse())];
  }
  function resample(points, spacing) {
    const first = points[0];
    if (!first) return [];
    const out = [first];
    let along = spacing;
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      while (along <= length) {
        const t = along / length;
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        along += spacing;
      }
      along -= length;
    }
    const last = points[points.length - 1];
    const end = out[out.length - 1];
    if (Math.hypot(last.x - end.x, last.y - end.y) > 0.01) out.push(last);
    return out;
  }
  function cornersOf(line, span) {
    const turn = (i) => {
      const a = line[i - span];
      const b = line[i];
      const c = line[i + span];
      const one = Math.atan2(b.y - a.y, b.x - a.x);
      const two = Math.atan2(c.y - b.y, c.x - b.x);
      return Math.abs(Math.atan2(Math.sin(two - one), Math.cos(two - one)));
    };
    const turns = line.map((_, i) => i >= span && i < line.length - span ? turn(i) : 0);
    const corners = [];
    for (let i = span; i < line.length - span; i += 1) {
      const here = turns[i] ?? 0;
      if (here < CORNER_ANGLE) continue;
      let sharpest = true;
      for (let j = i - span; j <= i + span && sharpest; j += 1) {
        const there = turns[j] ?? 0;
        if (there > here || there === here && j < i) sharpest = false;
      }
      if (sharpest) corners.push(i);
    }
    return corners;
  }
  function averageLine(line, sigma) {
    const reach = Math.ceil(sigma * 3);
    const last = line.length - 1;
    return line.map((p, i) => {
      const r = Math.min(reach, i, last - i);
      if (r === 0) return p;
      let x = 0;
      let y = 0;
      let total = 0;
      for (let j = i - r; j <= i + r; j += 1) {
        const q = line[j];
        const weight = Math.exp(-((j - i) ** 2) / (2 * sigma * sigma));
        x += q.x * weight;
        y += q.y * weight;
        total += weight;
      }
      return { x: x / total, y: y / total };
    });
  }
  function straightenLine(line, scale) {
    const a = line[0];
    const b = line[line.length - 1];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 1) return line;
    let furthest = 0;
    for (const p of line) {
      furthest = Math.max(furthest, Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / length);
    }
    if (furthest > Math.max(STRAIGHT_PX * scale, length * STRAIGHT_SHARE)) return line;
    return line.map((_, i) => {
      const t = i / (line.length - 1);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    });
  }
  function smoothLine(points, level, scale) {
    if (level === 0 || points.length < 3) return points;
    const spacing = SMOOTH_SPACING * scale;
    const line = resample(points, spacing);
    if (line.length < 3) return line;
    const span = Math.max(2, Math.round(CORNER_SPAN / SMOOTH_SPACING));
    const sigma = (SMOOTH_REACH[level] ?? 0) / SMOOTH_SPACING;
    const passes = level === 2 ? SMOOTH_HIGH_PASSES : 1;
    const settled = averageLine(line, CORNER_SETTLE / SMOOTH_SPACING);
    const ends = [0, ...cornersOf(settled, span), line.length - 1];
    const out = [];
    for (let k = 0; k < ends.length - 1; k += 1) {
      let stretch = line.slice(ends[k], (ends[k + 1] ?? 0) + 1);
      for (let pass = 0; pass < passes; pass += 1) stretch = averageLine(stretch, sigma);
      if (level === 2) stretch = straightenLine(stretch, scale);
      out.push(...k === 0 ? stretch : stretch.slice(1));
    }
    return out;
  }
  function newFloat(piece, path, under) {
    return { ...piece, under, scale: 1, angle: 0, base: path.map((p) => ({ x: p.x - piece.x, y: p.y - piece.y })) };
  }
  function placePoint(float, p) {
    const { width, height } = float.canvas;
    const dx = (p.x - width / 2) * float.scale;
    const dy = (p.y - height / 2) * float.scale;
    const cos = Math.cos(float.angle);
    const sin = Math.sin(float.angle);
    return { x: float.x + width / 2 + dx * cos - dy * sin, y: float.y + height / 2 + dx * sin + dy * cos };
  }
  function transformed(float) {
    return float.scale !== 1 || float.angle !== 0;
  }
  function placeOutline() {
    const float = selection?.float;
    if (!selection || !float) return;
    selection.path = float.base.map((p) => placePoint(float, p));
    antsVersion += 1;
  }
  function settleFloat() {
    const float = selection?.float;
    if (!selection || !float || !transformed(float)) return;
    const { width, height } = float.canvas;
    const corners = [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height }
    ].map((p) => placePoint(float, p));
    const left = Math.floor(Math.min(...corners.map((p) => p.x)));
    const top = Math.floor(Math.min(...corners.map((p) => p.y)));
    const piece = document.createElement("canvas");
    piece.width = Math.max(1, Math.ceil(Math.max(...corners.map((p) => p.x))) - left);
    piece.height = Math.max(1, Math.ceil(Math.max(...corners.map((p) => p.y))) - top);
    const context = piece.getContext("2d");
    if (context) {
      context.translate(-left, -top);
      drawFloatPiece(context, float);
      context.setTransform(1, 0, 0, 1, 0, 0);
    }
    selection.float = newFloat({ canvas: piece, x: left, y: top }, selection.path, float.under);
  }
  function drawFloatPiece(context, float) {
    const { width, height } = float.canvas;
    context.save();
    context.imageSmoothingQuality = "high";
    context.translate(float.x + width / 2, float.y + height / 2);
    context.rotate(float.angle);
    context.scale(float.scale, float.scale);
    context.drawImage(float.canvas, -width / 2, -height / 2);
    context.restore();
  }
  var selection = null;
  var lassoing = null;
  var clipboard = null;
  var clipboardFresh = false;
  var ants = null;
  var antsKey = "";
  var antsVersion = 0;
  var ANTS_STEP_MS = 100;
  var ANTS_DASH = 4;
  var HOLD_MS = 450;
  function tracePath(context, path, dx, dy, close) {
    context.beginPath();
    path.forEach((p, i) => {
      if (i === 0) context.moveTo(p.x + dx, p.y + dy);
      else context.lineTo(p.x + dx, p.y + dy);
    });
    if (close) context.closePath();
  }
  function clockwise(path) {
    let area = 0;
    path.forEach((a, i) => {
      const b = path[(i + 1) % path.length];
      area += a.x * b.y - b.x * a.y;
    });
    return area < 0 ? path.slice().reverse() : path;
  }
  var CLOSE_PX = 10;
  function closePolygon() {
    if (!polygon) return;
    lassoing = polygon;
    polygon = null;
    finishLasso();
  }
  var lassoBefore = null;
  function finishLasso() {
    const path = lassoing;
    lassoing = null;
    antsVersion += 1;
    if (path && path.length >= 3) {
      const xs = path.map((p) => p.x);
      const ys = path.map((p) => p.y);
      const wide = Math.max(...xs) - Math.min(...xs);
      const tall = Math.max(...ys) - Math.min(...ys);
      if (wide >= 3 && tall >= 3) selection = { path: clockwise(path), float: null };
    }
    rememberOutline(lassoBefore);
    lassoBefore = null;
    syncToolbar();
  }
  function cancelPath() {
    drawingPath = false;
    lassoing = null;
    antsVersion += 1;
    syncToolbar();
  }
  function finishPath() {
    const points = lassoing;
    const canvas = activeCanvas();
    lassoing = null;
    drawingPath = false;
    antsVersion += 1;
    if (!points || points.length < 2 || !canvas) {
      syncToolbar();
      return;
    }
    gradient.kind = "path";
    gradient.path = anchorsOf(points.map((p) => ({ x: p.x / canvas.width, y: p.y / canvas.height })));
    useGradient = true;
    if (tool !== "pen" && tool !== "bucket") tool = "pen";
    syncToolbar();
    togglePopup("colour");
    refreshGradient();
  }
  function boundsOf(path, canvas) {
    const xs = path.map((p) => p.x);
    const ys = path.map((p) => p.y);
    const x = Math.max(0, Math.floor(Math.min(...xs)));
    const y = Math.max(0, Math.floor(Math.min(...ys)));
    const right = Math.min(canvas.width, Math.ceil(Math.max(...xs)));
    const bottom = Math.min(canvas.height, Math.ceil(Math.max(...ys)));
    return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
  }
  function cutOut(canvas, path) {
    const box = boundsOf(path, canvas);
    const piece = document.createElement("canvas");
    piece.width = box.width;
    piece.height = box.height;
    const context = piece.getContext("2d");
    if (context) {
      tracePath(context, path, -box.x, -box.y, true);
      context.clip();
      context.drawImage(canvas, -box.x, -box.y);
    }
    return { canvas: piece, x: box.x, y: box.y };
  }
  function clearSelected(canvas, path) {
    const context = canvas.getContext("2d");
    if (!context) return;
    tracePath(context, path, 0, 0, true);
    context.globalCompositeOperation = "destination-out";
    context.fill();
    context.globalCompositeOperation = "source-over";
  }
  function lift(canvas) {
    if (!selection || selection.float) return;
    const piece = cutOut(canvas, selection.path);
    clearSelected(canvas, selection.path);
    selection.float = newFloat(piece, selection.path, copyOf(canvas, true));
  }
  function showFloat(canvas) {
    const float = selection?.float;
    const context = canvas.getContext("2d");
    if (!float || !context) return;
    context.globalCompositeOperation = "copy";
    context.drawImage(float.under, 0, 0);
    context.globalCompositeOperation = "source-over";
    if (transformed(float)) drawFloatPiece(context, float);
    else context.drawImage(float.canvas, float.x, float.y);
  }
  function shiftSelection(canvas, dx, dy) {
    if (!selection?.float) return;
    selection.path = selection.path.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    selection.float.x += dx;
    selection.float.y += dy;
    antsVersion += 1;
    showFloat(canvas);
    render();
  }
  function dropSelection() {
    if (!selection && !lassoing) return;
    const floated = !!selection?.float;
    selection = null;
    lassoing = null;
    polygon = null;
    antsVersion += 1;
    const layer2 = currentLayer();
    if (floated && layer2 && active) save(active, layer2);
    syncToolbar();
  }
  function putDownFloat() {
    if (!selection?.float) return;
    selection.float = null;
    antsVersion += 1;
    const layer2 = currentLayer();
    if (layer2 && active) save(active, layer2);
  }
  function deselect() {
    const before = outlineNow();
    dropSelection();
    rememberOutline(before);
  }
  function selectionMask(target) {
    if (!selection) return null;
    const { width, height } = target.canvas;
    const shape = document.createElement("canvas");
    shape.width = width;
    shape.height = height;
    const context = shape.getContext("2d");
    if (!context) return null;
    tracePath(context, selection.path, -target.x, -target.y, true);
    context.fill();
    const alpha = context.getImageData(0, 0, width, height).data;
    const mask = new Uint8Array(width * height);
    for (let i = 0; i < mask.length; i += 1) mask[i] = (alpha[i * 4 + 3] ?? 0) >= 128 ? 1 : 0;
    return mask;
  }
  function copySelection() {
    const canvas = currentLayer()?.canvas;
    if (!canvas || !selection) return;
    settleFloat();
    const float = selection.float;
    const piece = float ? { canvas: copyOf(float.canvas, true), x: float.x, y: float.y } : cutOut(canvas, selection.path);
    clipboard = { ...piece, path: selection.path.map((p) => ({ ...p })) };
    clipboardFresh = true;
    setStatus("Selection copied");
    syncToolbar();
  }
  function selectLayer() {
    const layer2 = currentLayer();
    const context = layer2?.canvas.getContext("2d");
    if (!layer2 || !context) return;
    const { width, height } = layer2.canvas;
    const data = context.getImageData(0, 0, width, height).data;
    let left = width;
    let top = height;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if ((data[(y * width + x) * 4 + 3] ?? 0) === 0) continue;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
    if (right < 0) {
      setStatus("Nothing on this layer");
      return;
    }
    const before = outlineNow();
    dropSelection();
    selection = {
      path: [
        { x: left, y: top },
        { x: right + 1, y: top },
        { x: right + 1, y: bottom + 1 },
        { x: left, y: bottom + 1 }
      ],
      float: null
    };
    rememberOutline(before);
    antsVersion += 1;
    if (tool !== "lasso" && tool !== "move") tool = "lasso";
    syncToolbar();
  }
  var INVERT_SPLIT = 5;
  function invertSelection() {
    const canvas = activeCanvas();
    if (!selection || !canvas) {
      setStatus("Nothing selected");
      return;
    }
    const { path, split } = selection;
    const before = outlineNow();
    dropSelection();
    if (split) {
      selection = { path: path.slice(split, -1).reverse(), float: null };
    } else {
      const { width, height } = canvas;
      const hole = path.slice().reverse();
      const corner = { x: 0, y: 0 };
      selection = {
        path: [corner, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }, corner, ...hole, hole[0]],
        float: null,
        split: INVERT_SPLIT
      };
    }
    rememberOutline(before);
    antsVersion += 1;
    if (tool !== "lasso" && tool !== "move") tool = "lasso";
    syncToolbar();
  }
  function cutSelection() {
    const layer2 = currentLayer();
    const canvas = layer2?.canvas;
    const context = canvas?.getContext("2d");
    if (!layer2 || !canvas || !context || !selection || !active || !canDraw()) return;
    copySelection();
    remember();
    if (selection.float) {
      context.globalCompositeOperation = "copy";
      context.drawImage(selection.float.under, 0, 0);
      context.globalCompositeOperation = "source-over";
    } else {
      clearSelected(canvas, selection.path);
    }
    selection = null;
    antsVersion += 1;
    render();
    save(active, layer2);
    setStatus("Selection cut");
    syncToolbar();
  }
  function deleteSelection() {
    const layer2 = currentLayer();
    const context = layer2?.canvas.getContext("2d");
    if (!layer2 || !context || !selection || !active || !canDraw()) return;
    remember();
    if (selection.float) {
      context.globalCompositeOperation = "copy";
      context.drawImage(selection.float.under, 0, 0);
      context.globalCompositeOperation = "source-over";
      selection.float = null;
    } else {
      clearSelected(layer2.canvas, selection.path);
    }
    render();
    save(active, layer2);
  }
  function pasteSelection() {
    const layer2 = currentLayer();
    const canvas = layer2?.canvas;
    if (!layer2 || !canvas || !clipboard || !active || !canDraw()) return;
    dropSelection();
    remember();
    const x = Math.max(0, Math.min(clipboard.x, canvas.width - clipboard.canvas.width));
    const y = Math.max(0, Math.min(clipboard.y, canvas.height - clipboard.canvas.height));
    const dx = x - clipboard.x;
    const dy = y - clipboard.y;
    const path = clipboard.path.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    selection = { path, float: newFloat({ canvas: copyOf(clipboard.canvas, true), x, y }, path, copyOf(canvas, true)) };
    antsVersion += 1;
    showFloat(canvas);
    render();
    save(active, layer2);
    tool = "move";
    syncToolbar();
  }
  var textLook = {
    font: "Arial",
    size: 48,
    bold: false,
    italic: false,
    underline: false,
    colour: "#000000",
    outline: false,
    outlineColour: "#ffffff",
    outlineSize: 4,
    outlineSoft: 0
  };
  var editing = null;
  function textLayer() {
    const layer2 = currentLayer();
    return layer2?.text ? layer2 : null;
  }
  function lookOf(look) {
    const { font, size: size2, bold, italic, underline, colour: colour2, outline, outlineColour, outlineSize, outlineSoft } = look;
    return { font, size: size2, bold, italic, underline, colour: colour2, outline, outlineColour, outlineSize, outlineSoft };
  }
  function shownLook() {
    const text = tool === "text" ? textLayer()?.text : null;
    return text ? lookOf(text) : { ...textLook, colour };
  }
  function textBox(unit) {
    const layer2 = tool === "text" ? textLayer() : null;
    if (!layer2?.text || !layer2.visible || layer2.locked) return null;
    return boxAround(textCorners(layer2.text), unit);
  }
  function redrawText(layer2) {
    if (!layer2.text) return;
    drawText(layer2.canvas, layer2.text);
    render();
    antsVersion += 1;
  }
  var lookSliding = false;
  function changeLook(change, sliding = false) {
    textLook = { ...shownLook(), ...change };
    if (change.colour) colour = change.colour;
    const layer2 = tool === "text" ? textLayer() : null;
    if (layer2?.text && active) {
      if (!lookSliding) remember([]);
      lookSliding = sliding;
      Object.assign(layer2.text, change);
      redrawText(layer2);
      if (!sliding) save(active, layer2);
    }
    syncToolbar();
  }
  function endLookSlide() {
    if (!lookSliding) return;
    lookSliding = false;
    const layer2 = textLayer();
    if (layer2 && active) save(active, layer2);
  }
  function newText(at) {
    const doc = activeDoc();
    if (!doc || !active || !roomForLayer(doc)) return;
    finishEditing();
    dropSelection();
    const mark = undoStack.length;
    remember([]);
    const layer2 = addLayer(doc);
    const look = { ...textLook, colour };
    layer2.text = { ...look, content: "", x: at.x, y: at.y - look.size * LINE_HEIGHT / 2, angle: 0 };
    redrawText(layer2);
    startEditing(layer2, true, mark);
    refreshLayers();
  }
  function startEditing(layer2, fresh, mark = undoStack.length) {
    if (!layer2.text) return;
    if (editing?.layer === layer2) {
      editing.input.focus({ preventScroll: true });
      return;
    }
    finishEditing();
    if (!fresh) remember([]);
    const input = document.createElement("textarea");
    input.className = "doodle-text-input";
    input.spellcheck = false;
    input.wrap = "off";
    input.setAttribute("aria-label", "Text");
    input.value = layer2.text.content;
    input.addEventListener("input", () => {
      if (!layer2.text) return;
      layer2.text.content = input.value;
      redrawText(layer2);
      placeTextEditor();
    });
    editing = { layer: layer2, input, fresh, before: layer2.text.content, mark, placed: "" };
    placeTextEditor();
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
  }
  function finishEditing() {
    const was = editing;
    if (!was) return;
    editing = null;
    was.input.remove();
    const { layer: layer2 } = was;
    const doc = activeDoc();
    const text = layer2.text;
    antsVersion += 1;
    if (!text || !doc || !active) return;
    const unchanged = undoStack.length === was.mark + 1;
    if (!text.content.trim()) {
      const index = doc.layers.indexOf(layer2);
      if (index >= 0 && doc.layers.length > 1) {
        doc.layers.splice(index, 1);
        doc.current = doc.layers[Math.max(0, index - 1)] ?? doc.layers[0];
      } else {
        layer2.text = null;
      }
      if (was.fresh && unchanged) undoStack.pop();
      render();
      save(active);
      refreshLayers();
      return;
    }
    if (!was.fresh && text.content === was.before && unchanged) undoStack.pop();
    if (was.fresh) layer2.name = text.content.trim().split("\n")[0]?.slice(0, 24) || layer2.name;
    save(active, layer2);
    refreshLayers();
  }
  function placeTextEditor() {
    const was = editing;
    if (!was) return;
    const { input, layer: layer2 } = was;
    const canvas = activeCanvas();
    const parent = canvas?.parentElement;
    const spec = layer2.text;
    if (!canvas || !parent || !spec || !activeDoc()?.layers.includes(layer2)) {
      finishEditing();
      return;
    }
    if (input.parentElement !== parent) {
      parent.appendChild(input);
      input.focus({ preventScroll: true });
    }
    const scale = canvas.offsetWidth / canvas.width;
    const { width, height } = measureText(spec);
    const place = [
      `${canvas.offsetLeft + spec.x * scale}px`,
      `${canvas.offsetTop + spec.y * scale}px`,
      // A little wider than the words, so the caret after the last letter shows.
      `${width * scale + 4}px`,
      `${height * scale}px`,
      fontOf(spec, scale),
      `${spec.size * LINE_HEIGHT * scale}px`,
      `rotate(${spec.angle}rad)`,
      `${width * scale / 2}px ${height * scale / 2}px`,
      spec.colour
    ];
    const key = place.join("|");
    if (key === was.placed) return;
    was.placed = key;
    const [left, top, wide, tall, font, lineHeight, transform, origin, caret] = place;
    Object.assign(input.style, {
      left,
      top,
      width: wide,
      height: tall,
      font,
      lineHeight,
      transform,
      transformOrigin: origin,
      caretColor: caret
    });
    input.scrollLeft = 0;
    input.scrollTop = 0;
  }
  function textLayerAt(at) {
    const doc = activeDoc();
    if (!doc) return null;
    for (const layer2 of doc.layers.slice().reverse()) {
      if (layer2.text && layer2.visible && !layer2.locked && insideBox(at, textCorners(layer2.text))) return layer2;
    }
    return null;
  }
  function textPress(at, unit) {
    let layer2 = textLayer();
    let box = textBox(unit);
    let grab = grabAt(at, unit, box);
    if (grab.kind === "outside") {
      const other = textLayerAt(at);
      if (other) {
        setCurrent(other);
        layer2 = other;
        box = textBox(unit);
        grab = { kind: "inside" };
      }
    }
    if (grab.kind === "outside" || !layer2?.text || !box) {
      if (editing) finishEditing();
      else newText(at);
      return null;
    }
    let caret = null;
    if (grab.kind === "inside" && editing?.layer === layer2) {
      caret = caretAt(layer2.text, at);
      editing.input.focus({ preventScroll: true });
      editing.input.setSelectionRange(caret, caret);
    }
    return {
      grab,
      start: at,
      spec: { ...layer2.text },
      corners: box.corners,
      middle: box.middle,
      moved: false,
      remembered: false,
      caret
    };
  }
  function textDrag(hold, at, unit, snap) {
    const layer2 = textLayer();
    const text = layer2?.text;
    if (!layer2 || !text) return;
    if (hold.caret !== null && editing?.layer === layer2) {
      const to = caretAt(text, at);
      const from = hold.caret;
      editing.input.setSelectionRange(Math.min(from, to), Math.max(from, to), to < from ? "backward" : "forward");
      return;
    }
    if (!hold.moved) {
      if (hold.grab.kind === "inside" && Math.hypot(at.x - hold.start.x, at.y - hold.start.y) < DRAG_START_PX * unit) return;
      hold.moved = true;
    }
    if (!hold.remembered) {
      remember([]);
      hold.remembered = true;
    }
    const { grab, spec } = hold;
    if (grab.kind === "scale") {
      const anchor = hold.corners[(grab.corner + 2) % 4];
      const dragged = hold.corners[grab.corner];
      const dx = dragged.x - anchor.x;
      const dy = dragged.y - anchor.y;
      const ratio = Math.max(4 / spec.size, ((at.x - anchor.x) * dx + (at.y - anchor.y) * dy) / (dx * dx + dy * dy || 1));
      text.size = spec.size * ratio;
      const { width, height } = measureText(text);
      text.x = anchor.x + dx * ratio / 2 - width / 2;
      text.y = anchor.y + dy * ratio / 2 - height / 2;
    } else if (grab.kind === "rotate") {
      const turn = Math.atan2(at.y - hold.middle.y, at.x - hold.middle.x) - Math.atan2(hold.start.y - hold.middle.y, hold.start.x - hold.middle.x);
      const angle = spec.angle + turn;
      text.angle = snap ? Math.round(angle / TURN_SNAP) * TURN_SNAP : angle;
    } else {
      text.x = spec.x + at.x - hold.start.x;
      text.y = spec.y + at.y - hold.start.y;
    }
    textLook = { ...textLook, size: text.size };
    redrawText(layer2);
    placeTextEditor();
  }
  function textRelease(hold) {
    const layer2 = textLayer();
    if (!layer2 || !active) return;
    if (hold.caret !== null) editing?.input.focus({ preventScroll: true });
    else if (!hold.moved && hold.grab.kind === "inside" && layer2.text) {
      const caret = caretAt(layer2.text, hold.start);
      startEditing(layer2, false);
      editing?.input.setSelectionRange(caret, caret);
    } else if (hold.remembered) save(active, layer2);
    syncToolbar();
  }
  var HANDLE_PX = 5;
  var GRAB_PX = 10;
  var KNOB_GAP_PX = 24;
  var KNOB_PX = 8;
  var TURN_REACH_PX = 30;
  var TURN_SNAP = Math.PI / 12;
  var TURN_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path d='M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35Z' fill='#000' stroke='#fff' stroke-width='1.2'/></svg>"
  )}") 12 12, grab`;
  function selectionBox(unit) {
    if (!selection) return null;
    const float = selection.float;
    let corners;
    if (float) {
      const { width, height } = float.canvas;
      corners = [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: height },
        { x: 0, y: height }
      ].map((p) => placePoint(float, p));
    } else {
      const xs = selection.path.map((p) => p.x);
      const ys = selection.path.map((p) => p.y);
      const [left, right, top, bottom] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      corners = [
        { x: left, y: top },
        { x: right, y: top },
        { x: right, y: bottom },
        { x: left, y: bottom }
      ];
    }
    return boxAround(corners, unit);
  }
  function boxAround(corners, unit) {
    const [a, b, c] = corners;
    const middle = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
    const top = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const up = Math.hypot(top.x - middle.x, top.y - middle.y);
    const ux = up > 1e-3 ? (top.x - middle.x) / up : 0;
    const uy = up > 1e-3 ? (top.y - middle.y) / up : -1;
    let knob = { x: top.x + ux * KNOB_GAP_PX * unit, y: top.y + uy * KNOB_GAP_PX * unit };
    const shown = activeCanvas();
    if (shown && (knob.x < 0 || knob.y < 0 || knob.x > shown.width || knob.y > shown.height)) {
      knob = { x: top.x - ux * KNOB_GAP_PX * unit, y: top.y - uy * KNOB_GAP_PX * unit };
    }
    return { corners, middle, top, knob };
  }
  function insideBox(p, corners) {
    let sign = 0;
    for (let i = 0; i < corners.length; i += 1) {
      const a = corners[i];
      const b = corners[(i + 1) % corners.length];
      const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
      if (cross === 0) continue;
      if (sign === 0) sign = Math.sign(cross);
      else if (Math.sign(cross) !== sign) return false;
    }
    return true;
  }
  function distanceToEdge(p, corners) {
    let best = Infinity;
    corners.forEach((a, i) => {
      const b = corners[(i + 1) % corners.length];
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / (ex * ex + ey * ey || 1)));
      best = Math.min(best, Math.hypot(a.x + ex * t - p.x, a.y + ey * t - p.y));
    });
    return best;
  }
  function grabAt(at, unit, box) {
    if (!box) return { kind: "outside" };
    const near = box.corners.map((corner2) => Math.hypot(at.x - corner2.x, at.y - corner2.y));
    const corner = near.findIndex((distance) => distance <= GRAB_PX * unit);
    if (corner >= 0) return { kind: "scale", corner };
    if (Math.hypot(at.x - box.knob.x, at.y - box.knob.y) <= (KNOB_PX + 3) * unit) return { kind: "rotate" };
    if (insideBox(at, box.corners)) return { kind: "inside" };
    if (distanceToEdge(at, box.corners) <= GRAB_PX * unit) return { kind: "move" };
    return Math.min(...near) <= TURN_REACH_PX * unit ? { kind: "rotate" } : { kind: "outside" };
  }
  function selectionGrab(at, unit) {
    const grab = grabAt(at, unit, selectionBox(unit));
    return grab.kind === "inside" || grab.kind === "outside" ? { kind: "move" } : grab;
  }
  function cursorFor(grab, box) {
    if (grab.kind === "rotate") return TURN_CURSOR;
    if (grab.kind !== "scale") return "move";
    const corner = box?.corners[grab.corner];
    if (!box || !corner) return "move";
    const degrees = Math.atan2(corner.y - box.middle.y, corner.x - box.middle.x) * 180 / Math.PI;
    return (degrees % 180 + 180) % 180 < 90 ? "nwse-resize" : "nesw-resize";
  }
  function drawHandles(context, unit, box) {
    if (!box) return;
    context.setLineDash([]);
    context.lineWidth = unit;
    context.strokeStyle = "#0075ff";
    tracePath(context, box.corners, 0, 0, true);
    context.stroke();
    context.beginPath();
    context.moveTo(box.top.x, box.top.y);
    context.lineTo(box.knob.x, box.knob.y);
    context.stroke();
    context.beginPath();
    context.arc(box.knob.x, box.knob.y, KNOB_PX * unit, 0, Math.PI * 2);
    context.fillStyle = "#fff";
    context.fill();
    context.stroke();
    const r = KNOB_PX * unit * 0.5;
    context.beginPath();
    context.arc(box.knob.x, box.knob.y, r, -Math.PI * 0.35, Math.PI * 1.25);
    context.lineWidth = 1.5 * unit;
    context.stroke();
    const endX = box.knob.x + r * Math.cos(-Math.PI * 0.35);
    const endY = box.knob.y + r * Math.sin(-Math.PI * 0.35);
    context.beginPath();
    context.moveTo(endX + 2.5 * unit, endY - 2 * unit);
    context.lineTo(endX, endY);
    context.lineTo(endX + 3 * unit, endY + 2.5 * unit);
    context.stroke();
    context.lineWidth = unit;
    for (const corner of box.corners) {
      const half = HANDLE_PX * unit;
      context.fillStyle = "#fff";
      context.fillRect(corner.x - half, corner.y - half, half * 2, half * 2);
      context.strokeRect(corner.x - half, corner.y - half, half * 2, half * 2);
    }
  }
  function transformTo(hold, at, snap) {
    const float = selection?.float;
    if (!float) return;
    const { width, height } = float.canvas;
    if (hold.grab.kind === "scale") {
      const anchor = hold.corners[(hold.grab.corner + 2) % 4];
      const dragged = hold.corners[hold.grab.corner];
      const dx = dragged.x - anchor.x;
      const dy = dragged.y - anchor.y;
      const length = dx * dx + dy * dy || 1;
      const smallest = 4 / Math.max(1, Math.min(width, height) * hold.scale);
      const ratio = Math.max(smallest, ((at.x - anchor.x) * dx + (at.y - anchor.y) * dy) / length);
      float.scale = hold.scale * ratio;
      float.x = anchor.x + dx * ratio / 2 - width / 2;
      float.y = anchor.y + dy * ratio / 2 - height / 2;
    } else if (hold.grab.kind === "rotate") {
      const turn = Math.atan2(at.y - hold.middle.y, at.x - hold.middle.x) - Math.atan2(hold.start.y - hold.middle.y, hold.start.x - hold.middle.x);
      const angle = hold.angle + turn;
      float.angle = snap ? Math.round(angle / TURN_SNAP) * TURN_SNAP : angle;
    }
    placeOutline();
  }
  function drawAnts() {
    const canvas = activeCanvas();
    const path = lassoing ?? selection?.path ?? null;
    const parent = canvas?.parentElement;
    const unit = canvas ? scaleOf(canvas) : 1;
    const textHandles = canvas ? textBox(unit) : null;
    const outline = path && path.length >= 2 ? path : null;
    if (!canvas || !parent || !outline && !textHandles) {
      if (ants?.isConnected) ants.remove();
      antsKey = "";
      return;
    }
    if (!ants) {
      ants = document.createElement("canvas");
      ants.className = "doodle-ants";
    }
    if (ants.parentElement !== parent) parent.appendChild(ants);
    setStyle(ants, "left", `${canvas.offsetLeft}px`);
    setStyle(ants, "top", `${canvas.offsetTop}px`);
    setStyle(ants, "width", `${canvas.offsetWidth}px`);
    setStyle(ants, "height", `${canvas.offsetHeight}px`);
    const tick = Math.floor(performance.now() / ANTS_STEP_MS) % 3;
    const textKey = textHandles ? textHandles.corners.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(";") : "";
    const end = lassoing?.[lassoing.length - 1];
    const drawn = lassoing ? `${lassoing.length}:${Math.round(end?.x ?? 0)},${Math.round(end?.y ?? 0)}` : "";
    const key = `${tick}|${antsVersion}|${tool}|${drawn}|${canvas.width}x${canvas.height}|${canvas.offsetWidth}|${textKey}`;
    if (key === antsKey) return;
    antsKey = key;
    if (ants.width !== canvas.width) ants.width = canvas.width;
    if (ants.height !== canvas.height) ants.height = canvas.height;
    const context = ants.getContext("2d");
    if (!context) return;
    const dash = ANTS_DASH * unit;
    context.clearRect(0, 0, ants.width, ants.height);
    if (outline) {
      context.lineWidth = unit;
      const split = !lassoing ? selection?.split : void 0;
      if (split) {
        tracePath(context, outline.slice(0, split - 1), 0, 0, true);
        const hole = outline.slice(split);
        hole.forEach((p, i) => i === 0 ? context.moveTo(p.x, p.y) : context.lineTo(p.x, p.y));
        context.closePath();
      } else {
        tracePath(context, outline, 0, 0, !lassoing || lassoMode === "rect" && !polygon && !drawingPath);
      }
      context.setLineDash([]);
      context.strokeStyle = "#fff";
      context.stroke();
      context.setLineDash([dash, dash]);
      context.lineDashOffset = -tick * (dash * 2) / 3;
      context.strokeStyle = "#000";
      context.stroke();
    }
    if (tool === "move" && selection && !lassoing) drawHandles(context, unit, selectionBox(unit));
    if (textHandles) drawHandles(context, unit, textHandles);
  }
  function wireCanvas(id, element, canvas) {
    element.addEventListener(
      "wheel",
      (event) => {
        if (full) return;
        const body = noteBody();
        if (!body) return;
        scrollerOf(body).scrollTop += event.deltaY;
        event.preventDefault();
      },
      { passive: false }
    );
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    const point = (event) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) * canvas.width / rect.width,
        y: (event.clientY - rect.top) * canvas.height / rect.height
      };
    };
    let press = null;
    let stroke = null;
    let lastMove = null;
    let hold = null;
    let textHold = null;
    let lassoFrom = null;
    let shiftFrom = null;
    canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      if (active !== id) {
        canvas.setPointerCapture(event.pointerId);
        drag = {
          id,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          dx: 0,
          dy: 0,
          moving: false,
          spots: [],
          target: null
        };
        return;
      }
      closePopups();
      const at = point(event);
      if (drawingPath) {
        lassoing = [at];
        press = "path";
        canvas.setPointerCapture(event.pointerId);
        return;
      }
      if (tool === "lasso" && lassoMode === "polygon") {
        canvas.setPointerCapture(event.pointerId);
        press = "polygon";
        const first = polygon?.[0];
        if (!polygon || !first) {
          lassoBefore = outlineNow();
          dropSelection();
          polygon = [at];
          lassoing = [at, at];
          return;
        }
        const unit = scaleOf(canvas);
        if (polygon.length >= 3 && Math.hypot(at.x - first.x, at.y - first.y) <= CLOSE_PX * unit) {
          closePolygon();
          press = null;
          return;
        }
        const last = polygon[polygon.length - 1];
        const next = event.shiftKey ? snapLine(last, at) : at;
        if (Math.hypot(next.x - last.x, next.y - last.y) > 2 * unit) polygon.push(next);
        lassoing = [...polygon];
        return;
      }
      if (tool === "lasso") {
        lassoBefore = outlineNow();
        dropSelection();
        lassoing = [at];
        lassoFrom = lassoMode === "rect" ? at : null;
        shiftFrom = null;
        press = "lasso";
        canvas.setPointerCapture(event.pointerId);
        return;
      }
      if (tool === "text") {
        textHold = textPress(at, scaleOf(canvas));
        if (!textHold) return;
        press = "text";
        canvas.setPointerCapture(event.pointerId);
        return;
      }
      const layer2 = currentLayer();
      if (!layer2 || !canDraw()) return;
      if (tool === "move") {
        if (!selection) return;
        const unit = scaleOf(canvas);
        const grab = selectionGrab(at, unit);
        if (!selection.float) {
          remember();
          lift(layer2.canvas);
        }
        const float = selection.float;
        const box = selectionBox(unit);
        if (!float || !box) return;
        hold = { grab, start: at, scale: float.scale, angle: float.angle, corners: box.corners, middle: box.middle };
        lastMove = at;
        press = "move";
        canvas.setPointerCapture(event.pointerId);
        return;
      }
      remember();
      settleFloat();
      if (useGradient && tool !== "eraser") keepGradient(gradient);
      if (tool === "bucket") {
        const target = drawTarget(layer2.canvas);
        const all = bucketReadsAll && !selection?.float ? canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data ?? null : null;
        floodFill(target.canvas, at.x - target.x, at.y - target.y, fillPaint(target), opacity, selectionMask(target), all);
        if (selection?.float) showFloat(layer2.canvas);
        render(id);
        save(id, layer2);
        return;
      }
      canvas.setPointerCapture(event.pointerId);
      const from = event.shiftKey && lastEnd?.id === id ? lastEnd.at : null;
      stroke = startStroke(canvas, layer2.canvas, from ?? at);
      if (from) {
        stroke.joined = true;
        stroke.points.push(at);
        paintStroke(stroke);
      }
      render(id);
      press = "stroke";
    });
    canvas.addEventListener("pointermove", (event) => {
      if (drag?.id === id) {
        followDrag(event);
        return;
      }
      const at = point(event);
      if (!press && active === id) {
        const unit = scaleOf(canvas);
        let want = "";
        if (tool === "move" && selection) want = cursorFor(selectionGrab(at, unit), selectionBox(unit));
        else if (tool === "text") {
          const box = textBox(unit);
          const grab = grabAt(at, unit, box);
          want = grab.kind === "inside" || grab.kind === "outside" ? "text" : cursorFor(grab, box);
        }
        if (canvas.style.cursor !== want) canvas.style.cursor = want;
      }
      if (press === "text" && textHold) {
        textDrag(textHold, at, scaleOf(canvas), event.shiftKey);
        return;
      }
      if (press === "stroke" && stroke) {
        const start2 = stroke.points[0];
        if (stroke.joined) stroke.points = [start2, at];
        else if (event.shiftKey) stroke.points = [start2, snapLine(start2, at)];
        else stroke.points.push(at);
        paintStroke(stroke);
        render(id);
      } else if (polygon && active === id) {
        const placing = press === "polygon" && polygon.length > 1;
        const before = polygon[polygon.length - (placing ? 2 : 1)];
        const to = event.shiftKey ? snapLine(before, at) : at;
        if (placing) polygon[polygon.length - 1] = to;
        lassoing = placing ? [...polygon] : [...polygon, to];
      } else if (press === "lasso" && lassoing && lassoFrom) {
        let { x, y } = at;
        if (event.shiftKey) {
          const side = Math.max(Math.abs(x - lassoFrom.x), Math.abs(y - lassoFrom.y));
          x = lassoFrom.x + Math.sign(x - lassoFrom.x || 1) * side;
          y = lassoFrom.y + Math.sign(y - lassoFrom.y || 1) * side;
        }
        lassoing = [lassoFrom, { x, y: lassoFrom.y }, { x, y }, { x: lassoFrom.x, y }];
      } else if (press === "lasso" && lassoing && event.shiftKey) {
        shiftFrom ?? (shiftFrom = lassoing.length);
        const from = lassoing[shiftFrom - 1];
        lassoing = [...lassoing.slice(0, shiftFrom), snapLine(from, at)];
      } else if ((press === "lasso" || press === "path") && lassoing) {
        shiftFrom = null;
        const last = lassoing[lassoing.length - 1];
        if (!last || Math.hypot(at.x - last.x, at.y - last.y) >= 2) lassoing.push(at);
      } else if (press === "move" && lastMove && hold) {
        const layer2 = currentLayer();
        if (layer2 && hold.grab.kind === "move") shiftSelection(layer2.canvas, at.x - lastMove.x, at.y - lastMove.y);
        else if (layer2) {
          transformTo(hold, at, event.shiftKey);
          showFloat(layer2.canvas);
          render(id);
        }
        lastMove = at;
      }
    });
    const finish = () => {
      const was = press;
      press = null;
      const end = stroke?.points[stroke.points.length - 1];
      if (end) lastEnd = { id, at: end };
      stroke = null;
      lastMove = null;
      hold = null;
      const held = textHold;
      textHold = null;
      const layer2 = currentLayer();
      if (was === "text") {
        if (held) textRelease(held);
        return;
      }
      if (was === "polygon") return;
      lassoFrom = null;
      shiftFrom = null;
      if (was === "lasso") finishLasso();
      else if (was === "path") finishPath();
      else if (was && layer2) save(id, layer2);
    };
    canvas.addEventListener("dblclick", () => {
      if (active === id && polygon && polygon.length >= 3) closePolygon();
    });
    canvas.addEventListener("dragover", (event) => {
      if (active === id && event.dataTransfer?.types.includes("Files")) event.preventDefault();
    });
    canvas.addEventListener("drop", (event) => {
      if (active !== id) return;
      const file = [...event.dataTransfer?.files ?? []].find((one) => one.type.startsWith("image/"));
      if (!file) return;
      event.preventDefault();
      importImage(file);
    });
    canvas.addEventListener("pointerup", (event) => {
      if (drag?.id === id) endDrag(event);
      else finish();
    });
    canvas.addEventListener("pointercancel", () => {
      if (drag?.id === id) drag = null;
      else finish();
    });
  }
  function compact() {
    return inPda() || isMobileView();
  }
  var wantFull = false;
  function activate(id) {
    if (active !== id) finishEditing();
    if (active !== id) dropSelection();
    if (active !== id && full) exitFull();
    if (active !== id) refit(id);
    active = id;
    toolsOpen = true;
    if (compact()) wantFull = true;
    undoStack = [];
    redoStack = [];
    picked.clear();
    setStatus("");
    syncToolbar();
    refreshLayers();
  }
  function release() {
    finishEditing();
    dropSelection();
    if (full) exitFull();
    closePopups();
    active = null;
    undoStack = [];
    redoStack = [];
  }
  function deactivate() {
    release();
    toolsOpen = false;
    wantFull = false;
  }
  function activeCanvas() {
    return active ? frames.get(active)?.canvas ?? null : null;
  }
  function activeDoc() {
    return active ? frames.get(active)?.doc ?? null : null;
  }
  function currentLayer() {
    return activeDoc()?.current ?? null;
  }
  function canDraw() {
    const layer2 = currentLayer();
    if (!layer2) return false;
    if (layer2.locked) setStatus(`${layer2.name} is locked`);
    else if (!layer2.visible) setStatus(`${layer2.name} is hidden`);
    else if (layer2.text) askToFlatten(layer2);
    return !layer2.locked && layer2.visible && !layer2.text;
  }
  function askToFlatten(layer2) {
    askQuestion(`Turn ${layer2.name} into pixels so it can be painted on? Its text will no longer be editable.`, "Turn into pixels", () => {
      if (!active) return;
      remember([]);
      layer2.text = null;
      save(active, layer2);
      refreshLayers();
      syncToolbar();
    });
  }
  var statusNote = null;
  var statusTimer = 0;
  var STATUS_MS = 3e3;
  function setStatus(text, stay = text === "Uploading") {
    window.clearTimeout(statusTimer);
    const parent = activeCanvas()?.parentElement;
    if (!text || !parent) {
      statusNote?.remove();
      return;
    }
    if (!statusNote) {
      statusNote = document.createElement("div");
      statusNote.className = "doodle-status";
    }
    statusNote.textContent = text;
    if (statusNote.parentElement !== parent) parent.appendChild(statusNote);
    if (!stay) statusTimer = window.setTimeout(() => statusNote?.remove(), STATUS_MS);
  }
  function copyPicture() {
    const canvas = activeCanvas();
    if (!canvas) return;
    clipboardFresh = false;
    if (inPda() && canUpload()) {
      uploadAndCopy(canvas);
      return;
    }
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
      showPicture(canvas, inPda() ? "Press and hold to save" : void 0);
      return;
    }
    const png = new Promise(
      (resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("no image")), "image/png")
    );
    navigator.clipboard.write([new ClipboardItem({ "image/png": png })]).then(() => setStatus("Copied")).catch((error) => {
      log("notes draw: copy failed", error);
      showPicture(canvas);
    });
  }
  var UPLOAD_OK_KEY = "AND_UPLOAD_OK";
  function uploadAgreed() {
    try {
      return localStorage.getItem(UPLOAD_OK_KEY) === "1";
    } catch {
      return false;
    }
  }
  function uploadAndCopy(canvas) {
    if (!uploadAgreed()) {
      askQuestion("Upload this Masterpiece to Pasteboard to share it in chat?", "Upload", () => {
        try {
          localStorage.setItem(UPLOAD_OK_KEY, "1");
        } catch {
        }
        uploadAndCopy(canvas);
      });
      return;
    }
    setStatus("Uploading");
    canvas.toBlob((png) => {
      if (!png) return;
      uploadPicture(png).then(copyLink).catch((error) => {
        log("notes draw: upload failed", error);
        setStatus("Upload failed");
      });
    }, "image/png");
  }
  function copyLink(link) {
    const shown = () => {
      setStatus("");
      showLink(link);
    };
    if (!navigator.clipboard?.writeText) {
      shown();
      return;
    }
    navigator.clipboard.writeText(link).then(() => setStatus("Link copied")).catch(shown);
  }
  function showLink(link) {
    document.getElementById(CONFIRM_ID)?.remove();
    const panel = document.createElement("div");
    panel.id = CONFIRM_ID;
    const text = document.createElement("p");
    text.className = "doodle-link";
    text.textContent = link;
    const copy = toolButton("Copy", () => {
      void navigator.clipboard?.writeText(link).then(() => {
        panel.remove();
        setStatus("Link copied");
      }).catch(() => {
      });
    });
    copy.dataset.enter = "";
    const buttons = document.createElement("div");
    buttons.className = "doodle-row";
    buttons.append(copy, toolButton("Close", () => panel.remove()));
    panel.append(text, buttons);
    document.body.appendChild(panel);
    placeConfirm(panel);
  }
  function inPda() {
    return "flutter_inappwebview" in window;
  }
  function showPicture(canvas, words = "Press and hold to copy") {
    document.getElementById(PICTURE_ID)?.remove();
    const cover = document.createElement("div");
    cover.id = PICTURE_ID;
    const picture = document.createElement("img");
    picture.src = canvas.toDataURL("image/png");
    picture.alt = "Drawing";
    const label = document.createElement("p");
    label.textContent = words;
    cover.append(picture, label);
    cover.addEventListener("click", (event) => {
      if (event.target !== picture) cover.remove();
    });
    document.body.appendChild(cover);
  }
  function downloadPicture(name) {
    const canvas = activeCanvas();
    if (!canvas || !active) return;
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    const safe = name.replace(/[\\/:*?"<>|]+/g, "").trim();
    link.download = `${safe || "drawing"}.png`;
    link.click();
  }
  function askName() {
    if (!active) return;
    const canvas = activeCanvas();
    if (inPda() && canvas) {
      showPicture(canvas, "Press and hold to save");
      return;
    }
    document.getElementById(CONFIRM_ID)?.remove();
    const panel = document.createElement("div");
    panel.id = CONFIRM_ID;
    const label = document.createElement("label");
    label.textContent = "Name this Masterpiece";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "doodle-name";
    input.maxLength = 100;
    label.appendChild(input);
    const save2 = toolButton("Save", () => {
      const name = input.value.trim();
      if (!name) return;
      panel.remove();
      downloadPicture(name);
    });
    const sync2 = () => {
      save2.disabled = input.value.trim() === "";
    };
    input.addEventListener("input", sync2);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") save2.click();
    });
    sync2();
    const buttons = document.createElement("div");
    buttons.className = "doodle-row";
    buttons.append(save2, toolButton("Cancel", () => panel.remove()));
    panel.append(label, buttons);
    document.body.appendChild(panel);
    placeConfirm(panel);
    input.focus();
  }
  function step(back) {
    if (!active) return;
    finishEditing();
    putDownFloat();
    lassoing = null;
    polygon = null;
    const last = undoStack[undoStack.length - 1];
    if (back && last && last.kind !== "doc") {
      undoStack.pop();
      undoEdit(last);
      return;
    }
    const doc = activeDoc();
    if (!doc) return;
    const from = back ? undoStack : redoStack;
    const state = from.pop();
    if (!state || state.kind !== "doc") return;
    const now = snapshot(doc, state.pixels.map(({ layer: layer2 }) => layer2));
    if (back) redoStack.push(now);
    else undoStack.push(now);
    restore(doc, state);
    const canvas = activeCanvas();
    const first = doc.layers[0];
    if (canvas && first && (canvas.width !== first.canvas.width || canvas.height !== first.canvas.height)) {
      canvas.width = first.canvas.width;
      canvas.height = first.canvas.height;
    }
    picked.clear();
    render();
    save(active, ...state.pixels.map(({ layer: layer2 }) => layer2), ...doc.layers.filter((layer2) => layer2.text));
    refreshLayers();
    syncToolbar();
  }
  function undoEdit(edit) {
    const body = noteBody();
    const block = body ? blockFor(edit.id) : null;
    if (!body || !block) return;
    const value = body.value;
    if (edit.kind === "created") {
      const start2 = value.slice(block.start - edit.lead.length, block.start) === edit.lead ? block.start - edit.lead.length : block.start;
      const end = value.slice(block.end, block.end + edit.tail.length) === edit.tail ? block.end + edit.tail.length : Math.min(value.length, block.end + 1);
      release();
      replaceText(body, start2, end, "");
      if (edit.before && blockFor(edit.before)) activate(edit.before);
      return;
    }
    replaceText(body, block.start, block.end, edit.oldText);
    const canvas = activeCanvas();
    if (!canvas || !active) return;
    for (const { layer: layer2, image } of edit.images) {
      layer2.canvas.width = image.width;
      layer2.canvas.height = image.height;
      layer2.canvas.getContext("2d")?.putImageData(image, 0, 0);
    }
    for (const { layer: layer2, text } of edit.texts ?? []) layer2.text = { ...text };
    const first = edit.images[0]?.image;
    if (first) {
      canvas.width = first.width;
      canvas.height = first.height;
    }
    render();
    save(active, ...edit.images.map(({ layer: layer2 }) => layer2));
    redoStack = [];
    syncToolbar();
  }
  function clearPicture() {
    dropSelection();
    const layer2 = currentLayer();
    if (!layer2 || !active || !canDraw()) return;
    remember();
    layer2.canvas.getContext("2d")?.clearRect(0, 0, layer2.canvas.width, layer2.canvas.height);
    render();
    save(active, layer2);
  }
  function allImages(doc) {
    return snapshot(doc, doc.layers).pixels;
  }
  function rotatePicture() {
    dropSelection();
    const body = noteBody();
    const block = active ? blockFor(active) : null;
    const canvas = activeCanvas();
    const doc = activeDoc();
    if (!body || !block || !canvas || !doc || !active) return;
    const turned = block.shape === "l" ? "p" : block.shape === "p" ? "l" : "s";
    const oldText = body.value.slice(block.start, block.end);
    const images = allImages(doc);
    const texts = doc.layers.flatMap((layer2) => layer2.text ? [{ layer: layer2, text: { ...layer2.text } }] : []);
    for (const layer2 of doc.layers) {
      const copy = copyOf(layer2.canvas, true);
      if (layer2.text) {
        const middle = middleOfText(layer2.text);
        const { width, height } = measureText(layer2.text);
        layer2.text.x = copy.height - middle.y - width / 2;
        layer2.text.y = middle.x - height / 2;
        layer2.text.angle += Math.PI / 2;
      }
      layer2.canvas.width = copy.height;
      layer2.canvas.height = copy.width;
      const context = layer2.canvas.getContext("2d");
      if (!context) continue;
      context.translate(layer2.canvas.width, 0);
      context.rotate(Math.PI / 2);
      context.drawImage(copy, 0, 0);
      context.setTransform(1, 0, 0, 1, 0, 0);
    }
    [canvas.width, canvas.height] = [canvas.height, canvas.width];
    if (turned !== block.shape || !block.named) {
      replaceText(body, block.start, block.end, blockText(active, turned, linesToReserve(body, turned)));
    }
    undoStack.push({ kind: "reshaped", id: active, oldText, images, texts });
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    redoStack = [];
    const frame = frames.get(active);
    if (frame) fitShape(frame, turned);
    render();
    save(active, ...doc.layers);
    syncToolbar();
  }
  function setShape(shape) {
    dropSelection();
    const body = noteBody();
    const block = active ? blockFor(active) : null;
    const frame = active ? frames.get(active) : null;
    if (!body || !block || !frame || !active) return;
    if (block.shape === shape && block.named) return;
    const oldText = body.value.slice(block.start, block.end);
    const newText2 = blockText(active, shape, linesToReserve(body, shape));
    const images = allImages(frame.doc);
    replaceText(body, block.start, block.end, newText2);
    undoStack.push({ kind: "reshaped", id: active, oldText, images });
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    redoStack = [];
    if (fitShape(frame, shape)) save(active, ...frame.doc.layers);
    syncToolbar();
  }
  function toolButton(label, onClick, className = "torn-btn doodle-btn") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    if (label) button.textContent = label;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      onClick();
    });
    return button;
  }
  function shapeIcon(shape) {
    const box = document.createElement("span");
    box.className = `doodle-shape-icon doodle-shape-${shape}`;
    return box;
  }
  function closePopups() {
    for (const popup of document.querySelectorAll(`#${TOOLBAR_ID} .doodle-popup, #${TOOLBAR_ID} .doodle-float`)) {
      popup.hidden = true;
    }
  }
  function togglePopup(name) {
    const popup = document.querySelector(`#${TOOLBAR_ID} .doodle-popup[data-popup="${name}"]`);
    if (!popup) return;
    const opening = popup.hidden;
    closePopups();
    popup.hidden = !opening;
  }
  function withPopup(name, button, popup) {
    const holder = document.createElement("span");
    holder.className = "doodle-holder";
    popup.classList.add("doodle-popup");
    popup.dataset.popup = name;
    popup.hidden = true;
    button.addEventListener("click", () => togglePopup(name));
    holder.append(button, popup);
    return holder;
  }
  function nearMarker(hex) {
    const [r, g, b] = rgbOf(hex);
    return Math.hypot(r - MARKER_BLUE[0], g - MARKER_BLUE[1], b - MARKER_BLUE[2]) < NEAR_MARKER;
  }
  function sliderBox(range) {
    const box = document.createElement("div");
    box.className = "doodle-slider";
    box.style.padding = `0 ${SLIDER_PAD}px`;
    range.type = "range";
    range.classList.add("doodle-range");
    range.style.width = `${SLIDER_WIDTH}px`;
    box.appendChild(range);
    return box;
  }
  var toolbarLayouts = null;
  function arrangeToolbar(bar) {
    if (!toolbarLayouts) return;
    const { rows } = toolbarLayouts;
    const view = full && !isMobileView() ? "full" : "notes";
    if (bar.dataset.layout !== view) {
      bar.dataset.layout = view;
      closePopups();
      toolbarLayouts[view].forEach((parts, index) => rows[index]?.replaceChildren(...parts));
    }
    for (const holder of bar.querySelectorAll("[data-for]")) {
      const always = view === "full" && !holder.closest(".doodle-top-bar");
      setHidden(holder, !always && !(holder.dataset.for ?? "").split(" ").includes(tool));
    }
    const top = topBarElement();
    const prompt = top?.querySelector(".doodle-path-prompt");
    if (top && prompt) {
      for (const child of top.children) if (child !== prompt && drawingPath) setHidden(child, true);
      setHidden(prompt, !drawingPath);
    }
    if (top) setHidden(top, ![...top.children].some((child) => !child.hidden));
    for (const row of rows) {
      setHidden(row, ![...row.children].some((child) => !child.hidden));
    }
  }
  function syncToolbar() {
    const bar = document.getElementById(TOOLBAR_ID);
    if (!bar) return;
    arrangeToolbar(bar);
    const swatch = bar.querySelector(".doodle-colour:not(.doodle-text-colour)");
    if (swatch) swatch.style.background = useGradient ? gradientCss(gradient) : colour;
    syncTextOptions(bar);
    if (polygon && tool !== "lasso") {
      polygon = null;
      lassoing = null;
      antsVersion += 1;
    }
    if (tool !== "text" && editing) finishEditing();
    for (const option of bar.querySelectorAll("[data-reads-all]")) {
      option.classList.toggle(ON_CLASS, option.dataset.readsAll === String(bucketReadsAll));
    }
    const along = Math.max(0, Math.min(1, (size - SIZE_MIN) / (SIZE_MAX - SIZE_MIN)));
    const sizeRange = bar.querySelector("[data-brush-size]");
    if (sizeRange && document.activeElement !== sizeRange) sizeRange.value = String(size);
    const dot = bar.querySelector(".doodle-size span");
    const shownDot = 3 + along * 15;
    if (dot) dot.style.width = dot.style.height = `${Math.round(shownDot)}px`;
    const paint = useGradient ? gradient.stops.reduce((first, stop) => stop.at < first.at ? stop : first).colour : colour;
    const brush = bar.querySelector(".doodle-brush");
    if (brush) {
      const ink = tool === "eraser" ? BACKGROUND : paint;
      const ring = size > THUMB_SIZE - 4;
      brush.style.left = `${SLIDER_PAD + THUMB_SIZE / 2 + along * (SLIDER_WIDTH - THUMB_SIZE)}px`;
      brush.style.width = brush.style.height = `${size}px`;
      brush.classList.toggle("doodle-brush-ring", ring);
      brush.style.borderColor = ink;
      brush.style.background = ring ? "transparent" : nearMarker(ink) ? "#000" : ink;
    }
    const hardDot = bar.querySelector(".doodle-hard-dot");
    if (hardDot) {
      const ink = tool === "eraser" ? BACKGROUND : nearMarker(paint) ? "#ffffff" : paint;
      const rgb = rgbOf(ink).join(", ");
      hardDot.style.top = `${SLIDER_PAD + THUMB_SIZE / 2 + (1 - hardness) * (SLIDER_WIDTH - THUMB_SIZE)}px`;
      hardDot.style.background = `radial-gradient(circle closest-side, rgb(${rgb}) ${Math.round(hardness * 100)}%, rgba(${rgb}, 0) 100%)`;
    }
    const fade = bar.querySelector(".doodle-opacity-range");
    fade?.style.setProperty("--doodle-fill", `rgba(${MARKER_BLUE.join(", ")}, ${opacity})`);
    for (const button of bar.querySelectorAll("[data-tool]")) {
      const on = button.dataset.tool === tool || button.dataset.tool === "lasso" && tool === "move";
      button.classList.toggle(ON_CLASS, on);
    }
    const smoothButton = bar.querySelector(".doodle-smooth");
    if (smoothButton && smoothButton.dataset.level !== String(smoothing)) {
      smoothButton.dataset.level = String(smoothing);
      smoothButton.innerHTML = svgIcon(SMOOTH_ICONS[smoothing] ?? "");
    }
    for (const option of bar.querySelectorAll("[data-smooth]")) {
      option.classList.toggle(ON_CLASS, option.dataset.smooth === String(smoothing));
    }
    const lassoButton = bar.querySelector(".doodle-lasso-btn");
    if (lassoButton && lassoButton.dataset.mode !== lassoMode) {
      lassoButton.dataset.mode = lassoMode;
      lassoButton.innerHTML = svgIcon(LASSO_ICONS[lassoMode]);
    }
    for (const option of bar.querySelectorAll("[data-lasso-mode]")) {
      option.classList.toggle(ON_CLASS, option.dataset.lassoMode === lassoMode);
    }
    const tipButton = bar.querySelector(".doodle-tip");
    if (tipButton && tipButton.dataset.tip !== tip) {
      tipButton.dataset.tip = tip;
      tipButton.innerHTML = svgIcon(TIP_ICONS[tip]);
    }
    for (const option of bar.querySelectorAll("[data-tip]:not(.doodle-tip)")) {
      option.classList.toggle(ON_CLASS, option.dataset.tip === tip);
    }
    for (const option of bar.querySelectorAll("[data-needs]")) {
      option.disabled = option.dataset.needs === "selection" ? !selection : !clipboard;
    }
    const shape = (active ? blockFor(active)?.shape : null) ?? DEFAULT_SHAPE;
    const shapeButton = bar.querySelector(".doodle-shape");
    if (shapeButton && shapeButton.firstElementChild?.classList.contains(`doodle-shape-${shape}`) !== true) {
      shapeButton.replaceChildren(shapeIcon(shape));
    }
    for (const option of bar.querySelectorAll("[data-shape]")) {
      option.classList.toggle(ON_CLASS, option.dataset.shape === shape);
    }
    bar.classList.toggle("doodle-docked", full);
    bar.classList.toggle("doodle-docked-bottom", full && isMobileView());
  }
  var ICONS = {
    pen: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25Zm17.71-10.21a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z",
    eraser: "M16.24 3.56l4.95 4.94c.78.79.78 2.05 0 2.84L12 20.53a4 4 0 0 1-5.66 0L2.81 17c-.78-.79-.78-2.05 0-2.84l10.6-10.6c.79-.78 2.05-.78 2.83 0ZM4.22 15.58l3.54 3.53c.78.79 2.04.79 2.83 0l3.53-3.53-4.95-4.95-4.95 4.95Z",
    // Moved down to sit centred like the others; the shape was drawn hard against the top.
    bucket: `<path transform="translate(-0.2 3.5)" d="M16.56 8.94 7.62 0 6.21 1.41l2.38 2.38-5.15 5.15a1.49 1.49 0 0 0 0 2.12l5.5 5.5c.29.29.68.44 1.06.44s.77-.15 1.06-.44l5.5-5.5c.59-.58.59-1.53 0-2.12ZM5.21 10 10 5.21 14.79 10H5.21ZM19 11.5s-2 2.17-2 3.5c0 1.1.9 2 2 2s2-.9 2-2c0-1.33-2-3.5-2-3.5Z"/>`,
    undo: "M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8Z",
    redo: "M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6Z",
    copy: "M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1Zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2Zm0 16H8V7h11v14Z",
    // Scaled up to the others' height, now it has no tray under it.
    download: `<path transform="translate(12 12) scale(1.28) translate(-12 -11)" d="M19 11h-4V4H9v7H5l7 7 7-7Z"/>`,
    // A broom mid-sweep: the handle up to the right, and a head whose bristles
    // bend away in a curve to one side, notched along that curved edge.
    sweep: `<g transform="rotate(40 12 12) translate(12 12) scale(0.92) translate(-12 -12)">
<rect x="10.8" y="0.3" width="2.4" height="10" rx="1.2"/>
<rect x="8.4" y="10" width="7.2" height="2.6" rx="0.7"/>
<mask id="doodle-sweep-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="26">
<rect width="24" height="26" fill="#fff"/>
<path fill="#000" d="M5.63 21.58L8.2 18.5L6.43 22.06Z M9.44 22.88L10.84 19.1L10.32 23.1Z M12.36 23.25L12.73 19.3L13.26 23.25Z"/>
</mask>
<path mask="url(#doodle-sweep-cut)" d="M8.4 13.3H15.6C16.4 16.5 16 19.5 14.6 22.6C11 22.9 6.5 22 2.8 19.6C4.6 18.2 6.6 16 8.4 13.3Z"/>
</g>`,
    // A page with its corner folded and a plus on it.
    newPage: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm4 18H6V4h7v5h5v11Zm-7-9h2v3h3v2h-3v3h-2v-3H8v-2h3v-3Z",
    // A picture (sun and hills) with an arrow curling over it clockwise, so it
    // reads as turning the picture rather than as trying again.
    rotate: `<path fill-rule="evenodd" d="M3.5 8h10a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 2 19.5v-10A1.5 1.5 0 0 1 3.5 8Z
M4.8 12a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0-2.6 0Z
M3.5 19.5 7 15l2 2.5 2-2.5 2.5 4.5Z"/>
<path d="M11.5 4.5H15.5A4.5 4.5 0 0 1 20 9V10.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
<path d="M16.8 10.2 20 14l3.2-3.8Z"/>`,
    // A feather drifting on its side, its shaft and two splits in its vane cut
    // out of it. The mask's id is its own, as every copy of the icon shares it.
    feather: `<g transform="rotate(42 12 12) translate(12 12) scale(1.12) translate(-12 -12)">
<mask id="doodle-feather-cut" maskUnits="userSpaceOnUse" x="-6" y="-6" width="36" height="36">
<rect x="-6" y="-6" width="36" height="36" fill="#fff"/>
<path d="M12 4.2V17" stroke="#000" stroke-width="1.1" stroke-linecap="round"/>
<path fill="#000" d="M6 10.6 11.2 8.3 6 8.4Z M18 13.8 12.8 11.1 18 12Z"/>
</mask>
<path mask="url(#doodle-feather-cut)" d="M12 .8C17.4 3.6 18.3 10.6 13.1 17.3H10.9C5.8 11.6 6.6 4.4 12 .8Z"/>
<path d="M12 16.4V22.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" fill="none"/>
</g>`,
    // A rope with its loop dashed, like the selection it draws, knotted at the
    // bottom left with its end trailing away.
    lasso: `<ellipse cx="14.2" cy="8.8" rx="8.3" ry="5.9" transform="rotate(-28 14.2 8.8)" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="1.9 3.84" stroke-dashoffset="-1"/>
<path d="M8.6 13.4C6.6 12.8 4.4 13.9 4.5 15.9 4.6 17.8 7.2 18.4 8.3 17 9.4 15.5 8.2 13.6 6.7 14.3 5.6 14.9 6.2 16.9 6.7 18.2 7.2 19.6 6.5 21.4 4.4 22.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    move: "M10 9h4V6h3l-5-5-5 5h3v3Zm-1 1H6V7l-5 5 5 5v-3h3v-4Zm14 2-5-5v3h-3v4h3v3l5-5Zm-9 3h-4v3H7l5 5 5-5h-3v-3Z",
    cut: "M9.64 7.64c.23-.5.36-1.05.36-1.64 0-2.21-1.79-4-4-4S2 3.79 2 6s1.79 4 4 4c.59 0 1.14-.13 1.64-.36L10 12l-2.36 2.36C7.14 14.13 6.59 14 6 14c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4c0-.59-.13-1.14-.36-1.64L12 14l7 7h3v-1L9.64 7.64ZM6 8c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2Zm0 12c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2Zm6-7.5c-.28 0-.5-.22-.5-.5s.22-.5.5-.5.5.22.5.5-.22.5-.5.5ZM19 3l-6 6 2 2 7-7V3Z",
    paste: "M19 2h-4.18C14.4.84 13.3 0 12 0c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2Zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1Zm7 18H5V4h2v3h10V4h2v16Z",
    // A circle half solid, half a dashed outline: solid colour fading to none.
    // The dashes start and end on a gap, so the solid half stands clear of them.
    opacity: `<path d="M12 2a10 10 0 0 0 0 20Z"/>
<path d="M12 3a9 9 0 0 1 0 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="3 4.82" stroke-dashoffset="3"/>`,
    bin: "M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Zm4 2v8h1.5v-8H10Zm2.5 0v8H14v-8h-1.5Z",
    expand: "M3 3h7v2.5H6.8l4 4-1.8 1.8-4-4V11H2.5V3Zm18 0v8h-2.5V7.3l-4 4-1.8-1.8 4-4H13V3h8ZM3 21v-8h2.5v3.7l4-4 1.8 1.8-4 4H11V21H3Zm18 0h-8v-2.5h3.7l-4-4 1.8-1.8 4 4V13H21v8Z",
    // Three sheets stacked flat, seen from above at an angle: a whole one on
    // top, and the edges of two more showing under it.
    layers: `<path d="M12 2.5 22 8 12 13.5 2 8Z"/>
<path d="M4.3 11.4 12 15.6l7.7-4.2L22 12.7l-10 5.5-10-5.5Z"/>
<path d="M4.3 15.9 12 20.1l7.7-4.2L22 17.2l-10 5.5-10-5.5Z"/>`,
    eye: "M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5ZM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5Zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3Z",
    eyeOff: "M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7ZM2 4.27l2.28 2.28.46.46A11.8 11.8 0 0 0 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27ZM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2Zm4.31-.78 3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01Z",
    lock: "M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2Zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2Zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2Z",
    unlock: "M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2Zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h1.9c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2Zm0 12H6V10h12v10Z",
    // An arrow down and round to the right: this layer hangs off the one below.
    clip: "M19 15l-6 6-1.42-1.42L15.17 16H4V4h2v10h9.17l-3.59-3.58L13 9l6 6Z",
    add: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2Z",
    merge: "M17 20.41 18.41 19 15 15.59 13.59 17 17 20.41ZM7.5 8H11v5.59L5.59 19 7 20.41l6-6V8h3.5L12 3.5 7.5 8Z",
    image: "M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2ZM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5Z",
    // The rectangle select's dashed box, with everything round it greyed: the outside selected.
    invert: `<path fill-rule="evenodd" opacity="0.45" d="M1 2H23V22H1ZM5.5 7.5V16.5H18.5V7.5Z"/>
<rect x="5.5" y="7.5" width="13" height="9" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 1.4"/>`,
    // A capital T with serifs, for the text tool: its bar's ends dip, its foot is a bar.
    text: "M4 3H20V8.5H18.5L17.6 6H13.5V19H16V21H8V19H10.5V6H6.4L5.5 8.5H4Z"
  };
  var SMOOTH_LINE = `fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"`;
  var SMOOTH_ICONS = [
    `<path d="M3.6 16.2C3.2 14.6 4.4 14.8 4.2 13.2 4 11.6 5.4 12 5.6 10.4 5.8 8.8 7.2 9.6 7.8 8.2 8.4 6.8 9.6 8.4 10.4 7.8 11.4 7.1 11.2 9.2 11.8 10 12.4 10.8 11.4 12 12.2 13 13 14 12.4 15.4 13.6 16.2 14.6 16.9 14.4 18.6 15.8 18.6 17.2 18.6 17.2 17.2 18.2 16.6 19.2 16 18.6 14.6 19.6 13.8 20.6 13 19.8 11.6 20.4 10.4" ${SMOOTH_LINE}/>`,
    `<path d="M4 15.5C3.6 10.5 6.6 6.4 9.6 8.3 12.4 10.1 12 17.6 15.6 18.4 18.6 19 20.4 14.6 20.2 10" ${SMOOTH_LINE}/>`,
    `<path d="M3 13.5C6.5 8.5 9 8.5 12 12S17.5 15.5 21 10.5" ${SMOOTH_LINE}/>`
  ];
  var SMOOTH_LABELS = ["Smoothing off", "Smoothing medium", "Smoothing high"];
  var TIP_ICONS = {
    round: `<path d="M5.5 17.5 18.5 6.5" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>`,
    taper: "M3 19.5C8 13 14 7.5 21 4.5 16 9.5 10 15 3 19.5Z",
    square: "M2 13 14 5H21V12L9 20H2Z"
  };
  var TIP_LABELS = { round: "Round tip", taper: "Tapered tip", square: "Square tip" };
  var LASSO_ICONS = {
    free: ICONS.lasso,
    // A dashed box, like the selection it draws.
    rect: `<rect x="3.5" y="5.5" width="17" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2"/>`,
    // The lasso, its loop a burst of straight-edged spikes.
    polygon: `<path d="M22.1 6.3L18.7 9.1L19.2 11.7L15.8 12.1L13.4 15.4L11.7 12.6L8 13.3L9.5 10.3L6.9 8.4L10.8 6.8L11.9 4.1L14.7 4.8L18.4 2.4L18.2 5.8Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
<path d="M8.6 13.4C6.6 12.8 4.4 13.9 4.5 15.9 4.6 17.8 7.2 18.4 8.3 17 9.4 15.5 8.2 13.6 6.7 14.3 5.6 14.9 6.2 16.9 6.7 18.2 7.2 19.6 6.5 21.4 4.4 22.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
  };
  var LASSO_LABELS = {
    free: "Lasso",
    rect: "Rectangle select",
    polygon: "Straight line select"
  };
  function lassoTool() {
    let held = false;
    const button = iconButton("Lasso", ICONS.lasso, () => {
      if (held) {
        held = false;
        return;
      }
      tool = "lasso";
      deselect();
      syncToolbar();
    });
    button.dataset.tool = "lasso";
    button.classList.add("doodle-lasso-btn");
    const options = document.createElement("div");
    options.className = "doodle-popup";
    options.dataset.popup = "lasso";
    options.hidden = true;
    const option = (label, icon, run2, needs) => {
      const choice = iconButton(label, icon, () => {
        closePopups();
        run2();
      });
      choice.dataset.needs = needs;
      return choice;
    };
    const move = option("Move", ICONS.move, () => {
      tool = "move";
      syncToolbar();
    }, "selection");
    move.dataset.tool = "move";
    const modes = Object.keys(LASSO_LABELS).map((mode) => {
      const choice = iconButton(LASSO_LABELS[mode], LASSO_ICONS[mode], () => {
        closePopups();
        lassoMode = mode;
        tool = "lasso";
        deselect();
        syncToolbar();
      });
      choice.dataset.lassoMode = mode;
      return choice;
    });
    const gap = document.createElement("span");
    gap.className = "doodle-popup-gap";
    options.append(
      ...modes,
      gap,
      move,
      option("Invert selection", ICONS.invert, invertSelection, "selection"),
      option("Copy selection", ICONS.copy, copySelection, "selection"),
      option("Cut", ICONS.cut, cutSelection, "selection"),
      option("Paste", ICONS.paste, pasteSelection, "clipboard")
    );
    const holder = document.createElement("span");
    holder.className = "doodle-holder";
    holder.append(button, options);
    const open = () => {
      if (!options.hidden) return;
      closePopups();
      options.hidden = false;
    };
    let holding = 0;
    button.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse") return;
      held = false;
      holding = window.setTimeout(() => {
        held = true;
        open();
      }, HOLD_MS);
    });
    for (const type of ["pointerup", "pointerleave", "pointercancel"]) {
      button.addEventListener(type, () => clearTimeout(holding));
    }
    button.addEventListener("contextmenu", (event) => event.preventDefault());
    const hovers = matchMedia("(hover: hover)");
    let closing = 0;
    holder.addEventListener("mouseenter", () => {
      if (!hovers.matches) return;
      clearTimeout(closing);
      open();
    });
    holder.addEventListener("mouseleave", () => {
      if (!hovers.matches) return;
      closing = window.setTimeout(() => {
        options.hidden = true;
      }, 300);
    });
    return holder;
  }
  function svgIcon(path) {
    const inner = path.startsWith("<") ? path : `<path d="${path}"/>`;
    return `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">${inner}</svg>`;
  }
  function iconButton(label, path, onClick, className = "torn-btn doodle-btn doodle-icon-btn") {
    const button = toolButton("", onClick, className);
    button.setAttribute("aria-label", label);
    button.title = label;
    button.innerHTML = svgIcon(path);
    return button;
  }
  function askQuestion(words, yes, onYes) {
    document.getElementById(CONFIRM_ID)?.remove();
    const panel = document.createElement("div");
    panel.id = CONFIRM_ID;
    const question = document.createElement("p");
    question.textContent = words;
    const confirm = toolButton(yes, () => {
      panel.remove();
      onYes();
    });
    confirm.dataset.enter = "";
    const buttons = document.createElement("div");
    buttons.className = "doodle-row";
    buttons.append(confirm, toolButton("Cancel", () => panel.remove()));
    panel.append(question, buttons);
    document.body.appendChild(panel);
    placeConfirm(panel);
  }
  function confirmBin(id = active) {
    if (!id) return;
    askQuestion("Are you sure you want to bin this Masterpiece?", "Confirm", () => removeDrawing(id));
  }
  function placeConfirm(panel) {
    const notes = full ? null : document.querySelector(SELECTORS.panel);
    const area = notes?.getBoundingClientRect() ?? new DOMRect(0, 0, innerWidth, innerHeight);
    const left = Math.min(
      Math.max(4, area.left + area.width / 2 - panel.offsetWidth / 2),
      innerWidth - panel.offsetWidth - 4
    );
    const top = Math.min(
      Math.max(4, area.top + area.height / 2 - panel.offsetHeight / 2),
      innerHeight - panel.offsetHeight - 4
    );
    panel.style.setProperty("left", `${left}px`, "important");
    panel.style.setProperty("top", `${top}px`, "important");
  }
  function placeFloating(menu, anchor) {
    menu.hidden = false;
    const place = anchor.getBoundingClientRect();
    const left = Math.max(4, Math.min(place.left, innerWidth - menu.offsetWidth - 4));
    let top = place.bottom + 4;
    if (top + menu.offsetHeight > innerHeight - 4) top = Math.max(4, place.top - menu.offsetHeight - 4);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }
  function closeFloating(except = null) {
    for (const menu of document.querySelectorAll(`#${TOOLBAR_ID} .doodle-float`)) {
      if (menu !== except) menu.hidden = true;
    }
  }
  function withFloating(button, menu, onOpen = () => {
  }) {
    const holder = document.createElement("span");
    holder.className = "doodle-holder";
    menu.classList.add("doodle-float");
    menu.hidden = true;
    button.dataset.floatAnchor = "";
    button.addEventListener("click", () => {
      const opening = menu.hidden;
      closeFloating(menu);
      if (!opening) {
        menu.hidden = true;
        return;
      }
      onOpen();
      placeFloating(menu, button);
    });
    holder.append(button, menu);
    return holder;
  }
  function colourChooser(options) {
    const element = document.createElement("div");
    element.className = "doodle-chooser";
    let view = "grid";
    const top = document.createElement("div");
    top.className = "doodle-chooser-top";
    const recent = document.createElement("div");
    recent.className = "doodle-recent";
    const drawRecent = () => {
      recent.replaceChildren(
        ...recentColours().map((hex) => {
          const cell = toolButton("", () => options.pick(hex, true), "doodle-swatch");
          cell.style.background = hex;
          cell.setAttribute("aria-label", hex);
          cell.title = hex;
          return cell;
        })
      );
    };
    drawRecent();
    watchRecent(drawRecent);
    if (options.none) {
      const none = toolButton("", () => options.pick(null, true), "doodle-swatch doodle-none");
      none.setAttribute("aria-label", "No colour");
      none.title = "No colour";
      top.appendChild(none);
    }
    const spacer = document.createElement("span");
    spacer.className = "doodle-chooser-gap";
    top.append(recent, spacer);
    const grid = document.createElement("div");
    grid.className = "doodle-swatches";
    for (const value of SWATCHES) {
      const cell = toolButton("", () => options.pick(value, true), "doodle-swatch");
      cell.style.background = value;
      cell.setAttribute("aria-label", value);
      grid.appendChild(cell);
    }
    let started = false;
    const picker = colourPicker(
      (hex) => options.pick(hex, false),
      (hex) => {
        keepRecent(hex, started);
        options.settle?.();
        started = true;
      }
    );
    picker.element.hidden = true;
    const views = { grid, custom: picker.element };
    const buttons = {};
    const show = (next) => {
      view = view === next ? "grid" : next;
      for (const [name, part] of Object.entries(views)) part.hidden = name !== view;
      for (const [name, button] of Object.entries(buttons)) button.classList.toggle(ON_CLASS, name === view);
      if (view === "custom") {
        started = false;
        picker.set(options.current() ?? "#ffffff");
      }
      if (view === "gradient") {
        editor?.refresh();
        useGradient = true;
        if (tool === "eraser") tool = "pen";
        syncToolbar();
      }
    };
    const swatches = toolButton("", () => show("grid"), "doodle-chooser-btn doodle-swatches-btn doodle-on");
    swatches.setAttribute("aria-label", "Swatches");
    swatches.title = "Swatches";
    buttons.grid = swatches;
    top.appendChild(swatches);
    const custom = toolButton("", () => show("custom"), "doodle-chooser-btn doodle-custom-btn");
    custom.setAttribute("aria-label", "Custom colour");
    custom.title = "Custom colour";
    buttons.custom = custom;
    top.appendChild(custom);
    let editor = null;
    if (options.gradient) {
      editor = gradientEditor(
        gradient,
        () => {
          const canvas = activeCanvas();
          return canvas ? canvas.width / canvas.height : 1.5;
        },
        () => {
          useGradient = true;
          syncToolbar();
        },
        () => {
          drawingPath = true;
          closePopups();
          syncToolbar();
        },
        () => {
          const canvas = activeCanvas();
          if (!selection || !canvas) return null;
          return selection.path.map((p) => ({ x: p.x / canvas.width, y: p.y / canvas.height }));
        }
      );
      refreshGradient = editor.refresh;
      editor.element.hidden = true;
      views.gradient = editor.element;
      const sweep = toolButton("", () => show("gradient"), "doodle-chooser-btn doodle-gradient-btn");
      sweep.setAttribute("aria-label", "Gradient");
      sweep.title = "Gradient";
      buttons.gradient = sweep;
      top.appendChild(sweep);
    }
    element.append(top, grid, picker.element, ...editor ? [editor.element] : []);
    return element;
  }
  var picked = /* @__PURE__ */ new Set();
  var thumbs = /* @__PURE__ */ new Map();
  var layersBox = null;
  var backgroundThumb = null;
  var backgroundButton = null;
  var THUMB_WIDE = 40;
  function drawThumb(thumb, layer2) {
    const canvas = activeCanvas();
    const doc = activeDoc();
    if (!canvas || !doc) return;
    const width = THUMB_WIDE * 2;
    const height = Math.round(width * canvas.height / canvas.width);
    if (thumb.width !== width) thumb.width = width;
    if (thumb.height !== height) thumb.height = height;
    thumb.style.width = `${THUMB_WIDE}px`;
    thumb.style.height = `${height / 2}px`;
    const context = thumb.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, width, height);
    if (layer2) context.drawImage(layer2.canvas, 0, 0, width, height);
    else if (doc.background) {
      context.fillStyle = doc.background;
      context.fillRect(0, 0, width, height);
    }
  }
  function refreshThumbs(layers) {
    for (const layer2 of layers) {
      const thumb = thumbs.get(layer2);
      if (thumb) drawThumb(thumb, layer2);
    }
  }
  function setCurrent(layer2) {
    const doc = activeDoc();
    if (!doc || !active || doc.current === layer2) return;
    if (editing && editing.layer !== layer2) finishEditing();
    putDownFloat();
    doc.current = layer2;
    picked.clear();
    save(active);
    refreshLayers();
    syncToolbar();
  }
  function togglePick(layer2) {
    const doc = activeDoc();
    if (!doc) return;
    if (picked.size === 0 && layer2 !== doc.current) picked.add(doc.current);
    if (picked.has(layer2)) picked.delete(layer2);
    else picked.add(layer2);
    refreshLayers();
  }
  function addLayer(doc, name = `Layer ${doc.next}`) {
    const canvas = activeCanvas();
    const layer2 = newLayer(name, canvas?.width ?? 1, canvas?.height ?? 1);
    if (name === `Layer ${doc.next}`) doc.next += 1;
    doc.layers.splice(doc.layers.indexOf(doc.current) + 1, 0, layer2);
    doc.current = layer2;
    picked.clear();
    return layer2;
  }
  function roomForLayer(doc) {
    if (doc.layers.length < MAX_LAYERS) return true;
    setStatus(`A drawing can have ${MAX_LAYERS} layers at most`);
    return false;
  }
  function newLayerAbove() {
    const doc = activeDoc();
    if (!doc || !active || !roomForLayer(doc)) return;
    putDownFloat();
    remember([]);
    const layer2 = addLayer(doc);
    render();
    save(active, layer2);
    refreshLayers();
  }
  function duplicateLayer() {
    const doc = activeDoc();
    if (!doc || !active || !roomForLayer(doc)) return;
    putDownFloat();
    const from = doc.current;
    remember([]);
    const layer2 = addLayer(doc, `${from.name} copy`);
    Object.assign(layer2, { ...propsOf(from), name: layer2.name });
    layer2.canvas.getContext("2d")?.drawImage(from.canvas, 0, 0);
    render();
    save(active, layer2);
    refreshLayers();
  }
  function deleteLayer() {
    finishEditing();
    const doc = activeDoc();
    if (!doc || !active || doc.layers.length <= 1) return;
    putDownFloat();
    remember([]);
    const index = doc.layers.indexOf(doc.current);
    doc.layers.splice(index, 1);
    doc.current = doc.layers[Math.max(0, index - 1)] ?? doc.layers[0];
    picked.clear();
    render();
    save(active);
    refreshLayers();
  }
  function mergeLayers() {
    finishEditing();
    const doc = activeDoc();
    if (!doc || !active) return;
    const merging = doc.layers.filter((layer2) => picked.has(layer2));
    const top = merging[merging.length - 1];
    if (!top || merging.length < 2) return;
    dropSelection();
    remember([top]);
    const flat = copyOf(top.canvas, false);
    stack(flat, merging);
    const context = top.canvas.getContext("2d");
    context?.clearRect(0, 0, top.canvas.width, top.canvas.height);
    context?.drawImage(flat, 0, 0);
    Object.assign(top, { visible: true, opacity: 1, blend: "normal", clip: false, text: null });
    doc.layers = doc.layers.filter((layer2) => layer2 === top || !picked.has(layer2));
    doc.current = top;
    picked.clear();
    render();
    save(active, top);
    refreshLayers();
  }
  function changeLayer(layer2, change) {
    if (!active) return;
    remember([]);
    Object.assign(layer2, change);
    render();
    save(active);
    refreshLayers();
  }
  function importImage(file) {
    const doc = activeDoc();
    const canvas = activeCanvas();
    const id = active;
    if (!doc || !canvas || !id || !roomForLayer(doc)) return;
    void loadImage(file).then((image) => {
      if (!image || active !== id) return;
      dropSelection();
      remember([]);
      const layer2 = addLayer(doc);
      const scale = Math.min(1, canvas.width * IMPORT_FIT / image.width, canvas.height * IMPORT_FIT / image.height);
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const x = Math.round((canvas.width - width) / 2);
      const y = Math.round((canvas.height - height) / 2);
      const piece = document.createElement("canvas");
      piece.width = width;
      piece.height = height;
      piece.getContext("2d")?.drawImage(image, 0, 0, width, height);
      const path = [
        { x, y },
        { x: x + width, y },
        { x: x + width, y: y + height },
        { x, y: y + height }
      ];
      selection = { path, float: newFloat({ canvas: piece, x, y }, path, copyOf(layer2.canvas, true)) };
      antsVersion += 1;
      showFloat(layer2.canvas);
      render();
      save(id, layer2);
      tool = "move";
      syncToolbar();
      refreshLayers();
    });
  }
  var IMPORT_FIT = 0.8;
  function layersPanel() {
    const box = document.createElement("div");
    box.className = "doodle-layers";
    layersBox = box;
    box.addEventListener("pointerdown", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(".doodle-float, [data-float-anchor]")) closeFloating();
    });
    return box;
  }
  function refreshLayers() {
    const box = layersBox;
    if (!box || box.closest(".doodle-popup")?.hidden !== false) return;
    const doc = activeDoc();
    thumbs.clear();
    if (!doc) {
      box.replaceChildren();
      return;
    }
    const list = document.createElement("div");
    list.className = "doodle-layer-list";
    const bottom = backgroundRow(doc);
    for (const layer2 of doc.layers.slice().reverse()) list.appendChild(layerRow(doc, layer2, list));
    list.appendChild(bottom);
    box.replaceChildren(list, layerActions(doc));
  }
  function miniButton(label, icon, onClick, on = false) {
    const button = iconButton(label, icon, onClick, "doodle-mini");
    button.classList.toggle(ON_CLASS, on);
    return button;
  }
  function layerRow(doc, layer2, list) {
    const row = document.createElement("div");
    row.className = "doodle-layer-row";
    row.classList.toggle("doodle-current", layer2 === doc.current);
    row.classList.toggle("doodle-picked", picked.has(layer2));
    row.classList.toggle("doodle-clipped", layer2.clip && doc.layers.indexOf(layer2) > 0);
    const eye = miniButton(
      layer2.visible ? "Hide layer" : "Show layer",
      layer2.visible ? ICONS.eye : ICONS.eyeOff,
      () => changeLayer(layer2, { visible: !layer2.visible })
    );
    const thumb = document.createElement("canvas");
    thumb.className = "doodle-thumb";
    drawThumb(thumb, layer2);
    thumbs.set(layer2, thumb);
    const name = document.createElement("input");
    name.type = "text";
    name.className = "doodle-layer-name";
    name.value = layer2.name;
    name.maxLength = 40;
    name.setAttribute("aria-label", "Layer name");
    name.addEventListener("input", () => {
      layer2.name = name.value;
    });
    name.addEventListener("change", () => {
      if (!name.value.trim()) name.value = layer2.name = `Layer ${doc.layers.indexOf(layer2) + 1}`;
      if (active) save(active);
    });
    name.addEventListener("keydown", (event) => {
      if (event.key === "Enter") name.blur();
    });
    const strength = document.createElement("input");
    strength.type = "range";
    strength.className = "doodle-range doodle-layer-opacity";
    strength.min = "0";
    strength.max = "100";
    strength.value = String(Math.round(layer2.opacity * 100));
    strength.title = "Layer opacity";
    strength.style.setProperty("--doodle-fill", `rgba(0, 117, 255, ${layer2.opacity})`);
    let sliding = false;
    strength.addEventListener("input", () => {
      if (!sliding) remember([]);
      sliding = true;
      layer2.opacity = Number(strength.value) / 100;
      strength.style.setProperty("--doodle-fill", `rgba(0, 117, 255, ${layer2.opacity})`);
      render();
    });
    strength.addEventListener("change", () => {
      sliding = false;
      if (active) save(active);
    });
    const clip = miniButton("Clip to the layer below", ICONS.clip, () => changeLayer(layer2, { clip: !layer2.clip }), layer2.clip);
    clip.disabled = doc.layers.indexOf(layer2) === 0;
    const lock = miniButton(layer2.locked ? "Unlock layer" : "Lock layer", layer2.locked ? ICONS.lock : ICONS.unlock, () => changeLayer(layer2, { locked: !layer2.locked }), layer2.locked);
    const blendButton = toolButton("", () => {
    }, "doodle-mini doodle-blend-btn");
    const blendName = BLENDS.find((one) => one.key === layer2.blend)?.label ?? "Normal";
    blendButton.innerHTML = blendIcon(layer2.blend, 18);
    blendButton.title = `Blend: ${blendName}`;
    blendButton.setAttribute("aria-label", `Blend mode, ${blendName}`);
    const menu = document.createElement("div");
    menu.className = "doodle-blend-menu";
    for (const blend of BLENDS) {
      const option = toolButton("", () => {
        menu.hidden = true;
        if (blend.key !== layer2.blend) changeLayer(layer2, { blend: blend.key });
      }, "doodle-blend-option");
      option.innerHTML = `${blendIcon(blend.key, 20)}<span>${blend.label}</span>`;
      option.classList.toggle(ON_CLASS, blend.key === layer2.blend);
      menu.appendChild(option);
    }
    const main = document.createElement("div");
    main.className = "doodle-layer-main";
    const under = document.createElement("div");
    under.className = "doodle-layer-under";
    under.append(strength, clip, lock);
    main.append(name, under);
    row.append(eye, thumb, main, withFloating(blendButton, menu));
    holdRow(row, layer2, doc, list);
    return row;
  }
  function holdRow(row, layer2, doc, list) {
    row.addEventListener("pointerdown", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (event.button !== 0 || target?.closest("button, input, .doodle-float")) return;
      const canDrag = event.pointerType === "mouse" || !!target?.closest(".doodle-thumb");
      const startY = event.clientY;
      const adding = event.ctrlKey || event.metaKey;
      let dragging = false;
      let held = false;
      const holding = event.pointerType === "mouse" ? 0 : window.setTimeout(() => {
        held = true;
        togglePick(layer2);
      }, HOLD_MS);
      if (canDrag) row.setPointerCapture(event.pointerId);
      const rows = () => [...list.querySelectorAll(".doodle-layer-row:not(.doodle-layer-bg)")];
      const order = rows();
      const moved = (move) => {
        if (!canDrag) return;
        if (!dragging && Math.abs(move.clientY - startY) > DRAG_START_PX) {
          dragging = true;
          clearTimeout(holding);
          row.classList.add("doodle-layer-dragging");
        }
        if (!dragging) return;
        const others = rows().filter((other) => other !== row);
        let index = others.findIndex((other) => {
          const place = other.getBoundingClientRect();
          return move.clientY < place.top + place.height / 2;
        });
        if (index < 0) index = others.length;
        const follows = (a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
        for (const other of others.slice(0, index)) if (follows(row, other)) list.insertBefore(other, row);
        for (const other of others.slice(index).reverse()) if (follows(other, row)) list.insertBefore(other, row.nextSibling);
      };
      const ended = (end) => {
        clearTimeout(holding);
        row.removeEventListener("pointermove", moved);
        row.removeEventListener("pointerup", ended);
        row.removeEventListener("pointercancel", ended);
        if (end.type === "pointercancel" || held) return;
        if (dragging) {
          row.classList.remove("doodle-layer-dragging");
          const now = rows();
          if (now.some((one, index) => one !== order[index]) && active) {
            remember([]);
            doc.layers = now.reverse().map((one) => doc.layers[order.length - 1 - order.indexOf(one)]);
            render();
            save(active);
          }
          refreshLayers();
          return;
        }
        if (adding) togglePick(layer2);
        else setCurrent(layer2);
      };
      row.addEventListener("pointermove", moved);
      row.addEventListener("pointerup", ended);
      row.addEventListener("pointercancel", ended);
    });
    row.addEventListener("contextmenu", (event) => event.preventDefault());
  }
  function backgroundRow(doc) {
    const row = document.createElement("div");
    row.className = "doodle-layer-row doodle-layer-bg";
    const lockMark = miniButton("Always locked", ICONS.lock, () => {
    }, true);
    lockMark.disabled = true;
    const thumb = document.createElement("canvas");
    thumb.className = "doodle-thumb";
    backgroundThumb = thumb;
    drawThumb(thumb, null);
    const name = document.createElement("span");
    name.className = "doodle-layer-label";
    name.textContent = "Layer 0";
    const main = document.createElement("div");
    main.className = "doodle-layer-main";
    main.appendChild(name);
    const swatch = toolButton("", () => {
    }, "doodle-mini doodle-bg-btn");
    swatch.setAttribute("aria-label", "Background colour");
    swatch.title = "Background colour";
    backgroundButton = swatch;
    showBackground(doc);
    let changing = false;
    const chooser = colourChooser({
      none: true,
      current: () => doc.background,
      pick: (hex, done) => {
        if (!active) return;
        if (!changing) remember([]);
        changing = true;
        doc.background = hex;
        render();
        showBackground(doc);
        save(active);
        if (done) {
          changing = false;
          closeFloating();
        }
      }
    });
    row.append(lockMark, thumb, main, withFloating(swatch, chooser, () => {
      changing = false;
    }));
    return row;
  }
  function showBackground(doc) {
    if (backgroundButton) {
      backgroundButton.classList.toggle("doodle-none", doc.background === null);
      backgroundButton.style.background = doc.background ?? "";
    }
    if (backgroundThumb) drawThumb(backgroundThumb, null);
  }
  function layerActions(doc) {
    const row = document.createElement("div");
    row.className = "doodle-row doodle-layer-actions";
    const full2 = doc.layers.length >= MAX_LAYERS;
    const add = iconButton("New layer", ICONS.add, newLayerAbove);
    add.disabled = full2;
    const copy = iconButton("Duplicate layer", ICONS.copy, duplicateLayer);
    copy.disabled = full2;
    const remove = iconButton("Delete layer", ICONS.bin, deleteLayer);
    remove.disabled = doc.layers.length <= 1;
    const merge = iconButton(
      picked.size < 2 ? "Merge layers (Ctrl+click, or hold, to pick them)" : `Merge ${picked.size} layers`,
      ICONS.merge,
      mergeLayers
    );
    merge.disabled = picked.size < 2;
    const file = document.createElement("input");
    file.type = "file";
    file.accept = "image/*";
    file.hidden = true;
    file.addEventListener("change", () => {
      const chosen = file.files?.[0];
      if (chosen) importImage(chosen);
      file.value = "";
    });
    const bring = iconButton("Import picture", ICONS.image, () => file.click());
    bring.disabled = full2;
    row.append(add, copy, remove, merge, bring, file);
    return row;
  }
  function lookSlider(attribute, min, max, apply) {
    const range = document.createElement("input");
    range.type = "range";
    range.className = "doodle-range";
    range.min = String(min);
    range.max = String(max);
    range.setAttribute(attribute, "");
    range.addEventListener("input", () => changeLook(apply(Number(range.value)), true));
    range.addEventListener("change", endLookSlide);
    return range;
  }
  function textOptions() {
    const colourButton = toolButton("", () => {
    }, "doodle-colour doodle-text-colour");
    colourButton.setAttribute("aria-label", "Text colour");
    colourButton.title = "Text colour";
    const colours = colourChooser({
      current: () => shownLook().colour,
      pick: (hex, done) => {
        if (!hex) return;
        changeLook({ colour: hex }, !done);
        if (done) closePopups();
      },
      settle: endLookSlide
    });
    const backToText = () => editing?.input.focus({ preventScroll: true });
    const fonts = document.createElement("select");
    fonts.className = "doodle-font-select";
    fonts.setAttribute("aria-label", "Font");
    fonts.title = "Font";
    for (const font of FONTS) {
      const option = document.createElement("option");
      option.value = font;
      option.textContent = font;
      option.style.fontFamily = font;
      fonts.appendChild(option);
    }
    fonts.addEventListener("change", () => {
      changeLook({ font: fonts.value });
      backToText();
    });
    const sizeInput = document.createElement("input");
    sizeInput.type = "number";
    sizeInput.className = "doodle-text-size";
    sizeInput.min = String(TEXT_SIZE_MIN);
    sizeInput.max = String(TEXT_SIZE_MAX);
    sizeInput.step = "1";
    sizeInput.setAttribute("aria-label", "Text size");
    sizeInput.title = "Text size";
    sizeInput.addEventListener("input", () => {
      const value = Number(sizeInput.value);
      if (sizeInput.value !== "" && value >= TEXT_SIZE_MIN && value <= TEXT_SIZE_MAX) changeLook({ size: value }, true);
    });
    sizeInput.addEventListener("change", endLookSlide);
    sizeInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      endLookSlide();
      backToText();
    });
    const style = (key, label, letter) => {
      const button = toolButton(letter, () => toggleStyle(key), "torn-btn doodle-btn doodle-icon-btn doodle-style-btn");
      button.setAttribute("aria-label", label);
      button.title = label;
      button.dataset.style = key;
      return button;
    };
    const outlineButton = toolButton("", () => {
    }, "doodle-colour doodle-outline-btn");
    outlineButton.appendChild(document.createElement("span"));
    outlineButton.setAttribute("aria-label", "Outline");
    outlineButton.title = "Outline";
    const outlineBox = document.createElement("div");
    outlineBox.className = "doodle-outline-box";
    const toggle = toolButton("Outline", () => changeLook({ outline: !shownLook().outline }));
    toggle.dataset.outlineToggle = "";
    const outlineColour = colourChooser({
      current: () => shownLook().outlineColour,
      // Picking a colour for the outline turns it on.
      pick: (hex, done) => {
        if (hex) changeLook({ outlineColour: hex, outline: true }, !done);
      },
      settle: endLookSlide
    });
    const labelled = (words, range) => {
      const label = document.createElement("label");
      label.className = "doodle-slider-label";
      label.append(words, range);
      return label;
    };
    outlineBox.append(
      toggle,
      outlineColour,
      labelled("Size", lookSlider("data-outline-size", 1, 30, (outlineSize) => ({ outlineSize, outline: true }))),
      labelled("Softness", lookSlider("data-outline-soft", 0, 100, (soft) => ({ outlineSoft: soft / 100, outline: true })))
    );
    const items = [
      fonts,
      sizeInput,
      style("bold", "Bold", "B"),
      style("italic", "Italic", "I"),
      style("underline", "Underline", "U"),
      withPopup("text-colour", colourButton, colours),
      withPopup("outline", outlineButton, outlineBox)
    ];
    for (const item of items) item.dataset.for = "text";
    return items;
  }
  var TEXT_SIZE_MIN = 4;
  var TEXT_SIZE_MAX = 500;
  function toggleStyle(key) {
    changeLook({ [key]: !shownLook()[key] });
  }
  var TOP_BAR_GAP = 6;
  function topBarElement() {
    return document.querySelector(`#${TOOLBAR_ID} .doodle-top-bar`);
  }
  function placeTopBar() {
    const bar = topBarElement();
    const canvas = activeCanvas();
    if (!bar || bar.hidden || !canvas) return;
    const place = canvas.getBoundingClientRect();
    const limit = full ? 0 : document.getElementById(LAYER_ID)?.getBoundingClientRect().top ?? 0;
    const above = place.top - bar.offsetHeight - TOP_BAR_GAP;
    const top = above >= limit ? above : Math.max(place.top, limit) + TOP_BAR_GAP;
    const left = Math.max(4, Math.min(place.left, innerWidth - bar.offsetWidth - 4));
    setStyle(bar, "left", `${left}px`);
    setStyle(bar, "top", `${top}px`);
  }
  function syncTextOptions(bar) {
    const look = shownLook();
    const swatch = bar.querySelector(".doodle-text-colour");
    if (swatch) swatch.style.background = look.colour;
    const font = bar.querySelector(".doodle-font-select");
    if (font && font.value !== look.font) font.value = look.font;
    if (font) font.style.fontFamily = look.font;
    const sizeInput = bar.querySelector(".doodle-text-size");
    if (sizeInput && document.activeElement !== sizeInput) sizeInput.value = String(Math.round(look.size));
    for (const button of bar.querySelectorAll("[data-style]")) {
      button.classList.toggle(ON_CLASS, look[button.dataset.style]);
    }
    const outline = bar.querySelector(".doodle-outline-btn");
    outline?.classList.toggle(ON_CLASS, look.outline);
    const ring = outline?.firstElementChild;
    if (ring) ring.style.borderColor = look.outlineColour;
    bar.querySelector("[data-outline-toggle]")?.classList.toggle(ON_CLASS, look.outline);
    const ranges = [
      ["data-outline-size", look.outlineSize],
      ["data-outline-soft", look.outlineSoft * 100]
    ];
    for (const [attribute, value] of ranges) {
      const range = bar.querySelector(`[${attribute}]`);
      if (range && document.activeElement !== range) range.value = String(Math.round(value));
    }
  }
  function toolbar() {
    let bar = document.getElementById(TOOLBAR_ID);
    if (bar) return bar;
    bar = document.createElement("div");
    bar.id = TOOLBAR_ID;
    bar.addEventListener("mousedown", (event) => {
      if (!(event.target instanceof Element && event.target.closest("input, select"))) event.preventDefault();
    });
    const colourButton = toolButton("", () => {
    }, "doodle-colour");
    colourButton.setAttribute("aria-label", "Colour");
    const grid = colourChooser({
      gradient: true,
      current: () => colour,
      pick: (hex, done) => {
        if (!hex) return;
        colour = hex;
        useGradient = false;
        if (tool === "eraser") tool = "pen";
        if (done) closePopups();
        syncToolbar();
      }
    });
    const sizeButton = toolButton("", () => {
    }, "doodle-size");
    sizeButton.setAttribute("aria-label", "Brush size");
    sizeButton.appendChild(document.createElement("span"));
    const range = document.createElement("input");
    const slider = sliderBox(range);
    range.min = String(SIZE_MIN);
    range.max = String(SIZE_MAX);
    range.value = String(size);
    range.dataset.brushSize = "";
    range.addEventListener("input", () => {
      size = Number(range.value);
      syncToolbar();
    });
    const brush = document.createElement("span");
    brush.className = "doodle-brush";
    slider.appendChild(brush);
    const opacityButton = iconButton("Opacity", ICONS.opacity, () => {
    });
    const fade = document.createElement("input");
    const fader = sliderBox(fade);
    fade.classList.add("doodle-opacity-range");
    fade.min = String(OPACITY_MIN);
    fade.max = "100";
    fade.value = String(Math.round(opacity * 100));
    fade.addEventListener("input", () => {
      opacity = Number(fade.value) / 100;
      syncToolbar();
    });
    const shapeButton = toolButton("", () => {
    }, "doodle-shape");
    shapeButton.setAttribute("aria-label", "Shape");
    const shapes = document.createElement("div");
    for (const key of Object.keys(SHAPES)) {
      const option2 = toolButton("", () => {
        closePopups();
        setShape(key);
      }, "doodle-shape-option");
      option2.dataset.shape = key;
      option2.setAttribute("aria-label", SHAPES[key].label);
      option2.title = SHAPES[key].label;
      option2.appendChild(shapeIcon(key));
      shapes.appendChild(option2);
    }
    const toolFor = (label, icon, value) => {
      const button = iconButton(label, icon, () => {
        tool = value;
        syncToolbar();
      });
      button.dataset.tool = value;
      return button;
    };
    const hardButton = iconButton("Hardness", ICONS.feather, () => {
    });
    const hard = document.createElement("input");
    const hardBox = sliderBox(hard);
    hardBox.classList.add("doodle-vertical");
    hardBox.style.padding = "0";
    hardBox.style.height = `${SLIDER_WIDTH + SLIDER_PAD * 2}px`;
    hard.min = "0";
    hard.max = "100";
    hard.value = String(Math.round(hardness * 100));
    hard.addEventListener("input", () => {
      hardness = Number(hard.value) / 100;
      syncToolbar();
    });
    const hardDot = document.createElement("span");
    hardDot.className = "doodle-hard-dot";
    hardBox.appendChild(hardDot);
    const smoothButton = iconButton("Smoothing", SMOOTH_ICONS[smoothing] ?? "", () => {
    });
    smoothButton.classList.add("doodle-smooth");
    const levels = document.createElement("div");
    for (const level of [2, 1, 0]) {
      const option2 = iconButton(SMOOTH_LABELS[level] ?? "", SMOOTH_ICONS[level] ?? "", () => {
        smoothing = level;
        closePopups();
        syncToolbar();
      });
      option2.dataset.smooth = String(level);
      levels.appendChild(option2);
    }
    const tipButton = iconButton("Brush tip", TIP_ICONS.round, () => {
    });
    tipButton.classList.add("doodle-tip");
    const tips = document.createElement("div");
    for (const value of Object.keys(TIP_ICONS)) {
      const option2 = iconButton(TIP_LABELS[value], TIP_ICONS[value], () => {
        tip = value;
        closePopups();
        syncToolbar();
      });
      option2.dataset.tip = value;
      tips.appendChild(option2);
    }
    const option = (holder, tools2) => {
      holder.dataset.for = tools2;
      return holder;
    };
    const colourHolder = option(withPopup("colour", colourButton, grid), "pen bucket");
    const options = [
      option(withPopup("opacity", opacityButton, fader), "pen eraser bucket"),
      option(withPopup("size", sizeButton, slider), "pen eraser"),
      option(withPopup("hardness", hardButton, hardBox), "pen eraser"),
      option(withPopup("smooth", smoothButton, levels), "pen eraser"),
      option(withPopup("tip", tipButton, tips), "pen eraser")
    ];
    const undo = iconButton("Undo", ICONS.undo, () => step(true));
    const redo = iconButton("Redo", ICONS.redo, () => step(false));
    const readsBox = document.createElement("div");
    for (const all of [false, true]) {
      const option2 = toolButton(all ? "Read all layers" : "Read current layer", () => {
        bucketReadsAll = all;
        closePopups();
        syncToolbar();
      });
      option2.dataset.readsAll = String(all);
      readsBox.appendChild(option2);
    }
    const layersButton = iconButton("Layers", ICONS.layers, () => {
    });
    const layers = withPopup("layers", layersButton, layersPanel());
    layersButton.addEventListener("click", refreshLayers);
    const tools = [
      toolFor("Pen", ICONS.pen, "pen"),
      toolFor("Eraser", ICONS.eraser, "eraser"),
      withPopup("bucket", toolFor("Paint bucket", ICONS.bucket, "bucket"), readsBox),
      lassoTool(),
      toolFor("Text", ICONS.text, "text"),
      layers
    ];
    const actions = [
      iconButton("New drawing", ICONS.newPage, newDrawing),
      iconButton("Copy", ICONS.copy, copyPicture),
      iconButton("Save", ICONS.download, askName),
      iconButton("Bin", ICONS.bin, () => confirmBin()),
      iconButton("Clear", ICONS.sweep, clearPicture),
      iconButton("Rotate", ICONS.rotate, rotatePicture),
      withPopup("shape", shapeButton, shapes)
    ];
    const rows = [0, 1, 2].map(() => {
      const row = document.createElement("div");
      row.className = "doodle-row";
      return row;
    });
    toolbarLayouts = {
      rows,
      // Over the note, and in full screen on a phone: colour after the shape
      // button, ending the shorter row so both rows stay even. Shown only for a
      // tool that uses it, and last, so nothing shifts when it comes and goes.
      notes: [[undo, redo, ...tools], [...actions, colourHolder], []],
      // Full screen on a computer: colour always shown, at the top.
      full: [[colourHolder, ...tools], [undo, redo, ...actions], []]
    };
    const top = document.createElement("div");
    top.className = "doodle-top-bar";
    top.hidden = true;
    const prompt = document.createElement("span");
    prompt.className = "doodle-path-prompt";
    prompt.hidden = true;
    const words = document.createElement("span");
    words.textContent = "Draw the gradient's path on the drawing";
    prompt.append(words, toolButton("Cancel", cancelPath));
    top.append(...options, ...textOptions(), prompt);
    bar.append(...rows, top);
    document.body.appendChild(bar);
    syncToolbar();
    return bar;
  }
  function enterFull() {
    const canvas = activeCanvas();
    if (!canvas || full) return;
    full = true;
    closePopups();
    const cover = document.createElement("div");
    cover.id = FULL_ID;
    const stage = document.createElement("div");
    stage.className = "doodle-stage";
    const back = iconButton("Exit full screen", ICONS.expand, leaveFull, "doodle-full-exit");
    stage.append(canvas, back);
    const bar = toolbar();
    bar.hidden = false;
    cover.append(bar, stage);
    document.body.appendChild(cover);
    syncToolbar();
    fitFull();
  }
  function leaveFull() {
    exitFull();
    if (compact()) deactivate();
  }
  function exitFull() {
    if (!full) return;
    full = false;
    const frame = active ? frames.get(active) : null;
    if (frame) {
      frame.canvas.style.removeProperty("width");
      frame.canvas.style.removeProperty("height");
      frame.element.prepend(frame.canvas);
    }
    const bar = document.getElementById(TOOLBAR_ID);
    if (bar) document.body.appendChild(bar);
    document.getElementById(FULL_ID)?.remove();
    closePopups();
    syncToolbar();
  }
  var FULL_GAP = 12;
  var FULL_MARGIN = 16;
  var EXIT_ROOM = 34;
  function fitFull() {
    const canvas = activeCanvas();
    const bar = document.getElementById(TOOLBAR_ID);
    if (!canvas || !bar) return;
    const below = isMobileView();
    const ratio = canvas.width / canvas.height;
    const exitAbove = ratio > 1;
    const stage = canvas.parentElement;
    stage?.classList.toggle("doodle-exit-above", exitAbove);
    const roomWidth = innerWidth - FULL_MARGIN * 2 - (exitAbove ? 0 : EXIT_ROOM) - (below ? 0 : bar.offsetWidth + FULL_GAP);
    const topBar = topBarElement();
    const barLift = topBar && !topBar.hidden ? topBar.offsetHeight + TOP_BAR_GAP : 0;
    const lift2 = exitAbove ? Math.max(barLift, EXIT_ROOM) : barLift;
    if (stage && stage.style.marginTop !== `${lift2}px`) stage.style.marginTop = `${lift2}px`;
    const roomHeight = innerHeight - FULL_MARGIN * 2 - lift2 - (below ? bar.offsetHeight + FULL_GAP : 0);
    let width = Math.max(50, roomWidth);
    let height = width / ratio;
    if (height > roomHeight) {
      height = Math.max(50, roomHeight);
      width = height * ratio;
    }
    setStyle(canvas, "width", `${Math.floor(width)}px`);
    setStyle(canvas, "height", `${Math.floor(height)}px`);
  }
  function buildIcon() {
    const icon = document.createElement("span");
    icon.id = ICON_ID;
    icon.setAttribute("role", "button");
    icon.setAttribute("aria-label", "Draw");
    icon.tabIndex = 0;
    const minimize = document.querySelector(`${SELECTORS.header} ${SELECTORS.minimize} g[fill]`);
    const paint = minimize?.getAttribute("fill") ?? "currentColor";
    const brush = `<g transform="rotate(30 18.5 11)">
<rect x="17.3" y="0.5" width="2.4" height="10" rx="1.2"/>
<rect x="16.9" y="10.7" width="3.2" height="2.2"/>
<path d="M16.9 13.1h3.2l-.4 3.3c-.2 1.3-.7 2.3-1.2 2.9-.5-.6-1-1.6-1.2-2.9Z"/>
</g>`;
    icon.innerHTML = `<svg viewBox="0 0 24 24" width="${ICON_SIZE}" height="${ICON_SIZE}" aria-hidden="true">
<defs><mask id="doodle-icon-cut">
<rect width="24" height="24" fill="#fff"/>
<g fill="#000" stroke="#000" stroke-width="1.6">${brush}</g>
</mask></defs>
<g fill="${paint}">
<path mask="url(#doodle-icon-cut)" fill-rule="evenodd" d="M1.5 12.5a8.5 8.5 0 1 0 17 0a8.5 8.5 0 1 0-17 0Z
M4.4 11a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0Z
M7.6 7.2a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0Z
M11.8 7.6a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0Z
M9.4 16.4a2 2 0 1 0 4 0a2 2 0 1 0-4 0Z"/>
${brush}
</g>
</svg>`;
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
      icon.addEventListener(type, (event) => event.stopPropagation());
    }
    const toggle = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (toolsOpen) deactivate();
      else if (compact()) newDrawing();
      else toolsOpen = true;
    };
    icon.addEventListener("click", toggle);
    icon.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") toggle(event);
    });
    return icon;
  }
  function placeIcon() {
    const header = document.querySelector(SELECTORS.header);
    if (!header) return;
    const icon = document.getElementById(ICON_ID) ?? buildIcon();
    const minimize = header.querySelector(SELECTORS.minimize);
    if (minimize) {
      if (minimize.previousElementSibling !== icon) minimize.before(icon);
    } else if (icon.parentElement !== header) {
      header.appendChild(icon);
    }
    if (icon.classList.contains(ACTIVE_CLASS) !== toolsOpen) {
      icon.classList.toggle(ACTIVE_CLASS, toolsOpen);
    }
  }
  function layer() {
    let element = document.getElementById(LAYER_ID);
    if (!element) {
      element = document.createElement("div");
      element.id = LAYER_ID;
      document.body.appendChild(element);
    }
    return element;
  }
  function setStyle(element, name, value) {
    if (element.style[name] !== value) element.style[name] = value;
  }
  function setHidden(element, hidden) {
    if (element.hidden !== hidden) element.hidden = hidden;
  }
  function hideAll() {
    const element = document.getElementById(LAYER_ID);
    if (element) setHidden(element, true);
    const bar = document.getElementById(TOOLBAR_ID);
    if (bar && !full) setHidden(bar, true);
  }
  function scrollerOf(body) {
    for (let element = body; element; element = element.parentElement) {
      const { overflowY } = getComputedStyle(element);
      if (/auto|scroll/.test(overflowY) && element.scrollHeight > element.clientHeight + 1) return element;
      if (element.matches(SELECTORS.panel)) break;
    }
    return body;
  }
  function visibleBox(body) {
    const box = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    for (let element = body.parentElement; element && element !== document.body; element = element.parentElement) {
      const style = getComputedStyle(element);
      if (style.overflowX !== "visible" || style.overflowY !== "visible") {
        const outer = element.getBoundingClientRect();
        box.left = Math.max(box.left, outer.left + element.clientLeft);
        box.top = Math.max(box.top, outer.top + element.clientTop);
        box.right = Math.min(box.right, outer.left + element.clientLeft + element.clientWidth);
        box.bottom = Math.min(box.bottom, outer.top + element.clientTop + element.clientHeight);
      }
      if (element.matches(SELECTORS.panel)) break;
    }
    return box;
  }
  function openList() {
    const list = document.querySelector(SELECTORS.noteList);
    if (!list) return null;
    const rect = list.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const style = getComputedStyle(list);
    if (style.visibility === "hidden" || style.opacity === "0") return null;
    const x = rect.left + rect.width / 2;
    const y = rect.top + Math.min(rect.height / 2, 20);
    for (const element of document.elementsFromPoint(x, y)) {
      if (element.closest(`#${LAYER_ID}, #${TOOLBAR_ID}`)) continue;
      return list.contains(element) ? rect : null;
    }
    return null;
  }
  function cutOutList(container, box) {
    const list = openList();
    let clip = "";
    if (list) {
      const width = box.right - box.left;
      const height = box.bottom - box.top;
      const x = list.left - box.left;
      const y = list.top - box.top;
      clip = `path(evenodd, "M0 0H${width}V${height}H0Z M${x} ${y}H${x + list.width}V${y + list.height}H${x}Z")`;
    }
    if (container.dataset.clip === clip) return;
    container.dataset.clip = clip;
    container.style.clipPath = clip;
  }
  function growToFit(body) {
    if (body.scrollHeight <= body.clientHeight + 1) return false;
    if (getComputedStyle(body).overflowY !== "hidden") return false;
    const borders = body.offsetHeight - body.clientHeight;
    body.style.height = `${body.scrollHeight + borders}px`;
    return true;
  }
  var keptScroll = 0;
  function scrollToNew(container) {
    if (!focusOn) return;
    const body = noteBody();
    const frame = frames.get(focusOn.id);
    focusOn.tries -= 1;
    if (focusOn.tries < 0) {
      focusOn = null;
      return;
    }
    if (!body || !frame) return;
    const place = frame.element.getBoundingClientRect();
    const seen = container.getBoundingClientRect();
    const scroller = scrollerOf(body);
    if (place.top < seen.top) scroller.scrollTop -= seen.top - place.top + 8;
    else if (place.bottom > seen.bottom) {
      scroller.scrollTop += Math.min(place.bottom - seen.bottom + 8, place.top - seen.top - 8);
    } else focusOn = null;
    keptScroll = scroller.scrollTop;
  }
  function placeDropLine(container, spot, x, y, width) {
    let line = container.querySelector(".doodle-drop");
    if (!spot) {
      if (line) setHidden(line, true);
      return;
    }
    if (!line) {
      line = document.createElement("div");
      line.className = "doodle-drop";
      container.appendChild(line);
    }
    setHidden(line, false);
    setStyle(line, "transform", `translate(${x}px, ${y + spot.top - 2}px)`);
    setStyle(line, "width", `${width}px`);
  }
  var hiddenFor = "";
  function sync() {
    placeIcon();
    if (full) fitFull();
    drawAnts();
    placeTextEditor();
    placeTopBar();
    const body = noteBody();
    const reason = body ? "" : "the note body is not on screen";
    if (reason !== hiddenFor) {
      hiddenFor = reason;
      if (reason) log("notes draw: frames hidden -", reason);
    }
    if (!body) {
      hideAll();
      return;
    }
    if (growToFit(body)) {
      const scroller = scrollerOf(body);
      if (scroller !== body) scroller.scrollTop = keptScroll;
    }
    keptScroll = scrollerOf(body).scrollTop;
    const { blocks } = measure(body);
    const container = layer();
    const box = visibleBox(body);
    setStyle(container, "left", `${box.left}px`);
    setStyle(container, "top", `${box.top}px`);
    setStyle(container, "width", `${Math.max(0, box.right - box.left)}px`);
    setStyle(container, "height", `${Math.max(0, box.bottom - box.top)}px`);
    setHidden(container, blocks.length === 0);
    cutOutList(container, box);
    const rect = body.getBoundingClientRect();
    const padding = parseFloat(getComputedStyle(body).paddingLeft) || 0;
    const space = room(body);
    const { lineHeight } = measure(body);
    const originX = rect.left + body.clientLeft + padding - box.left;
    const originY = rect.top + body.clientTop - body.scrollTop - box.top;
    const shown = /* @__PURE__ */ new Set();
    for (const block of blocks) {
      shown.add(block.id);
      const shape = SHAPES[block.shape];
      const ratio = shape.width / shape.height;
      let height = Math.min(block.lines * lineHeight, space.height);
      let width = height * ratio;
      if (width > space.width) {
        width = space.width;
        height = width / ratio;
      }
      const frame = frameFor(block, container);
      const { element } = frame;
      if (fitShape(frame, block.shape)) save(block.id, ...frame.doc.layers);
      const dragged = drag?.moving === true && drag.id === block.id ? drag : null;
      const shiftX = dragged ? dragged.dx : 0;
      const shiftY = dragged ? dragged.dy : 0;
      setStyle(element, "transform", `translate(${originX + shiftX}px, ${originY + block.top + shiftY}px)`);
      if (element.classList.contains(DRAGGING_CLASS) !== !!dragged) {
        element.classList.toggle(DRAGGING_CLASS, !!dragged);
      }
      setStyle(element, "width", `${width}px`);
      setStyle(element, "height", `${height}px`);
      if (element.classList.contains(ACTIVE_CLASS) !== (block.id === active)) {
        element.classList.toggle(ACTIVE_CLASS, block.id === active);
      }
      const marked = armed?.id === block.id && Date.now() < armed.until;
      if (element.classList.contains(ARMED_CLASS) !== marked) element.classList.toggle(ARMED_CLASS, marked);
    }
    for (const [id, frame] of frames) {
      if (!shown.has(id) && frame.element.isConnected) frame.element.remove();
    }
    placeDropLine(container, drag?.moving ? drag.target : null, originX, originY, space.width);
    if (active && !shown.has(active)) release();
    scrollToNew(container);
    if (wantFull && active && activeCanvas()) {
      wantFull = false;
      enterFull();
    }
    if (compact() && toolsOpen && !active && !full) deactivate();
    const bar = toolbar();
    if (full) {
      setHidden(bar, false);
      return;
    }
    setHidden(bar, !toolsOpen || compact());
    const panel = document.querySelector(SELECTORS.panel);
    if (toolsOpen && panel) {
      const place = panel.getBoundingClientRect();
      setStyle(bar, "left", `${place.left}px`);
      setStyle(bar, "width", `${place.width}px`);
      setStyle(bar, "top", `${Math.max(0, place.top - bar.offsetHeight - 4)}px`);
    }
  }
  function keepCaretOut(body) {
    if (body.selectionStart !== body.selectionEnd) return;
    const caret = body.selectionStart;
    const length = body.value.length;
    for (const { start: start2, end } of measure(body).blocks) {
      const inside = caret > start2 && (caret < end || caret === end && end < length);
      if (!inside) continue;
      const target = lastCaret > end ? start2 : Math.min(length, end + 1);
      body.setSelectionRange(target, target);
      lastCaret = target;
      return;
    }
    lastCaret = caret;
  }
  function typeAtDrawing(body, key) {
    if (body.selectionStart !== body.selectionEnd) return false;
    const caret = body.selectionStart;
    for (const block of measure(body).blocks) {
      if (caret === block.start) {
        if (key === "Enter") return false;
        replaceText(body, caret, caret, `${key}
`);
        body.setSelectionRange(caret + key.length, caret + key.length);
        return true;
      }
      if (caret === block.end && block.end === body.value.length) {
        replaceText(body, caret, caret, key === "Enter" ? "\n\n" : `
${key}`);
        return true;
      }
    }
    return false;
  }
  var ARM_MS = 3e3;
  var armed = null;
  var onDrawing = false;
  var BRACKET_MIN = 1;
  var BRACKET_MAX = 150;
  function changeSize(bigger) {
    const change = Math.max(1, Math.round(size * 0.1));
    size = Math.max(BRACKET_MIN, Math.min(BRACKET_MAX, size + (bigger ? change : -change)));
    setStatus(`Brush size ${size}`);
    syncToolbar();
  }
  function shortcutFor(event) {
    const key = event.key.toLowerCase();
    const mod = event.ctrlKey || event.metaKey;
    if (mod && !event.shiftKey && key === "a") return selectLayer;
    if (mod && !event.shiftKey && key === "i") return invertSelection;
    if (mod && !event.shiftKey && key === "x" && selection) return cutSelection;
    if (mod) return key === "c" && !event.shiftKey ? selection ? copySelection : copyPicture : null;
    if ((key === "[" || key === "]") && (tool === "pen" || tool === "eraser")) {
      return () => changeSize(key === "]");
    }
    if (event.shiftKey) return null;
    const pick = (value) => () => {
      tool = value;
      syncToolbar();
    };
    switch (key) {
      case "b":
        return pick("pen");
      case "g":
        return pick("bucket");
      case "e":
        return pick("eraser");
      case "t":
        return pick("text");
      case "r":
        return rotatePicture;
      // Move only has something to move while there is a selection; without one, V types as usual.
      case "v":
        return selection ? pick("move") : null;
      default:
        return null;
    }
  }
  function keyAtDrawing(body, key) {
    if (body.selectionStart !== body.selectionEnd) return false;
    const caret = body.selectionStart;
    for (const block of measure(body).blocks) {
      if (key === "Backspace" && caret === block.end + 1) {
        if (armed?.id === block.id && Date.now() < armed.until) {
          armed = null;
          removeDrawing(block.id);
        } else {
          armed = { id: block.id, until: Date.now() + ARM_MS };
        }
        return true;
      }
      if (key === "Delete" && caret === block.start - 1) {
        confirmBin(block.id);
        return true;
      }
      if (key === "Backspace" && caret === block.start && caret > 0) {
        const above = body.value.lastIndexOf("\n", caret - 2) + 1;
        if (above === caret - 1) replaceText(body, caret - 1, caret, "");
        else body.setSelectionRange(caret - 1, caret - 1);
        return true;
      }
    }
    return false;
  }
  function installDoodles() {
    const tick = () => {
      try {
        sync();
      } catch (error) {
        log("notes draw: could not lay out", error);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    for (const type of ["keyup", "click", "select"]) {
      document.addEventListener(type, (event) => {
        const body = noteBody();
        if (body && event.target === body) keepCaretOut(body);
      });
    }
    document.addEventListener(
      "keydown",
      (event) => {
        const picture = document.getElementById(PICTURE_ID);
        if (picture && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          picture.remove();
          return;
        }
        const question = document.getElementById(CONFIRM_ID);
        if (question && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          question.remove();
          return;
        }
        const answer = question?.querySelector("[data-enter]");
        if (answer && event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          answer.click();
          return;
        }
        if (editing && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          finishEditing();
          return;
        }
        const styleKey = { b: "bold", i: "italic", u: "underline" }[event.key.toLowerCase()];
        const inText = event.target instanceof Element && !!event.target.closest(".doodle-text-input");
        if (styleKey && active && tool === "text" && (inText || onDrawing) && (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey) {
          event.preventDefault();
          event.stopPropagation();
          toggleStyle(styleKey);
          return;
        }
        if (event.key !== "Escape" && event.target instanceof Element && event.target.closest(`#${CONFIRM_ID}, #${TOOLBAR_ID} input, #${TOOLBAR_ID} select, .doodle-text-input`)) {
          return;
        }
        if (active && onDrawing && !event.altKey && !event.isComposing) {
          const shortcut = shortcutFor(event);
          if (shortcut) {
            event.preventDefault();
            event.stopPropagation();
            shortcut();
            return;
          }
        }
        const body = noteBody();
        const erase = event.key === "Backspace" || event.key === "Delete";
        if (!erase) armed = null;
        if (erase && active && onDrawing) {
          event.preventDefault();
          if (selection) deleteSelection();
          else if (event.key === "Delete") confirmBin(active);
          return;
        }
        if (body && event.target === body && erase) {
          if (keyAtDrawing(body, event.key)) event.preventDefault();
          else armed = null;
          return;
        }
        if (event.key === "Enter" && active && onDrawing && polygon && polygon.length >= 3) {
          event.preventDefault();
          closePolygon();
          return;
        }
        const typing = !event.ctrlKey && !event.metaKey && !event.altKey && (event.key === "Enter" || event.key.length === 1);
        if (body && event.target === body && typing && !event.isComposing) {
          if (typeAtDrawing(body, event.key)) event.preventDefault();
          return;
        }
        if (event.key === "Escape" && active && drawingPath) {
          cancelPath();
          return;
        }
        if (event.key === "Escape" && active && (selection || lassoing)) {
          deselect();
          return;
        }
        if (event.key === "Escape" && active) {
          if (document.getElementById(CONFIRM_ID)) document.getElementById(CONFIRM_ID)?.remove();
          else if (full) leaveFull();
          else deactivate();
          return;
        }
        const mod = event.ctrlKey || event.metaKey;
        if (!active || !mod) return;
        const key = event.key.toLowerCase();
        if (key === "z" || key === "y") {
          event.preventDefault();
          event.stopPropagation();
          step(key === "z" && !event.shiftKey);
        }
      },
      true
    );
    document.addEventListener(
      "paste",
      (event) => {
        if (!active || !onDrawing) return;
        if (event.target instanceof Element && event.target.closest(".doodle-text-input")) return;
        const item = [...event.clipboardData?.items ?? []].find((one) => one.type.startsWith("image/"));
        const file = item?.getAsFile();
        if (clipboard && (clipboardFresh || !file)) {
          event.preventDefault();
          event.stopPropagation();
          pasteSelection();
          return;
        }
        if (!file) return;
        event.preventDefault();
        event.stopPropagation();
        importImage(file);
      },
      true
    );
    window.addEventListener("blur", () => {
      clipboardFresh = false;
    });
    document.addEventListener(
      "pointerdown",
      (event) => {
        armed = null;
        const target = event.target instanceof Element ? event.target : null;
        onDrawing = !!target?.closest(
          `#${TOOLBAR_ID}, #${LAYER_ID}, #${FULL_ID}, #${CONFIRM_ID}, #${PICTURE_ID}, #${ICON_ID}`
        );
        if (target?.closest(`#${TOOLBAR_ID}`)) return;
        closePopups();
      },
      true
    );
  }

  // src/autumns-note-doodles/styles.ts
  var STYLE_ID = "doodle-styles";
  var CSS = `
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
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head ?? document.documentElement).appendChild(style);
  }

  // src/autumns-note-doodles/index.ts
  function start() {
    try {
      injectStyles();
      installDoodles();
      void moveOldPictures().then((moved) => {
        if (moved > 0) log("moved", moved, "drawings out of localStorage");
      });
    } catch (error) {
      log("failed to start", error);
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
