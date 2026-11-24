// Turns the API's crimes into the rows the panel shows: links chains together,
// values item rewards, names members and works out each crime's payout.

import {
  ApiCrime,
  ApiSlot,
  fetchCrime,
  fetchCrimes,
  fetchItemValues,
  fetchMemberNames,
  fetchPrerequisites,
  fetchUserName,
} from "./api";
import { log } from "./debug";
import { CrimePayout, MemberInput, Percents, computePayout, roleScore, splitChain } from "./payout";
import { readPaid, readPrerequisites, writePrerequisites } from "./settings";
import { roleInfo } from "./weights";

/** Where a crime stands. */
export type CrimeState =
  /** Paid out from its own reward, or its share of a chain's. */
  | "payable"
  /** Unlocked a crime that has not finished yet, so there is no money yet. */
  | "waiting"
  /** Unlocked a crime that failed, so there is nothing to pay. */
  | "chain-failed";

/** One crime as the panel shows it. */
export interface CrimeRow {
  crime: ApiCrime;
  state: CrimeState;
  /** Every crime in this one's chain, oldest first; just this one when it is not chained. */
  chain: ApiCrime[];
  /** The percentages this crime is worked out with. */
  percents: Percents | null;
  /** The money this crime pays out from, null while it is waiting on the crime it unlocked. */
  total: number | null;
  /** Null while waiting, or after a failed chain. */
  payout: CrimePayout | null;
  /** Members marked paid, by id. */
  paid: Set<number>;
  /** Torn's own payout system has already paid this crime. */
  paidByTorn: boolean;
}

/** Everything loaded so far. */
const loaded = new Map<number, ApiCrime>();
/** Crimes the list shows, newest first. */
const listed: number[] = [];
const names = new Map<number, string>();
const itemValues = new Map<number, number>();
let prerequisites = new Set<string>();
let nextOffset = 0;
let hasMore = true;

/** Says whether there are older crimes to load. */
export function moreToLoad(): boolean {
  return hasMore;
}

/** Forgets everything loaded, ready for a fresh fetch. */
export function resetCrimes(): void {
  loaded.clear();
  listed.length = 0;
  nextOffset = 0;
  hasMore = true;
}

/** Returns a member's name, or their id while it is not known. */
export function memberName(id: number): string {
  return names.get(id) ?? String(id);
}

/** Returns the crime a crime unlocked, if it is loaded. */
function nextInChain(crime: ApiCrime): ApiCrime | undefined {
  for (const other of loaded.values()) {
    if (other.previous_crime_id === crime.id) return other;
  }
  return undefined;
}

/** Fetches the earlier links of a chain that are not loaded yet. */
async function loadChainLinks(key: string): Promise<void> {
  const wanted = (): number[] =>
    [...loaded.values()]
      .map((crime) => crime.previous_crime_id)
      .filter((id): id is number => typeof id === "number" && !loaded.has(id));

  // A chain is at most three crimes long, so this runs at most twice.
  for (let ids = wanted(); ids.length; ids = wanted()) {
    for (const id of ids) {
      const crime = await fetchCrime(key, id);
      if (crime) loaded.set(crime.id, crime);
      else loaded.set(id, { id, previous_crime_id: null, name: "", difficulty: 0, status: "", planning_at: null, ready_at: null, executed_at: null, slots: [], rewards: null });
    }
  }
}

/** Looks up names for members not in the faction's current list. */
async function loadNames(key: string): Promise<void> {
  if (!names.size) {
    for (const [id, name] of await fetchMemberNames(key)) names.set(id, name);
  }
  for (const crime of loaded.values()) {
    for (const slot of crime.slots) {
      const id = slot.user?.id;
      if (id === undefined || names.has(id)) continue;
      try {
        names.set(id, await fetchUserName(key, id));
      } catch {
        names.set(id, String(id));
      }
    }
  }
}

/** Values every reward item not valued yet. */
async function loadItemValues(key: string): Promise<void> {
  const ids = new Set<number>();
  for (const crime of loaded.values()) {
    for (const item of crime.rewards?.items ?? []) {
      if (!itemValues.has(item.id)) ids.add(item.id);
    }
  }
  if (!ids.size) return;
  for (const [id, value] of await fetchItemValues(key, [...ids])) itemValues.set(id, value);
}

/** Loads the next page of crimes and everything needed to price them. */
export async function loadMore(key: string): Promise<void> {
  if (!prerequisites.size) {
    prerequisites = readPrerequisites() ?? (await fetchPrerequisites(key));
    writePrerequisites(prerequisites);
  }

  const page = await fetchCrimes(key, nextOffset);
  nextOffset += page.crimes.length;
  hasMore = page.more;

  for (const crime of page.crimes) {
    loaded.set(crime.id, crime);
    if (crime.status === "Successful") listed.push(crime.id);
  }

  await loadChainLinks(key);
  await loadNames(key);
  await loadItemValues(key);
}

/** A crime's reward in dollars: its money plus its items at market value. */
function rewardValue(crime: ApiCrime): number {
  const items = (crime.rewards?.items ?? []).reduce(
    (sum, item) => sum + (itemValues.get(item.id) ?? 0) * item.quantity,
    0,
  );
  return (crime.rewards?.money ?? 0) + items;
}

/**
 * A member's checkpoint pass rate in their role: the first number of each
 * "65/70" on the crimes page, which matched the API role for role
 * (checked 2026-11-25).
 */
function checkpointPassRate(slot: ApiSlot): number {
  return slot.checkpoint_pass_rate;
}

/** Returns a crime's filled roles as the maths needs them. */
function members(crime: ApiCrime): MemberInput[] {
  return crime.slots
    .filter((slot) => slot.user)
    .map((slot) => {
      const role = slot.position_info?.label ?? slot.position;
      const info = roleInfo(crime.name, role);
      return {
        id: slot.user!.id,
        name: memberName(slot.user!.id),
        role,
        prs: roleScore(checkpointPassRate(slot), info?.minimum ?? null, info?.weight ?? null),
        joinedAt: slot.user!.joined_at,
      };
    });
}

/** Builds the chain a crime belongs to, oldest first. */
function chainOf(crime: ApiCrime): ApiCrime[] {
  const chain = [crime];
  for (let back = loaded.get(crime.previous_crime_id ?? -1); back; back = loaded.get(back.previous_crime_id ?? -1)) {
    chain.unshift(back);
  }
  for (let next = nextInChain(crime); next; next = nextInChain(next)) chain.push(next);
  return chain;
}

/** Builds the rows for every listed crime, using the given percentages for any crime not yet part paid. */
export function buildRows(percents: Percents | null): CrimeRow[] {
  const paidRecords = readPaid();

  return listed.map((id): CrimeRow => {
    const crime = loaded.get(id)!;
    const chain = chainOf(crime);
    const last = chain[chain.length - 1]!;
    const record = paidRecords[String(id)];
    const used = record?.percents ?? percents;
    const paid = new Set(Object.keys(record?.members ?? {}).map(Number));
    const paidByTorn = !!crime.rewards?.payout;

    let state: CrimeState = "payable";
    if (last.status !== "Successful") state = "chain-failed";
    else if (prerequisites.has(last.name)) state = "waiting";

    let total: number | null = null;
    let payout: CrimePayout | null = null;
    if (state === "chain-failed") total = 0;
    if (state === "payable") {
      const shares = splitChain(rewardValue(last), chain.map((link) => members(link).length));
      total = shares[chain.indexOf(crime)] ?? 0;
    }
    if (state === "payable" && total !== null && used) {
      payout = computePayout(
        {
          total,
          planningAt: crime.planning_at ?? 0,
          executedAt: crime.executed_at ?? 0,
          members: members(crime),
        },
        used,
      );
      log("payout", crime.id, crime.name, payout);
    }

    return { crime, state, chain, percents: used, total, payout, paid, paidByTorn };
  });
}
