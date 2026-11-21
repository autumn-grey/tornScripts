// TornTwat: T.W.A.T., a green-screen "analysis" terminal shown under the graph of ranked war reports
// that The ZOO - Night Shift lost. The show runs to "Blame It on the Boogie", then cuts to a seal.
//
// Layout of this file: selectors and constants, page reading, resource loading, the Run (clock, audio
// and waiting), the Term (printing helpers), the show's script, and the panel that holds it all.

import { bigText } from "./bigtext";
import { SEAL } from "./seal";

const SEL = {
  report: ".war-report-wrap",
  headline: ".report-title-info",
  factionLink: 'a[href*="factions.php?step=profile&ID="]',
  chart: ".chart-placeholder",
  warList: ".f-war-list",
  sideNames: ".faction-names .name",
  sideNameText: '[class*="text___"]',
  memberList: (side: "left" | "right") => `.tab-menu-cont.${side} ul.members-list > li`,
  profileLink: 'a[href*="profiles.php?XID="]',
  attacks: ".points",
  score: ".status",
};

const ZOO_ID = "47226";
const CULPRIT_ID = "3866147";
const CULPRIT_NAME = "DaPhok";

/** Seconds into boogie.mp3 where it stops on "blame it on-" and the seal takes over. */
const CUT_AT = 40.0;

const RESOURCE_BASE = "https://raw.githubusercontent.com/autumn-grey/tornScripts/main/assets/torn-twat";
const RESOURCES = {
  boogie: `${RESOURCE_BASE}/boogie.mp3`,
  seals: `${RESOURCE_BASE}/seals.mp3`,
  font: `${RESOURCE_BASE}/3270-Regular.woff`,
} as const;
type ResourceName = keyof typeof RESOURCES;

const FONT_FAMILY = "TWAT 3270";

/** Columns of ordinary text the screen is sized to fit across. */
const TEXT_COLS = 58;
/** Rows of ordinary text the screen is tall. */
const TEXT_ROWS = 22;

const MUTED_KEY = "tornTwat.muted";

// ---------------------------------------------------------------------------------------------
// Reading the report

interface Member {
  id: string;
  name: string;
  attacks: string;
  score: string;
}

/** The faction ID in a faction profile link, or "" when the link has none. */
function factionId(link: Element): string {
  return /[?&]ID=(\d+)/.exec(link.getAttribute("href") ?? "")?.[1] ?? "";
}

/** The loser's faction link: the headline reads "<winner> has defeated <loser>". */
function loserLink(report: Element): Element | null {
  return report.querySelectorAll(`${SEL.headline} ${SEL.factionLink}`)[1] ?? null;
}

/** Players on the ZOO side of the report's member tables, in the order the page lists them. */
function zooMembers(report: Element): Member[] {
  const loserName = (loserLink(report)?.textContent ?? "").trim().toLowerCase();
  let side: "left" | "right" | null = null;
  for (const el of report.querySelectorAll(SEL.sideNames)) {
    const name = (el.querySelector(SEL.sideNameText)?.textContent ?? el.textContent ?? "").trim().toLowerCase();
    if (loserName && name === loserName) side = el.classList.contains("right") ? "right" : "left";
  }
  const read = (s: "left" | "right"): Member[] =>
    [...report.querySelectorAll(SEL.memberList(s))].flatMap((li) => {
      // The last row is the Total, which has no profile link.
      const link = li.querySelector(SEL.profileLink);
      if (!link) return [];
      const id = /XID=(\d+)/.exec(link.getAttribute("href") ?? "")?.[1] ?? "";
      // Other scripts (FF Scouter) write into the link text, so the aria-label is the clean name.
      const label = /View profile of (.+)/.exec(link.getAttribute("aria-label") ?? "")?.[1];
      const name = (label ?? link.textContent ?? "").trim();
      const text = (sel: string) => (li.querySelector(sel)?.textContent ?? "").trim();
      return [{ id, name, attacks: text(SEL.attacks), score: text(SEL.score) }];
    });
  if (side) return read(side);
  // Name match failed: the ZOO side is the one DaPhok fought on.
  const left = read("left");
  return left.some((m) => m.id === CULPRIT_ID) ? left : read("right");
}

// ---------------------------------------------------------------------------------------------
// Resources

/** Decodes a base64 data: URI into bytes. */
function dataUriBytes(uri: string): ArrayBuffer {
  const bin = atob(uri.slice(uri.indexOf(",") + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/** Downloads a file with the userscript manager, which Torn's page rules cannot block. */
function gmBytes(url: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) =>
    GM_xmlhttpRequest({
      url,
      method: "GET",
      responseType: "arraybuffer",
      // Torn PDA's version only returns text, so anything but real bytes counts as a failure.
      onload: (r) =>
        r.status === 200 && r.response instanceof ArrayBuffer
          ? resolve(r.response)
          : reject(new Error(`HTTP ${r.status}, no binary body`)),
      onerror: reject,
      ontimeout: reject,
    }),
  );
}

const bytesCache = new Map<ResourceName, Promise<ArrayBuffer>>();

/**
 * The bytes of an @resource file. Tampermonkey keeps @resource files with the script, so on desktop
 * this reads a local copy and never reaches the downloads below. Torn PDA has no @resource support,
 * so there the file comes straight from GitHub, which allows requests from any site.
 * Raw bytes rather than a URL are used throughout because Torn's page may refuse blob: or data:
 * URLs as media and font sources; decoded bytes are not checked.
 */
function resourceBytes(name: ResourceName): Promise<ArrayBuffer> {
  let p = bytesCache.get(name);
  if (!p) {
    p = (async () => {
      try {
        // The second argument asks Tampermonkey for a data: URI instead of a blob: URL.
        const url = (GM_getResourceURL as (n: string, blob?: boolean) => string)(name, false);
        if (url?.startsWith("data:")) return dataUriBytes(url);
        if (url) return await (await fetch(url)).arrayBuffer();
      } catch {
        // No @resource support (Torn PDA): fall through to downloading it.
      }
      try {
        const res = await fetch(RESOURCES[name]);
        if (res.ok) return await res.arrayBuffer();
      } catch {
        // Blocked by the page; the userscript manager's own request is the last try.
      }
      return gmBytes(RESOURCES[name]);
    })();
    bytesCache.set(name, p);
    p.catch(() => bytesCache.delete(name));
  }
  return p;
}

let fontReady: Promise<void> | null = null;

/** Registers the 3270 font with the page once. */
function loadFont(): Promise<void> {
  fontReady ??= resourceBytes("font")
    .then((buf) => new FontFace(FONT_FAMILY, buf).load())
    .then((face) => {
      document.fonts.add(face);
    })
    .catch((e) => console.warn("[TornTwat] font did not load", e));
  return fontReady;
}

// ---------------------------------------------------------------------------------------------
// Run: the clock, the audio and waiting

/** Thrown into a running show's waits when it is closed. */
const CANCELLED = Symbol("cancelled");

/**
 * One play of the show. Time is the audio's own clock when audio works, so the text stays on the
 * music, with a wall clock as the fallback. Every wait is measured from a scheduled cue rather than
 * from when the last frame happened to land, so the timeline cannot drift late.
 */
class Run {
  cancelled = false;
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private sources: AudioBufferSourceNode[] = [];
  /** Clock reading at show time 0: AudioContext seconds, or performance.now() ms without audio. */
  private origin = 0;
  private pausedAt: number | null = null;
  private waiters: { t: number; resolve: () => void; reject: (e: unknown) => void }[] = [];
  private raf = 0;
  /** Show time the script has scheduled up to. */
  cue = 0;

  /** Sets up audio inside the click that started the show; browsers only allow sound after one. */
  constructor(muted: boolean) {
    try {
      this.ctx = new AudioContext();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = muted ? 0 : 1;
      this.gain.connect(this.ctx.destination);
      void this.ctx.resume();
    } catch (e) {
      console.warn("[TornTwat] no audio", e);
      this.ctx = null;
    }
  }

  /** Decodes both songs and starts the clock, with the seals cover queued to start on the cut. */
  async start(): Promise<void> {
    if (this.ctx) {
      try {
        const ctx = this.ctx;
        // decodeAudioData takes ownership of the buffer it is given, so hand it a copy.
        const decode = async (n: ResourceName) => ctx.decodeAudioData((await resourceBytes(n)).slice(0));
        const [boogie, seals] = await Promise.all([decode("boogie"), decode("seals")]);
        if (this.cancelled) throw CANCELLED;
        this.origin = ctx.currentTime + 0.1;
        this.play(boogie, this.origin);
        this.play(seals, this.origin + CUT_AT);
      } catch (e) {
        if (e === CANCELLED) throw e;
        console.warn("[TornTwat] audio did not load, running silent", e);
        void this.ctx?.close();
        this.ctx = null;
      }
    }
    if (!this.ctx) this.origin = performance.now();
    if (document.hidden) this.pause();
    this.tick();
  }

  private play(buffer: AudioBuffer, when: number): void {
    if (!this.ctx || !this.gain) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.gain);
    src.start(when);
    this.sources.push(src);
  }

  setMuted(muted: boolean): void {
    if (this.gain) this.gain.gain.value = muted ? 0 : 1;
  }

  /** Seconds of show time so far. */
  now(): number {
    if (this.ctx) return this.ctx.currentTime - this.origin;
    return ((this.pausedAt ?? performance.now()) - this.origin) / 1000;
  }

  /** Freezes the show and its music (the tab went into the background). */
  pause(): void {
    if (this.ctx) void this.ctx.suspend();
    else this.pausedAt ??= performance.now();
  }

  resume(): void {
    if (this.ctx) void this.ctx.resume();
    else if (this.pausedAt !== null) {
      this.origin += performance.now() - this.pausedAt;
      this.pausedAt = null;
    }
  }

  /** Stops everything for good. */
  cancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    cancelAnimationFrame(this.raf);
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        // A source that never started throws on stop; nothing to undo.
      }
    }
    void this.ctx?.close();
    for (const w of this.waiters.splice(0)) w.reject(CANCELLED);
  }

  private tick = (): void => {
    if (this.cancelled) return;
    const now = this.now();
    const due = this.waiters.filter((w) => w.t <= now);
    this.waiters = this.waiters.filter((w) => w.t > now);
    for (const w of due) w.resolve();
    this.raf = requestAnimationFrame(this.tick);
  };

  private until(t: number): Promise<void> {
    if (this.cancelled) return Promise.reject(CANCELLED);
    if (t <= this.now()) return Promise.resolve();
    return new Promise((resolve, reject) => this.waiters.push({ t, resolve, reject }));
  }

  /** Resolves on the next animation frame. */
  frame(): Promise<void> {
    if (this.cancelled) return Promise.reject(CANCELLED);
    return new Promise((resolve, reject) => this.waiters.push({ t: -Infinity, resolve, reject }));
  }

  /** Waits a number of seconds after the last cue. */
  sleep(seconds: number): Promise<void> {
    this.cue += seconds;
    return this.until(this.cue);
  }

  /** Waits for a fixed point in the show. */
  at(t: number): Promise<void> {
    if (this.cue > t + 0.01) console.warn(`[TornTwat] timeline overran ${t}s by ${(this.cue - t).toFixed(2)}s`);
    this.cue = Math.max(this.cue, t);
    return this.until(this.cue);
  }

  /** Calls fn with progress 0 to 1 on every frame for the given seconds after the last cue. */
  async animate(seconds: number, fn: (p: number) => void): Promise<void> {
    const start = this.cue;
    const end = start + seconds;
    this.cue = end;
    for (;;) {
      const now = this.now();
      fn(Math.min(1, Math.max(0, (now - start) / seconds)));
      if (now >= end) return;
      await this.frame();
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Term: printing to the screen

/** Printing helpers bound to the screen's text area and a run's clock. */
class Term {
  constructor(
    private out: HTMLElement,
    private run: Run,
  ) {}

  /** Adds a line straight away. */
  line(text = "", cls?: string, parent: HTMLElement = this.out): HTMLDivElement {
    const div = document.createElement("div");
    div.className = cls ? `ln ${cls}` : "ln";
    div.textContent = text || " ";
    parent.appendChild(div);
    this.scroll();
    return div;
  }

  /** Types a line out a character at a time, with the cursor on the end. */
  async type(text: string, seconds = text.length / 45, cls?: string): Promise<HTMLDivElement> {
    const div = this.line("", cls);
    const cursor = document.createElement("span");
    cursor.className = "cursor";
    cursor.textContent = "█";
    let shown = -1;
    await this.run.animate(seconds, (p) => {
      const n = Math.floor(p * text.length);
      if (n === shown) return;
      shown = n;
      div.textContent = text.slice(0, n);
      if (p < 1) div.appendChild(cursor);
    });
    div.textContent = text || " ";
    return div;
  }

  /** Prints lines with a fixed gap between each. */
  async lines(texts: string[], gap: number, cls?: string): Promise<void> {
    for (const t of texts) {
      this.line(t, cls);
      await this.run.sleep(gap);
    }
  }

  /**
   * A label with dots counting to 100%. The count moves in uneven hops the way a slow job reports.
   * Counts from `from` to `to` percent over the given seconds and returns the line for reuse.
   */
  async bar(label: string, seconds: number, from = 0, to = 100, div?: HTMLDivElement): Promise<HTMLDivElement> {
    const el = div ?? this.line(label);
    const draw = (pct: number) => {
      el.textContent = `${label} ${".".repeat(Math.round(pct / 5) + 1)}${pct}%`;
    };
    let pct = from;
    let next = 0;
    draw(pct);
    await this.run.animate(seconds, (p) => {
      const now = this.run.now();
      if (p < 1 && now < next) return;
      next = now + 0.06 + Math.random() * 0.16;
      pct = Math.max(pct, Math.floor(from + (to - from) * p));
      draw(pct);
    });
    draw(to);
    return el;
  }

  /** A progress line drawn with filled squares. */
  blocks(div: HTMLElement, label: string, pct: number): void {
    const filled = Math.round(pct / 5);
    div.textContent = `${label} ${"■".repeat(filled)}${"-".repeat(20 - filled)} ${String(pct).padStart(3)}%`;
  }

  clear(): void {
    this.out.replaceChildren();
  }

  /** Keeps the newest line in view; old ones scroll off the top like a real terminal. */
  scroll(): void {
    this.out.scrollTop = this.out.scrollHeight;
  }
}

// ---------------------------------------------------------------------------------------------
// The show

/** A line of made-up memory dump. */
function hexLine(addr: number): string {
  const bytes = Array.from({ length: 8 }, () => Math.floor(Math.random() * 256));
  const hex = bytes.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
  const chars = bytes.map((b) => (b >= 33 && b < 127 ? String.fromCharCode(b) : ".")).join("");
  return `${addr.toString(16).toUpperCase().padStart(6, "0")}  ${hex}  |${chars}|`;
}

/** Boot gibberish, 0s to 8s. */
async function bootSequence(t: Term, run: Run): Promise<void> {
  await run.sleep(0.3);
  await t.type("TWAT-OS 1.0 (C) 1974 TORN SYSTEMS CORP.", 0.8);
  t.line("MEMORY CHECK .... 640K OK");
  await run.sleep(0.4);
  await t.type("cd C:\\TORNSYSTEM\\LOG>rwstats.json", 0.9);
  await run.sleep(0.2);
  await t.lines(["dir set.. successful", "Checking existing server format"], 0.3);
  await t.bar("Verifying 5.6M", 0.8);
  await t.lines(["Format complete", "Data log transferred"], 0.3);
  await t.type(`faction profile&ID = ${ZOO_ID}`, 0.6);
  await run.sleep(0.2);
  t.line("Loading volume profile...");
  await run.sleep(0.25);
  let addr = 0x7c00;
  for (let i = 0; i < 14; i++, addr += 8) {
    t.line(hexLine(addr), "dim");
    await run.sleep(0.07);
  }
  t.line("VOLUME PROFILE LOADED. TWAT.SYS RESIDENT.");
}

/**
 * A bar that stalls, prints its trouble through `recover`, then finishes and is wiped along with
 * every line `recover` returned.
 */
async function troubledBar(t: Term, run: Run, label: string, stall: number, recover: () => Promise<HTMLElement[]>): Promise<void> {
  const div = await t.bar(label, 0.8, 0, stall);
  await run.sleep(0.2);
  const lines = await recover();
  for (const el of lines) el.remove();
  await t.bar(label, 0.5, stall, 100, div);
  await run.sleep(0.25);
  div.remove();
}

/** Types a line, pauses, then tacks a result on the end of it. */
async function attempt(t: Term, run: Run, text: string, seconds: number, result: string): Promise<HTMLDivElement> {
  const div = await t.type(text, seconds);
  await run.sleep(0.2);
  div.textContent += ` ${result}`;
  return div;
}

/** The analysis, 8s to about 26s. Each finished bar is wiped and the next one takes its place. */
async function analysis(t: Term, run: Run): Promise<void> {
  t.clear();
  await t.type("Performing T.W.A.T. Analysis", 0.8);
  t.line();
  const plain = async (label: string, seconds: number) => {
    const div = await t.bar(label, seconds);
    await run.sleep(0.25);
    div.remove();
  };
  await plain("Calculating RW Hit Effectiveness", 1.6);
  await plain("Assessing Shortfalls", 1.3);
  await troubledBar(t, run, "Bypassing security hypernodes", 63, async () => {
    const err = t.line("ERR 0x00C4: HYPERNODE HANDSHAKE REFUSED", "inverse");
    await run.sleep(0.6);
    const fb = await attempt(t, run, "FALLBACK: rerouting via auxiliary bus 7...", 0.6, "OK");
    await run.sleep(0.3);
    return [err, fb];
  });
  await plain("Engaging powercore fixtures", 1.3);
  await plain("Filtering carbon monoxide", 1.3);
  await troubledBar(t, run, "Diagnosing target selections", 41, async () => {
    const err = t.line("*** STACK OVERFLOW IN BLAME.SYS AT 0x0BAD ***", "flash");
    await run.sleep(0.4);
    const retry = await attempt(t, run, "Retrying...", 0.3, "FAILED");
    await run.sleep(0.15);
    const dump = t.line("Core dumped to c:\\local>oops.dmp", "dim");
    await run.sleep(0.2);
    const fix = await attempt(t, run, "Lowering standards to 12%...", 0.45, "ACCEPTED");
    await run.sleep(0.3);
    return [err, retry, dump, fix];
  });
  await plain("Summarising loss drawback", 0.9);
  await t.type("Performing T.W.A.T. Protocol", 0.7);
  await run.sleep(0.3);
  await t.type("Data absorption completed. Stored in c:\\local>log4962.txt", 1.0);
  await run.sleep(0.5);
}

const VERDICTS = ["NOMINAL", "ACCEPTABLE", "MARGINAL", "INCONCLUSIVE", "NOMINAL", "TOLERABLE"];

/** Steps through every ZOO profile in the report, ending at 36s whatever the faction's size. */
async function profiles(t: Term, run: Run, members: Member[], end: number): Promise<void> {
  t.clear();
  await t.type("Analysing Profile Contributions", 0.8);
  t.line();
  const id = t.line("Player ID:   ");
  const name = t.line("Player Name: ");
  const verdict = t.line("Assessment:  ");
  t.line();
  const log = document.createElement("div");
  log.className = "log";
  t.line("", undefined).replaceWith(log);
  t.line();
  const progress = t.line();
  t.blocks(progress, "Protocol Completion", 0);

  const list = members.length ? members : [{ id: CULPRIT_ID, name: CULPRIT_NAME, attacks: "", score: "" }];
  const step = Math.max(0.05, (end - 0.4 - run.cue) / list.length);
  for (const [i, m] of list.entries()) {
    // DaPhok gets no special treatment here so the reveal at the end is a surprise.
    id.textContent = `Player ID:   ${m.id}`;
    name.textContent = `Player Name: ${m.name}`;
    verdict.textContent = `Assessment:  ${VERDICTS[i % VERDICTS.length] ?? "NOMINAL"}`;
    const stats = [m.attacks && `${m.attacks} hits`, m.score].filter(Boolean).join("  ");
    t.line(`> ${m.id.padEnd(8)} ${m.name.slice(0, 18).padEnd(18)} ${stats.padEnd(16)} OK`, undefined, log);
    log.scrollTop = log.scrollHeight;
    t.blocks(progress, "Protocol Completion", Math.round(((i + 1) / list.length) * 100));
    await run.sleep(step);
  }
  await run.at(end);
}

/** Clears for the verdict, 36s to 40s. */
async function verdict(t: Term, run: Run): Promise<void> {
  t.clear();
  await run.sleep(0.3);
  await t.type("T.W.A.T. ASSESSMENT COMPLETE", 0.9, "bright");
  t.line();
  t.line();
  await run.sleep(0.4);
  t.line("WAR LOSS CULPRIT VERIFIED", "flash bright");
}

/** Cut to black: the seal slides up from the bottom, then the name flashes over it. */
async function sealRise(screen: HTMLElement, out: HTMLElement, run: Run): Promise<void> {
  screen.classList.add("black");
  const stage = document.createElement("div");
  stage.className = "stage";
  const title = document.createElement("pre");
  title.className = "art title hidden";
  title.textContent = bigText("BLAME DAPHOK").join("\n");
  const sea = document.createElement("div");
  sea.className = "sea";
  stage.append(title, sea);
  out.replaceChildren(stage);
  // The whole seal is drawn once and slid up, rather than added a line at a time: moving one
  // finished layer costs the browser nothing, while each added line made it redraw the glow.
  const seal = document.createElement("pre");
  seal.className = "art seal";
  seal.textContent = SEAL.join("\n");
  seal.style.transform = "translateY(100%)";
  sea.appendChild(seal);
  await run.sleep(0.4);
  await run.animate(SEAL.length * 0.15, (p) => {
    seal.style.transform = `translateY(${((1 - p) * 100).toFixed(3)}%)`;
  });
  await run.sleep(0.5);
  title.classList.remove("hidden");
  title.classList.add("flash");
}

/** The whole show from the first boot line to the seal. */
async function show(screen: HTMLElement, out: HTMLElement, run: Run, members: Member[]): Promise<void> {
  const t = new Term(out, run);
  await bootSequence(t, run);
  await run.at(8);
  await analysis(t, run);
  await run.at(26.4);
  await profiles(t, run, members, 36);
  await verdict(t, run);
  await run.at(CUT_AT);
  await sealRise(screen, out, run);
}

// ---------------------------------------------------------------------------------------------
// The panel

const CSS = `
:host { display: block; margin: 10px 0; }
.wrap {
  --green: #33ff66;
  --dim: #1f9940;
  --glow: 0 0 2px rgba(51, 255, 102, 0.9), 0 0 8px rgba(51, 255, 102, 0.45);
  --text: 14px;
  --fit: 800px;
  --ratio: 0.5;
  font-family: "${FONT_FAMILY}", "IBM 3270", "Courier New", monospace;
  color: var(--green);
  font-size: var(--text);
  line-height: 1.25;
}
.controls { display: flex; justify-content: flex-end; gap: 6px; margin-bottom: 6px; }
button {
  font: inherit;
  color: var(--green);
  background: #000;
  border: 1px solid var(--green);
  text-shadow: var(--glow);
  cursor: pointer;
  padding: 0;
}
button:hover, button:focus-visible { background: var(--green); color: #000; text-shadow: none; outline: none; }
.ctl { width: 30px; height: 26px; display: flex; align-items: center; justify-content: center; font-size: 16px; }
.ctl svg { width: 18px; height: 18px; }
.screen {
  position: relative;
  background: #000;
  border: 2px dashed var(--green);
  box-shadow: 0 0 10px rgba(51, 255, 102, 0.25);
  padding: 12px;
  height: calc(var(--text) * 1.25 * ${TEXT_ROWS});
  overflow: hidden;
  text-shadow: var(--glow);
}
.screen::after {
  /* Scanlines over everything. */
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(to bottom, rgba(0, 0, 0, 0) 0, rgba(0, 0, 0, 0) 2px, rgba(0, 0, 0, 0.28) 3px);
}
.screen.black { border-color: transparent; box-shadow: none; height: auto; }
.out { height: 100%; overflow: hidden; }
.ln { white-space: pre; overflow: hidden; }
.dim { color: var(--dim); }
.bright { color: #b6ffc8; }
.inverse { background: var(--green); color: #000; text-shadow: none; display: inline-block; }
/* Hard on/off flashing at an even rate. Opacity on its own layer is redrawn by the graphics card,
   so the big glowing titles do not stutter when the page is busy repainting them. */
.flash, .cursor { animation: blink 1s linear infinite; will-change: opacity; }
.cursor { animation-duration: 0.6s; }
@keyframes blink { 0%, 49.99% { opacity: 1; } 50%, 100% { opacity: 0; } }
.log { height: calc(var(--text) * 1.25 * 10); overflow: hidden; }
pre { margin: 0; font: inherit; line-height: 1; white-space: pre; }
.home { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 4px; }
.home .art { font-size: min(calc(var(--fit) / 52), calc(var(--text) * 1.4)); margin-bottom: 14px; text-align: left; }
.go { padding: 6px 18px; margin-top: 18px; font-size: calc(var(--text) * 1.15); }
.stage {
  /* Font size for the seal scene: as wide as the screen allows, but short enough to fit the window. */
  --a: min(calc(var(--fit) / 96), calc(88vh / ${SEAL.length + 7}));
  display: flex; flex-direction: column; align-items: center; font-size: var(--a);
}
.stage .title { margin-bottom: var(--a); width: calc(var(--a) * var(--ratio) * 96); }
.hidden { visibility: hidden; }
.sea { height: calc(var(--a) * ${SEAL.length}); width: calc(var(--a) * var(--ratio) * 96); overflow: hidden; }
.sea .seal { will-change: transform; }
.collapsed { display: block; width: 100%; padding: 10px; border-style: dashed; border-width: 2px; }
.collapsed pre { font-size: min(calc(var(--fit) / 52), var(--text)); display: inline-block; text-align: left; }
.probe { position: absolute; visibility: hidden; white-space: pre; font-size: 100px; line-height: 1; }
`;

const ICON_SOUND = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9c1.5 1.5 1.5 4.5 0 6M19 6c3 3 3 9 0 12"/></svg>`;
const ICON_MUTED = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l6 6M22 9l-6 6"/></svg>`;

/** The terminal panel: the collapsed title it starts as, the home screen, and the running show. */
class Panel {
  private root: ShadowRoot;
  private wrap: HTMLDivElement;
  private run: Run | null = null;
  private muted = GM_getValue<boolean>(MUTED_KEY, false);
  private ratio = 0.5;
  private probe: HTMLSpanElement;

  constructor(
    host: HTMLElement,
    private report: Element,
  ) {
    this.root = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = CSS;
    this.wrap = document.createElement("div");
    this.wrap.className = "wrap";
    this.probe = document.createElement("span");
    this.probe.className = "probe";
    this.probe.textContent = "M".repeat(20);
    this.root.append(style, this.wrap);
    new ResizeObserver(() => this.fit()).observe(host);
    void loadFont().then(() => this.fit());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.run?.pause();
      else this.run?.resume();
    });
    this.collapse();
  }

  /** Sizes the text so a screen's worth of columns fits the width Torn gives us (phones are narrow). */
  private fit(): void {
    this.wrap.appendChild(this.probe);
    const w = this.probe.getBoundingClientRect().width;
    if (w > 0) this.ratio = w / 2000;
    this.probe.remove();
    const inner = Math.max(200, this.wrap.clientWidth - 28);
    const fit = inner / this.ratio;
    const text = Math.min(17, Math.max(8, fit / TEXT_COLS));
    this.wrap.style.setProperty("--fit", `${fit}px`);
    this.wrap.style.setProperty("--text", `${text}px`);
    this.wrap.style.setProperty("--ratio", String(this.ratio));
  }

  private stop(): void {
    this.run?.cancel();
    this.run = null;
  }

  private controls(): HTMLDivElement {
    const bar = document.createElement("div");
    bar.className = "controls";
    const snd = document.createElement("button");
    snd.className = "ctl";
    const paint = () => {
      snd.innerHTML = this.muted ? ICON_MUTED : ICON_SOUND;
      snd.setAttribute("aria-label", this.muted ? "Sound off" : "Sound on");
    };
    paint();
    snd.addEventListener("click", () => {
      this.muted = !this.muted;
      GM_setValue(MUTED_KEY, this.muted);
      this.run?.setMuted(this.muted);
      paint();
    });
    const close = document.createElement("button");
    close.className = "ctl";
    close.textContent = "X";
    close.setAttribute("aria-label", "Close");
    close.addEventListener("click", () => this.collapse());
    bar.append(snd, close);
    return bar;
  }

  private screen(): { screen: HTMLDivElement; out: HTMLDivElement } {
    const screen = document.createElement("div");
    screen.className = "screen";
    const out = document.createElement("div");
    out.className = "out";
    screen.appendChild(out);
    this.wrap.replaceChildren(this.controls(), screen);
    return { screen, out };
  }

  /** The start screen with the Initiate button. */
  private home(): void {
    this.stop();
    const { out } = this.screen();
    const box = document.createElement("div");
    box.className = "home";
    const title = document.createElement("pre");
    title.className = "art";
    title.textContent = bigText("T.W.A.T.").join("\n");
    const name = document.createElement("div");
    name.textContent = "Torn War Analysis Tool™";
    const ver = document.createElement("div");
    ver.className = "dim";
    ver.textContent = `v${__SCRIPT_VERSION__} 2026`;
    const go = document.createElement("button");
    go.className = "go";
    go.textContent = "Initiate Analysis";
    go.addEventListener("click", () => this.start());
    box.append(title, name, ver, go);
    out.appendChild(box);
    this.fit();
  }

  /** Runs the show from the top. */
  private start(): void {
    this.stop();
    const run = new Run(this.muted);
    this.run = run;
    const { screen, out } = this.screen();
    const members = zooMembers(this.report);
    out.textContent = "";
    const t = new Term(out, run);
    t.line("INITIALISING...", "dim");
    void run
      .start()
      .then(() => {
        out.replaceChildren();
        return show(screen, out, run, members);
      })
      .catch((e) => {
        if (e !== CANCELLED) console.error("[TornTwat]", e);
      });
  }

  /** Shrinks to the T.W.A.T. title and stops the show; clicking it goes back to the start screen. */
  private collapse(): void {
    this.stop();
    const btn = document.createElement("button");
    btn.className = "collapsed";
    btn.setAttribute("aria-label", "Open T.W.A.T.");
    const pre = document.createElement("pre");
    pre.textContent = bigText("T.W.A.T.").join("\n");
    btn.appendChild(pre);
    btn.addEventListener("click", () => this.home());
    this.wrap.replaceChildren(btn);
  }
}

// ---------------------------------------------------------------------------------------------
// Mounting

const seen = new WeakSet<Element>();

/** Adds the panel under the graph once the report has loaded, if the ZOO lost it. */
function tryMount(): void {
  const report = document.querySelector(SEL.report);
  if (!report || seen.has(report)) return;
  const loser = loserLink(report);
  if (!loser) return;
  if (factionId(loser) !== ZOO_ID) {
    seen.add(report);
    return;
  }
  // The graph draws after the headline; wait for it unless the member tables are already in.
  const chart = report.querySelector(SEL.chart);
  const list = report.querySelector(SEL.warList);
  if (!chart && !list) return;
  seen.add(report);
  const host = document.createElement("div");
  host.className = "torn-twat-host";
  if (chart) chart.after(host);
  else list?.before(host);
  new Panel(host, report);
}

tryMount();
new MutationObserver(tryMount).observe(document.body, { childList: true, subtree: true });
