// Racing Class Records: on the raceway's Statistics tab, each track's "All
// Class Records" tab becomes a picker. "All Class Records" keeps Torn's own
// list (the best lap in each class); a class shows that class's top five.
//
// Below class A the picker starts on the user's own class, and in class A it
// starts on All Class Records. The Statistics tab is loaded into the page
// after it opens, so the tabs are found as they arrive.

import { tornGet } from "./api";
import { isKeyProblem, keyPrompt } from "./keyPrompt";
import { readKey } from "./settings";
import { injectStyles } from "./styles";

const SELECTORS = {
  // <div class="racing-main-wrap class-A m-top10">: the class is in the class list.
  mainWrap: ".racing-main-wrap",
  classLetter: ".racing-main-wrap .class-letter",
  // Each track's records: <ul id="class-records-6" class="records left">,
  // where 6 is the track's id in the API.
  classList: 'ul[id^="class-records-"]',
};

const CLASSES = ["A", "B", "C", "D", "E"] as const;
type RaceClass = (typeof CLASSES)[number];
/** The picker's choice: one class, or Torn's own list. */
type Choice = RaceClass | "all";

const ALL_LABEL = "All Class Records";
const PICKED_ATTR = "data-art-picker";
const MENU_ID = "art-class-menu";

interface LapRecord {
  driver_id: number;
  driver_name: string;
  car_item_id: number;
  car_item_name: string;
  lap_time: number;
}

/** Records already fetched this page load, by track and class. */
const fetched = new Map<string, Promise<LapRecord[]>>();

/** Returns the user's racing class, read from the raceway banner. */
function ownClass(): RaceClass | null {
  const letter = document.querySelector(SELECTORS.classLetter)?.textContent?.trim().toUpperCase();
  if (letter && (CLASSES as readonly string[]).includes(letter)) return letter as RaceClass;
  const match = /\bclass-([A-E])\b/.exec(document.querySelector(SELECTORS.mainWrap)?.className ?? "");
  return (match?.[1] as RaceClass | undefined) ?? null;
}

/** Returns the label the picker shows for a choice. */
function labelOf(choice: Choice): string {
  return choice === "all" ? ALL_LABEL : `Class ${choice} Records`;
}

/** Formats a lap time in seconds as Torn does: 01:16.67. */
function lapTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${rest.toFixed(2).padStart(5, "0")}`;
}

/** Returns one record in the markup Torn uses for its own lists. */
function recordItem(record: LapRecord, raceClass: RaceClass): HTMLLIElement {
  const item = document.createElement("li");

  const car = document.createElement("div");
  car.className = "car";
  const image = document.createElement("img");
  image.className = "torn-item small";
  const base = `/images/items/${record.car_item_id}/small`;
  image.src = `${base}.png`;
  image.srcset = `${base}.png 1x, ${base}@2x.png 2x, ${base}@3x.png 3x, ${base}@4x.png 4x`;
  image.width = 38;
  image.height = 19;
  image.title = `${record.car_item_name} (class ${raceClass})`;
  car.appendChild(image);

  const time = document.createElement("div");
  time.className = "time";
  time.textContent = lapTime(record.lap_time);

  const driver = document.createElement("div");
  driver.className = "driver";
  const link = document.createElement("a");
  link.href = `/profiles.php?XID=${record.driver_id}`;
  link.textContent = record.driver_name;
  driver.appendChild(link);

  const clear = document.createElement("div");
  clear.className = "clear";

  item.append(car, time, driver, clear);
  return item;
}

/** Returns a track's top five laps in one class. */
function recordsFor(track: string, raceClass: RaceClass, key: string): Promise<LapRecord[]> {
  const id = `${track}:${raceClass}`;
  let pending = fetched.get(id);
  if (!pending) {
    pending = tornGet<{ records?: LapRecord[] }>(`racing/${track}/records`, { cat: raceClass }, key).then(
      (body) => (body.records ?? []).slice(0, 5),
    );
    // A failed fetch is forgotten, so picking the class again retries it.
    pending.catch(() => fetched.delete(id));
    fetched.set(id, pending);
  }
  return pending;
}

/** One track's picker and the list it controls. */
class TrackPicker {
  private readonly original: Node[];
  private choice: Choice = "all";
  private shown = 0;

  constructor(
    private readonly track: string,
    private readonly list: HTMLElement,
    private readonly label: HTMLElement,
  ) {
    this.original = [...list.childNodes].map((node) => node.cloneNode(true));
  }

  /** Shows a choice in the label and the list. */
  show(choice: Choice): void {
    this.choice = choice;
    this.label.textContent = labelOf(choice);
    const shown = ++this.shown;

    if (choice === "all") {
      this.list.replaceChildren(...this.original.map((node) => node.cloneNode(true)));
      return;
    }

    const key = readKey();
    const status = document.createElement("li");
    status.className = "art-class-status";
    if (!key) {
      status.replaceChildren(keyPrompt());
      this.list.replaceChildren(status);
      return;
    }
    status.textContent = "Loading…";
    this.list.replaceChildren(status);
    recordsFor(this.track, choice, key).then(
      (records) => {
        if (shown !== this.shown) return;
        if (records.length === 0) {
          status.textContent = "No records";
          return;
        }
        this.list.replaceChildren(...records.map((record) => recordItem(record, choice)));
      },
      (error: unknown) => {
        if (shown !== this.shown) return;
        if (isKeyProblem(error)) status.replaceChildren(keyPrompt());
        else status.textContent = error instanceof Error ? error.message : "API error";
      },
    );
  }

  /** Opens the class menu under the tab. */
  openMenu(anchor: HTMLElement): void {
    closeMenu();
    const menu = document.createElement("div");
    menu.id = MENU_ID;
    menu.className = "art-class-menu";
    menu.setAttribute("role", "listbox");

    for (const choice of ["all", ...CLASSES] as Choice[]) {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "art-class-option";
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(choice === this.choice));
      option.textContent = labelOf(choice);
      option.addEventListener("click", (event) => {
        event.stopPropagation();
        closeMenu();
        this.show(choice);
      });
      menu.appendChild(option);
    }

    // On the body, not in the tab: Torn's tab strip clips what overflows it.
    const rect = anchor.getBoundingClientRect();
    menu.style.left = `${rect.left + window.scrollX}px`;
    menu.style.top = `${rect.bottom + window.scrollY + 2}px`;
    document.body.appendChild(menu);
  }
}

/** Removes the class menu, if one is open. */
function closeMenu(): void {
  document.getElementById(MENU_ID)?.remove();
}

/** Turns each track's All Class Records tab not yet done into a picker. */
function upgradeTabs(): void {
  const key = readKey();
  const own = ownClass();
  // Class A sees every class already in Torn's list, so only lower classes start on their own.
  const start: Choice = own && own !== "A" ? own : "all";

  for (const list of document.querySelectorAll<HTMLElement>(SELECTORS.classList)) {
    const track = list.id.replace("class-records-", "");
    const tab = document.querySelector<HTMLAnchorElement>(`a[href="#class-records-${track}"]`);
    if (!tab || tab.hasAttribute(PICKED_ATTR)) continue;
    tab.setAttribute(PICKED_ATTR, "");

    const label = document.createElement("span");
    label.className = "art-class-pick";
    tab.replaceChildren(label);
    tab.title = "";

    const picker = new TrackPicker(track, list, label);
    // Left to bubble: Torn's own handler may sit further up, and it is what opens the tab.
    tab.addEventListener("click", () => {
      if (document.getElementById(MENU_ID)?.dataset.track === track) {
        closeMenu();
        return;
      }
      picker.openMenu(tab);
      const menu = document.getElementById(MENU_ID);
      if (menu) menu.dataset.track = track;
    });
    picker.show(key ? start : "all");
  }
}

/** Starts the Racing Class Records picker on the raceway. */
export function installClassRecords(): void {
  injectStyles();
  upgradeTabs();
  new MutationObserver(upgradeTabs).observe(document.body, { childList: true, subtree: true });
  document.addEventListener("click", (event) => {
    const menu = document.getElementById(MENU_ID);
    const target = event.target as Element | null;
    // A click on a picker tab is the one that opened the menu.
    if (!menu || menu.contains(target) || target?.closest(`[${PICKED_ATTR}]`)) return;
    closeMenu();
  });
}
