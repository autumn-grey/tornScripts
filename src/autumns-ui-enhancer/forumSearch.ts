// Forum Search: a better search box for Torn's forums, and its results grouped by thread and ranked.
//
// Built on Torn's own search, which already matches an exact "phrase" in
// double quotes and drops -words. What it lacks is any sense of which result
// is useful: every post that mentions the words comes back, newest first, 20
// at a time. So the search box here sends Torn's own search, and on the
// results page the posts Torn sent are grouped by thread, filtered (forums
// picked or excluded, a date range) and ranked by what each result carries. Show more
// on the results comes from List Display, one request per click.
//
// Nothing here fetches. The only request is Torn's results page, opened at the
// same address Torn's own result page links use.

import { log } from "./debug";
import { FORUM_SEARCH, isEnabled, readSetting, writeSetting } from "./settings";

const FORUMS_PATH = "/forums.php";

// Torn's markup, kept together: these are what breaks when Torn changes the page.
const SELECTORS = {
  /** The search box of Torn's own form, on the forums home. */
  tornSearchInput: 'input[placeholder*="search term" i]',
  /** Torn's forum menu, read for the forum names and numbers. */
  tornForumSelect: "select#forum-category",
  /** The results list, tagged with the words searched and whether the match was exact. */
  results: ".forums-thread[data-words]",
  /** The block the results page's pager, breadcrumbs and results sit in. */
  resultsWrap: ".search-wrap",
  /** One result. */
  result: "ul.thread-list > li",
  title: ".title-black",
  /** Holds data-thread, data-post and data-author. */
  postWrap: ".post-wrap",
  /** "View this post in the X forum", linking to the post with f= for the forum. */
  postLink: "a.search-link",
  created: ".time-wrap .created",
  body: ".post",
  authorName: ".poster-name",
  karma: "li.karma",
} as const;

const PANEL_ID = "aue-forum-search";
const RANKED_ID = "aue-forum-ranked";
/** On a result Torn sent that the filters leave out. */
const FILTERED_CLASS = "aue-search-filtered";
/** On the body once loaded results are older than the Since date, which hides Show more. */
const ENDED_CLASS = "aue-search-ended";
/** On the body while results are shown ranked, which hides Torn's own list. */
const RANKED_CLASS = "aue-search-ranked";

const EXCLUDED_SETTING = "FORUM_SEARCH_EXCLUDED";
/** The forums picked to search in, when more than one. */
const PICKED_SETTING = "FORUM_SEARCH_PICKED";
const SINCE_SETTING = "FORUM_SEARCH_SINCE";
const BEFORE_SETTING = "FORUM_SEARCH_BEFORE";
const ORDER_SETTING = "FORUM_SEARCH_ORDER";
/** Torn's forum list, kept from the forums home for the results page, which has no forum menu. */
const FORUMS_SETTING = "FORUM_SEARCH_FORUMS";

/** Torn's search types, the y= of a search, as its type menu offers them. */
const TYPES: [string, string][] = [
  ["0", "All Posts"],
  ["3", "Thread Titles"],
  ["1", "Original Posts"],
  ["2", "Thread Replies"],
  ["4", "Thread with Polls"],
];

/**
 * Torn's forums, the f= of a search, as its forum menu listed them in November
 * 2026. Only used until the forums home has been visited: the menu there is
 * read and kept, so a forum Torn adds or renames is picked up.
 */
const BUILT_IN_FORUMS: [string, string][] = [
  ["1", "Announcements"], ["8", "Donator Forum"], ["9991", "My Faction"], ["9992", "My Company"],
  ["2", "General Discussion"], ["3", "Questions & Answers"], ["61", "Tutorials & Guides"],
  ["10", "Trading Post"], ["13", "Fun & Games"], ["62", "Community Events"], ["16", "Achievements"],
  ["9", "Faction Discussion"], ["24", "Faction Recruitment"], ["20", "Company Discussion"],
  ["46", "Company Recruitment"], ["59", "Attacking"], ["11", "Stock Market"], ["22", "Properties"],
  ["15", "Gambling"], ["69", "Poker"], ["21", "Racing"], ["47", "Missions"], ["23", "Graphics"],
  ["67", "Tools & Userscripts"], ["14", "Discord"], ["63", "API Development"], ["19", "Bugs & Issues"],
  ["4", "Suggestions"], ["17", "Graveyard"], ["38", "Politics & Law"], ["6", "General Non-related"],
  ["40", "Gaming"], ["41", "Music"], ["7", "Roleplay"], ["35", "TV & Movies"], ["37", "Sports"],
  ["49", "Art & Literature"], ["36", "Technology"], ["54", "Food & Cooking"],
  ["52", "Hobbies & Interests"], ["39", "Health & Fitness"], ["53", "Paranormal"],
  ["56", "Travel & Culture"], ["55", "Animals & Nature"], ["50", "Science"], ["51", "Motoring"],
];

type Order = "best" | "newest";

/** One post Torn's search returned, as far as ranking needs it. */
interface Result {
  item: HTMLElement;
  thread: string;
  post: string;
  title: string;
  forumId: string;
  forumName: string;
  link: string;
  posted: number | null;
  author: string;
  karma: number;
  text: string;
}

/** Returns a stored list of ids, or an empty one. */
function readIds(setting: string): string[] {
  try {
    const parsed: unknown = JSON.parse(readSetting(setting, "[]"));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/** Returns Torn's forums as number and name: read off the forums home when it is open, else as last kept. */
function forumList(): [string, string][] {
  const select = document.querySelector<HTMLSelectElement>(SELECTORS.tornForumSelect);
  if (select) {
    const read = [...select.options]
      .filter((option) => option.value !== "0")
      .map((option): [string, string] => [option.value, (option.textContent ?? "").trim()]);
    if (read.length > 0) {
      writeSetting(FORUMS_SETTING, JSON.stringify(read));
      return read;
    }
  }
  try {
    const kept: unknown = JSON.parse(readSetting(FORUMS_SETTING, ""));
    if (Array.isArray(kept) && kept.length > 0) return kept as [string, string][];
  } catch {}
  return BUILT_IN_FORUMS;
}

/** Returns the search on the page: its terms, forum and type, from the address. */
function currentSearch(): { q: string; f: string; y: string } {
  const params = new URLSearchParams(location.search || location.hash.replace(/^#[!/]*/, "?"));
  const fromHash = new URLSearchParams(location.hash.replace(/^#[!/]*/, ""));
  const read = (name: string) => fromHash.get(name) ?? params.get(name) ?? "";
  return { q: read("q"), f: read("f") || "0", y: read("y") || "0" };
}

/** Whether the page is showing Torn's search results. */
function onResultsPage(): boolean {
  return document.querySelector(SELECTORS.results) !== null;
}

/** Returns a date picker's value as the start of that day in Torn City Time (UTC), or null. */
function dayStart(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) ? time : null;
}

/** Reads "Posted on 06:51:51 - 21/11/26 (4 hours ago)" as a time in Torn City Time (UTC). */
function readPosted(text: string): number | null {
  const match = /(\d{2}):(\d{2}):(\d{2})\s*-\s*(\d{2})\/(\d{2})\/(\d{2})/.exec(text);
  if (!match) return null;
  const [, h, m, s, d, mo, y] = match.map(Number);
  return Date.UTC(2000 + (y ?? 0), (mo ?? 1) - 1, d, h, m, s);
}

/** Reads one of Torn's results. */
function readResult(item: HTMLElement): Result | null {
  const wrap = item.querySelector<HTMLElement>(SELECTORS.postWrap);
  const link = item.querySelector<HTMLAnchorElement>(SELECTORS.postLink);
  if (!wrap || !link) return null;
  const href = link.getAttribute("href") ?? "";
  const forumName = /in the (.+?) forum/i.exec(link.textContent ?? "")?.[1]?.trim() ?? "";
  const karmaText = item.querySelector(SELECTORS.karma)?.textContent ?? "";
  return {
    item,
    thread: wrap.dataset.thread ?? "",
    post: wrap.dataset.post ?? "",
    title: (item.querySelector(SELECTORS.title)?.textContent ?? "").trim(),
    forumId: /[?&]f=(\d+)/.exec(href)?.[1] ?? "",
    forumName,
    link: href,
    posted: readPosted(item.querySelector(SELECTORS.created)?.textContent ?? ""),
    author: (item.querySelector(SELECTORS.authorName)?.textContent ?? "").trim(),
    karma: Number(karmaText.replace(/[^\d]/g, "")) || 0,
    text: (item.querySelector(SELECTORS.body)?.textContent ?? "").replace(/\s+/g, " ").trim(),
  };
}

/**
 * Returns what to highlight: the exact phrase when Torn matched one, else
 * each word. Torn lists the words it searched for on the results list.
 */
function searchTerms(list: Element): string[] {
  const words = (list.getAttribute("data-words") ?? "").split(",").map((word) => word.trim()).filter(Boolean);
  if (list.getAttribute("data-exact-match") === "1" && words.length > 1) return [words.join(" ")];
  return words;
}

/** Returns a pattern matching any of the terms as whole words. */
function termPattern(terms: string[]): RegExp | null {
  if (terms.length === 0) return null;
  const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"));
  return new RegExp(`\\b(?:${escaped.join("|")})\\b`, "gi");
}

/**
 * Returns the forums to keep results from, or an empty set for all. Torn's
 * search takes one forum, so several are searched as all forums with the rest
 * dropped here. A search Torn already narrowed to one forum needs nothing more.
 */
function onlyForums(): Set<string> {
  return currentSearch().f === "0" ? new Set(readIds(PICKED_SETTING)) : new Set();
}

/** Whether a result passes the filters: from a forum picked and not excluded, and inside the dates. */
function passes(
  result: Result,
  only: Set<string>,
  excluded: Set<string>,
  since: number | null,
  before: number | null,
): boolean {
  if (only.size > 0 && !only.has(result.forumId)) return false;
  if (excluded.has(result.forumId)) return false;
  if (result.posted !== null) {
    if (since !== null && result.posted < since) return false;
    // Before a day means up to its end, so the day picked is included.
    if (before !== null && result.posted >= before + 86_400_000) return false;
  }
  return true;
}

/** A thread and the matching posts of it that were loaded, ranked as one. */
interface ThreadGroup {
  thread: string;
  title: string;
  forumName: string;
  posts: Result[];
  score: number;
}

/**
 * Scores a thread from what its loaded posts carry; higher ranks first.
 *
 * No forum counts for or against: useful posts turn up in every forum, and
 * leaving forums out is the reader's call. What counts is the search terms
 * in the thread's title, how many of its posts match (a thread the search
 * keeps finding is usually where the subject is discussed), the length of
 * its longest matching post (a guide over a passing mention), its authors'
 * karma, and how recent it is, as older posts are likelier to be out of date.
 */
function scoreThread(group: ThreadGroup, pattern: RegExp | null, now: number): number {
  const titleHit = pattern !== null && new RegExp(pattern.source, "i").test(group.title) ? 3 : 0;
  const matches = Math.log2(1 + group.posts.length) * 2;
  const longest = Math.max(...group.posts.map((post) => post.text.length));
  const length = Math.min(2, longest / 1500);
  const karma = Math.log10(1 + Math.max(...group.posts.map((post) => post.karma))) / 2;
  const newest = Math.max(...group.posts.map((post) => post.posted ?? 0));
  const ageDays = newest > 0 ? (now - newest) / 86_400_000 : 3650;
  const recency = 1.5 * Math.exp(-ageDays / 365);
  return titleHit + matches + length + karma + recency;
}

/** Returns a run of text with the search terms marked, as nodes, never as markup. */
function highlighted(text: string, pattern: RegExp | null): DocumentFragment {
  const fragment = document.createDocumentFragment();
  if (!pattern) {
    fragment.append(text);
    return fragment;
  }
  let at = 0;
  for (const match of text.matchAll(new RegExp(pattern.source, "gi"))) {
    const index = match.index ?? 0;
    fragment.append(text.slice(at, index));
    const mark = document.createElement("mark");
    mark.textContent = match[0];
    fragment.append(mark);
    at = index + match[0].length;
  }
  fragment.append(text.slice(at));
  return fragment;
}

/** Returns about 300 characters of a post around its first match. */
function snippet(text: string, pattern: RegExp | null): string {
  const index = pattern ? text.search(new RegExp(pattern.source, "i")) : -1;
  const from = Math.max(0, index - 120);
  const cut = text.slice(from, from + 300);
  return `${from > 0 ? "..." : ""}${cut}${from + 300 < text.length ? "..." : ""}`;
}

/** Returns a date as "21 Nov 2026". */
function shortDate(time: number | null): string {
  if (time === null) return "";
  return new Date(time).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Returns one ranked thread, with its matching posts under it. */
function threadCard(group: ThreadGroup, pattern: RegExp | null): HTMLElement {
  const card = document.createElement("div");
  card.className = "aue-search-thread";

  const head = document.createElement("div");
  head.className = "aue-search-head";
  const title = document.createElement("a");
  title.className = "aue-search-title";
  title.href = group.posts[0]?.link ?? "#";
  title.append(highlighted(group.title, pattern));
  const meta = document.createElement("span");
  meta.className = "aue-search-meta";
  const count = group.posts.length;
  meta.textContent = `${group.forumName} · ${count} matching post${count === 1 ? "" : "s"}`;
  head.append(title, meta);
  card.append(head);

  for (const post of group.posts) {
    const row = document.createElement("a");
    row.className = "aue-search-post";
    row.href = post.link;
    const by = document.createElement("span");
    by.className = "aue-search-by";
    by.textContent = `${post.author}, ${shortDate(post.posted)}`;
    const text = document.createElement("span");
    text.className = "aue-search-text";
    text.append(highlighted(snippet(post.text, pattern), pattern));
    row.append(by, text);
    card.append(row);
  }
  return card;
}

/** Brings the results page into line with the filters and order: hides what is left out, ranks the rest. */
function applyToResults(): void {
  const list = document.querySelector(SELECTORS.results);
  if (!list) return;
  const only = onlyForums();
  const excluded = new Set(readIds(EXCLUDED_SETTING));
  const since = dayStart(readSetting(SINCE_SETTING, ""));
  const before = dayStart(readSetting(BEFORE_SETTING, ""));
  const order = readSetting(ORDER_SETTING, "best") as Order;
  const extra = readExtra();
  const extraOk = extraFilter(extra);
  const pattern = termPattern([...searchTerms(list), ...(extra ? [...extra.phrases, ...extra.words] : [])]);

  const results = [...list.querySelectorAll<HTMLElement>(SELECTORS.result)]
    .map(readResult)
    .filter((result): result is Result => result !== null);
  const kept: Result[] = [];
  for (const result of results) {
    const ok = passes(result, only, excluded, since, before) && extraOk(result);
    result.item.classList.toggle(FILTERED_CLASS, !ok);
    if (ok) kept.push(result);
  }

  // Torn sends newest first, so once the oldest loaded is before Since, nothing later is wanted.
  const oldest = Math.min(...results.map((result) => result.posted ?? Infinity));
  document.body.classList.toggle(ENDED_CLASS, since !== null && oldest < since);

  document.body.classList.toggle(RANKED_CLASS, order === "best");
  let ranked = document.getElementById(RANKED_ID);
  if (order !== "best") {
    ranked?.remove();
  } else {
    const groups = new Map<string, ThreadGroup>();
    for (const result of kept) {
      const group = groups.get(result.thread) ?? {
        thread: result.thread,
        title: result.title,
        forumName: result.forumName,
        posts: [],
        score: 0,
      };
      group.posts.push(result);
      groups.set(result.thread, group);
    }
    const now = Date.now();
    const sorted = [...groups.values()];
    for (const group of sorted) group.score = scoreThread(group, pattern, now);
    sorted.sort((a, b) => b.score - a.score);

    if (!ranked) {
      ranked = document.createElement("div");
      ranked.id = RANKED_ID;
      list.before(ranked);
    }
    const summary = document.createElement("div");
    summary.className = "aue-search-summary";
    const left = results.length - kept.length;
    summary.textContent =
      `${sorted.length} thread${sorted.length === 1 ? "" : "s"} from ${results.length} results loaded` +
      (left > 0 ? `, ${left} left out by your filters` : "");
    ranked.replaceChildren(summary, ...sorted.map((group) => threadCard(group, pattern)));
  }
  log("forum search:", results.length, "results,", kept.length, "kept, order", order);
}

/**
 * Returns a labelled field for the search panel. A forum menu goes in a div,
 * not a label: a click anywhere in a label is passed to its first control,
 * which would toggle the menu shut on every box ticked.
 */
function field(label: string, control: HTMLElement, tag: "label" | "div" = "label"): HTMLElement {
  const wrap = document.createElement(tag);
  wrap.className = "aue-search-field";
  const caption = document.createElement("span");
  caption.textContent = label;
  wrap.append(caption, control);
  return wrap;
}

/** Returns a menu of options, with one picked. */
function menu(options: [string, string][], picked: string): HTMLSelectElement {
  const select = document.createElement("select");
  for (const [value, text] of options) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    select.append(option);
  }
  select.value = picked;
  return select;
}

/**
 * Returns a menu of forums with a box to tick for each, made to look like the
 * panel's other menus, with Reset at the top. Each change is kept in the
 * setting and the results refiltered at once.
 */
function forumMenu(
  forums: [string, string][],
  setting: string,
  picked: Set<string>,
  none: string,
): HTMLElement {
  const names = new Map(forums);
  const wrap = document.createElement("div");
  wrap.className = "aue-search-drop";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "aue-search-dropbtn";
  const list = document.createElement("div");
  list.className = "aue-search-droplist";
  const showPicked = () => {
    const first = [...picked][0] ?? "";
    button.textContent =
      picked.size === 0 ? none : picked.size === 1 ? (names.get(first) ?? "1 forum") : `${picked.size} forums`;
  };
  const changed = () => {
    writeSetting(setting, JSON.stringify([...picked]));
    showPicked();
    applyToResults();
  };

  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "torn-btn aue-search-reset";
  reset.textContent = "Reset";
  const grid = document.createElement("div");
  grid.className = "aue-search-forums";
  const boxes: HTMLInputElement[] = [];
  for (const [id, name] of forums) {
    const option = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = picked.has(id);
    box.addEventListener("change", () => {
      if (box.checked) picked.add(id);
      else picked.delete(id);
      changed();
    });
    boxes.push(box);
    option.append(box, name);
    grid.append(option);
  }
  reset.addEventListener("click", () => {
    picked.clear();
    for (const box of boxes) box.checked = false;
    changed();
  });
  list.append(reset, grid);

  button.addEventListener("click", () => {
    const opening = !wrap.classList.contains("aue-open");
    for (const open of document.querySelectorAll(".aue-search-drop.aue-open")) open.classList.remove("aue-open");
    wrap.classList.toggle("aue-open", opening);
  });
  document.addEventListener("pointerdown", (event) => {
    if (!wrap.contains(event.target as Node)) wrap.classList.remove("aue-open");
  });
  wrap.addEventListener("keydown", (event) => {
    if (event.key === "Escape") wrap.classList.remove("aue-open");
  });
  showPicked();
  wrap.append(button, list);
  return wrap;
}

/**
 * Splits a search into its words, its "exact phrases" and its -words, the
 * way Torn reads them, so each lands in its own box. Phrases and -words are
 * listed with commas between them, as the boxes take them.
 */
function splitSearch(q: string): { words: string; phrase: string; without: string } {
  const phrases: string[] = [];
  let rest = q.replace(/"([^"]*)"/g, (_, inside: string) => {
    if (inside.trim()) phrases.push(inside.trim());
    return " ";
  });
  const without: string[] = [];
  rest = rest.replace(/(^|\s)-(\S+)/g, (_, space: string, word: string) => {
    without.push(word);
    return space;
  });
  return { words: rest.replace(/\s+/g, " ").trim(), phrase: phrases.join(", "), without: without.join(", ") };
}

/** Returns the comma-separated entries of a box, quotes and leading minuses dropped. */
function entries(box: string): string[] {
  return box
    .split(",")
    .map((entry) => entry.replace(/"/g, "").replace(/^-+/, "").trim())
    .filter(Boolean);
}

/** Returns the words left out, one per entry word: Torn's minus takes one word. */
function withoutWords(box: string): string[] {
  return entries(box).flatMap((entry) => entry.split(/\s+/).map((word) => word.replace(/^-+/, "")).filter(Boolean));
}

/**
 * What a phrase search asked for beyond the one phrase Torn was sent, applied
 * to the results here. Torn only matches exactly when the search is a single
 * quoted phrase: a second phrase returns nothing, and any unquoted word turns
 * the phrase back into any word anywhere. So the first phrase goes to Torn and
 * the rest are kept, with the search they belong to, for its results page.
 */
interface Extra {
  q: string;
  phrases: string[];
  words: string[];
  without: string[];
}

/** Where the rest of a phrase search is kept. */
const EXTRA_SETTING = "FORUM_SEARCH_EXTRA";

/** Returns the rest of the phrase search on the page, or null when the page shows another search. */
function readExtra(): Extra | null {
  try {
    const extra = JSON.parse(readSetting(EXTRA_SETTING, "null")) as Extra | null;
    return extra && extra.q === currentSearch().q ? extra : null;
  } catch {
    return null;
  }
}

/** Returns a check that a result holds every extra phrase and word, and none of the words left out. */
function extraFilter(extra: Extra | null): (result: Result) => boolean {
  if (!extra) return () => true;
  const whole = (term: string) => termPattern([term]) ?? /$^/;
  const needed = [...extra.phrases, ...extra.words].map((term) => new RegExp(whole(term).source, "i"));
  const banned = extra.without.map((term) => new RegExp(whole(term).source, "i"));
  return (result) => {
    const text = `${result.title} ${result.text}`;
    return needed.every((term) => term.test(text)) && !banned.some((term) => term.test(text));
  };
}

/** Returns a text box for the search panel. */
function textBox(value: string, placeholder = ""): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.placeholder = placeholder;
  return input;
}

/** Returns a date picker kept in a setting, applying the filters when it changes. */
function datePicker(setting: string): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "date";
  input.value = readSetting(setting, "");
  input.addEventListener("change", () => {
    writeSetting(setting, input.value);
    applyToResults();
  });
  return input;
}

/** Returns the search panel, filled with the search on the page so it can be corrected or refined. */
function buildPanel(): HTMLElement {
  const search = currentSearch();
  const forums = forumList();
  const panel = document.createElement("form");
  panel.id = PANEL_ID;

  const extra = readExtra();
  const split = extra
    ? {
        words: extra.words.join(" "),
        phrase: [search.q.replace(/"/g, ""), ...extra.phrases].join(", "),
        without: extra.without.join(", "),
      }
    : splitSearch(search.q);
  const words = textBox(split.words, "Enter search term");
  const phrase = textBox(split.phrase);
  const without = textBox(split.without);
  // The forum in the address wins, so a search Torn's own pages linked to shows as it was made.
  const picked = new Set(search.f !== "0" ? [search.f] : readIds(PICKED_SETTING));
  const forumPicker = forumMenu(forums, PICKED_SETTING, picked, "All Forums");
  const exclude = forumMenu(forums, EXCLUDED_SETTING, new Set(readIds(EXCLUDED_SETTING)), "None");
  const type = menu(TYPES, search.y);
  const order = menu(
    [
      ["best", "Best match"],
      ["newest", "Newest first"],
    ],
    readSetting(ORDER_SETTING, "best"),
  );
  order.addEventListener("change", () => {
    writeSetting(ORDER_SETTING, order.value);
    applyToResults();
  });
  const go = document.createElement("button");
  go.type = "submit";
  go.className = "torn-btn";
  go.textContent = "Search";

  const top = document.createElement("div");
  top.className = "aue-search-row";
  const wordsField = field("Words", words);
  wordsField.classList.add("aue-search-grow");
  // The two comma boxes share one line of help under them, so they stay level with Words.
  const pair = document.createElement("div");
  pair.className = "aue-search-pair";
  pair.append(field("Exact phrase", phrase), field("Without words", without));
  const note = document.createElement("span");
  note.className = "aue-search-note";
  note.textContent = "Separate different phrases and words by commas";
  const group = document.createElement("div");
  group.className = "aue-search-group";
  group.append(pair, note);
  top.classList.add("aue-search-top");
  top.append(wordsField, group, field(" ", go, "div"));
  const options = document.createElement("div");
  options.className = "aue-search-row";
  options.append(
    field("Forum", forumPicker, "div"),
    field("Exclude", exclude, "div"),
    field("Type", type),
    field("Since", datePicker(SINCE_SETTING)),
    field("Before", datePicker(BEFORE_SETTING)),
    field("Order", order),
  );
  panel.append(top, options);

  // Opens the results at the address Torn's own result page links use: one page load per search.
  panel.addEventListener("submit", (event) => {
    event.preventDefault();
    const phrases = entries(phrase.value);
    const left = withoutWords(without.value);
    let q: string;
    if (phrases.length > 0) {
      q = `"${phrases[0]}"`;
      const rest: Extra = {
        q,
        phrases: phrases.slice(1),
        words: words.value.split(/\s+/).filter(Boolean),
        without: left,
      };
      writeSetting(EXTRA_SETTING, JSON.stringify(rest));
    } else {
      q = [words.value.trim(), ...left.map((word) => `-${word}`)].filter(Boolean).join(" ");
      writeSetting(EXTRA_SETTING, "null");
    }
    if (!q) return;
    writeSetting(PICKED_SETTING, JSON.stringify([...picked]));
    // One forum is narrowed by Torn; several go as all forums and are filtered on the results.
    const f = picked.size === 1 ? ([...picked][0] ?? "0") : "0";
    const params = new URLSearchParams({ p: "search", q, f, y: type.value });
    location.assign(`${FORUMS_PATH}?${params}`);
  });
  return panel;
}

/** Puts the search panel in place of Torn's form on the forums home, or above the results. */
function placePanel(): void {
  if (document.getElementById(PANEL_ID)) return;
  const tornInput = document.querySelector(SELECTORS.tornSearchInput);
  const tornForm = tornInput?.closest("form");
  if (tornForm) {
    tornForm.style.display = "none";
    tornForm.after(buildPanel());
    return;
  }
  if (onResultsPage()) {
    const wrap = document.querySelector(SELECTORS.resultsWrap) ?? document.querySelector(SELECTORS.results);
    wrap?.prepend(buildPanel());
  }
}

/** Adds the search panel to the forums home and the results page, and ranks the results. */
export function installForumSearch(): void {
  if (location.pathname !== FORUMS_PATH || !isEnabled(FORUM_SEARCH)) return;
  let timer = 0;
  let lastCount = -1;
  const pass = () => {
    placePanel();
    const list = document.querySelector(SELECTORS.results);
    const count = list ? list.querySelectorAll(SELECTORS.result).length : -1;
    // Only when results come or go: Show more adding a page, or a new search.
    if (count !== lastCount) {
      lastCount = count;
      if (list) applyToResults();
    }
  };
  // Torn moves between forum pages without reloading, so the panel is put back as each is drawn.
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = window.setTimeout(pass, 150);
  }).observe(document.body, { childList: true, subtree: true });
  pass();
}
