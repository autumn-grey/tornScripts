// Colour sums, the custom colour picker, and the recent custom colours it keeps.
//
// The picker is the usual square and strip: the strip picks the hue, red at
// the top running down through yellow, green, cyan, blue and magenta back to
// red, and the square picks how pale and how dark that hue is, white at its
// top left and black along its bottom.

/** Returns a colour like "#ff8800" as red, green and blue. */
export function rgbOf(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Returns red, green and blue as a colour like "#ff8800". */
export function hexOf(r: number, g: number, b: number): string {
  const part = (value: number) => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** Returns a colour as hue (0 to 360), saturation and value (0 to 1). */
export function hsvOf(hex: string): [number, number, number] {
  const [r, g, b] = rgbOf(hex).map((value) => value / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const range = max - min;
  let hue = 0;
  if (range > 0) {
    if (max === r) hue = ((g - b) / range) % 6;
    else if (max === g) hue = (b - r) / range + 2;
    else hue = (r - g) / range + 4;
  }
  return [(hue * 60 + 360) % 360, max === 0 ? 0 : range / max, max];
}

/** Returns hue (0 to 360), saturation and value (0 to 1) as a colour. */
export function hexOfHsv(hue: number, saturation: number, value: number): string {
  const chroma = value * saturation;
  const part = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const sector = Math.floor(hue / 60) % 6;
  const [r, g, b] = [
    [chroma, part, 0],
    [part, chroma, 0],
    [0, chroma, part],
    [0, part, chroma],
    [part, 0, chroma],
    [chroma, 0, part],
  ][sector] as [number, number, number];
  const lift = value - chroma;
  return hexOf((r + lift) * 255, (g + lift) * 255, (b + lift) * 255);
}

// ---- Recent custom colours ----

/** Where the recent custom colours are kept: a few short strings, so localStorage does. */
const RECENT_KEY = "AND_RECENT_COLOURS";
/** How many recent custom colours are kept. */
export const RECENT_MAX = 7;
/** Run when the recent colours change, so every swatch panel shows the same ones. */
const recentWatchers = new Set<() => void>();

/** Returns the recent custom colours, newest first. */
export function recentColours(): string[] {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(kept) ? kept.filter((one): one is string => typeof one === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

/**
 * Puts a custom colour at the front of the recent ones. With replaceNewest,
 * it takes the place of the newest instead: dragging round the picker is one
 * choice, not one per stop along the way.
 */
export function keepRecent(hex: string, replaceNewest: boolean): void {
  const rest = recentColours().filter((one, index) => one !== hex && !(replaceNewest && index === 0));
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([hex, ...rest].slice(0, RECENT_MAX)));
  } catch {}
  for (const watcher of recentWatchers) watcher();
}

/** Calls back whenever the recent colours change. */
export function watchRecent(watcher: () => void): void {
  recentWatchers.add(watcher);
}

// ---- The picker ----

/** The picker's square and strip, in pixels. */
const SQUARE = 150;
const STRIP = 16;

/** A custom colour picker: its element, and a way to show a colour on it. */
export interface Picker {
  element: HTMLElement;
  set(hex: string): void;
}

/**
 * Returns a colour picker. onChange runs as the colour is dragged about,
 * onCommit once the press that chose it ends.
 */
export function colourPicker(onChange: (hex: string) => void, onCommit: (hex: string) => void): Picker {
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
    for (let step = 0; step <= 6; step += 1) rainbow.addColorStop(step / 6, hexOfHsv((step * 60) % 360, 1, 1));
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
    arrows.style.top = `${(hue / 360) * SQUARE}px`;
  };

  const current = () => hexOfHsv(hue, saturation, value);
  /** Follows a press on one of the two parts, from its first touch until it lets go. */
  const follow = (target: HTMLCanvasElement, apply: (x: number, y: number) => void) => {
    target.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      target.setPointerCapture(event.pointerId);
      const at = (move: PointerEvent) => {
        const rect = target.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (move.clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (move.clientY - rect.top) / rect.height));
        apply(x, y);
        paint();
        onChange(current());
      };
      at(event);
      const moved = (move: PointerEvent) => at(move);
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
  // Just short of the bottom, which is red again and would jump the hue back to the top.
  follow(strip, (_, y) => {
    hue = Math.min(359.9, y * 360);
  });

  paint();
  return {
    element,
    set(hex: string) {
      const [h, s, v] = hsvOf(hex);
      // Grey has no hue of its own, so the strip stays where it was.
      if (s > 0 && v > 0) hue = h;
      saturation = s;
      value = v;
      paint();
    },
  };
}
