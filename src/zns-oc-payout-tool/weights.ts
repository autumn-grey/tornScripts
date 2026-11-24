// Each role's optimal minimum checkpoint pass rate and weight, by crime and
// role. Torn's API has neither: the faction supplied this table (2026-11-25).
// Its minimums match the Torn OC Role Restrictions script's table and its
// weights match tornprobability.com's. Weights are percentages. Level 1 crimes
// show "-" there; the faction's minimum for them is 70.
//
// Crimes the faction's table lacks are added below it: minimums from the Role
// Restrictions script where it has them, weights from tornprobability.com's
// GetRoleWeights (fetched 2026-11-25, rounded to one decimal). A null minimum
// is one neither source gives, which leaves that role's score unknown.

/** A role's optimal minimum checkpoint pass rate and its weight. */
export interface RoleInfo {
  minimum: number | null;
  weight: number;
}

type Table = Record<string, Record<string, [number | null, number]>>;

const TABLE: Table = {
  "Break the Bank": {
    "Robber": [63, 12.7], "Muscle #1": [63, 13.5], "Muscle #2": [60, 10.1],
    "Muscle #3": [72, 31.7], "Thief #1": [60, 2.9], "Thief #2": [72, 29.1],
  },
  "Clinical Precision": {
    "Assassin": [60, 16.1], "Cat Burglar": [70, 18.9], "Cleaner": [70, 21.1], "Imitator": [75, 43.3],
  },
  "Ship Happens": {
    "Assassin": [70, 10.3], "Engineer": [70, 13.3], "Hustler": [70, 19.7],
    "Interrogator": [70, 31.3], "Spy": [70, 25.4],
  },
  "Cleared for Takeoff": {
    "Assassin": [70, 18.2], "Imitator": [70, 24.9], "Interrogator": [70, 25.2],
    "Lookout": [70, 8.4], "Pickpocket": [70, 12.0], "Techie": [70, 11.3],
  },
  "Window of Opportunity": {
    "Engineer": [70, 14.6], "Looter #1": [70, 19.5], "Looter #2": [70, 25.8],
    "Muscle #1": [70, 23.1], "Muscle #2": [70, 17.0],
  },
  "Bidding War": {
    "Robber #1": [60, 7.1], "Robber #2": [75, 22.9], "Robber #3": [70, 31.7],
    "Bomber #1": [70, 7.8], "Bomber #2": [63, 18.0], "Driver": [70, 12.5],
  },
  "Dish It Out": {
    "Assassin": [70, 37.3], "Engineer": [70, 13.9], "Muscle": [70, 25.2],
    "Saboteur #1": [70, 14.6], "Saboteur #2": [70, 8.9],
  },
  "Leave No Trace": {
    "Imitator": [73, 36.9], "Negotiator": [60, 34.1], "Techie": [60, 29.0],
  },
  "Sneaky Git Grab": {
    "Hacker": [66, 14.5], "Imitator": [60, 17.5], "Pickpocket": [75, 50.8], "Techie": [70, 17.1],
  },
  "Counter Offer": {
    "Hacker": [60, 12.1], "Engineer": [62, 28.4], "Looter": [42, 7.0],
    "Robber": [62, 35.9], "Picklock": [60, 16.5],
  },
  "Guardian Angels": {
    "Engineer": [70, 30.5], "Enforcer": [60, 27.4], "Hustler": [73, 42.1],
  },
  "Honey Trap": {
    "Enforcer": [60, 27.0], "Muscle #1": [70, 30.9], "Muscle #2": [75, 42.2],
  },
  "No Reserve": {
    "Car Thief": [67, 30.5], "Engineer": [67, 31.1], "Techie": [75, 38.4],
  },
  "Plucking the Lotus Petal": {
    "Hustler": [70, 14.4], "Muscle": [70, 47.9], "Robber #1": [70, 14.0], "Robber #2": [70, 23.7],
  },
  "Snow Blind": {
    "Hustler": [74, 48.4], "Imitator": [70, 34.6], "Muscle #1": [70, 8.5], "Muscle #2": [50, 8.5],
  },
  "Stage Fright": {
    "Sniper": [75, 46.3], "Lookout": [60, 6.2], "Enforcer": [70, 15.7],
    "Muscle #1": [70, 20.0], "Muscle #2": [50, 2.7], "Muscle #3": [70, 9.2],
  },
  "Gaslight the Way": {
    "Looter #1": [60, 9.4], "Looter #2": [40, 0.0], "Looter #3": [65, 12.4],
    "Imitator #1": [70, 9.4], "Imitator #2": [72, 27.5], "Imitator #3": [72, 41.3],
  },
  "Market Forces": {
    "Lookout": [68, 16.4], "Arsonist": [40, 4.5], "Muscle": [70, 22.5],
    "Enforcer": [70, 29.4], "Negotiator": [70, 27.2],
  },
  "Smoke and Wing Mirrors": {
    "Hustler #1": [60, 9.0], "Hustler #2": [65, 13.0], "Car Thief": [74, 50.9], "Imitator": [70, 27.1],
  },
  "Best of the Lot": {
    "Muscle": [75, 43.7], "Car Thief": [70, 19.5], "Imitator": [60, 16.1], "Picklock": [70, 20.7],
  },
  "Cash Me if You Can": {
    "Lookout": [70, 17.8], "Thief #1": [70, 54.2], "Thief #2": [65, 28.0],
  },
  "Thou Shalt Not Steal": {
    "Thief": [70, 12.4], "Picklock": [70, 49.7], "Pickpocket": [70, 37.9],
  },
  "First Aid and Abet": {
    "Decoy": [70, 30.7], "Pickpocket": [70, 43.2], "Picklock": [70, 26.0],
  },
  "Mob Mentality": {
    "Looter #1": [70, 34.0], "Looter #2": [70, 26.5], "Looter #3": [70, 18.4], "Looter #4": [70, 21.2],
  },
  "Pet Project": {
    "Kidnapper": [70, 30.9], "Picklock": [70, 36.4], "Muscle": [70, 32.6],
  },

  // Not in the faction's table: see the note at the top of the file.
  "Blast from the Past": {
    "Picklock #1": [70, 10.8], "Hacker": [65, 12.1], "Engineer": [75, 24.0],
    "Bomber": [70, 15.6], "Muscle": [75, 34.6], "Picklock #2": [40, 2.9],
  },
  "Stacking the Deck": {
    "Cat Burglar": [75, 23.4], "Driver": [68, 3.0], "Hacker": [63, 25.4], "Imitator": [70, 48.2],
  },
  "Ace in the Hole": {
    "Imitator": [65, 21.1], "Muscle #1": [65, 18.3], "Muscle #2": [72, 24.7],
    "Hacker": [75, 28.3], "Driver": [60, 7.6],
  },
  "Lock Stock": {
    "Assassin": [null, 40.3], "Smuggler": [null, 17.4], "Hacker": [null, 18.4],
    "Muscle #1": [null, 11.9], "Muscle #2": [null, 11.9],
  },
  "Manifest Cruelty": {
    "Hacker": [null, 16.3], "Interrogator": [null, 23.5], "Reviver": [null, 46.3], "Cat Burglar": [null, 13.9],
  },
  "Gone Fission": {
    "Hijacker": [null, 24.9], "Engineer": [null, 15.6], "Pickpocket": [null, 16.5],
    "Imitator": [null, 24.9], "Bomber": [null, 18.0],
  },
  "Hostile Takeover": {
    "Hacker": [null, 11.2], "Engineer": [null, 15.2], "Cat Burglar": [null, 16.0],
    "Kidnapper": [null, 13.0], "Negotiator": [null, 24.0], "Muscle": [null, 20.7],
  },
  "Crane Reaction": {
    "Sniper": [null, 40.7], "Lookout": [null, 16.6], "Engineer": [null, 8.3],
    "Bomber": [null, 15.9], "Muscle #1": [null, 10.7], "Muscle #2": [null, 7.8],
  },
  "Disorderly Conduct": {
    "Vandal": [null, 24.8], "Arsonist": [null, 27.7], "Muscle": [null, 17.5], "Looter": [null, 30.0],
  },
};

/**
 * Reduces a crime or role name to letters and digits, accents folded.
 *
 * Torn's API writes "Guardian Ángels" and "Dish It Out" where the table has
 * "Guardian Angels" and "Dish it Out", so names are compared in this form.
 */
function key(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const LOOKUP = new Map<string, Map<string, RoleInfo>>(
  Object.entries(TABLE).map(([crime, roles]) => [
    key(crime),
    new Map(Object.entries(roles).map(([role, [minimum, weight]]) => [key(role), { minimum, weight }])),
  ]),
);

/** Returns a role's minimum and weight, or null when the table does not list it. */
export function roleInfo(crimeName: string, roleLabel: string): RoleInfo | null {
  return LOOKUP.get(key(crimeName))?.get(key(roleLabel)) ?? null;
}
