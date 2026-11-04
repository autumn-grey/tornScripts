// Autumn's UI Enhancer - starts each feature on the pages it applies to.

import { log } from "./debug";
import { installListDisplay, installRequestCapture } from "./listDisplay";
import { installListSort } from "./listSort";
import { installNewsTicker } from "./newsTicker";
import { installPageJumpBlock } from "./pageJumpBlock";
import { installPreferencesPanel } from "./panel";
import { ITEMS_PATH, installItemSend } from "./itemSend";
import { SHOP_PATHS, installShopSend } from "./shopSend";
import { injectStyles } from "./styles";
import { installWikiTheme } from "./wikiTheme";

const PREFERENCES_PATH = "/preferences.php";
const GAME_HOST = "www.torn.com";

/** The game, as opposed to the wiki on its own host. */
const onGame = location.hostname === GAME_HOST;

// Do not remove: one feature throwing must not stop the others starting.

/** Starts one feature, surviving anything it throws. */
function start(name: string, install: () => void): void {
  try {
    install();
  } catch (error) {
    log("failed to start", name, error);
  }
}

if (onGame) {
  start("page jump block", installPageJumpBlock);
  start("request capture", installRequestCapture);
} else {
  start("wiki theme", installWikiTheme);
}

/** Starts every feature that needs the page to exist first. */
function onReady(): void {
  start("styles", injectStyles);

  if (!onGame) {
    start("list sort", installListSort);
    return;
  }

  start("news ticker", installNewsTicker);
  if (location.pathname === PREFERENCES_PATH) {
    start("preferences panel", installPreferencesPanel);
    return;
  }
  if (SHOP_PATHS.includes(location.pathname)) {
    start("shop send", installShopSend);
  }
  if (location.pathname === ITEMS_PATH) start("item send", installItemSend);
  start("list display", installListDisplay);
  start("list sort", installListSort);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", onReady, { once: true });
} else {
  onReady();
}
