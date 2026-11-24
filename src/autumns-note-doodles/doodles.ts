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

import { hashedClass } from "../shared/hashedClass";
import { colourPicker, keepRecent, recentColours, rgbOf, watchRecent } from "./colours";
import { log } from "./debug";
import {
  anchorsOf,
  defaultGradient,
  gradientCss,
  gradientEditor,
  gradientPixels,
  gradientStyle,
  keepGradient,
} from "./gradient";
import {
  BLENDS,
  type Blend,
  blendIcon,
  composite,
  type Doc,
  type Layer,
  type LayerProps,
  MAX_LAYERS,
  newDoc,
  newLayer,
  propsOf,
  stack,
} from "./layers";
import { isMobileView, readDrawing, type StoredDrawing, writeDrawing } from "./storage";
import {
  caretAt,
  drawText,
  fontOf,
  FONTS,
  LINE_HEIGHT,
  measureText,
  middleOfText,
  textCorners,
  type TextLook,
  type TextSpec,
} from "./text";
import { canUpload, uploadPicture } from "./upload";

// Every selector this feature matches on, from the live Notes window.
const SELECTORS = {
  panel: "#notes_panel",
  // The header is itself a button: icon, "Notes", minimise, maximise.
  header: "#notes_panel > button",
  minimize: hashedClass("minimizeIcon"),
  body: "#notes_panel textarea",
  // The note picker's drop-down, which opens over the body.
  noteList: `#notes_panel ${hashedClass("list")}`,
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
/** Opacity in percent: the slider's lowest, so a stroke never vanishes outright. */
const OPACITY_MIN = 5;
/**
 * The sliders' marker: its colour, and its width in pixels. The width must
 * match .doodle-range's thumb in styles.ts, as the brush preview is placed
 * over it by sum.
 */
const MARKER_BLUE: [number, number, number] = [0, 117, 255];
const THUMB_SIZE = 18;
/** The sliders' width, and the room either side for the largest brush's ring to overhang. */
const SLIDER_WIDTH = 140;
const SLIDER_PAD = 6;
/** How near the marker's blue a colour may be before the brush preview turns black to stay seen. */
const NEAR_MARKER = 110;
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

type Tool = "pen" | "eraser" | "bucket" | "lasso" | "move" | "text";

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

/** One frame on the page: the canvas showing the drawing, and the layers it is stacked from. */
interface Frame {
  element: HTMLElement;
  canvas: HTMLCanvasElement;
  doc: Doc;
}

const frames = new Map<string, Frame>();
/** The drawing being drawn on, if any. */
let active: string | null = null;
/** Whether the open drawing fills the screen. */
let full = false;
let colour = "#000000";
let size = SIZE_DEFAULT;
/** How solid the pen, eraser and bucket lay down their colour, from 0 to 1. */
let opacity = 1;
/** How hard the brush edge is, from 0 (soft) to 1 (hard). */
let hardness = 1;
/** How much strokes are tidied: 0 as drawn, 1 medium, 2 high. */
let smoothing = 0;
/** The brush's tip: round, pointed at both ends, or square. */
type Tip = "round" | "taper" | "square";
let tip: Tip = "round";
/** How the lasso selects: drawn freehand, dragged out as a box, or tapped out point by point in straight lines. */
type LassoMode = "free" | "rect" | "polygon";
let lassoMode: LassoMode = "free";
/** The corners tapped so far of a straight line selection under way. */
let polygon: Point[] | null = null;
/** Where the last pen or eraser stroke ended, so a Shift press can join a straight line to it. */
let lastEnd: { id: string; at: Point } | null = null;
let tool: Tool = "pen";
/** Whether the pen and bucket lay down the gradient rather than the colour. */
let useGradient = false;
const gradient = defaultGradient();
/** Set while the next press on the drawing draws a path for the gradient to follow, rather than paint. */
let drawingPath = false;
/** Redraws the gradient editor, once the colour pop-up has made it. */
let refreshGradient: () => void = () => {};
/** Whether the bucket finds its area on every layer stacked together, rather than the one drawn on. */
let bucketReadsAll = false;

/** A layer as it was: which one, and its settings then. */
interface KeptLayer {
  layer: Layer;
  props: LayerProps;
}

/**
 * How the open drawing's layers were before a change: their order and
 * settings, the background, the layer drawn on, and the pixels of the layers
 * the change was to touch. Layers are held by reference, so a deleted one
 * comes back whole; only pixels that change are copied.
 */
interface DocState {
  kind: "doc";
  layers: KeptLayer[];
  background: string | null;
  current: Layer;
  pixels: { layer: Layer; image: ImageData }[];
  /** The selection's outline then, so undo and redo bring it back too. */
  selection: Outline;
}

/** A selection's outline, without any pixels lifted in it, or null for none. */
type Outline = { path: { x: number; y: number }[]; split?: number } | null;

/**
 * One step back. How the layers looked; or a change to the note's text,
 * taken back exactly so no line it added is left behind: the making of a
 * drawing, with the line breaks put either side of it (back to the drawing
 * open before), or a change of its shape (with its old lines and every
 * layer's pixels).
 *
 * The drawing is found by its id when the step is undone, not by where it
 * was or what its lines said: typing above it moves it, and opening it again
 * in a resized Notes re-cuts its lines.
 */
type Step =
  | DocState
  | { kind: "created"; id: string; lead: string; tail: string; before: string | null }
  | {
    kind: "reshaped";
    id: string;
    oldText: string;
    images: { layer: Layer; image: ImageData }[];
    /** Text layers' words and look, which a quarter turn moves. */
    texts?: { layer: Layer; text: TextSpec }[];
  };
let undoStack: Step[] = [];
let redoStack: DocState[] = [];
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

/** Drawings waiting to be saved, and the save under way, one after another. */
const unsaved = new Set<string>();
let saving: Promise<void> = Promise.resolve();

/**
 * Keeps a drawing in this browser, after marking which layers' pixels have
 * changed, and redraws their thumbnails. Only those are encoded again; the
 * rest keep the PNG they were last saved as. Says so under the drawing when
 * the browser will not keep it.
 */
function save(id: string, ...changed: Layer[]): void {
  for (const layer of changed) layer.dirty = true;
  refreshThumbs(changed);
  unsaved.add(id);
  saving = saving.then(async () => {
    if (!unsaved.delete(id)) return;
    const doc = frames.get(id)?.doc;
    if (!doc) return;
    const layers = doc.layers.slice();
    for (const layer of layers) {
      if (!layer.dirty && layer.png) continue;
      // Cleared first: a stroke that lands while this one encodes marks it again.
      layer.dirty = false;
      layer.png = await new Promise<Blob | null>((resolve) => layer.canvas.toBlob(resolve, "image/png"));
    }
    const record: StoredDrawing = {
      version: 2,
      background: doc.background,
      layers: layers.flatMap((layer) => (layer.png ? [{ ...propsOf(layer), png: layer.png }] : [])),
      current: Math.max(0, layers.indexOf(doc.current)),
      next: doc.next,
    };
    if (!(await writeDrawing(id, record))) setStatus("Not saved: browser storage is full");
  });
}

/** Redraws the open drawing from its layers. */
function render(id = active): void {
  const frame = id ? frames.get(id) : null;
  if (!frame) return;
  composite(frame.canvas, frame.doc);
  // With no background the drawing is see-through, shown as a chequerboard.
  frame.canvas.classList.toggle("doodle-see-through", frame.doc.background === null);
}

/** Gives a canvas a size, keeping what is on it at the top left, the new part see-through. */
function resize(canvas: HTMLCanvasElement, width: number, height: number): void {
  if (canvas.width === width && canvas.height === height) return;
  const copy = copyOf(canvas, true);
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.drawImage(copy, 0, 0);
}

/** Gives a drawing and each of its layers a shape's size. Returns whether it had to change. */
function fitShape(frame: Frame, shape: ShapeKey): boolean {
  const { width, height } = SHAPES[shape];
  if (frame.canvas.width === width && frame.canvas.height === height) return false;
  frame.canvas.width = width;
  frame.canvas.height = height;
  for (const layer of frame.doc.layers) resize(layer.canvas, width, height);
  composite(frame.canvas, frame.doc);
  return true;
}

/** Returns a picture blob as a loaded image, or null when it will not load. */
function loadImage(picture: Blob): Promise<HTMLImageElement | null> {
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

/**
 * Fills a frame's layers from storage. A drawing from before layers becomes
 * Layer 1 over the white background, its own white kept, so it looks as it
 * did; its pictures were made at their own size, so none is stretched.
 */
async function loadDoc(id: string, frame: Frame): Promise<void> {
  const stored = await readDrawing(id);
  if (!stored) return;
  const { width, height } = frame.canvas;
  if (stored instanceof Blob) {
    const image = await loadImage(stored);
    const layer = frame.doc.layers[0];
    if (!image || !layer) return;
    layer.canvas.getContext("2d")?.drawImage(image, 0, 0);
    render(id);
    return;
  }
  const layers: Layer[] = [];
  for (const kept of stored.layers) {
    const image = await loadImage(kept.png);
    const layer = newLayer(kept.name, image?.width ?? width, image?.height ?? height);
    Object.assign(layer, { ...kept, text: kept.text ?? null, png: kept.png, dirty: false });
    if (image) layer.canvas.getContext("2d")?.drawImage(image, 0, 0);
    layers.push(layer);
  }
  const first = layers[0];
  if (!first) return;
  for (const layer of layers) resize(layer.canvas, width, height);
  frame.doc.background = stored.background;
  frame.doc.layers = layers;
  frame.doc.current = layers[stored.current] ?? first;
  frame.doc.next = stored.next;
  render(id);
  if (id === active) refreshLayers();
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
  layer.appendChild(element);

  wireCanvas(block.id, element, canvas);
  const frame = { element, canvas, doc };
  frames.set(block.id, frame);
  void loadDoc(block.id, frame);
  return frame;
}

/**
 * What a fill lays down: one colour, or a colour for every pixel (a
 * gradient, four bytes a pixel, laid over the canvas being filled).
 */
type Paint = { solid: [number, number, number] } | { pixels: Uint8ClampedArray };

/** Returns the colour and strength (0 to 1) a paint lays on one pixel. */
function paintAt(paint: Paint, pixel: number): [number, number, number, number] {
  if ("solid" in paint) return [...paint.solid, 1];
  const i = pixel * 4;
  return [paint.pixels[i] ?? 0, paint.pixels[i + 1] ?? 0, paint.pixels[i + 2] ?? 0, (paint.pixels[i + 3] ?? 0) / 255];
}

/** Lays a colour over a pixel at a strength, as paint over what is there. */
function layOver(data: Uint8ClampedArray, i: number, [r, g, b]: number[], strength: number): void {
  const under = (data[i + 3] ?? 0) / 255;
  const alpha = strength + under * (1 - strength);
  if (alpha <= 0) return;
  const mix = (paint: number, there: number) => (paint * strength + there * under * (1 - strength)) / alpha;
  data[i] = mix(r ?? 0, data[i] ?? 0);
  data[i + 1] = mix(g ?? 0, data[i + 1] ?? 0);
  data[i + 2] = mix(b ?? 0, data[i + 2] ?? 0);
  data[i + 3] = alpha * 255;
}

/** Slips a colour in under a pixel at a strength, showing only where the pixel is see-through. */
function layUnder(data: Uint8ClampedArray, i: number, [r, g, b]: number[], strength: number): void {
  const over = (data[i + 3] ?? 0) / 255;
  const alpha = over + strength * (1 - over);
  if (alpha <= 0) return;
  const mix = (paint: number, there: number) => (there * over + paint * strength * (1 - over)) / alpha;
  data[i] = mix(r ?? 0, data[i] ?? 0);
  data[i + 1] = mix(g ?? 0, data[i + 1] ?? 0);
  data[i + 2] = mix(b ?? 0, data[i + 2] ?? 0);
  data[i + 3] = alpha * 255;
}

/**
 * Fills the area of like colour around a point, laid over it at an opacity,
 * kept to the pixels a mask allows when one is given. The area is found on
 * the canvas itself, or on a picture given as source (every layer stacked
 * together), while the paint always goes on the canvas.
 */
function floodFill(
  canvas: HTMLCanvasElement,
  startX: number,
  startY: number,
  paint: Paint,
  alpha: number,
  mask: Uint8Array | null = null,
  source: Uint8ClampedArray | null = null,
): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  const { width, height } = canvas;
  const x0 = Math.floor(startX);
  const y0 = Math.floor(startY);
  if (x0 < 0 || y0 < 0 || x0 >= width || y0 >= height) return;
  if (mask && !mask[y0 * width + x0]) return;
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;
  // Read from a copy, so the paint going down does not change what counts as like.
  const read = source ?? data.slice();
  const at = (y0 * width + x0) * 4;
  const target = [read[at] ?? 0, read[at + 1] ?? 0, read[at + 2] ?? 0, read[at + 3] ?? 0];
  const like = (pixel: number) => {
    if (mask && !mask[pixel]) return false;
    const i = pixel * 4;
    return (
      Math.abs((read[i] ?? 0) - (target[0] ?? 0)) +
        Math.abs((read[i + 1] ?? 0) - (target[1] ?? 0)) +
        Math.abs((read[i + 2] ?? 0) - (target[2] ?? 0)) +
        Math.abs((read[i + 3] ?? 0) - (target[3] ?? 0)) <=
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
      const [r, g, b, strength] = paintAt(paint, pixel);
      layOver(data, pixel * 4, [r, g, b], strength * alpha);
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
  blendEdges(data, read, done, width, height, target, paint, alpha, mask);
  context.putImageData(image, 0, 0);
}

/** How far out from a fill its soft edges are looked for, in canvas pixels. */
const EDGE_REACH = 2;

/**
 * Carries a fill into the soft edge round it.
 *
 * Lines are drawn smoothed, so each has a rim of pixels that are part line,
 * part what was under it. The fill stops short of them, being too far from
 * the colour clicked on, and left them a pale ring. Each rim pixel is read
 * as a mix of the old colour and the strongest line colour beside it, and
 * the fill goes in for the old colour's share: swapped in for it where the
 * pixel is solid, so the line softens into the fill instead; slipped in
 * under it where it is see-through, as on a layer of its own over the line.
 */
function blendEdges(
  data: Uint8ClampedArray,
  read: Uint8ClampedArray,
  filled: Uint8Array,
  width: number,
  height: number,
  old: number[],
  paint: Paint,
  alpha: number,
  mask: Uint8Array | null,
): void {
  const away = (i: number) =>
    Math.hypot(
      (read[i] ?? 0) - (old[0] ?? 0),
      (read[i + 1] ?? 0) - (old[1] ?? 0),
      (read[i + 2] ?? 0) - (old[2] ?? 0),
      (read[i + 3] ?? 0) - (old[3] ?? 0),
    );
  const swapped = data.slice();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      if (filled[pixel] || (mask && !mask[pixel])) continue;
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

/** Returns what the fill lays down: the gradient across the drawing, or the colour. */
function fillPaint(target: Target): Paint {
  if (!useGradient) return { solid: rgbOf(colour) };
  // Spread over the whole drawing, even when the target is a lifted piece of it.
  const shown = activeCanvas() ?? target.canvas;
  const { width, height } = target.canvas;
  return { pixels: gradientPixels(gradient, width, height, shown.width, shown.height, -target.x, -target.y) };
}

// ---- Undo ----

/** Returns the open drawing's layers as they are now, with the pixels of the layers given. */
function snapshot(doc: Doc, pixels: Layer[]): DocState {
  return {
    kind: "doc",
    layers: doc.layers.map((layer) => ({ layer, props: propsOf(layer) })),
    background: doc.background,
    current: doc.current,
    pixels: pixels.map((layer) => ({
      layer,
      image: layer.canvas.getContext("2d")?.getImageData(0, 0, layer.canvas.width, layer.canvas.height) ??
        new ImageData(1, 1),
    })),
    selection: outlineNow(),
  };
}

/** Returns a copy of the selection's outline as it is now. */
function outlineNow(): Outline {
  if (!selection) return null;
  const path = selection.path.map((p) => ({ ...p }));
  return selection.split ? { path, split: selection.split } : { path };
}

/**
 * Makes a change of selection one undo step: called once it is made, with
 * the outline from before it. Nothing selected before or after is no change.
 */
function rememberOutline(before: Outline): void {
  if (!before && !selection) return;
  remember([]);
  const last = undoStack[undoStack.length - 1];
  if (last?.kind === "doc") last.selection = before;
}

/** Puts the open drawing's layers back as a snapshot had them. */
function restore(doc: Doc, state: DocState): void {
  // The text is copied again, so editing it later does not change the step kept for redo.
  doc.layers = state.layers.map(({ layer, props }) =>
    Object.assign(layer, { ...props, text: props.text ? { ...props.text } : null }),
  );
  doc.background = state.background;
  doc.current = doc.layers.includes(state.current) ? state.current : (doc.layers[doc.layers.length - 1] ?? state.current);
  for (const { layer, image } of state.pixels) {
    // A state from before a change of shape is the old size; the layer follows it.
    if (layer.canvas.width !== image.width || layer.canvas.height !== image.height) {
      layer.canvas.width = image.width;
      layer.canvas.height = image.height;
    }
    layer.canvas.getContext("2d")?.putImageData(image, 0, 0);
  }
  // A text layer's pixels come from its words, which the step may have changed.
  for (const layer of doc.layers) if (layer.text) drawText(layer.canvas, layer.text);
  const kept = state.selection;
  selection = kept ? { path: kept.path.map((p) => ({ ...p })), float: null } : null;
  if (selection && kept?.split) selection.split = kept.split;
  lassoing = null;
  polygon = null;
  antsVersion += 1;
}

/**
 * Keeps the open drawing as it is now, so the next change can be undone:
 * its layers' order and settings, and the pixels of the layers the change
 * will touch (by default the one drawn on).
 */
function remember(pixels: Layer[] | null = null): void {
  const doc = activeDoc();
  if (!doc) return;
  undoStack.push(snapshot(doc, pixels ?? [doc.current]));
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  redoStack = [];
}

// ---- Strokes: softness and smoothing ----

/** A point on a canvas, in its own pixels. */
interface Point {
  x: number;
  y: number;
}

/** Where a stroke lands: the canvas itself, or the lifted selection, and where that sits on the canvas. */
interface Target {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
}

/**
 * A stroke under way. Its line is drawn solid on a sheet of its own, given
 * its soft edge and its colour or gradient on a second, then laid over the
 * target as it was at the press, at the chosen opacity. Drawn straight on at
 * part strength, every joint between segments would overlap and show
 * darker. The whole line is redrawn each move, as smoothing reshapes its
 * recent part while it grows.
 */
interface Stroke {
  target: Target;
  /** The layer drawn on, which shows a lifted selection over itself. */
  layer: HTMLCanvasElement;
  before: HTMLCanvasElement;
  sheet: HTMLCanvasElement;
  inked: HTMLCanvasElement;
  points: Point[];
  /** Canvas pixels to one shown pixel, as brush sizes are in shown pixels. */
  scale: number;
  /** Whether it is a straight line from the last stroke's end, begun with Shift, its far end following the pointer. */
  joined: boolean;
}

/** The angles Shift holds a stroke to: every 45 degrees. */
const SNAP_ANGLE = Math.PI / 4;

/** Returns where a straight line from one point toward another ends, held to the nearest 45 degrees. */
function snapLine(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const angle = Math.round(Math.atan2(dy, dx) / SNAP_ANGLE) * SNAP_ANGLE;
  // As far along the held angle as the pointer is, so the end stays level with it.
  const reach = Math.max(0, dx * Math.cos(angle) + dy * Math.sin(angle));
  return { x: from.x + reach * Math.cos(angle), y: from.y + reach * Math.sin(angle) };
}

/** Smoothing: how far apart the line is resampled, in shown pixels. */
const SMOOTH_SPACING = 1.5;
/** How far the line is averaged at each level, in shown pixels: off, medium and high. */
const SMOOTH_REACH = [0, 5, 8];
/** How many times the high level averages, for a fairer curve. */
const SMOOTH_HIGH_PASSES = 2;
/**
 * How far either side a bend is measured, in shown pixels, to tell a corner
 * from a wobble. Longer than the gap between pointer events on a quick
 * stroke, or every event would look like a corner.
 */
const CORNER_SPAN = 9;
/** How much the line is averaged, in shown pixels, before corners are looked for. */
const CORNER_SETTLE = 2;
/** How sharp a turn has to be, in radians, to count as a corner smoothing must keep. */
const CORNER_ANGLE = 1.2;
/**
 * At the high level, a stretch that strays from straight by no more than
 * this share of its length, or this many shown pixels, is drawn straight.
 */
const STRAIGHT_SHARE = 0.03;
const STRAIGHT_PX = 2;

/** Returns a blank canvas the size of another, or a copy of it. */
function copyOf(source: HTMLCanvasElement, withPicture: boolean): HTMLCanvasElement {
  const copy = document.createElement("canvas");
  copy.width = source.width;
  copy.height = source.height;
  if (withPicture) copy.getContext("2d")?.drawImage(source, 0, 0);
  return copy;
}

/** Returns how many canvas pixels make one shown pixel. */
function scaleOf(canvas: HTMLCanvasElement): number {
  return canvas.width / (canvas.getBoundingClientRect().width || canvas.width);
}

/** Returns where drawing goes: the lifted selection while there is one, or else the canvas. */
function drawTarget(canvas: HTMLCanvasElement): Target {
  const float = selection?.float;
  return float ? { canvas: float.canvas, x: float.x, y: float.y } : { canvas, x: 0, y: 0 };
}

/** Starts a pen or eraser stroke on a layer at a point, leaving a dot should it go no further. */
function startStroke(shown: HTMLCanvasElement, layer: HTMLCanvasElement, at: Point): Stroke {
  const target = drawTarget(layer);
  const stroke = {
    target,
    layer,
    before: copyOf(target.canvas, true),
    sheet: copyOf(target.canvas, false),
    inked: copyOf(target.canvas, false),
    points: [at],
    scale: scaleOf(shown),
    joined: false,
  };
  paintStroke(stroke);
  return stroke;
}

/** Redraws a stroke from its points onto its target. */
function paintStroke(stroke: Stroke): void {
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
  // Sizes are in shown pixels, whatever size the canvas is shown at. A soft
  // brush is a thinner core with a blurred rim, about as wide overall.
  const width = size * scale;
  const blur = width * 0.25 * soft;

  ink.clearRect(0, 0, sheet.width, sheet.height);
  inkLine(ink, line, width * (1 - 0.4 * soft), scale);

  tint.clearRect(0, 0, inked.width, inked.height);
  if (blur > 0.3) {
    // Soft edges from a shadow rather than a filter, which Safari's canvas
    // lacks. The sheet is drawn off the canvas and only its blurred shadow,
    // shifted back, lands on it.
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
  // The eraser takes paint away, so its colour is never seen.
  if (tool !== "eraser") {
    const shown = activeCanvas() ?? target.canvas;
    tint.globalCompositeOperation = "source-in";
    tint.fillStyle = useGradient
      ? gradientStyle(tint, gradient, shown.width, shown.height, -target.x, -target.y)
      : colour;
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

/**
 * How far a tapered stroke takes to reach its full width at each end: this
 * many brush widths, but never more than a third of the stroke, so a short
 * one still comes to a point at both ends.
 */
const TAPER_WIDTHS = 5;
const TAPER_SHARE = 1 / 3;
/** The thinnest a tapered point gets, as a share of the brush. */
const TAPER_TIP = 0.06;

/**
 * Inks a stroke's line in black onto the sheet, in the brush's tip.
 *
 * Round is the canvas's own round-capped line. Tapered is a run of circles
 * joined by the shapes that touch both, each as wide as its place along the
 * line allows; the whole stroke is inked again with every pointer move, so
 * the end being drawn is always the point, and settles where the stroke
 * stops. Square sweeps a square, kept square to the page, along each piece
 * of the line, as a square stamp dragged across paper leaves.
 */
function inkLine(ink: CanvasRenderingContext2D, line: Point[], width: number, scale: number): void {
  const first = line[0];
  if (!first) return;
  ink.fillStyle = ink.strokeStyle = "#000";
  if (tip === "round") {
    ink.lineWidth = width;
    ink.lineCap = "round";
    ink.lineJoin = "round";
    ink.beginPath();
    ink.moveTo(first.x, first.y);
    // A tap with no movement still leaves a dot.
    if (line.length === 1) ink.lineTo(first.x + 0.01, first.y);
    for (const p of line.slice(1)) ink.lineTo(p.x, p.y);
    ink.stroke();
    return;
  }
  // Every shape is wound the same way round, so where they overlap fills
  // rather than cancelling out.
  ink.beginPath();
  if (tip === "square") {
    const half = width / 2;
    const corners = (p: Point) => [
      { x: p.x - half, y: p.y - half },
      { x: p.x + half, y: p.y - half },
      { x: p.x + half, y: p.y + half },
      { x: p.x - half, y: p.y + half },
    ];
    const pieces = line.length === 1 ? [[first, first]] : line.slice(1).map((p, i) => [line[i] as Point, p]);
    for (const [a, b] of pieces as [Point, Point][]) {
      const hull = convexHull([...corners(a), ...corners(b)]);
      hull.forEach((p, i) => (i === 0 ? ink.moveTo(p.x, p.y) : ink.lineTo(p.x, p.y)));
      ink.closePath();
    }
    ink.fill();
    return;
  }
  // Spaced finely, so the width changes smoothly from one circle to the next.
  const points = resample(line, Math.max(1, width / 8));
  const along = [0];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1] as Point;
    const b = points[i] as Point;
    along.push((along[i - 1] ?? 0) + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = along[along.length - 1] ?? 0;
  const reach = Math.max(1, Math.min(width * TAPER_WIDTHS, total * TAPER_SHARE));
  // Swelling quickly then easing, so the point is sharp but the stroke soon looks full.
  const ease = (d: number) => Math.sqrt(Math.min(1, d / reach));
  // A tap with no movement still leaves a full dot.
  const radii = along.map((d) => (width / 2) * (total === 0 ? 1 : Math.max(TAPER_TIP, ease(d) * ease(total - d))));
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
    // Wound as the circles are.
    ink.moveTo(p.x - nx * r, p.y - ny * r);
    ink.lineTo(next.x - nx * nr, next.y - ny * nr);
    ink.lineTo(next.x + nx * nr, next.y + ny * nr);
    ink.lineTo(p.x + nx * r, p.y + ny * r);
    ink.closePath();
  });
  ink.fill();
}

/** Returns the corners of the smallest convex shape round some points, wound the same way as a canvas arc. */
function convexHull(points: Point[]): Point[] {
  const sorted = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list: Point[]) => {
    const out: Point[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2] as Point, out[out.length - 1] as Point, p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(sorted), ...half(sorted.slice().reverse())];
}

/** Returns a line through the points with them spaced evenly along it. */
function resample(points: Point[], spacing: number): Point[] {
  const first = points[0];
  if (!first) return [];
  const out: Point[] = [first];
  // How far along the current piece the next point falls.
  let along = spacing;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1] as Point;
    const b = points[i] as Point;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    while (along <= length) {
      const t = along / length;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      along += spacing;
    }
    along -= length;
  }
  const last = points[points.length - 1] as Point;
  const end = out[out.length - 1] as Point;
  if (Math.hypot(last.x - end.x, last.y - end.y) > 0.01) out.push(last);
  return out;
}

/**
 * Returns where an evenly spaced line turns sharply: the points whose turn,
 * measured over a span either side, passes the corner angle and is the
 * sharpest nearby. A span, not the next point, so a wobble does not count.
 */
function cornersOf(line: Point[], span: number): number[] {
  const turn = (i: number) => {
    const a = line[i - span] as Point;
    const b = line[i] as Point;
    const c = line[i + span] as Point;
    const one = Math.atan2(b.y - a.y, b.x - a.x);
    const two = Math.atan2(c.y - b.y, c.x - b.x);
    return Math.abs(Math.atan2(Math.sin(two - one), Math.cos(two - one)));
  };
  const turns = line.map((_, i) => (i >= span && i < line.length - span ? turn(i) : 0));
  const corners: number[] = [];
  for (let i = span; i < line.length - span; i += 1) {
    const here = turns[i] ?? 0;
    if (here < CORNER_ANGLE) continue;
    let sharpest = true;
    for (let j = i - span; j <= i + span && sharpest; j += 1) {
      const there = turns[j] ?? 0;
      if (there > here || (there === here && j < i)) sharpest = false;
    }
    if (sharpest) corners.push(i);
  }
  return corners;
}

/**
 * Averages a stretch of line with its neighbours, nearer ones counting more,
 * keeping its two ends where they are. The averaging narrows towards each
 * end, so the line is not pulled short there.
 */
function averageLine(line: Point[], sigma: number): Point[] {
  const reach = Math.ceil(sigma * 3);
  const last = line.length - 1;
  return line.map((p, i) => {
    const r = Math.min(reach, i, last - i);
    if (r === 0) return p;
    let x = 0;
    let y = 0;
    let total = 0;
    for (let j = i - r; j <= i + r; j += 1) {
      const q = line[j] as Point;
      const weight = Math.exp(-((j - i) ** 2) / (2 * sigma * sigma));
      x += q.x * weight;
      y += q.y * weight;
      total += weight;
    }
    return { x: x / total, y: y / total };
  });
}

/** Returns a stretch of line drawn straight, when it is close to straight already. */
function straightenLine(line: Point[], scale: number): Point[] {
  const a = line[0] as Point;
  const b = line[line.length - 1] as Point;
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

/**
 * Tidies a stroke's line to a smoothing level: 0 leaves it as drawn, 1
 * irons out the wobble and keeps the hand-drawn shape, 2 makes it as clean
 * as it can. Each stretch between corners is smoothed apart from the rest,
 * so corners stay sharp.
 */
function smoothLine(points: Point[], level: number, scale: number): Point[] {
  if (level === 0 || points.length < 3) return points;
  const spacing = SMOOTH_SPACING * scale;
  const line = resample(points, spacing);
  if (line.length < 3) return line;
  const span = Math.max(2, Math.round(CORNER_SPAN / SMOOTH_SPACING));
  const sigma = (SMOOTH_REACH[level] ?? 0) / SMOOTH_SPACING;
  const passes = level === 2 ? SMOOTH_HIGH_PASSES : 1;
  const settled = averageLine(line, CORNER_SETTLE / SMOOTH_SPACING);
  const ends = [0, ...cornersOf(settled, span), line.length - 1];
  const out: Point[] = [];
  for (let k = 0; k < ends.length - 1; k += 1) {
    let stretch = line.slice(ends[k], (ends[k + 1] ?? 0) + 1);
    for (let pass = 0; pass < passes; pass += 1) stretch = averageLine(stretch, sigma);
    if (level === 2) stretch = straightenLine(stretch, scale);
    // Each stretch starts on the corner the last one ended on.
    out.push(...(k === 0 ? stretch : stretch.slice(1)));
  }
  return out;
}

// ---- The lasso: selecting, lifting and moving part of the drawing ----

/**
 * The lassoed area of the open drawing, as an outline running clockwise.
 *
 * Once moved, or pasted, its pixels float: they are held apart from the
 * picture, laid over a copy of what was beneath them, and only become part
 * of it for good when the selection is let go. Until then, moving them on
 * leaves what they passed over as it was.
 */
interface Selection {
  path: Point[];
  float: Float | null;
  /**
   * For an inverted selection, where its hole starts in the path. The path
   * runs round the drawing's edge, along a seam to the hole, round the hole
   * the other way and back, so filling it leaves the hole out; the ants
   * draw the two rings and skip the seam.
   */
  split?: number;
}

/**
 * Lifted pixels: the piece as it was lifted, where its top left would sit
 * unturned and unscaled, what was under it, and how it is scaled and turned
 * about its middle. The piece itself is never resampled while it is scaled
 * or turned, so doing either many times does not blur it.
 */
interface Float {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  under: HTMLCanvasElement;
  scale: number;
  /** In radians, clockwise on screen. */
  angle: number;
  /** The selection's outline on the piece, before it is scaled or turned. */
  base: Point[];
}

/** Returns a float, unscaled and unturned, for a piece at a place with an outline on the drawing. */
function newFloat(piece: { canvas: HTMLCanvasElement; x: number; y: number }, path: Point[], under: HTMLCanvasElement): Float {
  return { ...piece, under, scale: 1, angle: 0, base: path.map((p) => ({ x: p.x - piece.x, y: p.y - piece.y })) };
}

/** Returns where a point on a float's piece lands on the drawing, once scaled and turned. */
function placePoint(float: Float, p: Point): Point {
  const { width, height } = float.canvas;
  const dx = (p.x - width / 2) * float.scale;
  const dy = (p.y - height / 2) * float.scale;
  const cos = Math.cos(float.angle);
  const sin = Math.sin(float.angle);
  return { x: float.x + width / 2 + dx * cos - dy * sin, y: float.y + height / 2 + dx * sin + dy * cos };
}

/** Returns whether a float is scaled or turned. */
function transformed(float: Float): boolean {
  return float.scale !== 1 || float.angle !== 0;
}

/** Puts the selection's outline where its float now is. */
function placeOutline(): void {
  const float = selection?.float;
  if (!selection || !float) return;
  selection.path = float.base.map((p) => placePoint(float, p));
  antsVersion += 1;
}

/**
 * Makes a scaled or turned float's pixels its own, at their new size and
 * angle, so it can be drawn on and copied like any other. Done only when
 * something other than moving, scaling or turning is done to it.
 */
function settleFloat(): void {
  const float = selection?.float;
  if (!selection || !float || !transformed(float)) return;
  const { width, height } = float.canvas;
  const corners = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ].map((p) => placePoint(float, p));
  const left = Math.floor(Math.min(...corners.map((p) => p.x)));
  const top = Math.floor(Math.min(...corners.map((p) => p.y)));
  const piece = document.createElement("canvas");
  piece.width = Math.max(1, Math.ceil(Math.max(...corners.map((p) => p.x))) - left);
  piece.height = Math.max(1, Math.ceil(Math.max(...corners.map((p) => p.y))) - top);
  const context = piece.getContext("2d");
  if (context) {
    // Undone after: a context keeps its shift, and the piece is drawn on again later.
    context.translate(-left, -top);
    drawFloatPiece(context, float);
    context.setTransform(1, 0, 0, 1, 0, 0);
  }
  selection.float = newFloat({ canvas: piece, x: left, y: top }, selection.path, float.under);
}

/** Draws a float's piece onto a context, scaled and turned about its middle. */
function drawFloatPiece(context: CanvasRenderingContext2D, float: Float): void {
  const { width, height } = float.canvas;
  context.save();
  context.imageSmoothingQuality = "high";
  context.translate(float.x + width / 2, float.y + height / 2);
  context.rotate(float.angle);
  context.scale(float.scale, float.scale);
  context.drawImage(float.canvas, -width / 2, -height / 2);
  context.restore();
}

let selection: Selection | null = null;
/** The outline being drawn with the lasso, before it is let go. */
let lassoing: Point[] | null = null;
/** What Copy or Cut last took: its pixels, where they were, and their outline. */
let clipboard: { canvas: HTMLCanvasElement; x: number; y: number; path: Point[] } | null = null;
/**
 * Whether that is the newest thing copied, so Ctrl+V pastes it ahead of any
 * picture on the system clipboard. A page cannot see when something else is
 * copied, so leaving the page counts as maybe having copied elsewhere.
 */
let clipboardFresh = false;
/** The marching ants over the open drawing. */
let ants: HTMLCanvasElement | null = null;
/** What the ants show now, so they are only redrawn when it changes. */
let antsKey = "";
/** Bumped whenever the outline changes. */
let antsVersion = 0;

/** How long each step of the marching ants lasts. Three steps take a dash to where the next one was. */
const ANTS_STEP_MS = 100;
/** How long each dash and gap of the ants is, in shown pixels. */
const ANTS_DASH = 4;
/** How long the lasso button is held, on a touch screen, to bring up its options. */
const HOLD_MS = 450;

/** Traces an outline onto a context, moved by an offset. */
function tracePath(context: CanvasRenderingContext2D, path: Point[], dx: number, dy: number, close: boolean): void {
  context.beginPath();
  path.forEach((p, i) => {
    if (i === 0) context.moveTo(p.x + dx, p.y + dy);
    else context.lineTo(p.x + dx, p.y + dy);
  });
  if (close) context.closePath();
}

/** Returns an outline running clockwise on screen, turning it round if it was drawn the other way. */
function clockwise(path: Point[]): Point[] {
  let area = 0;
  path.forEach((a, i) => {
    const b = path[(i + 1) % path.length] as Point;
    area += a.x * b.y - b.x * a.y;
  });
  // With y running down the screen, a positive area is clockwise.
  return area < 0 ? path.slice().reverse() : path;
}

/** How near the first corner of a straight line selection a tap closes it, in shown pixels. */
const CLOSE_PX = 10;

/** Closes a straight line selection under way, its corners becoming the selection. */
function closePolygon(): void {
  if (!polygon) return;
  lassoing = polygon;
  polygon = null;
  finishLasso();
}

/** The selection from before the lasso press under way, for its undo step. */
let lassoBefore: Outline = null;

/** Ends drawing the lasso: a loop of any size becomes the selection, a tap selects nothing. */
function finishLasso(): void {
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

/** Stops waiting for a gradient's path to be drawn, leaving the gradient as it was. */
function cancelPath(): void {
  drawingPath = false;
  lassoing = null;
  antsVersion += 1;
  syncToolbar();
}

/**
 * Ends drawing a gradient's path: the line becomes the gradient's anchors,
 * and the colour pop-up opens again on the editor to show them. A tap draws
 * nothing and leaves the gradient as it was.
 */
function finishPath(): void {
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
  // The colour button only shows for a tool that paints with it.
  if (tool !== "pen" && tool !== "bucket") tool = "pen";
  syncToolbar();
  togglePopup("colour");
  refreshGradient();
}

/** Returns the pixel box round an outline, kept on the canvas. */
function boundsOf(path: Point[], canvas: HTMLCanvasElement): { x: number; y: number; width: number; height: number } {
  const xs = path.map((p) => p.x);
  const ys = path.map((p) => p.y);
  const x = Math.max(0, Math.floor(Math.min(...xs)));
  const y = Math.max(0, Math.floor(Math.min(...ys)));
  const right = Math.min(canvas.width, Math.ceil(Math.max(...xs)));
  const bottom = Math.min(canvas.height, Math.ceil(Math.max(...ys)));
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}

/** Returns the selected pixels of a canvas on a canvas of their own, and where they came from. */
function cutOut(canvas: HTMLCanvasElement, path: Point[]): { canvas: HTMLCanvasElement; x: number; y: number } {
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

/** Clears the selected area of a layer to see-through. */
function clearSelected(canvas: HTMLCanvasElement, path: Point[]): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  tracePath(context, path, 0, 0, true);
  context.globalCompositeOperation = "destination-out";
  context.fill();
  context.globalCompositeOperation = "source-over";
}

/** Lifts the selected pixels off a layer to float, leaving it see-through where they were. */
function lift(canvas: HTMLCanvasElement): void {
  if (!selection || selection.float) return;
  const piece = cutOut(canvas, selection.path);
  clearSelected(canvas, selection.path);
  selection.float = newFloat(piece, selection.path, copyOf(canvas, true));
}

/** Shows the floating pixels over what is beneath them. */
function showFloat(canvas: HTMLCanvasElement): void {
  const float = selection?.float;
  const context = canvas.getContext("2d");
  if (!float || !context) return;
  context.globalCompositeOperation = "copy";
  context.drawImage(float.under, 0, 0);
  context.globalCompositeOperation = "source-over";
  if (transformed(float)) drawFloatPiece(context, float);
  else context.drawImage(float.canvas, float.x, float.y);
}

/** Moves the floating selection by an amount. */
function shiftSelection(canvas: HTMLCanvasElement, dx: number, dy: number): void {
  if (!selection?.float) return;
  selection.path = selection.path.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  selection.float.x += dx;
  selection.float.y += dy;
  antsVersion += 1;
  showFloat(canvas);
  render();
}

/**
 * Lets go of the selection. Floating pixels are already shown on the
 * picture, over what was beneath them, so letting go is what makes them
 * part of it.
 */
function dropSelection(): void {
  if (!selection && !lassoing) return;
  const floated = !!selection?.float;
  selection = null;
  lassoing = null;
  polygon = null;
  antsVersion += 1;
  const layer = currentLayer();
  if (floated && layer && active) save(active, layer);
  syncToolbar();
}

/**
 * Puts moved pixels down on the layer they were lifted from, keeping the
 * outline, so the same area can be worked on in another layer.
 */
function putDownFloat(): void {
  if (!selection?.float) return;
  selection.float = null;
  antsVersion += 1;
  const layer = currentLayer();
  if (layer && active) save(active, layer);
}

/** Lets go of the selection as one undo step, so undo brings it back. */
function deselect(): void {
  const before = outlineNow();
  dropSelection();
  rememberOutline(before);
}

/** Returns which pixels of a target lie in the selection, one byte each, or null for all of them. */
function selectionMask(target: Target): Uint8Array | null {
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

/** Copies the selected pixels of the layer drawn on, for Paste. */
function copySelection(): void {
  const canvas = currentLayer()?.canvas;
  if (!canvas || !selection) return;
  settleFloat();
  const float = selection.float;
  const piece = float
    ? { canvas: copyOf(float.canvas, true), x: float.x, y: float.y }
    : cutOut(canvas, selection.path);
  clipboard = { ...piece, path: selection.path.map((p) => ({ ...p })) };
  clipboardFresh = true;
  setStatus("Selection copied");
  syncToolbar();
}

/**
 * Selects everything drawn on the layer drawn on: the tightest box round
 * its pixels that are not see-through. A box rather than their outline, as
 * a selection is one shape, and the see-through pixels inside it copy as
 * nothing anyway.
 */
function selectLayer(): void {
  const layer = currentLayer();
  const context = layer?.canvas.getContext("2d");
  if (!layer || !context) return;
  const { width, height } = layer.canvas;
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
      { x: left, y: bottom + 1 },
    ],
    float: null,
  };
  rememberOutline(before);
  antsVersion += 1;
  if (tool !== "lasso" && tool !== "move") tool = "lasso";
  syncToolbar();
}

/** Where an inverted selection's hole starts in its path: after the drawing's four corners and the first again. */
const INVERT_SPLIT = 5;

/** Selects everything outside the selection instead, or inverts an inverted one back. */
function invertSelection(): void {
  const canvas = activeCanvas();
  if (!selection || !canvas) {
    setStatus("Nothing selected");
    return;
  }
  const { path, split } = selection;
  const before = outlineNow();
  // Moved pixels are put down first, as they would be for any new selection.
  dropSelection();
  if (split) {
    // The hole was run round backwards, ending on its first corner again.
    selection = { path: path.slice(split, -1).reverse(), float: null };
  } else {
    const { width, height } = canvas;
    const hole = path.slice().reverse();
    const corner = { x: 0, y: 0 };
    selection = {
      path: [corner, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }, corner, ...hole, hole[0] as Point],
      float: null,
      split: INVERT_SPLIT,
    };
  }
  rememberOutline(before);
  antsVersion += 1;
  if (tool !== "lasso" && tool !== "move") tool = "lasso";
  syncToolbar();
}

/** Copies the selected pixels for Paste and takes them out of the layer drawn on. */
function cutSelection(): void {
  const layer = currentLayer();
  const canvas = layer?.canvas;
  const context = canvas?.getContext("2d");
  if (!layer || !canvas || !context || !selection || !active || !canDraw()) return;
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
  save(active, layer);
  setStatus("Selection cut");
  syncToolbar();
}

/**
 * Clears what is selected on the layer drawn on, keeping the selection. A
 * floating piece is thrown away, leaving what was under it.
 */
function deleteSelection(): void {
  const layer = currentLayer();
  const context = layer?.canvas.getContext("2d");
  if (!layer || !context || !selection || !active || !canDraw()) return;
  remember();
  if (selection.float) {
    context.globalCompositeOperation = "copy";
    context.drawImage(selection.float.under, 0, 0);
    context.globalCompositeOperation = "source-over";
    selection.float = null;
  } else {
    clearSelected(layer.canvas, selection.path);
  }
  render();
  save(active, layer);
}

/** Puts what was copied back on the layer drawn on, floating where it came from, ready to move. */
function pasteSelection(): void {
  const layer = currentLayer();
  const canvas = layer?.canvas;
  if (!layer || !canvas || !clipboard || !active || !canDraw()) return;
  dropSelection();
  remember();
  // Kept on this drawing, which may be smaller than the one it came from.
  const x = Math.max(0, Math.min(clipboard.x, canvas.width - clipboard.canvas.width));
  const y = Math.max(0, Math.min(clipboard.y, canvas.height - clipboard.canvas.height));
  const dx = x - clipboard.x;
  const dy = y - clipboard.y;
  const path = clipboard.path.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  selection = { path, float: newFloat({ canvas: copyOf(clipboard.canvas, true), x, y }, path, copyOf(canvas, true)) };
  antsVersion += 1;
  showFloat(canvas);
  render();
  save(active, layer);
  tool = "move";
  syncToolbar();
}

// ---- Text ----

/** The look new text takes: the last one chosen. Its colour is the pen's colour, shared. */
let textLook: TextLook = {
  font: "Arial",
  size: 48,
  bold: false,
  italic: false,
  underline: false,
  colour: "#000000",
  outline: false,
  outlineColour: "#ffffff",
  outlineSize: 4,
  outlineSoft: 0,
};

/**
 * The text being typed: its layer, the box it is typed into, whether the
 * layer was made for it, what it said before, and how long undo's list was
 * before it, so typing nothing leaves no step behind.
 */
let editing: { layer: Layer; input: HTMLTextAreaElement; fresh: boolean; before: string; mark: number; placed: string } | null =
  null;

/** Returns the layer drawn on, when it is a text layer. */
function textLayer(): Layer | null {
  const layer = currentLayer();
  return layer?.text ? layer : null;
}

/** Returns just the look of a piece of text. */
function lookOf(look: TextLook): TextLook {
  const { font, size, bold, italic, underline, colour, outline, outlineColour, outlineSize, outlineSoft } = look;
  return { font, size, bold, italic, underline, colour, outline, outlineColour, outlineSize, outlineSoft };
}

/** Returns the look the text options show: the picked text layer's, with the text tool, or else the look new text takes. */
function shownLook(): TextLook {
  const text = tool === "text" ? textLayer()?.text : null;
  return text ? lookOf(text) : { ...textLook, colour };
}

/** Returns the box with handles round the picked text layer, while the text tool is in use. */
function textBox(unit: number): HandleBox | null {
  const layer = tool === "text" ? textLayer() : null;
  if (!layer?.text || !layer.visible || layer.locked) return null;
  return boxAround(textCorners(layer.text), unit);
}

/** Draws a text layer's pixels again from its words and look, and the drawing with them. */
function redrawText(layer: Layer): void {
  if (!layer.text) return;
  drawText(layer.canvas, layer.text);
  render();
  antsVersion += 1;
}

/** Set while a slider's drag changes the text's look, so the whole drag is one undo step. */
let lookSliding = false;

/**
 * Changes the text's look: the look new text takes, and the picked text
 * layer's while the text tool is in use. sliding marks a change partway
 * through a drag, which is saved once the drag ends.
 */
function changeLook(change: Partial<TextLook>, sliding = false): void {
  textLook = { ...shownLook(), ...change };
  if (change.colour) colour = change.colour;
  const layer = tool === "text" ? textLayer() : null;
  if (layer?.text && active) {
    if (!lookSliding) remember([]);
    lookSliding = sliding;
    Object.assign(layer.text, change);
    redrawText(layer);
    if (!sliding) save(active, layer);
  }
  syncToolbar();
}

/** Ends a drag that changed the text's look, saving the text layer once for it. */
function endLookSlide(): void {
  if (!lookSliding) return;
  lookSliding = false;
  const layer = textLayer();
  if (layer && active) save(active, layer);
}

/** Starts a new text layer, its top left at a point, and the typing in it. */
function newText(at: Point): void {
  const doc = activeDoc();
  if (!doc || !active || !roomForLayer(doc)) return;
  finishEditing();
  dropSelection();
  const mark = undoStack.length;
  remember([]);
  const layer = addLayer(doc);
  const look = { ...textLook, colour };
  // Placed so the first line sits on the point pressed, as a caret would.
  layer.text = { ...look, content: "", x: at.x, y: at.y - (look.size * LINE_HEIGHT) / 2, angle: 0 };
  redrawText(layer);
  startEditing(layer, true, mark);
  refreshLayers();
}

/** Starts typing into a text layer, in a see-through box laid over its words. */
function startEditing(layer: Layer, fresh: boolean, mark = undoStack.length): void {
  if (!layer.text) return;
  if (editing?.layer === layer) {
    editing.input.focus({ preventScroll: true });
    return;
  }
  finishEditing();
  // One undo step for the whole of the typing, taken back off should nothing change.
  if (!fresh) remember([]);
  const input = document.createElement("textarea");
  input.className = "doodle-text-input";
  input.spellcheck = false;
  input.wrap = "off";
  input.setAttribute("aria-label", "Text");
  input.value = layer.text.content;
  input.addEventListener("input", () => {
    if (!layer.text) return;
    layer.text.content = input.value;
    redrawText(layer);
    placeTextEditor();
  });
  editing = { layer, input, fresh, before: layer.text.content, mark, placed: "" };
  placeTextEditor();
  input.focus({ preventScroll: true });
  input.setSelectionRange(input.value.length, input.value.length);
}

/**
 * Stops typing. Text left empty takes its layer with it; a new layer that
 * was never typed in, or an edit that changed nothing, leaves no undo step.
 */
function finishEditing(): void {
  const was = editing;
  if (!was) return;
  editing = null;
  was.input.remove();
  const { layer } = was;
  const doc = activeDoc();
  const text = layer.text;
  antsVersion += 1;
  if (!text || !doc || !active) return;
  const unchanged = undoStack.length === was.mark + 1;
  if (!text.content.trim()) {
    const index = doc.layers.indexOf(layer);
    if (index >= 0 && doc.layers.length > 1) {
      doc.layers.splice(index, 1);
      doc.current = doc.layers[Math.max(0, index - 1)] ?? (doc.layers[0] as Layer);
    } else {
      layer.text = null;
    }
    if (was.fresh && unchanged) undoStack.pop();
    render();
    save(active);
    refreshLayers();
    return;
  }
  if (!was.fresh && text.content === was.before && unchanged) undoStack.pop();
  // A new text layer is named after its words, as in Photoshop.
  if (was.fresh) layer.name = text.content.trim().split("\n")[0]?.slice(0, 24) || layer.name;
  save(active, layer);
  refreshLayers();
}

/** Lays the typing box over its text: same place, size, font and turn, its letters left to the drawing. */
function placeTextEditor(): void {
  const was = editing;
  if (!was) return;
  const { input, layer } = was;
  const canvas = activeCanvas();
  const parent = canvas?.parentElement;
  const spec = layer.text;
  if (!canvas || !parent || !spec || !activeDoc()?.layers.includes(layer)) {
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
    `${(width * scale) / 2}px ${(height * scale) / 2}px`,
    spec.colour,
  ];
  // Written only when it changes: this runs every frame.
  const key = place.join("|");
  if (key === was.placed) return;
  was.placed = key;
  const [left, top, wide, tall, font, lineHeight, transform, origin, caret] = place as string[];
  Object.assign(input.style, {
    left,
    top,
    width: wide,
    height: tall,
    font,
    lineHeight,
    transform,
    transformOrigin: origin,
    caretColor: caret,
  });
  input.scrollLeft = 0;
  input.scrollTop = 0;
}

/** A press with the text tool under way: what it took hold of, where, and the text as it was then. */
interface TextHold {
  grab: Grab;
  start: Point;
  spec: TextSpec;
  corners: Point[];
  middle: Point;
  /** Whether a press inside the text has moved far enough to be a drag. */
  moved: boolean;
  remembered: boolean;
  /** Where the caret went, for a press inside the text being typed: a drag from there selects. */
  caret: number | null;
}

/** Returns the topmost shown, unlocked text layer whose box a point is in. */
function textLayerAt(at: Point): Layer | null {
  const doc = activeDoc();
  if (!doc) return null;
  for (const layer of doc.layers.slice().reverse()) {
    if (layer.text && layer.visible && !layer.locked && insideBox(at, textCorners(layer.text))) return layer;
  }
  return null;
}

/**
 * Handles a press with the text tool. On the picked text layer's box it
 * takes hold of a handle, its edge to move it, or its inside to type in it
 * (or drag it). On another text layer's words it picks that one. Elsewhere it
 * stops any typing, or starts new text when there was none.
 */
function textPress(at: Point, unit: number): TextHold | null {
  let layer = textLayer();
  let box = textBox(unit);
  let grab = grabAt(at, unit, box);
  if (grab.kind === "outside") {
    const other = textLayerAt(at);
    if (other) {
      setCurrent(other);
      layer = other;
      box = textBox(unit);
      grab = { kind: "inside" };
    }
  }
  if (grab.kind === "outside" || !layer?.text || !box) {
    if (editing) finishEditing();
    else newText(at);
    return null;
  }
  // Inside the words being typed, a press places the caret, as in any text box.
  let caret: number | null = null;
  if (grab.kind === "inside" && editing?.layer === layer) {
    caret = caretAt(layer.text, at);
    editing.input.focus({ preventScroll: true });
    editing.input.setSelectionRange(caret, caret);
  }
  return {
    grab,
    start: at,
    spec: { ...layer.text },
    corners: box.corners,
    middle: box.middle,
    moved: false,
    remembered: false,
    caret,
  };
}

/** Moves, scales or turns the picked text as a press with the text tool drags to a point. */
function textDrag(hold: TextHold, at: Point, unit: number, snap: boolean): void {
  const layer = textLayer();
  const text = layer?.text;
  if (!layer || !text) return;
  // Dragging across the words being typed selects them rather than moving them.
  if (hold.caret !== null && editing?.layer === layer) {
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
    // The opposite corner stays put; the size follows the pointer along the diagonal.
    const anchor = hold.corners[(grab.corner + 2) % 4] as Point;
    const dragged = hold.corners[grab.corner] as Point;
    const dx = dragged.x - anchor.x;
    const dy = dragged.y - anchor.y;
    const ratio = Math.max(4 / spec.size, ((at.x - anchor.x) * dx + (at.y - anchor.y) * dy) / (dx * dx + dy * dy || 1));
    text.size = spec.size * ratio;
    const { width, height } = measureText(text);
    text.x = anchor.x + (dx * ratio) / 2 - width / 2;
    text.y = anchor.y + (dy * ratio) / 2 - height / 2;
  } else if (grab.kind === "rotate") {
    const turn =
      Math.atan2(at.y - hold.middle.y, at.x - hold.middle.x) -
      Math.atan2(hold.start.y - hold.middle.y, hold.start.x - hold.middle.x);
    const angle = spec.angle + turn;
    text.angle = snap ? Math.round(angle / TURN_SNAP) * TURN_SNAP : angle;
  } else {
    text.x = spec.x + at.x - hold.start.x;
    text.y = spec.y + at.y - hold.start.y;
  }
  textLook = { ...textLook, size: text.size };
  redrawText(layer);
  placeTextEditor();
}

/** Ends a press with the text tool: a press inside the text that did not move starts typing in it. */
function textRelease(hold: TextHold): void {
  const layer = textLayer();
  if (!layer || !active) return;
  if (hold.caret !== null) editing?.input.focus({ preventScroll: true });
  else if (!hold.moved && hold.grab.kind === "inside" && layer.text) {
    // Typing starts where the text was pressed.
    const caret = caretAt(layer.text, hold.start);
    startEditing(layer, false);
    editing?.input.setSelectionRange(caret, caret);
  } else if (hold.remembered) save(active, layer);
  syncToolbar();
}

// ---- Scaling and turning a selection ----

/** The handles' sizes and reach, in shown pixels. */
const HANDLE_PX = 5;
const GRAB_PX = 10;
const KNOB_GAP_PX = 24;
const KNOB_PX = 8;
/** How far out from a corner a press still turns the selection, rather than moving it. */
const TURN_REACH_PX = 30;
/** The angle turning snaps to with Shift held. */
const TURN_SNAP = Math.PI / 12;

/**
 * What a press near a box with handles takes hold of: the whole of it (by
 * its edge), a corner to scale by, or its turn; or else whether it landed
 * inside the box or well away from it.
 */
type Grab =
  | { kind: "move" }
  | { kind: "scale"; corner: number }
  | { kind: "rotate" }
  | { kind: "inside" }
  | { kind: "outside" };

/** A box with handles: its corners, clockwise from the top left as it is turned, its middle, its top edge's middle and its turning knob. */
interface HandleBox {
  corners: Point[];
  middle: Point;
  top: Point;
  knob: Point;
}

/** A circular arrow, as the pointer over the places that turn a selection. */
const TURN_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path d='M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35Z' fill='#000' stroke='#fff' stroke-width='1.2'/></svg>",
)}") 12 12, grab`;

/** Returns the box round the selection, or null without one. unit is canvas pixels to one shown pixel. */
function selectionBox(unit: number): HandleBox | null {
  if (!selection) return null;
  const float = selection.float;
  let corners: Point[];
  if (float) {
    const { width, height } = float.canvas;
    corners = [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ].map((p) => placePoint(float, p));
  } else {
    const xs = selection.path.map((p) => p.x);
    const ys = selection.path.map((p) => p.y);
    const [left, right, top, bottom] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    corners = [
      { x: left, y: top },
      { x: right, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom },
    ];
  }
  return boxAround(corners, unit);
}

/** Returns the box with handles round four corners, its turning knob above its top edge. */
function boxAround(corners: Point[], unit: number): HandleBox {
  const [a, b, c] = corners as [Point, Point, Point, Point];
  const middle = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
  const top = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const up = Math.hypot(top.x - middle.x, top.y - middle.y);
  const ux = up > 0.001 ? (top.x - middle.x) / up : 0;
  const uy = up > 0.001 ? (top.y - middle.y) / up : -1;
  let knob = { x: top.x + ux * KNOB_GAP_PX * unit, y: top.y + uy * KNOB_GAP_PX * unit };
  // Off the drawing it could be neither seen nor pressed, so it goes just inside the top edge instead.
  const shown = activeCanvas();
  if (shown && (knob.x < 0 || knob.y < 0 || knob.x > shown.width || knob.y > shown.height)) {
    knob = { x: top.x - ux * KNOB_GAP_PX * unit, y: top.y - uy * KNOB_GAP_PX * unit };
  }
  return { corners, middle, top, knob };
}

/** Returns whether a point lies inside a four-cornered box. */
function insideBox(p: Point, corners: Point[]): boolean {
  let sign = 0;
  for (let i = 0; i < corners.length; i += 1) {
    const a = corners[i] as Point;
    const b = corners[(i + 1) % corners.length] as Point;
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (cross === 0) continue;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

/** Returns how far a point is from a box's edges. */
function distanceToEdge(p: Point, corners: Point[]): number {
  let best = Infinity;
  corners.forEach((a, i) => {
    const b = corners[(i + 1) % corners.length] as Point;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / (ex * ex + ey * ey || 1)));
    best = Math.min(best, Math.hypot(a.x + ex * t - p.x, a.y + ey * t - p.y));
  });
  return best;
}

/** Returns what a press at a point would take hold of on a box. */
function grabAt(at: Point, unit: number, box: HandleBox | null): Grab {
  if (!box) return { kind: "outside" };
  const near = box.corners.map((corner) => Math.hypot(at.x - corner.x, at.y - corner.y));
  const corner = near.findIndex((distance) => distance <= GRAB_PX * unit);
  if (corner >= 0) return { kind: "scale", corner };
  if (Math.hypot(at.x - box.knob.x, at.y - box.knob.y) <= (KNOB_PX + 3) * unit) return { kind: "rotate" };
  if (insideBox(at, box.corners)) return { kind: "inside" };
  if (distanceToEdge(at, box.corners) <= GRAB_PX * unit) return { kind: "move" };
  return Math.min(...near) <= TURN_REACH_PX * unit ? { kind: "rotate" } : { kind: "outside" };
}

/** Returns a selection's grab, where anywhere but a corner or its turn moves it. */
function selectionGrab(at: Point, unit: number): Grab {
  const grab = grabAt(at, unit, selectionBox(unit));
  return grab.kind === "inside" || grab.kind === "outside" ? { kind: "move" } : grab;
}

/** Returns the pointer for what a press would take hold of: a two-way arrow along a corner's diagonal, or a turning arrow. */
function cursorFor(grab: Grab, box: HandleBox | null): string {
  if (grab.kind === "rotate") return TURN_CURSOR;
  if (grab.kind !== "scale") return "move";
  const corner = box?.corners[grab.corner];
  if (!box || !corner) return "move";
  const degrees = (Math.atan2(corner.y - box.middle.y, corner.x - box.middle.x) * 180) / Math.PI;
  // With y running down the screen, a corner down and right of the middle is the top left to bottom right diagonal.
  return ((degrees % 180) + 180) % 180 < 90 ? "nwse-resize" : "nesw-resize";
}

/** Draws a box's outline, corner handles and turning knob. */
function drawHandles(context: CanvasRenderingContext2D, unit: number, box: HandleBox | null): void {
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
  // A turning arrow on the knob: most of a circle, with a head at its end.
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

/** A scale or turn under way: what was taken hold of, where, and the selection as it was then. */
interface Hold {
  grab: Grab;
  start: Point;
  scale: number;
  angle: number;
  corners: Point[];
  middle: Point;
}

/** Scales or turns the floating selection as a held handle is dragged to a point. */
function transformTo(hold: Hold, at: Point, snap: boolean): void {
  const float = selection?.float;
  if (!float) return;
  const { width, height } = float.canvas;
  if (hold.grab.kind === "scale") {
    // The opposite corner stays put; the size follows the pointer along the diagonal, keeping the shape.
    const anchor = hold.corners[(hold.grab.corner + 2) % 4] as Point;
    const dragged = hold.corners[hold.grab.corner] as Point;
    const dx = dragged.x - anchor.x;
    const dy = dragged.y - anchor.y;
    const length = dx * dx + dy * dy || 1;
    const smallest = 4 / Math.max(1, Math.min(width, height) * hold.scale);
    const ratio = Math.max(smallest, ((at.x - anchor.x) * dx + (at.y - anchor.y) * dy) / length);
    float.scale = hold.scale * ratio;
    float.x = anchor.x + (dx * ratio) / 2 - width / 2;
    float.y = anchor.y + (dy * ratio) / 2 - height / 2;
  } else if (hold.grab.kind === "rotate") {
    const turn =
      Math.atan2(at.y - hold.middle.y, at.x - hold.middle.x) -
      Math.atan2(hold.start.y - hold.middle.y, hold.start.x - hold.middle.x);
    const angle = hold.angle + turn;
    float.angle = snap ? Math.round(angle / TURN_SNAP) * TURN_SNAP : angle;
  }
  placeOutline();
}

/**
 * Draws the marching ants round the selection, or the lasso being drawn,
 * on a see-through canvas laid over the open drawing. They step a third of
 * a dash and gap at a time, clockwise, so a dash reaches where the next one
 * was in three steps. The handles of a selection being moved, or of the
 * text being worked on, are drawn on it too.
 */
function drawAnts(): void {
  const canvas = activeCanvas();
  const path = lassoing ?? selection?.path ?? null;
  const parent = canvas?.parentElement;
  const unit = canvas ? scaleOf(canvas) : 1;
  // The picked text layer's handles, while the text tool is in use, share this overlay.
  const textHandles = canvas ? textBox(unit) : null;
  const outline = path && path.length >= 2 ? path : null;
  if (!canvas || !parent || (!outline && !textHandles)) {
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
  // The last point too: a box, a straight edge or the next corner moves it without adding any.
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
    const split = !lassoing ? selection?.split : undefined;
    if (split) {
      // An inverted selection: the drawing's edge and the hole, without the seam between.
      tracePath(context, outline.slice(0, split - 1), 0, 0, true);
      const hole = outline.slice(split);
      hole.forEach((p, i) => (i === 0 ? context.moveTo(p.x, p.y) : context.lineTo(p.x, p.y)));
      context.closePath();
    } else {
      // A box being dragged out is already whole; a freehand or straight line one is still open.
      tracePath(context, outline, 0, 0, !lassoing || (lassoMode === "rect" && !polygon && !drawingPath));
    }
    context.setLineDash([]);
    context.strokeStyle = "#fff";
    context.stroke();
    context.setLineDash([dash, dash]);
    // A falling offset carries the dashes forward along the outline.
    context.lineDashOffset = (-tick * (dash * 2)) / 3;
    context.strokeStyle = "#000";
    context.stroke();
  }
  if (tool === "move" && selection && !lassoing) drawHandles(context, unit, selectionBox(unit));
  if (textHandles) drawHandles(context, unit, textHandles);
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

  const point = (event: PointerEvent): Point => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * canvas.width) / rect.width,
      y: ((event.clientY - rect.top) * canvas.height) / rect.height,
    };
  };
  /** What the press under way is doing, once it is known not to be a drag of a closed drawing. */
  let press: "stroke" | "lasso" | "polygon" | "move" | "path" | "text" | null = null;
  let stroke: Stroke | null = null;
  let lastMove: Point | null = null;
  let hold: Hold | null = null;
  let textHold: TextHold | null = null;
  /** Where a rectangle select began. */
  let lassoFrom: Point | null = null;
  /** How many of the lasso's points come before the straight edge Shift is drawing. */
  let shiftFrom: number | null = null;

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
    const at = point(event);
    if (drawingPath) {
      // Shown as it is drawn by the marching ants, as a lasso's outline is.
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
      // A tap back on the first corner closes the shape.
      const unit = scaleOf(canvas);
      if (polygon.length >= 3 && Math.hypot(at.x - first.x, at.y - first.y) <= CLOSE_PX * unit) {
        closePolygon();
        press = null;
        return;
      }
      const last = polygon[polygon.length - 1] as Point;
      const next = event.shiftKey ? snapLine(last, at) : at;
      // The second tap of a double tap, which closes the shape, adds no corner.
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
    const layer = currentLayer();
    if (!layer || !canDraw()) return;
    if (tool === "move") {
      if (!selection) return;
      const unit = scaleOf(canvas);
      const grab = selectionGrab(at, unit);
      if (!selection.float) {
        remember();
        lift(layer.canvas);
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
    // Painting on a scaled or turned piece needs its pixels at their new size and angle.
    settleFloat();
    if (useGradient && tool !== "eraser") keepGradient(gradient);
    if (tool === "bucket") {
      const target = drawTarget(layer.canvas);
      // Read from every layer as shown, which has the same size and place as
      // the layer itself; a lifted piece is read from the layer alone.
      const all =
        bucketReadsAll && !selection?.float
          ? (canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data ?? null)
          : null;
      floodFill(target.canvas, at.x - target.x, at.y - target.y, fillPaint(target), opacity, selectionMask(target), all);
      if (selection?.float) showFloat(layer.canvas);
      render(id);
      save(id, layer);
      return;
    }
    canvas.setPointerCapture(event.pointerId);
    // Shift with a stroke already drawn here joins a straight line to its end.
    const from = event.shiftKey && lastEnd?.id === id ? lastEnd.at : null;
    stroke = startStroke(canvas, layer.canvas, from ?? at);
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
    // With Move and a selection, the pointer says what a press there would do.
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
      const start = stroke.points[0] as Point;
      // A joined line's end follows the pointer; Shift held mid-stroke makes
      // it straight from where it began, at the nearest 45 degrees.
      if (stroke.joined) stroke.points = [start, at];
      else if (event.shiftKey) stroke.points = [start, snapLine(start, at)];
      else stroke.points.push(at);
      paintStroke(stroke);
      render(id);
    } else if (polygon && active === id) {
      // The corner being placed follows a drag; with no press, a line to the
      // pointer shows where the next tap would put one.
      const placing = press === "polygon" && polygon.length > 1;
      const before = polygon[polygon.length - (placing ? 2 : 1)] as Point;
      const to = event.shiftKey ? snapLine(before, at) : at;
      if (placing) polygon[polygon.length - 1] = to;
      lassoing = placing ? [...polygon] : [...polygon, to];
    } else if (press === "lasso" && lassoing && lassoFrom) {
      // A box from the press to the pointer; with Shift, a square.
      let { x, y } = at;
      if (event.shiftKey) {
        const side = Math.max(Math.abs(x - lassoFrom.x), Math.abs(y - lassoFrom.y));
        x = lassoFrom.x + Math.sign(x - lassoFrom.x || 1) * side;
        y = lassoFrom.y + Math.sign(y - lassoFrom.y || 1) * side;
      }
      lassoing = [lassoFrom, { x, y: lassoFrom.y }, { x, y }, { x: lassoFrom.x, y }];
    } else if (press === "lasso" && lassoing && event.shiftKey) {
      // Shift draws a straight edge from where it went down, at the nearest 45 degrees.
      shiftFrom ??= lassoing.length;
      const from = lassoing[shiftFrom - 1] as Point;
      lassoing = [...lassoing.slice(0, shiftFrom), snapLine(from, at)];
    } else if ((press === "lasso" || press === "path") && lassoing) {
      // Letting go of Shift goes back to drawing freehand from the straight edge's end.
      shiftFrom = null;
      // Points closer than a pixel add nothing to the outline but length.
      const last = lassoing[lassoing.length - 1];
      if (!last || Math.hypot(at.x - last.x, at.y - last.y) >= 2) lassoing.push(at);
    } else if (press === "move" && lastMove && hold) {
      const layer = currentLayer();
      if (layer && hold.grab.kind === "move") shiftSelection(layer.canvas, at.x - lastMove.x, at.y - lastMove.y);
      else if (layer) {
        transformTo(hold, at, event.shiftKey);
        showFloat(layer.canvas);
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
    const layer = currentLayer();
    if (was === "text") {
      if (held) textRelease(held);
      return;
    }
    // A straight line selection carries on until it is closed.
    if (was === "polygon") return;
    lassoFrom = null;
    shiftFrom = null;
    if (was === "lasso") finishLasso();
    else if (was === "path") finishPath();
    else if (was && layer) save(id, layer);
  };
  // A double click ends a straight line selection, joining its last corner to its first.
  canvas.addEventListener("dblclick", () => {
    if (active === id && polygon && polygon.length >= 3) closePolygon();
  });
  // A picture dropped on the open drawing comes in as a layer of its own.
  canvas.addEventListener("dragover", (event) => {
    if (active === id && event.dataTransfer?.types.includes("Files")) event.preventDefault();
  });
  canvas.addEventListener("drop", (event) => {
    if (active !== id) return;
    const file = [...(event.dataTransfer?.files ?? [])].find((one) => one.type.startsWith("image/"));
    if (!file) return;
    event.preventDefault();
    importImage(file);
  });
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

/** Lets go of the open drawing, leaving the tools out for the next. */
function release(): void {
  finishEditing();
  dropSelection();
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

/** Returns the open drawing's canvas, where its layers are shown stacked. */
function activeCanvas(): HTMLCanvasElement | null {
  return active ? (frames.get(active)?.canvas ?? null) : null;
}

/** Returns the open drawing's layers. */
function activeDoc(): Doc | null {
  return active ? (frames.get(active)?.doc ?? null) : null;
}

/** Returns the layer being drawn on. */
function currentLayer(): Layer | null {
  return activeDoc()?.current ?? null;
}

/** Returns whether the layer being drawn on can take paint, saying why under the drawing when not. */
function canDraw(): boolean {
  const layer = currentLayer();
  if (!layer) return false;
  if (layer.locked) setStatus(`${layer.name} is locked`);
  else if (!layer.visible) setStatus(`${layer.name} is hidden`);
  else if (layer.text) askToFlatten(layer);
  return !layer.locked && layer.visible && !layer.text;
}

/**
 * Asks whether to turn a text layer into plain pixels, which paint can go
 * on. Its words stop being editable, so it is asked rather than done.
 */
function askToFlatten(layer: Layer): void {
  askQuestion(`Turn ${layer.name} into pixels so it can be painted on? Its text will no longer be editable.`, "Turn into pixels", () => {
    if (!active) return;
    remember([]);
    layer.text = null;
    save(active, layer);
    refreshLayers();
    syncToolbar();
  });
}

let statusNote: HTMLElement | null = null;
let statusTimer = 0;
const STATUS_MS = 3000;

/**
 * Shows a short message just under the open drawing, where it does not
 * widen the toolbar. It clears itself, unless told to stay: while an upload
 * is under way, or until a gradient's path is drawn.
 */
function setStatus(text: string, stay = text === "Uploading"): void {
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

/** Puts the open drawing on the clipboard as a PNG, ready to paste into chat. */
function copyPicture(): void {
  const canvas = activeCanvas();
  if (!canvas) return;
  // The whole picture is now the newer copy, so Ctrl+V brings that in.
  clipboardFresh = false;
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
  finishEditing();
  // Undo works on whole layers, which lifted pixels are not part of until put
  // down. The outline stays: each step keeps the one it had, and puts it back.
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
  const now = snapshot(doc, state.pixels.map(({ layer }) => layer));
  if (back) redoStack.push(now);
  else undoStack.push(now);
  restore(doc, state);
  const canvas = activeCanvas();
  const first = doc.layers[0];
  // The shown canvas follows its layers, should the step cross a change of shape.
  if (canvas && first && (canvas.width !== first.canvas.width || canvas.height !== first.canvas.height)) {
    canvas.width = first.canvas.width;
    canvas.height = first.canvas.height;
  }
  picked.clear();
  render();
  // Text layers are drawn again from their words, which the step may have changed.
  save(active, ...state.pixels.map(({ layer }) => layer), ...doc.layers.filter((layer) => layer.text));
  refreshLayers();
  syncToolbar();
}

/** Takes back a change this script made to the note's text, putting back exactly what was there. */
function undoEdit(edit: Exclude<Step, DocState>): void {
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
  if (!canvas || !active) return;
  for (const { layer, image } of edit.images) {
    layer.canvas.width = image.width;
    layer.canvas.height = image.height;
    layer.canvas.getContext("2d")?.putImageData(image, 0, 0);
  }
  for (const { layer, text } of edit.texts ?? []) layer.text = { ...text };
  const first = edit.images[0]?.image;
  if (first) {
    canvas.width = first.width;
    canvas.height = first.height;
  }
  render();
  save(active, ...edit.images.map(({ layer }) => layer));
  redoStack = [];
  syncToolbar();
}

/** Empties the layer being drawn on. */
function clearPicture(): void {
  dropSelection();
  const layer = currentLayer();
  if (!layer || !active || !canDraw()) return;
  remember();
  layer.canvas.getContext("2d")?.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
  render();
  save(active, layer);
}

/** Returns every layer's pixels, to put back should a change of shape be undone. */
function allImages(doc: Doc): { layer: Layer; image: ImageData }[] {
  return snapshot(doc, doc.layers).pixels;
}

/**
 * Turns the open drawing a quarter turn clockwise, every layer of it.
 * Landscape becomes portrait and back, so its lines in the note are re-cut
 * to the new shape; a square stays a square. Undo turns it back, lines and all.
 */
function rotatePicture(): void {
  dropSelection();
  const body = noteBody();
  const block = active ? blockFor(active) : null;
  const canvas = activeCanvas();
  const doc = activeDoc();
  if (!body || !block || !canvas || !doc || !active) return;
  const turned: ShapeKey = block.shape === "l" ? "p" : block.shape === "p" ? "l" : "s";
  const oldText = body.value.slice(block.start, block.end);
  const images = allImages(doc);
  const texts = doc.layers.flatMap((layer) => (layer.text ? [{ layer, text: { ...layer.text } }] : []));

  for (const layer of doc.layers) {
    const copy = copyOf(layer.canvas, true);
    if (layer.text) {
      // The text's middle turns with the picture, and the text turns with it.
      const middle = middleOfText(layer.text);
      const { width, height } = measureText(layer.text);
      layer.text.x = copy.height - middle.y - width / 2;
      layer.text.y = middle.x - height / 2;
      layer.text.angle += Math.PI / 2;
    }
    layer.canvas.width = copy.height;
    layer.canvas.height = copy.width;
    const context = layer.canvas.getContext("2d");
    if (!context) continue;
    // A quarter turn clockwise about the top left, then across by the new
    // width, so the old top left corner lands at the new top right.
    context.translate(layer.canvas.width, 0);
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
  // A drawing from before shapes had their own sizes is brought to its shape's size.
  const frame = frames.get(active);
  if (frame) fitShape(frame, turned);
  render();
  save(active, ...doc.layers);
  syncToolbar();
}

/** Changes the open drawing's shape, in the note and on every layer. */
function setShape(shape: ShapeKey): void {
  dropSelection();
  const body = noteBody();
  const block = active ? blockFor(active) : null;
  const frame = active ? frames.get(active) : null;
  if (!body || !block || !frame || !active) return;
  if (block.shape === shape && block.named) return;
  const oldText = body.value.slice(block.start, block.end);
  const newText = blockText(active, shape, linesToReserve(body, shape));
  const images = allImages(frame.doc);
  replaceText(body, block.start, block.end, newText);
  undoStack.push({ kind: "reshaped", id: active, oldText, images });
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  redoStack = [];
  if (fitShape(frame, shape)) save(active, ...frame.doc.layers);
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
  for (const popup of document.querySelectorAll<HTMLElement>(`#${TOOLBAR_ID} .doodle-popup, #${TOOLBAR_ID} .doodle-float`)) {
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
  popup.classList.add("doodle-popup");
  popup.dataset.popup = name;
  popup.hidden = true;
  button.addEventListener("click", () => togglePopup(name));
  holder.append(button, popup);
  return holder;
}

/** Returns whether a colour is close enough to the sliders' blue to be lost on it. */
function nearMarker(hex: string): boolean {
  const [r, g, b] = rgbOf(hex);
  return Math.hypot(r - MARKER_BLUE[0], g - MARKER_BLUE[1], b - MARKER_BLUE[2]) < NEAR_MARKER;
}

/** Returns a slider in its popup's box, with room either side for the brush ring. */
function sliderBox(range: HTMLInputElement): HTMLElement {
  const box = document.createElement("div");
  box.className = "doodle-slider";
  box.style.padding = `0 ${SLIDER_PAD}px`;
  range.type = "range";
  range.classList.add("doodle-range");
  range.style.width = `${SLIDER_WIDTH}px`;
  box.appendChild(range);
  return box;
}

/** The toolbar's rows, and what goes in each over the note and in full screen. */
let toolbarLayouts: { rows: HTMLElement[]; notes: HTMLElement[][]; full: HTMLElement[][] } | null = null;

/** Fills the toolbar's rows for the view in use, and shows only the options the tool uses. */
function arrangeToolbar(bar: HTMLElement): void {
  if (!toolbarLayouts) return;
  const { rows } = toolbarLayouts;
  const view = full && !isMobileView() ? "full" : "notes";
  if (bar.dataset.layout !== view) {
    bar.dataset.layout = view;
    closePopups();
    toolbarLayouts[view].forEach((parts, index) => rows[index]?.replaceChildren(...parts));
  }
  // Move is the lasso's, and the lasso has no options.
  for (const holder of bar.querySelectorAll<HTMLElement>("[data-for]")) {
    // Full screen on a computer shows the toolbar's colour whatever the tool; the top bar's options never do.
    const always = view === "full" && !holder.closest(".doodle-top-bar");
    setHidden(holder, !always && !(holder.dataset.for ?? "").split(" ").includes(tool));
  }
  // While a gradient's path is awaited, the top bar asks for it in place of the tool's options.
  const top = topBarElement();
  const prompt = top?.querySelector<HTMLElement>(".doodle-path-prompt");
  if (top && prompt) {
    for (const child of top.children) if (child !== prompt && drawingPath) setHidden(child as HTMLElement, true);
    setHidden(prompt, !drawingPath);
  }
  // The top bar shows only while it has something in it.
  if (top) setHidden(top, ![...top.children].some((child) => !(child as HTMLElement).hidden));
  for (const row of rows) {
    setHidden(row, ![...row.children].some((child) => !(child as HTMLElement).hidden));
  }
}

/** Brings the toolbar's buttons in line with the chosen colour, size, opacity, tool and shape. */
function syncToolbar(): void {
  const bar = document.getElementById(TOOLBAR_ID);
  if (!bar) return;
  arrangeToolbar(bar);
  const swatch = bar.querySelector<HTMLElement>(".doodle-colour:not(.doodle-text-colour)");
  if (swatch) swatch.style.background = useGradient ? gradientCss(gradient) : colour;
  syncTextOptions(bar);
  // A straight line selection left open is let go with the lasso.
  if (polygon && tool !== "lasso") {
    polygon = null;
    lassoing = null;
    antsVersion += 1;
  }
  // Typing ends when another tool is picked.
  if (tool !== "text" && editing) finishEditing();
  for (const option of bar.querySelectorAll<HTMLElement>("[data-reads-all]")) {
    option.classList.toggle(ON_CLASS, option.dataset.readsAll === String(bucketReadsAll));
  }
  // [ and ] reach past both ends of the slider, which then rests at its end.
  const along = Math.max(0, Math.min(1, (size - SIZE_MIN) / (SIZE_MAX - SIZE_MIN)));
  const sizeRange = bar.querySelector<HTMLInputElement>("[data-brush-size]");
  if (sizeRange && document.activeElement !== sizeRange) sizeRange.value = String(size);
  const dot = bar.querySelector<HTMLElement>(".doodle-size span");
  // Scaled into the button: the largest brush is wider than the button is.
  const shownDot = 3 + along * 15;
  if (dot) dot.style.width = dot.style.height = `${Math.round(shownDot)}px`;
  // A gradient's previews show its starting colour.
  const paint = useGradient
    ? (gradient.stops.reduce((first, stop) => (stop.at < first.at ? stop : first)).colour)
    : colour;
  const brush = bar.querySelector<HTMLElement>(".doodle-brush");
  if (brush) {
    // The eraser clears to the paper, shown as white.
    const ink = tool === "eraser" ? BACKGROUND : paint;
    // Solid while it fits inside the marker with a rim of blue to spare;
    // past that a ring, so the marker shows through it.
    const ring = size > THUMB_SIZE - 4;
    brush.style.left = `${SLIDER_PAD + THUMB_SIZE / 2 + along * (SLIDER_WIDTH - THUMB_SIZE)}px`;
    brush.style.width = brush.style.height = `${size}px`;
    brush.classList.toggle("doodle-brush-ring", ring);
    brush.style.borderColor = ink;
    brush.style.background = ring ? "transparent" : nearMarker(ink) ? "#000" : ink;
  }
  const hardDot = bar.querySelector<HTMLElement>(".doodle-hard-dot");
  if (hardDot) {
    const ink = tool === "eraser" ? BACKGROUND : nearMarker(paint) ? "#ffffff" : paint;
    const rgb = rgbOf(ink).join(", ");
    // The slider stands with its top end hard, so the marker sits higher the harder the brush.
    hardDot.style.top = `${SLIDER_PAD + THUMB_SIZE / 2 + (1 - hardness) * (SLIDER_WIDTH - THUMB_SIZE)}px`;
    hardDot.style.background =
      `radial-gradient(circle closest-side, rgb(${rgb}) ${Math.round(hardness * 100)}%, rgba(${rgb}, 0) 100%)`;
  }
  const fade = bar.querySelector<HTMLElement>(".doodle-opacity-range");
  fade?.style.setProperty("--doodle-fill", `rgba(${MARKER_BLUE.join(", ")}, ${opacity})`);
  for (const button of bar.querySelectorAll<HTMLElement>("[data-tool]")) {
    // The lasso stays lit while its Move is in use.
    const on = button.dataset.tool === tool || (button.dataset.tool === "lasso" && tool === "move");
    button.classList.toggle(ON_CLASS, on);
  }
  const smoothButton = bar.querySelector<HTMLElement>(".doodle-smooth");
  if (smoothButton && smoothButton.dataset.level !== String(smoothing)) {
    smoothButton.dataset.level = String(smoothing);
    smoothButton.innerHTML = svgIcon(SMOOTH_ICONS[smoothing] ?? "");
  }
  for (const option of bar.querySelectorAll<HTMLElement>("[data-smooth]")) {
    option.classList.toggle(ON_CLASS, option.dataset.smooth === String(smoothing));
  }
  const lassoButton = bar.querySelector<HTMLElement>(".doodle-lasso-btn");
  if (lassoButton && lassoButton.dataset.mode !== lassoMode) {
    lassoButton.dataset.mode = lassoMode;
    lassoButton.innerHTML = svgIcon(LASSO_ICONS[lassoMode]);
  }
  for (const option of bar.querySelectorAll<HTMLElement>("[data-lasso-mode]")) {
    option.classList.toggle(ON_CLASS, option.dataset.lassoMode === lassoMode);
  }
  const tipButton = bar.querySelector<HTMLElement>(".doodle-tip");
  if (tipButton && tipButton.dataset.tip !== tip) {
    tipButton.dataset.tip = tip;
    tipButton.innerHTML = svgIcon(TIP_ICONS[tip]);
  }
  for (const option of bar.querySelectorAll<HTMLElement>("[data-tip]:not(.doodle-tip)")) {
    option.classList.toggle(ON_CLASS, option.dataset.tip === tip);
  }
  for (const option of bar.querySelectorAll<HTMLButtonElement>("[data-needs]")) {
    option.disabled = option.dataset.needs === "selection" ? !selection : !clipboard;
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
  text: "M4 3H20V8.5H18.5L17.6 6H13.5V19H16V21H8V19H10.5V6H6.4L5.5 8.5H4Z",
};

/** The smoothing levels' icons: a scribbled wave, a deep hand-drawn one, and a gentle clean one. */
const SMOOTH_LINE = `fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"`;
const SMOOTH_ICONS = [
  `<path d="M3.6 16.2C3.2 14.6 4.4 14.8 4.2 13.2 4 11.6 5.4 12 5.6 10.4 5.8 8.8 7.2 9.6 7.8 8.2 8.4 6.8 9.6 8.4 10.4 7.8 11.4 7.1 11.2 9.2 11.8 10 12.4 10.8 11.4 12 12.2 13 13 14 12.4 15.4 13.6 16.2 14.6 16.9 14.4 18.6 15.8 18.6 17.2 18.6 17.2 17.2 18.2 16.6 19.2 16 18.6 14.6 19.6 13.8 20.6 13 19.8 11.6 20.4 10.4" ${SMOOTH_LINE}/>`,
  `<path d="M4 15.5C3.6 10.5 6.6 6.4 9.6 8.3 12.4 10.1 12 17.6 15.6 18.4 18.6 19 20.4 14.6 20.2 10" ${SMOOTH_LINE}/>`,
  `<path d="M3 13.5C6.5 8.5 9 8.5 12 12S17.5 15.5 21 10.5" ${SMOOTH_LINE}/>`,
];
const SMOOTH_LABELS = ["Smoothing off", "Smoothing medium", "Smoothing high"];

/** The brush tips' icons: a stroke with round ends, one drawn to a point at each end, and a square swept on a slant. */
const TIP_ICONS: Record<Tip, string> = {
  round: `<path d="M5.5 17.5 18.5 6.5" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>`,
  taper: "M3 19.5C8 13 14 7.5 21 4.5 16 9.5 10 15 3 19.5Z",
  square: "M2 13 14 5H21V12L9 20H2Z",
};
const TIP_LABELS: Record<Tip, string> = { round: "Round tip", taper: "Tapered tip", square: "Square tip" };

/** The lasso's ways of selecting, and their icons and names. */
const LASSO_ICONS: Record<LassoMode, string> = {
  free: ICONS.lasso,
  // A dashed box, like the selection it draws.
  rect: `<rect x="3.5" y="5.5" width="17" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2"/>`,
  // The lasso, its loop a burst of straight-edged spikes.
  polygon: `<path d="M22.1 6.3L18.7 9.1L19.2 11.7L15.8 12.1L13.4 15.4L11.7 12.6L8 13.3L9.5 10.3L6.9 8.4L10.8 6.8L11.9 4.1L14.7 4.8L18.4 2.4L18.2 5.8Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
<path d="M8.6 13.4C6.6 12.8 4.4 13.9 4.5 15.9 4.6 17.8 7.2 18.4 8.3 17 9.4 15.5 8.2 13.6 6.7 14.3 5.6 14.9 6.2 16.9 6.7 18.2 7.2 19.6 6.5 21.4 4.4 22.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
};
const LASSO_LABELS: Record<LassoMode, string> = {
  free: "Lasso",
  rect: "Rectangle select",
  polygon: "Straight line select",
};

/**
 * Returns the lasso button with its options. A tap picks the lasso and lets
 * go of any selection; holding it on a touch screen, or hovering where the
 * pointer can, brings up Move, Copy, Cut and Paste.
 */
function lassoTool(): HTMLElement {
  // Set when a hold has opened the options, so the click that ends it does
  // not also let go of the selection.
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
  const option = (label: string, icon: string, run: () => void, needs: "selection" | "clipboard") => {
    const choice = iconButton(label, icon, () => {
      closePopups();
      run();
    });
    choice.dataset.needs = needs;
    return choice;
  };
  const move = option("Move", ICONS.move, () => {
    tool = "move";
    syncToolbar();
  }, "selection");
  move.dataset.tool = "move";
  // How the lasso selects: picking one picks the lasso too.
  const modes = (Object.keys(LASSO_LABELS) as LassoMode[]).map((mode) => {
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
    option("Paste", ICONS.paste, pasteSelection, "clipboard"),
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
  // A long press on a phone asks for the right-click menu.
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
    // A moment's grace, to cross the gap between the button and its options.
    closing = window.setTimeout(() => {
      options.hidden = true;
    }, 300);
  });
  return holder;
}

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

// ---- Menus that float free of the toolbar ----

/**
 * Opens a menu fixed to the screen beside the button that opened it: below,
 * or above when there is no room below, and kept on screen. Fixed, rather
 * than placed inside its pop-up, so a pop-up that scrolls does not cut it off.
 */
function placeFloating(menu: HTMLElement, anchor: HTMLElement): void {
  menu.hidden = false;
  const place = anchor.getBoundingClientRect();
  const left = Math.max(4, Math.min(place.left, innerWidth - menu.offsetWidth - 4));
  let top = place.bottom + 4;
  if (top + menu.offsetHeight > innerHeight - 4) top = Math.max(4, place.top - menu.offsetHeight - 4);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

/** Closes every floating menu but one. */
function closeFloating(except: HTMLElement | null = null): void {
  for (const menu of document.querySelectorAll<HTMLElement>(`#${TOOLBAR_ID} .doodle-float`)) {
    if (menu !== except) menu.hidden = true;
  }
}

/** Returns a button that opens a floating menu, or closes it when it is open. */
function withFloating(button: HTMLButtonElement, menu: HTMLElement, onOpen: () => void = () => {}): HTMLElement {
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

// ---- Choosing a colour ----

/** What a colour chooser shows: the swatches, the custom picker, or the gradient editor. */
type ChooserView = "grid" | "custom" | "gradient";

/**
 * Returns a colour chooser: recent custom colours along the top, the buttons
 * for a custom colour and (for the pen) a gradient at its top right, and the
 * swatches under them. pick gets the colour chosen (null for none, where none
 * is offered) and whether the choice is made, rather than still being dragged
 * about on the picker.
 */
function colourChooser(options: {
  pick: (hex: string | null, done: boolean) => void;
  current: () => string | null;
  none?: boolean;
  gradient?: boolean;
  /** Runs when a drag about the custom picker ends. */
  settle?: () => void;
}): HTMLElement {
  const element = document.createElement("div");
  element.className = "doodle-chooser";
  let view: ChooserView = "grid";

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
      }),
    );
  };
  drawRecent();
  watchRecent(drawRecent);
  if (options.none) {
    // No colour: white crossed through from its top right corner to its bottom left.
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

  // A drag about the picker is one choice: the first colour it settles on
  // starts a recent colour, and each after that takes its place.
  let started = false;
  const picker = colourPicker(
    (hex) => options.pick(hex, false),
    (hex) => {
      keepRecent(hex, started);
      options.settle?.();
      started = true;
    },
  );
  picker.element.hidden = true;

  const views: Partial<Record<ChooserView, HTMLElement>> = { grid, custom: picker.element };
  const buttons: Partial<Record<ChooserView, HTMLButtonElement>> = {};
  const show = (next: ChooserView) => {
    // A second press on the open view's button goes back to the swatches.
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
  let editor: ReturnType<typeof gradientEditor> | null = null;
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
      },
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
  element.append(top, grid, picker.element, ...(editor ? [editor.element] : []));
  return element;
}

// ---- The layers panel ----

/** The layers picked for merging. */
const picked = new Set<Layer>();
/** The thumbnail of each layer in the open panel. */
const thumbs = new Map<Layer, HTMLCanvasElement>();
/** The layers panel, and the background's thumbnail and colour button in it. */
let layersBox: HTMLElement | null = null;
let backgroundThumb: HTMLCanvasElement | null = null;
let backgroundButton: HTMLElement | null = null;
/** A thumbnail's width, in shown pixels; drawn at twice that, for sharpness. */
const THUMB_WIDE = 40;

/** Draws a thumbnail of a layer, or of the background when given none. */
function drawThumb(thumb: HTMLCanvasElement, layer: Layer | null): void {
  const canvas = activeCanvas();
  const doc = activeDoc();
  if (!canvas || !doc) return;
  const width = THUMB_WIDE * 2;
  const height = Math.round((width * canvas.height) / canvas.width);
  if (thumb.width !== width) thumb.width = width;
  if (thumb.height !== height) thumb.height = height;
  thumb.style.width = `${THUMB_WIDE}px`;
  thumb.style.height = `${height / 2}px`;
  const context = thumb.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, width, height);
  if (layer) context.drawImage(layer.canvas, 0, 0, width, height);
  else if (doc.background) {
    context.fillStyle = doc.background;
    context.fillRect(0, 0, width, height);
  }
}

/** Redraws the thumbnails of some layers, where the panel is showing them. */
function refreshThumbs(layers: Layer[]): void {
  for (const layer of layers) {
    const thumb = thumbs.get(layer);
    if (thumb) drawThumb(thumb, layer);
  }
}

/** Makes a layer the one drawn on. */
function setCurrent(layer: Layer): void {
  const doc = activeDoc();
  if (!doc || !active || doc.current === layer) return;
  if (editing && editing.layer !== layer) finishEditing();
  // Lifted pixels belong to the layer they were lifted from; the outline carries over.
  putDownFloat();
  doc.current = layer;
  picked.clear();
  save(active);
  refreshLayers();
  // The text options show the picked text layer's look.
  syncToolbar();
}

/** Adds a layer to the ones picked for merging, or takes it out. */
function togglePick(layer: Layer): void {
  const doc = activeDoc();
  if (!doc) return;
  // Picking starts from the layer drawn on, as in Photoshop.
  if (picked.size === 0 && layer !== doc.current) picked.add(doc.current);
  if (picked.has(layer)) picked.delete(layer);
  else picked.add(layer);
  refreshLayers();
}

/** Puts a new layer just above the one drawn on and draws on it. Returns it. */
function addLayer(doc: Doc, name = `Layer ${doc.next}`): Layer {
  const canvas = activeCanvas();
  const layer = newLayer(name, canvas?.width ?? 1, canvas?.height ?? 1);
  if (name === `Layer ${doc.next}`) doc.next += 1;
  doc.layers.splice(doc.layers.indexOf(doc.current) + 1, 0, layer);
  doc.current = layer;
  picked.clear();
  return layer;
}

/** Says so, and returns false, when the open drawing has all the layers it may. */
function roomForLayer(doc: Doc): boolean {
  if (doc.layers.length < MAX_LAYERS) return true;
  setStatus(`A drawing can have ${MAX_LAYERS} layers at most`);
  return false;
}

/** Adds an empty layer above the one drawn on. */
function newLayerAbove(): void {
  const doc = activeDoc();
  if (!doc || !active || !roomForLayer(doc)) return;
  putDownFloat();
  remember([]);
  const layer = addLayer(doc);
  render();
  save(active, layer);
  refreshLayers();
}

/** Copies the layer drawn on, pixels and settings, to just above it. */
function duplicateLayer(): void {
  const doc = activeDoc();
  if (!doc || !active || !roomForLayer(doc)) return;
  putDownFloat();
  const from = doc.current;
  remember([]);
  const layer = addLayer(doc, `${from.name} copy`);
  Object.assign(layer, { ...propsOf(from), name: layer.name });
  layer.canvas.getContext("2d")?.drawImage(from.canvas, 0, 0);
  render();
  save(active, layer);
  refreshLayers();
}

/** Deletes the layer drawn on; a drawing always keeps one. */
function deleteLayer(): void {
  finishEditing();
  const doc = activeDoc();
  if (!doc || !active || doc.layers.length <= 1) return;
  putDownFloat();
  remember([]);
  const index = doc.layers.indexOf(doc.current);
  doc.layers.splice(index, 1);
  doc.current = doc.layers[Math.max(0, index - 1)] ?? (doc.layers[0] as Layer);
  picked.clear();
  render();
  save(active);
  refreshLayers();
}

/**
 * Merges the picked layers into the highest of them, as they look stacked
 * with their blend modes, opacity and clipping, and deletes the rest. Hidden
 * ones add nothing and go too.
 */
function mergeLayers(): void {
  finishEditing();
  const doc = activeDoc();
  if (!doc || !active) return;
  const merging = doc.layers.filter((layer) => picked.has(layer));
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
  doc.layers = doc.layers.filter((layer) => layer === top || !picked.has(layer));
  doc.current = top;
  picked.clear();
  render();
  save(active, top);
  refreshLayers();
}

/** Changes a layer's settings as one step undo can take back, then redraws. */
function changeLayer(layer: Layer, change: Partial<LayerProps>): void {
  if (!active) return;
  remember([]);
  Object.assign(layer, change);
  render();
  save(active);
  refreshLayers();
}

/**
 * Brings in a picture as a new layer above the one drawn on: shrunk to fit
 * when it is bigger than the drawing, centred, and floating like a paste, so
 * it can be moved into place before it settles.
 */
function importImage(file: Blob): void {
  const doc = activeDoc();
  const canvas = activeCanvas();
  const id = active;
  if (!doc || !canvas || !id || !roomForLayer(doc)) return;
  void loadImage(file).then((image) => {
    if (!image || active !== id) return;
    dropSelection();
    remember([]);
    const layer = addLayer(doc);
    // Room is left round a big one, for its corner handles and turning knob.
    const scale = Math.min(1, (canvas.width * IMPORT_FIT) / image.width, (canvas.height * IMPORT_FIT) / image.height);
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
      { x, y: y + height },
    ];
    selection = { path, float: newFloat({ canvas: piece, x, y }, path, copyOf(layer.canvas, true)) };
    antsVersion += 1;
    showFloat(layer.canvas);
    render();
    save(id, layer);
    tool = "move";
    syncToolbar();
    refreshLayers();
  });
}

/** The most of the drawing's width or height a brought-in picture takes at first. */
const IMPORT_FIT = 0.8;

/** Returns the layers panel, empty until it is first shown. */
function layersPanel(): HTMLElement {
  const box = document.createElement("div");
  box.className = "doodle-layers";
  layersBox = box;
  // A press elsewhere in the panel closes a blend or colour menu left open.
  box.addEventListener("pointerdown", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest(".doodle-float, [data-float-anchor]")) closeFloating();
  });
  return box;
}

/** Rebuilds the layers panel for the open drawing, while it is showing. */
function refreshLayers(): void {
  const box = layersBox;
  if (!box || box.closest<HTMLElement>(".doodle-popup")?.hidden !== false) return;
  const doc = activeDoc();
  thumbs.clear();
  if (!doc) {
    box.replaceChildren();
    return;
  }
  const list = document.createElement("div");
  list.className = "doodle-layer-list";
  const bottom = backgroundRow(doc);
  for (const layer of doc.layers.slice().reverse()) list.appendChild(layerRow(doc, layer, list));
  list.appendChild(bottom);
  box.replaceChildren(list, layerActions(doc));
}

/** Returns a small icon button for a layer's row. */
function miniButton(label: string, icon: string, onClick: () => void, on = false): HTMLButtonElement {
  const button = iconButton(label, icon, onClick, "doodle-mini");
  button.classList.toggle(ON_CLASS, on);
  return button;
}

/** Returns a layer's row: shown or hidden, thumbnail, name, opacity, clip, lock and blend mode. */
function layerRow(doc: Doc, layer: Layer, list: HTMLElement): HTMLElement {
  const row = document.createElement("div");
  row.className = "doodle-layer-row";
  row.classList.toggle("doodle-current", layer === doc.current);
  row.classList.toggle("doodle-picked", picked.has(layer));
  row.classList.toggle("doodle-clipped", layer.clip && doc.layers.indexOf(layer) > 0);

  const eye = miniButton(layer.visible ? "Hide layer" : "Show layer", layer.visible ? ICONS.eye : ICONS.eyeOff, () =>
    changeLayer(layer, { visible: !layer.visible }),
  );
  const thumb = document.createElement("canvas");
  thumb.className = "doodle-thumb";
  drawThumb(thumb, layer);
  thumbs.set(layer, thumb);

  const name = document.createElement("input");
  name.type = "text";
  name.className = "doodle-layer-name";
  name.value = layer.name;
  name.maxLength = 40;
  name.setAttribute("aria-label", "Layer name");
  name.addEventListener("input", () => {
    layer.name = name.value;
  });
  name.addEventListener("change", () => {
    if (!name.value.trim()) name.value = layer.name = `Layer ${doc.layers.indexOf(layer) + 1}`;
    if (active) save(active);
  });
  name.addEventListener("keydown", (event) => {
    if (event.key === "Enter") name.blur();
  });

  // Opacity: one undo step for each drag, however far it goes.
  const strength = document.createElement("input");
  strength.type = "range";
  strength.className = "doodle-range doodle-layer-opacity";
  strength.min = "0";
  strength.max = "100";
  strength.value = String(Math.round(layer.opacity * 100));
  strength.title = "Layer opacity";
  strength.style.setProperty("--doodle-fill", `rgba(0, 117, 255, ${layer.opacity})`);
  let sliding = false;
  strength.addEventListener("input", () => {
    if (!sliding) remember([]);
    sliding = true;
    layer.opacity = Number(strength.value) / 100;
    strength.style.setProperty("--doodle-fill", `rgba(0, 117, 255, ${layer.opacity})`);
    render();
  });
  strength.addEventListener("change", () => {
    sliding = false;
    if (active) save(active);
  });

  // The lowest layer has nothing under it to clip to.
  const clip = miniButton("Clip to the layer below", ICONS.clip, () => changeLayer(layer, { clip: !layer.clip }), layer.clip);
  clip.disabled = doc.layers.indexOf(layer) === 0;
  const lock = miniButton(layer.locked ? "Unlock layer" : "Lock layer", layer.locked ? ICONS.lock : ICONS.unlock, () =>
    changeLayer(layer, { locked: !layer.locked }), layer.locked);

  const blendButton = toolButton("", () => {}, "doodle-mini doodle-blend-btn");
  const blendName = BLENDS.find((one) => one.key === layer.blend)?.label ?? "Normal";
  blendButton.innerHTML = blendIcon(layer.blend, 18);
  blendButton.title = `Blend: ${blendName}`;
  blendButton.setAttribute("aria-label", `Blend mode, ${blendName}`);
  const menu = document.createElement("div");
  menu.className = "doodle-blend-menu";
  for (const blend of BLENDS) {
    const option = toolButton("", () => {
      menu.hidden = true;
      if (blend.key !== layer.blend) changeLayer(layer, { blend: blend.key as Blend });
    }, "doodle-blend-option");
    option.innerHTML = `${blendIcon(blend.key, 20)}<span>${blend.label}</span>`;
    option.classList.toggle(ON_CLASS, blend.key === layer.blend);
    menu.appendChild(option);
  }

  const main = document.createElement("div");
  main.className = "doodle-layer-main";
  const under = document.createElement("div");
  under.className = "doodle-layer-under";
  under.append(strength, clip, lock);
  main.append(name, under);
  row.append(eye, thumb, main, withFloating(blendButton, menu));
  holdRow(row, layer, doc, list);
  return row;
}

/**
 * Makes a press on a row pick that layer to draw on; with Ctrl or Cmd, or a
 * long press on a touch screen, add it to the layers picked for merging; and
 * a drag move it up or down the stack. On a touch screen only the thumbnail
 * drags, so the rest of the row still scrolls the panel.
 */
function holdRow(row: HTMLElement, layer: Layer, doc: Doc, list: HTMLElement): void {
  row.addEventListener("pointerdown", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (event.button !== 0 || target?.closest("button, input, .doodle-float")) return;
    const canDrag = event.pointerType === "mouse" || !!target?.closest(".doodle-thumb");
    const startY = event.clientY;
    const adding = event.ctrlKey || event.metaKey;
    let dragging = false;
    let held = false;
    const holding =
      event.pointerType === "mouse"
        ? 0
        : window.setTimeout(() => {
          held = true;
          togglePick(layer);
        }, HOLD_MS);
    if (canDrag) row.setPointerCapture(event.pointerId);
    const rows = () => [...list.querySelectorAll<HTMLElement>(".doodle-layer-row:not(.doodle-layer-bg)")];
    const order = rows();
    const moved = (move: PointerEvent) => {
      if (!canDrag) return;
      if (!dragging && Math.abs(move.clientY - startY) > DRAG_START_PX) {
        dragging = true;
        clearTimeout(holding);
        row.classList.add("doodle-layer-dragging");
      }
      if (!dragging) return;
      // The row goes before the first other row whose middle is below the pointer.
      const others = rows().filter((other) => other !== row);
      let index = others.findIndex((other) => {
        const place = other.getBoundingClientRect();
        return move.clientY < place.top + place.height / 2;
      });
      if (index < 0) index = others.length;
      // The other rows are moved round it, never the row itself: taking the
      // row out of the page, even to put it straight back, makes the browser
      // let go of the pointer it holds, which ended the drag after one place.
      const follows = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      for (const other of others.slice(0, index)) if (follows(row, other)) list.insertBefore(other, row);
      for (const other of others.slice(index).reverse()) if (follows(other, row)) list.insertBefore(other, row.nextSibling);
    };
    const ended = (end: PointerEvent) => {
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
          // The rows run top down; the layers bottom up.
          doc.layers = now.reverse().map((one) => doc.layers[order.length - 1 - order.indexOf(one)] as Layer);
          render();
          save(active);
        }
        refreshLayers();
        return;
      }
      if (adding) togglePick(layer);
      else setCurrent(layer);
    };
    row.addEventListener("pointermove", moved);
    row.addEventListener("pointerup", ended);
    row.addEventListener("pointercancel", ended);
  });
  row.addEventListener("contextmenu", (event) => event.preventDefault());
}

/** Returns the background's row: Layer 0, locked to the bottom, with its colour in place of a blend mode. */
function backgroundRow(doc: Doc): HTMLElement {
  const row = document.createElement("div");
  row.className = "doodle-layer-row doodle-layer-bg";
  const lockMark = miniButton("Always locked", ICONS.lock, () => {}, true);
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

  const swatch = toolButton("", () => {}, "doodle-mini doodle-bg-btn");
  swatch.setAttribute("aria-label", "Background colour");
  swatch.title = "Background colour";
  backgroundButton = swatch;
  showBackground(doc);
  // One undo step for each time the menu is opened, however much is tried in it.
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
    },
  });
  row.append(lockMark, thumb, main, withFloating(swatch, chooser, () => {
    changing = false;
  }));
  return row;
}

/** Shows the background's colour on its button and thumbnail. */
function showBackground(doc: Doc): void {
  if (backgroundButton) {
    backgroundButton.classList.toggle("doodle-none", doc.background === null);
    backgroundButton.style.background = doc.background ?? "";
  }
  if (backgroundThumb) drawThumb(backgroundThumb, null);
}

/** Returns the panel's buttons: add, copy, delete and merge layers, and bring in a picture. */
function layerActions(doc: Doc): HTMLElement {
  const row = document.createElement("div");
  row.className = "doodle-row doodle-layer-actions";
  const full = doc.layers.length >= MAX_LAYERS;
  const add = iconButton("New layer", ICONS.add, newLayerAbove);
  add.disabled = full;
  const copy = iconButton("Duplicate layer", ICONS.copy, duplicateLayer);
  copy.disabled = full;
  const remove = iconButton("Delete layer", ICONS.bin, deleteLayer);
  remove.disabled = doc.layers.length <= 1;
  const merge = iconButton(
    picked.size < 2 ? "Merge layers (Ctrl+click, or hold, to pick them)" : `Merge ${picked.size} layers`,
    ICONS.merge,
    mergeLayers,
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
  bring.disabled = full;
  row.append(add, copy, remove, merge, bring, file);
  return row;
}

/** Returns a slider for the text's look, one undo step for each drag. */
function lookSlider(attribute: string, min: number, max: number, apply: (value: number) => Partial<TextLook>): HTMLInputElement {
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

/**
 * Returns the text tool's options for the top bar: font, size, bold, italic,
 * underline, colour and outline. They change the picked text layer, and the
 * look new text takes.
 */
function textOptions(): HTMLElement[] {
  const colourButton = toolButton("", () => {}, "doodle-colour doodle-text-colour");
  colourButton.setAttribute("aria-label", "Text colour");
  colourButton.title = "Text colour";
  const colours = colourChooser({
    current: () => shownLook().colour,
    pick: (hex, done) => {
      if (!hex) return;
      changeLook({ colour: hex }, !done);
      if (done) closePopups();
    },
    settle: endLookSlide,
  });

  // Typing goes back to the text once a choice is made in the bar.
  const backToText = () => editing?.input.focus({ preventScroll: true });

  // Each font's name is shown in that font, the chosen one in the box too.
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
  // Each number typed shows at once; the whole of the typing is one undo step.
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

  const style = (key: "bold" | "italic" | "underline", label: string, letter: string) => {
    const button = toolButton(letter, () => toggleStyle(key), "torn-btn doodle-btn doodle-icon-btn doodle-style-btn");
    button.setAttribute("aria-label", label);
    button.title = label;
    button.dataset.style = key;
    return button;
  };

  // A hollow square in the outline's colour, as the fill colour is a solid one.
  const outlineButton = toolButton("", () => {}, "doodle-colour doodle-outline-btn");
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
    settle: endLookSlide,
  });
  const labelled = (words: string, range: HTMLInputElement) => {
    const label = document.createElement("label");
    label.className = "doodle-slider-label";
    label.append(words, range);
    return label;
  };
  outlineBox.append(
    toggle,
    outlineColour,
    labelled("Size", lookSlider("data-outline-size", 1, 30, (outlineSize) => ({ outlineSize, outline: true }))),
    labelled("Softness", lookSlider("data-outline-soft", 0, 100, (soft) => ({ outlineSoft: soft / 100, outline: true }))),
  );

  const items = [
    fonts,
    sizeInput,
    style("bold", "Bold", "B"),
    style("italic", "Italic", "I"),
    style("underline", "Underline", "U"),
    withPopup("text-colour", colourButton, colours),
    withPopup("outline", outlineButton, outlineBox),
  ];
  for (const item of items) item.dataset.for = "text";
  return items;
}

/** The smallest and largest text size that can be typed, in canvas pixels. */
const TEXT_SIZE_MIN = 4;
const TEXT_SIZE_MAX = 500;

/** Turns bold, italic or underline on or off for the text, as Ctrl+B, Ctrl+I and Ctrl+U do. */
function toggleStyle(key: "bold" | "italic" | "underline"): void {
  changeLook({ [key]: !shownLook()[key] });
}

/** The gap between the top bar and the drawing's top edge. */
const TOP_BAR_GAP = 6;

/** Returns the bar of the tool's own options along the drawing's top, once the toolbar is made. */
function topBarElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>(`#${TOOLBAR_ID} .doodle-top-bar`);
}

/**
 * Puts the top bar along the open drawing's top edge: just above it where
 * that can be seen, or else just inside it.
 */
function placeTopBar(): void {
  const bar = topBarElement();
  const canvas = activeCanvas();
  if (!bar || bar.hidden || !canvas) return;
  const place = canvas.getBoundingClientRect();
  // Over the note, the drawing is cut off at the top of the note's visible part.
  const limit = full ? 0 : (document.getElementById(LAYER_ID)?.getBoundingClientRect().top ?? 0);
  const above = place.top - bar.offsetHeight - TOP_BAR_GAP;
  const top = above >= limit ? above : Math.max(place.top, limit) + TOP_BAR_GAP;
  const left = Math.max(4, Math.min(place.left, innerWidth - bar.offsetWidth - 4));
  setStyle(bar, "left", `${left}px`);
  setStyle(bar, "top", `${top}px`);
}

/** Brings the text options in line with the look they show. */
function syncTextOptions(bar: HTMLElement): void {
  const look = shownLook();
  const swatch = bar.querySelector<HTMLElement>(".doodle-text-colour");
  if (swatch) swatch.style.background = look.colour;
  const font = bar.querySelector<HTMLSelectElement>(".doodle-font-select");
  if (font && font.value !== look.font) font.value = look.font;
  if (font) font.style.fontFamily = look.font;
  const sizeInput = bar.querySelector<HTMLInputElement>(".doodle-text-size");
  // Left alone while it is typed in, so a half-typed number is not overwritten.
  if (sizeInput && document.activeElement !== sizeInput) sizeInput.value = String(Math.round(look.size));
  for (const button of bar.querySelectorAll<HTMLElement>("[data-style]")) {
    button.classList.toggle(ON_CLASS, look[button.dataset.style as "bold" | "italic" | "underline"]);
  }
  const outline = bar.querySelector<HTMLElement>(".doodle-outline-btn");
  outline?.classList.toggle(ON_CLASS, look.outline);
  const ring = outline?.firstElementChild as HTMLElement | null | undefined;
  if (ring) ring.style.borderColor = look.outlineColour;
  bar.querySelector("[data-outline-toggle]")?.classList.toggle(ON_CLASS, look.outline);
  const ranges: [string, number][] = [
    ["data-outline-size", look.outlineSize],
    ["data-outline-soft", look.outlineSoft * 100],
  ];
  for (const [attribute, value] of ranges) {
    const range = bar.querySelector<HTMLInputElement>(`[${attribute}]`);
    // Left alone while it is being dragged, so it does not fight the pointer.
    if (range && document.activeElement !== range) range.value = String(Math.round(value));
  }
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
    if (!(event.target instanceof Element && event.target.closest("input, select"))) event.preventDefault();
  });

  // Colour: one swatch, opening the full set.
  const colourButton = toolButton("", () => {}, "doodle-colour");
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
    },
  });

  // Size: a dot showing it, opening a slider.
  const sizeButton = toolButton("", () => {}, "doodle-size");
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
  // The brush at its true size, laid over the marker.
  const brush = document.createElement("span");
  brush.className = "doodle-brush";
  slider.appendChild(brush);

  // Opacity: a slider whose marker fills in as the strokes do.
  const opacityButton = iconButton("Opacity", ICONS.opacity, () => {});
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

  // Hardness: a slider standing up, hard at the top and soft at the bottom.
  const hardButton = iconButton("Hardness", ICONS.feather, () => {});
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
  // A dot just inside the marker, its edge as soft as the brush's.
  const hardDot = document.createElement("span");
  hardDot.className = "doodle-hard-dot";
  hardBox.appendChild(hardDot);

  // Smoothing: the button shows the level in use, and opens all three,
  // the cleanest at the top.
  const smoothButton = iconButton("Smoothing", SMOOTH_ICONS[smoothing] ?? "", () => {});
  smoothButton.classList.add("doodle-smooth");
  const levels = document.createElement("div");
  for (const level of [2, 1, 0]) {
    const option = iconButton(SMOOTH_LABELS[level] ?? "", SMOOTH_ICONS[level] ?? "", () => {
      smoothing = level;
      closePopups();
      syncToolbar();
    });
    option.dataset.smooth = String(level);
    levels.appendChild(option);
  }

  // Tip: the button shows the tip in use, and opens all three.
  const tipButton = iconButton("Brush tip", TIP_ICONS.round, () => {});
  tipButton.classList.add("doodle-tip");
  const tips = document.createElement("div");
  for (const value of Object.keys(TIP_ICONS) as Tip[]) {
    const option = iconButton(TIP_LABELS[value], TIP_ICONS[value], () => {
      tip = value;
      closePopups();
      syncToolbar();
    });
    option.dataset.tip = value;
    tips.appendChild(option);
  }

  const option = (holder: HTMLElement, tools: string) => {
    holder.dataset.for = tools;
    return holder;
  };
  // Colour stays on the toolbar, as several tools use it; every other option
  // goes in the top bar, shown only for the tool it belongs to.
  const colourHolder = option(withPopup("colour", colourButton, grid), "pen bucket");
  const options = [
    option(withPopup("opacity", opacityButton, fader), "pen eraser bucket"),
    option(withPopup("size", sizeButton, slider), "pen eraser"),
    option(withPopup("hardness", hardButton, hardBox), "pen eraser"),
    option(withPopup("smooth", smoothButton, levels), "pen eraser"),
    option(withPopup("tip", tipButton, tips), "pen eraser"),
  ];
  const undo = iconButton("Undo", ICONS.undo, () => step(true));
  const redo = iconButton("Redo", ICONS.redo, () => step(false));

  // The bucket picks itself and opens its one setting: what it reads to find the area.
  const readsBox = document.createElement("div");
  for (const all of [false, true]) {
    const option = toolButton(all ? "Read all layers" : "Read current layer", () => {
      bucketReadsAll = all;
      closePopups();
      syncToolbar();
    });
    option.dataset.readsAll = String(all);
    readsBox.appendChild(option);
  }

  // Layers: the panel is built when it opens, and rebuilt as the layers change.
  const layersButton = iconButton("Layers", ICONS.layers, () => {});
  const layers = withPopup("layers", layersButton, layersPanel());
  layersButton.addEventListener("click", refreshLayers);

  const tools = [
    toolFor("Pen", ICONS.pen, "pen"),
    toolFor("Eraser", ICONS.eraser, "eraser"),
    withPopup("bucket", toolFor("Paint bucket", ICONS.bucket, "bucket"), readsBox),
    lassoTool(),
    toolFor("Text", ICONS.text, "text"),
    layers,
  ];
  const actions = [
    iconButton("New drawing", ICONS.newPage, newDrawing),
    iconButton("Copy", ICONS.copy, copyPicture),
    iconButton("Save", ICONS.download, askName),
    iconButton("Bin", ICONS.bin, () => confirmBin()),
    iconButton("Clear", ICONS.sweep, clearPicture),
    iconButton("Rotate", ICONS.rotate, rotatePicture),
    withPopup("shape", shapeButton, shapes),
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
    full: [[colourHolder, ...tools], [undo, redo, ...actions], []],
  };
  // Inside the toolbar, though placed by the drawing, so its pop-ups open and
  // close with the toolbar's own.
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
  const ratio = canvas.width / canvas.height;
  // The exit button sits off the drawing's top right corner: above it for a
  // landscape drawing, which fills the width and leaves no room at the side,
  // and beside it for a square or portrait one.
  const exitAbove = ratio > 1;
  const stage = canvas.parentElement;
  stage?.classList.toggle("doodle-exit-above", exitAbove);
  const roomWidth = innerWidth - FULL_MARGIN * 2 - (exitAbove ? 0 : EXIT_ROOM) - (below ? 0 : bar.offsetWidth + FULL_GAP);
  // With a tool that has options, room is kept above the drawing for its top bar.
  const topBar = topBarElement();
  const barLift = topBar && !topBar.hidden ? topBar.offsetHeight + TOP_BAR_GAP : 0;
  const lift = exitAbove ? Math.max(barLift, EXIT_ROOM) : barLift;
  if (stage && stage.style.marginTop !== `${lift}px`) stage.style.marginTop = `${lift}px`;
  const roomHeight = innerHeight - FULL_MARGIN * 2 - lift - (below ? bar.offsetHeight + FULL_GAP : 0);
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
 * The brush sizes [ and ] reach, in shown pixels: past both ends of the
 * slider, from the finest line drawn to one as wide as a thick marker.
 */
const BRACKET_MIN = 1;
const BRACKET_MAX = 150;

/** Makes the brush a step bigger or smaller, each step about a tenth of its size so small brushes still change finely. */
function changeSize(bigger: boolean): void {
  const change = Math.max(1, Math.round(size * 0.1));
  size = Math.max(BRACKET_MIN, Math.min(BRACKET_MAX, size + (bigger ? change : -change)));
  setStatus(`Brush size ${size}`);
  syncToolbar();
}

/** Returns what a key does on the open drawing, if it is one of its shortcuts. */
function shortcutFor(event: KeyboardEvent): (() => void) | null {
  const key = event.key.toLowerCase();
  const mod = event.ctrlKey || event.metaKey;
  if (mod && !event.shiftKey && key === "a") return selectLayer;
  // With the text tool, Ctrl+I is italic, handled before this.
  if (mod && !event.shiftKey && key === "i") return invertSelection;
  if (mod && !event.shiftKey && key === "x" && selection) return cutSelection;
  // With a selection, Copy takes that for Paste rather than the whole picture.
  if (mod) return key === "c" && !event.shiftKey ? (selection ? copySelection : copyPicture) : null;
  if ((key === "[" || key === "]") && (tool === "pen" || tool === "eraser")) {
    return () => changeSize(key === "]");
  }
  if (event.shiftKey) return null;
  const pick = (value: Tool) => () => {
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
      if (editing && event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finishEditing();
        return;
      }
      // Ctrl+B, Ctrl+I and Ctrl+U style the text, while typing it or with the text tool on the drawing.
      const styleKey = { b: "bold", i: "italic", u: "underline" }[event.key.toLowerCase()] as
        | "bold"
        | "italic"
        | "underline"
        | undefined;
      const inText = event.target instanceof Element && !!event.target.closest(".doodle-text-input");
      if (
        styleKey &&
        active &&
        tool === "text" &&
        (inText || onDrawing) &&
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        !event.altKey
      ) {
        event.preventDefault();
        event.stopPropagation();
        toggleStyle(styleKey);
        return;
      }
      // Typing in a box of this script's own is that box's business.
      if (
        event.key !== "Escape" &&
        event.target instanceof Element &&
        event.target.closest(`#${CONFIRM_ID}, #${TOOLBAR_ID} input, #${TOOLBAR_ID} select, .doodle-text-input`)
      ) {
        return;
      }
      // Working on the drawing, letters pick tools rather than type: the note
      // keeps the focus, so the letter would otherwise land in its text.
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
        // Working on the drawing: with a selection, either key clears it and
        // does nothing else. Without one, Backspace leaves the drawing be and
        // Delete is the bin.
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
      const typing =
        !event.ctrlKey && !event.metaKey && !event.altKey && (event.key === "Enter" || event.key.length === 1);
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

  // A picture pasted while working on the drawing comes in as a layer of its
  // own. Anything else pasted goes where it would have.
  document.addEventListener(
    "paste",
    (event) => {
      if (!active || !onDrawing) return;
      // Pasted into the text being typed, it is that text's business.
      if (event.target instanceof Element && event.target.closest(".doodle-text-input")) return;
      const item = [...(event.clipboardData?.items ?? [])].find((one) => one.type.startsWith("image/"));
      const file = item?.getAsFile();
      // A selection copied here, and nothing newer, goes back where it came
      // from, floating; so does one with no picture to paste instead.
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
    true,
  );
  window.addEventListener("blur", () => {
    clipboardFresh = false;
  });

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
