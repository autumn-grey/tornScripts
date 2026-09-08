// Autumn's UI Enhancer
//
// A home for small display-layer fixes to Torn's interface. Each fix is a
// feature with its own switch, and the switches live in a panel injected
// under the main panel on preferences.php.
//
//   Page Jump Block        - stops the page scrolling itself when a hash
//                            filter link is clicked.  pageJumpBlock.ts
//   List Display Extension - an items-per-page dropdown above Torn's paged
//                            lists, and a pager that steps by it.
//                            listDisplay.ts
//
// Runs at document-start: the scroll patch and the request capture both
// have to be in place before Torn's own bundle loads. Anything that needs
// the DOM waits for it here.

import { installListDisplay, installRequestCapture } from "./listDisplay";
import { installPageJumpBlock } from "./pageJumpBlock";
import { installPreferencesPanel } from "./panel";
import { injectStyles } from "./styles";

const PREFERENCES_PATH = "/preferences.php";

installPageJumpBlock();
installRequestCapture();

function onReady(): void {
  injectStyles();
  if (location.pathname === PREFERENCES_PATH) {
    installPreferencesPanel();
  } else {
    installListDisplay();
  }
}

if (document.body) {
  onReady();
} else {
  document.addEventListener("DOMContentLoaded", onReady, { once: true });
}
