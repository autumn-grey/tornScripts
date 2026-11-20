// Autumn's Note Backup - keeps versions of the chat bar's Notes in this browser.

import { log } from "./debug";
import { watchNotes } from "./notes";
import { installPanel } from "./panel";
import { injectStyles } from "./styles";

/** Starts the script once the page exists. */
function start(): void {
  try {
    injectStyles();
    installPanel();
    watchNotes();
  } catch (error) {
    log("failed to start", error);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
