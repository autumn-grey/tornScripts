// ==UserScript==
// @name         Autumn's Note Doodles
// @namespace    https://github.com/autumn-grey
// @version      1.0.0
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

  // src/autumns-note-doodles/storage.ts
  var PREFIX = "AND_DRAWING_";
  var OLD_PREFIX = "AUE_DRAWING_";
  var MOBILE_QUERY = "(max-width: 784px)";
  function isMobileView() {
    return matchMedia(MOBILE_QUERY).matches;
  }
  function readPicture(id) {
    try {
      return localStorage.getItem(PREFIX + id) ?? localStorage.getItem(OLD_PREFIX + id) ?? "";
    } catch {
      return "";
    }
  }
  function writePicture(id, picture) {
    try {
      localStorage.setItem(PREFIX + id, picture);
      localStorage.removeItem(OLD_PREFIX + id);
    } catch {
    }
  }

  // src/autumns-note-doodles/doodles.ts
  var SELECTORS = {
    panel: "#notes_panel",
    // The header is itself a button: icon, "Notes", minimise, maximise.
    header: "#notes_panel > button",
    minimize: '[class*="minimizeIcon___"]',
    body: "#notes_panel textarea",
    // The note picker's drop-down, which opens over the body.
    noteList: '#notes_panel [class*="list___"]'
  };
  var ICON_ID = "doodle-icon";
  var LAYER_ID = "doodle-layer";
  var TOOLBAR_ID = "doodle-toolbar";
  var FULL_ID = "doodle-full";
  var CONFIRM_ID = "doodle-confirm";
  var FRAME_CLASS = "doodle-frame";
  var ACTIVE_CLASS = "doodle-active";
  var ON_CLASS = "doodle-on";
  var ARMED_CLASS = "doodle-armed";
  var MARKER = /^\[drawing ([a-z0-9]{4,12})(?: ([lps]))?\]$/;
  var SHAPES = {
    l: { width: 720, height: 480, shown: 180, label: "Landscape" },
    p: { width: 480, height: 720, shown: 260, label: "Portrait" },
    s: { width: 600, height: 600, shown: 220, label: "Square" }
  };
  var DEFAULT_SHAPE = "l";
  var ICON_SIZE = 24;
  var BACKGROUND = "#ffffff";
  var SIZE_MIN = 2;
  var SIZE_MAX = 10;
  var SIZE_DEFAULT = 5;
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
  var tool = "pen";
  var undoStack = [];
  var redoStack = [];
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
  function measure(body) {
    const key = `${body.clientWidth}|${body.value}`;
    if (measured?.key === key) return measured;
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
    mirror.textContent = "M";
    const lineHeight = mirror.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) || 18;
    const blocks = [];
    const lines = body.value.split("\n");
    let offset = 0;
    lines.forEach((line, index) => {
      const match = MARKER.exec(line);
      if (match?.[1]) {
        const shape = match[2] ?? DEFAULT_SHAPE;
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
        blocks.push({ id: match[1], shape, named: match[2] !== void 0, top: spot.offsetTop, start: offset, end });
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
    body.focus();
    body.setSelectionRange(start2, end);
    const done = text === "" ? document.execCommand("delete") : document.execCommand("insertText", false, text);
    if (done) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(body, body.value.slice(0, start2) + text + body.value.slice(end));
    body.dispatchEvent(new Event("input", { bubbles: true }));
    body.setSelectionRange(start2 + text.length, start2 + text.length);
  }
  function blockText(id, shape, lineHeight) {
    return `[drawing ${id} ${shape}]${"\n".repeat(blankLinesNeeded(shape, lineHeight))}`;
  }
  function insertDrawing(body) {
    const value = body.value;
    const caret = document.activeElement === body ? body.selectionEnd : value.length;
    let lineEnd = value.indexOf("\n", caret);
    if (lineEnd === -1) lineEnd = value.length;
    const lineStart = value.lastIndexOf("\n", lineEnd - 1) + 1;
    const id = newId();
    const lead = lineEnd > lineStart ? "\n" : "";
    const text = `${lead}${blockText(id, DEFAULT_SHAPE, measure(body).lineHeight)}
`;
    replaceText(body, lineEnd, lineEnd, text);
    log("notes draw: added drawing", id);
    activate(id);
  }
  function removeDrawing(id) {
    const body = noteBody();
    const block = blockFor(id);
    if (!body || !block) return;
    if (active === id) deactivate();
    replaceText(body, block.start, Math.min(body.value.length, block.end + 1), "");
  }
  function storedPicture(id) {
    return readPicture(id);
  }
  function storePicture(id, canvas) {
    const picture = canvas.toDataURL("image/png");
    writePicture(id, picture);
    if (storedPicture(id) !== picture) setStatus("Not saved: browser storage is full");
  }
  function blank(canvas) {
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = BACKGROUND;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  function reshape(canvas, shape) {
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
    layer2.appendChild(element);
    const picture = storedPicture(block.id);
    if (picture) {
      const image = new Image();
      image.onload = () => canvas.getContext("2d")?.drawImage(image, 0, 0);
      image.src = picture;
    }
    wireCanvas(block.id, element, canvas);
    const frame = { element, canvas };
    frames.set(block.id, frame);
    return frame;
  }
  function rgbOf(hex) {
    const value = parseInt(hex.slice(1), 16);
    return [value >> 16 & 255, value >> 8 & 255, value & 255];
  }
  function floodFill(canvas, startX, startY, hex) {
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
    const like = (pixel) => {
      const i = pixel * 4;
      return Math.abs((data[i] ?? 0) - (target[0] ?? 0)) + Math.abs((data[i + 1] ?? 0) - (target[1] ?? 0)) + Math.abs((data[i + 2] ?? 0) - (target[2] ?? 0)) + Math.abs((data[i + 3] ?? 0) - (target[3] ?? 0)) <= FILL_TOLERANCE;
    };
    const done = new Uint8Array(width * height);
    const stack = [[x0, y0]];
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
  function remember(canvas) {
    const context = canvas.getContext("2d");
    if (!context) return;
    undoStack.push(context.getImageData(0, 0, canvas.width, canvas.height));
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    redoStack = [];
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
    let drawing = false;
    let last = null;
    const point = (event) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) * canvas.width / rect.width,
        y: (event.clientY - rect.top) * canvas.height / rect.height
      };
    };
    const stroke = (to) => {
      const context = canvas.getContext("2d");
      if (!context || !last) return;
      context.strokeStyle = tool === "eraser" ? BACKGROUND : colour;
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
  function activate(id) {
    if (active !== id && full) exitFull();
    active = id;
    undoStack = [];
    redoStack = [];
    setStatus("");
    syncToolbar();
  }
  function deactivate() {
    if (full) exitFull();
    closePopups();
    active = null;
    undoStack = [];
    redoStack = [];
  }
  function activeCanvas() {
    return active ? frames.get(active)?.canvas ?? null : null;
  }
  function setStatus(text) {
    const status = document.querySelector(`#${TOOLBAR_ID} .doodle-status`);
    if (status) status.textContent = text;
  }
  function copyPicture() {
    const canvas = activeCanvas();
    if (!canvas) return;
    const png = new Promise(
      (resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("no image")), "image/png")
    );
    navigator.clipboard.write([new ClipboardItem({ "image/png": png })]).then(() => setStatus("Copied")).catch((error) => {
      log("notes draw: copy failed", error);
      setStatus("Copy failed");
    });
  }
  function downloadPicture() {
    const canvas = activeCanvas();
    if (!canvas || !active) return;
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `drawing-${active}.png`;
    link.click();
  }
  function step(back) {
    const canvas = activeCanvas();
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !active) return;
    const from = back ? undoStack : redoStack;
    const to = back ? redoStack : undoStack;
    const state = from.pop();
    if (!state) return;
    to.push(context.getImageData(0, 0, canvas.width, canvas.height));
    if (canvas.width !== state.width || canvas.height !== state.height) {
      canvas.width = state.width;
      canvas.height = state.height;
    }
    context.putImageData(state, 0, 0);
    storePicture(active, canvas);
  }
  function clearPicture() {
    const canvas = activeCanvas();
    if (!canvas || !active) return;
    remember(canvas);
    blank(canvas);
    storePicture(active, canvas);
  }
  function setShape(shape) {
    const body = noteBody();
    const block = active ? blockFor(active) : null;
    const canvas = activeCanvas();
    if (!body || !block || !canvas || !active) return;
    if (block.shape === shape && block.named) return;
    replaceText(body, block.start, block.end, blockText(active, shape, measure(body).lineHeight));
    remember(canvas);
    if (reshape(canvas, shape)) storePicture(active, canvas);
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
    for (const popup of document.querySelectorAll(`#${TOOLBAR_ID} .doodle-popup`)) {
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
    popup.className = "doodle-popup";
    popup.dataset.popup = name;
    popup.hidden = true;
    button.addEventListener("click", () => togglePopup(name));
    holder.append(button, popup);
    return holder;
  }
  function syncToolbar() {
    const bar = document.getElementById(TOOLBAR_ID);
    if (!bar) return;
    const swatch = bar.querySelector(".doodle-colour");
    if (swatch) swatch.style.background = colour;
    const dot = bar.querySelector(".doodle-size span");
    if (dot) dot.style.width = dot.style.height = `${size + 2}px`;
    for (const button of bar.querySelectorAll("[data-tool]")) {
      button.classList.toggle(ON_CLASS, button.dataset.tool === tool);
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
  function binIcon() {
    return `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Zm4 2v8h1.5v-8H10Zm2.5 0v8H14v-8h-1.5Z"/></svg>`;
  }
  function confirmBin(id = active) {
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
      toolButton("Cancel", () => panel.remove())
    );
    panel.append(question, buttons);
    document.body.appendChild(panel);
  }
  function toolbar() {
    let bar = document.getElementById(TOOLBAR_ID);
    if (bar) return bar;
    bar = document.createElement("div");
    bar.id = TOOLBAR_ID;
    const colourButton = toolButton("", () => {
    }, "doodle-colour");
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
    const sizeButton = toolButton("", () => {
    }, "doodle-size");
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
    const shapeButton = toolButton("", () => {
    }, "doodle-shape");
    shapeButton.setAttribute("aria-label", "Shape");
    const shapes = document.createElement("div");
    for (const key of Object.keys(SHAPES)) {
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
    const toolFor = (label, value) => {
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
      status
    );
    bar.appendChild(row);
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
    stage.appendChild(canvas);
    cover.append(toolbar(), stage);
    document.body.appendChild(cover);
    syncToolbar();
    fitFull();
  }
  function exitFull() {
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
  function fitFull() {
    const stage = document.querySelector(`#${FULL_ID} .doodle-stage`);
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
    if (icon.classList.contains(ACTIVE_CLASS) !== (active !== null)) {
      icon.classList.toggle(ACTIVE_CLASS, active !== null);
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
    const rect = body.getBoundingClientRect();
    const box = {
      left: rect.left + body.clientLeft,
      top: rect.top + body.clientTop,
      right: rect.left + body.clientLeft + body.clientWidth,
      bottom: rect.top + body.clientTop + body.clientHeight
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
  var hiddenFor = "";
  function sync() {
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
    const tallest = scrollerOf(body).clientHeight * 0.85;
    const originX = rect.left + body.clientLeft + padding - box.left;
    const originY = rect.top + body.clientTop - body.scrollTop - box.top;
    const shown = /* @__PURE__ */ new Set();
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
  function keepCaretOut(body) {
    if (body.selectionStart !== body.selectionEnd) return;
    const caret = body.selectionStart;
    for (const { start: start2, end } of measure(body).blocks) {
      if (caret < start2 || caret > end) continue;
      const target = lastCaret > end ? Math.max(0, start2 - 1) : Math.min(body.value.length, end + 1);
      body.setSelectionRange(target, target);
      lastCaret = target;
      return;
    }
    lastCaret = caret;
  }
  var ARM_MS = 3e3;
  var armed = null;
  var onDrawing = false;
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
        const body = noteBody();
        const erase = event.key === "Backspace" || event.key === "Delete";
        if (!erase) armed = null;
        if (erase && active && onDrawing) {
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
      "pointerdown",
      (event) => {
        armed = null;
        const target = event.target instanceof Element ? event.target : null;
        onDrawing = !!target?.closest(
          `#${TOOLBAR_ID}, #${LAYER_ID}, #${FULL_ID}, #${CONFIRM_ID}, #${ICON_ID}`
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
  #doodle-icon:hover,
  #doodle-icon.doodle-active {
    opacity: 1;
    filter: drop-shadow(0 0 3px rgba(150, 210, 255, 0.9));
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
    cursor: pointer;
  }
  .doodle-frame.doodle-active {
    border-color: #9fd3ff;
    box-shadow: 0 0 6px 2px rgba(150, 210, 255, 0.55);
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
    width: 26px;
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
    z-index: 1;
    padding: 6px;
    border-radius: 5px;
    background: #2e2e2e;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
  }
  .doodle-popup[data-popup="shape"] {
    display: flex;
    gap: 4px;
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
  .doodle-popup input[type="range"] {
    width: 140px;
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
  .doodle-bin {
    display: inline-flex !important;
    align-items: center;
  }
  .doodle-exit {
    display: none !important;
  }
  .doodle-status {
    margin-left: 4px;
    opacity: 0.85;
  }
  /* Full screen: the drawing in the middle, the tools down the left on a
     desktop and along the bottom on a phone. */
  #doodle-full {
    position: fixed;
    inset: 0;
    z-index: 2147483002;
    display: flex;
    flex-direction: row;
    background: rgba(0, 0, 0, 0.88);
  }
  #doodle-full .doodle-stage {
    flex: 1;
    min-width: 0;
    min-height: 0;
    margin: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  #doodle-full canvas {
    box-shadow: 0 0 8px 3px rgba(150, 210, 255, 0.55);
  }
  #doodle-toolbar.doodle-docked {
    position: relative;
    top: auto !important;
    left: auto !important;
    width: auto !important;
    border-radius: 0;
    overflow: visible;
  }
  #doodle-toolbar.doodle-docked .doodle-row {
    flex-direction: column;
    flex-wrap: nowrap;
    align-items: stretch;
  }
  #doodle-toolbar.doodle-docked .doodle-popup {
    top: 0;
    left: calc(100% + 6px);
  }
  #doodle-toolbar.doodle-docked .doodle-exit {
    display: inline-block !important;
  }
  #doodle-full:has(.doodle-docked-bottom) {
    flex-direction: column-reverse;
  }
  #doodle-toolbar.doodle-docked-bottom .doodle-row {
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
  #doodle-confirm {
    position: fixed;
    top: 50%;
    left: 50%;
    z-index: 2147483003;
    transform: translate(-50%, -50%);
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
  #doodle-confirm .doodle-row {
    justify-content: flex-end;
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
