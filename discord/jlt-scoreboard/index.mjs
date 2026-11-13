/**
 * Builds the faction's JLT Autumn 2026 scoreboard as a PNG and posts it to Discord.
 *
 * Reads every league tab of the public tournament sheet as CSV, keeps the rows whose
 * driver ID belongs to the API key owner's faction, draws them as an SVG table and
 * renders that to PNG with resvg. Run by .github/workflows/jlt-scoreboard.yml.
 *
 * Environment:
 *   TORN_API_KEY         key of any faction member (public access is enough)
 *   DISCORD_WEBHOOK_URL  where the PNG is posted
 *   SCHEDULE             the cron line that fired, set by the workflow on scheduled runs
 *   TEST_IDS             comma-separated Torn IDs to use in place of the faction (local testing)
 *   OUT_FILE             also write the PNG here
 *   DRY_RUN              set to skip the Discord post
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const SHEET_ID = '1M6I_d4vX_2-tbltcn4wYL4DpBNKDmiNn6g10f2YIfUU';
const TITLE = 'JLT AUTUMN 2026 LIVE RESULTS';
const TIME_ZONE = 'Australia/Sydney';
const POST_HOUR = 11;

// Only tabs whose top cell is a league name count. CW and DETAILS are not leagues.
const LEAGUE_NAME = /^L\d+-[A-Z]+$/;
// Row of column headings in each league tab (0-based). Rows above it hold the league
// name, driver count, race codes, dates and track names.
const HEADING_ROW = 3;
const TRACK_ROW = 2;

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const FONTS = [
  here('node_modules/@expo-google-fonts/roboto-condensed/400Regular/RobotoCondensed_400Regular.ttf'),
  here('node_modules/@expo-google-fonts/roboto-condensed/700Bold/RobotoCondensed_700Bold.ttf'),
  here('node_modules/@expo-google-fonts/fjalla-one/400Regular/FjallaOne_400Regular.ttf'),
];

/** Returns true when a scheduled run should go ahead, false when it is the wrong DST half. */
function isPostingHour() {
  const schedule = process.env.SCHEDULE;
  if (!schedule) return true;
  // GitHub cron is UTC with no DST, so the workflow fires at both candidate UTC hours
  // and the run whose hour lands on 11:00 in Sydney is the one that posts. Runs are
  // often late, which is why this checks the hour that was scheduled, not the clock.
  const utcHour = Number(schedule.trim().split(/\s+/)[1]);
  const at = new Date();
  at.setUTCHours(utcHour, 0, 0, 0);
  const sydneyHour = Number(
    new Intl.DateTimeFormat('en-AU', { timeZone: TIME_ZONE, hour: 'numeric', hourCycle: 'h23' }).format(at),
  );
  return sydneyHour === POST_HOUR;
}

/** Fetches a URL and returns its body as text, throwing on a non-OK status. */
async function getText(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

/** Returns every tab of the sheet as { name, gid }. */
async function listTabs() {
  // The public HTML view embeds the tab list as `name: "1A", ... gid: "326853346"`.
  const html = await getText(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/htmlview`);
  const tabs = [...html.matchAll(/name: "([^"]+)",[^}]*?gid: "(\d+)"/g)].map((m) => ({ name: m[1], gid: m[2] }));
  if (!tabs.length) throw new Error('No tabs found in the sheet view; Google may have changed its markup.');
  return tabs;
}

/** Parses CSV text into rows of cells. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/**
 * Reads one league tab into { league, drivers, tracks, results }, or null if the tab is not a league.
 * Columns are found by heading, because the sheet has hidden helper columns between them.
 */
function parseLeague(rows) {
  const top = rows[0] ?? [];
  const heading = rows[HEADING_ROW] ?? [];
  const idCol = heading.indexOf('ID');
  const posCol = heading.indexOf('#');
  const timeCol = heading.indexOf('TM');
  const pointsCol = heading.indexOf('PT');
  if (idCol < 0 || posCol < 0 || timeCol < 0 || pointsCol < 0) return null;

  // Before the race block the top row holds just two values: the league name and its driver count.
  const [league, drivers] = top.slice(0, posCol + 1).map((v) => v.trim()).filter(Boolean);
  if (!league || !LEAGUE_NAME.test(league)) return null;

  const races = [];
  for (let c = posCol + 1; c < heading.length; c++) {
    if (heading[c] === 'TM' && heading[c + 1] === 'PT') {
      races.push({ track: (rows[TRACK_ROW]?.[c] ?? '').trim(), timeCol: c, pointsCol: c + 1 });
      c++;
    }
  }

  const driverCol = heading.indexOf('DRIVER');
  const results = [];
  for (const row of rows.slice(HEADING_ROW + 1)) {
    const id = row[idCol]?.trim();
    if (!id || !/^\d+$/.test(id)) continue;
    results.push({
      id,
      name: row[driverCol]?.trim() || id,
      league,
      drivers: Number(drivers) || 0,
      time: row[timeCol]?.trim() ?? '',
      points: Number(row[pointsCol]) || 0,
      position: Number(row[posCol]) || 0,
      races: races.map((r) => ({ time: row[r.timeCol]?.trim() ?? '', points: row[r.pointsCol]?.trim() ?? '' })),
    });
  }
  return { league, tracks: races.map((r) => r.track), results };
}

/** Reads every league tab, a few at a time so Google does not throttle us. */
async function readLeagues() {
  const tabs = await listTabs();
  const leagues = [];
  for (let i = 0; i < tabs.length; i += 6) {
    const batch = tabs.slice(i, i + 6).map(async ({ gid }) => {
      const csv = await getText(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`);
      return parseLeague(parseCsv(csv));
    });
    for (const league of await Promise.all(batch)) if (league) leagues.push(league);
  }
  return leagues;
}

/** Returns the Torn IDs of everyone in the API key owner's faction. */
async function factionIds() {
  if (process.env.TEST_IDS) return new Set(process.env.TEST_IDS.split(',').map((s) => s.trim()));
  const key = process.env.TORN_API_KEY;
  if (!key) throw new Error('TORN_API_KEY is not set.');
  const res = await fetch('https://api.torn.com/v2/faction/members?striptags=true', {
    headers: { Authorization: `ApiKey ${key}` },
  });
  const body = await res.json();
  // Torn reports key problems as HTTP 200 with an error object.
  if (body.error) throw new Error(`Torn API error ${body.error.code}: ${body.error.error}`);
  return new Set(body.members.map((m) => String(m.id)));
}

/** Escapes text for use inside SVG. */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const COLOURS = {
  page: '#ffffff',
  titleBand: '#3c3c3c',
  title: '#ffe600',
  stamp: '#d0d0d0',
  heading: '#666666',
  headingText: '#ffffff',
  race: '#76b900',
  raceText: '#ffffff',
  rowA: '#ffffff',
  rowB: '#f1f1f1',
  rule: '#d6d6d6',
  divider: '#222222',
  text: '#1f1f1f',
  subtext: '#6b6b6b',
  empty: '#b0b0b0',
};

/** Draws the scoreboard as an SVG string. */
function drawSvg(rows, tracks, updated) {
  const nameW = 250;
  const timeW = 150;
  const pointsW = 64;
  const posW = 56;
  const pad = 24;
  const rowH = 54;
  const summaryW = nameW + timeW + pointsW + posW;
  const width = pad * 2 + summaryW + tracks.length * (timeW + pointsW);

  const header = readFileSync(here('header.png')).toString('base64');
  const headerH = Math.round(width / 4); // header.png is 800 x 200
  const titleY = headerH;
  const titleH = 76;
  const raceY = titleY + titleH + 16;
  const raceH = 40;
  const headY = raceY + raceH;
  const headH = 38;
  const bodyY = headY + headH;
  const height = bodyY + rows.length * rowH + pad;

  const out = [];
  const text = (x, y, s, { size = 20, weight = 400, fill = COLOURS.text, anchor = 'middle', family = 'Roboto Condensed' } = {}) =>
    out.push(`<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" dominant-baseline="central">${esc(s)}</text>`);
  const rect = (x, y, w, h, fill) => out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`);

  rect(0, 0, width, height, COLOURS.page);
  out.push(`<image href="data:image/png;base64,${header}" x="0" y="0" width="${width}" height="${headerH}"/>`);
  rect(0, titleY, width, titleH, COLOURS.titleBand);
  text(width / 2, titleY + titleH / 2, TITLE, { size: 44, fill: COLOURS.title, family: 'Fjalla One' });
  text(width - pad, titleY + titleH / 2, updated, { size: 16, fill: COLOURS.stamp, anchor: 'end' });

  // Column x positions: summary block, then a TM/PT pair per race.
  const x0 = pad;
  const cols = [
    { x: x0, w: nameW, label: 'DRIVER', align: 'start' },
    { x: x0 + nameW, w: timeW, label: 'TM' },
    { x: x0 + nameW + timeW, w: pointsW, label: 'PT' },
    { x: x0 + nameW + timeW + pointsW, w: posW, label: '#' },
  ];
  tracks.forEach((track, i) => {
    const x = x0 + summaryW + i * (timeW + pointsW);
    rect(x, raceY, timeW + pointsW, raceH, COLOURS.race);
    out.push(`<line x1="${x}" y1="${raceY}" x2="${x}" y2="${headY}" stroke="${COLOURS.page}" stroke-width="2"/>`);
    text(x + (timeW + pointsW) / 2, raceY + raceH / 2, track, { size: 21, weight: 700, fill: COLOURS.raceText });
    cols.push({ x, w: timeW, label: 'TM' }, { x: x + timeW, w: pointsW, label: 'PT' });
  });
  rect(x0, raceY, summaryW, raceH, COLOURS.heading);
  rect(x0, headY, width - pad * 2, headH, COLOURS.heading);
  for (const c of cols) {
    const x = c.align === 'start' ? c.x + 14 : c.x + c.w / 2;
    text(x, headY + headH / 2, c.label, { size: 19, weight: 700, fill: COLOURS.headingText, anchor: c.align ?? 'middle' });
  }

  rows.forEach((r, i) => {
    const y = bodyY + i * rowH;
    const mid = y + rowH / 2;
    rect(x0, y, width - pad * 2, rowH, i % 2 ? COLOURS.rowB : COLOURS.rowA);
    out.push(`<line x1="${x0}" y1="${y + rowH}" x2="${width - pad}" y2="${y + rowH}" stroke="${COLOURS.rule}" stroke-width="1"/>`);
    text(x0 + 14, mid - 10, r.name, { size: 22, weight: 700, anchor: 'start' });
    text(x0 + 14, mid + 13, `${r.league} (${r.drivers} drivers)`, { size: 15, fill: COLOURS.subtext, anchor: 'start' });
    text(cols[1].x + timeW / 2, mid, r.time || '-', { size: 20 });
    text(cols[2].x + pointsW / 2, mid, r.points, { size: 21, weight: 700 });
    text(cols[3].x + posW / 2, mid, r.position || '-', { size: 20 });
    r.races.forEach((race, j) => {
      const tc = cols[4 + j * 2];
      const pc = cols[5 + j * 2];
      text(tc.x + timeW / 2, mid, race.time || '-', { size: 19, fill: race.time ? COLOURS.text : COLOURS.empty });
      text(pc.x + pointsW / 2, mid, race.points || '-', { size: 20, fill: race.points ? COLOURS.text : COLOURS.empty });
    });
  });

  // Mirrors the sheet's heavy line between the totals and the per-race columns.
  const divX = x0 + summaryW;
  out.push(`<line x1="${divX}" y1="${raceY}" x2="${divX}" y2="${bodyY + rows.length * rowH}" stroke="${COLOURS.divider}" stroke-width="3"/>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${out.join('')}</svg>`;
}

/** Renders the SVG to PNG bytes. */
function toPng(svg) {
  const resvg = new Resvg(svg, {
    font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Roboto Condensed' },
  });
  return resvg.render().asPng();
}

/** Posts the PNG to the Discord webhook. */
async function postToDiscord(png) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) throw new Error('DISCORD_WEBHOOK_URL is not set.');
  const form = new FormData();
  form.append('payload_json', JSON.stringify({ attachments: [{ id: 0, filename: 'jlt-scoreboard.png' }] }));
  form.append('files[0]', new Blob([png], { type: 'image/png' }), 'jlt-scoreboard.png');
  const res = await fetch(url, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Discord ${res.status}: ${await res.text()}`);
}

async function main() {
  if (!isPostingHour()) {
    console.log('Not 11:00 in Sydney for this trigger; the other trigger covers today.');
    return;
  }
  const [leagues, ids] = await Promise.all([readLeagues(), factionIds()]);
  const tracks = leagues[0]?.tracks ?? [];
  const rows = leagues
    .flatMap((l) => l.results)
    .filter((r) => ids.has(r.id))
    // Totals are only comparable across leagues by points; times differ by league, so ties fall back to league position.
    .sort((a, b) => b.points - a.points || a.position - b.position || a.name.localeCompare(b.name));
  console.log(`${leagues.length} leagues read, ${rows.length} faction drivers found.`);
  if (!rows.length) throw new Error('No faction members found in the sheet.');

  const updated = 'Updated ' + new Intl.DateTimeFormat('en-AU', {
    timeZone: TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric',
  }).format(new Date());
  const png = toPng(drawSvg(rows, tracks, updated));
  if (process.env.OUT_FILE) writeFileSync(process.env.OUT_FILE, png);
  if (!process.env.DRY_RUN) await postToDiscord(png);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
