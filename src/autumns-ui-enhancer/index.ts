// Autumn's UI Enhancer - starts each feature on the pages it applies to.

import { installCityShopAlert } from "./cityShop";
import { log } from "./debug";
import { installListDisplay, installRequestCapture } from "./listDisplay";
import { installListSort } from "./listSort";
import { hideChatsEarly, installLocalChat } from "./localChat";
import { installNewsTicker } from "./newsTicker";
import { installPageJumpBlock } from "./pageJumpBlock";
import { installPreferencesPanel } from "./panel";
import { ITEMS_PATH, installItemSend } from "./itemSend";
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
  // Before Torn paints, or a chat this tab hid is shown and then taken away.
  start("chat pre-hide", hideChatsEarly);
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

  start("per-tab chat", installLocalChat);
  start("news ticker", installNewsTicker);
  start("city shop alert", installCityShopAlert);
  if (location.pathname === PREFERENCES_PATH) {
    start("preferences panel", installPreferencesPanel);
    return;
  }
  // The shop purchase send button is not started: it stopped appearing and
  // has not been diagnosed. See the note at the top of shopSend.ts.
  if (location.pathname === ITEMS_PATH) start("item send", installItemSend);
  start("list display", installListDisplay);
  start("list sort", installListSort);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", onReady, { once: true });
} else {
  onReady();
}
