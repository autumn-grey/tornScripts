// Autumn's Keno - records each round played and draws the heat map.

import { waitForBoard } from "./board";
import { installCapture } from "./capture";
import { log } from "./debug";
import { installPanel } from "./panel";
import { addRound, syncWithSheet } from "./rounds";

if (new URLSearchParams(location.search).get("sid") === "keno") {
  // Listen first: a round played before the board settles must still be caught.
  installCapture(addRound);
  void waitForBoard().then(() => {
    try {
      installPanel();
    } catch (error) {
      log("panel failed", error);
    }
    void syncWithSheet();
  });
}
