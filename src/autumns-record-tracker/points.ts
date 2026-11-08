// Point Merit Tracker: a collapsible table at the top of the Points Building
// of everything that has to be bought with points to earn every merit, what
// has been bought so far (from the Points Building log), and what the rest
// costs at the points market's median price.

import { PointValue, YearAverage, fetchMyLevel, fetchPointValue, fetchYearAverage } from "./api";
import { Purchase, PurchaseKind, readPurchase, syncPointsLog } from "./pointsLog";
import { TRACKER_OPEN_SETTING, readKey, readSetting, writeSetting } from "./settings";
import { injectStyles } from "./styles";

const SELECTORS = {
  // <div class="pointsBuildingPage___FgoKX">, holding the header and then the items.
  page: '#points-building-root [class*="pointsBuildingPage___"]',
  // The items to buy, which the tracker goes above.
  content: '[class*="pageContent___"]',
};


const TRACKER_ID = "art-merit-tracker";
const TRACKER_LABEL = "Point Merit Tracker";

/** The honor bars sold for points, and the level each unlocks at. */
const HONOR_BARS: { name: string; price: number; level: number }[] = [
  { name: "Globule", price: 500, level: 5 },
  { name: "Acute", price: 500, level: 10 },
  { name: "Retro", price: 500, level: 15 },
  { name: "The Socialist", price: 600, level: 20 },
  { name: "Jack Of All Trades", price: 600, level: 25 },
  { name: "Serenity", price: 600, level: 30 },
  { name: "Futurity", price: 700, level: 35 },
  { name: "Constellations", price: 700, level: 40 },
  { name: "Parallel", price: 700, level: 45 },
  { name: "Labyrinth", price: 700, level: 50 },
  { name: "Proven Capacity", price: 800, level: 55 },
  { name: "Master Of One", price: 800, level: 60 },
  { name: "Globally Effective", price: 800, level: 65 },
  { name: "Glimmer", price: 800, level: 70 },
  { name: "Supernova", price: 900, level: 75 },
  { name: "Pepperoni", price: 900, level: 80 },
  { name: "Resistance", price: 1000, level: 85 },
  { name: "Electric Dream", price: 1000, level: 90 },
  { name: "Brainz", price: 1300, level: 95 },
  { name: "Survivor", price: 1500, level: 100 },
];
const HONOR_TOTAL = HONOR_BARS.reduce((sum, bar) => sum + bar.price, 0);

/** Merits sold for points: one unlocks every two levels, up to this many. */
const MERIT_PRICE = 300;
const MERIT_TARGET = 50;
const LEVELS_PER_MERIT = 2;

/** One line of the target table; honors are the only one with no single price. */
interface Target {
  kind: PurchaseKind;
  label: string;
  price: number;
  amount: number;
}

const REFILLS: Target[] = [
  { kind: "energy", label: "Energy Refill", price: 30, amount: 250 },
  { kind: "nerve", label: "Nerve Refill", price: 30, amount: 250 },
  { kind: "token", label: "Token Refill", price: 30, amount: 250 },
];
const MERIT: Target = { kind: "merit", label: "One Merit", price: MERIT_PRICE, amount: MERIT_TARGET };
const MISC: Target[] = [
  { kind: "reset", label: "Reset Merits", price: 500, amount: 1 },
  { kind: "stockTicker", label: "Stock Ticker", price: 50, amount: 1 },
  { kind: "racingLicense", label: "Racing License", price: 50, amount: 1 },
  { kind: "displayCase", label: "Display Case", price: 100, amount: 1 },
  { kind: "bazaar", label: "Bazaar", price: 250, amount: 1 },
  { kind: "hairstyle", label: "Hairstyles", price: 50, amount: 1 },
  { kind: "backdrop", label: "Backdrops", price: 100, amount: 1 },
];

/** Everything the merits need bought, as the spreadsheet lists it. */
const TARGETS: Target[] = [...REFILLS, MERIT, ...MISC];

const SHORT_UNITS: [number, string][] = [
  [1e12, "t"],
  [1e9, "b"],
  [1e6, "m"],
  [1e3, "k"],
];

/** Shortens a number to at most three decimals of its unit: 7500 is 7.5k, 191769000 is 191.769m. */
function short(value: number): string {
  for (const [size, suffix] of SHORT_UNITS) {
    if (Math.abs(value) >= size) return `${Number((value / size).toFixed(3))}${suffix}`;
  }
  return String(Math.round(value));
}

/** Returns the honor bars a list of purchases names. */
function honorsBought(purchases: Purchase[]): Set<string> {
  const names = new Set<string>();
  for (const purchase of purchases) {
    if (purchase.kind !== "honor") continue;
    const bar = HONOR_BARS.find((candidate) => purchase.text.includes(candidate.name.toLowerCase()));
    if (bar) names.add(bar.name);
  }
  return names;
}

/** Returns the points one purchase cost: what the log says, else the price list's figure. */
function pointsOf(purchase: Purchase): number {
  if (purchase.points !== null) return purchase.points;
  const target = TARGETS.find((candidate) => candidate.kind === purchase.kind);
  if (target) return target.price * purchase.quantity;
  if (purchase.kind === "honor") {
    return HONOR_BARS.find((bar) => purchase.text.includes(bar.name.toLowerCase()))?.price ?? 0;
  }
  return 0;
}

/** Returns a table cell. */
function cell(tag: "td" | "th", text: string, className = ""): HTMLTableCellElement {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

/** One row of the table, in points. */
interface Line {
  label: string;
  cost: string;
  amount: number;
  total: number;
  bought: number;
  remaining: number;
}

/** A coloured block of rows, with its dollar sums beside them. */
interface Group {
  /** Picks the colour: art-group-<name>. */
  name: string;
  /** Written up the left side, or empty. */
  side: string;
  lines: Line[];
}

/** Returns a target's row, given how many have been bought. */
function lineOf(target: Target, bought: number): Line {
  return {
    label: target.label,
    cost: short(target.price),
    amount: target.amount,
    total: target.price * target.amount,
    bought,
    remaining: Math.max(0, target.amount - bought) * target.price,
  };
}

/** Returns a cell holding points above their dollar value. */
function pairCell(points: number, price: number, className: string): HTMLTableCellElement {
  const element = cell("td", "", className);
  const top = document.createElement("div");
  top.textContent = short(points);
  const bottom = document.createElement("div");
  bottom.textContent = `$${short(points * price)}`;
  element.append(top, bottom);
  return element;
}

/** Returns one group's rows, with its sums spanning them all. */
function groupBody(group: Group, price: number): HTMLTableSectionElement {
  const tbody = document.createElement("tbody");
  tbody.className = `art-group art-group-${group.name}`;
  const total = group.lines.reduce((sum, line) => sum + line.total, 0);
  const remaining = group.lines.reduce((sum, line) => sum + line.remaining, 0);

  group.lines.forEach((line, index) => {
    const tr = document.createElement("tr");
    if (index === 0) {
      const side = cell("td", "", "art-side");
      side.rowSpan = group.lines.length;
      if (group.side) {
        const words = document.createElement("span");
        words.textContent = group.side;
        side.appendChild(words);
      }
      tr.appendChild(side);
    }
    // Per cell, not per row: the group's sums sit in its first row and must not darken with it.
    const done = line.remaining === 0 ? "art-done" : "";
    tr.append(
      cell("td", line.label, `art-item art-split ${done}`),
      cell("td", line.cost, done),
      cell("td", short(line.amount), done),
      cell("td", short(line.total), `art-split ${done}`),
      cell("td", short(line.bought), done),
      cell("td", short(line.remaining), `art-split art-last ${done}`),
    );
    if (index === 0) {
      for (const sum of [total, remaining]) {
        const sumCell = pairCell(sum, price, "art-money");
        sumCell.rowSpan = group.lines.length;
        tr.appendChild(sumCell);
      }
    }
    tbody.appendChild(tr);
  });
  return tbody;
}

/** How many columns the table has, for lines that cross all of them. */
const COLUMNS = 9;

/** Returns a row holding one horizontal line across the table. */
function ruleRow(className = ""): HTMLTableRowElement {
  const tr = document.createElement("tr");
  tr.className = `art-rule ${className}`;
  const td = document.createElement("td");
  td.colSpan = COLUMNS;
  const line = document.createElement("div");
  line.className = "art-rule-line";
  td.appendChild(line);
  tr.appendChild(td);
  return tr;
}

/** Returns one titled figure for under the table. */
function fact(title: string, value: string, className = ""): HTMLElement {
  const element = document.createElement("div");
  element.className = "art-fact";
  const inner = document.createElement("div");
  inner.className = "art-fact-inner";
  const heading = document.createElement("div");
  heading.className = "art-fact-title";
  heading.textContent = title;
  const line = document.createElement("div");
  line.className = "art-fact-line";
  const figure = document.createElement("div");
  figure.className = `art-fact-value ${className}`;
  figure.textContent = value;
  inner.append(heading, line, figure);
  element.appendChild(inner);
  return element;
}

/** How far the point price may sit from the year's average and still count as usual. */
const USUAL_PRICE_RANGE = 250;

/** Returns the class colouring the point price against the year's average: dear, cheap or neither. */
function priceClass(price: number, average: YearAverage | null): string {
  if (!average || Math.abs(price - average.price) <= USUAL_PRICE_RANGE) return "";
  return price > average.price ? "art-dear" : "art-cheap";
}

/** Draws the table and the figures under it. */
function drawTracker(
  body: HTMLElement,
  purchases: Purchase[],
  value: PointValue,
  average: YearAverage | null,
  level: number,
): void {
  const price = value.price;
  const bought = new Map<PurchaseKind, number>();
  for (const purchase of purchases) {
    bought.set(purchase.kind, (bought.get(purchase.kind) ?? 0) + purchase.quantity);
  }

  // Bars the log names are priced exactly; any it does not name come off the total by points spent.
  const honorPurchases = purchases.filter((purchase) => purchase.kind === "honor");
  const named = honorsBought(purchases);
  const honorSpent = honorPurchases.reduce((sum, purchase) => sum + pointsOf(purchase), 0);
  const honorRemaining =
    named.size === honorPurchases.length
      ? HONOR_BARS.filter((bar) => !named.has(bar.name)).reduce((sum, bar) => sum + bar.price, 0)
      : Math.max(0, HONOR_TOTAL - honorSpent);
  const prices = HONOR_BARS.map((bar) => bar.price);
  const honorLine: Line = {
    label: "Honor Bars",
    cost: `${short(Math.min(...prices))}-${short(Math.max(...prices))}`,
    amount: HONOR_BARS.length,
    total: HONOR_TOTAL,
    bought: honorPurchases.length,
    remaining: honorRemaining,
  };

  const have = (target: Target): number => bought.get(target.kind) ?? 0;
  const groups: Group[] = [
    { name: "refill", side: "Refills", lines: REFILLS.map((target) => lineOf(target, have(target))) },
    { name: "merit", side: "", lines: [lineOf(MERIT, have(MERIT))] },
    { name: "misc", side: "Misc", lines: MISC.map((target) => lineOf(target, have(target))) },
    { name: "honor", side: "", lines: [honorLine] },
  ];

  const table = document.createElement("table");
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.append(
    cell("th", ""),
    cell("th", "Item", "art-split"),
    cell("th", "Cost"),
    cell("th", "Amount"),
    cell("th", "Total", "art-split"),
    cell("th", "Bought"),
    cell("th", "Remaining", "art-split art-last"),
    cell("th", "Combined", "art-money"),
    cell("th", "Remaining", "art-money"),
  );
  head.append(headRow, ruleRow("art-rule-head"));
  table.appendChild(head);
  groups.forEach((group, index) => {
    const tbody = groupBody(group, price);
    if (index > 0) tbody.prepend(ruleRow());
    table.appendChild(tbody);
  });

  const lines = groups.flatMap((group) => group.lines);
  const total = lines.reduce((sum, line) => sum + line.total, 0);
  const remaining = lines.reduce((sum, line) => sum + line.remaining, 0);
  const foot = document.createElement("tfoot");
  const footRow = document.createElement("tr");
  footRow.className = "art-sum-row";
  const footLabel = cell("td", "Sum Total", "art-split");
  footLabel.colSpan = 2;
  footRow.append(
    footLabel,
    cell("td", ""),
    cell("td", ""),
    cell("td", short(total), "art-split"),
    cell("td", ""),
    cell("td", short(remaining), "art-split art-last"),
    pairCell(total, price, "art-money"),
    pairCell(remaining, price, "art-money"),
  );
  // Only shown on narrow screens, which drop the dollar columns: the sums' dollars, under their points.
  const moneyRow = document.createElement("tr");
  moneyRow.className = "art-money-row";
  const moneyGap = cell("td", "", "art-split");
  moneyGap.colSpan = 2;
  moneyRow.append(
    moneyGap,
    cell("td", ""),
    cell("td", ""),
    cell("td", `$${short(total * price)}`, "art-split"),
    cell("td", ""),
    cell("td", `$${short(remaining * price)}`, "art-split art-last"),
  );
  foot.append(ruleRow("art-rule-total"), footRow, moneyRow);
  table.appendChild(foot);

  const unlocked = HONOR_BARS.filter((bar) => bar.level <= level);
  const unlockedPoints = unlocked.reduce((sum, bar) => sum + bar.price, 0);
  const meritsUnlocked = Math.min(MERIT_TARGET, Math.floor(level / LEVELS_PER_MERIT));
  const meritPoints = meritsUnlocked * MERIT_PRICE;
  const spent = purchases.reduce((sum, purchase) => sum + pointsOf(purchase), 0);
  const both = (points: number): string => `${short(points)} | $${short(points * price)}`;

  const facts = document.createElement("div");
  facts.className = "art-tracker-facts";
  facts.append(
    fact("Point Value", `$${short(price)}`, priceClass(price, average)),
    fact("Honors Unlocked", `${unlocked.length} of ${HONOR_BARS.length}`),
    fact("Unlocked Honors Cost", both(unlockedPoints)),
    fact("Merits Unlocked", `${meritsUnlocked} of ${MERIT_TARGET}`),
    fact("Unlocked Merits Cost", both(meritPoints)),
    fact("Points Spent So Far", both(spent)),
  );

  body.replaceChildren(table, facts);
}

/** Makes a title open and close the body, starting as it was last left. */
function wireTitle(title: HTMLElement, body: HTMLElement): void {
  // Not a <button>: Chrome will not let a button's words be selected.
  title.setAttribute("role", "button");
  title.tabIndex = 0;
  const set = (open: boolean): void => {
    title.setAttribute("aria-expanded", String(open));
    body.hidden = !open;
  };
  title.addEventListener("click", () => {
    if (getSelection()?.toString()) return;
    const open = title.getAttribute("aria-expanded") !== "true";
    writeSetting(TRACKER_OPEN_SETTING, open);
    set(open);
  });
  title.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    title.click();
  });
  set(readSetting<boolean>(TRACKER_OPEN_SETTING, true));
}

/** Returns the tracker, with a title like the Hairstyles header. */
function buildTracker(): HTMLElement {
  const title = document.createElement("div");
  title.className = "art-tracker-title";
  const label = document.createElement("span");
  label.textContent = TRACKER_LABEL;
  const arrow = document.createElement("span");
  arrow.className = "art-tracker-arrow";
  title.append(label, arrow);

  const body = document.createElement("div");
  body.className = "art-tracker-body";
  wireTitle(title, body);
  load(body);

  const tracker = document.createElement("div");
  tracker.id = TRACKER_ID;
  tracker.className = "art-tracker";
  tracker.append(title, body);
  return tracker;
}

let tracker: HTMLElement | null = null;

/** Starts loading the tracker's figures into its body. */
function load(body: HTMLElement): void {
  const status = document.createElement("div");
  status.className = "art-tracker-status";
  body.appendChild(status);

  const key = readKey();
  if (!key) {
    status.textContent = "Point Merit Tracker needs a Record API Key";
    return;
  }
  status.textContent = "Loading…";
  // One at a time: the log can take many pages and Torn limits calls per minute.
  void (async () => {
    try {
      const value = await fetchPointValue(key);
      // The colour on the point price is a nicety, so a failure here only leaves it white.
      const average = await fetchYearAverage(key).catch(() => null);
      const me = await fetchMyLevel(key);
      const entries = await syncPointsLog(key);
      drawTracker(body, entries.map(readPurchase), value, average, me.level);
    } catch (error) {
      status.textContent = `Point Merit Tracker: ${error instanceof Error ? error.message : "API error"}`;
    }
  })();
}

/** Keeps the tracker between the page header and the items, building it the first time. */
function place(): void {
  const page = document.querySelector(SELECTORS.page);
  const content = page?.querySelector(`:scope > ${SELECTORS.content}`);
  if (!page || !content) return;
  tracker ??= buildTracker();
  if (tracker.nextElementSibling !== content) content.insertAdjacentElement("beforebegin", tracker);
}

/** Starts the Point Merit Tracker on the Points Building. */
export function installMeritTracker(): void {
  injectStyles();
  place();
  new MutationObserver(place).observe(document.body, { childList: true, subtree: true });
}
