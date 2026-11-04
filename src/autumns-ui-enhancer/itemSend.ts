// The stored recipient, filled into send forms on the items page.

import { log } from "./debug";
import { SHOP_SEND, isEnabled } from "./settings";
import { fillRecipient, findSendForms } from "./recipient";

/** The page this feature runs on. */
export const ITEMS_PATH = "/item.php";
/** Settles Torn's own drawing before a new form is filled in. */
const SETTLE_MS = 120;

/** The forms already filled in, so typing over one is left alone. */
const filled = new WeakSet<Element>();

/** Fills the recipient into any send form now on the page. */
function pass(): void {
  if (!isEnabled(SHOP_SEND)) return;
  const forms = findSendForms(document.body);
  if (forms.length) log("send: send forms on the items page:", forms.length);
  for (const form of forms) {
    if (filled.has(form)) continue;
    filled.add(form);
    fillRecipient(form);
  }
}

/** Fills your usual recipient into the items page's send forms. */
export function installItemSend(): void {
  pass();

  let timer = 0;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = window.setTimeout(pass, SETTLE_MS);
  }).observe(document.body, { childList: true, subtree: true });
}
