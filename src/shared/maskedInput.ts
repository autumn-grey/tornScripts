// Secret boxes (API keys, sheet URLs) that browsers' password managers leave alone.
//
// A type="password" box gets a saved or suggested password filled in, even
// with autocomplete="off": Chrome once put a generated password into a key
// box, which looked like a leaked key. So the box stays type="text" and CSS
// hides the characters instead.

/** Turns a text box into a secret box that password managers skip, masked to start with. */
export function makeSecretInput(input: HTMLInputElement): void {
  input.type = "text";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("data-lpignore", "true");
  input.setAttribute("data-1p-ignore", "true");
  input.setAttribute("data-bwignore", "true");
  input.setAttribute("data-form-type", "other");
  setSecretShown(input, false);
}

/** Shows or hides a secret box's characters. */
export function setSecretShown(input: HTMLInputElement, shown: boolean): void {
  input.style.setProperty("-webkit-text-security", shown ? "none" : "disc");
  input.dataset.secretShown = shown ? "1" : "0";
}

/** Says whether a secret box's characters are showing. */
export function isSecretShown(input: HTMLInputElement): boolean {
  return input.dataset.secretShown === "1";
}
