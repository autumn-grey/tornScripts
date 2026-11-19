// Gradients: what one is, how it is laid over a drawing, and the editor for it.
//
// A gradient's points are kept as shares of the drawing's width and height,
// not pixels, so it lands in the same place on every shape. A linear one
// runs from its start point to its end; a radial one spreads out from its
// start point, reaching its last colour at the end point. Past that it
// repeats, looping back to its first colour or running back the way it came.
// A path gradient runs along a line drawn on the drawing: each pixel takes the
// colour of the nearest point on the line, by how far along the line that is.
// A shape gradient spreads out from a middle point to a lasso selection's
// outline, in rings of the outline's own shape, repeating past it.

import { colourPicker, hexOf, rgbOf } from "./colours";

/** One colour along a gradient: where (0 to 1), which colour, and how solid. */
export interface Stop {
  at: number;
  colour: string;
  alpha: number;
}

/** A point on the drawing, as shares of its width and height. */
export interface Spot {
  x: number;
  y: number;
}

export interface Gradient {
  kind: "linear" | "radial" | "path" | "shape";
  /** How it repeats past its end: from the start again, or back the way it came. */
  repeat: "loop" | "reverse";
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** A path gradient's anchor points, start to end. */
  path: Spot[];
  /** A shape gradient's outline, which it reaches its last colour on; its middle is the start point. */
  shape: Spot[];
  stops: Stop[];
}

/** A plain black to white sweep, left to right. */
export function defaultGradient(): Gradient {
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
      { at: 1, colour: "#ffffff", alpha: 1 },
    ],
  };
}

/** Returns a separate copy of a gradient. */
function copyGradient(gradient: Gradient): Gradient {
  return JSON.parse(JSON.stringify(gradient)) as Gradient;
}

/** Returns a stop's colour as CSS. */
function stopCss(stop: Stop): string {
  return `rgba(${rgbOf(stop.colour).join(", ")}, ${stop.alpha})`;
}

/** Returns the stops in order along the gradient. Stops at the same place keep the order they were made in. */
function sorted(gradient: Gradient): Stop[] {
  return gradient.stops.slice().sort((a, b) => a.at - b.at);
}

/**
 * Returns the stops for one run of the gradient from 0 to 1, with its first
 * and last colours carried out to the very ends, so each run of a repeat is
 * whole; turned round for a run going back the way it came.
 */
function oneRun(gradient: Gradient, backwards: boolean): { at: number; css: string }[] {
  const stops = sorted(gradient);
  const first = stops[0] as Stop;
  const last = stops[stops.length - 1] as Stop;
  const run = [
    { at: 0, css: stopCss(first) },
    ...stops.map((stop) => ({ at: stop.at, css: stopCss(stop) })),
    { at: 1, css: stopCss(last) },
  ];
  return backwards ? run.reverse().map((stop) => ({ at: 1 - stop.at, css: stop.css })) : run;
}

/** The most runs a repeating gradient is drawn with; a shorter one stops repeating at the edge of these. */
const MOST_RUNS = 400;

/**
 * Adds the stops for the runs of a repeating gradient between two run
 * numbers (run 0 being the gradient as set) to a canvas gradient that spans
 * exactly those runs.
 */
function addRuns(style: CanvasGradient, gradient: Gradient, from: number, to: number): void {
  const span = to - from;
  for (let run = from; run < to; run += 1) {
    const backwards = gradient.repeat === "reverse" && Math.abs(run) % 2 === 1;
    for (const stop of oneRun(gradient, backwards)) {
      style.addColorStop(Math.max(0, Math.min(1, (run + stop.at - from) / span)), stop.css);
    }
  }
}

/** A path gradient's colours, worked out once per gradient and size, as they cost a moment each time. */
const pathCache = new Map<string, HTMLCanvasElement>();

/**
 * Returns a gradient laid over a canvas of a size, ready to fill or stroke
 * with. The offset moves it, for a piece of the drawing that sits elsewhere.
 */
export function gradientStyle(
  context: CanvasRenderingContext2D,
  gradient: Gradient,
  width: number,
  height: number,
  dx = 0,
  dy = 0,
): CanvasGradient | CanvasPattern | string {
  if (gradient.kind === "path" || gradient.kind === "shape") {
    const picture = gradient.kind === "path" ? pathPicture(gradient, width, height) : shapePicture(gradient, width, height);
    const pattern = context.createPattern(picture, "no-repeat");
    pattern?.setTransform(new DOMMatrix().translate(dx, dy));
    return pattern ?? stopCss(sorted(gradient)[0] as Stop);
  }
  const x0 = gradient.x0 * width + dx;
  const y0 = gradient.y0 * height + dy;
  const x1 = gradient.x1 * width + dx;
  const y1 = gradient.y1 * height + dy;
  const length = Math.max(1, Math.hypot(x1 - x0, y1 - y0));
  // How many runs of the gradient it takes to reach every corner of the canvas.
  const corners = [
    [dx, dy],
    [dx + width, dy],
    [dx, dy + height],
    [dx + width, dy + height],
  ] as const;
  if (gradient.kind === "radial") {
    const furthest = Math.max(...corners.map(([x, y]) => Math.hypot(x - x0, y - y0)));
    const runs = Math.max(1, Math.min(MOST_RUNS, Math.ceil(furthest / length)));
    const style = context.createRadialGradient(x0, y0, 0, x0, y0, length * runs);
    addRuns(style, gradient, 0, runs);
    return style;
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
    y0 + (y1 - y0) * to,
  );
  addRuns(style, gradient, from, to);
  return style;
}

/**
 * Returns the gradient as it falls on every pixel of a canvas of a size,
 * four bytes each: laid across a drawing of another size, moved by an offset.
 */
export function gradientPixels(
  gradient: Gradient,
  width: number,
  height: number,
  across: number,
  down: number,
  dx = 0,
  dy = 0,
): Uint8ClampedArray {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return new Uint8ClampedArray(width * height * 4);
  context.fillStyle = gradientStyle(context, gradient, across, down, dx, dy);
  context.fillRect(0, 0, width, height);
  return context.getImageData(0, 0, width, height).data;
}

/** Returns the gradient's colours as a CSS sweep, left to right, for a button. */
export function gradientCss(gradient: Gradient): string {
  return `linear-gradient(90deg, ${sorted(gradient).map((stop) => `${stopCss(stop)} ${stop.at * 100}%`).join(", ")})`;
}

// ---- Path gradients ----

/** How many points each stretch between two anchors is drawn with. */
const CURVE_STEPS = 16;
/** The most anchors a drawn path is cut down to. */
const MOST_ANCHORS = 10;

/** Returns a smooth line through a path's anchors, as points in pixels. */
function curveOf(path: Spot[], width: number, height: number): { x: number; y: number }[] {
  const points = path.map((spot) => ({ x: spot.x * width, y: spot.y * height }));
  if (points.length < 3) return points;
  const out: { x: number; y: number }[] = [];
  // A Catmull-Rom curve, which runs through every anchor.
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[Math.max(0, i - 1)] as { x: number; y: number };
    const b = points[i] as { x: number; y: number };
    const c = points[i + 1] as { x: number; y: number };
    const d = points[Math.min(points.length - 1, i + 2)] as { x: number; y: number };
    for (let step = 0; step < CURVE_STEPS; step += 1) {
      const t = step / CURVE_STEPS;
      const t2 = t * t;
      const t3 = t2 * t;
      const blend = (p: number, q: number, r: number, s: number) =>
        0.5 * (2 * q + (r - p) * t + (2 * p - 5 * q + 4 * r - s) * t2 + (3 * q - p - 3 * r + s) * t3);
      out.push({ x: blend(a.x, b.x, c.x, d.x), y: blend(a.y, b.y, c.y, d.y) });
    }
  }
  out.push(points[points.length - 1] as { x: number; y: number });
  return out;
}

/**
 * Returns a drawn line cut down to the anchors that keep its shape: the
 * points that stray furthest from a straight line between their neighbours,
 * kept until the rest lie close enough (Douglas-Peucker).
 */
export function anchorsOf(points: Spot[]): Spot[] {
  if (points.length < 3) return points;
  const keep = new Set([0, points.length - 1]);
  const tolerance = 0.02;
  const split = (from: number, to: number) => {
    const a = points[from] as Spot;
    const b = points[to] as Spot;
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    let furthest = 0;
    let at = -1;
    for (let i = from + 1; i < to; i += 1) {
      const p = points[i] as Spot;
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
  let anchors = [...keep].sort((a, b) => a - b).map((index) => points[index] as Spot);
  // A very wiggly line keeps an even spread of its anchors, so the editor stays usable.
  if (anchors.length > MOST_ANCHORS) {
    const step = (anchors.length - 1) / (MOST_ANCHORS - 1);
    anchors = Array.from({ length: MOST_ANCHORS }, (_, i) => anchors[Math.round(i * step)] as Spot);
  }
  return anchors;
}

/**
 * Returns a path gradient drawn out at a size. Each pixel's place along the
 * line is found on a coarse grid and blended between grid points, as finding
 * the nearest point of the line for every pixel would be slow.
 */
function pathPicture(gradient: Gradient, width: number, height: number): HTMLCanvasElement {
  const key = `${width}x${height}|${JSON.stringify(gradient.path)}|${JSON.stringify(gradient.stops)}`;
  const kept = pathCache.get(key);
  if (kept) return kept;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext("2d");
  const curve = curveOf(gradient.path, canvas.width, canvas.height);
  if (!context || curve.length < 2) return canvas;

  // How far along the line each of its points is.
  const reach = [0];
  for (let i = 1; i < curve.length; i += 1) {
    const a = curve[i - 1] as { x: number; y: number };
    const b = curve[i] as { x: number; y: number };
    reach.push((reach[i - 1] ?? 0) + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = reach[reach.length - 1] || 1;
  const placeOf = (x: number, y: number) => {
    let best = Infinity;
    let place = 0;
    for (let i = 1; i < curve.length; i += 1) {
      const a = curve[i - 1] as { x: number; y: number };
      const b = curve[i] as { x: number; y: number };
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
  const step = Math.max(1, Math.round(Math.min(canvas.width, canvas.height) / 120));
  const columns = Math.ceil(canvas.width / step) + 1;
  const rows = Math.ceil(canvas.height / step) + 1;
  const grid = new Float32Array(columns * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) grid[row * columns + column] = placeOf(column * step, row * step);
  }

  // Every colour along the gradient, looked up by place.
  const SHADES = 1024;
  const strip = document.createElement("canvas");
  strip.width = SHADES;
  strip.height = 1;
  const stripContext = strip.getContext("2d");
  if (!stripContext) return canvas;
  const sweep = stripContext.createLinearGradient(0, 0, SHADES, 0);
  for (const stop of oneRun(gradient, false)) sweep.addColorStop(stop.at, stop.css);
  stripContext.fillStyle = sweep;
  stripContext.fillRect(0, 0, SHADES, 1);
  const shades = stripContext.getImageData(0, 0, SHADES, 1).data;

  const image = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y += 1) {
    const gy = y / step;
    const row = Math.min(rows - 2, Math.floor(gy));
    const fy = gy - row;
    for (let x = 0; x < canvas.width; x += 1) {
      const gx = x / step;
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
  // Two kept: the drawing's size and the editor's preview.
  if (pathCache.size >= 2) pathCache.delete(pathCache.keys().next().value as string);
  pathCache.set(key, canvas);
  return canvas;
}

/** Returns every colour along one run of a gradient, 1024 of them, four bytes each, looked up by place. */
function shadesOf(gradient: Gradient): Uint8ClampedArray {
  const strip = document.createElement("canvas");
  strip.width = 1024;
  strip.height = 1;
  const context = strip.getContext("2d");
  if (!context) return new Uint8ClampedArray(4096);
  const sweep = context.createLinearGradient(0, 0, 1024, 0);
  for (const stop of oneRun(gradient, false)) sweep.addColorStop(stop.at, stop.css);
  context.fillStyle = sweep;
  context.fillRect(0, 0, 1024, 1);
  return context.getImageData(0, 0, 1024, 1).data;
}

/** A shape gradient's colours, worked out once per gradient and size. */
const shapeCache = new Map<string, HTMLCanvasElement>();
/** How many directions out from the middle the outline's reach is measured in. */
const SHAPE_BINS = 720;

/**
 * Returns a shape gradient drawn out at a size. Each pixel's place is how
 * far it is from the middle, over how far the outline is from the middle in
 * that direction: 0 at the middle, 1 on the outline, more past it.
 */
function shapePicture(gradient: Gradient, width: number, height: number): HTMLCanvasElement {
  const outlineSpots = gradient.shape ?? [];
  const key = `${width}x${height}|${gradient.x0},${gradient.y0}|${gradient.repeat}|${JSON.stringify(outlineSpots)}|${JSON.stringify(gradient.stops)}`;
  const kept = shapeCache.get(key);
  if (kept) return kept;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext("2d");
  const outline = outlineSpots.map((spot) => ({ x: spot.x * canvas.width, y: spot.y * canvas.height }));
  if (!context || outline.length < 3) return canvas;
  const cx = gradient.x0 * canvas.width;
  const cy = gradient.y0 * canvas.height;

  // How far the outline is from the middle in each direction: its furthest
  // crossing, so a dent in the outline does not make a sudden jump.
  const reach = new Float32Array(SHAPE_BINS);
  for (let bin = 0; bin < SHAPE_BINS; bin += 1) {
    const angle = (bin / SHAPE_BINS) * Math.PI * 2;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let furthest = 0;
    for (let i = 0; i < outline.length; i += 1) {
      const a = outline[i] as { x: number; y: number };
      const b = outline[(i + 1) % outline.length] as { x: number; y: number };
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

  const shades = shadesOf(gradient);
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
      const run = Math.floor(place);
      let along = place - run;
      if (gradient.repeat === "reverse" && run % 2 === 1) along = 1 - along;
      const shade = Math.round(along * 1023) * 4;
      const o = (y * canvas.width + x) * 4;
      image.data[o] = shades[shade] ?? 0;
      image.data[o + 1] = shades[shade + 1] ?? 0;
      image.data[o + 2] = shades[shade + 2] ?? 0;
      image.data[o + 3] = shades[shade + 3] ?? 0;
    }
  }
  context.putImageData(image, 0, 0);
  // Two kept: the drawing's size and the editor's preview.
  if (shapeCache.size >= 2) shapeCache.delete(shapeCache.keys().next().value as string);
  shapeCache.set(key, canvas);
  return canvas;
}

/** Returns the middle of an outline: where its area balances. */
export function middleOf(outline: Spot[]): Spot {
  let area = 0;
  let x = 0;
  let y = 0;
  outline.forEach((a, i) => {
    const b = outline[(i + 1) % outline.length] as Spot;
    const cross = a.x * b.y - b.x * a.y;
    area += cross;
    x += (a.x + b.x) * cross;
    y += (a.y + b.y) * cross;
  });
  if (Math.abs(area) < 1e-9) {
    return {
      x: outline.reduce((sum, p) => sum + p.x, 0) / (outline.length || 1),
      y: outline.reduce((sum, p) => sum + p.y, 0) / (outline.length || 1),
    };
  }
  return { x: x / (3 * area), y: y / (3 * area) };
}

// ---- Recent gradients ----

/** Where the gradients last used are kept. */
const RECENT_KEY = "AND_RECENT_GRADIENTS";
/** How many recent gradients are kept. */
const RECENT_MAX = 7;

/** Returns the gradients last used, newest first. */
function recentGradients(): Gradient[] {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(kept) ? (kept as Gradient[]).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

/** Keeps a gradient at the front of the ones last used, when it differs from them. */
export function keepGradient(gradient: Gradient): void {
  const text = JSON.stringify(gradient);
  const rest = recentGradients().filter((one) => JSON.stringify(one) !== text);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([gradient, ...rest].slice(0, RECENT_MAX)));
  } catch {}
}

// ---- The editor ----

/** Returns the colour part way along a gradient, for a new stop placed there. */
function colourAt(gradient: Gradient, at: number): Stop {
  const stops = sorted(gradient);
  const after = stops.findIndex((stop) => stop.at >= at);
  const b = stops[after === -1 ? stops.length - 1 : after] as Stop;
  const a = stops[Math.max(0, after - 1)] as Stop;
  const t = b.at === a.at ? 0 : (at - a.at) / (b.at - a.at);
  const [ar, ag, ab] = rgbOf(a.colour);
  const [br, bg, bb] = rgbOf(b.colour);
  return {
    at,
    colour: hexOf(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t),
    alpha: a.alpha + (b.alpha - a.alpha) * t,
  };
}

/** The layout preview's longest side, and the stop bar's width, in pixels. */
const PREVIEW = 180;
/** How near a handle a press has to be to take hold of it, in pixels. */
const GRAB = 14;
/** How soon a second tap on a stop has to come to copy it. */
const DOUBLE_TAP_MS = 350;

/** A gradient editor: its element, and a way to redraw it when shown. */
export interface GradientEditor {
  element: HTMLElement;
  refresh(): void;
}

/**
 * Returns the editor for a gradient, which it changes in place. ratio gives
 * the open drawing's width over its height, for the layout preview; onChange
 * runs after every change; onDrawPath when the reader asks to draw a path.
 * selectionOutline gives the lasso selection's outline, as shares of the
 * drawing's size, or null when there is none to match.
 */
export function gradientEditor(
  gradient: Gradient,
  ratio: () => number,
  onChange: () => void,
  onDrawPath: () => void,
  selectionOutline: () => Spot[] | null,
): GradientEditor {
  const element = document.createElement("div");
  element.className = "doodle-gradient";
  let picked = 0;

  const recent = document.createElement("div");
  recent.className = "doodle-recent";

  /** Returns a row of text buttons, one lit for the setting in use. */
  const choices = <T extends string>(options: [T, string][], read: () => T, pick: (value: T) => void) => {
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
  const kinds = choices<Gradient["kind"]>(
    [["linear", "Linear"], ["radial", "Radial"], ["path", "Path"], ["shape", "Match selection"]],
    () => gradient.kind,
    (kind) => {
      // Path asks for a line to be drawn on the drawing; the gradient changes once it is.
      if (kind === "path") {
        onDrawPath();
        return;
      }
      if (kind === "shape") {
        const outline = selectionOutline();
        if (!outline) return;
        gradient.shape = outline;
        const middle = middleOf(outline);
        gradient.x0 = middle.x;
        gradient.y0 = middle.y;
      }
      // Each kind starts laid out the usual way for it; picked again, it keeps its points.
      if (kind === "radial" && gradient.kind !== "radial") {
        // From the middle out to the nearer edges.
        gradient.x0 = 0.5;
        gradient.y0 = 0.5;
        gradient.x1 = 0.5 + 0.5 * Math.min(1, 1 / ratio());
        gradient.y1 = 0.5;
      } else if (kind === "linear" && gradient.kind !== "linear") {
        gradient.x0 = 0;
        gradient.y0 = 0.5;
        gradient.x1 = 1;
        gradient.y1 = 0.5;
      }
      gradient.kind = kind;
      changed();
    },
  );
  const repeats = choices<Gradient["repeat"]>(
    [["loop", "Loop"], ["reverse", "Reverse"]],
    () => gradient.repeat,
    (repeat) => {
      gradient.repeat = repeat;
      changed();
    },
  );

  // The layout: the gradient across the drawing's shape, with its points to drag.
  const layout = document.createElement("canvas");
  layout.className = "doodle-gradient-layout";

  // The stops: a bar of the colours, with a marker under it for each.
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
    if (gradient.stops.length <= 2) return;
    gradient.stops.splice(picked, 1);
    picked = 0;
    changed();
  });

  const picker = colourPicker(
    (hex) => {
      const stop = gradient.stops[picked];
      if (!stop) return;
      stop.colour = hex;
      changed(false);
    },
    () => {},
  );
  const strength = document.createElement("input");
  strength.type = "range";
  strength.className = "doodle-range doodle-gradient-alpha";
  strength.min = "0";
  strength.max = "100";
  strength.title = "Stop opacity";
  strength.addEventListener("input", () => {
    const stop = gradient.stops[picked];
    if (!stop) return;
    stop.alpha = Number(strength.value) / 100;
    changed(false);
  });

  element.append(recent, kinds.row, repeats.row, layout, barBox, remove, picker.element, strength);

  /** Redraws everything; with setPicker, the picker too, which must not move under a drag of its own. */
  const changed = (setPicker = true) => {
    draw(setPicker);
    onChange();
  };

  /** Returns the points to drag on the layout, in its pixels: the two ends, a path's anchors, or a shape's middle. */
  const handles = (): Spot[] => {
    const w = layout.width;
    const h = layout.height;
    const spots =
      gradient.kind === "path"
        ? gradient.path
        : gradient.kind === "shape"
          ? [{ x: gradient.x0, y: gradient.y0 }]
          : [
            { x: gradient.x0, y: gradient.y0 },
            { x: gradient.x1, y: gradient.y1 },
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
          Object.assign(gradient, copyGradient(one));
          picked = 0;
          changed();
        });
        return swatch;
      }),
    );
  };

  const draw = (setPicker: boolean) => {
    drawRecent();
    kinds.light();
    repeats.light();
    // Matching a selection needs one to match.
    const match = kinds.row.querySelector<HTMLButtonElement>('[data-choice="shape"]');
    if (match) match.disabled = !selectionOutline();
    // A path runs end to end, so it has nothing to repeat.
    repeats.row.hidden = gradient.kind === "path";
    const shape = ratio();
    const width = shape >= 1 ? PREVIEW : Math.round(PREVIEW * shape);
    const height = shape >= 1 ? Math.round(PREVIEW / shape) : PREVIEW;
    if (layout.width !== width) layout.width = width;
    if (layout.height !== height) layout.height = height;
    const context = layout.getContext("2d");
    if (context) {
      context.clearRect(0, 0, width, height);
      context.fillStyle = gradientStyle(context, gradient, width, height);
      context.fillRect(0, 0, width, height);
      const points = handles();
      context.lineWidth = 1.5;
      context.strokeStyle = "#fff";
      context.beginPath();
      if (gradient.kind === "path") {
        curveOf(gradient.path, width, height).forEach((p, i) => (i === 0 ? context.moveTo(p.x, p.y) : context.lineTo(p.x, p.y)));
      } else if (gradient.kind === "shape") {
        (gradient.shape ?? []).forEach((p, i) =>
          i === 0 ? context.moveTo(p.x * width, p.y * height) : context.lineTo(p.x * width, p.y * height),
        );
        context.closePath();
      } else {
        points.forEach((p, i) => (i === 0 ? context.moveTo(p.x, p.y) : context.lineTo(p.x, p.y)));
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
      for (const stop of oneRun(gradient, false)) sweep.addColorStop(stop.at, stop.css);
      barContext.fillStyle = sweep;
      barContext.fillRect(0, 0, bar.width, bar.height);
    }
    markers.replaceChildren(
      ...gradient.stops.map((stop, index) => {
        const marker = document.createElement("span");
        marker.className = `doodle-gradient-marker${index === picked ? " doodle-on" : ""}`;
        marker.style.left = `${stop.at * 100}%`;
        marker.style.background = stop.colour;
        holdMarker(marker, index);
        return marker;
      }),
    );
    remove.disabled = gradient.stops.length <= 2;
    const stop = gradient.stops[picked];
    if (stop) {
      if (setPicker) picker.set(stop.colour);
      strength.value = String(Math.round(stop.alpha * 100));
      strength.style.setProperty("--doodle-fill", `rgba(0, 117, 255, ${stop.alpha})`);
    }
  };

  /** The last tap on a stop, so a second one soon after on the same stop can copy it. */
  let lastTap = { index: -1, time: 0 };

  /**
   * Picks a stop on a press and slides it along the bar while held. Alt and a
   * drag on a computer, or a double tap on a touch screen, copies it first,
   * so two stops can sit at the same place for a hard edge between colours.
   */
  const holdMarker = (marker: HTMLElement, index: number) => {
    marker.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const now = Date.now();
      const doubleTap =
        event.pointerType !== "mouse" && lastTap.index === index && now - lastTap.time < DOUBLE_TAP_MS;
      lastTap = { index, time: now };
      const original = gradient.stops[index];
      if (!original) return;
      if (event.altKey || doubleTap) {
        gradient.stops.push({ ...original });
        picked = gradient.stops.length - 1;
        lastTap = { index: -1, time: 0 };
      } else {
        picked = index;
      }
      draw(true);
      // A double tap only copies: the copy sits where the stop was until dragged.
      if (doubleTap) {
        onChange();
        return;
      }
      const stop = gradient.stops[picked];
      if (!stop) return;
      const slide = (move: PointerEvent) => {
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

  // A press on the bar adds a stop there, in the colour already at that point.
  bar.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const rect = bar.getBoundingClientRect();
    const at = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    gradient.stops.push(colourAt(gradient, at));
    picked = gradient.stops.length - 1;
    changed();
  });

  // A press near one of the layout's points drags it about the drawing.
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
    const drag = (move: PointerEvent) => {
      const box = layout.getBoundingClientRect();
      // Kept on the preview, where the point can still be seen and taken hold of.
      const nx = Math.max(0, Math.min(1, (move.clientX - box.left) / box.width));
      const ny = Math.max(0, Math.min(1, (move.clientY - box.top) / box.height));
      if (gradient.kind === "path") {
        gradient.path[nearest] = { x: nx, y: ny };
      } else if (nearest === 0) {
        gradient.x0 = nx;
        gradient.y0 = ny;
      } else {
        gradient.x1 = nx;
        gradient.y1 = ny;
      }
      changed(false);
    };
    const end = () => {
      layout.removeEventListener("pointermove", drag);
      layout.removeEventListener("pointerup", end);
      layout.removeEventListener("pointercancel", end);
    };
    layout.addEventListener("pointermove", drag);
    layout.addEventListener("pointerup", end);
    layout.addEventListener("pointercancel", end);
  });

  draw(true);
  return { element, refresh: () => draw(true) };
}
