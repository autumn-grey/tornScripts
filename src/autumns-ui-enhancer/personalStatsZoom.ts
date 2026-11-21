// Personal Stats fixes: zoom into the personal stats chart's timeline, slide
// along it, and line players up from their first day.
//
// Torn draws the chart with Google Charts, loaded into the page as
// window.google.visualization. Each of Torn's draws is caught on its way to
// Google, and the chart, its data and its options are kept. Zooming draws the
// same chart again with a narrower hAxis.viewWindow, so Google re-spaces the
// axis itself; the value axis is pinned where the full view put it, so only
// time zooms. "Matching start" draws a second table built from Torn's, with
// each player's first day as day 1. Every redraw is done in the browser from
// data the chart already holds: nothing is fetched.

import { debugging, log } from "./debug";
import { PERSONAL_STATS_FIXES, isEnabled, readSetting, writeSetting } from "./settings";

const PERSONAL_STATS_PATH = "/personalstats.php";
/** The chart Google draws; "A chart." is the label Google Charts gives every chart. */
const CHART_SELECTOR = '#personal-stats svg[aria-label="A chart."]';
/** The section the chart sits in, which the controls go at the foot of. */
const SECTION_SELECTOR = "#chartSection";

const CONTROLS_ID = "aue-stats-zoom";
/** On the chart section while zoomed, so the chart takes drags and sideways swipes. */
const ZOOMED_CLASS = "aue-stats-zoomed";
/** Whether Matching start was left on, kept between visits. */
const MATCHING_SETTING = "PERSONAL_STATS_MATCHING";

const DAY_MS = 86_400_000;
/** The narrowest window the zoom goes to, in days. */
const MIN_SPAN_DAYS = 7;
/** Slider positions; the zoom runs along them evenly in ratio, not in days. */
const SLIDER_STEPS = 100;
/** How far one press of a mountain button moves the slider. */
const BUTTON_STEPS = 10;
/** How long to wait for Google Charts to load before giving up. */
const LOADER_WAIT_MS = 30_000;

/** Small mountain (zoom out) and big mountains (zoom in), as on a video editor's timeline. */
const ICON_OUT =
  '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M7 17l4-6 4 6z" fill="currentColor"/></svg>';
const ICON_IN =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M2 20l7-11 7 11z M11 20l6-9 6 9z" fill="currentColor"/></svg>';
const MATCHING_LABEL = "Matching start";

/** The parts of Google Charts this uses. */
interface ChartLayout {
  getChartAreaBoundingBox(): { left: number; top: number; width: number; height: number };
  getVAxisValue(y: number): number;
}
interface GoogleChart {
  getChartLayoutInterface(): ChartLayout;
}
interface GoogleData {
  getColumnRange(column: number): { min: unknown; max: unknown };
  getNumberOfRows(): number;
  getNumberOfColumns(): number;
  getValue(row: number, column: number): unknown;
  getColumnType(column: number): string;
  getColumnLabel(column: number): string;
  getColumnRole?(column: number): string;
  getColumnProperties?(column: number): Record<string, unknown> | null;
}
interface DataTable extends GoogleData {
  addColumn(spec: { type: string; label?: string; role?: string; p?: Record<string, unknown> }): number;
  addRows(rows: unknown[][]): void;
}
type ChartOptions = Record<string, unknown>;
type Draw = (this: GoogleChart, data: GoogleData, options?: ChartOptions) => unknown;
interface GoogleGlobal {
  charts?: { setOnLoadCallback?: (callback: () => void) => void };
  visualization?: {
    LineChart?: { prototype: { draw: Draw } };
    DataTable?: new () => DataTable;
  };
}

/** Torn's last draw: the chart, and the table and options it drew. */
interface Source {
  chart: GoogleChart;
  data: GoogleData;
  options: ChartOptions;
}

/** One player's line in Torn's table. */
interface Series {
  /** The column holding the player's values. */
  value: number;
  /** The tooltip column after it, or null when there is none. */
  tooltip: number | null;
  /** The first row with a value: the player's day 1. */
  start: number;
}

/** What is drawn: Torn's table, or the day-numbered one, and the span its axis covers. */
interface View {
  data: GoogleData;
  options: ChartOptions;
  /** Whether the axis holds dates rather than day numbers. */
  dates: boolean;
  first: number;
  last: number;
  /** The narrowest window the zoom goes to, in the axis's own units. */
  minSpan: number;
}

let source: Source | null = null;
let originalDraw: Draw | null = null;
/** The day-numbered table made from the current source, kept until Torn draws again. */
let matchedView: View | null = null;
/** Set while this script redraws, so its own draws are not taken for Torn's. */
let redrawing = false;
/** Slider position: 0 shows everything, SLIDER_STEPS the narrowest window. */
let zoom = 0;
/** Where the window's middle sits along the whole axis, from 0 to 1. */
let centre = 0.5;
/** The value axis of the full view, held while zoomed. */
let valueRange: { min: number; max: number } | null = null;
/** Whether Matching start is on. */
let matching = readSetting(MATCHING_SETTING, "") === "1";

/** Returns a time axis value as milliseconds. */
function toTime(value: unknown): number {
  return value instanceof Date ? value.getTime() : Number(value);
}

/** Whether a cell has no value: empty, or NaN. */
function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === "number" && Number.isNaN(value));
}

/** Returns the players' lines in a table of Torn's: each value column, its tooltip, and its first filled row. */
function seriesOf(data: GoogleData): Series[] {
  const found: Series[] = [];
  const columns = data.getNumberOfColumns();
  const rows = data.getNumberOfRows();
  for (let column = 1; column < columns; column += 1) {
    if (data.getColumnType(column) !== "number" || data.getColumnRole?.(column)) continue;
    const next = column + 1;
    const tooltip = next < columns && data.getColumnRole?.(next) === "tooltip" ? next : null;
    // Torn fills a player's cells before their stats begin with NaN (shown as
    // "NaN" in their tooltip) or leaves them empty.
    let start = 0;
    while (start < rows && isEmpty(data.getValue(start, column))) start += 1;
    if (start < rows) found.push({ value: column, tooltip, start });
  }
  return found;
}

/**
 * Puts the day in place of the date in a tooltip of Torn's.
 *
 * The date is left out: lined up, a day number is the same point for every
 * player, but a date would only be right for whoever's line was not moved.
 */
function dayTooltip(tooltip: unknown, day: number): unknown {
  if (typeof tooltip !== "string") return tooltip;
  return tooltip.replace(/(<p class=["']?date___[^>]*>)[^<]*(<\/p>)/, `$1Day ${day}$2`);
}

/** Returns Torn's own table, as drawn. */
function tornView(from: Source): View {
  const range = from.data.getColumnRange(0);
  return {
    data: from.data,
    options: from.options,
    dates: range.min instanceof Date,
    first: toTime(range.min),
    last: toTime(range.max),
    minSpan: MIN_SPAN_DAYS * DAY_MS,
  };
}

/**
 * Returns the day-numbered table: each player moved so their first filled
 * day is day 1, or null when there is no second player to line up with.
 */
function buildMatchedView(from: Source): View | null {
  const Table = (window as unknown as { google?: GoogleGlobal }).google?.visualization?.DataTable;
  const series = seriesOf(from.data);
  if (!Table || series.length < 2) return null;
  const { data } = from;
  const rows = data.getNumberOfRows();

  const table = new Table();
  table.addColumn({ type: "number", label: "Day" });
  for (const line of series) {
    table.addColumn({ type: "number", label: data.getColumnLabel(line.value) });
    if (line.tooltip !== null) {
      table.addColumn({ type: "string", role: "tooltip", p: data.getColumnProperties?.(line.tooltip) ?? { html: true } });
    }
  }
  const days = Math.max(...series.map((line) => rows - line.start));
  const built: unknown[][] = [];
  for (let day = 1; day <= days; day += 1) {
    const row: unknown[] = [day];
    for (const line of series) {
      const at = line.start + day - 1;
      row.push(at < rows ? data.getValue(at, line.value) : null);
      if (line.tooltip !== null) row.push(at < rows ? dayTooltip(data.getValue(at, line.tooltip), day) : null);
    }
    built.push(row);
  }
  table.addRows(built);

  // Torn's axis is set up for dates; a day count wants plain whole numbers.
  const { ticks: _ticks, format: _format, gridlines, minorGridlines, ...hAxis } =
    (from.options.hAxis as ChartOptions | undefined) ?? {};
  const plainGrid = (grid: unknown) => {
    if (!grid || typeof grid !== "object") return grid;
    const { units: _units, ...rest } = grid as ChartOptions;
    return rest;
  };
  return {
    data: table,
    options: {
      ...from.options,
      hAxis: { ...hAxis, gridlines: plainGrid(gridlines), minorGridlines: plainGrid(minorGridlines), format: "0" },
    },
    dates: false,
    first: 1,
    last: days,
    minSpan: MIN_SPAN_DAYS,
  };
}

/** Whether Matching start can be used on what Torn drew: there must be two players or more. */
function canMatch(): boolean {
  return source !== null && seriesOf(source.data).length >= 2;
}

/** Returns what to draw now: the day-numbered table when Matching start is on and can be, else Torn's. */
function currentView(): View | null {
  if (!source) return null;
  if (matching && canMatch()) {
    matchedView ??= buildMatchedView(source);
    if (matchedView) return matchedView;
  }
  return tornView(source);
}

/** Returns the share of the whole axis the window shows at the current zoom. */
function windowShare(view: View): number {
  const full = view.last - view.first;
  if (full <= view.minSpan) return 1;
  return (view.minSpan / full) ** (zoom / SLIDER_STEPS);
}

/** Returns the value axis Google chose for the full view, read off the drawn chart. */
function readValueRange(chart: GoogleChart): { min: number; max: number } | null {
  try {
    const layout = chart.getChartLayoutInterface();
    const box = layout.getChartAreaBoundingBox();
    const min = layout.getVAxisValue(box.top + box.height);
    const max = layout.getVAxisValue(box.top);
    return Number.isFinite(min) && Number.isFinite(max) && max > min ? { min, max } : null;
  } catch {
    return null;
  }
}

/** Draws the chart again for the current view, zoom and position. */
function redraw(): void {
  const view = currentView();
  if (!source || !view || !originalDraw) return;
  const share = windowShare(view);
  let options = view.options;
  if (share < 1) {
    // Read before the first zoomed draw, while the chart still shows everything.
    valueRange ??= readValueRange(source.chart);
    const full = view.last - view.first;
    const width = full * share;
    const start = Math.min(Math.max(view.first + centre * full - width / 2, view.first), view.last - width);
    centre = (start + width / 2 - view.first) / full;
    const edge = (at: number) => (view.dates ? new Date(at) : at);
    const hAxis = (options.hAxis as ChartOptions | undefined) ?? {};
    const vAxis = (options.vAxis as ChartOptions | undefined) ?? {};
    options = {
      ...options,
      hAxis: { ...hAxis, viewWindow: { min: edge(start), max: edge(start + width) } },
      vAxis: valueRange ? { ...vAxis, viewWindow: valueRange } : vAxis,
    };
  }
  redrawing = true;
  try {
    originalDraw.call(source.chart, view.data, options);
  } finally {
    redrawing = false;
  }
}

/** Goes back to the full view, as when the chart changes underneath the zoom. */
function resetZoom(): void {
  zoom = 0;
  centre = 0.5;
  valueRange = null;
}

/** Catches Torn's draws of the line chart, keeping what each one drew. */
function patchLineChart(google: GoogleGlobal): boolean {
  const proto = google.visualization?.LineChart?.prototype;
  if (!proto) return false;
  if (originalDraw) return true;
  const original = proto.draw;
  originalDraw = original;
  proto.draw = function (this: GoogleChart, data: GoogleData, options: ChartOptions = {}) {
    if (redrawing) return original.call(this, data, options);
    // A new stat, timespan, player or size starts from the full view.
    source = { chart: this, data, options };
    matchedView = null;
    resetZoom();
    // With the debug log on, the table is left on the page for the console to read.
    if (debugging()) (window as unknown as { aueStatsData?: GoogleData }).aueStatsData = data;
    try {
      syncControls();
      if (matching && canMatch()) {
        redraw();
        return undefined;
      }
    } catch (error) {
      log("stats zoom: could not read the chart's data", error);
    }
    return original.call(this, data, options);
  };
  log("stats zoom: watching the chart's draws");
  return true;
}

/**
 * Catches the chart's draws from the first one on.
 *
 * Google Charts loads after the page, and Torn draws as soon as it has. The
 * loader is looked for every frame until it appears, and its load callback
 * is wrapped so the chart is caught before Torn's first draw runs.
 */
function watchForGoogle(): void {
  const until = Date.now() + LOADER_WAIT_MS;
  let wrapped = false;
  const look = () => {
    const google = (window as unknown as { google?: GoogleGlobal }).google;
    if (google && patchLineChart(google)) return;
    const charts = google?.charts;
    if (charts?.setOnLoadCallback && !wrapped) {
      wrapped = true;
      const original = charts.setOnLoadCallback.bind(charts);
      charts.setOnLoadCallback = (callback: () => void) =>
        original(() => {
          if (google) patchLineChart(google);
          callback();
        });
    }
    if (Date.now() < until) requestAnimationFrame(look);
  };
  look();
}

/** Sets the zoom from the slider or a button, keeping the window's middle where it is. */
function setZoom(value: number): void {
  zoom = Math.min(Math.max(Math.round(value), 0), SLIDER_STEPS);
  syncControls();
  redraw();
}

/** Turns Matching start on or off, from the full view. */
function setMatching(on: boolean): void {
  matching = on;
  writeSetting(MATCHING_SETTING, on ? "1" : "");
  resetZoom();
  syncControls();
  redraw();
}

/** Returns a mountain button. */
function zoomButton(icon: string, label: string, change: number): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "aue-stats-zoom-button";
  button.innerHTML = icon;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.addEventListener("click", () => setZoom(zoom + change));
  return button;
}

/** Returns the controls: Matching start, then zoom out, the slider, zoom in. */
function buildControls(): HTMLElement {
  const bar = document.createElement("div");
  bar.id = CONTROLS_ID;

  const match = document.createElement("button");
  match.type = "button";
  match.className = "aue-stats-zoom-button aue-stats-match";
  match.textContent = MATCHING_LABEL;
  match.addEventListener("click", () => setMatching(!matching));

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = String(SLIDER_STEPS);
  slider.value = String(zoom);
  slider.setAttribute("aria-label", "Zoom the timeline");
  slider.addEventListener("input", () => setZoom(Number(slider.value)));

  bar.append(match, zoomButton(ICON_OUT, "Zoom out", -BUTTON_STEPS), slider, zoomButton(ICON_IN, "Zoom in", BUTTON_STEPS));
  return bar;
}

/** Puts the controls at the foot of the chart section, in step with the chart, or takes them away. */
function syncControls(): void {
  const section = document.querySelector(SECTION_SELECTOR);
  const view = currentView();
  const wanted = view !== null && section !== null && (view.last - view.first > view.minSpan || canMatch());
  let bar = document.getElementById(CONTROLS_ID);
  if (!wanted) {
    bar?.remove();
    return;
  }
  if (!bar) {
    bar = buildControls();
    section?.appendChild(bar);
  } else if (bar.parentElement !== section || bar.nextElementSibling) {
    section?.appendChild(bar);
  }
  const slider = bar.querySelector<HTMLInputElement>("input");
  if (slider && slider.value !== String(zoom)) slider.value = String(zoom);
  const match = bar.querySelector<HTMLButtonElement>(".aue-stats-match");
  if (match) {
    match.hidden = !canMatch();
    match.setAttribute("aria-pressed", String(matching));
  }
  // On the section, not the chart: Google can swap the chart's SVG on each draw.
  section?.classList.toggle(ZOOMED_CLASS, zoom > 0);
}

/** Lets a drag or swipe across the zoomed chart slide the window along the axis. */
function installPanning(): void {
  let drag: { x: number; centre: number; width: number; share: number } | null = null;
  let frame = 0;

  document.addEventListener("pointerdown", (event) => {
    const view = currentView();
    if (zoom === 0 || !source || !view || !(event.target instanceof Element)) return;
    const chart = event.target.closest(CHART_SELECTOR);
    if (!chart) return;
    let width = chart.getBoundingClientRect().width;
    try {
      width = source.chart.getChartLayoutInterface().getChartAreaBoundingBox().width || width;
    } catch {}
    drag = { x: event.clientX, centre, width, share: windowShare(view) };
    event.preventDefault();
  });

  addEventListener("pointermove", (event) => {
    if (!drag) return;
    // Dragging the line right brings earlier days into view, as on a map.
    centre = drag.centre - ((event.clientX - drag.x) / drag.width) * drag.share;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      redraw();
    });
  });

  const stop = () => {
    drag = null;
  };
  addEventListener("pointerup", stop);
  addEventListener("pointercancel", stop);
}

/** Puts the controls back when React redraws the section around the chart and takes them with it. */
function keepControls(): void {
  new MutationObserver(() => {
    if (source && !document.getElementById(CONTROLS_ID)) syncControls();
  }).observe(document.body, { childList: true, subtree: true });
}

/**
 * Adds the zoom and Matching start controls to the personal stats chart.
 * Runs at document-start, so Google Charts is caught however soon after the
 * page it loads.
 */
export function installPersonalStatsZoom(): void {
  if (location.pathname !== PERSONAL_STATS_PATH || !isEnabled(PERSONAL_STATS_FIXES)) return;
  watchForGoogle();
  installPanning();
  if (document.body) keepControls();
  else document.addEventListener("DOMContentLoaded", keepControls, { once: true });
}
