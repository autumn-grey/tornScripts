// ZNS OC Payout tool: a fairer Organised Crime payout on the faction bank page.
//
//   api.ts       the Torn API calls
//   crimes.ts    loaded crimes, chains, names and item values, turned into rows
//   payout.ts    the payout maths, with no page access
//   weights.ts   role weights supplied by the faction
//   bank.ts      filling in Torn's give money form and seeing it sent
//   panel.ts     the panel and its tables
//   settings.ts  what is kept in localStorage
//   styles.ts    every style the script injects
//   debug.ts     logging, off unless OCP_DEBUG is "1"

import { log } from "./debug";
import { installPanel } from "./panel";

/** Whether a check for the panel's place is already queued for the next frame. */
let queued = false;

/** Looks for the panel's place at most once a frame, however busy the page is. */
function schedule(): void {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    installPanel();
  });
}

function onReady(): void {
  log("running", __SCRIPT_VERSION__, location.href);
  installPanel();
  // Torn swaps faction tabs in without reloading, so the armoury can turn up
  // long after the page has loaded.
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener("hashchange", schedule);
}

if (document.body) onReady();
else document.addEventListener("DOMContentLoaded", onReady, { once: true });
