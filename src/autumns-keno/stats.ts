// The per-number figures the heat map is drawn from.
//
// Torn's Keno calls 10 different numbers from 1 to 80 each round, so a fair
// game draws any one number in 1 round out of 8. Every "expected" figure here
// comes from that.

import type { Round } from "./rounds";

export const BALLS = 80;
export const CALLED = 10;
/** Chance a given number is called in one fair round. */
export const P_CALLED = CALLED / BALLS;

/** How one number has done, both as a draw and as one of the player's picks. */
export interface NumberRecord {
  number: number;
  /** Rounds it was called in. */
  drawn: number;
  /** Rounds it was picked in. */
  picked: number;
  /** Rounds it was picked and called. */
  hits: number;
  /** Rounds it was picked and the round paid more than the bet. */
  wins: number;
  staked: number;
  returned: number;
}


/** Returns every number's draw and pick record, indexed 1 to 80. */
export function numberRecords(rounds: Round[]): NumberRecord[] {
  const records: NumberRecord[] = [];
  for (let n = 0; n <= BALLS; n++) {
    records.push({ number: n, drawn: 0, picked: 0, hits: 0, wins: 0, staked: 0, returned: 0 });
  }
  for (const round of rounds) {
    const called = new Set(round.drawn);
    for (const n of called) {
      const record = records[n];
      if (record) record.drawn++;
    }
    for (const n of round.picks) {
      const record = records[n];
      if (!record) continue;
      record.picked++;
      if (called.has(n)) record.hits++;
      if (round.won > round.bet) record.wins++;
      record.staked += round.bet;
      record.returned += round.won;
    }
  }
  return records;
}

/** Returns how far a number's draw count is from fair, in standard deviations. */
export function drawZ(drawn: number, rounds: number): number {
  if (rounds === 0) return 0;
  const sd = Math.sqrt(rounds * P_CALLED * (1 - P_CALLED));
  return (drawn - rounds * P_CALLED) / sd;
}
