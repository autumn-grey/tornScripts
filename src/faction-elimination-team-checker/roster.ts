import { ApiError, fetchMembers, fetchTeamOf } from "./api";
import { log } from "./debug";
import { Roster, RosterEntry, rememberTeams, writeRoster } from "./settings";

// Torn allows 100 calls a minute and every member costs one, so the walk is
// paced to stay under that even with another script sharing the key.
const CALL_SPACING_MS = 700;
const RATE_LIMIT_BACKOFF_MS = 15_000;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** How far through the member list a scan has got. */
export interface Progress {
  done: number;
  total: number;
}

/** Stops a scan that is still running. */
export class Cancelled extends Error {}

/** Walks a faction's members and stores each one's elimination team. */
export async function scanRoster(
  key: string,
  season: string,
  factionId: number,
  onProgress: (progress: Progress) => void,
  cancelled: () => boolean,
): Promise<Roster> {
  const members = await fetchMembers(key, factionId);
  const entries: RosterEntry[] = [];

  onProgress({ done: 0, total: members.length });

  for (const member of members) {
    if (cancelled()) throw new Cancelled();

    try {
      const team = await fetchTeamOf(key, member.id);
      entries.push({ id: member.id, name: member.name, team });
    } catch (error) {
      if (error instanceof ApiError && error.code === 5) {
        log("rate limited, backing off");
        await wait(RATE_LIMIT_BACKOFF_MS);
        if (cancelled()) throw new Cancelled();
        const team = await fetchTeamOf(key, member.id);
        entries.push({ id: member.id, name: member.name, team });
      } else if (error instanceof ApiError && error.code === 6) {
        log("skipping unknown member", member.id);
      } else {
        throw error;
      }
    }

    onProgress({ done: entries.length, total: members.length });
    await wait(CALL_SPACING_MS);
  }

  const roster: Roster = {
    season,
    factionId,
    fetchedAt: Date.now(),
    entries,
  };
  writeRoster(roster);
  rememberTeams(season, entries);
  return roster;
}
