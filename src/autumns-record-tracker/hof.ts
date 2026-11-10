// Level Progress: under the Hall of Fame level list, a bar from the lowest
// leaderboard position held at the user's level (left) to the highest (right),
// with the user's own position marked on it.
//
// The leaderboard is sorted by level, so everyone at one level sits in one
// unbroken run of positions. The ends of that run are found by galloping out
// from the user's position a page at a time, then bisecting inside the page
// range where the level changes.

import { MyLevel, fetchMyLevel, tornGet } from "./api";
import { log } from "./debug";
import { isKeyProblem, keyPrompt } from "./keyPrompt";
import { readKey, readSetting, writeSetting } from "./settings";
import { injectStyles } from "./styles";

const SELECTORS = {
  root: "#hof-root",
  // The leaderboard table and its header: <div class="tableWrapper___Vgmq8">.
  table: '[class*="tableWrapper___"]',
  // "People ranked by Level", in the table header.
  heading: '[class*="heading___"]',
  // The category tiles above the table, whose look the widget borrows. A tile
  // is <div class="buttonWrapper___ up___"><button class="button___"> holding
  // an infoBox___ with a title___ ("faction respect") and a message___, which
  // is bold ("No change in 1 day") on an open tile and plain ("Revive people
  // to increase") on a locked___ one. Selected tiles are drawn differently.
  tile: '[class*="tabsList___"] [class*="buttonWrapper___"]:not([class*="selected___"]):not([class*="locked___"])',
  tileButton: '[class*="button___"]',
  tileTitle: '[class*="infoBox___"] [class*="title___"]',
  tileMessage: '[class*="infoBox___"] [class*="message___"]',
  lockedMessage: '[class*="tabsList___"] [class*="locked___"] [class*="message___"]',
};

/** The box properties copied from a tile onto the widget. */
const BOX_STYLES = [
  "background-color",
  "background-image",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-left-radius",
  "border-bottom-right-radius",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
  "box-shadow",
];

/** The text properties copied from a tile's words onto the widget's. */
const TEXT_STYLES = [
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "letter-spacing",
  "text-transform",
];

/** The level list's heading, which tells it apart from the other leaderboards. */
const LEVEL_HEADING = /ranked by level/i;
const WIDGET_ID = "art-level-progress";
const PAGE_SIZE = 100;
/** How long the ends of a level's run are trusted before they are looked up again. */
const BAND_MAX_AGE_MS = 60 * 60_000;
const BAND_SETTING = "LEVEL_BAND";

/** Where everyone at one level sits on the leaderboard. */
interface LevelBand {
  level: number;
  /** The highest position held at the level, the smallest number. */
  best: number;
  /** The lowest position held at the level, the largest number. */
  worst: number;
  fetchedAt: number;
}

/** Returns a function giving the level at a leaderboard position, fetching a page at a time. */
function levelLookup(key: string): (position: number) => Promise<number | null> {
  const pages = new Map<number, number[]>();
  return async (position) => {
    const offset = Math.floor((position - 1) / PAGE_SIZE) * PAGE_SIZE;
    let levels = pages.get(offset);
    if (!levels) {
      const body = await tornGet<{ hof?: { level?: number }[] }>(
        "torn/hof",
        { cat: "level", limit: PAGE_SIZE, offset },
        key,
      );
      levels = (body.hof ?? []).map((entry) => entry.level ?? 0);
      pages.set(offset, levels);
    }
    return levels[position - 1 - offset] ?? null;
  };
}

/** Finds the first and last positions held at the user's level. */
async function findBand(key: string, me: MyLevel): Promise<LevelBand> {
  const levelAt = levelLookup(key);
  const atMyLevel = async (position: number): Promise<boolean> =>
    position >= 1 && (await levelAt(position)) === me.level;

  // Upwards: the boundary lies between `outside` (a higher level, or 0) and `inside`.
  let inside = me.position;
  let outside = 0;
  for (let step = PAGE_SIZE; ; step *= 2) {
    const probe = inside - step;
    if (probe < 1) break;
    if (!(await atMyLevel(probe))) {
      outside = probe;
      break;
    }
    inside = probe;
  }
  while (inside - outside > 1) {
    const mid = Math.floor((inside + outside) / 2);
    if (await atMyLevel(mid)) inside = mid;
    else outside = mid;
  }
  const best = inside;

  // Downwards: past the end of the leaderboard counts as a lower level.
  inside = me.position;
  for (let step = PAGE_SIZE; ; step *= 2) {
    const probe = inside + step;
    if (!(await atMyLevel(probe))) {
      outside = probe;
      break;
    }
    inside = probe;
  }
  while (outside - inside > 1) {
    const mid = Math.floor((inside + outside) / 2);
    if (await atMyLevel(mid)) inside = mid;
    else outside = mid;
  }

  return { level: me.level, best, worst: inside, fetchedAt: Date.now() };
}

/** Returns the user's level, position and the run of positions at that level. */
async function loadProgress(key: string): Promise<{ me: MyLevel; band: LevelBand }> {
  const me = await fetchMyLevel(key);
  const stored = readSetting<LevelBand | null>(BAND_SETTING, null);
  const fresh =
    stored &&
    stored.level === me.level &&
    Date.now() - stored.fetchedAt < BAND_MAX_AGE_MS &&
    me.position >= stored.best &&
    me.position <= stored.worst;
  if (fresh) return { me, band: stored };

  const band = await findBand(key, me);
  log("level band", band);
  writeSetting(BAND_SETTING, band);
  return { me, band };
}

/** Formats a leaderboard position with separators. */
function position(value: number): string {
  return value.toLocaleString("en-US");
}

/** Copies the listed computed styles of one element onto another. */
function copyStyles(from: Element | null | undefined, to: HTMLElement, properties: string[]): void {
  if (!from) return;
  const computed = getComputedStyle(from);
  for (const property of properties) to.style.setProperty(property, computed.getPropertyValue(property));
}

// Copied from the live page rather than written out: Torn's colours differ
// between light and dark mode, and its hashed class names cannot be targeted.

/** Dresses the widget and its words like the category tiles above the table. */
function borrowTileLook(widget: HTMLElement, title: HTMLElement, place: HTMLElement, note: HTMLElement): void {
  const tile = document.querySelector(SELECTORS.tile);
  if (!tile) return;
  // The gradient may sit on the wrapper or on the button inside it.
  const button = tile.querySelector(SELECTORS.tileButton);
  const painted = [button, tile].find((box) => box && getComputedStyle(box).backgroundImage !== "none") ?? button;
  copyStyles(painted, widget, BOX_STYLES);
  // Not the button's own colour: a button keeps the browser's black, and the tile's words set theirs.
  const tileTitle = tile.querySelector(SELECTORS.tileTitle);
  if (tileTitle) widget.style.color = getComputedStyle(tileTitle).color;
  copyStyles(tileTitle, title, TEXT_STYLES);
  copyStyles(tile.querySelector(SELECTORS.tileMessage), place, TEXT_STYLES);
  place.style.color = "#fff";
  copyStyles(document.querySelector(SELECTORS.lockedMessage), note, TEXT_STYLES);
}

/** Fills the widget with the bar. */
function drawBar(widget: HTMLElement, me: MyLevel, band: LevelBand): void {
  const span = band.worst - band.best;
  const percent = span > 0 ? ((band.worst - me.position) / span) * 100 : 100;
  const clamped = Math.min(100, Math.max(0, percent));

  const title = document.createElement("div");
  title.className = "art-level-title";
  title.textContent = `Level ${me.level} progress`;

  const track = document.createElement("div");
  track.className = "art-level-track";

  const left = document.createElement("span");
  left.className = "art-level-end";
  left.textContent = position(band.worst);

  const meter = document.createElement("div");
  meter.className = "art-level-meter";

  const bar = document.createElement("div");
  bar.className = "art-level-bar";
  const fill = document.createElement("div");
  fill.className = "art-level-fill";
  fill.style.width = `${clamped}%`;
  bar.appendChild(fill);

  const marker = document.createElement("div");
  marker.className = "art-level-marker";
  marker.style.left = `${clamped}%`;
  const label = document.createElement("span");
  label.className = "art-level-percent";
  label.textContent = `${percent.toFixed(1)}%`;
  const pointer = document.createElement("span");
  pointer.className = "art-level-pointer";
  const gap = document.createElement("span");
  gap.className = "art-level-gap";
  const rank = document.createElement("span");
  rank.textContent = position(me.position);
  marker.append(label, pointer, gap, rank);

  meter.append(bar, marker);

  const right = document.createElement("span");
  right.className = "art-level-end";
  right.textContent = position(band.best);

  track.append(left, meter, right);

  const place = document.createElement("div");
  place.className = "art-level-place";
  const players = (band.worst - band.best + 1).toLocaleString("en-US");
  const within = (me.position - band.best + 1).toLocaleString("en-US");
  place.textContent = `You are in position ${within} of ${players} players at level ${me.level}`;

  const note = document.createElement("div");
  note.className = "art-level-note";
  note.textContent =
    "Please be advised this is an estimate only. Level holding players and large gaps in experience at higher levels will skew results.";

  borrowTileLook(widget, title, place, note);
  widget.replaceChildren(title, track, place, note);
}

let progress: Promise<{ me: MyLevel; band: LevelBand }> | null = null;

/** Keeps the widget under the level list, and away from every other list. */
function place(): void {
  const root = document.querySelector(SELECTORS.root);
  const table = root?.querySelector(SELECTORS.table);
  const heading = table?.querySelector(SELECTORS.heading);
  const existing = document.getElementById(WIDGET_ID);

  if (!table || !LEVEL_HEADING.test(heading?.textContent ?? "")) {
    existing?.remove();
    return;
  }
  if (existing && existing.previousElementSibling === table) return;
  if (existing) {
    table.insertAdjacentElement("afterend", existing);
    return;
  }

  const widget = document.createElement("div");
  widget.id = WIDGET_ID;
  widget.className = "art-level";
  table.insertAdjacentElement("afterend", widget);

  const key = readKey();
  if (!key) {
    widget.replaceChildren(keyPrompt());
    return;
  }
  widget.textContent = "Loading level progress…";
  progress ??= loadProgress(key);
  progress.then(
    ({ me, band }) => drawBar(widget, me, band),
    (error: unknown) => {
      progress = null;
      if (isKeyProblem(error)) widget.replaceChildren(keyPrompt());
      else widget.textContent = `Level Progress: ${error instanceof Error ? error.message : "API error"}`;
    },
  );
}

/** Starts the Level Progress bar on the Hall of Fame. */
export function installLevelProgress(): void {
  injectStyles();
  place();
  new MutationObserver(place).observe(document.body, { childList: true, subtree: true });
}
