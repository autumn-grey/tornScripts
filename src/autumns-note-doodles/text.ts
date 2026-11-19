// Text layers: what a piece of text is, and how it is measured and drawn.
//
// A text layer keeps its words and their look, and its pixels are drawn
// from them whenever either changes, so it stays editable. The words are
// typed into a see-through box laid over the drawing, which draws them in
// the same font at the same size, so its caret sits on the drawn letters.

/** The fonts offered: ones every computer and phone already has, so nothing is fetched. */
export const FONTS = [
  "Arial",
  "Verdana",
  "Trebuchet MS",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Impact",
  "Comic Sans MS",
];

/** The look of a piece of text, apart from its words and place. */
export interface TextLook {
  font: string;
  /** In canvas pixels. */
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  colour: string;
  outline: boolean;
  outlineColour: string;
  /** How far the outline reaches out from the letters, in canvas pixels. */
  outlineSize: number;
  /** How soft the outline's edge is, from 0 (sharp) to 1. */
  outlineSoft: number;
}

/** A piece of text: its words, look, and place. */
export interface TextSpec extends TextLook {
  content: string;
  /** The top left of its box before it is turned, in canvas pixels. */
  x: number;
  y: number;
  /** In radians, clockwise on screen, about the box's middle. */
  angle: number;
}

/** Each line's height, as a share of the text size. The typing box uses the same. */
export const LINE_HEIGHT = 1.25;

/** Returns the CSS font for a piece of text, its size scaled. */
export function fontOf(look: TextLook, scale = 1): string {
  const family = /\s/.test(look.font) ? `"${look.font}"` : look.font;
  return `${look.italic ? "italic " : ""}${look.bold ? "bold " : ""}${look.size * scale}px ${family}, sans-serif`;
}

/** A canvas kept for measuring text on. */
let ruler: CanvasRenderingContext2D | null = null;

/** Returns a piece of text's lines, each one's width, and the size of the box round them, in canvas pixels. */
export function measureText(spec: TextSpec): { lines: string[]; widths: number[]; width: number; height: number } {
  ruler ??= document.createElement("canvas").getContext("2d");
  const lines = spec.content.split("\n");
  if (ruler) ruler.font = fontOf(spec);
  const widths = lines.map((line) => ruler?.measureText(line).width ?? 0);
  // Never narrower than a letter, so an empty box can still be seen and pressed.
  const width = Math.max(spec.size * 0.5, ...widths);
  return { lines, widths, width, height: lines.length * spec.size * LINE_HEIGHT };
}

/** Returns the middle of a piece of text's box, which it turns about. */
export function middleOfText(spec: TextSpec): { x: number; y: number } {
  const { width, height } = measureText(spec);
  return { x: spec.x + width / 2, y: spec.y + height / 2 };
}

/** Returns the corners of a piece of text's box, clockwise from its top left, as turned. */
export function textCorners(spec: TextSpec): { x: number; y: number }[] {
  const { width, height } = measureText(spec);
  const middle = { x: spec.x + width / 2, y: spec.y + height / 2 };
  const cos = Math.cos(spec.angle);
  const sin = Math.sin(spec.angle);
  return [
    [-width / 2, -height / 2],
    [width / 2, -height / 2],
    [width / 2, height / 2],
    [-width / 2, height / 2],
  ].map(([dx = 0, dy = 0]) => ({ x: middle.x + dx * cos - dy * sin, y: middle.y + dx * sin + dy * cos }));
}

/** Returns where in a piece of text's words the caret goes for a point on the drawing: the nearest gap between letters. */
export function caretAt(spec: TextSpec, p: { x: number; y: number }): number {
  ruler ??= document.createElement("canvas").getContext("2d");
  const { lines, width, height } = measureText(spec);
  const middle = middleOfText(spec);
  // Turned back, so the point is measured along the lines.
  const cos = Math.cos(-spec.angle);
  const sin = Math.sin(-spec.angle);
  const dx = p.x - middle.x;
  const dy = p.y - middle.y;
  const x = dx * cos - dy * sin + width / 2;
  const y = dx * sin + dy * cos + height / 2;
  const row = Math.max(0, Math.min(lines.length - 1, Math.floor(y / (spec.size * LINE_HEIGHT))));
  // Each line before it, and the line break after each.
  let offset = 0;
  for (let index = 0; index < row; index += 1) offset += (lines[index]?.length ?? 0) + 1;
  const line = lines[row] ?? "";
  if (ruler) ruler.font = fontOf(spec);
  let best = 0;
  let bestGap = Infinity;
  for (let index = 0; index <= line.length; index += 1) {
    const gap = Math.abs((ruler?.measureText(line.slice(0, index)).width ?? 0) - x);
    // The gaps only grow once past the point, so the search can stop there.
    if (gap > bestGap) break;
    bestGap = gap;
    best = index;
  }
  return offset + best;
}

/**
 * Draws a piece of text's lines onto a context, already turned to it: filled,
 * or stroked wide for an outline. Each line sits in the middle of its line's
 * height, as text does in the typing box.
 */
function drawLines(context: CanvasRenderingContext2D, spec: TextSpec, stroke: boolean): void {
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

/** Draws a text layer's pixels from its words and look, in place of what it held. */
export function drawText(canvas: HTMLCanvasElement, spec: TextSpec): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  const middle = middleOfText(spec);
  const turn = (target: CanvasRenderingContext2D) => {
    target.translate(middle.x, middle.y);
    target.rotate(spec.angle);
  };
  if (spec.outline && spec.outlineSize > 0) {
    // The outline is the letters stroked twice as wide as it reaches, under the
    // letters themselves. A soft one is blurred with a shadow, as Safari's
    // canvas has no filter: drawn off the canvas, its shadow shifted back on.
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
