// Autumn's Note Doodles - drawings in the chat bar's Notes.

import { log } from "./debug";
import { installDoodles } from "./doodles";
import { injectStyles } from "./styles";

/** Starts the script once the page exists. */
function start(): void {
  try {
    injectStyles();
    installDoodles();
  } catch (error) {
    log("failed to start", error);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
