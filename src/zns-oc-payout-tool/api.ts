// The Torn API calls ZNS OC Payout tool makes. Shapes follow the v2 spec
// (https://www.torn.com/swagger/openapi.json, 6.19.1).

import { log } from "./debug";

const V2 = "https://api.torn.com/v2";

/** Shows in the key owner's API log beside each call. */
const COMMENT = "OCPayout";

/** How many crimes one page of the list holds. */
export const PAGE_SIZE = 20;

/** Torn's own word for why a call was turned away. */
export class ApiError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

/** One filled role in a crime. */
export interface ApiSlot {
  position: string;
  position_info?: { label?: string };
  checkpoint_pass_rate: number;
  user: { id: number; joined_at: number } | null;
}

/** One crime from /faction/crimes. */
export interface ApiCrime {
  id: number;
  previous_crime_id: number | null;
  name: string;
  /** The crime's level, 1 to 10. */
  difficulty: number;
  status: string;
  planning_at: number | null;
  ready_at: number | null;
  executed_at: number | null;
  slots: ApiSlot[];
  rewards: {
    money: number;
    items: { id: number; quantity: number }[];
    payout: { paid_at: number; paid_by: number } | null;
  } | null;
}

async function request(path: string, key: string, params: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const query = new URLSearchParams({ ...params, comment: COMMENT, key });
  let body: Record<string, unknown>;

  try {
    const response = await fetch(`${V2}${path}?${query.toString()}`, { credentials: "omit" });
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new ApiError(0, "Could not reach the Torn API");
  }

  const error = body.error as { code?: number; error?: string } | undefined;
  if (error) throw new ApiError(error.code ?? 0, error.error ?? "Unknown API error");
  return body;
}

/** Checks a key can read the faction's crimes; throws the API's error when it can't. */
export async function checkKey(key: string): Promise<void> {
  await request("/faction/crimes", key, { cat: "completed", limit: "1" });
}

/** One page of completed crimes, newest first, and whether there are older ones. */
export async function fetchCrimes(key: string, offset: number): Promise<{ crimes: ApiCrime[]; more: boolean }> {
  const body = await request("/faction/crimes", key, {
    cat: "completed",
    sort: "DESC",
    limit: String(PAGE_SIZE),
    offset: String(offset),
  });
  const crimes = Array.isArray(body.crimes) ? (body.crimes as ApiCrime[]) : [];
  const links = (body._metadata as { links?: { next?: string | null } } | undefined)?.links;
  log("crimes", offset, crimes);
  return { crimes, more: crimes.length === PAGE_SIZE && !!links?.next };
}

/** One crime by id, for a chain link that is not in the loaded pages. */
export async function fetchCrime(key: string, id: number): Promise<ApiCrime | null> {
  const body = await request(`/faction/${id}/crime`, key);
  return (body.crime as ApiCrime | undefined) ?? null;
}

/** The faction's current members' names, by id. */
export async function fetchMemberNames(key: string): Promise<Map<number, string>> {
  const body = await request("/faction/members", key);
  const names = new Map<number, string>();
  const members = Array.isArray(body.members) ? body.members : [];
  for (const entry of members as { id?: number; name?: string }[]) {
    if (typeof entry.id === "number" && typeof entry.name === "string") names.set(entry.id, entry.name);
  }
  return names;
}

/** The player a key belongs to, recorded as the payer of payments made with it. */
export async function fetchKeyOwner(key: string): Promise<{ id: number; name: string }> {
  const body = await request("/user/basic", key);
  const profile = body.profile as { id?: number; name?: string } | undefined;
  return { id: profile?.id ?? 0, name: profile?.name ?? "" };
}

/** One player's name, for a member who has since left the faction. */
export async function fetchUserName(key: string, id: number): Promise<string> {
  const body = await request(`/user/${id}/basic`, key);
  const profile = body.profile as { name?: string } | undefined;
  return profile?.name ?? String(id);
}

/** The names of crimes that unlock another crime instead of paying out. */
export async function fetchPrerequisites(key: string): Promise<Set<string>> {
  const body = await request("/torn/organizedcrimes", key);
  const crimes = Array.isArray(body.organizedcrimes) ? body.organizedcrimes : [];
  const names = new Set<string>();
  for (const crime of crimes as { prerequisite?: string | null }[]) {
    if (typeof crime.prerequisite === "string") names.add(crime.prerequisite);
  }
  return names;
}

/** Market value of each item, by item id. */
export async function fetchItemValues(key: string, ids: number[]): Promise<Map<number, number>> {
  const values = new Map<number, number>();
  if (!ids.length) return values;

  const body = await request(`/torn/${ids.join(",")}/items`, key);
  const items = Array.isArray(body.items) ? body.items : [];
  for (const item of items as { id?: number; value?: { market_price?: number } }[]) {
    if (typeof item.id === "number") values.set(item.id, item.value?.market_price ?? 0);
  }
  return values;
}
