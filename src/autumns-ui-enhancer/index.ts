// Autumn's UI Enhancer - starts each feature on the pages it applies to.

import { installListDisplay, installRequestCapture } from "./listDisplay";
import { installListSort } from "./listSort";
import { installNewsTicker } from "./newsTicker";
import { installPageJumpBlock } from "./pageJumpBlock";
import { installPreferencesPanel } from "./panel";
import { SHOP_PATHS, installShopSend } from "./shopSend";
import { injectStyles } from "./styles";
import { installWikiTheme } from "./wikiTheme";

const PREFERENCES_PATH = "/preferences.php";
const GAME_HOST = "www.torn.com";

/** The game, as opposed to the wiki on its own host. */
const onGame = location.hostname === GAME_HOST;

if (onGame) {
  installPageJumpBlock();
  installRequestCapture();
} else {
  installWikiTheme();
}

/** Starts every feature that needs the page to exist first. */
function onReady(): void {
  injectStyles();

  if (!onGame) {
    installListSort();
    return;
  }

  installNewsTicker();
  if (location.pathname === PREFERENCES_PATH) {
    installPreferencesPanel();
    return;
  }
  if (SHOP_PATHS.includes(location.pathname)) installShopSend();
  installListDisplay();
  installListSort();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", onReady, { once: true });
} else {
  onReady();
}
