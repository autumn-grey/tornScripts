// A light/dark switch and dark theme for the Torn Wiki.

import { readSetting, writeSetting } from "./settings";

const THEME_SETTING = "WIKI_THEME";
const DARK_CLASS = "aue-wiki-dark";
const STYLE_ID = "aue-wiki-theme";
const BUTTON_ID = "aue-wiki-theme-switch";

type Theme = "light" | "dark";

/** The dark palette. */
const CSS = `
  html.${DARK_CLASS} {
    color-scheme: dark;
  }
  html.${DARK_CLASS} body {
    background: #17181a !important;
    color: #c9c8c2 !important;
  }
  html.${DARK_CLASS} .side-panel-wrapper,
  html.${DARK_CLASS} .card,
  html.${DARK_CLASS} .torn-navigation-header {
    background: #1f2124 !important;
    border-color: #34383c !important;
  }
  html.${DARK_CLASS} .content-area-wrapper {
    background: #1b1d1f !important;
  }
  html.${DARK_CLASS} #mw-content-text,
  html.${DARK_CLASS} .mw-parser-output,
  html.${DARK_CLASS} .mw-body-content,
  html.${DARK_CLASS} #catlinks,
  html.${DARK_CLASS} #toc,
  html.${DARK_CLASS} .toc {
    color: #c9c8c2 !important;
    background: transparent !important;
  }
  html.${DARK_CLASS} #catlinks {
    background: #1f2124 !important;
    border-color: #34383c !important;
  }
  html.${DARK_CLASS} a,
  html.${DARK_CLASS} #mw-content-text a {
    color: #62b0f5 !important;
  }
  html.${DARK_CLASS} a.new,
  html.${DARK_CLASS} #mw-content-text a.new {
    color: #ff7f7f !important;
  }
  html.${DARK_CLASS} .torn-title-text,
  html.${DARK_CLASS} .torn-title-text span {
    color: #e4e4e4 !important;
  }
  html.${DARK_CLASS} .torn-back-button {
    color: #9aa0a6 !important;
  }
  html.${DARK_CLASS} table.wikitable,
  html.${DARK_CLASS} table.wikitable td,
  html.${DARK_CLASS} table.wikitable th {
    border-color: #3b4650 !important;
    color: #c9c8c2 !important;
  }
  html.${DARK_CLASS} table.wikitable th {
    background: #253039 !important;
    color: #dfe7ee !important;
  }
  html.${DARK_CLASS} table.wikitable tr {
    background: #1b1d1f !important;
  }
  html.${DARK_CLASS} table.wikitable tr:nth-of-type(even) {
    background: #212427 !important;
  }
  html.${DARK_CLASS} table.wikitable td {
    background: transparent !important;
  }
  html.${DARK_CLASS} input,
  html.${DARK_CLASS} textarea,
  html.${DARK_CLASS} select {
    background: #26292c !important;
    color: #c9c8c2 !important;
    border-color: #3b4046 !important;
  }
  html.${DARK_CLASS} input::placeholder {
    color: #85888c !important;
  }
  html.${DARK_CLASS} pre,
  html.${DARK_CLASS} code,
  html.${DARK_CLASS} .mw-code {
    background: #232629 !important;
    color: #d3d2cc !important;
    border-color: #3b4046 !important;
  }
  html.${DARK_CLASS} hr {
    border-color: #34383c !important;
  }
  html.${DARK_CLASS} #torn-back-to-top {
    background: #26292c !important;
    border-color: #3b4046 !important;
  }
  html.${DARK_CLASS} .nav-menu-mobile-switch {
    background: rgba(90, 94, 98, 0.55) !important;
  }

  #${BUTTON_ID} {
    position: fixed;
    top: 6px;
    left: 6px;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid rgba(0, 0, 0, 0.25);
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.75);
    color: #55575a;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
    -webkit-tap-highlight-color: transparent;
  }
  html.${DARK_CLASS} #${BUTTON_ID} {
    border-color: rgba(255, 255, 255, 0.2);
    background: rgba(38, 41, 44, 0.85);
    color: #c9c8c2;
  }
  #${BUTTON_ID}:hover,
  #${BUTTON_ID}:active,
  #${BUTTON_ID}:focus-visible {
    color: #fff;
    border-color: #fff;
    background: rgba(38, 41, 44, 0.9);
  }
  #${BUTTON_ID} svg {
    width: 16px;
    height: 16px;
    display: block;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
  }
`;

/** Shown in light mode: a moon, for "switch to dark". */
const MOON = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16 12.2A6.6 6.6 0 0 1 7.8 4 6.6 6.6 0 1 0 16 12.2Z"/></svg>`;
/** Shown in dark mode: a sun, for "switch back". */
const SUN = `<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.6"/><path d="M10 1.6v2.2M10 16.2v2.2M18.4 10h-2.2M3.8 10H1.6M15.9 4.1l-1.6 1.6M5.7 14.3l-1.6 1.6M15.9 15.9l-1.6-1.6M5.7 5.7 4.1 4.1"/></svg>`;

/** Returns the light or dark setting the operating system reports. */
function systemTheme(): Theme {
  try {
    return matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
}

/** Returns the theme the wiki should be showing. */
function currentTheme(): Theme {
  const stored = readSetting(THEME_SETTING, "");
  return stored === "dark" || stored === "light" ? stored : systemTheme();
}

/** Switches the wiki to a theme. */
function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle(DARK_CLASS, theme === "dark");
  const button = document.getElementById(BUTTON_ID);
  if (button) paintButton(button, theme);
}

/** Sets the switch's icon and label for a theme. */
function paintButton(button: HTMLElement, theme: Theme): void {
  const toDark = theme === "light";
  button.innerHTML = toDark ? MOON : SUN;
  const label = toDark ? "Switch to dark mode" : "Switch to light mode";
  button.setAttribute("aria-label", label);
  button.title = label;
}

/** Puts the wiki theme's stylesheet on the page. */
function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  (document.head ?? document.documentElement).appendChild(style);
}

/** Puts the light/dark switch in the corner. */
function addButton(): void {
  if (!document.body || document.getElementById(BUTTON_ID)) return;
  const button = document.createElement("button");
  button.type = "button";
  button.id = BUTTON_ID;
  paintButton(button, currentTheme());
  button.addEventListener("click", () => {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    writeSetting(THEME_SETTING, next);
    applyTheme(next);
  });
  document.body.appendChild(button);
}

/** Adds a light/dark switch to the Torn Wiki. */
export function installWikiTheme(): void {
  injectStyle();
  applyTheme(currentTheme());

  if (document.body) {
    addButton();
  } else {
    document.addEventListener("DOMContentLoaded", addButton, { once: true });
  }
}
