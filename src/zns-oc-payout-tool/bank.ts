// The faction bank's "Give money or change balance" form: filling it in for a
// chosen member, and noticing when its button is pressed.
//
// The form's markup has not been captured yet, so it is found by its visible
// text and placeholder rather than by class. Expect these to be what breaks.

import { log } from "./debug";

/** The form's heading. */
const FORM_HEADING = /^\s*give money or change balance\s*$/i;
/** The player box's placeholder. */
const PLAYER_FIELD = "input[placeholder*='search player' i]";
/** The text of the radio that pays into the member's faction balance. */
const BALANCE_OPTION = /add to balance/i;
/** The text of the form's send button. */
const SEND_BUTTON = /give money|add to balance|change balance/i;
/** When a filled box is checked again, in case Torn's render cleared it. */
const REFILL_DELAYS_MS = [150, 400, 900];

/** A member chosen in the panel and put into the form. */
export interface Prefill {
  memberId: number;
  label: string;
  amount: number;
}

/** Returns the form, or null when it is not on the page. */
export function findBankForm(): HTMLElement | null {
  const heading = Array.from(document.querySelectorAll<HTMLElement>("div, span, h3, h4, h5, p, label"))
    .find((element) => element.children.length === 0 && FORM_HEADING.test(element.textContent ?? ""));
  if (!heading) return null;

  // Climb to the smallest box that holds the player field as well as the heading.
  for (let box: HTMLElement | null = heading.parentElement; box; box = box.parentElement) {
    if (box.querySelector(PLAYER_FIELD)) return box;
  }
  return null;
}

/** Puts a value into a box the way typing into it would, so Torn's own code sees it. */
function fillField(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input) as object, "value")?.set;
  if (setter) setter.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Returns the form's amount box. */
function amountField(form: HTMLElement): HTMLInputElement | null {
  const player = form.querySelector(PLAYER_FIELD);
  return (
    Array.from(form.querySelectorAll<HTMLInputElement>("input"))
      .find((input) => input !== player && !["radio", "checkbox", "hidden"].includes(input.type)) ?? null
  );
}

/** Returns the form's send button. */
function sendButton(form: HTMLElement): HTMLElement | null {
  return (
    Array.from(form.querySelectorAll<HTMLElement>("button, input[type='submit'], input[type='button']"))
      .find((button) => SEND_BUTTON.test(button.textContent || (button as HTMLInputElement).value || "")) ?? null
  );
}

/** Ticks the form's "Add to balance" option. */
function chooseBalance(form: HTMLElement): void {
  for (const label of Array.from(form.querySelectorAll("label"))) {
    if (!BALANCE_OPTION.test(label.textContent ?? "")) continue;
    const radio = label.querySelector<HTMLInputElement>("input[type='radio']") ??
      (label.htmlFor ? document.getElementById(label.htmlFor) as HTMLInputElement | null : null);
    if (radio && !radio.checked) radio.click();
    else if (!radio) label.click();
    return;
  }
  log("bank: no Add to balance option found");
}

/** Fills the form in for one member; returns false when the form is not on the page. */
export function fillBankForm(prefill: Prefill): boolean {
  const form = findBankForm();
  const player = form?.querySelector<HTMLInputElement>(PLAYER_FIELD);
  const amount = form ? amountField(form) : null;
  if (!form || !player || !amount) {
    log("bank: form not found", { form, player, amount });
    return false;
  }

  chooseBalance(form);
  const fill = (): void => {
    fillField(player, prefill.label);
    fillField(amount, String(prefill.amount));
  };
  fill();

  // Do not drop the retries: Torn's own render can land after the fill and wipe it.
  for (const delay of REFILL_DELAYS_MS) {
    setTimeout(() => {
      if (player.isConnected && player.value === "") fill();
    }, delay);
  }
  return true;
}

/** Says whether the form still holds what was filled in, so a hand-edited form is not counted. */
function stillMatches(form: HTMLElement, prefill: Prefill): boolean {
  const player = form.querySelector<HTMLInputElement>(PLAYER_FIELD)?.value ?? "";
  const amount = (amountField(form)?.value ?? "").replace(/\D+/g, "");
  return player.includes(`[${prefill.memberId}]`) && amount === String(prefill.amount);
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
      const form = findBankForm();
      const button = form ? sendButton(form) : null;
      if (!form || !button || !(event.target instanceof Node) || !button.contains(event.target)) return;

      const prefill = current();
      if (!prefill) return;
      if (!stillMatches(form, prefill)) {
        log("bank: form was changed by hand, not counting this send", prefill);
        return;
      }
      onSent(prefill);
    },
    true,
  );
}
