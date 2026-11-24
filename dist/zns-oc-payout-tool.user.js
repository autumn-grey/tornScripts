// ==UserScript==
// @name         ZNS OC Payout tool
// @namespace    https://github.com/autumn-grey
// @version      0.1.29
// @description  Torn Faction admin tool for tweaking Organised Crime payouts
// @author       AutumnGrey
// @license      MIT
// @match        https://www.torn.com/factions.php*
// @grant        none
// @run-at       document-idle
// @noframes     true
// @downloadURL  https://raw.githubusercontent.com/autumn-grey/tornScripts/main/dist/zns-oc-payout-tool.user.js
// @updateURL    https://raw.githubusercontent.com/autumn-grey/tornScripts/main/dist/zns-oc-payout-tool.user.js
// ==/UserScript==

"use strict";
(() => {
  // src/zns-oc-payout-tool/debug.ts
  var DEBUG_KEY = "OCP_DEBUG";
  function debugging() {
    try {
      return localStorage.getItem(DEBUG_KEY) === "1";
    } catch {
      return false;
    }
  }
  function log(...parts) {
    if (!debugging()) return;
    console.log("[OCP]", ...parts);
  }

  // src/shared/apiKey.ts
  var KEY_SHAPE = /^[A-Za-z0-9]{16}$/;
  var BAD_KEY_SHAPE = "API keys are 16 letters and numbers";
  function isKeyShaped(key2) {
    return KEY_SHAPE.test(key2);
  }

  // src/zns-oc-payout-tool/api.ts
  var V2 = "https://api.torn.com/v2";
  var COMMENT = "OCPayout";
  var PAGE_SIZE = 20;
  var ApiError = class extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  };
  async function request(path, key2, params = {}) {
    const query = new URLSearchParams({ ...params, comment: COMMENT, key: key2 });
    let body;
    try {
      const response = await fetch(`${V2}${path}?${query.toString()}`, { credentials: "omit" });
      body = await response.json();
    } catch {
      throw new ApiError(0, "Could not reach the Torn API");
    }
    const error = body.error;
    if (error) throw new ApiError(error.code ?? 0, error.error ?? "Unknown API error");
    return body;
  }
  async function checkKey(key2) {
    await request("/faction/crimes", key2, { cat: "completed", limit: "1" });
  }
  async function fetchCrimes(key2, offset) {
    const body = await request("/faction/crimes", key2, {
      cat: "completed",
      sort: "DESC",
      limit: String(PAGE_SIZE),
      offset: String(offset)
    });
    const crimes = Array.isArray(body.crimes) ? body.crimes : [];
    const links = body._metadata?.links;
    log("crimes", offset, crimes);
    return { crimes, more: crimes.length === PAGE_SIZE && !!links?.next };
  }
  async function fetchCrime(key2, id) {
    const body = await request(`/faction/${id}/crime`, key2);
    return body.crime ?? null;
  }
  async function fetchMemberNames(key2) {
    const body = await request("/faction/members", key2);
    const names2 = /* @__PURE__ */ new Map();
    const members2 = Array.isArray(body.members) ? body.members : [];
    for (const entry of members2) {
      if (typeof entry.id === "number" && typeof entry.name === "string") names2.set(entry.id, entry.name);
    }
    return names2;
  }
  async function fetchKeyOwner(key2) {
    const body = await request("/user/basic", key2);
    const profile = body.profile;
    return { id: profile?.id ?? 0, name: profile?.name ?? "" };
  }
  async function fetchUserName(key2, id) {
    const body = await request(`/user/${id}/basic`, key2);
    const profile = body.profile;
    return profile?.name ?? String(id);
  }
  async function fetchPrerequisites(key2) {
    const body = await request("/torn/organizedcrimes", key2);
    const crimes = Array.isArray(body.organizedcrimes) ? body.organizedcrimes : [];
    const names2 = /* @__PURE__ */ new Set();
    for (const crime of crimes) {
      if (typeof crime.prerequisite === "string") names2.add(crime.prerequisite);
    }
    return names2;
  }
  async function fetchItemValues(key2, ids) {
    const values = /* @__PURE__ */ new Map();
    if (!ids.length) return values;
    const body = await request(`/torn/${ids.join(",")}/items`, key2);
    const items = Array.isArray(body.items) ? body.items : [];
    for (const item of items) {
      if (typeof item.id === "number") values.set(item.id, item.value?.market_price ?? 0);
    }
    return values;
  }

  // src/shared/hashedClass.ts
  function hashedClass(name, atStart = false) {
    const forms = [`${name}___`, `_${name}_`];
    const parts = atStart ? forms.flatMap((form) => [`[class^="${form}"]`, `[class*=" ${form}"]`]) : forms.map((form) => `[class*="${form}"]`);
    return `:is(${parts.join(", ")})`;
  }

  // src/zns-oc-payout-tool/bank.ts
  var SELECTORS = {
    /** The player box: a search box that takes "Name [ID]". */
    player: 'input[data-testid="autocomplete-input"]',
    /** The amount box. */
    amount: 'input[data-testid="legacy-money-input"]',
    /** The radio that pays into the member's faction balance. */
    addToBalance: 'div[role="radiogroup"] input[type="radio"][value="addToBalance"]',
    /** The form's send button. */
    send: `${hashedClass("btnContainer")} button[type="submit"]`
  };
  var REFILL_DELAYS_MS = [150, 400, 900];
  function findFields() {
    const player = document.querySelector(SELECTORS.player);
    const amount = document.querySelector(SELECTORS.amount);
    return player && amount ? { player, amount } : null;
  }
  function fillField(input, value) {
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
    if (setter) setter.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function chooseBalance() {
    const radio = document.querySelector(SELECTORS.addToBalance);
    if (!radio) log("bank: no Add to balance option found");
    else if (!radio.checked) radio.click();
  }
  function fillBankForm(prefill) {
    const fields = findFields();
    if (!fields) {
      log("bank: form not found");
      return false;
    }
    chooseBalance();
    const fill = () => {
      fillField(fields.player, prefill.label);
      fillField(fields.amount, String(prefill.amount));
    };
    fill();
    for (const delay of REFILL_DELAYS_MS) {
      setTimeout(() => {
        if (fields.player.isConnected && fields.player.value === "") fill();
      }, delay);
    }
    return true;
  }
  function stillMatches(prefill) {
    const fields = findFields();
    if (!fields) return false;
    const amount = fields.amount.value.replace(/\D+/g, "");
    return fields.player.value.includes(`[${prefill.memberId}]`) && amount === String(prefill.amount);
  }
  function watchSendButton(current, onSent2) {
    document.addEventListener(
      "click",
      (event) => {
        const button2 = event.target instanceof Element ? event.target.closest(SELECTORS.send) : null;
        if (!button2 || button2.disabled) return;
        const prefill = current();
        if (!prefill) return;
        if (!stillMatches(prefill)) {
          log("bank: form was changed by hand, not counting this send", prefill);
          return;
        }
        onSent2(prefill);
      },
      true
    );
  }

  // src/zns-oc-payout-tool/payout.ts
  var PLANNING_SECONDS_PER_ROLE = 24 * 60 * 60;
  function percentsProblem(percents2) {
    const values = Object.values(percents2).filter((value) => value !== null);
    if (values.some((value) => !Number.isFinite(value) || value < 0)) return "Percentages can't be negative";
    if (values.reduce((sum, value) => sum + value, 0) > 100) return "Percentages add up to more than 100";
    return null;
  }
  function completePercents(percents2) {
    if (percentsProblem(percents2)) return null;
    return {
      faction: percents2.faction ?? 0,
      time: percents2.time ?? 0,
      role: percents2.role ?? 0,
      stall: percents2.stall ?? 0
    };
  }
  function roleScore(checkpointPassRate2, minimum, weight) {
    if (checkpointPassRate2 === null || minimum === null || weight === null) return null;
    return Math.max(0, checkpointPassRate2 - minimum + weight);
  }
  function stallJoins(planningAt, joinedAt) {
    const order = joinedAt.map((at, index) => ({ at, index })).sort((a, b) => a.at - b.at);
    const result = joinedAt.map(() => ({ gap: 0, previousEnd: null }));
    let previousEnd = planningAt;
    order.forEach(({ at, index }, position) => {
      const gap = position === 0 ? 0 : Math.max(0, at - previousEnd);
      result[index] = { gap, previousEnd: position === 0 ? null : previousEnd };
      const start = position === 0 ? at : previousEnd + gap;
      previousEnd = start + PLANNING_SECONDS_PER_ROLE;
    });
    return result;
  }
  function roundShares(pot, exact) {
    const nearest = exact.map((value) => Math.round(value));
    if (nearest.reduce((sum, value) => sum + value, 0) <= pot) return nearest;
    return exact.map((value) => Math.floor(value));
  }
  function shareByScore(pot, scores) {
    const sum = scores.reduce((total, score) => total + Math.max(0, score), 0);
    if (pot <= 0 || sum <= 0) return scores.map(() => 0);
    return roundShares(pot, scores.map((score) => pot * Math.max(0, score) / sum));
  }
  function computePayout(crime, percents2) {
    const total = Math.max(0, Math.floor(crime.total));
    const count = crime.members.length;
    const prs = crime.members.map((member) => member.prs);
    const roleKnown = prs.every((score) => score !== null);
    const pts = crime.members.map((member) => Math.max(0, crime.executedAt - member.joinedAt));
    const stallDetails = stallJoins(
      crime.planningAt,
      crime.members.map((member) => member.joinedAt)
    );
    const stall = stallDetails.map((detail) => detail.gap);
    const totalStall = stall.reduce((sum, value) => sum + value, 0);
    const stallPercent = totalStall > 0 ? percents2.stall : 0;
    const exactPots = [percents2.role, percents2.time, stallPercent].map((percent) => total * percent / 100);
    const exactBase = count > 0 ? (total - total * percents2.faction / 100 - exactPots.reduce((a, b) => a + b, 0)) / count : 0;
    let base = Math.max(0, Math.ceil(exactBase));
    let pots = exactPots.map((value) => Math.round(value));
    if (count * base + pots.reduce((a, b) => a + b, 0) > total) pots = exactPots.map((value) => Math.floor(value));
    const potSum = pots.reduce((a, b) => a + b, 0);
    if (count > 0 && count * base + potSum > total) base = Math.max(0, Math.floor((total - potSum) / count));
    const [roleReserve = 0, timeReserve = 0, stallReserve = 0] = pots;
    const prc = roleKnown ? shareByScore(roleReserve, prs.map((score) => score ?? 0)) : null;
    const ptc = shareByScore(timeReserve, pts);
    const psc = shareByScore(stallReserve, stall);
    const players = crime.members.map((member, index) => {
      const role = prc ? prc[index] ?? 0 : null;
      const time = ptc[index] ?? 0;
      const stallCut = psc[index] ?? 0;
      return {
        id: member.id,
        name: member.name,
        role: member.role,
        prs: prs[index] ?? null,
        roleParts: member.roleParts,
        prc: role,
        pts: pts[index] ?? 0,
        ptc: time,
        stallJoin: stall[index] ?? 0,
        joinedAt: member.joinedAt,
        executedAt: crime.executedAt,
        previousRoleEnd: stallDetails[index]?.previousEnd ?? null,
        psc: stallCut,
        base,
        payout: role === null ? null : base + role + time + stallCut
      };
    });
    const remaining = roleKnown ? players.reduce((sum, player) => sum + (player.payout ?? 0), 0) : null;
    return {
      total,
      factionCut: remaining === null ? null : total - remaining,
      remaining,
      base,
      totalRoleScore: roleKnown ? prs.reduce((sum, value) => sum + (value ?? 0), 0) : null,
      roleReserve,
      totalTimeScore: pts.reduce((sum, value) => sum + value, 0),
      timeReserve,
      stallReserve,
      totalStall,
      players
    };
  }
  function splitChain(total, links) {
    const lowest = Math.min(...links.map((link) => link.level));
    const counts = links.map((link) => link.members + (link.level - lowest));
    const everyone = counts.reduce((sum, count) => sum + count, 0);
    if (everyone <= 0) return counts.map(() => 0);
    const shares = roundShares(total, counts.map((count) => total * count / everyone));
    const spare = total - shares.reduce((sum, share) => sum + share, 0);
    const lowestIndex = links.findIndex((link) => link.level === lowest);
    shares[lowestIndex] = (shares[lowestIndex] ?? 0) + spare;
    return shares;
  }

  // src/zns-oc-payout-tool/settings.ts
  var PREFIX = "OCP_";
  var API_KEY = "API_KEY";
  var PERCENTS_KEY = "PERCENTS";
  var PAID_KEY = "PAID";
  var PANEL_OPEN_KEY = "PANEL_OPEN";
  var PREREQ_KEY = "PREREQUISITES";
  var KEY_OWNER_KEY = "KEY_OWNER";
  var PREREQ_MAX_AGE_MS = 24 * 60 * 60 * 1e3;
  function read(key2, fallback) {
    try {
      return localStorage.getItem(PREFIX + key2) ?? fallback;
    } catch {
      return fallback;
    }
  }
  function write(key2, value) {
    try {
      localStorage.setItem(PREFIX + key2, value);
    } catch {
    }
  }
  function readJson(key2) {
    try {
      return JSON.parse(read(key2, "null"));
    } catch {
      return null;
    }
  }
  function readApiKey() {
    return read(API_KEY, "").trim();
  }
  function writeApiKey(key2) {
    write(API_KEY, key2.trim());
  }
  function readPercents() {
    const stored = readJson(PERCENTS_KEY);
    const pick = (value) => typeof value === "number" && Number.isFinite(value) ? value : null;
    return {
      faction: pick(stored?.faction),
      time: pick(stored?.time),
      role: pick(stored?.role),
      stall: pick(stored?.stall)
    };
  }
  function writePercents(percents2) {
    write(PERCENTS_KEY, JSON.stringify(percents2));
  }
  function readKeyOwner() {
    const stored = readJson(KEY_OWNER_KEY);
    return stored && typeof stored.id === "number" && stored.id > 0 && typeof stored.name === "string" ? { id: stored.id, name: stored.name } : null;
  }
  function writeKeyOwner(owner) {
    write(KEY_OWNER_KEY, JSON.stringify(owner));
  }
  function readPaid() {
    const stored = readJson(PAID_KEY);
    return stored && typeof stored === "object" ? stored : {};
  }
  function recordPayment(crimeId, percents2, memberId, amount) {
    const paid = readPaid();
    const crime = paid[String(crimeId)] ?? { percents: percents2, members: {} };
    const by = readKeyOwner();
    crime.members[String(memberId)] = { amount, at: Math.floor(Date.now() / 1e3), ...by ? { by } : {} };
    paid[String(crimeId)] = crime;
    write(PAID_KEY, JSON.stringify(paid));
  }
  function readPanelOpen() {
    return read(PANEL_OPEN_KEY, "1") !== "0";
  }
  function writePanelOpen(open) {
    write(PANEL_OPEN_KEY, open ? "1" : "0");
  }
  function readPrerequisites() {
    const stored = readJson(PREREQ_KEY);
    if (!stored || typeof stored.at !== "number" || !Array.isArray(stored.names)) return null;
    if (Date.now() - stored.at > PREREQ_MAX_AGE_MS) return null;
    return new Set(stored.names.filter((name) => typeof name === "string"));
  }
  function writePrerequisites(names2) {
    write(PREREQ_KEY, JSON.stringify({ at: Date.now(), names: [...names2] }));
  }

  // src/zns-oc-payout-tool/weights.ts
  var TABLE = {
    "Break the Bank": {
      "Robber": [63, 12.7],
      "Muscle #1": [63, 13.5],
      "Muscle #2": [60, 10.1],
      "Muscle #3": [72, 31.7],
      "Thief #1": [60, 2.9],
      "Thief #2": [72, 29.1]
    },
    "Clinical Precision": {
      "Assassin": [60, 16.1],
      "Cat Burglar": [70, 18.9],
      "Cleaner": [70, 21.1],
      "Imitator": [75, 43.3]
    },
    "Ship Happens": {
      "Assassin": [70, 10.3],
      "Engineer": [70, 13.3],
      "Hustler": [70, 19.7],
      "Interrogator": [70, 31.3],
      "Spy": [70, 25.4]
    },
    "Cleared for Takeoff": {
      "Assassin": [70, 18.2],
      "Imitator": [70, 24.9],
      "Interrogator": [70, 25.2],
      "Lookout": [70, 8.4],
      "Pickpocket": [70, 12],
      "Techie": [70, 11.3]
    },
    "Window of Opportunity": {
      "Engineer": [70, 14.6],
      "Looter #1": [70, 19.5],
      "Looter #2": [70, 25.8],
      "Muscle #1": [70, 23.1],
      "Muscle #2": [70, 17]
    },
    "Bidding War": {
      "Robber #1": [60, 7.1],
      "Robber #2": [75, 22.9],
      "Robber #3": [70, 31.7],
      "Bomber #1": [70, 7.8],
      "Bomber #2": [63, 18],
      "Driver": [70, 12.5]
    },
    "Dish It Out": {
      "Assassin": [70, 37.3],
      "Engineer": [70, 13.9],
      "Muscle": [70, 25.2],
      "Saboteur #1": [70, 14.6],
      "Saboteur #2": [70, 8.9]
    },
    "Leave No Trace": {
      "Imitator": [73, 36.9],
      "Negotiator": [60, 34.1],
      "Techie": [60, 29]
    },
    "Sneaky Git Grab": {
      "Hacker": [66, 14.5],
      "Imitator": [60, 17.5],
      "Pickpocket": [75, 50.8],
      "Techie": [70, 17.1]
    },
    "Counter Offer": {
      "Hacker": [60, 12.1],
      "Engineer": [62, 28.4],
      "Looter": [42, 7],
      "Robber": [62, 35.9],
      "Picklock": [60, 16.5]
    },
    "Guardian Angels": {
      "Engineer": [70, 30.5],
      "Enforcer": [60, 27.4],
      "Hustler": [73, 42.1]
    },
    "Honey Trap": {
      "Enforcer": [60, 27],
      "Muscle #1": [70, 30.9],
      "Muscle #2": [75, 42.2]
    },
    "No Reserve": {
      "Car Thief": [67, 30.5],
      "Engineer": [67, 31.1],
      "Techie": [75, 38.4]
    },
    "Plucking the Lotus Petal": {
      "Hustler": [70, 14.4],
      "Muscle": [70, 47.9],
      "Robber #1": [70, 14],
      "Robber #2": [70, 23.7]
    },
    "Snow Blind": {
      "Hustler": [74, 48.4],
      "Imitator": [70, 34.6],
      "Muscle #1": [70, 8.5],
      "Muscle #2": [50, 8.5]
    },
    "Stage Fright": {
      "Sniper": [75, 46.3],
      "Lookout": [60, 6.2],
      "Enforcer": [70, 15.7],
      "Muscle #1": [70, 20],
      "Muscle #2": [50, 2.7],
      "Muscle #3": [70, 9.2]
    },
    "Gaslight the Way": {
      "Looter #1": [60, 9.4],
      "Looter #2": [40, 0],
      "Looter #3": [65, 12.4],
      "Imitator #1": [70, 9.4],
      "Imitator #2": [72, 27.5],
      "Imitator #3": [72, 41.3]
    },
    "Market Forces": {
      "Lookout": [68, 16.4],
      "Arsonist": [40, 4.5],
      "Muscle": [70, 22.5],
      "Enforcer": [70, 29.4],
      "Negotiator": [70, 27.2]
    },
    "Smoke and Wing Mirrors": {
      "Hustler #1": [60, 9],
      "Hustler #2": [65, 13],
      "Car Thief": [74, 50.9],
      "Imitator": [70, 27.1]
    },
    "Best of the Lot": {
      "Muscle": [75, 43.7],
      "Car Thief": [70, 19.5],
      "Imitator": [60, 16.1],
      "Picklock": [70, 20.7]
    },
    "Cash Me if You Can": {
      "Lookout": [70, 17.8],
      "Thief #1": [70, 54.2],
      "Thief #2": [65, 28]
    },
    "Thou Shalt Not Steal": {
      "Thief": [70, 12.4],
      "Picklock": [70, 49.7],
      "Pickpocket": [70, 37.9]
    },
    "First Aid and Abet": {
      "Decoy": [70, 30.7],
      "Pickpocket": [70, 43.2],
      "Picklock": [70, 26]
    },
    "Mob Mentality": {
      "Looter #1": [70, 34],
      "Looter #2": [70, 26.5],
      "Looter #3": [70, 18.4],
      "Looter #4": [70, 21.2]
    },
    "Pet Project": {
      "Kidnapper": [70, 30.9],
      "Picklock": [70, 36.4],
      "Muscle": [70, 32.6]
    },
    // Not in the faction's table: see the note at the top of the file.
    "Blast from the Past": {
      "Picklock #1": [70, 10.8],
      "Hacker": [65, 12.1],
      "Engineer": [75, 24],
      "Bomber": [70, 15.6],
      "Muscle": [75, 34.6],
      "Picklock #2": [40, 2.9]
    },
    "Stacking the Deck": {
      "Cat Burglar": [75, 23.4],
      "Driver": [68, 3],
      "Hacker": [63, 25.4],
      "Imitator": [70, 48.2]
    },
    "Ace in the Hole": {
      "Imitator": [65, 21.1],
      "Muscle #1": [65, 18.3],
      "Muscle #2": [72, 24.7],
      "Hacker": [75, 28.3],
      "Driver": [60, 7.6]
    },
    "Lock Stock": {
      "Assassin": [null, 40.3],
      "Smuggler": [null, 17.4],
      "Hacker": [null, 18.4],
      "Muscle #1": [null, 11.9],
      "Muscle #2": [null, 11.9]
    },
    "Manifest Cruelty": {
      "Hacker": [null, 16.3],
      "Interrogator": [null, 23.5],
      "Reviver": [null, 46.3],
      "Cat Burglar": [null, 13.9]
    },
    "Gone Fission": {
      "Hijacker": [null, 24.9],
      "Engineer": [null, 15.6],
      "Pickpocket": [null, 16.5],
      "Imitator": [null, 24.9],
      "Bomber": [null, 18]
    },
    "Hostile Takeover": {
      "Hacker": [null, 11.2],
      "Engineer": [null, 15.2],
      "Cat Burglar": [null, 16],
      "Kidnapper": [null, 13],
      "Negotiator": [null, 24],
      "Muscle": [null, 20.7]
    },
    "Crane Reaction": {
      "Sniper": [null, 40.7],
      "Lookout": [null, 16.6],
      "Engineer": [null, 8.3],
      "Bomber": [null, 15.9],
      "Muscle #1": [null, 10.7],
      "Muscle #2": [null, 7.8]
    },
    "Disorderly Conduct": {
      "Vandal": [null, 24.8],
      "Arsonist": [null, 27.7],
      "Muscle": [null, 17.5],
      "Looter": [null, 30]
    }
  };
  function key(name) {
    return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }
  var LOOKUP = new Map(
    Object.entries(TABLE).map(([crime, roles]) => [
      key(crime),
      new Map(Object.entries(roles).map(([role, [minimum, weight]]) => [key(role), { minimum, weight }]))
    ])
  );
  function roleInfo(crimeName, roleLabel) {
    return LOOKUP.get(key(crimeName))?.get(key(roleLabel)) ?? null;
  }

  // src/zns-oc-payout-tool/crimes.ts
  var loaded = /* @__PURE__ */ new Map();
  var listed = [];
  var names = /* @__PURE__ */ new Map();
  var itemValues = /* @__PURE__ */ new Map();
  var prerequisites = /* @__PURE__ */ new Set();
  var nextOffset = 0;
  var hasMore = true;
  function moreToLoad() {
    return hasMore;
  }
  function resetCrimes() {
    loaded.clear();
    listed.length = 0;
    nextOffset = 0;
    hasMore = true;
  }
  function memberName(id) {
    return names.get(id) ?? String(id);
  }
  function nextInChain(crime) {
    for (const other of loaded.values()) {
      if (other.previous_crime_id === crime.id) return other;
    }
    return void 0;
  }
  async function loadChainLinks(key2) {
    const wanted = () => [...loaded.values()].map((crime) => crime.previous_crime_id).filter((id) => typeof id === "number" && !loaded.has(id));
    for (let ids = wanted(); ids.length; ids = wanted()) {
      for (const id of ids) {
        const crime = await fetchCrime(key2, id);
        if (crime) loaded.set(crime.id, crime);
        else loaded.set(id, { id, previous_crime_id: null, name: "", difficulty: 0, status: "", planning_at: null, ready_at: null, executed_at: null, slots: [], rewards: null });
      }
    }
  }
  async function loadNames(key2) {
    if (!names.size) {
      for (const [id, name] of await fetchMemberNames(key2)) names.set(id, name);
    }
    for (const crime of loaded.values()) {
      for (const slot of crime.slots) {
        const id = slot.user?.id;
        if (id === void 0 || names.has(id)) continue;
        try {
          names.set(id, await fetchUserName(key2, id));
        } catch {
          names.set(id, String(id));
        }
      }
    }
  }
  async function loadItemValues(key2) {
    const ids = /* @__PURE__ */ new Set();
    for (const crime of loaded.values()) {
      for (const item of crime.rewards?.items ?? []) {
        if (!itemValues.has(item.id)) ids.add(item.id);
      }
    }
    if (!ids.size) return;
    for (const [id, value] of await fetchItemValues(key2, [...ids])) itemValues.set(id, value);
  }
  async function loadMore(key2) {
    if (!prerequisites.size) {
      prerequisites = readPrerequisites() ?? await fetchPrerequisites(key2);
      writePrerequisites(prerequisites);
    }
    const page = await fetchCrimes(key2, nextOffset);
    nextOffset += page.crimes.length;
    hasMore = page.more;
    for (const crime of page.crimes) {
      loaded.set(crime.id, crime);
      if (crime.status === "Successful") listed.push(crime.id);
    }
    await loadChainLinks(key2);
    await loadNames(key2);
    await loadItemValues(key2);
  }
  function rewardValue(crime) {
    const items = (crime.rewards?.items ?? []).reduce(
      (sum, item) => sum + (itemValues.get(item.id) ?? 0) * item.quantity,
      0
    );
    return (crime.rewards?.money ?? 0) + items;
  }
  function checkpointPassRate(slot) {
    return slot.checkpoint_pass_rate;
  }
  function members(crime) {
    return crime.slots.filter((slot) => slot.user).map((slot) => {
      const role = slot.position_info?.label ?? slot.position;
      const info = roleInfo(crime.name, role);
      return {
        id: slot.user.id,
        name: memberName(slot.user.id),
        role,
        prs: roleScore(checkpointPassRate(slot), info?.minimum ?? null, info?.weight ?? null),
        roleParts: {
          checkpointPassRate: checkpointPassRate(slot),
          minimum: info?.minimum ?? null,
          weight: info?.weight ?? null
        },
        joinedAt: slot.user.joined_at
      };
    });
  }
  function chainOf(crime) {
    const chain = [crime];
    for (let back = loaded.get(crime.previous_crime_id ?? -1); back; back = loaded.get(back.previous_crime_id ?? -1)) {
      chain.unshift(back);
    }
    for (let next = nextInChain(crime); next; next = nextInChain(next)) chain.push(next);
    return chain;
  }
  function buildRows(percents2) {
    const paidRecords = readPaid();
    return displayOrder().map((id) => {
      const crime = loaded.get(id);
      const chain = chainOf(crime);
      const last = chain[chain.length - 1];
      const record = paidRecords[String(id)];
      const used = record?.percents ?? percents2;
      const paid = new Set(Object.keys(record?.members ?? {}).map(Number));
      const paidByTorn = !!crime.rewards?.payout;
      let state = "payable";
      if (last.status !== "Successful") state = "chain-failed";
      else if (prerequisites.has(last.name)) state = "waiting";
      let total = null;
      let payout = null;
      if (state === "chain-failed") total = 0;
      if (state === "payable") {
        const shares = splitChain(
          rewardValue(last),
          chain.map((link) => ({ members: members(link).length, level: link.difficulty }))
        );
        total = shares[chain.indexOf(crime)] ?? 0;
      }
      if (state === "waiting") total = 0;
      if ((state === "payable" || state === "waiting") && total !== null && used) {
        payout = computePayout(
          {
            total,
            planningAt: crime.planning_at ?? 0,
            executedAt: crime.executed_at ?? 0,
            members: members(crime)
          },
          used
        );
        log("payout", crime.id, crime.name, payout);
      }
      const feeder = chain.length > 1 && last.id !== crime.id || state === "waiting";
      const payments = record?.members ?? {};
      return { crime, state, chain, percents: used, total, payout, paid, payments, paidByTorn, feeder };
    });
  }
  function displayOrder() {
    const order = [];
    const seen = /* @__PURE__ */ new Set();
    const listedIds = new Set(listed);
    for (const id of listed) {
      if (seen.has(id)) continue;
      const chain = chainOf(loaded.get(id));
      const last = chain[chain.length - 1];
      if (last.id !== id && listedIds.has(last.id)) continue;
      order.push(id);
      seen.add(id);
      if (last.id !== id) continue;
      for (const link of chain.slice(0, -1).reverse()) {
        if (link.status !== "Successful" || seen.has(link.id)) continue;
        order.push(link.id);
        seen.add(link.id);
      }
    }
    return order;
  }

  // src/zns-oc-payout-tool/styles.ts
  var STYLE_ID = "ocp-styles";
  var PANEL_ID = "ocp-panel";
  var COLLAPSED_CLASS = "ocp-collapsed";
  var COLOURS = {
    background: "#121314",
    bar: "#202122",
    /* Dizzy's screenshot shade (#191919, 10% bright) made 10% lighter. */
    feeder: "#333333",
    hover: "#1e1f20",
    /* An open crime's row, the colour of the editor's panel tab bar. */
    open: "#202122",
    /* Everything inside an open crime, the colour of the editor's terminal. */
    inside: "#191a1b",
    /* The editor's current-line colour, tinted towards the row's text colour. */
    selectedRed: "#3a2e2e",
    selectedGreen: "#263928",
    border: "#2a2b2c",
    text: "#bbbebf",
    muted: "#858889",
    red: "#ff7b72",
    green: "#35e935"
  };
  var ROW_HEIGHT = 27;
  var MAX_LINES = 30;
  var CSS = `
  #${PANEL_ID} {
    margin: 10px 0;
    border-radius: 5px;
    overflow: hidden;
    border: 1px solid ${COLOURS.border};
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    color: ${COLOURS.text} !important;
  }
  /* Torn colours divs and table cells dark and outranks a colour set on the
     panel, so every cell inherits with !important. Coloured classes below
     use the same id prefix to win back. */
  #${PANEL_ID} .ocp-body * {
    color: inherit !important;
  }
  #${PANEL_ID} .ocp-title {
    display: flex;
    align-items: center;
    gap: 7px;
    cursor: pointer;
    height: 30px;
    line-height: 30px;
    padding: 0 10px;
    background: ${COLOURS.bar};
    color: ${COLOURS.text} !important;
    font-weight: bold;
  }
  #${PANEL_ID} .ocp-caret {
    font-size: 10px;
    transition: transform 0.15s ease;
  }
  #${PANEL_ID}.${COLLAPSED_CLASS} .ocp-caret { transform: rotate(-90deg); }
  #${PANEL_ID}.${COLLAPSED_CLASS} .ocp-body { display: none; }
  #${PANEL_ID} .ocp-body {
    background: ${COLOURS.background};
    padding: 10px 12px;
  }

  /* --------------------------------------------------------- controls */

  #${PANEL_ID} .ocp-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    margin: 0 0 8px;
  }
  #${PANEL_ID} .ocp-key-field {
    position: relative;
    display: flex;
    align-items: center;
    flex: 0 1 220px;
    min-width: 0;
  }
  #${PANEL_ID} input.ocp-input,
  #${PANEL_ID} input.ocp-percent {
    box-sizing: border-box;
    border: 1px solid ${COLOURS.border};
    border-radius: 4px;
    background: #000;
    color: #fff !important;
    font-size: 12px;
  }
  #${PANEL_ID} input.ocp-input {
    width: 100%;
    padding: 4px 28px 4px 7px;
    line-height: 18px;
  }
  /* Hides the key's characters while keeping it a text box, so password
     managers leave it alone. */
  #${PANEL_ID} input.ocp-input.ocp-masked {
    -webkit-text-security: disc;
  }
  #${PANEL_ID} input.ocp-percent {
    width: 52px;
    padding: 3px 5px;
    text-align: right;
  }
  #${PANEL_ID} .ocp-percent-label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  #${PANEL_ID} .ocp-eye {
    position: absolute;
    right: 5px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    width: 20px;
    height: 20px;
    padding: 0;
    border: 0;
    background: none;
    color: ${COLOURS.text} !important;
    cursor: pointer;
  }
  #${PANEL_ID} .ocp-eye svg { width: 15px; height: 15px; margin: auto; }
  /* Paint, font and border come from Torn's own torn-btn; only the size is ours. */
  #${PANEL_ID} .ocp-button {
    height: 24px;
    line-height: 22px;
    margin: 0;
    padding: 0 10px;
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
  }
  #${PANEL_ID} .ocp-button:not(.torn-btn) {
    border: 1px solid ${COLOURS.border};
    border-radius: 3px;
    background: ${COLOURS.bar};
    font-family: "Fjalla One", "Arial Narrow", Arial, sans-serif;
    text-transform: uppercase;
  }
  #${PANEL_ID} .ocp-button[disabled] { opacity: 0.5; cursor: default; }
  #${PANEL_ID} .ocp-status { font-size: 11px; font-weight: bold; }
  #${PANEL_ID} .ocp-ok    { color: ${COLOURS.green} !important; }
  #${PANEL_ID} .ocp-error { color: ${COLOURS.red} !important; }

  /* --------------------------------------------------------- crime list */

  /* Every line of the table is ROW_HEIGHT tall, so the box holds at most
     MAX_LINES of them, headings and crime details included, and scrolls. */
  #${PANEL_ID} .ocp-scroll {
    overflow: auto;
    max-height: ${MAX_LINES * ROW_HEIGHT}px;
  }
  #${PANEL_ID} .ocp-table th,
  #${PANEL_ID} .ocp-table td {
    box-sizing: border-box;
    height: ${ROW_HEIGHT}px;
    line-height: 16px;
  }
  /* The OC table's own headings stay in view while it scrolls. */
  #${PANEL_ID} .ocp-scroll > table > tbody > tr:first-child > th,
  #${PANEL_ID} .ocp-scroll > table > tr:first-child > th {
    position: sticky;
    top: 0;
    z-index: 1;
  }
  #${PANEL_ID} table.ocp-table {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid ${COLOURS.border};
  }
  #${PANEL_ID} .ocp-table th {
    padding: 5px 6px;
    background: ${COLOURS.bar};
    font-size: 11px;
    font-weight: bold;
    text-align: center;
    vertical-align: bottom;
  }
  #${PANEL_ID} .ocp-table td {
    padding: 5px 6px;
    border-top: 1px solid ${COLOURS.border};
    white-space: nowrap;
    text-align: center;
  }
  #${PANEL_ID} .ocp-payout { font-weight: bold; }
  #${PANEL_ID} .ocp-tip { cursor: help; }
  #${PANEL_ID} tr.ocp-crime { cursor: pointer; background: ${COLOURS.background}; }
  /* A crime that unlocked the one above it, stacked under it. */
  #${PANEL_ID} tr.ocp-crime.ocp-feeder { background: ${COLOURS.feeder}; }
  #${PANEL_ID} tr.ocp-crime:hover { background: ${COLOURS.hover}; }
  #${PANEL_ID} tr.ocp-crime.ocp-open { background: ${COLOURS.open}; }
  #${PANEL_ID} tr.ocp-crime td { color: ${COLOURS.red} !important; }
  #${PANEL_ID} tr.ocp-crime.ocp-done td { color: ${COLOURS.green} !important; }
  #${PANEL_ID} .ocp-caret-cell { width: 10px; font-size: 9px; }
  #${PANEL_ID} tr.ocp-detail > td {
    padding: 0;
    background: ${COLOURS.inside};
    white-space: normal;
  }
  #${PANEL_ID} .ocp-summary {
    padding: 6px;
    font-size: 11px;
    line-height: 16px;
  }
  #${PANEL_ID} .ocp-summary span + span::before {
    content: " | ";
    color: ${COLOURS.muted} !important;
  }
  #${PANEL_ID} table.ocp-players { border-width: 1px 0 0; }
  #${PANEL_ID} table.ocp-players th { font-size: 10px; white-space: normal; }
  #${PANEL_ID} tr.ocp-player td { color: ${COLOURS.red} !important; background: ${COLOURS.inside}; }
  #${PANEL_ID} tr.ocp-player.ocp-clickable { cursor: pointer; }
  #${PANEL_ID} tr.ocp-player.ocp-clickable:hover td { background: ${COLOURS.hover}; }
  #${PANEL_ID} tr.ocp-player.ocp-paid td { color: ${COLOURS.green} !important; }
  /* Listed with :hover so the chosen row keeps its colour while the mouse is
     still on it; red text gets the red tint, green (paid) the green one. */
  #${PANEL_ID} tr.ocp-player.ocp-selected td,
  #${PANEL_ID} tr.ocp-player.ocp-selected:hover td { background: ${COLOURS.selectedRed}; }
  #${PANEL_ID} tr.ocp-player.ocp-paid.ocp-selected td,
  #${PANEL_ID} tr.ocp-player.ocp-paid.ocp-selected:hover td { background: ${COLOURS.selectedGreen}; }
  #${PANEL_ID} .ocp-player-id { color: ${COLOURS.muted} !important; }
  #${PANEL_ID} .ocp-footer {
    display: flex;
    gap: 8px;
    margin: 8px 0 0;
  }
`;
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head ?? document.documentElement).appendChild(style);
  }

  // src/zns-oc-payout-tool/panel.ts
  var FULL_LOG_URL = "";
  var TAB_ROOTS = {
    armoury: "#faction-armoury",
    controls: "#faction-controls"
  };
  var percents = readPercents();
  var rows = [];
  var selection = null;
  var highlighted = null;
  var openCrimes = /* @__PURE__ */ new Set();
  var busy = false;
  function money(amount) {
    return amount === null ? "?" : `$${Math.round(amount).toLocaleString("en-US")}`;
  }
  function duration(seconds) {
    const minutes = Math.floor(seconds / 60);
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor(minutes % 1440 / 60);
    if (days > 0) return `${days}d ${hours}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes % 60}m`;
  }
  function tornDate(at) {
    if (!at) return "-";
    const date = new Date(at * 1e3);
    const two = (value) => String(value).padStart(2, "0");
    return `${two(date.getUTCDate())}/${two(date.getUTCMonth() + 1)}/${String(date.getUTCFullYear()).slice(2)} ${two(date.getUTCHours())}:${two(date.getUTCMinutes())}`;
  }
  function make(tag, className = "", text = "") {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }
  function button(text) {
    const element = make("button", "torn-btn ocp-button", text);
    element.type = "button";
    return element;
  }
  var SVG_NS = "http://www.w3.org/2000/svg";
  var EYE_PATHS = ["M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z", "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"];
  var EYE_OFF_PATHS = [
    "M17.9 17.9A10.1 10.1 0 0 1 12 20C5 20 1 12 1 12a18.5 18.5 0 0 1 5.1-5.9",
    "M9.9 4.2A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.2 3.2",
    "M14.1 14.1a3 3 0 1 1-4.2-4.2",
    "M1 1l22 22"
  ];
  function buildEye(shown) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    for (const definition of shown ? EYE_OFF_PATHS : EYE_PATHS) {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", definition);
      svg.appendChild(path);
    }
    return svg;
  }
  function buildKeyField() {
    const field = make("div", "ocp-key-field");
    const input = make("input", "ocp-input");
    input.type = "text";
    input.autocomplete = "off";
    input.name = "ocp-torn-api-key";
    input.spellcheck = false;
    input.setAttribute("data-lpignore", "true");
    input.setAttribute("data-1p-ignore", "true");
    input.setAttribute("data-bwignore", "true");
    input.setAttribute("data-form-type", "other");
    input.placeholder = "Limited access key";
    input.value = readApiKey();
    const eye = make("button", "ocp-eye");
    eye.type = "button";
    let shown = false;
    const apply = () => {
      input.classList.toggle("ocp-masked", !shown);
      eye.title = shown ? "Hide key" : "Show key";
      eye.setAttribute("aria-label", eye.title);
      eye.replaceChildren(buildEye(shown));
    };
    apply();
    eye.addEventListener("click", () => {
      shown = !shown;
      apply();
    });
    field.append(input, eye);
    return { field, input };
  }
  function setStatus(target, kind, text) {
    target.className = `ocp-status${kind === "none" ? "" : ` ocp-${kind}`}`;
    target.textContent = text;
  }
  function describe(error) {
    if (error instanceof ApiError && [2, 10, 13, 16, 18].includes(error.code)) return "Invalid key";
    if (error instanceof ApiError && error.code === 7) return "No faction API access";
    return error instanceof Error ? error.message : "Something went wrong";
  }
  function crimeDone(row) {
    if (row.state === "chain-failed" || row.paidByTorn) return true;
    if (!row.payout) return false;
    return row.payout.players.every((player) => row.paid.has(player.id));
  }
  function paidCount(row) {
    const total = row.crime.slots.filter((slot) => slot.user).length;
    if (row.paidByTorn || row.state === "chain-failed") return `${total}/${total}`;
    return `${row.paid.size}/${total}`;
  }
  function cash(row, amount) {
    return row.state === "waiting" ? "—" : money(amount);
  }
  function buildSummary(row) {
    const summary = make("div", "ocp-summary");
    if (row.state === "chain-failed") {
      summary.textContent = "The crime this one unlocked failed";
      return summary;
    }
    const payout = row.payout;
    const parts = [
      `Base: ${cash(row, payout?.base ?? null)}`,
      `Role Reserve: ${cash(row, payout?.roleReserve ?? null)}`,
      `Time Reserve: ${cash(row, payout?.timeReserve ?? null)}`,
      `Stall Bonus: ${cash(row, payout?.stallReserve ?? null)}`
    ];
    for (const part2 of parts) summary.appendChild(make("span", "", part2));
    return summary;
  }
  function part(value) {
    return value === null ? "?" : String(Math.round(value * 10) / 10);
  }
  function roleScoreSum(player) {
    const { checkpointPassRate: checkpointPassRate2, minimum, weight } = player.roleParts;
    return `CPR ${part(checkpointPassRate2)} - OM ${part(minimum)} + W ${part(weight)}`;
  }
  function stallScoreSum(player) {
    return `TPS ${duration(player.stallJoin)}`;
  }
  function cellWithTip(text, tip) {
    const cell = make("td", "ocp-tip", text);
    cell.title = tip;
    return cell;
  }
  var HEADING_TIPS = {
    "Role Score": "Checkpoint pass rate - optimal minimum + role weight, minimum 0",
    "Time Score": "Time from joining to initiation",
    "Stall Score": "Time planning stalled when joining - time delaying initiation + (for each other player who delayed initiation their time delayed - time delaying initiation, minimum 0)"
  };
  function paidDetails(row, player) {
    const payout = row.crime.rewards?.payout;
    if (row.paidByTorn && payout) {
      return `${tornDate(payout.paid_at)}
${memberName(payout.paid_by)} [${payout.paid_by}]`;
    }
    const payment = row.payments[String(player.id)];
    if (!payment) return null;
    const who = payment.by ? `
${payment.by.name} [${payment.by.id}]` : "";
    return `${tornDate(payment.at)}${who}`;
  }
  function buildPlayerRow(row, player) {
    const paid = row.paid.has(player.id) || row.paidByTorn;
    const line = make("tr", "ocp-player");
    if (paid) line.classList.add("ocp-paid");
    if (highlighted?.crimeId === row.crime.id && highlighted.memberId === player.id) line.classList.add("ocp-selected");
    const name = make("td");
    name.append(make("span", "", `${player.name} `), make("span", "ocp-player-id", `[${player.id}]`));
    line.appendChild(name);
    line.append(
      cellWithTip(player.prs?.toFixed(1) ?? "?", roleScoreSum(player)),
      make("td", "", cash(row, player.prc)),
      make("td", "", duration(player.pts)),
      make("td", "", cash(row, player.ptc)),
      cellWithTip(duration(player.stallJoin), stallScoreSum(player)),
      make("td", "", cash(row, player.psc))
    );
    line.appendChild(make("td", "ocp-payout", cash(row, player.payout)));
    const paidCell = make("td", "", paid ? "Paid" : "Unpaid");
    const paidTip = paidDetails(row, player);
    if (paidTip) {
      paidCell.title = paidTip;
      paidCell.classList.add("ocp-tip");
    }
    line.appendChild(paidCell);
    const payable = !paid && player.payout !== null && row.state !== "waiting";
    line.classList.add("ocp-clickable");
    line.addEventListener("click", () => choosePlayer(row, player, payable));
    return line;
  }
  function buildDetail(row) {
    const detail = make("tr", "ocp-detail");
    const cell = make("td");
    cell.colSpan = 8;
    cell.appendChild(buildSummary(row));
    if (row.payout) {
      const table = make("table", "ocp-table ocp-players");
      const head = make("tr");
      const headings = [
        "Player",
        "Role Score",
        "Role Cut",
        "Time Score",
        "Time Cut",
        "Stall Score",
        "Stall Cut",
        "Payout",
        "Paid"
      ];
      for (const text of headings) {
        const cell2 = make("th", "", text);
        const tip = HEADING_TIPS[text];
        if (tip) {
          cell2.title = tip;
          cell2.classList.add("ocp-tip");
        }
        head.appendChild(cell2);
      }
      table.appendChild(head);
      const players = [...row.payout.players].sort((a, b) => b.pts - a.pts);
      for (const player of players) table.appendChild(buildPlayerRow(row, player));
      cell.appendChild(table);
    }
    detail.appendChild(cell);
    return detail;
  }
  function buildCrime(row) {
    const open = openCrimes.has(row.crime.id);
    const line = make("tr", "ocp-crime");
    if (open) line.classList.add("ocp-open");
    if (row.feeder) line.classList.add("ocp-feeder");
    if (crimeDone(row)) line.classList.add("ocp-done");
    line.appendChild(make("td", "ocp-caret-cell", open ? "▾" : "▸"));
    const arrow = row.feeder && row.state !== "waiting" ? "⮤ " : "";
    line.appendChild(make("td", "", arrow + row.crime.name));
    line.appendChild(make("td", "", String(row.crime.difficulty)));
    line.appendChild(make("td", "", tornDate(row.crime.executed_at)));
    const payout = row.payout;
    const split = (amount) => row.state === "payable" ? money(amount ?? null) : "—";
    line.appendChild(make("td", "", row.state === "waiting" ? "Waiting" : money(row.total)));
    line.appendChild(make("td", "", split(payout?.factionCut)));
    line.appendChild(make("td", "", split(payout?.remaining)));
    line.appendChild(make("td", "", paidCount(row)));
    line.addEventListener("click", () => {
      if (open) openCrimes.delete(row.crime.id);
      else openCrimes.add(row.crime.id);
      render();
    });
    return open ? [line, buildDetail(row)] : [line];
  }
  function render() {
    const list = document.getElementById("ocp-list");
    if (!list) return;
    if (!percentsProblem(percents)) rows = buildRows(completePercents(percents));
    const scrolledTo = list.querySelector(".ocp-scroll")?.scrollTop ?? 0;
    list.replaceChildren();
    if (!rows.length) return;
    const scroll = make("div", "ocp-scroll");
    const table = make("table", "ocp-table");
    const head = make("tr");
    const headings = ["", "OC Name", "Level", "Date Completed", "Total Pay", "Faction Cut", "Remaining", "Paid"];
    for (const text of headings) head.appendChild(make("th", "", text));
    table.appendChild(head);
    for (const row of rows) table.append(...buildCrime(row));
    scroll.appendChild(table);
    list.appendChild(scroll);
    scroll.scrollTop = scrolledTo;
    const more = document.getElementById("ocp-more");
    if (more) more.disabled = busy || !moreToLoad();
  }
  function choosePlayer(row, player, payable) {
    const status = document.getElementById("ocp-list-status");
    highlighted = { crimeId: row.crime.id, memberId: player.id };
    selection = null;
    if (status) setStatus(status, "none", "");
    if (!payable || !row.percents || player.payout === null) {
      render();
      return;
    }
    const chosen = {
      crimeId: row.crime.id,
      percents: row.percents,
      memberId: player.id,
      label: `${memberName(player.id)} [${player.id}]`,
      amount: player.payout
    };
    log("chosen", row.crime.id, player.id, player.payout);
    selection = chosen;
    if (status) {
      if (fillBankForm(chosen)) setStatus(status, "none", "");
      else setStatus(status, "error", "Give money form not found");
    }
    render();
  }
  function onSent(prefill) {
    const chosen = selection;
    if (!chosen || chosen.memberId !== prefill.memberId) return;
    recordPayment(chosen.crimeId, chosen.percents, chosen.memberId, chosen.amount);
    log("paid", chosen);
    selection = null;
    render();
  }
  async function fetchPage(fresh) {
    const key2 = readApiKey();
    const status = document.getElementById("ocp-list-status");
    if (!key2 || busy || !status) return;
    busy = true;
    setStatus(status, "none", "Loading...");
    try {
      if (fresh) {
        resetCrimes();
        selection = null;
        highlighted = null;
      }
      if (!readKeyOwner()) writeKeyOwner(await fetchKeyOwner(key2));
      await loadMore(key2);
      setStatus(status, "none", "");
    } catch (error) {
      setStatus(status, "error", describe(error));
    } finally {
      busy = false;
      render();
    }
  }
  function buildKeyRow(fetchButton) {
    const row = make("div", "ocp-row");
    const { field, input } = buildKeyField();
    const check = button("Check");
    const status = make("span", "ocp-status");
    check.addEventListener("click", async () => {
      const key2 = input.value.trim();
      if (!isKeyShaped(key2)) {
        setStatus(status, "error", BAD_KEY_SHAPE);
        return;
      }
      check.disabled = true;
      setStatus(status, "none", "Checking...");
      try {
        await checkKey(key2);
        writeApiKey(key2);
        writeKeyOwner(await fetchKeyOwner(key2));
        fetchButton.disabled = false;
        setStatus(status, "ok", "Saved");
      } catch (error) {
        setStatus(status, "error", describe(error));
      } finally {
        check.disabled = false;
      }
    });
    const listStatus = make("span", "ocp-status");
    listStatus.id = "ocp-list-status";
    row.append(make("span", "", "API key"), field, check, status, fetchButton, listStatus);
    return row;
  }
  function buildPercentRow() {
    const row = make("div", "ocp-row");
    const status = make("span", "ocp-status");
    const fields = [
      ["faction", "Faction Cut"],
      ["time", "Time Bonus"],
      ["role", "Role Bonus"],
      ["stall", "Stalling Bonus"]
    ];
    for (const [name, text] of fields) {
      const label = make("label", "ocp-percent-label");
      const input = make("input", "ocp-percent");
      input.type = "number";
      input.min = "0";
      input.max = "100";
      input.step = "0.01";
      const stored = percents[name];
      input.value = stored === null ? "" : String(stored);
      input.addEventListener("input", () => {
        const next = { ...percents, [name]: input.value.trim() === "" ? null : Number(input.value) };
        const problem = percentsProblem(next);
        setStatus(status, problem ? "error" : "none", problem ?? "");
        if (problem) return;
        percents = next;
        writePercents(percents);
        render();
      });
      label.append(make("span", "", text), input, make("span", "", "%"));
      row.appendChild(label);
    }
    row.appendChild(status);
    return row;
  }
  function buildPanel() {
    const panel = make("div");
    panel.id = PANEL_ID;
    const title = make("div", "ocp-title");
    title.setAttribute("role", "button");
    title.tabIndex = 0;
    title.append(make("span", "ocp-caret", "▾"), make("span", "", "ZNS OC Payout tool"));
    const applyOpen = (open) => {
      panel.classList.toggle(COLLAPSED_CLASS, !open);
      title.setAttribute("aria-expanded", String(open));
    };
    applyOpen(readPanelOpen());
    const toggle = () => {
      const open = panel.classList.contains(COLLAPSED_CLASS);
      writePanelOpen(open);
      applyOpen(open);
    };
    title.addEventListener("click", toggle);
    title.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggle();
    });
    const body = make("div", "ocp-body");
    const fetchButton = button("Fetch OCs");
    fetchButton.disabled = !readApiKey();
    fetchButton.addEventListener("click", () => void fetchPage(true));
    body.appendChild(buildKeyRow(fetchButton));
    body.appendChild(buildPercentRow());
    const list = make("div");
    list.id = "ocp-list";
    body.appendChild(list);
    const footer = make("div", "ocp-footer");
    const more = button("See More");
    more.id = "ocp-more";
    more.disabled = true;
    more.addEventListener("click", () => void fetchPage(false));
    const fullLog = button("Full Log");
    fullLog.disabled = !FULL_LOG_URL;
    fullLog.addEventListener("click", () => window.open(FULL_LOG_URL, "_blank", "noopener"));
    footer.append(more, fullLog);
    body.appendChild(footer);
    panel.append(title, body);
    return panel;
  }
  function openTab() {
    return new URLSearchParams(location.hash.replace(/^#\/?/, "")).get("tab");
  }
  function findPlace() {
    const selector = TAB_ROOTS[openTab() ?? ""];
    const root = selector ? document.querySelector(selector) : null;
    if (!root) return null;
    const rule = root.querySelector(":scope > hr");
    return { parent: root, before: rule ?? root.firstChild };
  }
  var lastReport = "";
  function report(reason, ...detail) {
    if (reason === lastReport) return;
    lastReport = reason;
    log(reason, ...detail);
  }
  var watching = false;
  function installPanel() {
    const place = findPlace();
    if (!place) {
      report(`no panel place for tab ${openTab() ?? "(none)"}`);
      return;
    }
    const existing = document.getElementById(PANEL_ID);
    if (existing) {
      const placed = existing === place.before || existing.parentElement === place.parent && existing.nextSibling === place.before;
      if (!placed) {
        place.parent.insertBefore(existing, place.before);
        report(`panel moved to ${openTab()}`);
      }
    } else {
      injectStyles();
      place.parent.insertBefore(buildPanel(), place.before);
      report(`panel placed on ${openTab()}`);
      render();
    }
    if (!watching) {
      watching = true;
      watchSendButton(() => selection, onSent);
    }
  }

  // src/zns-oc-payout-tool/index.ts
  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      installPanel();
    });
  }
  function onReady() {
    log("running", "0.1.29", location.href);
    installPanel();
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    window.addEventListener("hashchange", schedule);
  }
  if (document.body) onReady();
  else document.addEventListener("DOMContentLoaded", onReady, { once: true });
})();
