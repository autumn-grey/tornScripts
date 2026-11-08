// Autumn's Record Tracker - starts each feature on the page it belongs to.

import { log } from "./debug";
import { installLevelProgress } from "./hof";
import { installPreferencesPanel } from "./panel";
import { installMeritTracker } from "./points";
import { installClassRecords } from "./racing";
import { LEVEL_PROGRESS, POINT_MERIT_TRACKER, RACING_CLASS_RECORDS, isEnabled } from "./settings";

const PREFERENCES_PATH = "/preferences.php";
const PAGE_PATH = "/page.php";

// Do not remove: one feature throwing must not stop the others starting.

/** Starts one feature, surviving anything it throws. */
function start(name: string, install: () => void): void {
  try {
    install();
  } catch (error) {
    log("failed to start", name, error);
  }
}

const sid = new URLSearchParams(location.search).get("sid");

if (location.pathname === PREFERENCES_PATH) {
  start("preferences panel", installPreferencesPanel);
} else if (location.pathname === PAGE_PATH) {
  if (sid === "hof" && isEnabled(LEVEL_PROGRESS)) start("level progress", installLevelProgress);
  if (sid === "points" && isEnabled(POINT_MERIT_TRACKER)) start("merit tracker", installMeritTracker);
  if (sid === "racing" && isEnabled(RACING_CLASS_RECORDS)) start("class records", installClassRecords);
}
