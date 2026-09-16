// The stored recipient, and putting it into Torn's send forms.

import { log } from "./debug";
import {
  RECIPIENT_LABEL,
  RECIPIENT_SETTING,
  readSetting,
  writeSetting,
} from "./settings";
import { searchUsers } from "./userSearch";

/** The line Torn heads a send form with. */
export const SEND_PROMPT = /who would you like to send/i;
/** Any box on a send form that takes typing. */
export const TEXT_FIELD_SELECTOR =
  "input[type='text'], input[type='number'], input:not([type])";
/** The recipient box on a send form. */
export const USER_FIELD_SELECTOR =
  "input[name*='user' i], input[placeholder*='user' i], input[id*='user' i]";
/** The quantity box on a send form. */
export const AMOUNT_FIELD_SELECTOR =
  "input[name*='amount' i], input[placeholder*='amount' i], input[id*='amount' i], input[type='number']";
/** Longer than this is more of the page than one send form. */
const FORM_MAX_LENGTH = 400;
/** When a filled box is checked again, in case Torn cleared it. */
const REFILL_DELAYS_MS = [150, 400, 900];

/** Returns the recipient the reader has chosen, if any. */
export function defaultRecipient(): string {
  return readSetting(RECIPIENT_SETTING, "").replace(/\D+/g, "");
}

/** Returns the recipient as Torn writes it, name and ID, where that is known. */
export function recipientText(): string {
  const id = defaultRecipient();
  if (!id) return "";
  const label = readSetting(RECIPIENT_LABEL, "").trim();
  return /\[(\d+)\]/.exec(label)?.[1] === id ? label : id;
}

/** Looks up the name for a stored bare ID, and shows it in the box. */
async function nameTheRecipient(userBox: HTMLInputElement): Promise<void> {
  const id = defaultRecipient();
  const found = (await searchUsers(id)).find((user) => user.id === id);
  if (!found) return;

  const label = `${found.name} [${found.id}]`;
  writeSetting(RECIPIENT_LABEL, label);
  if (userBox.isConnected && userBox.value === id) fillField(userBox, label);
  log("send: recipient is", label);
}

/** Puts a value into a box the way typing into it would. */
export function fillField(input: HTMLInputElement, value: string): void {
  const view = input.ownerDocument.defaultView;
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(input) as object,
    "value",
  )?.set;
  if (setter) {
    setter.call(input, value);
  } else {
    input.value = value;
  }
  const EventClass = view?.Event ?? Event;
  input.dispatchEvent(new EventClass("input", { bubbles: true }));
  input.dispatchEvent(new EventClass("change", { bubbles: true }));
}

/** Returns the send forms inside an element, innermost first. */
export function findSendForms(root: Element): Element[] {
  const forms: Element[] = [];
  const candidates = [root, ...root.querySelectorAll("*")];
  for (const node of candidates) {
    const text = node.textContent ?? "";
    if (text.length > FORM_MAX_LENGTH || !SEND_PROMPT.test(text)) continue;
    if (!node.querySelector(TEXT_FIELD_SELECTOR)) continue;
    forms.push(node);
  }
  return forms.filter(
    (form) => !forms.some((other) => other !== form && form.contains(other)),
  );
}

/** Puts the stored recipient into a send form's empty recipient box. */
export function fillRecipient(form: Element): boolean {
  const recipient = recipientText();
  if (!recipient) {
    log("send: no recipient stored, nothing to fill in");
    return false;
  }

  const boxes = Array.from(
    form.querySelectorAll<HTMLInputElement>(TEXT_FIELD_SELECTOR),
  ).filter((box) => !box.disabled && !box.readOnly);
  const userBox = form.querySelector<HTMLInputElement>(USER_FIELD_SELECTOR) ??
    boxes[0];
  if (!userBox) {
    log("send: no recipient box in", boxes.length, "boxes on this form");
    return false;
  }
  if (userBox.value !== "") return false;

  fillField(userBox, recipient);
  log("send: recipient", recipient, "into", userBox);
  if (recipient === defaultRecipient()) void nameTheRecipient(userBox);

  // Do not drop the retries: Torn's own render can land after the fill and
  // wipe it.
  for (const delay of REFILL_DELAYS_MS) {
    setTimeout(() => {
      if (userBox.isConnected && userBox.value === "") {
        fillField(userBox, recipient);
        log("send: recipient put back after Torn cleared it");
      }
    }, delay);
  }
  return true;
}
