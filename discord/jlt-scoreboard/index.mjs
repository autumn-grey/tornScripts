/**
 * Builds the faction's JLT Autumn 2026 scoreboard as a PNG and posts it to Discord.
 *
 * Reads every league tab of the public tournament sheet as CSV, keeps the rows whose
 * driver ID belongs to the API key owner's faction, draws them as an SVG table and
 * renders that to PNG with resvg. Run by .github/workflows/jlt-scoreboard.yml.
 * The sheet link, title and header picture come from settings.json.
 *
 * It posts only when the results differ from the last post, then deletes that last post,
 * so the channel holds one current board. state.json remembers the last post's message ID
 * and a fingerprint of its data; the workflow commits it back after each post.
 *
 * Environment:
 *   TORN_API_KEY         key of any faction member (public access is enough)
 *   DISCORD_WEBHOOK_URL  where the PNG is posted
 *   FORCE                set to post even when nothing has changed
 *   TEST_IDS             comma-separated Torn IDs to use in place of the faction (local testing)
 *   OUT_FILE             also write the PNG here
 *   DRY_RUN              set to skip the Discord post and leave state.json alone
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));

const SETTINGS = JSON.parse(readFileSync(here('settings.json'), 'utf8'));
const SHEET_ID = SETTINGS.sheetLink.match(/\/d\/([\w-]+)/)?.[1];
if (!SHEET_ID) throw new Error(`settings.json: no sheet ID in sheetLink "${SETTINGS.sheetLink}".`);
const TITLE = SETTINGS.title;
const HEADER_FILE = here(SETTINGS.headerPicture);
const STATE_FILE = here('state.json');

// Only tabs whose top cell is a league name count. CW and DETAILS are not leagues.
const LEAGUE_NAME = /^L\d+-[A-Z]+$/;
// Row of column headings in each league tab (0-based). Rows above it hold the league
// name, driver count, race codes, dates and track names.
const HEADING_ROW = 3;
const TRACK_ROW = 2;

const FONTS = [
  here('node_modules/@expo-google-fonts/roboto-condensed/400Regular/RobotoCondensed_400Regular.ttf'),
  here('node_modules/@expo-google-fonts/roboto-condensed/700Bold/RobotoCondensed_700Bold.ttf'),
  here('node_modules/@expo-google-fonts/fjalla-one/400Regular/FjallaOne_400Regular.ttf'),
];

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
  for (const r of results) {
    r.racesDone = r.races.filter((race) => race.time).length;
    r.timeMs = parseTime(r.time);
  }
  return { league, tracks: races.map((r) => r.track), results };
}

/** Converts a sheet time like "02:19:07.490" to milliseconds, or Infinity when blank. */
function parseTime(text) {
  const m = text.match(/^(\d+):(\d{2}):(\d{2})(?:\.(\d+))?$/);
  if (!m) return Infinity;
  return ((Number(m[1]) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000 + Number((m[4] ?? '0').padEnd(3, '0').slice(0, 3));
}

/**
 * Sets leaguePos on every driver: their rank by total time among all drivers in the same
 * numbered league (tabs 1A to 1F are league 1). A missed race makes a total shorter, so
 * drivers who have run more races rank ahead of those who have run fewer, and time only
 * decides between drivers with the same number of races. Equal totals share a position.
 */
function rankLeagueTimes(leagues) {
  const groups = new Map();
  for (const l of leagues) {
    if (!groups.has(l.group)) groups.set(l.group, []);
    groups.get(l.group).push(...l.results);
  }
  for (const drivers of groups.values()) {
    const better = (a, b) => b.racesDone - a.racesDone || a.timeMs - b.timeMs;
    drivers.sort(better);
    drivers.forEach((d, i) => {
      const prev = drivers[i - 1];
      d.leaguePos = prev && better(prev, d) === 0 ? prev.leaguePos : i + 1;
    });
  }
}

/** Reads every league tab, a few at a time so Google does not throttle us. */
async function readLeagues() {
  const tabs = await listTabs();
  const leagues = [];
  for (let i = 0; i < tabs.length; i += 6) {
    const batch = tabs.slice(i, i + 6).map(async ({ name, gid }) => {
      const csv = await getText(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`);
      const league = parseLeague(parseCsv(csv));
      // The tab name's leading number is the league; the letter after it is the division.
      if (league) league.group = name.match(/^\d+/)?.[0] ?? name;
      return league;
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
  const leaguePosW = 116;
  const timeW = 150;
  const pointsW = 64;
  const posW = 56;
  const pad = 24;
  const rowH = 54;
  const summaryW = nameW + leaguePosW + timeW + pointsW + posW;
  const width = pad * 2 + summaryW + tracks.length * (timeW + pointsW);

  const headerPng = readFileSync(HEADER_FILE);
  // A PNG stores its width and height as big-endian integers at bytes 16 and 20.
  const headerH = Math.round((width * headerPng.readUInt32BE(20)) / headerPng.readUInt32BE(16));
  const header = headerPng.toString('base64');
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
    { x: x0 + nameW, w: leaguePosW, label: 'LEAGUE POS' },
    { x: x0 + nameW + leaguePosW, w: timeW, label: 'TM' },
    { x: x0 + nameW + leaguePosW + timeW, w: pointsW, label: 'PT' },
    { x: x0 + nameW + leaguePosW + timeW + pointsW, w: posW, label: '#' },
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
    text(cols[1].x + leaguePosW / 2, mid, r.leaguePos ?? '-', { size: 20 });
    text(cols[2].x + timeW / 2, mid, r.time || '-', { size: 20 });
    text(cols[3].x + pointsW / 2, mid, r.points, { size: 21, weight: 700 });
    text(cols[4].x + posW / 2, mid, r.position || '-', { size: 20 });
    r.races.forEach((race, j) => {
      const tc = cols[5 + j * 2];
      const pc = cols[6 + j * 2];
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

/** Returns the webhook URL, throwing if it is not set. */
function webhookUrl() {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) throw new Error('DISCORD_WEBHOOK_URL is not set.');
  return url.replace(/\/$/, '');
}

/** Posts the PNG to the Discord webhook and returns the new message's ID. */
async function postToDiscord(png) {
  const form = new FormData();
  form.append('payload_json', JSON.stringify({ attachments: [{ id: 0, filename: 'jlt-scoreboard.png' }] }));
  form.append('files[0]', new Blob([png], { type: 'image/png' }), 'jlt-scoreboard.png');
  // Without wait=true Discord answers 204 with no body, so there would be no message ID to keep.
  const res = await fetch(`${webhookUrl()}?wait=true`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Discord ${res.status}: ${await res.text()}`);
  return (await res.json()).id;
}

/** Deletes an earlier webhook message; one already removed by hand is not an error. */
async function deleteFromDiscord(id) {
  const res = await fetch(`${webhookUrl()}/messages/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) console.warn(`Could not delete message ${id}: Discord ${res.status}`);
}

/** Reads state.json, or an empty state before the first tracked post. */
function readState() {
  return existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {};
}

async function main() {
  const [leagues, ids] = await Promise.all([readLeagues(), factionIds()]);
  rankLeagueTimes(leagues);
  const tracks = leagues[0]?.tracks ?? [];
  const rows = leagues
    .flatMap((l) => l.results)
    .filter((r) => ids.has(r.id))
    // Totals are only comparable across leagues by points; times differ by league, so ties fall back to league position.
    .sort((a, b) => b.points - a.points || a.position - b.position || a.name.localeCompare(b.name));
  console.log(`${leagues.length} leagues read, ${rows.length} faction drivers found.`);
  if (!rows.length) throw new Error('No faction members found in the sheet.');

  // Everything shown on the board except the date, so a day with no new races matches the day before.
  const fingerprint = createHash('sha256').update(JSON.stringify({ rows, tracks, SETTINGS })).digest('hex');
  const state = readState();
  if (fingerprint === state.fingerprint && !process.env.FORCE) {
    console.log('Results unchanged since the last post; not posting.');
    return;
  }

  const updated = 'Updated ' + new Intl.DateTimeFormat('en-AU', {
    timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric',
  }).format(new Date());
  const png = toPng(drawSvg(rows, tracks, updated));
  if (process.env.OUT_FILE) writeFileSync(process.env.OUT_FILE, png);
  if (process.env.DRY_RUN) return;

  // Post first, so a failed post never leaves the channel with no board at all.
  const messageId = await postToDiscord(png);
  if (state.messageId) await deleteFromDiscord(state.messageId);
  writeFileSync(STATE_FILE, JSON.stringify({ messageId, fingerprint }, null, 2) + '\n');
  console.log(`Posted message ${messageId}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
