// Faction Elimination Team Checker
//
//   settings.ts  the API key, the sort order and the stored roster
//   api.ts       the Torn API calls this script makes
//   teams.ts     the elimination teams and their icons
//   roster.ts    walking a faction's members for their teams
//   panel.ts     the panel above the member filter
//   styles.ts    every style the script injects
//   debug.ts     logging, off unless ET_DEBUG is switched on

import { installPanel } from "./panel";

/** Sets the script up once the page has a body. */
function onReady(): void {
  installPanel();

  // Torn swaps the faction tabs in without reloading, and TornTools builds its
  // filter after that, so the panel's anchor can arrive long after startup.
  new MutationObserver(() => installPanel()).observe(document.body, {
    childList: true,
    subtree: true,
  });
}

if (document.body) {
  onReady();
} else {
  document.addEventListener("DOMContentLoaded", onReady, { once: true });
}
