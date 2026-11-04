// Everything is E
//
// Capitalises every letter E in a Torn chat message at the moment you send
// it, and lets some of them run on, so what goes out reads likE thiEEs. Each
// E has a 20% chance of doubling and a 5% chance of tripling, and each W a
// 5% chance of becoming WICKAWICKAWOO. A few words are swapped on the way
// out - opa and oaf trade places, ag becomes Real Blaffle, and the, you and
// are go olde - and the word Faith goes out as a link to a dancing gif. The
// box stays as you typed it until you send.
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

// How often a W gets carried away instead. Rolled per letter, like the E.
const WICKA_CHANCE = 0.05;
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

/**
 * Whole words that come out as something else.
 *
 * Matched in order, case-insensitively, and only at the start of a word, so
 * "again" keeps its ag and "there" keeps its the. A swapped word is not
 * looked at again, which is what lets opa and oaf trade places in one pass
 * instead of chasing each other. `follow` keeps the case the writer used on
 * the first letter; without it the replacement goes in as written here.
 */
const WORD_RULES: ReadonlyArray<{
  match: RegExp;
  to: string;
  follow?: boolean;
}> = [
  { match: /^opa\b/i, to: "Oaf" },
  { match: /^oaf\b/i, to: "Opa" },
  // One way only: Real Blaffle never goes back to ag.
  { match: /^ag\b/i, to: "Real Blaffle" },
  { match: /^the\b/i, to: "ye", follow: true },
  { match: /^you\b/i, to: "thou", follow: true },
  { match: /^are\b/i, to: "art", follow: true },
];

// Anything already a link is left exactly as typed: capitalising the E's in
// a URL breaks it.
const URL_RUN = /^https?:\/\/\S+/i;

const WORD_CHAR = /[A-Za-z0-9_]/;

/** Whether offset i in text begins a word, rather than sitting inside one. */
function atWordStart(text: string, i: number): boolean {
  if (i === 0) return true;
  return !WORD_CHAR.test(text[i - 1] as string);
}

/** The replacement, carrying the case the writer used on the first letter. */
function cased(matched: string, to: string, follow: boolean): string {
  if (!follow) return to;
  const upper = (matched[0] as string) !== (matched[0] as string).toLowerCase();
  if (!upper) return to;
  return (to[0] as string).toUpperCase() + to.slice(1);
}

/**
 * Applies the per-letter rolls to a run of text: every E capitalised, some
 * doubled or tripled, the odd W carried away.
 *
 * `allowance` is how many characters this run may grow by in total, so a
 * message cannot be pushed past the length the box accepts.
 */
function rolls(piece: string, allowance: number): string {
  const out: string[] = [];
  let extra = Math.max(0, allowance);

  for (const char of piece) {
    if (char === "w" || char === "W") {
      // All or nothing: a clipped WICKAWICK reads like a bug, not a joke.
      const growth = WICKA.length - 1;
      if (Math.random() < WICKA_CHANCE && extra >= growth) {
        out.push(WICKA);
        extra -= growth;
      } else {
        out.push(char);
      }
      continue;
    }

    if (char !== "e" && char !== "E") {
      out.push(char);
      continue;
    }

    // One E always goes in; the extras only if there is room for them.
    const count = Math.min(copies(), 1 + extra);
    out.push("E".repeat(count));
    extra -= count - 1;
  }

  return out.join("");
}

/**
 * Rewrites a message: words swapped, every E capitalised and some doubled or
 * tripled, the odd W carried away, and the word Faith turned into a link.
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
    // Every character after this position needs a place of its own, so what
    // is left over is all this position has to spend.
    const remaining = text.length - i - 1;
    const space = limit - length - remaining;

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

    if (atWordStart(text, i)) {
      // Faith becomes the link, as long as the link fits. The link goes in
      // untouched: rolling the E's in its href would break it.
      if (FAITH_WORD.test(rest)) {
        const link = faithLink();
        if (space >= link.length) {
          emit(link, 5);
          continue;
        }
        emit(rolls(rest.slice(0, 5), space - 5), 5);
        continue;
      }

      const rule = WORD_RULES.find((candidate) => candidate.match.test(rest));
      if (rule) {
        const matched = (rule.match.exec(rest) as RegExpExecArray)[0];
        const word = cased(matched, rule.to, rule.follow ?? false);
        // The swap has to fit before anything in it can be rolled.
        const fits = space >= word.length;
        const piece = fits ? word : matched;
        emit(rolls(piece, space - piece.length), matched.length);
        continue;
      }
    }

    emit(rolls(rest[0] as string, space - 1), 1);
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
