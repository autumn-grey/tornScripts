// The settings rows on preferences.php: the Record API Key and the three switches.
//
// When Autumn's UI Enhancer has drawn its "Autumn's Scripts" panel, the rows
// join the bottom of it. Without it, they get a panel of their own that looks
// the same, which steps aside if the Enhancer's panel turns up later.

import { API_KEY_CREATE_URL, checkApiKey } from "./api";
import {
  API_KEY_SETTING,
  FEATURES,
  Feature,
  PANEL_OPEN_SETTING,
  isEnabled,
  readSetting,
  setEnabled,
  writeSetting,
} from "./settings";
import { STANDALONE_PANEL_ID, injectStyles } from "./styles";

const SELECTORS = {
  // The UI Enhancer's panel body, which the rows join the bottom of.
  enhancerContent: "#aue-prefs-panel .aue-content",
  // Unhashed Torn classes, most specific first; a standalone panel goes after the first found.
  prefsAnchors: [".preferences-container", ".preferences-wrap", ".content-wrapper"],
};

const SECTION_ID = "art-prefs-section";
/** How long to wait for the UI Enhancer's panel before drawing one of our own. */
const JOIN_WAIT_MS = 2000;

/** Returns the row holding the API key. */
function buildApiKeyRow(): HTMLElement {
  const row = document.createElement("div");
  row.className = "art-row art-row-wide";

  const heading = document.createElement("span");
  heading.className = "art-heading";
  row.appendChild(heading);

  const label = document.createElement("span");
  label.className = "art-label";
  label.textContent = "Record API Key";
  heading.appendChild(label);

  const generate = document.createElement("a");
  generate.className = "art-field-link";
  generate.href = API_KEY_CREATE_URL;
  generate.target = "_blank";
  generate.rel = "noopener";
  generate.textContent = "Generate key";
  heading.appendChild(generate);

  const field = document.createElement("span");
  field.className = "art-key-field";
  row.appendChild(field);

  const box = document.createElement("span");
  box.className = "art-key-box";
  field.appendChild(box);

  const input = document.createElement("input");
  input.className = "art-key-input";
  input.type = "password";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = "custom key";
  input.value = readSetting<string>(API_KEY_SETTING, "");
  box.appendChild(input);

  const reveal = document.createElement("button");
  reveal.type = "button";
  reveal.className = "art-key-reveal";
  reveal.textContent = "Show";
  reveal.addEventListener("click", () => {
    const hidden = input.type === "password";
    input.type = hidden ? "text" : "password";
    reveal.textContent = hidden ? "Hide" : "Show";
  });
  box.appendChild(reveal);

  const check = document.createElement("button");
  check.type = "button";
  check.className = "torn-btn art-key-check";
  check.textContent = "Check";
  field.appendChild(check);

  const result = document.createElement("span");
  result.className = "art-key-result";
  field.appendChild(result);

  // Typing changes nothing: a key is only stored once Check has passed it.
  input.addEventListener("input", () => {
    result.textContent = "";
    result.className = "art-key-result";
  });

  check.addEventListener("click", () => {
    const key = input.value.trim();
    if (!key) {
      writeSetting(API_KEY_SETTING, "");
      result.textContent = "Removed";
      result.className = "art-key-result";
      return;
    }
    check.disabled = true;
    result.textContent = "Checking…";
    result.className = "art-key-result";
    void checkApiKey(key).then((problem) => {
      check.disabled = false;
      if (problem) {
        result.textContent = problem;
        result.className = "art-key-result art-bad";
        return;
      }
      writeSetting(API_KEY_SETTING, key);
      result.textContent = "Saved";
      result.className = "art-key-result art-good";
    });
  });

  return row;
}

/** Returns the row with one feature's switch. */
function buildSwitchRow(feature: Feature): HTMLElement {
  const row = document.createElement("div");
  row.className = "art-row";

  const label = document.createElement("span");
  label.className = "art-label";
  label.textContent = feature.label;
  row.appendChild(label);

  const toggle = document.createElement("label");
  toggle.className = "art-switch";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = isEnabled(feature);
  input.addEventListener("change", () => setEnabled(feature, input.checked));
  toggle.appendChild(input);

  const slider = document.createElement("span");
  slider.className = "art-slider";
  toggle.appendChild(slider);

  row.appendChild(toggle);
  return row;
}

/** Returns the block of rows, the same whichever panel holds it. */
function buildSection(): HTMLElement {
  const section = document.createElement("div");
  section.id = SECTION_ID;
  section.className = "art-section";

  const label = document.createElement("div");
  label.className = "art-section-label";
  label.textContent = "Record Tracker";
  section.appendChild(label);

  const body = document.createElement("div");
  body.className = "art-body";
  body.appendChild(buildApiKeyRow());
  for (const feature of FEATURES) body.appendChild(buildSwitchRow(feature));
  section.appendChild(body);
  return section;
}

/** Returns a panel of our own, titled like the UI Enhancer's, for when that is not installed. */
function buildStandalonePanel(): HTMLElement {
  const panel = document.createElement("div");
  panel.id = STANDALONE_PANEL_ID;

  // Not a <button>: Chrome will not let a button's words be selected.
  const title = document.createElement("div");
  title.className = "art-title";
  title.setAttribute("role", "button");
  title.tabIndex = 0;
  title.textContent = "Autumn's Scripts";
  panel.appendChild(title);

  const content = document.createElement("div");
  content.className = "art-content";
  panel.appendChild(content);

  const set = (open: boolean): void => {
    title.setAttribute("aria-expanded", String(open));
    content.hidden = !open;
    panel.classList.toggle("art-collapsed", !open);
  };
  title.addEventListener("click", () => {
    if (getSelection()?.toString()) return;
    const open = title.getAttribute("aria-expanded") !== "true";
    writeSetting(PANEL_OPEN_SETTING, open);
    set(open);
  });
  title.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    title.click();
  });
  set(readSetting<boolean>(PANEL_OPEN_SETTING, true));
  return panel;
}

/** Returns the element a standalone panel goes after. */
function findAnchor(): Element | null {
  for (const selector of SELECTORS.prefsAnchors) {
    const element = document.querySelector(selector);
    if (element) return element;
  }
  return null;
}

let section: HTMLElement | null = null;
const startedAt = Date.now();

/** Puts the rows in the UI Enhancer's panel, or in our own once it is clear that is not coming. */
function place(): void {
  section ??= buildSection();

  const host = document.querySelector(SELECTORS.enhancerContent);
  if (host) {
    if (host.lastElementChild !== section) host.appendChild(section);
    document.getElementById(STANDALONE_PANEL_ID)?.remove();
    return;
  }
  if (Date.now() - startedAt < JOIN_WAIT_MS) return;

  let panel = document.getElementById(STANDALONE_PANEL_ID);
  if (!panel) {
    const anchor = findAnchor();
    if (!anchor) return;
    panel = buildStandalonePanel();
    // Inserted once, not held in place: other panels go after the same anchor.
    anchor.insertAdjacentElement("afterend", panel);
  }
  const content = panel.querySelector(".art-content");
  if (content && section.parentElement !== content) content.appendChild(section);
}

/** Adds this script's settings to the preferences page. */
export function installPreferencesPanel(): void {
  injectStyles();
  place();
  window.setTimeout(place, JOIN_WAIT_MS + 50);
  new MutationObserver(place).observe(document.body, { childList: true, subtree: true });
}
