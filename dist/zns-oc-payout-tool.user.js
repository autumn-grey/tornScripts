// ==UserScript==
// @name         ZNS OC Payout tool
// @namespace    https://github.com/autumn-grey
// @version      0.1.8
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
  function isKeyShaped(key) {
    return KEY_SHAPE.test(key);
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
  async function request(path, key, params = {}) {
    const query = new URLSearchParams({ ...params, comment: COMMENT, key });
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
  async function checkKey(key) {
    await request("/faction/crimes", key, { cat: "completed", limit: "1" });
  }
  async function fetchCrimes(key, offset) {
    const body = await request("/faction/crimes", key, {
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
  async function fetchCrime(key, id) {
    const body = await request(`/faction/${id}/crime`, key);
    return body.crime ?? null;
  }
  async function fetchMemberNames(key) {
    const body = await request("/faction/members", key);
    const names2 = /* @__PURE__ */ new Map();
    const members2 = Array.isArray(body.members) ? body.members : [];
    for (const entry of members2) {
      if (typeof entry.id === "number" && typeof entry.name === "string") names2.set(entry.id, entry.name);
    }
    return names2;
  }
  async function fetchUserName(key, id) {
    const body = await request(`/user/${id}/basic`, key);
    const profile = body.profile;
    return profile?.name ?? String(id);
  }
  async function fetchPrerequisites(key) {
    const body = await request("/torn/organizedcrimes", key);
    const crimes = Array.isArray(body.organizedcrimes) ? body.organizedcrimes : [];
    const names2 = /* @__PURE__ */ new Set();
    for (const crime of crimes) {
      if (typeof crime.prerequisite === "string") names2.add(crime.prerequisite);
    }
    return names2;
  }
  async function fetchItemValues(key, ids) {
    const values = /* @__PURE__ */ new Map();
    if (!ids.length) return values;
    const body = await request(`/torn/${ids.join(",")}/items`, key);
    const items = Array.isArray(body.items) ? body.items : [];
    for (const item of items) {
      if (typeof item.id === "number") values.set(item.id, item.value?.market_price ?? 0);
    }
    return values;
  }

  // src/zns-oc-payout-tool/bank.ts
  var FORM_HEADING = /^\s*give money or change balance\s*$/i;
  var PLAYER_FIELD = "input[placeholder*='search player' i]";
  var BALANCE_OPTION = /add to balance/i;
  var SEND_BUTTON = /give money|add to balance|change balance/i;
  var REFILL_DELAYS_MS = [150, 400, 900];
  function findBankForm() {
    const heading = Array.from(document.querySelectorAll("div, span, h3, h4, h5, p, label")).find((element) => element.children.length === 0 && FORM_HEADING.test(element.textContent ?? ""));
    if (!heading) return null;
    for (let box = heading.parentElement; box; box = box.parentElement) {
      if (box.querySelector(PLAYER_FIELD)) return box;
    }
    return null;
  }
  function fillField(input, value) {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
    if (setter) setter.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function amountField(form) {
    const player = form.querySelector(PLAYER_FIELD);
    return Array.from(form.querySelectorAll("input")).find((input) => input !== player && !["radio", "checkbox", "hidden"].includes(input.type)) ?? null;
  }
  function sendButton(form) {
    return Array.from(form.querySelectorAll("button, input[type='submit'], input[type='button']")).find((button2) => SEND_BUTTON.test(button2.textContent || button2.value || "")) ?? null;
  }
  function chooseBalance(form) {
    for (const label of Array.from(form.querySelectorAll("label"))) {
      if (!BALANCE_OPTION.test(label.textContent ?? "")) continue;
      const radio = label.querySelector("input[type='radio']") ?? (label.htmlFor ? document.getElementById(label.htmlFor) : null);
      if (radio && !radio.checked) radio.click();
      else if (!radio) label.click();
      return;
    }
    log("bank: no Add to balance option found");
  }
  function fillBankForm(prefill) {
    const form = findBankForm();
    const player = form?.querySelector(PLAYER_FIELD);
    const amount = form ? amountField(form) : null;
    if (!form || !player || !amount) {
      log("bank: form not found", { form, player, amount });
      return false;
    }
    chooseBalance(form);
    const fill = () => {
      fillField(player, prefill.label);
      fillField(amount, String(prefill.amount));
    };
    fill();
    for (const delay of REFILL_DELAYS_MS) {
      setTimeout(() => {
        if (player.isConnected && player.value === "") fill();
      }, delay);
    }
    return true;
  }
  function stillMatches(form, prefill) {
    const player = form.querySelector(PLAYER_FIELD)?.value ?? "";
    const amount = (amountField(form)?.value ?? "").replace(/\D+/g, "");
    return player.includes(`[${prefill.memberId}]`) && amount === String(prefill.amount);
  }
  function watchSendButton(current, onSent2) {
    document.addEventListener(
      "click",
      (event) => {
        const form = findBankForm();
        const button2 = form ? sendButton(form) : null;
        if (!form || !button2 || !(event.target instanceof Node) || !button2.contains(event.target)) return;
        const prefill = current();
        if (!prefill) return;
        if (!stillMatches(form, prefill)) {
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
  function roleScore(successChance2, passRate2, weight) {
    if (successChance2 === null || passRate2 === null || weight === null) return null;
    return Math.max(0, successChance2 - passRate2) + weight;
  }
  function stallJoins(planningAt, joinedAt) {
    const order = joinedAt.map((at, index) => ({ at, index })).sort((a, b) => a.at - b.at);
    const result = new Array(joinedAt.length).fill(0);
    let previousEnd = planningAt;
    order.forEach(({ at, index }, position) => {
      const gap = position === 0 ? 0 : Math.max(0, at - previousEnd);
      result[index] = gap;
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
    const stall = stallJoins(
      crime.planningAt,
      crime.members.map((member) => member.joinedAt)
    );
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
        prc: role,
        pts: pts[index] ?? 0,
        ptc: time,
        stallJoin: stall[index] ?? 0,
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
  function splitChain(total, memberCounts) {
    const everyone = memberCounts.reduce((sum, count) => sum + count, 0);
    if (everyone <= 0) return memberCounts.map(() => 0);
    return roundShares(total, memberCounts.map((count) => total * count / everyone));
  }

  // src/zns-oc-payout-tool/settings.ts
  var PREFIX = "OCP_";
  var API_KEY = "API_KEY";
  var PERCENTS_KEY = "PERCENTS";
  var PAID_KEY = "PAID";
  var PANEL_OPEN_KEY = "PANEL_OPEN";
  var PREREQ_KEY = "PREREQUISITES";
  var PREREQ_MAX_AGE_MS = 24 * 60 * 60 * 1e3;
  function read(key, fallback) {
    try {
      return localStorage.getItem(PREFIX + key) ?? fallback;
    } catch {
      return fallback;
    }
  }
  function write(key, value) {
    try {
      localStorage.setItem(PREFIX + key, value);
    } catch {
    }
  }
  function readJson(key) {
    try {
      return JSON.parse(read(key, "null"));
    } catch {
      return null;
    }
  }
  function readApiKey() {
    return read(API_KEY, "").trim();
  }
  function writeApiKey(key) {
    write(API_KEY, key.trim());
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
  function readPaid() {
    const stored = readJson(PAID_KEY);
    return stored && typeof stored === "object" ? stored : {};
  }
  function recordPayment(crimeId, percents2, memberId, amount) {
    const paid = readPaid();
    const crime = paid[String(crimeId)] ?? { percents: percents2, members: {} };
    crime.members[String(memberId)] = { amount, at: Math.floor(Date.now() / 1e3) };
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
  var ROLE_WEIGHTS = {};
  function roleWeight(crimeName, roleLabel) {
    return ROLE_WEIGHTS[crimeName]?.[roleLabel] ?? null;
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
  async function loadChainLinks(key) {
    const wanted = () => [...loaded.values()].map((crime) => crime.previous_crime_id).filter((id) => typeof id === "number" && !loaded.has(id));
    for (let ids = wanted(); ids.length; ids = wanted()) {
      for (const id of ids) {
        const crime = await fetchCrime(key, id);
        if (crime) loaded.set(crime.id, crime);
        else loaded.set(id, { id, previous_crime_id: null, name: "", status: "", planning_at: null, ready_at: null, executed_at: null, slots: [], rewards: null });
      }
    }
  }
  async function loadNames(key) {
    if (!names.size) {
      for (const [id, name] of await fetchMemberNames(key)) names.set(id, name);
    }
    for (const crime of loaded.values()) {
      for (const slot of crime.slots) {
        const id = slot.user?.id;
        if (id === void 0 || names.has(id)) continue;
        try {
          names.set(id, await fetchUserName(key, id));
        } catch {
          names.set(id, String(id));
        }
      }
    }
  }
  async function loadItemValues(key) {
    const ids = /* @__PURE__ */ new Set();
    for (const crime of loaded.values()) {
      for (const item of crime.rewards?.items ?? []) {
        if (!itemValues.has(item.id)) ids.add(item.id);
      }
    }
    if (!ids.size) return;
    for (const [id, value] of await fetchItemValues(key, [...ids])) itemValues.set(id, value);
  }
  async function loadMore(key) {
    if (!prerequisites.size) {
      prerequisites = readPrerequisites() ?? await fetchPrerequisites(key);
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
  function rewardValue(crime) {
    const items = (crime.rewards?.items ?? []).reduce(
      (sum, item) => sum + (itemValues.get(item.id) ?? 0) * item.quantity,
      0
    );
    return (crime.rewards?.money ?? 0) + items;
  }
  function successChance(_slot) {
    return null;
  }
  function passRate(_crime) {
    return null;
  }
  function members(crime) {
    return crime.slots.filter((slot) => slot.user).map((slot) => {
      const role = slot.position_info?.label ?? slot.position;
      return {
        id: slot.user.id,
        name: memberName(slot.user.id),
        role,
        prs: roleScore(successChance(slot), passRate(crime), roleWeight(crime.name, role)),
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
    return listed.map((id) => {
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
        const shares = splitChain(rewardValue(last), chain.map((link) => members(link).length));
        total = shares[chain.indexOf(crime)] ?? 0;
      }
      if (state === "payable" && total !== null && used) {
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
      return { crime, state, chain, percents: used, total, payout, paid, paidByTorn };
    });
  }

  // src/zns-oc-payout-tool/styles.ts
  var STYLE_ID = "ocp-styles";
  var PANEL_ID = "ocp-panel";
  var COLLAPSED_CLASS = "ocp-collapsed";
  var CSS = `
  #${PANEL_ID} {
    margin: 0 0 10px;
    border-radius: 5px;
    overflow: hidden;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    color: #fff !important;
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
    background: linear-gradient(180deg, #4e565e 0%, #303840 100%);
    font-weight: bold;
    text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
  }
  #${PANEL_ID} .ocp-caret {
    font-size: 10px;
    transition: transform 0.15s ease;
  }
  #${PANEL_ID}.${COLLAPSED_CLASS} .ocp-caret { transform: rotate(-90deg); }
  #${PANEL_ID}.${COLLAPSED_CLASS} .ocp-body { display: none; }
  #${PANEL_ID} .ocp-body {
    background: linear-gradient(180deg, #4a4a4a 0%, #333 100%);
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
  #${PANEL_ID} input.ocp-input {
    box-sizing: border-box;
    width: 100%;
    padding: 4px 28px 4px 7px;
    border: 1px solid rgba(0, 0, 0, 0.5);
    border-radius: 4px;
    background: #f2f2f2;
    color: #000 !important;
    font-size: 12px;
    line-height: 18px;
  }
  /* Hides the key's characters while keeping it a text box, so password
     managers leave it alone. */
  #${PANEL_ID} input.ocp-input.ocp-masked {
    -webkit-text-security: disc;
  }
  #${PANEL_ID} input.ocp-percent {
    box-sizing: border-box;
    width: 52px;
    padding: 3px 5px;
    border: 1px solid rgba(0, 0, 0, 0.5);
    border-radius: 4px;
    background: #f2f2f2;
    color: #000 !important;
    font-size: 12px;
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
    color: #555 !important;
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
    border: 1px solid #1c2228;
    border-radius: 3px;
    background: linear-gradient(180deg, #5b646d 0%, #333b43 100%);
    font-family: "Fjalla One", "Arial Narrow", Arial, sans-serif;
    text-transform: uppercase;
  }
  #${PANEL_ID} .ocp-button[disabled] { opacity: 0.5; cursor: default; }
  #${PANEL_ID} .ocp-status { font-size: 11px; font-weight: bold; }
  #${PANEL_ID} .ocp-ok    { color: #5ed17c !important; }
  #${PANEL_ID} .ocp-error { color: #ff6b6b !important; }

  /* --------------------------------------------------------- crime list */

  #${PANEL_ID} .ocp-scroll {
    overflow-x: auto;
  }
  #${PANEL_ID} table.ocp-table {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid #1a1a1a;
  }
  #${PANEL_ID} .ocp-table th {
    padding: 5px 6px;
    background: linear-gradient(180deg, #4e565e 0%, #303840 100%);
    font-size: 11px;
    font-weight: bold;
    text-align: left;
    vertical-align: bottom;
  }
  #${PANEL_ID} .ocp-table td {
    padding: 5px 6px;
    border-top: 1px solid rgba(0, 0, 0, 0.35);
    white-space: nowrap;
  }
  #${PANEL_ID} .ocp-num { text-align: right !important; }
  #${PANEL_ID} tr.ocp-crime { cursor: pointer; background: #444; }
  #${PANEL_ID} tr.ocp-crime:hover { background: #4f4f4f; }
  #${PANEL_ID} tr.ocp-crime td { color: #ff7b7b !important; }
  #${PANEL_ID} tr.ocp-crime.ocp-done td { color: #6fdc8c !important; }
  #${PANEL_ID} tr.ocp-crime.ocp-waiting td { color: #c8c8c8 !important; }
  #${PANEL_ID} .ocp-caret-cell { width: 10px; font-size: 9px; }
  #${PANEL_ID} .ocp-chain {
    display: inline-block;
    margin-left: 6px;
    padding: 0 4px;
    border: 1px solid currentColor;
    border-radius: 3px;
    font-size: 10px;
  }
  #${PANEL_ID} tr.ocp-detail > td {
    padding: 6px 8px 10px 22px;
    background: #2e2e2e;
    white-space: normal;
  }
  #${PANEL_ID} .ocp-summary {
    margin: 0 0 6px;
    font-size: 11px;
    line-height: 16px;
  }
  #${PANEL_ID} .ocp-summary span + span::before {
    content: " | ";
    color: #888 !important;
  }
  #${PANEL_ID} table.ocp-players th { font-size: 10px; white-space: normal; }
  #${PANEL_ID} tr.ocp-player td { color: #ff7b7b !important; background: #3a3a3a; }
  #${PANEL_ID} tr.ocp-player.ocp-clickable { cursor: pointer; }
  #${PANEL_ID} tr.ocp-player.ocp-clickable:hover td { background: #454545; }
  #${PANEL_ID} tr.ocp-player.ocp-selected td { background: #5a4a1e; }
  #${PANEL_ID} tr.ocp-player.ocp-paid td { color: #6fdc8c !important; background: #2a2a2a; }
  #${PANEL_ID} .ocp-player-id { opacity: 0.7; }
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
  var ARMOURY_ROOT = "#faction-armoury";
  var ARMOURY_RULE = "#faction-armoury > hr";
  var percents = readPercents();
  var rows = [];
  var selection = null;
  var openCrimes = /* @__PURE__ */ new Set();
  var busy = false;
  function money(amount) {
    return amount === null ? "?" : `$${Math.round(amount).toLocaleString("en-US")}`;
  }
  function duration(seconds) {
    const minutes = Math.floor(seconds / 60);
    return `${Math.floor(minutes / 1440)}d ${Math.floor(minutes % 1440 / 60)}h ${minutes % 60}m`;
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
  function chainTag(row) {
    if (row.chain.length < 2) return null;
    const position = row.chain.indexOf(row.crime) + 1;
    const tag = make("span", "ocp-chain", `Chain ${position}/${row.chain.length}`);
    tag.title = row.chain.map((link) => link.name || `#${link.id}`).join(" → ");
    return tag;
  }
  function buildSummary(row) {
    const summary = make("div", "ocp-summary");
    if (row.state !== "payable") {
      summary.textContent = row.state === "waiting" ? "Waiting on the crime this one unlocked" : "The crime this one unlocked failed";
      return summary;
    }
    const payout = row.payout;
    const parts = [
      `Base: ${money(payout?.base ?? null)}`,
      `Total Role Score: ${payout?.totalRoleScore?.toFixed(1) ?? "?"}`,
      `Role Reserve: ${money(payout?.roleReserve ?? null)}`,
      `Time Reserve: ${money(payout?.timeReserve ?? null)}`,
      `Total Time: ${payout ? duration(payout.totalTimeScore) : "?"}`,
      `Stall Bonus: ${money(payout?.stallReserve ?? null)}`,
      `Stall Time: ${payout ? duration(payout.totalStall) : "?"}`
    ];
    for (const part of parts) summary.appendChild(make("span", "", part));
    return summary;
  }
  function buildPlayerRow(row, player) {
    const paid = row.paid.has(player.id) || row.paidByTorn;
    const line = make("tr", "ocp-player");
    if (paid) line.classList.add("ocp-paid");
    if (selection?.crimeId === row.crime.id && selection.memberId === player.id) line.classList.add("ocp-selected");
    const name = make("td");
    name.append(make("span", "", `${player.name} `), make("span", "ocp-player-id", `[${player.id}]`));
    line.appendChild(name);
    const cells = [
      player.prs?.toFixed(1) ?? "?",
      money(player.prc),
      duration(player.pts),
      money(player.ptc),
      money(player.payout),
      duration(player.stallJoin),
      money(player.psc)
    ];
    for (const text of cells) line.appendChild(make("td", "ocp-num", text));
    line.appendChild(make("td", "", paid ? "Paid" : "Unpaid"));
    if (!paid && player.payout !== null) {
      line.classList.add("ocp-clickable");
      line.addEventListener("click", () => choosePlayer(row, player));
    }
    return line;
  }
  function buildDetail(row) {
    const detail = make("tr", "ocp-detail");
    const cell = make("td");
    cell.colSpan = 7;
    cell.appendChild(buildSummary(row));
    if (row.payout) {
      const table = make("table", "ocp-table ocp-players");
      const head = make("tr");
      const headings = [
        "Player",
        "Personal Role Score",
        "Personal Role Cut",
        "Personal Time Score",
        "Personal Time Cut",
        "Payout",
        "Stall Join",
        "Stall Cut",
        "Paid"
      ];
      headings.forEach((text, index) => head.appendChild(make("th", index > 0 && index < 8 ? "ocp-num" : "", text)));
      table.appendChild(head);
      for (const player of row.payout.players) table.appendChild(buildPlayerRow(row, player));
      cell.appendChild(table);
    }
    detail.appendChild(cell);
    return detail;
  }
  function buildCrime(row) {
    const open = openCrimes.has(row.crime.id);
    const line = make("tr", "ocp-crime");
    if (crimeDone(row)) line.classList.add("ocp-done");
    else if (row.state === "waiting") line.classList.add("ocp-waiting");
    line.appendChild(make("td", "ocp-caret-cell", open ? "▾" : "▸"));
    const name = make("td", "", row.crime.name);
    const tag = chainTag(row);
    if (tag) name.appendChild(tag);
    line.appendChild(name);
    line.appendChild(make("td", "", tornDate(row.crime.executed_at)));
    const payout = row.payout;
    const split = (amount) => row.state === "payable" ? money(amount ?? null) : "-";
    line.appendChild(make("td", "ocp-num", row.state === "waiting" ? "Waiting" : money(row.total)));
    line.appendChild(make("td", "ocp-num", split(payout?.factionCut)));
    line.appendChild(make("td", "ocp-num", split(payout?.remaining)));
    line.appendChild(make("td", "ocp-num", paidCount(row)));
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
    list.replaceChildren();
    if (!rows.length) return;
    const scroll = make("div", "ocp-scroll");
    const table = make("table", "ocp-table");
    const head = make("tr");
    const headings = ["", "OC Name", "Date Completed", "Total Pay", "Faction Cut", "Remaining", "Paid"];
    headings.forEach((text, index) => head.appendChild(make("th", index > 2 ? "ocp-num" : "", text)));
    table.appendChild(head);
    for (const row of rows) table.append(...buildCrime(row));
    scroll.appendChild(table);
    list.appendChild(scroll);
    const more = document.getElementById("ocp-more");
    if (more) more.disabled = busy || !moreToLoad();
  }
  function choosePlayer(row, player) {
    const status = document.getElementById("ocp-list-status");
    if (!row.percents || player.payout === null) return;
    const chosen = {
      crimeId: row.crime.id,
      percents: row.percents,
      memberId: player.id,
      label: `${memberName(player.id)} [${player.id}]`,
      amount: player.payout
    };
    if (!fillBankForm(chosen)) {
      if (status) setStatus(status, "error", "Give money form not found");
      return;
    }
    if (status) setStatus(status, "none", "");
    selection = chosen;
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
    const key = readApiKey();
    const status = document.getElementById("ocp-list-status");
    if (!key || busy || !status) return;
    busy = true;
    setStatus(status, "none", "Loading...");
    try {
      if (fresh) {
        resetCrimes();
        selection = null;
      }
      await loadMore(key);
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
      const key = input.value.trim();
      if (!isKeyShaped(key)) {
        setStatus(status, "error", BAD_KEY_SHAPE);
        return;
      }
      check.disabled = true;
      setStatus(status, "none", "Checking...");
      try {
        await checkKey(key);
        writeApiKey(key);
        fetchButton.disabled = false;
        setStatus(status, "ok", "Saved");
      } catch (error) {
        setStatus(status, "error", describe(error));
      } finally {
        check.disabled = false;
      }
    });
    row.append(make("span", "", "API key"), field, check, status);
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
    const fetchRow = make("div", "ocp-row");
    const listStatus = make("span", "ocp-status");
    listStatus.id = "ocp-list-status";
    fetchRow.append(fetchButton, listStatus);
    body.appendChild(fetchRow);
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
  function findPlace() {
    const rule = document.querySelector(ARMOURY_RULE);
    if (rule?.parentElement) return { parent: rule.parentElement, before: rule };
    const armoury = document.querySelector(ARMOURY_ROOT);
    return armoury ? { parent: armoury, before: armoury.firstChild } : null;
  }
  var lastReport = "";
  function report(reason, ...detail) {
    if (reason === lastReport) return;
    lastReport = reason;
    log(reason, ...detail);
  }
  var watching = false;
  function installPanel() {
    if (document.getElementById(PANEL_ID)) return;
    const place = findPlace();
    if (!place) {
      report(`no ${ARMOURY_ROOT} on the page`);
      return;
    }
    injectStyles();
    place.parent.insertBefore(buildPanel(), place.before);
    report("panel placed");
    render();
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
    log("running", "0.1.8", location.href);
    installPanel();
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    window.addEventListener("hashchange", schedule);
  }
  if (document.body) onReady();
  else document.addEventListener("DOMContentLoaded", onReady, { once: true });
})();
