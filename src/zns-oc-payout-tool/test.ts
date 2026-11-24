// A made-up crime paying $1 each to three named members, for trying the give
// money form without touching a real crime. Its payments are kept in memory
// only, so they never mix with real records and a reload starts it afresh.

import { CrimeRow } from "./crimes";
import { PlayerPayout } from "./payout";
import { readKeyOwner } from "./settings";

/** The test crime's id; real crime ids are positive. */
export const TEST_CRIME_ID = -1;

/** Who the test crime pays, $1 each. */
const MEMBERS = [
  { id: 4386333, name: "LilKnownBlaffle", role: "Test" },
  { id: 2659506, name: "Faith", role: "Test" },
  { id: 1941593, name: "Pint-Shot-Riot", role: "Test" },
];

/** Builds the test crime's row, carrying over who has been paid in it so far. */
export function buildTestRow(previous: CrimeRow | null): CrimeRow {
  const now = Math.floor(Date.now() / 1000);
  const players: PlayerPayout[] = MEMBERS.map((member) => ({
    ...member,
    prs: 0,
    roleParts: { checkpointPassRate: 0, minimum: 0, weight: 0 },
    prc: 0,
    pts: 0,
    ptc: 0,
    stallJoin: 0,
    joinedAt: now,
    executedAt: now,
    previousRoleEnd: null,
    psc: 0,
    base: 1,
    payout: 1,
  }));

  return {
    crime: {
      id: TEST_CRIME_ID,
      previous_crime_id: null,
      name: "Test OC",
      difficulty: 1,
      status: "Successful",
      planning_at: now,
      ready_at: now,
      executed_at: now,
      slots: MEMBERS.map((member) => ({
        position: member.role,
        checkpoint_pass_rate: 0,
        user: { id: member.id, joined_at: now },
      })),
      rewards: { money: MEMBERS.length, items: [], payout: null },
    },
    state: "payable",
    chain: [],
    percents: { faction: 0, time: 0, role: 0, stall: 0 },
    total: MEMBERS.length,
    payout: {
      total: MEMBERS.length,
      factionCut: 0,
      remaining: MEMBERS.length,
      base: MEMBERS.length,
      totalRoleScore: 0,
      roleReserve: 0,
      totalTimeScore: 0,
      timeReserve: 0,
      stallReserve: 0,
      totalStall: 0,
      players,
    },
    paid: previous?.paid ?? new Set(),
    payments: previous?.payments ?? {},
    paidByTorn: false,
    feeder: false,
  };
}

/** Marks a member of the test crime paid, in memory only. */
export function recordTestPayment(row: CrimeRow, memberId: number, amount: number): void {
  const by = readKeyOwner();
  row.paid.add(memberId);
  row.payments[String(memberId)] = { amount, at: Math.floor(Date.now() / 1000), ...(by ? { by } : {}) };
}
