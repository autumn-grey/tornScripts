// Everything ZNS OC Payout tool keeps in the browser: the key, the percentages,
// and which members have been paid for which crime.
//
// localStorage, not GM storage: the script runs with @grant none so its
// form filling reaches Torn's own React inputs.

import { PercentInputs, Percents } from "./payout";

const PREFIX = "OCP_";

const API_KEY = "API_KEY";
const PERCENTS_KEY = "PERCENTS";
const PAID_KEY = "PAID";
const PANEL_OPEN_KEY = "PANEL_OPEN";
const PREREQ_KEY = "PREREQUISITES";
const KEY_OWNER_KEY = "KEY_OWNER";

/** How long the list of crimes that unlock others is used before it is fetched again. */
const PREREQ_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function read(key: string, fallback: string): string {
  try {
    return localStorage.getItem(PREFIX + key) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    // The value will not survive the tab.
  }
}

function readJson(key: string): unknown {
  try {
    return JSON.parse(read(key, "null")) as unknown;
  } catch {
    return null;
  }
}

/** Returns the stored API key, empty when none has passed Check. */
export function readApiKey(): string {
  return read(API_KEY, "").trim();
}

/** Stores a key that has passed Check. */
export function writeApiKey(key: string): void {
  write(API_KEY, key.trim());
}

/** Returns the stored percentages; a box never filled in is null and shows empty. */
export function readPercents(): PercentInputs {
  const stored = readJson(PERCENTS_KEY) as Partial<PercentInputs> | null;
  const pick = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null;
  return {
    faction: pick(stored?.faction),
    time: pick(stored?.time),
    role: pick(stored?.role),
    stall: pick(stored?.stall),
  };
}

/** Stores the percentages as entered, empty boxes included. */
export function writePercents(percents: PercentInputs): void {
  write(PERCENTS_KEY, JSON.stringify(percents));
}

/** One member's payment for one crime. */
export interface Payment {
  amount: number;
  at: number;
  /** Whose key the tool was using when the payment was made; missing on payments recorded before 0.1.21. */
  by?: Payer;
}

/** A player who made a payment. */
export interface Payer {
  id: number;
  name: string;
}

/** Returns the stored key's owner, or null when it has not been looked up. */
export function readKeyOwner(): Payer | null {
  const stored = readJson(KEY_OWNER_KEY) as Partial<Payer> | null;
  return stored && typeof stored.id === "number" && stored.id > 0 && typeof stored.name === "string"
    ? { id: stored.id, name: stored.name }
    : null;
}

/** Stores the key's owner. */
export function writeKeyOwner(owner: Payer): void {
  write(KEY_OWNER_KEY, JSON.stringify(owner));
}

/**
 * What has been paid for one crime.
 *
 * The percentages are frozen at the first payment, so changing them part way
 * through cannot change what the rest of that crime's members are owed.
 */
export interface CrimePayments {
  percents: Percents;
  members: Record<string, Payment>;
}

/** Returns every crime's payments, by crime id. */
export function readPaid(): Record<string, CrimePayments> {
  const stored = readJson(PAID_KEY);
  return stored && typeof stored === "object" ? (stored as Record<string, CrimePayments>) : {};
}

/** Records one member as paid for one crime. */
export function recordPayment(crimeId: number, percents: Percents, memberId: number, amount: number): void {
  const paid = readPaid();
  const crime = paid[String(crimeId)] ?? { percents, members: {} };
  const by = readKeyOwner();
  crime.members[String(memberId)] = { amount, at: Math.floor(Date.now() / 1000), ...(by ? { by } : {}) };
  paid[String(crimeId)] = crime;
  write(PAID_KEY, JSON.stringify(paid));
}

/** Says whether the panel should start open. */
export function readPanelOpen(): boolean {
  return read(PANEL_OPEN_KEY, "1") !== "0";
}

/** Remembers whether the panel is open. */
export function writePanelOpen(open: boolean): void {
  write(PANEL_OPEN_KEY, open ? "1" : "0");
}

/** Returns the stored names of crimes that unlock another crime, or null when stale. */
export function readPrerequisites(): Set<string> | null {
  const stored = readJson(PREREQ_KEY) as { at?: number; names?: unknown } | null;
  if (!stored || typeof stored.at !== "number" || !Array.isArray(stored.names)) return null;
  if (Date.now() - stored.at > PREREQ_MAX_AGE_MS) return null;
  return new Set(stored.names.filter((name): name is string => typeof name === "string"));
}

/** Stores the names of crimes that unlock another crime. */
export function writePrerequisites(names: Set<string>): void {
  write(PREREQ_KEY, JSON.stringify({ at: Date.now(), names: [...names] }));
}
