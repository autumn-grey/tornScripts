// The "Autumn's Scripts" switch panel on preferences.php.

import { checkApiKey, forgetCityShopCount } from "./cityShop";
import { CityShop, fetchCityShops, readCheckedItems, readStock, writeCheckedItems } from "./cityStock";
import {
  API_FEATURES,
  API_KEY_SETTING,
  FEATURES,
  Feature,
  PANEL_FOOTNOTE,
  PANEL_OPEN_SETTING,
  RECIPIENT_LABEL,
  RECIPIENT_SETTING,
  STOCK_LIST_OPEN_SETTING,
  isEnabled,
  readSetting,
  setEnabled,
  writeSetting,
} from "./settings";
import { PANEL_ID, injectStyles } from "./styles";
import { FoundUser, MIN_QUERY, searchUsers } from "./userSearch";

/** Settles typing before Torn is asked for names. */
const SEARCH_DELAY_MS = 250;
/** Leaves a click on the list time to land before it closes. */
const BLUR_MS = 150;

const PREFS_PANEL_SELECTORS = [
  ".preferences-container",
  ".preferences-wrap",
  ".content-wrapper",
];

/** Returns the element the panel hangs off. */
function findPrefsPanel(): Element | null {
  for (const selector of PREFS_PANEL_SELECTORS) {
    const element = document.querySelector(selector);
    if (element) return element;
  }
  return null;
}

/** Returns the row holding the default recipient for the buy send form. */
function buildRecipientRow(): HTMLElement {
  const row = document.createElement("div");
  row.className = "aue-row aue-row-stack";

  const heading = document.createElement("span");
  heading.className = "aue-heading";
  row.appendChild(heading);

  const label = document.createElement("span");
  label.className = "aue-label";
  label.textContent = "Item Recipient Default";
  heading.appendChild(label);

  const lookup = document.createElement("a");
  lookup.className = "aue-field-link";
  lookup.target = "_blank";
  lookup.rel = "noopener";
  heading.appendChild(lookup);

  const field = document.createElement("span");
  field.className = "aue-field";
  row.appendChild(field);

  const input = document.createElement("input");
  input.className = "aue-input";
  input.type = "text";
  input.placeholder = "name or ID";
  input.value = readSetting(RECIPIENT_LABEL, readSetting(RECIPIENT_SETTING, ""));
  field.appendChild(input);

  const list = document.createElement("div");
  list.className = "aue-suggest";
  list.hidden = true;
  field.appendChild(list);

  const refresh = (): void => {
    const id = readSetting(RECIPIENT_SETTING, "");
    lookup.href = `https://www.torn.com/profiles.php?XID=${id}`;
    lookup.textContent = id ? `[${id}]` : "";
    lookup.hidden = id === "";
  };

  /** Keeps a chosen user as the recipient. */
  const choose = (name: string, id: string): void => {
    input.value = `${name} [${id}]`;
    writeSetting(RECIPIENT_SETTING, id);
    writeSetting(RECIPIENT_LABEL, input.value);
    list.hidden = true;
    refresh();
  };

  /** Draws the names Torn offered for what has been typed. */
  const offer = (users: FoundUser[]): void => {
    list.replaceChildren();
    for (const user of users) {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "aue-suggest-option";

      const dot = document.createElement("span");
      dot.className = user.online ? "aue-dot aue-dot-on" : "aue-dot";
      option.appendChild(dot);
      option.appendChild(document.createTextNode(`${user.name} [${user.id}]`));

      option.addEventListener("mousedown", (event) => {
        event.preventDefault();
        choose(user.name, user.id);
      });
      list.appendChild(option);
    }
    list.hidden = users.length === 0;
  };

  let timer = 0;
  input.addEventListener("input", () => {
    const typed = input.value.trim();
    const id = /^\d+$/.test(typed) ? typed : (/\[(\d+)\]/.exec(typed)?.[1] ?? "");
    writeSetting(RECIPIENT_SETTING, id);
    writeSetting(RECIPIENT_LABEL, typed);
    refresh();

    clearTimeout(timer);
    if (typed.length < MIN_QUERY || /^\d+$/.test(typed)) {
      list.hidden = true;
      return;
    }
    timer = window.setTimeout(() => {
      void searchUsers(typed).then(offer);
    }, SEARCH_DELAY_MS);
  });

  input.addEventListener("blur", () => {
    window.setTimeout(() => (list.hidden = true), BLUR_MS);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") list.hidden = true;
  });
  refresh();

  return row;
}

/**
 * Opens Torn's new key form, filled in as a custom key that reads only Item shop
 * buy logs (type 4200, in Shops category 86) and the city shops' stock.
 */
const API_KEY_CREATE_URL =
  "https://www.torn.com/preferences.php#tab=api?step=addNewKey&title=AutumnsUIEv1&user=log&torn=cityshops&logIds=86&logtypes=4200";

/** Returns the row holding the API key. */
function buildApiKeyRow(): HTMLElement {
  const row = document.createElement("div");
  row.className = "aue-row aue-row-stack aue-row-wide";

  const heading = document.createElement("span");
  heading.className = "aue-heading";
  row.appendChild(heading);

  const label = document.createElement("span");
  label.className = "aue-label";
  label.textContent = "API Key";
  heading.appendChild(label);

  const generate = document.createElement("a");
  generate.className = "aue-field-link";
  generate.href = API_KEY_CREATE_URL;
  generate.target = "_blank";
  generate.rel = "noopener";
  generate.textContent = "Generate key";
  heading.appendChild(generate);

  const field = document.createElement("span");
  field.className = "aue-field aue-key-field";
  row.appendChild(field);

  const note = document.createElement("span");
  note.className = "aue-note aue-key-note";
  note.textContent = "The custom key fetches City shop purchase logs and shop stock only.";
  row.appendChild(note);

  const box = document.createElement("span");
  box.className = "aue-key-box";
  field.appendChild(box);

  const input = document.createElement("input");
  input.className = "aue-input aue-key-input";
  input.type = "password";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = "custom key";
  input.value = readSetting(API_KEY_SETTING, "");
  box.appendChild(input);

  const reveal = document.createElement("button");
  reveal.type = "button";
  reveal.className = "aue-key-reveal";
  reveal.textContent = "Show";
  reveal.addEventListener("click", () => {
    const hidden = input.type === "password";
    input.type = hidden ? "text" : "password";
    reveal.textContent = hidden ? "Hide" : "Show";
  });
  box.appendChild(reveal);

  const check = document.createElement("button");
  check.type = "button";
  check.className = "torn-btn aue-key-check";
  check.textContent = "Check";
  field.appendChild(check);

  const result = document.createElement("span");
  result.className = "aue-key-result";
  field.appendChild(result);

  // Typing changes nothing: a key is only stored once Check has passed it.
  input.addEventListener("input", () => {
    result.textContent = "";
    result.className = "aue-key-result";
  });

  check.addEventListener("click", () => {
    const key = input.value.trim();
    if (!key) {
      writeSetting(API_KEY_SETTING, "");
      forgetCityShopCount();
      result.textContent = "Removed";
      result.className = "aue-key-result";
      return;
    }
    check.disabled = true;
    void checkApiKey(key).then((problem) => {
      check.disabled = false;
      if (problem) {
        result.textContent = problem;
        result.className = "aue-key-result aue-key-bad";
        return;
      }
      writeSetting(API_KEY_SETTING, key);
      forgetCityShopCount();
      result.textContent = "Saved";
      result.className = "aue-key-result aue-key-good";
    });
  });

  return row;
}

/** Returns the row with one feature's switch. */
function buildSwitchRow(feature: Feature): HTMLElement {
  const row = document.createElement("div");
  row.className = "aue-row";

  const label = document.createElement("span");
  label.className = "aue-label";
  label.textContent = feature.label;
  if (feature.note) {
    const note = document.createElement("span");
    note.className = "aue-note";
    note.textContent = feature.note;
    label.appendChild(note);
  }
  row.appendChild(label);

  const toggle = document.createElement("label");
  toggle.className = "aue-switch";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = isEnabled(feature);
  input.addEventListener("change", () => setEnabled(feature, input.checked));
  toggle.appendChild(input);

  const slider = document.createElement("span");
  slider.className = "aue-slider";
  toggle.appendChild(slider);

  row.appendChild(toggle);
  return row;
}

/** Returns a heading that opens and closes a section, remembering which it was. */
function buildToggleHeading(
  className: string,
  text: string,
  setting: string,
  openByDefault: boolean,
  onChange: (open: boolean) => void,
): HTMLElement {
  // Not a <button>: Chrome will not let a button's words be selected.
  const heading = document.createElement("div");
  heading.setAttribute("role", "button");
  heading.tabIndex = 0;
  heading.className = className;
  heading.textContent = text;
  heading.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    heading.click();
  });

  const set = (open: boolean): void => {
    heading.setAttribute("aria-expanded", String(open));
    onChange(open);
  };
  heading.addEventListener("click", () => {
    // Dragging across the words to copy them is not a click to open or close.
    if (getSelection()?.toString()) return;
    const open = heading.getAttribute("aria-expanded") !== "true";
    writeSetting(setting, open ? "1" : "0");
    set(open);
  });
  // Runs after the caller has built what it opens, so it starts in the stored state.
  queueMicrotask(() => set(readSetting(setting, openByDefault ? "1" : "0") === "1"));
  return heading;
}

/** Fills the item list with every city shop's items, by shop, each with a checkbox. */
function fillStockList(list: HTMLElement, shops: CityShop[]): void {
  const checked = readCheckedItems();
  list.replaceChildren();

  for (const shop of shops) {
    const group = document.createElement("div");
    group.className = "aue-stock-shop";

    const name = document.createElement("div");
    name.className = "aue-stock-shop-name";
    name.textContent = shop.name;
    group.appendChild(name);

    const items = document.createElement("div");
    items.className = "aue-stock-items";
    for (const item of shop.items) {
      const option = document.createElement("label");
      option.className = "aue-stock-item";

      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = checked.has(item.id);
      box.addEventListener("change", () => {
        const now = readCheckedItems();
        if (box.checked) now.add(item.id);
        else now.delete(item.id);
        writeCheckedItems(now);
      });
      option.append(box, document.createTextNode(item.name));
      items.appendChild(option);
    }
    group.appendChild(items);
    list.appendChild(group);
  }
}

/** Returns the row holding the collapsible list of city shop items to check. */
function buildStockListRow(): HTMLElement {
  const row = document.createElement("div");
  row.className = "aue-row aue-row-stack aue-row-wide aue-stock-row";

  const list = document.createElement("div");
  list.className = "aue-stock-list";

  let loaded = false;
  /** Loads the shops the first time the list is opened. */
  const load = (): void => {
    if (loaded) return;
    loaded = true;

    // The item list barely changes, so any stored stock will do for it.
    const stored = readStock();
    if (stored) {
      fillStockList(list, stored.shops);
      return;
    }
    const key = readSetting(API_KEY_SETTING, "").trim();
    if (!key) {
      list.textContent = "No API key";
      loaded = false;
      return;
    }
    list.textContent = "Loading…";
    fetchCityShops(key).then(
      (shops) => fillStockList(list, shops),
      (error: unknown) => {
        list.textContent = error instanceof Error ? error.message : "API error";
        loaded = false;
      },
    );
  };

  row.appendChild(
    buildToggleHeading("aue-section-toggle", "City Shop Items to check", STOCK_LIST_OPEN_SETTING, false, (open) => {
      list.hidden = !open;
      if (open) load();
    }),
  );
  row.appendChild(list);
  return row;
}

/** Returns the preferences panel. */
function buildPanel(): HTMLElement {
  const panel = document.createElement("div");
  panel.id = PANEL_ID;

  const content = document.createElement("div");
  content.className = "aue-content";

  panel.appendChild(
    buildToggleHeading("aue-title", "Autumn's Scripts", PANEL_OPEN_SETTING, true, (open) => {
      content.hidden = !open;
      panel.classList.toggle("aue-collapsed", !open);
    }),
  );
  panel.appendChild(content);

  // Features that work without a key come first, then the wiki note, then
  // the key and everything that uses it.
  const body = document.createElement("div");
  body.className = "aue-body";
  for (const feature of FEATURES) body.appendChild(buildSwitchRow(feature));
  body.appendChild(buildRecipientRow());
  content.appendChild(body);

  const footnote = document.createElement("div");
  footnote.className = "aue-footnote";
  footnote.textContent = PANEL_FOOTNOTE;
  content.appendChild(footnote);

  const api = document.createElement("div");
  api.className = "aue-body aue-body-api";
  api.appendChild(buildApiKeyRow());
  for (const feature of API_FEATURES) api.appendChild(buildSwitchRow(feature));
  api.appendChild(buildStockListRow());
  content.appendChild(api);

  return panel;
}

/** Puts the panel under its anchor and keeps it there. */
function placePanel(): void {
  const anchor = findPrefsPanel();
  if (!anchor) return;

  const existing = document.getElementById(PANEL_ID);
  if (existing) {
    if (existing.previousElementSibling !== anchor) {
      anchor.insertAdjacentElement("afterend", existing);
    }
    return;
  }

  injectStyles();
  anchor.insertAdjacentElement("afterend", buildPanel());
}

/** Adds this script's switches to the preferences page. */
export function installPreferencesPanel(): void {
  placePanel();
  new MutationObserver(() => placePanel()).observe(document.body, {
    childList: true,
    subtree: true,
  });
}
