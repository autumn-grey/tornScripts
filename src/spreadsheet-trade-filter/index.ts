// Spreadsheet Trade Filter
//
//   settings.ts   where the source link and the last good item list are kept
//   sheet.ts      turning a pasted spreadsheet link into an item list
//   items.ts      reading the trade list's rows off the page
//   maxButton.ts  the max button beside each quantity box
//   markup.ts     the page pass and the on-sheet outline
//   panel.ts      the source spreadsheet field under the Trade heading
//   styles.ts     every style the script injects
//   debug.ts      logging, off unless STF_DEBUG is switched on

import { installMarkup } from "./markup";
import { installPanel } from "./panel";

/** Sets the script up once the page has a body. */
function onReady(): void {
  installPanel();
  installMarkup();

  // Torn swaps the trade steps in without reloading, so the panel's anchor
  // can arrive after startup.
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
