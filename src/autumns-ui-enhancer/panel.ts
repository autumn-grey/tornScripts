// The "Autumn's Scripts" panel on preferences.php.
//
// One switch per feature, laid out three to a line under a title bar in
// Torn's own panel style.

import { FEATURES, isEnabled, setEnabled } from "./settings";
import { PANEL_ID, injectStyles } from "./styles";

// ------------------------------------------------------------- selectors
//
// Unhashed Torn classes, most specific first. The panel goes directly after
// whichever of these is found, so it inherits that element's width.

const PREFS_PANEL_SELECTORS = [
  ".preferences-container",
  ".preferences-wrap",
  ".content-wrapper",
];

function findPrefsPanel(): Element | null {
  for (const selector of PREFS_PANEL_SELECTORS) {
    const element = document.querySelector(selector);
    if (element) return element;
  }
  return null;
}

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

  return panel;
}

function injectPanel(): void {
  if (document.getElementById(PANEL_ID)) return;
  const anchor = findPrefsPanel();
  if (!anchor) return;
  injectStyles();
  anchor.insertAdjacentElement("afterend", buildPanel());
}

/** Preferences is a React page, so the anchor can appear or be replaced. */
export function installPreferencesPanel(): void {
  injectPanel();
  new MutationObserver(() => injectPanel()).observe(document.body, {
    childList: true,
    subtree: true,
  });
}
