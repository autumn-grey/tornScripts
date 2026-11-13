// Drawings inside the chat bar's Notes, on lines of their own.
//
// Torn's note body is a plain <textarea>, which cannot hold a picture. So the
// New button writes a marker line, "[drawing 3f9a2c l]", followed by
// enough blank-looking lines to fill the note's width at the drawing's shape,
// and a frame is laid over that spot from outside the textarea and kept on
// it as the note scrolls. Torn saves the marker and those lines like any
// other note text; the picture itself is kept in this browser, under the
// marker's id. A device without it shows the marker and the gap, and can
// draw a fresh one in it.
//
// Text edits go through execCommand, not by setting the value: that is the
// one way to change a textarea that its own undo can take back, so a drawing
// deleted with Backspace comes back with Ctrl+Z, as it would in Word.

import { log } from "./debug";
import { isMobileView, readPicture, writePicture } from "./storage";
import { canUpload, uploadPicture } from "./upload";

// Every selector this feature matches on, from the live Notes window.
const SELECTORS = {
  panel: "#notes_panel",
  // The header is itself a button: icon, "Notes", minimise, maximise.
  header: "#notes_panel > button",
  minimize: '[class*="minimizeIcon___"]',
  body: "#notes_panel textarea",
  // The note picker's drop-down, which opens over the body.
  noteList: '#notes_panel [class*="list___"]',
};

const ICON_ID = "doodle-icon";
const LAYER_ID = "doodle-layer";
const TOOLBAR_ID = "doodle-toolbar";
const FULL_ID = "doodle-full";
const CONFIRM_ID = "doodle-confirm";
/** The drawing shown as a plain picture, for copying where the clipboard will not take one. */
const PICTURE_ID = "doodle-picture";
const FRAME_CLASS = "doodle-frame";
const ACTIVE_CLASS = "doodle-active";
const ON_CLASS = "doodle-on";
/** Marks a drawing being dragged to a new line. */
const DRAGGING_CLASS = "doodle-dragging";
/** Marks a drawing one more Backspace will delete. */
const ARMED_CLASS = "doodle-armed";

/** A marker line: the drawing's id, then its shape (none on the first drawings made). */
const MARKER = /^\[drawing ([a-z0-9]{4,12})(?: ([lps]))?\]$/;

type ShapeKey = "l" | "p" | "s";

/** A drawing's shape: its size in canvas pixels, and its name. */
interface Shape {
  width: number;
  height: number;
  /** How tall the first drawings were made, which reserved plain blank lines. */
  shown: number;
  label: string;
}

// The canvas is drawn at about twice its shown size, for sharp lines.
const SHAPES: Record<ShapeKey, Shape> = {
  l: { width: 720, height: 480, shown: 180, label: "Landscape" },
  p: { width: 480, height: 720, shown: 260, label: "Portrait" },
  s: { width: 600, height: 600, shown: 220, label: "Square" },
};
const DEFAULT_SHAPE: ShapeKey = "l";
/**
 * What each line a drawing covers holds: a braille blank, which shows as a
 * space. Plain empty lines could not be told from ones the reader left, so
 * a drawing would swallow the spacing under it.
 */
const RESERVED = "⠀";
/** The most of the note's window a drawing may take up, top to bottom. */
const TALLEST = 0.85;

/** The size of Torn's own header icons beside it. */
const ICON_SIZE = 24;
/** White in dark mode too, so a pasted drawing reads the same anywhere. */
const BACKGROUND = "#ffffff";
/** Brush sizes in shown pixels: the slider's ends, and where it starts. */
const SIZE_MIN = 2;
const SIZE_MAX = 30;
const SIZE_DEFAULT = 5;
const UNDO_LIMIT = 30;
/** How far a pixel's colour may stray and still be filled by the bucket. */
const FILL_TOLERANCE = 60;

// Photoshop's default swatches, row by row.
const SWATCHES = [
  "#ff0000", "#ffff00", "#00ff00", "#00ffff", "#0000ff", "#ff00ff", "#ffffff", "#ebebeb",
  "#e1e1e1", "#d7d7d7", "#cccccc", "#c2c2c2", "#b7b7b7", "#acacac", "#a0a0a0", "#959595",
  "#ee1d24", "#fff100", "#00a650", "#00aeef", "#2f3192", "#ed008c", "#898989", "#7d7d7d",
  "#707070", "#626262", "#555555", "#464646", "#363636", "#262626", "#111111", "#000000",
  "#f7977a", "#fbad82", "#fdc68c", "#fff799", "#c6df9c", "#a4d49d", "#81ca9d", "#7bcdc9",
  "#6ccff7", "#7ca6d8", "#8293ca", "#8881be", "#a286bd", "#bc8cbf", "#f49bc1", "#f5999d",
  "#f26c4f", "#f68e55", "#fbaf5a", "#fff467", "#acd372", "#7dc473", "#39b778", "#16bcb4",
  "#00bff3", "#438ccb", "#5573b7", "#5e5ca7", "#855fa8", "#a763a9", "#ef6ea8", "#f16d7e",
  "#ee1d24", "#f16522", "#f7941d", "#fff100", "#8fc63d", "#37b44a", "#00a650", "#00a99e",
  "#00aeef", "#0072bc", "#0054a5", "#2f3192", "#652c91", "#91278f", "#ed008c", "#ee105a",
  "#9d0a0f", "#a1410d", "#a36209", "#aba000", "#588528", "#197b30", "#007236", "#00736a",
  "#0076a4", "#004a80", "#003370", "#1d1363", "#450e61", "#62055f", "#9e005c", "#9d0039",
  "#790000", "#7b3000", "#7c4900", "#827a00", "#3e6617", "#045f20", "#005824", "#005951",
  "#005b7e", "#003562", "#002056", "#0c004b", "#30004a", "#4b0048", "#7a0045", "#7a0026",
  "#c7b299", "#998675", "#736357", "#534741", "#37302d", "#c69c6d", "#a67c52", "#8c6239",
  "#754c24", "#603913",
];

type Tool = "pen" | "eraser" | "bucket";

/** One drawing found in the note body. */
interface Block {
  id: string;
  shape: ShapeKey;
  /** Whether the marker names its shape; the first drawings made did not. */
  named: boolean;
  /** Top of the marker line, in the textarea's content, from its padding edge. */
  top: number;
  /** Where the marker line starts in the text. */
  start: number;
  /** Where the last line the drawing covers ends in the text. */
  end: number;
  /** How many lines the drawing covers, its marker included. */
  lines: number;
  /** Whether its lines are reserved ones, rather than the first drawings' plain blanks. */
  reserved: boolean;
}

/** One frame on the page, and the canvas it draws on. */
interface Frame {
  element: HTMLElement;
  canvas: HTMLCanvasElement;
}

const frames = new Map<string, Frame>();
/** The drawing being drawn on, if any. */
let active: string | null = null;
/** Whether the open drawing fills the screen. */
let full = false;
let colour = "#000000";
let size = SIZE_DEFAULT;
let tool: Tool = "pen";
/**
 * One step back. How the canvas looked; or a change to the note's text,
 * taken back exactly so no line it added is left behind: the making of a
 * drawing, with the line breaks put either side of it (back to the drawing
 * open before), or a change of its shape (with its old lines and canvas).
 *
 * The drawing is found by its id when the step is undone, not by where it
 * was or what its lines said: typing above it moves it, and opening it again
 * in a resized Notes re-cuts its lines.
 */
type Step =
  | ImageData
  | { kind: "created"; id: string; lead: string; tail: string; before: string | null }
  | { kind: "reshaped"; id: string; oldText: string; image: ImageData };
let undoStack: Step[] = [];
let redoStack: ImageData[] = [];
/** Whether the drawing tools are out, with or without a drawing open. */
let toolsOpen = false;
/** A new drawing the note should scroll to, and how many frames are left to try. */
let focusOn: { id: string; tries: number } | null = null;
/** The last measurement, kept until the text or the width changes. */
let measured: { key: string; blocks: Block[]; lineHeight: number } | null = null;
/** Where the caret was, so a move into a drawing's lines can be undone the way it came. */
let lastCaret = 0;

/** Returns the note body, when it is on screen. */
function noteBody(): HTMLTextAreaElement | null {
  const body = document.querySelector<HTMLTextAreaElement>(SELECTORS.body);
  return body && body.getClientRects().length > 0 ? body : null;
}

/** Returns a new drawing id. */
function newId(): string {
  return Math.random().toString(36).slice(2, 8).padEnd(6, "0");
}

/** Returns how many plain blank lines one of the first drawings took under its marker. */
function blankLinesNeeded(shape: ShapeKey, lineHeight: number): number {
  return Math.max(1, Math.ceil(SHAPES[shape].shown / lineHeight) - 1);
}

/** Returns how wide a drawing may be in the note, and how tall at most. */
function room(body: HTMLTextAreaElement): { width: number; height: number } {
  const padding = parseFloat(getComputedStyle(body).paddingLeft) || 0;
  // The part of Notes that can be seen, not the textarea: Torn grows that to
  // fit its text, so it is a few lines tall in a short note and taller than
  // the window in a long one.
  const seen = visibleBox(body);
  return { width: body.clientWidth - padding * 2, height: (seen.bottom - seen.top) * TALLEST };
}

/** Returns how many lines a drawing should reserve under its marker to fill the note's width. */
function linesToReserve(body: HTMLTextAreaElement, shape: ShapeKey): number {
  const { width, height } = room(body);
  const tall = Math.min(width * (SHAPES[shape].height / SHAPES[shape].width), height);
  return Math.max(1, Math.round(tall / measure(body).lineHeight) - 1);
}

/**
 * Returns a hidden copy of the body, styled to wrap text exactly as it does,
 * already in the page. The caller removes it.
 */
function mirrorOf(body: HTMLTextAreaElement): HTMLElement {
  const style = getComputedStyle(body);
  const mirror = document.createElement("div");
  // An id of ours, so the page watchers know adding it was this script.
  mirror.id = "doodle-mirror";
  for (const name of [
    "fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing",
    "wordSpacing", "textIndent", "textTransform", "tabSize", "paddingTop", "paddingRight",
    "paddingBottom", "paddingLeft", "wordBreak",
  ] as const) {
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
    overflowWrap: "break-word",
  });
  document.body.appendChild(mirror);
  return mirror;
}

/** A place a dragged drawing can be dropped: the start of a line, and how far down it is. */
interface Spot {
  offset: number;
  top: number;
}

/**
 * Returns every line start a drawing could be dropped at.
 *
 * Not inside a drawing, its own or another's: a drawing dropped among
 * another's reserved lines would split it in two.
 */
function dropSpots(body: HTMLTextAreaElement, blocks: Block[]): Spot[] {
  const mirror = mirrorOf(body);
  const lines = body.value.split("\n");
  const marks: { offset: number; span: HTMLElement }[] = [];
  let offset = 0;
  for (const line of lines) {
    const span = document.createElement("span");
    span.textContent = `${line}\n`;
    mirror.appendChild(span);
    marks.push({ offset, span });
    offset += line.length + 1;
  }
  const end = document.createElement("span");
  end.textContent = "​";
  mirror.appendChild(end);

  const inside = (at: number) => blocks.some((block) => at > block.start && at <= block.end);
  const spots = marks
    .filter((mark) => !inside(mark.offset))
    .map((mark) => ({ offset: mark.offset, top: mark.span.offsetTop }));
  if (!body.value.endsWith("\n")) spots.push({ offset: body.value.length, top: end.offsetTop });
  mirror.remove();
  return spots;
}

/**
 * Moves a drawing so it starts at a line start, as one edit the textarea's
 * undo can take back.
 */
function moveDrawing(body: HTMLTextAreaElement, block: Block, to: number): void {
  const value = body.value;
  // The drawing goes with the line break after it, or before it when it is last.
  const cutStart = block.end < value.length ? block.start : Math.max(0, block.start - 1);
  const cutEnd = block.end < value.length ? block.end + 1 : block.end;
  if (to >= cutStart && to <= cutEnd) return;
  const piece = value.slice(block.start, block.end);
  const without = value.slice(0, cutStart) + value.slice(cutEnd);
  const at = to > cutStart ? to - (cutEnd - cutStart) : to;
  const lone = at === without.length && without.length > 0 && !without.endsWith("\n");
  // A line after it either way, so there is somewhere to click and type below.
  const placed = lone
    ? `${without}\n${piece}\n`
    : `${without.slice(0, at)}${piece}\n${without.slice(at)}`;

  // Only the stretch that differs is replaced, so the edit stays small.
  let head = 0;
  while (head < value.length && head < placed.length && value[head] === placed[head]) head += 1;
  let tail = 0;
  while (
    tail < value.length - head &&
    tail < placed.length - head &&
    value[value.length - 1 - tail] === placed[placed.length - 1 - tail]
  ) {
    tail += 1;
  }
  replaceText(body, head, value.length - tail, placed.slice(head, placed.length - tail));
  log("notes draw: moved drawing", block.id);
}

/** A closed drawing being dragged to a new line. */
interface Drag {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  moving: boolean;
  spots: Spot[];
  target: Spot | null;
}

/** How far a press has to move before it is a drag rather than a click. */
const DRAG_START_PX = 6;
let drag: Drag | null = null;

/** Follows a dragged drawing, picking the line start nearest the pointer to drop it on. */
function followDrag(event: PointerEvent): void {
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
  let best: Spot | null = null;
  for (const spot of drag.spots) {
    if (!best || Math.abs(spot.top - y) < Math.abs(best.top - y)) best = spot;
  }
  drag.target = best;
}

/** Ends a press on a closed drawing: drops it if it was dragged, opens it if it was clicked. */
function endDrag(event: PointerEvent): void {
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

/**
 * Returns where each drawing sits in the body, and the height of one line.
 *
 * Measured on a hidden copy styled like the textarea, which wraps its text
 * the same way; a textarea gives no position for a line of its own.
 */
function measure(body: HTMLTextAreaElement): { blocks: Block[]; lineHeight: number } {
  const key = `${body.clientWidth}|${body.value}`;
  if (measured?.key === key) return measured;

  const style = getComputedStyle(body);
  const mirror = mirrorOf(body);
  mirror.textContent = "M";
  const lineHeight =
    mirror.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) || 18;

  const blocks: Block[] = [];
  const lines = body.value.split("\n");
  let offset = 0;
  lines.forEach((line, index) => {
    const match = MARKER.exec(line);
    if (match?.[1]) {
      const shape = (match[2] as ShapeKey | undefined) ?? DEFAULT_SHAPE;
      let end = offset + line.length;
      let next = index + 1;
      while (lines[next] === RESERVED) {
        end += RESERVED.length + 1;
        next += 1;
      }
      const reserved = next > index + 1;
      if (!reserved) {
        // One of the first drawings, on plain blank lines: it covers the ones
        // it needs, never the text's last line, so the caret can get past.
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
        named: match[2] !== undefined,
        top: spot.offsetTop,
        start: offset,
        end,
        lines: next - index,
        reserved,
      });
    }
    offset += line.length + 1;
  });
  mirror.remove();

  measured = { key, blocks, lineHeight };
  return measured;
}

/** Returns the drawing with an id, as it sits in the body now. */
function blockFor(id: string): Block | null {
  const body = noteBody();
  return body ? (measure(body).blocks.find((block) => block.id === id) ?? null) : null;
}

/**
 * Replaces a stretch of the body's text the way typing would.
 *
 * Torn's textarea is React's, which keeps its own copy of the value. An
 * execCommand edit fires the input event React listens for and goes on the
 * textarea's own undo history; setting the value fails both.
 */
function replaceText(body: HTMLTextAreaElement, start: number, end: number, text: string): void {
  // Focusing scrolls the textarea's box into view, which sent the note to its top.
  body.focus({ preventScroll: true });
  body.setSelectionRange(start, end);
  const done = text === "" ? document.execCommand("delete") : document.execCommand("insertText", false, text);
  if (done) return;
  // Browsers that refuse execCommand still get the change, without the undo.
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(body, body.value.slice(0, start) + text + body.value.slice(end));
  body.dispatchEvent(new Event("input", { bubbles: true }));
  body.setSelectionRange(start + text.length, start + text.length);
}

/** Returns a drawing's marker line and the lines it reserves under it. */
function blockText(id: string, shape: ShapeKey, reserve: number): string {
  return `[drawing ${id} ${shape}]${`\n${RESERVED}`.repeat(reserve)}`;
}

/**
 * Re-cuts a drawing's lines to fill the note as it is now.
 *
 * A drawing is cut to the note's width when it is made; Notes made wider or
 * narrower later leaves it the wrong height. Done when it is opened, as that
 * is the reader's own click, and only when the count is off.
 */
function refit(id: string): void {
  const body = noteBody();
  const block = blockFor(id);
  if (!body || !block) return;
  const reserve = linesToReserve(body, block.shape);
  if (block.reserved && block.named && block.lines - 1 === reserve) return;
  replaceText(body, block.start, block.end, blockText(id, block.shape, reserve));
}

/**
 * Puts a new drawing on its own line after a point in the text (the caret,
 * unless one is given) and opens it. Returns its id.
 */
function insertDrawing(
  body: HTMLTextAreaElement,
  after?: number,
): { id: string; lead: string; tail: string } {
  const value = body.value;
  const caret = after ?? (document.activeElement === body ? body.selectionEnd : value.length);
  let lineEnd = value.indexOf("\n", caret);
  if (lineEnd === -1) lineEnd = value.length;
  const lineStart = value.lastIndexOf("\n", lineEnd - 1) + 1;

  const id = newId();
  const lead = lineEnd > lineStart ? "\n" : "";
  // A spare line after it, so there is somewhere to click and type below.
  const tail = lineEnd === value.length ? "\n\n" : "\n";
  const text = `${lead}${blockText(id, DEFAULT_SHAPE, linesToReserve(body, DEFAULT_SHAPE))}${tail}`;
  replaceText(body, lineEnd, lineEnd, text);
  log("notes draw: added drawing", id);
  activate(id);
  return { id, lead, tail };
}

/**
 * Makes a new drawing: below the open one when there is one, or else at the
 * caret. Undo takes it away again, and the note scrolls to show it.
 */
function newDrawing(): void {
  const body = noteBody();
  if (!body) return;
  const before = active;
  const open = active ? blockFor(active) : null;
  const { id, lead, tail } = insertDrawing(body, open ? open.end : undefined);
  undoStack.push({ kind: "created", id, lead, tail, before });
  focusOn = { id, tries: 30 };
}

/** Takes a drawing out of the note, as one edit the textarea's undo can bring back. */
function removeDrawing(id: string): void {
  const body = noteBody();
  const block = blockFor(id);
  if (!body || !block) return;
  // The picture stays stored, so undoing the deletion brings it back whole.
  if (active === id) release();
  replaceText(body, block.start, Math.min(body.value.length, block.end + 1), "");
}

/** Keeps a drawing's picture, saying so on the toolbar when the browser will not. */
function storePicture(id: string, canvas: HTMLCanvasElement): void {
  canvas.toBlob((picture) => {
    if (!picture) return;
    void writePicture(id, picture).then((kept) => {
      if (!kept) setStatus("Not saved: browser storage is full");
    });
  }, "image/png");
}

/** Fills a canvas with the background colour. */
function blank(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.fillStyle = BACKGROUND;
  context.fillRect(0, 0, canvas.width, canvas.height);
}

/** Gives a canvas a shape's size, keeping what is drawn on it from the top left. */
function reshape(canvas: HTMLCanvasElement, shape: ShapeKey): boolean {
  const { width, height } = SHAPES[shape];
  if (canvas.width === width && canvas.height === height) return false;
  const copy = document.createElement("canvas");
  copy.width = canvas.width;
  copy.height = canvas.height;
  copy.getContext("2d")?.drawImage(canvas, 0, 0);
  canvas.width = width;
  canvas.height = height;
  blank(canvas);
  canvas.getContext("2d")?.drawImage(copy, 0, 0);
  return true;
}

/** Returns a frame for a drawing, made and filled from storage on first use. */
function frameFor(block: Block, layer: HTMLElement): Frame {
  const known = frames.get(block.id);
  if (known) {
    if (!known.element.isConnected) layer.appendChild(known.element);
    return known;
  }
  const element = document.createElement("div");
  element.className = FRAME_CLASS;
  const canvas = document.createElement("canvas");
  const shape = SHAPES[block.shape];
  canvas.width = shape.width;
  canvas.height = shape.height;
  blank(canvas);

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
  layer.appendChild(element);

  void readPicture(block.id).then((picture) => {
    if (!picture) return;
    const address = URL.createObjectURL(picture);
    const image = new Image();
    image.onload = () => {
      // At its own size, not stretched: the first drawings were a wider shape.
      canvas.getContext("2d")?.drawImage(image, 0, 0);
      URL.revokeObjectURL(address);
    };
    image.onerror = () => URL.revokeObjectURL(address);
    image.src = address;
  });
  wireCanvas(block.id, element, canvas);
  const frame = { element, canvas };
  frames.set(block.id, frame);
  return frame;
}

/** Returns a colour like "#ff8800" as red, green and blue. */
function rgbOf(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Fills the area of like colour around a point with the chosen colour. */
function floodFill(canvas: HTMLCanvasElement, startX: number, startY: number, hex: string): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  const { width, height } = canvas;
  const x0 = Math.floor(startX);
  const y0 = Math.floor(startY);
  if (x0 < 0 || y0 < 0 || x0 >= width || y0 >= height) return;
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;
  const at = (y0 * width + x0) * 4;
  const target = [data[at] ?? 0, data[at + 1] ?? 0, data[at + 2] ?? 0, data[at + 3] ?? 0];
  const [r, g, b] = rgbOf(hex);
  const like = (pixel: number) => {
    const i = pixel * 4;
    return (
      Math.abs((data[i] ?? 0) - (target[0] ?? 0)) +
        Math.abs((data[i + 1] ?? 0) - (target[1] ?? 0)) +
        Math.abs((data[i + 2] ?? 0) - (target[2] ?? 0)) +
        Math.abs((data[i + 3] ?? 0) - (target[3] ?? 0)) <=
      FILL_TOLERANCE
    );
  };
  const done = new Uint8Array(width * height);
  const stack: [number, number][] = [[x0, y0]];
  // Scanline fill: run left to the edge of the area, then right, seeding the
  // rows above and below once per stretch of fillable pixels.
  while (stack.length > 0) {
    const [sx, y] = stack.pop() ?? [0, 0];
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
      const i = pixel * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
      if (y > 0) {
        const above = pixel - width;
        const open = !done[above] && like(above);
        if (open && !up) stack.push([x, y - 1]);
        up = open;
      }
      if (y < height - 1) {
        const below = pixel + width;
        const open = !done[below] && like(below);
        if (open && !down) stack.push([x, y + 1]);
        down = open;
      }
      x += 1;
      pixel += 1;
    }
  }
  blendEdges(data, done, width, height, [target[0] ?? 0, target[1] ?? 0, target[2] ?? 0], [r, g, b]);
  context.putImageData(image, 0, 0);
}

/** How far out from a fill its soft edges are looked for, in canvas pixels. */
const EDGE_REACH = 2;

/**
 * Takes the old colour out of the soft edge round a fill and puts the fill
 * colour in its place.
 *
 * Lines are drawn smoothed, so each has a rim of pixels that are part line,
 * part what was under it. The fill stops short of them, being too far from
 * the colour clicked on, and left them a pale ring. Each rim pixel is read
 * as a mix of the old colour and the strongest line colour beside it; the
 * old colour's share is swapped for the fill's, so the line keeps its soft
 * edge but softens into the fill instead.
 */
function blendEdges(
  data: Uint8ClampedArray,
  filled: Uint8Array,
  width: number,
  height: number,
  old: [number, number, number],
  fill: [number, number, number],
): void {
  const source = data.slice();
  const away = (i: number) =>
    Math.hypot((source[i] ?? 0) - old[0], (source[i + 1] ?? 0) - old[1], (source[i + 2] ?? 0) - old[2]);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      if (filled[pixel]) continue;
      // On the rim when a filled pixel is near. Checked on its own first, as
      // most of the canvas is nowhere near and the colour sums cost more.
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
      // The line colour: the unfilled pixel near it furthest from the old colour.
      let line = 0;
      for (let ny = top; ny <= bottom; ny += 1) {
        for (let nx = left; nx <= right; nx += 1) {
          const near = ny * width + nx;
          if (!filled[near]) line = Math.max(line, away(near * 4));
        }
      }
      if (line < 1) continue;
      const i = pixel * 4;
      const lineShare = Math.min(1, away(i) / line);
      if (lineShare > 0.98) continue;
      const oldShare = 1 - lineShare;
      for (let c = 0; c < 3; c += 1) {
        data[i + c] = (source[i + c] ?? 0) + oldShare * ((fill[c] ?? 0) - (old[c] ?? 0));
      }
    }
  }
}

/** Keeps the canvas as it is now, so the next change can be undone. */
function remember(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  undoStack.push(context.getImageData(0, 0, canvas.width, canvas.height));
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  redoStack = [];
}

/** Makes a canvas open for drawing on a press, and draw while it is the open one. */
function wireCanvas(id: string, element: HTMLElement, canvas: HTMLCanvasElement): void {
  // The frame sits over the note, so a wheel over it scrolls the note.
  element.addEventListener(
    "wheel",
    (event) => {
      if (full) return;
      const body = noteBody();
      if (!body) return;
      scrollerOf(body).scrollTop += event.deltaY;
      event.preventDefault();
    },
    { passive: false },
  );
  // A pen's press-and-hold, or its side button, asks for the right-click menu.
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  let drawing = false;
  let last: { x: number; y: number } | null = null;
  const point = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * canvas.width) / rect.width,
      y: ((event.clientY - rect.top) * canvas.height) / rect.height,
    };
  };
  const stroke = (to: { x: number; y: number }) => {
    const context = canvas.getContext("2d");
    if (!context || !last) return;
    context.strokeStyle = tool === "eraser" ? BACKGROUND : colour;
    // Sizes are in shown pixels, whatever size the canvas is shown at.
    context.lineWidth = size * (canvas.width / (canvas.getBoundingClientRect().width || canvas.width));
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(last.x, last.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    last = to;
  };

  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    if (active !== id) {
      // A closed drawing: a click opens it, a drag moves it. Which one is
      // only known once the pointer moves, or comes up without moving.
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
        target: null,
      };
      return;
    }
    closePopups();
    remember(canvas);
    const at = point(event);
    if (tool === "bucket") {
      floodFill(canvas, at.x, at.y, colour);
      storePicture(id, canvas);
      return;
    }
    canvas.setPointerCapture(event.pointerId);
    drawing = true;
    last = at;
    // A tap with no movement still leaves a dot.
    stroke({ x: at.x + 0.01, y: at.y });
  });
  canvas.addEventListener("pointermove", (event) => {
    if (drag?.id === id) followDrag(event);
    else if (drawing) stroke(point(event));
  });
  const finish = () => {
    if (!drawing) return;
    drawing = false;
    last = null;
    storePicture(id, canvas);
  };
  canvas.addEventListener("pointerup", (event) => {
    if (drag?.id === id) endDrag(event);
    else finish();
  });
  canvas.addEventListener("pointercancel", () => {
    // The browser took the press over, to scroll on a touch screen.
    if (drag?.id === id) drag = null;
    else finish();
  });
}

/**
 * Whether drawing happens in full screen only: in Torn PDA, and Torn's phone
 * layout. There the toolbar above Notes covered Notes' own buttons, the
 * palette among them, leaving no way to put the tools away.
 */
function compact(): boolean {
  return inPda() || isMobileView();
}

/** Set when a drawing is opened on a phone, to go full screen once its canvas exists. */
let wantFull = false;

/** Opens a drawing for drawing on: with the toolbar above Notes, or full screen on a phone. */
function activate(id: string): void {
  if (active !== id && full) exitFull();
  if (active !== id) refit(id);
  active = id;
  toolsOpen = true;
  if (compact()) wantFull = true;
  undoStack = [];
  redoStack = [];
  setStatus("");
  syncToolbar();
}

/** Lets go of the open drawing, leaving the tools out for the next. */
function release(): void {
  if (full) exitFull();
  closePopups();
  active = null;
  undoStack = [];
  redoStack = [];
}

/** Lets go of the open drawing and puts the tools away. */
function deactivate(): void {
  release();
  toolsOpen = false;
  wantFull = false;
}

/** Returns the open drawing's canvas. */
function activeCanvas(): HTMLCanvasElement | null {
  return active ? (frames.get(active)?.canvas ?? null) : null;
}

/** Shows a short message on the toolbar. */
function setStatus(text: string): void {
  const status = document.querySelector(`#${TOOLBAR_ID} .doodle-status`);
  if (status) status.textContent = text;
}

/** Puts the open drawing on the clipboard as a PNG, ready to paste into chat. */
function copyPicture(): void {
  const canvas = activeCanvas();
  if (!canvas) return;
  // Torn PDA's web view will not let a page put a picture on the clipboard,
  // and copying one with its own menu copies the picture's address, which
  // for a drawing is the drawing itself as text, too long for chat. Its
  // share menu took nothing either. So there the drawing is uploaded, and
  // the short link copied instead.
  if (inPda() && canUpload()) {
    uploadAndCopy(canvas);
    return;
  }
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
    showPicture(canvas, inPda() ? "Press and hold to save" : undefined);
    return;
  }
  // The blob is handed over as a promise so the write still counts as part
  // of the click; Safari refuses a clipboard write made after an await.
  const png = new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("no image"))), "image/png"),
  );
  navigator.clipboard
    .write([new ClipboardItem({ "image/png": png })])
    .then(() => setStatus("Copied"))
    .catch((error: unknown) => {
      log("notes draw: copy failed", error);
      showPicture(canvas);
    });
}

/** Where the reader's yes to uploading is kept, so it is asked once. */
const UPLOAD_OK_KEY = "AND_UPLOAD_OK";

/** Whether the reader has agreed to drawings being uploaded. */
function uploadAgreed(): boolean {
  try {
    return localStorage.getItem(UPLOAD_OK_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Uploads the drawing to Pasteboard and copies its link, asking first the
 * first time: the drawing leaves the phone for a site of someone else's.
 */
function uploadAndCopy(canvas: HTMLCanvasElement): void {
  if (!uploadAgreed()) {
    askQuestion("Upload this Masterpiece to Pasteboard to share it in chat?", "Upload", () => {
      try {
        localStorage.setItem(UPLOAD_OK_KEY, "1");
      } catch {}
      uploadAndCopy(canvas);
    });
    return;
  }
  setStatus("Uploading");
  canvas.toBlob((png) => {
    if (!png) return;
    uploadPicture(png)
      .then(copyLink)
      .catch((error: unknown) => {
        log("notes draw: upload failed", error);
        setStatus("Upload failed");
      });
  }, "image/png");
}

/**
 * Copies a link as text, which PDA does allow. Should that be refused, as
 * it can be once the upload has taken a while, the link is shown with a
 * button that copies it on a fresh tap.
 */
function copyLink(link: string): void {
  const shown = () => {
    setStatus("");
    showLink(link);
  };
  if (!navigator.clipboard?.writeText) {
    shown();
    return;
  }
  navigator.clipboard
    .writeText(link)
    .then(() => setStatus("Link copied"))
    .catch(shown);
}

/** Shows a link with a button to copy it, for when it could not be copied straight away. */
function showLink(link: string): void {
  document.getElementById(CONFIRM_ID)?.remove();
  const panel = document.createElement("div");
  panel.id = CONFIRM_ID;
  const text = document.createElement("p");
  text.className = "doodle-link";
  text.textContent = link;
  const copy = toolButton("Copy", () => {
    void navigator.clipboard
      ?.writeText(link)
      .then(() => {
        panel.remove();
        setStatus("Link copied");
      })
      .catch(() => {});
  });
  copy.dataset.enter = "";
  const buttons = document.createElement("div");
  buttons.className = "doodle-row";
  buttons.append(copy, toolButton("Close", () => panel.remove()));
  panel.append(text, buttons);
  document.body.appendChild(panel);
  placeConfirm(panel);
}

/** Whether this is Torn PDA, whose web view carries its bridge to the app. */
function inPda(): boolean {
  return "flutter_inappwebview" in window;
}

/**
 * Shows the drawing as a plain picture over the page, to be pressed and held
 * and copied or saved with the device's own menu, under a line saying which.
 * A canvas offers no such menu; a picture does. A tap off it, or Escape, puts
 * it away.
 */
function showPicture(canvas: HTMLCanvasElement, words = "Press and hold to copy"): void {
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

/** Saves the open drawing as a PNG file. */
/** Saves the open drawing as a PNG file under a name. */
function downloadPicture(name: string): void {
  const canvas = activeCanvas();
  if (!canvas || !active) return;
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  // Characters Windows will not have in a file name go.
  const safe = name.replace(/[\\/:*?"<>|]+/g, "").trim();
  link.download = `${safe || "drawing"}.png`;
  link.click();
}

/**
 * Asks what to call the open drawing, and saves it once a name is given.
 *
 * Not in Torn PDA: its web view does nothing with a download a page starts,
 * so there the drawing is shown as a picture for the phone's own Save image.
 * The phone names that file itself, so no name is asked for.
 */
function askName(): void {
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
  const save = toolButton("Save", () => {
    const name = input.value.trim();
    if (!name) return;
    panel.remove();
    downloadPicture(name);
  });
  // A name is required: Save does nothing until there is one.
  const sync = () => {
    save.disabled = input.value.trim() === "";
  };
  input.addEventListener("input", sync);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") save.click();
  });
  sync();
  const buttons = document.createElement("div");
  buttons.className = "doodle-row";
  buttons.append(save, toolButton("Cancel", () => panel.remove()));
  panel.append(label, buttons);
  document.body.appendChild(panel);
  placeConfirm(panel);
  input.focus();
}

/** Steps the open drawing back one change, or forward again. */
function step(back: boolean): void {
  if (!active) return;
  const last = undoStack[undoStack.length - 1];
  if (back && last && !(last instanceof ImageData)) {
    undoStack.pop();
    undoEdit(last);
    return;
  }
  const canvas = activeCanvas();
  const context = canvas?.getContext("2d");
  if (!canvas || !context) return;
  const from: Step[] = back ? undoStack : redoStack;
  const state = from.pop();
  if (!(state instanceof ImageData)) return;
  const now = context.getImageData(0, 0, canvas.width, canvas.height);
  if (back) redoStack.push(now);
  else undoStack.push(now);
  // A state from before a change of shape is the old size; the canvas follows it.
  if (canvas.width !== state.width || canvas.height !== state.height) {
    canvas.width = state.width;
    canvas.height = state.height;
  }
  context.putImageData(state, 0, 0);
  storePicture(active, canvas);
}

/** Takes back a change this script made to the note's text, putting back exactly what was there. */
function undoEdit(edit: Exclude<Step, ImageData>): void {
  const body = noteBody();
  const block = body ? blockFor(edit.id) : null;
  if (!body || !block) return;
  const value = body.value;
  if (edit.kind === "created") {
    // The drawing's own lines, and the line breaks put either side of them,
    // as long as those are still there to take.
    const start = value.slice(block.start - edit.lead.length, block.start) === edit.lead
      ? block.start - edit.lead.length
      : block.start;
    const end = value.slice(block.end, block.end + edit.tail.length) === edit.tail
      ? block.end + edit.tail.length
      : Math.min(value.length, block.end + 1);
    release();
    replaceText(body, start, end, "");
    if (edit.before && blockFor(edit.before)) activate(edit.before);
    return;
  }
  replaceText(body, block.start, block.end, edit.oldText);
  const canvas = activeCanvas();
  const context = canvas?.getContext("2d");
  if (!canvas || !context || !active) return;
  canvas.width = edit.image.width;
  canvas.height = edit.image.height;
  context.putImageData(edit.image, 0, 0);
  storePicture(active, canvas);
  redoStack = [];
  syncToolbar();
}

/** Empties the open drawing. */
function clearPicture(): void {
  const canvas = activeCanvas();
  if (!canvas || !active) return;
  remember(canvas);
  blank(canvas);
  storePicture(active, canvas);
}

/** Changes the open drawing's shape, in the note and on the canvas. */
/**
 * Turns the open drawing a quarter turn clockwise. Landscape becomes portrait
 * and back, so its lines in the note are re-cut to the new shape; a square
 * stays a square. Undo turns it back, lines and all.
 */
function rotatePicture(): void {
  const body = noteBody();
  const block = active ? blockFor(active) : null;
  const canvas = activeCanvas();
  const context = canvas?.getContext("2d");
  if (!body || !block || !canvas || !context || !active) return;
  const turned: ShapeKey = block.shape === "l" ? "p" : block.shape === "p" ? "l" : "s";
  const oldText = body.value.slice(block.start, block.end);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);

  const copy = document.createElement("canvas");
  copy.width = canvas.width;
  copy.height = canvas.height;
  copy.getContext("2d")?.drawImage(canvas, 0, 0);
  canvas.width = copy.height;
  canvas.height = copy.width;
  // A quarter turn clockwise about the top left, then across by the new
  // width, so the old top left corner lands at the new top right.
  context.translate(canvas.width, 0);
  context.rotate(Math.PI / 2);
  context.drawImage(copy, 0, 0);
  context.setTransform(1, 0, 0, 1, 0, 0);

  if (turned !== block.shape || !block.named) {
    replaceText(body, block.start, block.end, blockText(active, turned, linesToReserve(body, turned)));
  }
  undoStack.push({ kind: "reshaped", id: active, oldText, image });
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  redoStack = [];
  // A drawing from before shapes had their own sizes is brought to its shape's size.
  reshape(canvas, turned);
  storePicture(active, canvas);
  syncToolbar();
}

function setShape(shape: ShapeKey): void {
  const body = noteBody();
  const block = active ? blockFor(active) : null;
  const canvas = activeCanvas();
  if (!body || !block || !canvas || !active) return;
  if (block.shape === shape && block.named) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  const oldText = body.value.slice(block.start, block.end);
  const newText = blockText(active, shape, linesToReserve(body, shape));
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  replaceText(body, block.start, block.end, newText);
  undoStack.push({ kind: "reshaped", id: active, oldText, image });
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  redoStack = [];
  if (reshape(canvas, shape)) storePicture(active, canvas);
  syncToolbar();
}

// ---- The toolbar, its pop-ups and the bin's confirmation ----

/** Returns a toolbar button: one of Torn's own for words, a plain one for an icon. */
function toolButton(label: string, onClick: () => void, className = "torn-btn doodle-btn"): HTMLButtonElement {
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

/** Returns a small drawing of a shape, for the shape button and its menu. */
function shapeIcon(shape: ShapeKey): HTMLElement {
  const box = document.createElement("span");
  box.className = `doodle-shape-icon doodle-shape-${shape}`;
  return box;
}

/** Closes any open pop-up on the toolbar. */
function closePopups(): void {
  for (const popup of document.querySelectorAll<HTMLElement>(`#${TOOLBAR_ID} .doodle-popup`)) {
    popup.hidden = true;
  }
}

/** Opens one of the toolbar's pop-ups, or closes it when it is already open. */
function togglePopup(name: string): void {
  const popup = document.querySelector<HTMLElement>(`#${TOOLBAR_ID} .doodle-popup[data-popup="${name}"]`);
  if (!popup) return;
  const opening = popup.hidden;
  closePopups();
  popup.hidden = !opening;
}

/** Returns a button with a pop-up that opens under it. */
function withPopup(name: string, button: HTMLButtonElement, popup: HTMLElement): HTMLElement {
  const holder = document.createElement("span");
  holder.className = "doodle-holder";
  popup.className = "doodle-popup";
  popup.dataset.popup = name;
  popup.hidden = true;
  button.addEventListener("click", () => togglePopup(name));
  holder.append(button, popup);
  return holder;
}

/** Brings the toolbar's buttons in line with the chosen colour, size, tool and shape. */
function syncToolbar(): void {
  const bar = document.getElementById(TOOLBAR_ID);
  if (!bar) return;
  const swatch = bar.querySelector<HTMLElement>(".doodle-colour");
  if (swatch) swatch.style.background = colour;
  const dot = bar.querySelector<HTMLElement>(".doodle-size span");
  // Scaled into the button: the largest brush is wider than the button is.
  const shownDot = 4 + ((size - SIZE_MIN) / (SIZE_MAX - SIZE_MIN)) * 14;
  if (dot) dot.style.width = dot.style.height = `${Math.round(shownDot)}px`;
  for (const button of bar.querySelectorAll<HTMLElement>("[data-tool]")) {
    button.classList.toggle(ON_CLASS, button.dataset.tool === tool);
  }
  const shape = (active ? blockFor(active)?.shape : null) ?? DEFAULT_SHAPE;
  const shapeButton = bar.querySelector(".doodle-shape");
  if (shapeButton && shapeButton.firstElementChild?.classList.contains(`doodle-shape-${shape}`) !== true) {
    shapeButton.replaceChildren(shapeIcon(shape));
  }
  for (const option of bar.querySelectorAll<HTMLElement>("[data-shape]")) {
    option.classList.toggle(ON_CLASS, option.dataset.shape === shape);
  }
  bar.classList.toggle("doodle-docked", full);
  bar.classList.toggle("doodle-docked-bottom", full && isMobileView());
}

/** The toolbar's icons on a 24-unit square: a path, or markup for one built from several shapes. */
const ICONS = {
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
  bin: "M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Zm4 2v8h1.5v-8H10Zm2.5 0v8H14v-8h-1.5Z",
  expand: "M3 3h7v2.5H6.8l4 4-1.8 1.8-4-4V11H2.5V3Zm18 0v8h-2.5V7.3l-4 4-1.8-1.8 4-4H13V3h8ZM3 21v-8h2.5v3.7l4-4 1.8 1.8-4 4H11V21H3Zm18 0h-8v-2.5h3.7l-4-4 1.8-1.8 4 4V13H21v8Z",
};

/** Returns an icon's markup. */
function svgIcon(path: string): string {
  // Most icons are one path; one drawn from several shapes comes as markup.
  const inner = path.startsWith("<") ? path : `<path d="${path}"/>`;
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">${inner}</svg>`;
}

/** Returns a toolbar button showing an icon, named for screen readers and on hover. */
function iconButton(
  label: string,
  path: string,
  onClick: () => void,
  className = "torn-btn doodle-btn doodle-icon-btn",
): HTMLButtonElement {
  const button = toolButton("", onClick, className);
  button.setAttribute("aria-label", label);
  button.title = label;
  button.innerHTML = svgIcon(path);
  return button;
}

/** Asks a yes or no question over Notes, running the yes when it is given. */
function askQuestion(words: string, yes: string, onYes: () => void): void {
  document.getElementById(CONFIRM_ID)?.remove();
  const panel = document.createElement("div");
  panel.id = CONFIRM_ID;
  const question = document.createElement("p");
  question.textContent = words;
  const confirm = toolButton(yes, () => {
    panel.remove();
    onYes();
  });
  // Enter answers yes; Escape is no, handled with the other keys.
  confirm.dataset.enter = "";
  const buttons = document.createElement("div");
  buttons.className = "doodle-row";
  buttons.append(confirm, toolButton("Cancel", () => panel.remove()));
  panel.append(question, buttons);
  document.body.appendChild(panel);
  placeConfirm(panel);
}

/** Asks whether to bin a drawing, the open one by default, and bins it on Confirm. */
function confirmBin(id: string | null = active): void {
  if (!id) return;
  askQuestion("Are you sure you want to bin this Masterpiece?", "Confirm", () => removeDrawing(id));
}

/**
 * Centres a question over the Notes window, where the drawing is,
 * or over the screen in full screen. Kept on screen when Notes sits at an edge.
 */
function placeConfirm(panel: HTMLElement): void {
  const notes = full ? null : document.querySelector(SELECTORS.panel);
  const area = notes?.getBoundingClientRect() ?? new DOMRect(0, 0, innerWidth, innerHeight);
  const left = Math.min(
    Math.max(4, area.left + area.width / 2 - panel.offsetWidth / 2),
    innerWidth - panel.offsetWidth - 4,
  );
  const top = Math.min(
    Math.max(4, area.top + area.height / 2 - panel.offsetHeight / 2),
    innerHeight - panel.offsetHeight - 4,
  );
  panel.style.setProperty("left", `${left}px`, "important");
  panel.style.setProperty("top", `${top}px`, "important");
}

/** Returns the toolbar, made on first use. */
function toolbar(): HTMLElement {
  let bar = document.getElementById(TOOLBAR_ID);
  if (bar) return bar;
  bar = document.createElement("div");
  bar.id = TOOLBAR_ID;
  // A press on a button would take the focus, and with it the note's caret,
  // which is where New puts a drawing. The size slider still takes it.
  bar.addEventListener("mousedown", (event) => {
    if (!(event.target instanceof Element && event.target.closest("input"))) event.preventDefault();
  });

  // Colour: one swatch, opening the full set.
  const colourButton = toolButton("", () => {}, "doodle-colour");
  colourButton.setAttribute("aria-label", "Colour");
  const grid = document.createElement("div");
  const cells = document.createElement("div");
  cells.className = "doodle-swatches";
  for (const value of SWATCHES) {
    const cell = toolButton("", () => {
      colour = value;
      if (tool === "eraser") tool = "pen";
      closePopups();
      syncToolbar();
    }, "doodle-swatch");
    cell.style.background = value;
    cell.setAttribute("aria-label", value);
    cells.appendChild(cell);
  }
  grid.appendChild(cells);

  // Size: a dot showing it, opening a slider.
  const sizeButton = toolButton("", () => {}, "doodle-size");
  sizeButton.setAttribute("aria-label", "Brush size");
  sizeButton.appendChild(document.createElement("span"));
  const slider = document.createElement("div");
  const range = document.createElement("input");
  range.type = "range";
  range.min = String(SIZE_MIN);
  range.max = String(SIZE_MAX);
  range.value = String(size);
  range.addEventListener("input", () => {
    size = Number(range.value);
    syncToolbar();
  });
  slider.appendChild(range);

  // Shape: the current one, opening all three.
  const shapeButton = toolButton("", () => {}, "doodle-shape");
  shapeButton.setAttribute("aria-label", "Shape");
  const shapes = document.createElement("div");
  for (const key of Object.keys(SHAPES) as ShapeKey[]) {
    const option = toolButton("", () => {
      closePopups();
      setShape(key);
    }, "doodle-shape-option");
    option.dataset.shape = key;
    option.setAttribute("aria-label", SHAPES[key].label);
    option.title = SHAPES[key].label;
    option.appendChild(shapeIcon(key));
    shapes.appendChild(option);
  }

  const toolFor = (label: string, icon: string, value: Tool) => {
    const button = iconButton(label, icon, () => {
      tool = value;
      syncToolbar();
    });
    button.dataset.tool = value;
    return button;
  };

  const status = document.createElement("span");
  status.className = "doodle-status";

  // Two set rows, not one that wraps where it happens to: the drawing tools
  // on top, and what is done with the drawing underneath.
  const tools = document.createElement("div");
  tools.className = "doodle-row";
  // Undo and Redo sit at the top right, Rotate and the shape at the bottom
  // right; the first of each pair carries the push that sends it there.
  const undo = iconButton("Undo", ICONS.undo, () => step(true));
  undo.classList.add("doodle-push");
  tools.append(
    withPopup("colour", colourButton, grid),
    withPopup("size", sizeButton, slider),
    toolFor("Pen", ICONS.pen, "pen"),
    toolFor("Eraser", ICONS.eraser, "eraser"),
    toolFor("Paint bucket", ICONS.bucket, "bucket"),
    iconButton("Clear", ICONS.sweep, clearPicture),
    undo,
    iconButton("Redo", ICONS.redo, () => step(false)),
  );
  const rotate = iconButton("Rotate", ICONS.rotate, rotatePicture);
  rotate.classList.add("doodle-push");
  const shapeHolder = withPopup("shape", shapeButton, shapes);
  shapeHolder.classList.add("doodle-popup-right");
  const actions = document.createElement("div");
  actions.className = "doodle-row";
  actions.append(
    iconButton("New drawing", ICONS.newPage, newDrawing),
    iconButton("Copy", ICONS.copy, copyPicture),
    iconButton("Save", ICONS.download, askName),
    iconButton("Bin", ICONS.bin, () => confirmBin()),
    status,
    rotate,
    shapeHolder,
  );
  bar.append(tools, actions);
  document.body.appendChild(bar);
  syncToolbar();
  return bar;
}

// ---- Full screen ----

/** Opens the drawing over the whole screen, with the tools down the side or along the bottom. */
function enterFull(): void {
  const canvas = activeCanvas();
  if (!canvas || full) return;
  full = true;
  closePopups();
  const cover = document.createElement("div");
  cover.id = FULL_ID;
  const stage = document.createElement("div");
  stage.className = "doodle-stage";
  // The way back sits just off the drawing's top right corner, the same
  // symbol that brought it here.
  const back = iconButton("Exit full screen", ICONS.expand, leaveFull, "doodle-full-exit");
  stage.append(canvas, back);
  const bar = toolbar();
  bar.hidden = false;
  cover.append(bar, stage);
  document.body.appendChild(cover);
  syncToolbar();
  fitFull();
}

/** Leaves full screen as the reader asked to, which on a phone puts the tools away too. */
function leaveFull(): void {
  exitFull();
  if (compact()) deactivate();
}

/** Puts the drawing back in its note. */
function exitFull(): void {
  if (!full) return;
  full = false;
  const frame = active ? frames.get(active) : null;
  if (frame) {
    // The full-screen size goes, or the canvas spills out of its frame.
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

/** The gap between the drawing and its tools, and round the edge of the screen. */
const FULL_GAP = 12;
const FULL_MARGIN = 16;
/** The exit button's width beside the drawing, and the gap to it. */
const EXIT_ROOM = 34;

/**
 * Sizes the full-screen drawing to fit beside its tools, keeping its shape.
 *
 * The two are centred together as one group, so the tools sit against the
 * drawing rather than out at the edge of the screen.
 */
function fitFull(): void {
  const canvas = activeCanvas();
  const bar = document.getElementById(TOOLBAR_ID);
  if (!canvas || !bar) return;
  const below = isMobileView();
  // Room is kept on the right for the exit button off the drawing's corner.
  const roomWidth = innerWidth - FULL_MARGIN * 2 - EXIT_ROOM - (below ? 0 : bar.offsetWidth + FULL_GAP);
  const roomHeight = innerHeight - FULL_MARGIN * 2 - (below ? bar.offsetHeight + FULL_GAP : 0);
  const ratio = canvas.width / canvas.height;
  let width = Math.max(50, roomWidth);
  let height = width / ratio;
  if (height > roomHeight) {
    height = Math.max(50, roomHeight);
    width = height * ratio;
  }
  setStyle(canvas, "width", `${Math.floor(width)}px`);
  setStyle(canvas, "height", `${Math.floor(height)}px`);
}

// ---- The palette icon ----

/** Returns the palette-and-brush icon for the Notes header. */
function buildIcon(): HTMLElement {
  // A span, not a button: the header is a button already, and one may not
  // hold another.
  const icon = document.createElement("span");
  icon.id = ICON_ID;
  icon.setAttribute("role", "button");
  icon.setAttribute("aria-label", "Draw");
  icon.tabIndex = 0;
  // A palette with a brush laid across it. The paint is borrowed from the
  // minimise icon beside it, so it wears the same gradient as Torn's own.
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
  // The header collapses Notes on a click, so none of ours may reach it.
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
    icon.addEventListener(type, (event) => event.stopPropagation());
  }
  const toggle = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    if (toolsOpen) deactivate();
    // On a phone the tools only exist in full screen, so the palette starts a drawing there.
    else if (compact()) newDrawing();
    else toolsOpen = true;
  };
  icon.addEventListener("click", toggle);
  icon.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") toggle(event);
  });
  return icon;
}

/** Keeps the palette icon in the Notes header, before minimise. */
function placeIcon(): void {
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

// ---- Laying the frames over the note ----

/** Returns the layer the frames sit in, made on first use. */
function layer(): HTMLElement {
  let element = document.getElementById(LAYER_ID);
  if (!element) {
    element = document.createElement("div");
    element.id = LAYER_ID;
    document.body.appendChild(element);
  }
  return element;
}

/**
 * Sets an inline style only when it differs.
 *
 * This runs every animation frame, and an unchanged write still wakes every
 * mutation observer watching the page for style changes.
 */
function setStyle(element: HTMLElement, name: "left" | "top" | "width" | "height" | "transform", value: string): void {
  if (element.style[name] !== value) element.style[name] = value;
}

/** Shows or hides an element, touching it only when that changes. */
function setHidden(element: HTMLElement, hidden: boolean): void {
  if (element.hidden !== hidden) element.hidden = hidden;
}

/** Hides the frames and the toolbar. */
function hideAll(): void {
  const element = document.getElementById(LAYER_ID);
  if (element) setHidden(element, true);
  const bar = document.getElementById(TOOLBAR_ID);
  if (bar && !full) setHidden(bar, true);
}

/** Returns the box that scrolls the note: the textarea, or a wrapper round it. */
function scrollerOf(body: HTMLTextAreaElement): HTMLElement {
  for (let element: HTMLElement | null = body; element; element = element.parentElement) {
    const { overflowY } = getComputedStyle(element);
    if (/auto|scroll/.test(overflowY) && element.scrollHeight > element.clientHeight + 1) return element;
    if (element.matches(SELECTORS.panel)) break;
  }
  return body;
}

/** A box on screen. */
interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Returns the part of the note body that can be seen.
 *
 * Torn scrolls a wrapper round the title and the body, not the body alone,
 * so the body runs on under the note picker above it; every box between the
 * body and the Notes window that cuts off its contents cuts the frames too.
 *
 * The body's own edges are not among them. Its bottom moves with its text,
 * and cut short a drawing made taller before the textarea caught up; its
 * sides cut off the glow round a drawing, which sits right at its edge.
 */
function visibleBox(body: HTMLTextAreaElement): Box {
  const box: Box = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
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

/**
 * Returns where the note picker's list is, while it is open over the body.
 *
 * Asked of the page by what is on top at the list's own middle, since the
 * list stays in the page when shut and how Torn hides it is its own
 * business. This script's frames are skipped, as they sit over everything.
 */
function openList(): DOMRect | null {
  const list = document.querySelector<HTMLElement>(SELECTORS.noteList);
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

/**
 * Cuts the open note list out of the frame layer, so the list shows over the frames.
 *
 * The layer has to sit above Torn's chat windows to be seen at all, which
 * also puts it above the list; cutting a hole is how it goes behind.
 */
function cutOutList(container: HTMLElement, box: Box): void {
  const list = openList();
  let clip = "";
  if (list) {
    const width = box.right - box.left;
    const height = box.bottom - box.top;
    const x = list.left - box.left;
    const y = list.top - box.top;
    clip = `path(evenodd, "M0 0H${width}V${height}H0Z M${x} ${y}H${x + list.width}V${y + list.height}H${x}Z")`;
  }
  // Compared by a copy kept on the side: browsers rewrite clip-path text when read back.
  if (container.dataset.clip === clip) return;
  container.dataset.clip = clip;
  container.style.clipPath = clip;
}

/**
 * Makes the note's textarea tall enough for its text.
 *
 * Torn sizes it to its text and hides anything past that, so it never
 * scrolls itself. It does that when a note loads, not after this script
 * adds lines, which left the end of a note out of reach: the wheel did
 * nothing over the text, and only worked over a drawing. Only ever grown,
 * and only when the text has outrun it; Torn's own sizing takes over again
 * the next time it runs.
 */
function growToFit(body: HTMLTextAreaElement): boolean {
  if (body.scrollHeight <= body.clientHeight + 1) return false;
  if (getComputedStyle(body).overflowY !== "hidden") return false;
  const borders = body.offsetHeight - body.clientHeight;
  body.style.height = `${body.scrollHeight + borders}px`;
  return true;
}

/** Where the note was scrolled to at the last frame. */
let keptScroll = 0;

/**
 * Scrolls the note to a drawing just made, once its frame is in place.
 *
 * Tried for a few frames, as the textarea may only grow to hold the new
 * lines a frame later, and until then there is nowhere to scroll to.
 */
function scrollToNew(container: HTMLElement): void {
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
    // Its bottom into view, without pushing its top out of it.
    scroller.scrollTop += Math.min(place.bottom - seen.bottom + 8, place.top - seen.top - 8);
  } else focusOn = null;
  keptScroll = scroller.scrollTop;
}

/** Shows where a dragged drawing will land, as a line across the note, or hides it. */
function placeDropLine(container: HTMLElement, spot: Spot | null, x: number, y: number, width: number): void {
  let line = container.querySelector<HTMLElement>(".doodle-drop");
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

/** Why the frames were last hidden, so each reason is logged once. */
let hiddenFor = "";

/** Lays the frames over their markers and the toolbar over Notes, once a frame. */
function sync(): void {
  placeIcon();
  if (full) fitFull();
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

  // Torn shrinking the textarea back to its own idea of the text's height
  // pulls the note's scroll up to the top before it is grown again here, so
  // the place the reader was at is put back.
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
  const shown = new Set<string>();
  for (const block of blocks) {
    shown.add(block.id);
    const shape = SHAPES[block.shape];
    const ratio = shape.width / shape.height;
    // As tall as the lines it covers, and no wider than the note: a note made
    // narrower since shrinks it, leaving a gap until it is next opened.
    let height = Math.min(block.lines * lineHeight, space.height);
    let width = height * ratio;
    if (width > space.width) {
      width = space.width;
      height = width / ratio;
    }
    const { element, canvas } = frameFor(block, container);
    if (reshape(canvas, block.shape)) storePicture(block.id, canvas);
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
  // A drawing whose marker was deleted, or is in another note, is put away.
  if (active && !shown.has(active)) release();
  scrollToNew(container);
  if (wantFull && active && activeCanvas()) {
    wantFull = false;
    enterFull();
  }
  // On a phone the tools have nowhere to be but full screen; with nothing
  // open there (it was binned, or its making undone), they go away.
  if (compact() && toolsOpen && !active && !full) deactivate();

  const bar = toolbar();
  // In full screen the toolbar always shows. It is the same one that sits
  // above Notes, which on a phone is kept hidden, and it went into full
  // screen still hidden, leaving no tools at all.
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

// ---- Keeping the text round a drawing whole ----

/**
 * Keeps the caret out of a drawing's lines, where typing would go under it.
 *
 * Coming from below it is put at the drawing's start, and from anywhere else
 * after it, so the arrow keys still step over one in both directions. Two
 * spots at a drawing's edge are let be, as typeAtDrawing makes typing there
 * safe: the very start of its marker line, and its very end when nothing
 * follows it. A click beside a drawing piled straight on top of another
 * lands on the second one's start, which is where a new line between the two
 * gets made.
 */
function keepCaretOut(body: HTMLTextAreaElement): void {
  if (body.selectionStart !== body.selectionEnd) return;
  const caret = body.selectionStart;
  const length = body.value.length;
  for (const { start, end } of measure(body).blocks) {
    const inside = caret > start && (caret < end || (caret === end && end < length));
    if (!inside) continue;
    const target = lastCaret > end ? start : Math.min(length, end + 1);
    body.setSelectionRange(target, target);
    lastCaret = target;
    return;
  }
  lastCaret = caret;
}

/**
 * Makes typing at a drawing's edge open a line of its own, rather than run
 * into the drawing's text and break it.
 *
 * At the start of its marker line, a character goes on a new line above it;
 * Enter there already pushes the drawing down. At its end, with nothing
 * after it, the character or Enter goes on a new line below. Returns whether
 * the key was used.
 */
function typeAtDrawing(body: HTMLTextAreaElement, key: string): boolean {
  if (body.selectionStart !== body.selectionEnd) return false;
  const caret = body.selectionStart;
  for (const block of measure(body).blocks) {
    if (caret === block.start) {
      if (key === "Enter") return false;
      replaceText(body, caret, caret, `${key}\n`);
      body.setSelectionRange(caret + key.length, caret + key.length);
      return true;
    }
    if (caret === block.end && block.end === body.value.length) {
      replaceText(body, caret, caret, key === "Enter" ? "\n\n" : `\n${key}`);
      return true;
    }
  }
  return false;
}

/** How long a drawing stays marked for a second Backspace to delete it. */
const ARM_MS = 3000;
/** The drawing one more Backspace will delete, and until when. */
let armed: { id: string; until: number } | null = null;
/**
 * Whether the reader is working on the open drawing rather than the text:
 * their last press was on the drawing or its tools. The textarea keeps focus
 * either way, as pressing the canvas does not take it.
 */
let onDrawing = false;

/**
 * Handles Backspace and Delete where they reach a drawing.
 *
 * Left alone, each press would take one of its blank lines and shrink it.
 * Backspace marks the drawing first and deletes it on a second press, so
 * one press too many while typing does not lose it; Delete asks, as the
 * bin does. Returns whether the key was used.
 */
function keyAtDrawing(body: HTMLTextAreaElement, key: string): boolean {
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
      // Joining the marker onto the line above would break the drawing. An
      // empty line above is taken away instead; text above, the caret just
      // steps up onto the end of it.
      const above = body.value.lastIndexOf("\n", caret - 2) + 1;
      if (above === caret - 1) replaceText(body, caret - 1, caret, "");
      else body.setSelectionRange(caret - 1, caret - 1);
      return true;
    }
  }
  return false;
}

/** Adds a drawing tool to the chat bar's Notes. */
export function installDoodles(): void {
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
      // While a question is up, Escape closes it and Enter gives the answer it
      // marks, wherever the focus is: with the bin's question asked from the
      // note's text, the caret is still in the note.
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
      const answer = question?.querySelector<HTMLButtonElement>("[data-enter]");
      if (answer && event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        answer.click();
        return;
      }
      // Typing in a box of this script's own is that box's business.
      if (
        event.key !== "Escape" &&
        event.target instanceof Element &&
        event.target.closest(`#${CONFIRM_ID}`)
      ) {
        return;
      }
      const body = noteBody();
      const erase = event.key === "Backspace" || event.key === "Delete";
      if (!erase) armed = null;
      if (erase && active && onDrawing) {
        // Working on the drawing: Backspace leaves it be, Delete is the bin.
        event.preventDefault();
        if (event.key === "Delete") confirmBin(active);
        return;
      }
      if (body && event.target === body && erase) {
        if (keyAtDrawing(body, event.key)) event.preventDefault();
        else armed = null;
        return;
      }
      const typing =
        !event.ctrlKey && !event.metaKey && !event.altKey && (event.key === "Enter" || event.key.length === 1);
      if (body && event.target === body && typing && !event.isComposing) {
        if (typeAtDrawing(body, event.key)) event.preventDefault();
        return;
      }
      if (event.key === "Escape" && active) {
        if (document.getElementById(CONFIRM_ID)) document.getElementById(CONFIRM_ID)?.remove();
        else if (full) leaveFull();
        else deactivate();
        return;
      }
      // While a drawing is open, Ctrl+Z and Ctrl+Shift+Z (or Ctrl+Y) are its
      // undo and redo, ahead of the note's own.
      const mod = event.ctrlKey || event.metaKey;
      if (!active || !mod) return;
      const key = event.key.toLowerCase();
      if (key === "z" || key === "y") {
        event.preventDefault();
        event.stopPropagation();
        step(key === "z" && !event.shiftKey);
      }
    },
    true,
  );

  // A press anywhere off the toolbar closes its pop-ups, and says whether the
  // reader has gone back to the text or is still on the drawing.
  document.addEventListener(
    "pointerdown",
    (event) => {
      armed = null;
      const target = event.target instanceof Element ? event.target : null;
      onDrawing = !!target?.closest(
        `#${TOOLBAR_ID}, #${LAYER_ID}, #${FULL_ID}, #${CONFIRM_ID}, #${PICTURE_ID}, #${ICON_ID}`,
      );
      if (target?.closest(`#${TOOLBAR_ID}`)) return;
      closePopups();
    },
    true,
  );
}
