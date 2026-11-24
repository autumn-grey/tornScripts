// The faction bank's give money form on the controls tab: filling it in for a
// chosen member, and noticing when its send button is pressed.
//
// Torn builds this form in React. Its boxes carry data-testid attributes,
// which are made for Torn's own tests and do not change between deploys the
// way hashed classes do. The selectors come from Torn Banker Chat Tool 3.4
// (GreasyFork 581619, 2026-10-05); the form has not been seen here directly.

import { hashedClass } from "../shared/hashedClass";
import { log } from "./debug";

const SELECTORS = {
  /** The player box: a search box that takes "Name [ID]". */
  player: 'input[data-testid="autocomplete-input"]',
  /** The amount box. */
  amount: 'input[data-testid="legacy-money-input"]',
  /** The radio that pays into the member's faction balance. */
  addToBalance: 'div[role="radiogroup"] input[type="radio"][value="addToBalance"]',
  /** The form's send button. */
  send: `${hashedClass("btnContainer")} button[type="submit"]`,
};

/** When a filled box is checked again, in case Torn's render cleared it. */
const REFILL_DELAYS_MS = [150, 400, 900];

/** A member chosen in the panel and put into the form. */
export interface Prefill {
  memberId: number;
  label: string;
  amount: number;
}

/** The form's two boxes, or null when the form is not on the page. */
function findFields(): { player: HTMLInputElement; amount: HTMLInputElement } | null {
  const player = document.querySelector<HTMLInputElement>(SELECTORS.player);
  const amount = document.querySelector<HTMLInputElement>(SELECTORS.amount);
  return player && amount ? { player, amount } : null;
}

/**
 * Puts a value into a box the way typing into it would. React keeps its own
 * copy of a box's value, so the native setter is used and the events fired,
 * or React puts the old value straight back.
 */
function fillField(input: HTMLInputElement, value: string): void {
  input.focus();
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input) as object, "value")?.set;
  if (setter) setter.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Ticks the form's "Add to balance" option. */
function chooseBalance(): void {
  const radio = document.querySelector<HTMLInputElement>(SELECTORS.addToBalance);
  if (!radio) log("bank: no Add to balance option found");
  else if (!radio.checked) radio.click();
}

/** Fills the form in for one member; returns false when the form is not on the page. */
export function fillBankForm(prefill: Prefill): boolean {
  const fields = findFields();
  if (!fields) {
    log("bank: form not found");
    return false;
  }

  chooseBalance();
  const fill = (): void => {
    fillField(fields.player, prefill.label);
    fillField(fields.amount, String(prefill.amount));
  };
  fill();

  // Do not drop the retries: Torn's own render can land after the fill and wipe it.
  for (const delay of REFILL_DELAYS_MS) {
    setTimeout(() => {
      if (fields.player.isConnected && fields.player.value === "") fill();
    }, delay);
  }
  return true;
}

/** Says whether the form still holds what was filled in, so a hand-edited form is not counted. */
function stillMatches(prefill: Prefill): boolean {
  const fields = findFields();
  if (!fields) return false;
  // The amount box shows the number with commas.
  const amount = fields.amount.value.replace(/\D+/g, "");
  return fields.player.value.includes(`[${prefill.memberId}]`) && amount === String(prefill.amount);
}

/**
 * Calls back each time the send button is pressed while the form holds the
 * filled-in member and amount.
 */
export function watchSendButton(current: () => Prefill | null, onSent: (prefill: Prefill) => void): void {
  // Capture phase on the document, so the click is seen before Torn's own
  // handler can re-render the form and change its values.
  document.addEventListener(
    "click",
    (event) => {
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>(SELECTORS.send) : null;
      if (!button || button.disabled) return;

      const prefill = current();
      if (!prefill) return;
      if (!stillMatches(prefill)) {
        log("bank: form was changed by hand, not counting this send", prefill);
        return;
      }
      onSent(prefill);
    },
    true,
  );
}
