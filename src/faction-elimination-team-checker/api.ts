import { log } from "./debug";
import { TeamInfo, slugify } from "./teams";

const V1 = "https://api.torn.com";
const V2 = "https://api.torn.com/v2";

/** Torn's own word for why a call was turned away. */
export class ApiError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

/** Says whether an error means the key itself is the problem. */
export function isKeyProblem(error: unknown): boolean {
  return error instanceof ApiError && [1, 2, 10, 13, 16, 18].includes(error.code);
}

async function request(url: string): Promise<Record<string, unknown>> {
  let body: Record<string, unknown>;

  try {
    const response = await fetch(url, { credentials: "omit" });
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new ApiError(0, "Could not reach the Torn API.");
  }

  const error = body.error as { code?: number; error?: string } | undefined;
  if (error) throw new ApiError(error.code ?? 0, error.error ?? "Unknown API error.");

  return body;
}

/** The competition Torn is currently running. */
export interface Competition {
  name: string;
  teams: TeamInfo[];
}

/** The running competition and its teams, with the ones already out marked. */
export async function fetchCompetition(key: string): Promise<Competition> {
  const body = await request(`${V1}/torn/?selections=competition&key=${encodeURIComponent(key)}`);
  const competition = body.competition as { name?: string; teams?: unknown[] } | undefined;
  const teams = Array.isArray(competition?.teams) ? competition.teams : [];

  return {
    name: competition?.name ?? "",
    teams: teams
      .map((entry) => entry as { teamID?: number; name?: string; lives?: number })
      .filter((entry) => typeof entry.name === "string")
      .map((entry) => ({
        id: entry.teamID ?? 0,
        name: entry.name as string,
        slug: slugify(entry.name as string),
        lives: entry.lives ?? 0,
        eliminated: (entry.lives ?? 0) <= 0,
      })),
  };
}

/** One faction member, as the member list gives them. */
export interface FactionMember {
  id: number;
  name: string;
}

/** Everyone in a faction, or in the key owner's own faction when no id is given. */
export async function fetchMembers(key: string, factionId: number | null): Promise<FactionMember[]> {
  const path = factionId ? `${V2}/faction/${factionId}/members` : `${V2}/faction/members`;
  const body = await request(`${path}?key=${encodeURIComponent(key)}`);
  const members = Array.isArray(body.members) ? body.members : [];

  return members
    .map((entry) => entry as { id?: number; name?: string })
    .filter((entry) => typeof entry.id === "number")
    .map((entry) => ({ id: entry.id as number, name: entry.name ?? String(entry.id) }));
}

/** The elimination team one player is on, or null when they are on none. */
export async function fetchTeamOf(key: string, userId: number): Promise<string | null> {
  const body = await request(
    `${V1}/user/${userId}?selections=profile&key=${encodeURIComponent(key)}`,
  );
  const competition = body.competition as { team?: string } | undefined;
  log("standing", userId, competition);

  const team = typeof competition?.team === "string" ? competition.team : "";
  return team && team.toLowerCase() !== "unknown" ? team : null;
}

/** The faction whose page is being looked at, or null when the URL names none. */
export function factionIdFromUrl(): number | null {
  const id = new URLSearchParams(location.search).get("ID");
  const parsed = Number(id);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** The faction the key's owner belongs to, or 0 when they are in none. */
export async function fetchOwnFactionId(key: string): Promise<number> {
  const body = await request(`${V1}/user/?selections=profile&key=${encodeURIComponent(key)}`);
  const faction = body.faction as { faction_id?: number } | undefined;
  const id = faction?.faction_id ?? body.faction_id;
  return typeof id === "number" && id > 0 ? id : 0;
}
