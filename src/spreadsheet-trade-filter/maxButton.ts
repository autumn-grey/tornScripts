import { log } from "./debug";
import { QTY_INPUT, type TradeRow } from "./items";
import { HAS_MAX_CLASS, MAX_BUTTON_CLASS, QTY_WRAP_CLASS } from "./styles";

/** Puts an amount in the quantity box the way typing it would. */
function fillQuantity(input: HTMLInputElement, amount: number): void {
  const value = String(amount);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;

  // Do not focus the box: on a phone that raises the keyboard over the list.
  if (setter) setter.call(input, value);
  else input.value = value;

  input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "0" }));
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "0" }));
  input.dispatchEvent(new Event("change", { bubbles: true }));

  log("filled quantity", { amount });
}

/** The element the button is placed against. */
function placementTarget(input: HTMLInputElement): HTMLElement {
  const parent = input.parentElement;
  if (!parent) return input;
  // A wrapper holding nothing but the box is part of the box, so go outside it.
  return parent.children.length === 1 ? parent : input;
}

/** Sizes the button to stand exactly as tall as the quantity box. */
function matchHeight(button: HTMLButtonElement, input: HTMLInputElement): void {
  const height = input.offsetHeight;
  if (!height) return;

  button.style.height = `${height}px`;
  button.style.lineHeight = `${height - 2}px`;
}

/** The label for a button that fills in this many. */
function describe(amount: number): string {
  return `Fill the box with all ${amount.toLocaleString("en-US")}.`;
}

/** The row's quantity box as it stands now. */
function currentInput(input: HTMLInputElement, row: HTMLElement): HTMLInputElement | null {
  // Torn redraws rows, which leaves the box we were built against detached.
  if (input.isConnected) return input;
  return row.querySelector<HTMLInputElement>(QTY_INPUT);
}

/** Builds a max button for one quantity box. */
function buildButton(
  input: HTMLInputElement,
  amount: number,
  row: HTMLElement,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "MAX";
  button.className = `torn-btn ${MAX_BUTTON_CLASS}`;
  button.dataset.stfAmount = String(amount);
  button.title = describe(amount);

  matchHeight(button, input);

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    const target = currentInput(input, row);
    if (!target) return;

    fillQuantity(target, Number(button.dataset.stfAmount ?? amount));
  });

  return button;
}

/** Puts the button immediately to the left of the quantity box. */
function place(button: HTMLButtonElement, input: HTMLInputElement, row: HTMLElement): void {
  const wrapper = placementTarget(input);

  // Do not remove: the button hangs off the quantity box rather than sitting
  // in the row, because the action column has no room for a second control
  // and anything taller than its text centres against the wrong box.
  if (wrapper !== input) {
    wrapper.classList.add(QTY_WRAP_CLASS);
    wrapper.appendChild(button);
    row.classList.add(HAS_MAX_CLASS);
    return;
  }

  button.style.display = "inline-block";
  button.style.verticalAlign = "middle";
  button.style.marginRight = "4px";
  input.insertAdjacentElement("beforebegin", button);
}

/** Gives one row a max button, or updates the one it has. */
export function installMaxButton(row: TradeRow): void {
  const { qtyInput, amount } = row;
  if (!qtyInput || amount === null) return;

  const existing = row.element.querySelector<HTMLButtonElement>(`.${MAX_BUTTON_CLASS}`);
  if (existing) {
    if (existing.dataset.stfAmount !== String(amount)) {
      existing.dataset.stfAmount = String(amount);
      existing.title = describe(amount);
    }
    return;
  }

  place(buildButton(qtyInput, amount, row.element), qtyInput, row.element);
}
