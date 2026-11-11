// The round history: what the sheet has confirmed plus what is still on its way.
//
// A round is saved locally the moment it is played and only dropped from the
// local queue once the sheet has stored it, so a failed or slow upload loses
// nothing; the queue is retried after the next round or page load.

import { log } from "./debug";
import { fetchHistory, postRounds } from "./sheet";
import { HISTORY, PENDING, SHEET_URL, readSetting, writeSetting } from "./settings";

/** One Keno round. */
export interface Round {
  /** Made up here when the round is played; the sheet uses it to drop duplicates. */
  id: string;
  /** ISO time the result arrived. */
  time: string;
  /** The numbers picked, ascending; empty when they could not be read off the board. */
  picks: number[];
  /** The ten numbers called, in the order they were called. */
  drawn: number[];
  matches: number;
  bet: number;
  /** The gross payout; a $10k bet that returns $15k has won 15000. */
  won: number;
}

/** Where the sheet sync stands, for the panel. */
export type SyncState = "no sheet" | "syncing" | "synced" | "offline";

let history = readSetting<Round[]>(HISTORY, []);
let pending = readSetting<Round[]>(PENDING, []);
let state: SyncState = readSetting<string>(SHEET_URL, "") ? "syncing" : "no sheet";
let flushing = false;
let flushAgain = false;
const listeners = new Set<() => void>();

/** Calls every change listener. */
function notify(): void {
  for (const listener of listeners) listener();
}

/** Runs a callback whenever the history or sync state changes. */
export function onRoundsChange(listener: () => void): void {
  listeners.add(listener);
}

/** Returns every known round, oldest first. */
export function allRounds(): Round[] {
  const known = new Set(history.map((r) => r.id));
  const all = history.concat(pending.filter((r) => !known.has(r.id)));
  return all.sort((a, b) => a.time.localeCompare(b.time));
}

/** Returns the sync state and how many rounds are waiting to upload. */
export function syncStatus(): { state: SyncState; unsent: number } {
  return { state, unsent: pending.length };
}

/** Records a freshly played round and starts uploading it. */
export function addRound(round: Round): void {
  pending.push(round);
  writeSetting(PENDING, pending);
  notify();
  void flush();
}

/** Uploads every queued round to the sheet. */
async function flush(): Promise<void> {
  const url = readSetting<string>(SHEET_URL, "");
  if (!url || pending.length === 0) return;
  if (flushing) {
    flushAgain = true;
    return;
  }
  flushing = true;
  const batch = pending.slice();
  try {
    await postRounds(url, batch);
    const sent = new Set(batch.map((r) => r.id));
    const known = new Set(history.map((r) => r.id));
    history = history.concat(batch.filter((r) => !known.has(r.id)));
    pending = pending.filter((r) => !sent.has(r.id));
    writeSetting(HISTORY, history);
    writeSetting(PENDING, pending);
    state = "synced";
  } catch (error) {
    log("upload failed", error);
    state = "offline";
  } finally {
    flushing = false;
    notify();
  }
  if (flushAgain) {
    flushAgain = false;
    void flush();
  }
}

/** Reloads the history from the sheet, then uploads anything queued. */
export async function syncWithSheet(): Promise<void> {
  const url = readSetting<string>(SHEET_URL, "");
  if (!url) {
    state = "no sheet";
    notify();
    return;
  }
  state = "syncing";
  notify();
  try {
    history = await fetchHistory(url);
    writeSetting(HISTORY, history);
    state = "synced";
  } catch (error) {
    log("history fetch failed", error);
    state = "offline";
  }
  notify();
  await flush();
}
