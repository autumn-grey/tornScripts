// The "Autumn's Scripts" switch panel on preferences.php.

import {
  FEATURES,
  PANEL_FOOTNOTE,
  RECIPIENT_LABEL,
  RECIPIENT_SETTING,
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

/** Returns the preferences panel. */
function buildPanel(): HTMLElement {
  const panel = document.createElement("div");
  panel.id = PANEL_ID;

  const title = document.createElement("div");
  title.className = "aue-title";
  title.textContent = "Autumn's Scripts";
  panel.appendChild(title);

  const body = document.createElement("div");
  body.className = "aue-body";
  panel.appendChild(body);

  for (const feature of FEATURES) {
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
    body.appendChild(row);
  }

  body.appendChild(buildRecipientRow());

  const footnote = document.createElement("div");
  footnote.className = "aue-footnote";
  footnote.textContent = PANEL_FOOTNOTE;
  panel.appendChild(footnote);

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
