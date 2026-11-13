// Drawings inside the chat bar's Notes, on lines of their own.
//
// Torn's note body is a plain <textarea>, which cannot hold a picture. So the
// palette button writes a marker line, "[drawing 3f9a2c l]", followed by
// blank lines to make room, and a frame is laid over that spot from outside
// the textarea and kept on it as the note scrolls. Torn saves the marker and
// the blank lines like any other note text; the picture itself is kept in
// this browser, under the marker's id. A device without it shows the marker
// and the gap, and can draw a fresh one in it.
//
// Text edits go through execCommand, not by setting the value: that is the
// one way to change a textarea that its own undo can take back, so a drawing
// deleted with Backspace comes back with Ctrl+Z, as it would in Word.

import { log } from "./debug";
import { isMobileView, readPicture, writePicture } from "./storage";

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
const FRAME_CLASS = "doodle-frame";
const ACTIVE_CLASS = "doodle-active";
const ON_CLASS = "doodle-on";
/** Marks a drawing one more Backspace will delete. */
const ARMED_CLASS = "doodle-armed";

/** A marker line: the drawing's id, then its shape (none on the first drawings made). */
const MARKER = /^\[drawing ([a-z0-9]{4,12})(?: ([lps]))?\]$/;

type ShapeKey = "l" | "p" | "s";

/** A drawing's shape: its size in canvas pixels, and how tall it is shown in the note. */
interface Shape {
  width: number;
  height: number;
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

/** The size of Torn's own header icons beside it. */
const ICON_SIZE = 24;
/** White in dark mode too, so a pasted drawing reads the same anywhere. */
const BACKGROUND = "#ffffff";
/** Brush sizes in shown pixels: the slider's ends, and where it starts. */
const SIZE_MIN = 2;
const SIZE_MAX = 10;
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
let undoStack: ImageData[] = [];
let redoStack: ImageData[] = [];
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

/** Returns how many blank lines a drawing of a shape needs under its marker. */
function blankLinesNeeded(shape: ShapeKey, lineHeight: number): number {
  return Math.max(1, Math.ceil(SHAPES[shape].shown / lineHeight) - 1);
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
      // The drawing covers the blank lines it needs, never the text's last
      // line: the caret has to have somewhere to go after it.
      const needed = blankLinesNeeded(shape, lineHeight);
      let end = offset + line.length;
      let next = index + 1;
      while (next - index - 1 < needed && lines[next] === "" && next < lines.length - 1) {
        end += 1;
        next += 1;
      }
      mirror.textContent = body.value.slice(0, offset);
      const spot = document.createElement("span");
      spot.textContent = line;
      mirror.appendChild(spot);
      blocks.push({ id: match[1], shape, named: match[2] !== undefined, top: spot.offsetTop, start: offset, end });
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
  body.focus();
  body.setSelectionRange(start, end);
  const done = text === "" ? document.execCommand("delete") : document.execCommand("insertText", false, text);
  if (done) return;
  // Browsers that refuse execCommand still get the change, without the undo.
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(body, body.value.slice(0, start) + text + body.value.slice(end));
  body.dispatchEvent(new Event("input", { bubbles: true }));
  body.setSelectionRange(start + text.length, start + text.length);
}

/** Returns a drawing's marker line and the blank lines under it. */
function blockText(id: string, shape: ShapeKey, lineHeight: number): string {
  return `[drawing ${id} ${shape}]${"\n".repeat(blankLinesNeeded(shape, lineHeight))}`;
}

/** Puts a new drawing on its own line after the caret, and starts drawing on it. */
function insertDrawing(body: HTMLTextAreaElement): void {
  const value = body.value;
  const caret = document.activeElement === body ? body.selectionEnd : value.length;
  let lineEnd = value.indexOf("\n", caret);
  if (lineEnd === -1) lineEnd = value.length;
  const lineStart = value.lastIndexOf("\n", lineEnd - 1) + 1;

  const id = newId();
  const lead = lineEnd > lineStart ? "\n" : "";
  const text = `${lead}${blockText(id, DEFAULT_SHAPE, measure(body).lineHeight)}\n`;
  replaceText(body, lineEnd, lineEnd, text);
  log("notes draw: added drawing", id);
  activate(id);
}

/** Takes a drawing out of the note, as one edit the textarea's undo can bring back. */
function removeDrawing(id: string): void {
  const body = noteBody();
  const block = blockFor(id);
  if (!body || !block) return;
  // The picture stays stored, so undoing the deletion brings it back whole.
  if (active === id) deactivate();
  replaceText(body, block.start, Math.min(body.value.length, block.end + 1), "");
}

/** Returns a drawing's stored picture, or "" when this browser has none. */
function storedPicture(id: string): string {
  return readPicture(id);
}

/** Keeps a drawing's picture, saying so on the toolbar when the browser will not. */
function storePicture(id: string, canvas: HTMLCanvasElement): void {
  const picture = canvas.toDataURL("image/png");
  writePicture(id, picture);
  if (storedPicture(id) !== picture) setStatus("Not saved: browser storage is full");
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
  expand.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M3 3h7v2.5H6.8l4 4-1.8 1.8-4-4V11H2.5V3Zm18 0v8h-2.5V7.3l-4 4-1.8-1.8 4-4H13V3h8ZM3 21v-8h2.5v3.7l4-4 1.8 1.8-4 4H11V21H3Zm18 0h-8v-2.5h3.7l-4-4 1.8-1.8 4 4V13H21v8Z"/></svg>`;
  expand.addEventListener("click", (event) => {
    event.stopPropagation();
    enterFull();
  });
  element.append(canvas, expand);
  layer.appendChild(element);

  const picture = storedPicture(block.id);
  if (picture) {
    const image = new Image();
    // At its own size, not stretched: the first drawings were a wider shape.
    image.onload = () => canvas.getContext("2d")?.drawImage(image, 0, 0);
    image.src = picture;
  }
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
  context.putImageData(image, 0, 0);
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
      activate(id);
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
    if (drawing) stroke(point(event));
  });
  const finish = () => {
    if (!drawing) return;
    drawing = false;
    last = null;
    storePicture(id, canvas);
  };
  canvas.addEventListener("pointerup", finish);
  canvas.addEventListener("pointercancel", finish);
}

/** Opens a drawing for drawing on, with the toolbar above Notes. */
function activate(id: string): void {
  if (active !== id && full) exitFull();
  active = id;
  undoStack = [];
  redoStack = [];
  setStatus("");
  syncToolbar();
}

/** Closes the open drawing and the toolbar. */
function deactivate(): void {
  if (full) exitFull();
  closePopups();
  active = null;
  undoStack = [];
  redoStack = [];
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
      setStatus("Copy failed");
    });
}

/** Saves the open drawing as a PNG file. */
function downloadPicture(): void {
  const canvas = activeCanvas();
  if (!canvas || !active) return;
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = `drawing-${active}.png`;
  link.click();
}

/** Steps the open drawing back one change, or forward again. */
function step(back: boolean): void {
  const canvas = activeCanvas();
  const context = canvas?.getContext("2d");
  if (!canvas || !context || !active) return;
  const from = back ? undoStack : redoStack;
  const to = back ? redoStack : undoStack;
  const state = from.pop();
  if (!state) return;
  to.push(context.getImageData(0, 0, canvas.width, canvas.height));
  // A state from before a change of shape is the old size; the canvas follows it.
  if (canvas.width !== state.width || canvas.height !== state.height) {
    canvas.width = state.width;
    canvas.height = state.height;
  }
  context.putImageData(state, 0, 0);
  storePicture(active, canvas);
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
function setShape(shape: ShapeKey): void {
  const body = noteBody();
  const block = active ? blockFor(active) : null;
  const canvas = activeCanvas();
  if (!body || !block || !canvas || !active) return;
  if (block.shape === shape && block.named) return;
  replaceText(body, block.start, block.end, blockText(active, shape, measure(body).lineHeight));
  // The strokes before a change of shape stay undoable; stepping back to one
  // puts the canvas back to the size it was then.
  remember(canvas);
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
  if (dot) dot.style.width = dot.style.height = `${size + 2}px`;
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

/** Returns the bin's icon. */
function binIcon(): string {
  return `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Zm4 2v8h1.5v-8H10Zm2.5 0v8H14v-8h-1.5Z"/></svg>`;
}

/** Asks whether to bin a drawing, the open one by default, and bins it on Confirm. */
function confirmBin(id: string | null = active): void {
  if (!id) return;
  document.getElementById(CONFIRM_ID)?.remove();
  const panel = document.createElement("div");
  panel.id = CONFIRM_ID;
  const question = document.createElement("p");
  question.textContent = "Are you sure you want to bin this Masterpiece?";
  const buttons = document.createElement("div");
  buttons.className = "doodle-row";
  buttons.append(
    toolButton("Confirm", () => {
      panel.remove();
      removeDrawing(id);
    }),
    toolButton("Cancel", () => panel.remove()),
  );
  panel.append(question, buttons);
  document.body.appendChild(panel);
}

/** Returns the toolbar, made on first use. */
function toolbar(): HTMLElement {
  let bar = document.getElementById(TOOLBAR_ID);
  if (bar) return bar;
  bar = document.createElement("div");
  bar.id = TOOLBAR_ID;

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

  const toolFor = (label: string, value: Tool) => {
    const button = toolButton(label, () => {
      tool = value;
      syncToolbar();
    });
    button.dataset.tool = value;
    return button;
  };

  const bin = toolButton("", () => confirmBin(), "torn-btn doodle-btn doodle-bin");
  bin.setAttribute("aria-label", "Bin");
  bin.innerHTML = binIcon();
  const exit = toolButton("Exit", exitFull, "torn-btn doodle-btn doodle-exit");

  const status = document.createElement("span");
  status.className = "doodle-status";

  const row = document.createElement("div");
  row.className = "doodle-row";
  row.append(
    withPopup("colour", colourButton, grid),
    withPopup("size", sizeButton, slider),
    toolFor("Pen", "pen"),
    toolFor("Eraser", "eraser"),
    toolFor("Fill", "bucket"),
    withPopup("shape", shapeButton, shapes),
    toolButton("Undo", () => step(true)),
    toolButton("Redo", () => step(false)),
    toolButton("Clear", clearPicture),
    toolButton("Copy", copyPicture),
    toolButton("Save", downloadPicture),
    bin,
    exit,
    status,
  );
  bar.appendChild(row);
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
  stage.appendChild(canvas);
  cover.append(toolbar(), stage);
  document.body.appendChild(cover);
  syncToolbar();
  fitFull();
}

/** Puts the drawing back in its note. */
function exitFull(): void {
  if (!full) return;
  full = false;
  const frame = active ? frames.get(active) : null;
  if (frame) frame.element.prepend(frame.canvas);
  const bar = document.getElementById(TOOLBAR_ID);
  if (bar) document.body.appendChild(bar);
  document.getElementById(FULL_ID)?.remove();
  closePopups();
  syncToolbar();
}

/** Sizes the full-screen drawing to the room left beside the tools, keeping its shape. */
function fitFull(): void {
  const stage = document.querySelector<HTMLElement>(`#${FULL_ID} .doodle-stage`);
  const canvas = activeCanvas();
  if (!stage || !canvas) return;
  const ratio = canvas.width / canvas.height;
  let width = stage.clientWidth;
  let height = width / ratio;
  if (height > stage.clientHeight) {
    height = stage.clientHeight;
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
    if (active) {
      deactivate();
      return;
    }
    const body = noteBody();
    if (body) insertDrawing(body);
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
  if (icon.classList.contains(ACTIVE_CLASS) !== (active !== null)) {
    icon.classList.toggle(ACTIVE_CLASS, active !== null);
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
 */
function visibleBox(body: HTMLTextAreaElement): Box {
  const rect = body.getBoundingClientRect();
  const box: Box = {
    left: rect.left + body.clientLeft,
    top: rect.top + body.clientTop,
    right: rect.left + body.clientLeft + body.clientWidth,
    bottom: rect.top + body.clientTop + body.clientHeight,
  };
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
  const room = body.clientWidth - padding * 2;
  // Never taller than most of the note's window, however small it is made.
  const tallest = scrollerOf(body).clientHeight * 0.85;
  const originX = rect.left + body.clientLeft + padding - box.left;
  const originY = rect.top + body.clientTop - body.scrollTop - box.top;
  const shown = new Set<string>();
  for (const block of blocks) {
    shown.add(block.id);
    const shape = SHAPES[block.shape];
    const ratio = shape.width / shape.height;
    let height = Math.min(shape.shown, tallest);
    let width = height * ratio;
    if (width > room) {
      width = room;
      height = width / ratio;
    }
    const { element, canvas } = frameFor(block, container);
    if (reshape(canvas, block.shape)) storePicture(block.id, canvas);
    setStyle(element, "transform", `translate(${originX}px, ${originY + block.top}px)`);
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
  // A drawing whose marker was deleted, or is in another note, is put away.
  if (active && !shown.has(active)) deactivate();

  const bar = toolbar();
  if (full) return;
  setHidden(bar, active === null);
  const panel = document.querySelector(SELECTORS.panel);
  if (active && panel) {
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
 * Coming from below it is put back above the drawing, and from anywhere
 * else after it, so the arrow keys still step over one in both directions.
 */
function keepCaretOut(body: HTMLTextAreaElement): void {
  if (body.selectionStart !== body.selectionEnd) return;
  const caret = body.selectionStart;
  for (const { start, end } of measure(body).blocks) {
    if (caret < start || caret > end) continue;
    const target = lastCaret > end ? Math.max(0, start - 1) : Math.min(body.value.length, end + 1);
    body.setSelectionRange(target, target);
    lastCaret = target;
    return;
  }
  lastCaret = caret;
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
      if (event.key === "Escape" && active) {
        if (document.getElementById(CONFIRM_ID)) document.getElementById(CONFIRM_ID)?.remove();
        else if (full) exitFull();
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
        `#${TOOLBAR_ID}, #${LAYER_ID}, #${FULL_ID}, #${CONFIRM_ID}, #${ICON_ID}`,
      );
      if (target?.closest(`#${TOOLBAR_ID}`)) return;
      closePopups();
    },
    true,
  );
}
