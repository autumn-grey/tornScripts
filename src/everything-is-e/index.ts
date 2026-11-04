// Everything is E
//
// Capitalises every letter E in a Torn chat message at the moment you send
// it, and lets some of them run on, so what goes out reads likE thiEEs. Each
// E has a 20% chance of doubling and a 5% chance of tripling, and each W a
// 1% chance of becoming WICKAWICKAWOO. The word Faith goes out as a link to
// a dancing gif. The box stays as you typed it until you send.
//
// Display layer only: the rewrite rides along with your own Enter or your
// own click on send — nothing is submitted for you.

// Every selector this script matches on. Torn's class names are hashed and
// change between deploys, so match on structure and stable prefixes.
const SELECTORS = {
  // Where Torn mounts the chat panel.
  chatRoot: "#chatRoot",
  // The message box itself. Chat messages are typed into a textarea; the
  // user-search fields in the same panel are <input>, so they are left alone.
  chatInput:
    'textarea[class*="chat-box-input" i], textarea[class*="chatBoxInput" i]',
  // A chat box, i.e. the smallest container holding one message box.
  chatBox: '[class*="chat-box" i], [class*="chatBox" i]',
  // The send control, where the layout has one (mobile, mostly).
  sendButton: [
    '[class*="chat-box-send" i]',
    '[class*="chatBoxSend" i]',
    'button[aria-label*="send" i]',
  ].join(", "),
};

const DEBUG_KEY = "EIE_DEBUG";

/** Whether diagnostic logging is switched on. */
function debugging(): boolean {
  try {
    return localStorage.getItem(DEBUG_KEY) === "1";
  } catch {
    return false;
  }
}

/** Writes a diagnostic line to the console. */
function log(...parts: unknown[]): void {
  if (!debugging()) return;
  // Do not use console.debug: Chrome hides it unless Verbose is enabled.
  console.log("[EIE]", ...parts);
}

/**
 * Whether this element is a chat message box.
 *
 * Accepts the hashed-class match, and anything inside the chat panel, so a
 * class rename on Torn's side does not switch the script off.
 */
function isChatInput(node: unknown): node is HTMLTextAreaElement {
  if (!(node instanceof HTMLTextAreaElement)) return false;
  if (node.matches(SELECTORS.chatInput)) return true;
  return node.closest(SELECTORS.chatRoot) !== null;
}

/**
 * Writes a value back to a React-controlled field.
 *
 * Assigning to .value alone leaves React's own copy of the state behind, and
 * it overwrites the box again on the next render. Going through the prototype
 * setter and re-firing the event is how React is told what changed. The
 * event is dispatched synchronously and input is a discrete event, so React
 * has the new text before the keypress or click carries on to Torn's own
 * handler.
 */
function setValue(field: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;

  if (setter) setter.call(field, value);
  else field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

// How often a letter E comes out more than once. Rolled per letter, so a
// long message gets a scattering rather than all or nothing.
const DOUBLE_CHANCE = 0.2;
const TRIPLE_CHANCE = 0.05;

// How often a W gets carried away instead.
const WICKA_CHANCE = 0.01;
const WICKA = "WICKAWICKAWOO";

/** How many E's this one letter turns into: 3, 2, or 1. */
function copies(): number {
  const roll = Math.random();
  if (roll < TRIPLE_CHANCE) return 3;
  if (roll < TRIPLE_CHANCE + DOUBLE_CHANCE) return 2;
  return 1;
}

// The word that becomes a link, and where it points.
const FAITH_WORD = /^faith\b/i;
const FAITH_URL =
  "https://tenor.com/view/dancing-break-down-shimmy-shake-it-dance-gif-2509261177228165217";

// How the link is written into the message. Chat takes an HTML anchor, so
// that is the default; the rest are here in case a channel ever strips it.
//   "html"    <a href="...">Faith</a>
//   "bbcode"  [url=...]Faith[/url]
//   "url"     the bare link, which Torn makes clickable on its own
//   "both"    Faith followed by the bare link
const FAITH_FORM: "html" | "bbcode" | "url" | "both" = "html";

/** The text the word Faith is replaced with. */
function faithLink(): string {
  if (FAITH_FORM === "url") return FAITH_URL;
  if (FAITH_FORM === "both") return `Faith ${FAITH_URL}`;
  if (FAITH_FORM === "bbcode") return `[url=${FAITH_URL}]Faith[/url]`;
  return `<a href="${FAITH_URL}">Faith</a>`;
}

// Anything already a link is left exactly as typed: capitalising the E's in
// a URL breaks it.
const URL_RUN = /^https?:\/\/\S+/i;

/**
 * Capitalises every E in the text, doubling or tripling some of them, turns
 * the odd W into WICKAWICKAWOO, and makes the word Faith a link.
 *
 * Returns the new text and where a caret sitting at each of the given
 * offsets ends up, since the text no longer keeps its length. Nothing is
 * expanded past limit, so the message cannot be grown beyond what the box
 * accepts, and URLs pass through untouched.
 */
function rewrite(
  text: string,
  offsets: readonly number[],
  limit: number,
): { text: string; offsets: number[] } {
  const out: string[] = [];
  let length = 0;
  const moved = offsets.map(() => 0);

  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    // What is left to place after this character, one slot each. Anything
    // this position grows by has to fit in the room beyond that.
    const remaining = text.length - i - 1;
    const room = Math.max(1, limit - length - remaining);

    /** Takes `consumed` characters of input and writes `piece` instead. */
    const emit = (piece: string, consumed: number): void => {
      offsets.forEach((offset, n) => {
        if (offset >= i && offset < i + consumed) moved[n] = length;
      });
      out.push(piece);
      length += piece.length;
      i += consumed;
    };

    // A link the user typed themselves: straight through, no rolls.
    const url = URL_RUN.exec(rest);
    if (url) {
      emit(url[0], url[0].length);
      continue;
    }

    // Faith, on a word boundary, becomes the link - if the link fits.
    if (FAITH_WORD.test(rest)) {
      const link = faithLink();
      const fits = limit - length - remaining >= link.length;
      emit(fits ? link : rest.slice(0, 5), 5);
      continue;
    }

    const char = rest[0] as string;

    if (char === "w" || char === "W") {
      // All or nothing: a clipped WICKAWICK reads like a bug, not a joke.
      const wicka = Math.random() < WICKA_CHANCE && room >= WICKA.length;
      emit(wicka ? WICKA : char, 1);
      continue;
    }

    if (char !== "e" && char !== "E") {
      emit(char, 1);
      continue;
    }

    // One E always goes in; the extras only if there is room for them.
    emit("E".repeat(Math.min(copies(), room)), 1);
  }

  offsets.forEach((offset, n) => {
    if (offset >= text.length) moved[n] = length;
  });

  return { text: out.join(""), offsets: moved };
}

/** Rewrites this chat box, keeping the caret where it was. */
function capitalise(field: HTMLTextAreaElement): void {
  const before = field.value;
  const start = field.selectionStart ?? before.length;
  const end = field.selectionEnd ?? start;
  // maxLength is -1 when the box does not set one.
  const limit = field.maxLength > 0 ? field.maxLength : Infinity;

  const result = rewrite(before, [start, end], limit);
  if (result.text === before) return;

  setValue(field, result.text);

  field.setSelectionRange(
    result.offsets[0] ?? result.text.length,
    result.offsets[1] ?? result.text.length,
    field.selectionDirection ?? "none",
  );

  log("rewrote", JSON.stringify(before), "->", JSON.stringify(result.text));
}

/** The message box the send control that was clicked belongs to. */
function inputForSendButton(button: Element): HTMLTextAreaElement | null {
  // Walk out through the chat boxes until one of them holds a message box,
  // so a nested wrapper between the button and the textarea is no obstacle.
  let scope: Element | null = button.closest(SELECTORS.chatBox);
  while (scope) {
    const field = scope.querySelector(SELECTORS.chatInput);
    if (isChatInput(field)) return field;
    scope = scope.parentElement?.closest(SELECTORS.chatBox) ?? null;
  }

  // No chat box around it: fall back to the box that still has the caret.
  const active = document.activeElement;
  return isChatInput(active) ? active : null;
}

// Enter sends the message, so rewrite the text on the way down and let the
// keypress carry on untouched. Shift+Enter is a newline, not a send.
document.addEventListener(
  "keydown",
  (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    if (!isChatInput(event.target)) return;
    capitalise(event.target);
  },
  true,
);

// The send button, for layouts that have one. mousedown and touchstart both
// land before the click that sends, which leaves room for the rewrite.
for (const type of ["mousedown", "touchstart"] as const) {
  document.addEventListener(
    type,
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest(SELECTORS.sendButton);
      if (!button || !button.closest(SELECTORS.chatRoot)) return;

      const field = inputForSendButton(button);
      if (field) capitalise(field);
    },
    true,
  );
}

log("watching for sends");
