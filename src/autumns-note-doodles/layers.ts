// A drawing's layers, and how they are stacked into the picture that is shown.
//
// Each layer is a see-through canvas of the drawing's full size. Under them
// all sits the background, Layer 0: not a canvas, just a colour or none,
// which nothing can be drawn on. The canvas on the page is only ever the
// layers stacked together; drawing happens on the layer picked in the panel.

import { rgbOf } from "./colours";
import type { TextSpec } from "./text";

/** The most layers a drawing may have, its background apart. */
export const MAX_LAYERS = 10;

export type Blend = "normal" | "multiply" | "screen" | "overlay" | "soft-light" | "darken" | "lighten" | "color";

/** The blend modes offered, in menu order, each with its name. */
export const BLENDS: { key: Blend; label: string }[] = [
  { key: "normal", label: "Normal" },
  { key: "multiply", label: "Multiply" },
  { key: "screen", label: "Screen" },
  { key: "overlay", label: "Overlay" },
  { key: "soft-light", label: "Soft Light" },
  { key: "darken", label: "Darken" },
  { key: "lighten", label: "Lighten" },
  { key: "color", label: "Colour" },
];

/** A layer's settings, apart from its pixels. */
export interface LayerProps {
  name: string;
  visible: boolean;
  /** 0 to 1. */
  opacity: number;
  blend: Blend;
  /** Shown only where the nearest unclipped layer below it has paint. */
  clip: boolean;
  locked: boolean;
  /** A text layer's words and look, which its pixels are drawn from; null on a layer of paint. */
  text: TextSpec | null;
}

export interface Layer extends LayerProps {
  canvas: HTMLCanvasElement;
  /** Its pixels as last saved, kept so an unchanged layer is not encoded again. */
  png: Blob | null;
  /** Whether its pixels have changed since they were last saved. */
  dirty: boolean;
}

/** A drawing: its background colour (null for none), and its layers from the bottom up. */
export interface Doc {
  background: string | null;
  layers: Layer[];
  /** The layer being drawn on. */
  current: Layer;
  /** The number the next new layer is named with. */
  next: number;
}

/** Returns a new, empty layer of a size. */
export function newLayer(name: string, width: number, height: number): Layer {
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
    dirty: true,
  };
}

/** Returns a layer's settings, apart from its pixels. */
export function propsOf(layer: Layer): LayerProps {
  const { name, visible, opacity, blend, clip, locked, text } = layer;
  // The text is copied, so a later edit to it does not change what was kept.
  return { name, visible, opacity, blend, clip, locked, text: text ? { ...text } : null };
}

/** Returns a fresh drawing: a white background and one empty layer. */
export function newDoc(width: number, height: number): Doc {
  const first = newLayer("Layer 1", width, height);
  return { background: "#ffffff", layers: [first], current: first, next: 2 };
}

/** A spare canvas, for a clipped layer cut to the shape of its base. */
let scratch: HTMLCanvasElement | null = null;

/** Returns the spare canvas, cleared, at a size. */
function spare(width: number, height: number): CanvasRenderingContext2D | null {
  scratch ??= document.createElement("canvas");
  if (scratch.width !== width || scratch.height !== height) {
    scratch.width = width;
    scratch.height = height;
  }
  const context = scratch.getContext("2d");
  context?.clearRect(0, 0, width, height);
  return context;
}

/** Returns a blend mode as the canvas names it. */
function operation(blend: Blend): GlobalCompositeOperation {
  return blend === "normal" ? "source-over" : blend;
}

/**
 * Stacks layers onto a canvas, over whatever it holds already, each with its
 * blend mode and opacity. A clipped layer is cut to the shape of the nearest
 * unclipped layer below it among those given; with none, it is drawn whole.
 * A hidden base hides the layers clipped to it, as in Photoshop.
 */
export function stack(target: HTMLCanvasElement, layers: Layer[]): void {
  const context = target.getContext("2d");
  if (!context) return;
  let base: Layer | null = null;
  for (const layer of layers) {
    if (!layer.clip || !base) {
      base = layer;
      if (!layer.visible) continue;
      context.globalAlpha = layer.opacity;
      context.globalCompositeOperation = operation(layer.blend);
      context.drawImage(layer.canvas, 0, 0);
      continue;
    }
    if (!layer.visible || !base.visible) continue;
    const cut = spare(target.width, target.height);
    if (!cut || !scratch) continue;
    cut.drawImage(layer.canvas, 0, 0);
    cut.globalCompositeOperation = "destination-in";
    cut.drawImage(base.canvas, 0, 0);
    cut.globalCompositeOperation = "source-over";
    context.globalAlpha = layer.opacity;
    context.globalCompositeOperation = operation(layer.blend);
    context.drawImage(scratch, 0, 0);
  }
  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
}

/** Draws a whole drawing onto its shown canvas: the background, then every layer. */
export function composite(target: HTMLCanvasElement, doc: Doc): void {
  const context = target.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, target.width, target.height);
  if (doc.background) {
    context.fillStyle = doc.background;
    context.fillRect(0, 0, target.width, target.height);
  }
  stack(target, doc.layers);
}

// ---- The blend icons ----

/** The icons' two colours: the square behind, and the circle laid over it. */
const BEHIND = "#3a86ff";
const OVER = "#ffbe0b";

/** Returns a channel (0 to 1) of the colour where the circle covers the square, under a blend mode. */
function mixChannel(blend: Blend, b: number, s: number): number {
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

/** Returns how light a colour looks, the way the Colour blend mode measures it. */
function lightness([r, g, b]: number[]): number {
  return 0.3 * (r ?? 0) + 0.59 * (g ?? 0) + 0.11 * (b ?? 0);
}

/** Returns the colour where the circle covers the square, under a blend mode, as CSS. */
function overlapColour(blend: Blend): string {
  const behind = rgbOf(BEHIND).map((value) => value / 255);
  const over = rgbOf(OVER).map((value) => value / 255);
  let mixed: number[];
  if (blend === "color") {
    // The circle's hue and strength, at the square's lightness.
    const shift = lightness(behind) - lightness(over);
    mixed = over.map((value) => value + shift);
    const light = lightness(mixed);
    const low = Math.min(...mixed);
    const high = Math.max(...mixed);
    if (low < 0) mixed = mixed.map((value) => light + ((value - light) * light) / (light - low));
    if (high > 1) mixed = mixed.map((value) => light + ((value - light) * (1 - light)) / (high - light));
  } else {
    mixed = behind.map((value, index) => mixChannel(blend, value, over[index] ?? 0));
  }
  return `rgb(${mixed.map((value) => Math.round(Math.max(0, Math.min(1, value)) * 255)).join(", ")})`;
}

/**
 * Returns the icon for a blend mode: a circle over a square in two flat
 * colours, most of the circle over the square, and the part where they meet
 * in the colour that mode makes. The meeting part is the circle cut off by
 * the square's right and bottom edges, worked out here rather than clipped,
 * as a clip path's id is shared by every copy of the icon on the page.
 */
export function blendIcon(blend: Blend, size = 16): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">
<rect x="1.5" y="1.5" width="13" height="13" fill="${BEHIND}"/>
<circle cx="12.5" cy="12.5" r="8.5" fill="${OVER}"/>
<path d="M14.5 4.24A8.5 8.5 0 0 0 4.24 14.5H14.5Z" fill="${overlapColour(blend)}"/>
</svg>`;
}
