// The "Autumn's Scripts" switch panel on preferences.php.

import { FEATURES, PANEL_FOOTNOTE, isEnabled, setEnabled } from "./settings";
import { PANEL_ID, injectStyles } from "./styles";

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
