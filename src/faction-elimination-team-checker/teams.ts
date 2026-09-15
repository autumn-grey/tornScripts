const ICON_BASE = "https://www.torn.com/images/v2/competition/elimination/team-icons";

/** One elimination team as the competition standings describe it. */
export interface TeamInfo {
  id: number;
  name: string;
  slug: string;
  lives: number;
  eliminated: boolean;
}

/** Turns a team's display name into the name its icon file is under. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Says whether Torn is being played in its dark theme. */
export function darkTheme(): boolean {
  return document.body?.classList.contains("dark-mode") ?? true;
}

/** The address of a team's icon in one of the two themes. */
export function iconUrl(slug: string, dark: boolean): string {
  return `${ICON_BASE}/${slug}-${dark ? "dark" : "light"}.svg`;
}

/** Turns the standings into a lookup from team name to team. */
export function indexTeams(teams: TeamInfo[]): Map<string, TeamInfo> {
  const index = new Map<string, TeamInfo>();
  for (const team of teams) index.set(team.name.toLowerCase(), team);
  return index;
}

// Torn replaces the teams each year and gives them fresh ids, so the set of
// ids in play is what tells one year's competition from the next.

/** Names the competition a set of teams belongs to. */
export function seasonKey(competition: string, teams: TeamInfo[]): string {
  const ids = teams
    .map((team) => team.id)
    .sort((a, b) => a - b)
    .join(",");
  return `${competition}:${ids}`;
}
