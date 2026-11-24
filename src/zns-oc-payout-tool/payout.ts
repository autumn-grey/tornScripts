// The payout maths: how one crime's money is split between the faction and
// each member. Pure functions only, so the numbers can be checked apart from
// the page.

/** Seconds each role spends planning before the next role starts. */
export const PLANNING_SECONDS_PER_ROLE = 24 * 60 * 60;

/** The four percentages the payer sets, each 0 to 100. */
export interface Percents {
  faction: number;
  time: number;
  role: number;
  stall: number;
}

/** One member of a crime, as the maths needs them. */
export interface MemberInput {
  id: number;
  name: string;
  role: string;
  /** Personal role score, or null while one of its parts is not known. */
  prs: number | null;
  joinedAt: number;
}

/** One crime, as the maths needs it. */
export interface CrimeInput {
  /** The money this crime pays out from, after any chain split. */
  total: number;
  /** When planning began, which is the first member's join. */
  planningAt: number;
  /** When the crime ran. */
  executedAt: number;
  members: MemberInput[];
}

/** One member's share of a crime. */
export interface PlayerPayout {
  id: number;
  name: string;
  role: string;
  /** Personal role score, null while not known. */
  prs: number | null;
  /** Personal role cut, null while any role score in the crime is not known. */
  prc: number | null;
  /** Personal time score, in seconds. */
  pts: number;
  /** Personal time cut. */
  ptc: number;
  /** How long planning had been stalled when this member joined, in seconds. */
  stallJoin: number;
  /** Personal stall cut. */
  psc: number;
  base: number;
  /** Null while the role cut is not known. */
  payout: number | null;
}

/** One crime's whole split. */
export interface CrimePayout {
  total: number;
  /** The faction's share, including every dollar left over from rounding; null while the role cuts are not known. */
  factionCut: number | null;
  /** What goes to the members: total less the faction cut; null while the role cuts are not known. */
  remaining: number | null;
  base: number;
  totalRoleScore: number | null;
  roleReserve: number;
  totalTimeScore: number;
  timeReserve: number;
  stallReserve: number;
  /** All stall join time summed, in seconds. */
  totalStall: number;
  players: PlayerPayout[];
}

/** The four percentage boxes as entered; null is an empty box. */
export type PercentInputs = { [K in keyof Percents]: number | null };

/** Says what is wrong with the entered percentages, or returns null when nothing is. Empty boxes are not a problem. */
export function percentsProblem(percents: PercentInputs): string | null {
  const values = Object.values(percents).filter((value): value is number => value !== null);
  if (values.some((value) => !Number.isFinite(value) || value < 0)) return "Percentages can't be negative";
  if (values.reduce((sum, value) => sum + value, 0) > 100) return "Percentages add up to more than 100";
  return null;
}

/** Returns the percentages to work with, an empty box counting as 0, or null when they don't add up. */
export function completePercents(percents: PercentInputs): Percents | null {
  if (percentsProblem(percents)) return null;
  return {
    faction: percents.faction ?? 0,
    time: percents.time ?? 0,
    role: percents.role ?? 0,
    stall: percents.stall ?? 0,
  };
}

/**
 * A personal role score: how far the member's success chance is above the
 * crime's checkpoint pass rate (never below 0), plus the role's weight.
 * Null when any of the three is not known.
 */
export function roleScore(successChance: number | null, passRate: number | null, weight: number | null): number | null {
  if (successChance === null || passRate === null || weight === null) return null;
  return Math.max(0, successChance - passRate) + weight;
}

/**
 * How long planning had been stalled when each member joined, in join order.
 *
 * Torn plans one role at a time in join order, 24 hours each. A role starts
 * when the role before it finishes or when its member joins, whichever is
 * later; the gap between the two is a stall that member's join ended.
 * Checked against 79 of the faction's crimes with no mismatches.
 */
export function stallJoins(planningAt: number, joinedAt: number[]): number[] {
  const order = joinedAt.map((at, index) => ({ at, index })).sort((a, b) => a.at - b.at);
  const result = new Array<number>(joinedAt.length).fill(0);
  let previousEnd = planningAt;

  order.forEach(({ at, index }, position) => {
    // The first member opens planning, so nothing can have stalled before them.
    const gap = position === 0 ? 0 : Math.max(0, at - previousEnd);
    result[index] = gap;
    const start = position === 0 ? at : previousEnd + gap;
    previousEnd = start + PLANNING_SECONDS_PER_ROLE;
  });

  return result;
}

/**
 * Rounds each share to the nearest dollar, unless that would pay out more than
 * the pot holds; then every share rounds down instead. Dollars the shares do
 * not use stay with the caller.
 */
function roundShares(pot: number, exact: number[]): number[] {
  const nearest = exact.map((value) => Math.round(value));
  if (nearest.reduce((sum, value) => sum + value, 0) <= pot) return nearest;
  return exact.map((value) => Math.floor(value));
}

/** Splits a pot by score. */
function shareByScore(pot: number, scores: number[]): number[] {
  const sum = scores.reduce((total, score) => total + Math.max(0, score), 0);
  if (pot <= 0 || sum <= 0) return scores.map(() => 0);
  return roundShares(pot, scores.map((score) => (pot * Math.max(0, score)) / sum));
}

/** Works out one crime's payout. */
export function computePayout(crime: CrimeInput, percents: Percents): CrimePayout {
  const total = Math.max(0, Math.floor(crime.total));
  const count = crime.members.length;

  const prs = crime.members.map((member) => member.prs);
  const roleKnown = prs.every((score) => score !== null);
  const pts = crime.members.map((member) => Math.max(0, crime.executedAt - member.joinedAt));
  const stall = stallJoins(
    crime.planningAt,
    crime.members.map((member) => member.joinedAt),
  );
  const totalStall = stall.reduce((sum, value) => sum + value, 0);

  // A crime nobody stalled has no one to give the stall bonus to, so it goes
  // back into the base pay pool. Initiation stalls are not counted yet: the
  // API does not say who caused them.
  const stallPercent = totalStall > 0 ? percents.stall : 0;
  const exactPots = [percents.role, percents.time, stallPercent].map((percent) => (total * percent) / 100);
  const exactBase = count > 0 ? (total - (total * percents.faction) / 100 - exactPots.reduce((a, b) => a + b, 0)) / count : 0;

  // Base pay rounds up first. The bonus pots then round to the nearest dollar,
  // or down when nearest would leave base pay short.
  let base = Math.max(0, Math.ceil(exactBase));
  let pots = exactPots.map((value) => Math.round(value));
  if (count * base + pots.reduce((a, b) => a + b, 0) > total) pots = exactPots.map((value) => Math.floor(value));
  const potSum = pots.reduce((a, b) => a + b, 0);
  if (count > 0 && count * base + potSum > total) base = Math.max(0, Math.floor((total - potSum) / count));
  const [roleReserve = 0, timeReserve = 0, stallReserve = 0] = pots;
  const prc = roleKnown ? shareByScore(roleReserve, prs.map((score) => score ?? 0)) : null;
  const ptc = shareByScore(timeReserve, pts);
  const psc = shareByScore(stallReserve, stall);

  const players = crime.members.map((member, index): PlayerPayout => {
    const role = prc ? (prc[index] ?? 0) : null;
    const time = ptc[index] ?? 0;
    const stallCut = psc[index] ?? 0;
    return {
      id: member.id,
      name: member.name,
      role: member.role,
      prs: prs[index] ?? null,
      prc: role,
      pts: pts[index] ?? 0,
      ptc: time,
      stallJoin: stall[index] ?? 0,
      psc: stallCut,
      base,
      payout: role === null ? null : base + role + time + stallCut,
    };
  });

  const remaining = roleKnown ? players.reduce((sum, player) => sum + (player.payout ?? 0), 0) : null;

  return {
    total,
    factionCut: remaining === null ? null : total - remaining,
    remaining,
    base,
    totalRoleScore: roleKnown ? prs.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null,
    roleReserve,
    totalTimeScore: pts.reduce((sum, value) => sum + value, 0),
    timeReserve,
    stallReserve,
    totalStall,
    players,
  };
}

/**
 * Splits a chain's money between its crimes by member count.
 *
 * A crime that unlocks another pays nothing itself; the last crime's reward
 * covers every member of the chain. Each share rounds as roundShares does;
 * a dollar left unshared stays with the faction.
 */
export function splitChain(total: number, memberCounts: number[]): number[] {
  const everyone = memberCounts.reduce((sum, count) => sum + count, 0);
  if (everyone <= 0) return memberCounts.map(() => 0);
  return roundShares(total, memberCounts.map((count) => (total * count) / everyone));
}
