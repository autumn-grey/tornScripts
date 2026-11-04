// ==UserScript==
// @name         Everything is E
// @namespace    https://github.com/autumn-grey
// @version      1.1.0
// @description  Capitalises every letter E in a Torn chat message at the moment you send it, randomly doubles or triples some of them, turns the odd W into WICKAWICKAWOO, and links the word Faith.
// @author       AutumnGrey
// @license      MIT
// @match        https://www.torn.com/*
// @grant        none
// @run-at       document-start
// @noframes     true
// @downloadURL  https://raw.githubusercontent.com/autumn-grey/tornScripts/main/dist/everything-is-e.user.js
// @updateURL    https://raw.githubusercontent.com/autumn-grey/tornScripts/main/dist/everything-is-e.user.js
// ==/UserScript==

"use strict";
(() => {
  // src/everything-is-e/index.ts
  var SELECTORS = {
    // Where Torn mounts the chat panel.
    chatRoot: "#chatRoot",
    // The message box itself. Chat messages are typed into a textarea; the
    // user-search fields in the same panel are <input>, so they are left alone.
    chatInput: 'textarea[class*="chat-box-input" i], textarea[class*="chatBoxInput" i]',
    // A chat box, i.e. the smallest container holding one message box.
    chatBox: '[class*="chat-box" i], [class*="chatBox" i]',
    // The send control, where the layout has one (mobile, mostly).
    sendButton: [
      '[class*="chat-box-send" i]',
      '[class*="chatBoxSend" i]',
      'button[aria-label*="send" i]'
    ].join(", ")
  };
  var DEBUG_KEY = "EIE_DEBUG";
  function debugging() {
    try {
      return localStorage.getItem(DEBUG_KEY) === "1";
    } catch {
      return false;
    }
  }
  function log(...parts) {
    if (!debugging()) return;
    console.log("[EIE]", ...parts);
  }
  function isChatInput(node) {
    if (!(node instanceof HTMLTextAreaElement)) return false;
    if (node.matches(SELECTORS.chatInput)) return true;
    return node.closest(SELECTORS.chatRoot) !== null;
  }
  function setValue(field, value) {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    )?.set;
    if (setter) setter.call(field, value);
    else field.value = value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }
  var DOUBLE_CHANCE = 0.2;
  var TRIPLE_CHANCE = 0.05;
  var WICKA_CHANCE = 0.01;
  var WICKA = "WICKAWICKAWOO";
  function copies() {
    const roll = Math.random();
    if (roll < TRIPLE_CHANCE) return 3;
    if (roll < TRIPLE_CHANCE + DOUBLE_CHANCE) return 2;
    return 1;
  }
  var FAITH_WORD = /^faith\b/i;
  var FAITH_URL = "https://tenor.com/view/dancing-break-down-shimmy-shake-it-dance-gif-2509261177228165217";
  var FAITH_FORM = "html";
  function faithLink() {
    if (FAITH_FORM === "url") return FAITH_URL;
    if (FAITH_FORM === "both") return `Faith ${FAITH_URL}`;
    if (FAITH_FORM === "bbcode") return `[url=${FAITH_URL}]Faith[/url]`;
    return `<a href="${FAITH_URL}">Faith</a>`;
  }
  var URL_RUN = /^https?:\/\/\S+/i;
  function rewrite(text, offsets, limit) {
    const out = [];
    let length = 0;
    const moved = offsets.map(() => 0);
    let i = 0;
    while (i < text.length) {
      const rest = text.slice(i);
      const remaining = text.length - i - 1;
      const room = Math.max(1, limit - length - remaining);
      const emit = (piece, consumed) => {
        offsets.forEach((offset, n) => {
          if (offset >= i && offset < i + consumed) moved[n] = length;
        });
        out.push(piece);
        length += piece.length;
        i += consumed;
      };
      const url = URL_RUN.exec(rest);
      if (url) {
        emit(url[0], url[0].length);
        continue;
      }
      if (FAITH_WORD.test(rest)) {
        const link = faithLink();
        const fits = limit - length - remaining >= link.length;
        emit(fits ? link : rest.slice(0, 5), 5);
        continue;
      }
      const char = rest[0];
      if (char === "w" || char === "W") {
        const wicka = Math.random() < WICKA_CHANCE && room >= WICKA.length;
        emit(wicka ? WICKA : char, 1);
        continue;
      }
      if (char !== "e" && char !== "E") {
        emit(char, 1);
        continue;
      }
      emit("E".repeat(Math.min(copies(), room)), 1);
    }
    offsets.forEach((offset, n) => {
      if (offset >= text.length) moved[n] = length;
    });
    return { text: out.join(""), offsets: moved };
  }
  function capitalise(field) {
    const before = field.value;
    const start = field.selectionStart ?? before.length;
    const end = field.selectionEnd ?? start;
    const limit = field.maxLength > 0 ? field.maxLength : Infinity;
    const result = rewrite(before, [start, end], limit);
    if (result.text === before) return;
    setValue(field, result.text);
    field.setSelectionRange(
      result.offsets[0] ?? result.text.length,
      result.offsets[1] ?? result.text.length,
      field.selectionDirection ?? "none"
    );
    log("rewrote", JSON.stringify(before), "->", JSON.stringify(result.text));
  }
  function inputForSendButton(button) {
    let scope = button.closest(SELECTORS.chatBox);
    while (scope) {
      const field = scope.querySelector(SELECTORS.chatInput);
      if (isChatInput(field)) return field;
      scope = scope.parentElement?.closest(SELECTORS.chatBox) ?? null;
    }
    const active = document.activeElement;
    return isChatInput(active) ? active : null;
  }
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
      if (!isChatInput(event.target)) return;
      capitalise(event.target);
    },
    true
  );
  for (const type of ["mousedown", "touchstart"]) {
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
      true
    );
  }
  log("watching for sends");
})();
