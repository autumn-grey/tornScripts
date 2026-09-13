// Autumn's Buy Helper
//
// Thanks to Hatsunelle for writing the original script this much of this one was based on.
//
// Overlays your own reference prices onto the places you buy from other
// players - the item market and other people's bazaars - so a listing worth
// buying reads at a glance instead of having to be worked out.
//
// Display layer only. Nothing here clicks, buys, or navigates for you.
//
//   settings.ts  where the source link and the last good price list are kept
//   sheet.ts     turning a pasted spreadsheet link into a price list
//   pages.ts     which pages get marked up, and noticing when you move
//   markup.ts    finding the listings and outlining the good ones
//   panel.ts     the settings panel on the preferences page
//   styles.ts    every style the script injects
//   debug.ts     logging, off unless ABH_DEBUG is switched on

import { installMarkup } from "./markup";
import { currentPage, onLocationChange } from "./pages";
import { installPreferencesPanel } from "./panel";

const PREFERENCES_PATH = "/preferences.php";

function onPage(): void {
  if (!currentPage()) return;
  installMarkup();
}

function onReady(): void {
  if (location.pathname === PREFERENCES_PATH) {
    installPreferencesPanel();
    return;
  }

  onPage();
  // The market and the bazaars swap pages without reloading, so where we are
  // has to be re-checked rather than decided once at startup.
  onLocationChange(onPage);
}

if (document.body) {
  onReady();
} else {
  document.addEventListener("DOMContentLoaded", onReady, { once: true });
}
