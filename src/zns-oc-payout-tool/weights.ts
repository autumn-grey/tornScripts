// Role weights, by crime name and then role label as the API writes them
// (for example "Robber #1"). Torn's API has no weights, so the faction
// supplies them. Values are percentages.

/** Weight per role, by crime name. */
export const ROLE_WEIGHTS: Record<string, Record<string, number>> = {};

/** Returns a role's weight, or null when it is not listed. */
export function roleWeight(crimeName: string, roleLabel: string): number | null {
  return ROLE_WEIGHTS[crimeName]?.[roleLabel] ?? null;
}
