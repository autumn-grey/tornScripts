// Autumn's Note Doodles - drawings in the chat bar's Notes.

import { log } from "./debug";
import { installDoodles } from "./doodles";
import { moveOldPictures } from "./storage";
import { injectStyles } from "./styles";

/** Starts the script once the page exists. */
function start(): void {
  try {
    injectStyles();
    installDoodles();
    // Frees the space drawings took in localStorage before they moved.
    void moveOldPictures().then((moved) => {
      if (moved > 0) log("moved", moved, "drawings out of localStorage");
    });
  } catch (error) {
    log("failed to start", error);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
