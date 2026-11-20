// Word cloud in the silhouette of ASK / DIVA.
//
// The two words are drawn in a heavy sans with tight tracking onto a mask, the
// mask becomes a grid of free cells, and each chat word is placed on a free
// rectangle of that grid. A summed-area table answers "is this rectangle all
// free" in four lookups, so every position can be checked for every word.
// Once the counted words are down, smaller repeats fill what is left so the
// letters read clearly.

/** The silhouette, one line per entry. */
const LINES = ["ASK", "DIVA"];

// Helvetica Black where the player has it, Arial Black (near enough) everywhere else.
const MASK_FONT =
  '"Helvetica Neue LT Std", "HelveticaNeue-Black", "Helvetica Neue Black", "Helvetica Black", "Arial Black", "Helvetica Neue", Helvetica, Arial, sans-serif';
const WORD_FONT = '"Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif';

/** Mask font size in pixels, which sets the size of the finished image. */
const MASK_SIZE = 520;
/** Tracking between silhouette letters, as a fraction of the font size. */
const TRACKING = -0.085;
/** Gap between the two lines, as a fraction of the cap height. */
const LINE_GAP = 0.1;
const MARGIN = 24;

/** Grid cell size in pixels. */
const CELL = 4;
const WORD_PAD = 2;
const MAX_WORD = 120;
const MIN_WORD = 9;
const MAX_UNIQUE = 160;
const VERTICAL_SHARE = 0.3;

const BACKGROUND = "#ffffff";
const PALETTE = ["#a0413b", "#3456c8", "#5c9f2e", "#8e2aa6", "#2ea4cc", "#7b3b8f"];

const STOPWORDS = new Set(
  `the and for you that this with have not but are was all can get got just what your out from they them then than
  too its it's i'm im ive i've dont don't didnt didn't cant can't wont won't thats that's isnt isn't doesnt doesn't
  one will would could should about there their here been were has had him her his she who how why when where which
  any some more most much many very also now yes yeah yep nah nope lol lmao haha hahaha ok okay like well still only
  even into over back off our did does doing going gonna gotta want need know think see say said make made take took
  really right thing things mate guys anyone someone something nothing because cause though you're youre we're
  they're let let's lets ill i'll i'd id ya yea ur u these those other just bit way been being after before
  http https www com torn php`.split(/\s+/),
);

/** A word to draw and how often it came up. */
export interface WordCount {
  word: string;
  count: number;
}

/** Counts the words worth drawing across a set of message texts, most used first. */
export function countWords(texts: string[]): WordCount[] {
  const counts = new Map<string, number>();
  for (const text of texts) {
    const words = text
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, " ")
      .match(/\p{L}[\p{L}\p{N}'’-]{2,}/gu);
    for (const raw of words ?? []) {
      const w = raw.replace(/’/g, "'").replace(/['-]+$/, "");
      if (w.length < 3 || STOPWORDS.has(w)) continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_UNIQUE);
}

/** Returns a word with every e capitalised, 25% of them doubled and 10% tripled. */
export function eStyle(word: string): string {
  return word.replace(/e/g, () => {
    const roll = Math.random();
    const times = roll < 0.1 ? 3 : roll < 0.35 ? 2 : 1;
    return "E".repeat(times);
  });
}

/** The free-space grid words are placed on. */
interface Grid {
  w: number;
  h: number;
  gw: number;
  gh: number;
  blocked: Uint8Array;
  sums: Int32Array;
}

/** A word placed on the image. */
interface Placed {
  text: string;
  size: number;
  vertical: boolean;
  x: number;
  y: number;
  left: number;
  ascent: number;
  right: number;
  colour: string;
}

/** Returns a 2D context for a fresh canvas of the given size. */
function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");
  return [c, ctx];
}

/** Draws the ASK / DIVA silhouette and returns its free-cell grid. */
function buildGrid(): Grid {
  const [, probe] = canvas(1, 1);
  probe.font = `900 ${MASK_SIZE}px ${MASK_FONT}`;
  const track = MASK_SIZE * TRACKING;
  const cap = probe.measureText("H").actualBoundingBoxAscent;

  // Letters go down one at a time, because canvas letterSpacing is missing in older browsers.
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
      // A cell is free only when every pixel in it is inside a letter, so words never poke out.
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
  const grid: Grid = { w, h, gw, gh, blocked, sums: new Int32Array((gw + 1) * (gh + 1)) };
  rebuildSums(grid);
  return grid;
}

/** Recomputes the summed-area table of blocked cells. */
function rebuildSums(g: Grid): void {
  const stride = g.gw + 1;
  for (let y = 0; y < g.gh; y++) {
    let row = 0;
    for (let x = 0; x < g.gw; x++) {
      row += g.blocked[y * g.gw + x] ?? 0;
      g.sums[(y + 1) * stride + x + 1] = (g.sums[y * stride + x + 1] ?? 0) + row;
    }
  }
}

/** Returns a random free top-left cell for a rectangle of cells, or null when none fits. */
function findSpot(g: Grid, cw: number, ch: number): [number, number] | null {
  const stride = g.gw + 1;
  const s = g.sums;
  let pick: [number, number] | null = null;
  let seen = 0;
  for (let y = 0; y + ch <= g.gh; y++) {
    const top = y * stride;
    const bottom = (y + ch) * stride;
    for (let x = 0; x + cw <= g.gw; x++) {
      const n = s[bottom + x + cw]! - s[top + x + cw]! - s[bottom + x]! + s[top + x]!;
      if (n !== 0) continue;
      // Reservoir sampling: an even pick across every spot that fits, in one pass.
      seen++;
      if (Math.random() * seen < 1) pick = [x, y];
    }
  }
  return pick;
}

/** Marks a rectangle of cells as used. */
function block(g: Grid, x: number, y: number, cw: number, ch: number): void {
  for (let yy = y; yy < y + ch; yy++) g.blocked.fill(1, yy * g.gw + x, yy * g.gw + x + cw);
  rebuildSums(g);
}

/** Tries to place one word at the given size and returns it when it fits. */
function tryPlace(
  g: Grid,
  ctx: CanvasRenderingContext2D,
  text: string,
  size: number,
  vertical: boolean,
): Placed | null {
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

/** Places a word, shrinking it and turning it until it fits or gets too small. */
function placeShrinking(
  g: Grid,
  ctx: CanvasRenderingContext2D,
  word: string,
  size: number,
): Placed | null {
  const vertical = Math.random() < VERTICAL_SHARE;
  let s = Math.max(size, MIN_WORD);
  for (;;) {
    const text = eStyle(word);
    const placed = tryPlace(g, ctx, text, s, vertical) ?? tryPlace(g, ctx, text, s, !vertical);
    if (placed) return placed;
    if (s === MIN_WORD) return null;
    s = Math.max(MIN_WORD, Math.floor(s * 0.88));
  }
}

/** Yields to the browser so the page stays responsive during layout. */
function breathe(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

/** Lays out and draws the cloud, returning it as a PNG blob. */
export async function drawCloud(
  words: WordCount[],
  progress: (done: number) => void,
): Promise<Blob> {
  const g = buildGrid();
  const [out, ctx] = canvas(g.w, g.h);
  const placed: Placed[] = [];

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

  // Fill the leftover space with repeats, favouring the words used most.
  const pool = words.slice(0, 80);
  const weights = pool.map((w) => Math.sqrt(w.count));
  const total = weights.reduce((a, b) => a + b, 0);
  let misses = 0;
  for (let n = 0; pool.length && misses < 250 && n < 5000; n++) {
    let r = Math.random() * total;
    let k = 0;
    while (k < pool.length - 1 && (r -= weights[k]!) > 0) k++;
    const size = MIN_WORD + Math.floor(Math.random() * 22);
    const p = placeShrinking(g, ctx, pool[k]!.word, size);
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
      // Turned a quarter anticlockwise, so it reads bottom to top.
      ctx.translate(p.x + pad + p.ascent, p.y + pad + p.right);
      ctx.rotate(-Math.PI / 2);
    } else {
      ctx.translate(p.x + pad + p.left, p.y + pad + p.ascent);
    }
    ctx.fillText(p.text, 0, 0);
    ctx.restore();
  }

  return new Promise((resolve, reject) =>
    out.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not make the PNG"))), "image/png"),
  );
}
