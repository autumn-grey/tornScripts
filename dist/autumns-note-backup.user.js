// ==UserScript==
// @name         Autumn's Note Backup
// @namespace    https://github.com/autumn-grey
// @version      1.0.1
// @description  Keeps a copy of every Torn note you open or edit in your browser, so a deleted or overwritten note can be brought back
// @author       AutumnGrey
// @license      MIT
// @match        https://www.torn.com/*
// @grant        none
// @run-at       document-idle
// @noframes     true
// @downloadURL  https://raw.githubusercontent.com/autumn-grey/tornScripts/main/dist/autumns-note-backup.user.js
// @updateURL    https://raw.githubusercontent.com/autumn-grey/tornScripts/main/dist/autumns-note-backup.user.js
// ==/UserScript==

"use strict";
(() => {
  // src/autumns-note-backup/debug.ts
  var DEBUG_KEY = "ANB_DEBUG";
  function debugging() {
    try {
      return localStorage.getItem(DEBUG_KEY) === "1";
    } catch {
      return false;
    }
  }
  function log(...parts) {
    if (!debugging()) return;
    console.log("[ANB]", ...parts);
  }

  // src/autumns-note-backup/store.ts
  var DB_NAME = "autumns-note-backup";
  var STORE = "versions";
  var REASONS = ["opened", "edited", "deleted", "restored"];
  var opened = null;
  function database() {
    opened ?? (opened = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        store.createIndex("note", "note");
        store.createIndex("title", "title");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }));
    return opened;
  }
  async function run(mode, work) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = work(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request ? request.result : void 0);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error("aborted"));
    });
  }
  function addVersion(version) {
    return run("readwrite", (store) => store.add(version));
  }
  function putVersion(version) {
    return run("readwrite", (store) => store.put(version));
  }
  async function allVersions() {
    const all = await run("readonly", (store) => store.getAll());
    return all.sort((a, b) => b.saved - a.saved);
  }
  async function versionsOf(note) {
    const list = await run("readonly", (store) => store.index("note").getAll(note));
    return list.sort((a, b) => b.saved - a.saved);
  }
  async function latestWithTitle(title) {
    const list = await run("readonly", (store) => store.index("title").getAll(title));
    return list.sort((a, b) => b.saved - a.saved)[0];
  }
  async function prune(note, keep) {
    const extra = (await versionsOf(note)).slice(keep);
    if (extra.length === 0) return;
    await run("readwrite", (store) => {
      for (const version of extra) if (version.id !== void 0) store.delete(version.id);
    });
  }
  function isVersion(value) {
    if (typeof value !== "object" || value === null) return false;
    const v = value;
    return typeof v.note === "string" && typeof v.title === "string" && typeof v.body === "string" && typeof v.saved === "number" && REASONS.includes(v.reason);
  }
  async function importVersions(values) {
    const have = new Set((await allVersions()).map((v) => `${v.note}
${v.saved}
${v.body}`));
    const fresh = [];
    for (const value of values) {
      if (!isVersion(value)) continue;
      const id = `${value.note}
${value.saved}
${value.body}`;
      if (have.has(id)) continue;
      have.add(id);
      fresh.push({ note: value.note, title: value.title, body: value.body, saved: value.saved, reason: value.reason });
    }
    if (fresh.length > 0) {
      await run("readwrite", (store) => {
        for (const version of fresh) store.add(version);
      });
    }
    return fresh.length;
  }

  // src/autumns-note-backup/notes.ts
  var SELECTORS = {
    panel: "#notes_panel",
    // The header is itself a button: icon, "Notes", minimise, maximise.
    header: "#notes_panel > button",
    minimize: '[class*="minimizeIcon___"]',
    title: '#notes_panel input[class*="title___"]',
    body: '#notes_panel textarea[class*="text___"]',
    // The cross beside the note picker, which deletes the open note.
    remove: '#notes_panel [class*="menu___"] > button',
    // The note picker's entries.
    pick: '#notes_panel [class*="list___"] [class*="item___"]'
  };
  var TYPING_PAUSE_MS = 1500;
  var CHECK_MS = 700;
  var FOLD_MS = 6e4;
  var FOLD_LOSS = 20;
  var KEEP = 300;
  var open = null;
  var opening = false;
  var candidate = null;
  var pending = null;
  var pendingTimer = 0;
  var latest = /* @__PURE__ */ new Map();
  var chain = Promise.resolve();
  function enqueue(step) {
    chain = chain.then(step).catch((error) => log("save failed", error));
    return chain;
  }
  function readFields() {
    const title = document.querySelector(SELECTORS.title);
    const body = document.querySelector(SELECTORS.body);
    if (!title || !body) return null;
    return { title: title.value, body: body.value };
  }
  function newKey() {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }
  function removed(before, after) {
    const most = Math.min(before.length, after.length);
    let start2 = 0;
    while (start2 < most && before[start2] === after[start2]) start2++;
    let end = 0;
    while (end < most - start2 && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
    return before.length - start2 - end;
  }
  async function write(snap, reason) {
    if (snap.body.trim() === "") return;
    const known = latest.get(snap.key);
    if (known && known.body === snap.body && known.title === snap.title) return;
    const now = Date.now();
    const fold = reason === "edited" && known?.reason === "edited" && known.started !== void 0 && now - known.started < FOLD_MS && removed(known.body, snap.body) <= FOLD_LOSS;
    const version = { note: snap.key, title: snap.title, body: snap.body, saved: now, reason };
    if (fold && known) {
      await putVersion({ ...version, id: known.id });
      latest.set(snap.key, { ...known, title: snap.title, body: snap.body });
      log("folded into", known.id, snap.title);
      return;
    }
    const id = await addVersion(version);
    latest.set(snap.key, { id, title: snap.title, body: snap.body, reason, started: now });
    log("saved", reason, id, snap.title);
    await prune(snap.key, KEEP);
  }
  function flush() {
    window.clearTimeout(pendingTimer);
    const snap = pending;
    pending = null;
    return snap ? enqueue(() => write(snap, "edited")) : chain;
  }
  function backup(reason) {
    void flush();
    const fields = readFields();
    if (!open || !fields || opening) return chain;
    const snap = { ...open, ...fields };
    return enqueue(async () => {
      await write(snap, reason);
      const known = latest.get(snap.key);
      if (known) delete known.started;
    });
  }
  function noteOpened(fields) {
    opening = true;
    void enqueue(async () => {
      try {
        const key = (await latestWithTitle(fields.title))?.note ?? newKey();
        if (!latest.has(key)) {
          const newest = (await versionsOf(key))[0];
          if (newest?.id !== void 0) {
            latest.set(key, { id: newest.id, title: newest.title, body: newest.body, reason: newest.reason });
          }
        }
        open = { key, ...fields };
        await write(open, "opened");
      } finally {
        opening = false;
      }
    });
  }
  function check() {
    if (document.hidden || opening) return;
    const fields = readFields();
    if (!fields) return;
    if (open && fields.title === open.title && fields.body === open.body) {
      candidate = null;
      return;
    }
    if (!candidate || candidate.title !== fields.title || candidate.body !== fields.body) {
      candidate = fields;
      return;
    }
    candidate = null;
    void flush();
    noteOpened(fields);
  }
  function onInput(event) {
    const target = event.target;
    if (!(target instanceof Element) || !target.matches(`${SELECTORS.title}, ${SELECTORS.body}`)) return;
    if (!open || opening) return;
    const fields = readFields();
    if (!fields) return;
    open = { ...open, ...fields };
    candidate = null;
    pending = { ...open };
    window.clearTimeout(pendingTimer);
    pendingTimer = window.setTimeout(() => void flush(), TYPING_PAUSE_MS);
  }
  function onPress(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest(SELECTORS.remove)) void backup("deleted");
    else if (target.closest(SELECTORS.pick)) void flush();
  }
  function watchNotes() {
    document.addEventListener("input", onInput, true);
    document.addEventListener("pointerdown", onPress, true);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) void flush();
    });
    window.addEventListener("pagehide", () => void flush());
    window.setInterval(check, CHECK_MS);
    check();
  }
  function replaceValue(field, text) {
    if (field.value === text) return;
    field.focus({ preventScroll: true });
    field.select();
    const done = text === "" ? document.execCommand("delete") : document.execCommand("insertText", false, text);
    if (!done) {
      const proto = field instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(field, text);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
  async function restore(version) {
    const title = document.querySelector(SELECTORS.title);
    const body = document.querySelector(SELECTORS.body);
    if (!title || !body) return false;
    await backup("restored");
    replaceValue(title, version.title);
    replaceValue(body, version.body);
    body.blur();
    const restored = { key: version.note, title: title.value, body: body.value };
    open = restored;
    candidate = null;
    window.clearTimeout(pendingTimer);
    pending = null;
    await enqueue(async () => {
      if (!latest.has(restored.key) && version.id !== void 0) {
        latest.set(restored.key, { id: version.id, title: version.title, body: version.body, reason: version.reason });
      }
      await write(restored, "edited");
    });
    return true;
  }
  function noteIsOpen() {
    return document.querySelector(SELECTORS.body) !== null;
  }
  function pickerTitles() {
    const items = document.querySelectorAll(SELECTORS.pick);
    if (items.length === 0) return null;
    return new Set(Array.from(items, (item) => item.textContent?.trim() ?? ""));
  }

  // src/autumns-note-backup/panel.ts
  var ICON_ID = "anb-icon";
  var PANEL_ID = "anb-panel";
  var DOODLE_ICON_ID = "doodle-icon";
  var REASON_LABELS = {
    opened: "Opened",
    edited: "Edited",
    deleted: "Before delete",
    restored: "Before restore"
  };
  var FLASH_MS = 2500;
  var panel = null;
  var selectedNote = null;
  var selectedVersion = null;
  var groups = [];
  function when(ms) {
    return new Date(ms).toLocaleString(void 0, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }
  function make(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== void 0) element.textContent = text;
    return element;
  }
  function button(label, onPress2) {
    const element = make("button", "torn-btn anb-btn", label);
    element.type = "button";
    element.addEventListener("click", () => onPress2(element));
    return element;
  }
  function flash(target, text) {
    const label = target.dataset.label ?? target.textContent ?? "";
    target.dataset.label = label;
    target.textContent = text;
    window.setTimeout(() => {
      target.textContent = label;
      delete target.dataset.armed;
    }, FLASH_MS);
  }
  function currentVersion() {
    return groups.find((g) => g.key === selectedNote)?.versions.find((v) => v.id === selectedVersion);
  }
  function group(all) {
    const byKey = /* @__PURE__ */ new Map();
    for (const version of all) {
      const found = byKey.get(version.note);
      if (found) found.versions.push(version);
      else byKey.set(version.note, { key: version.note, title: version.title, versions: [version] });
    }
    return [...byKey.values()];
  }
  async function refresh() {
    if (!panel) return;
    await flush();
    groups = group(await allVersions());
    if (!groups.some((g) => g.key === selectedNote)) selectedNote = groups[0]?.key ?? null;
    const versions = groups.find((g) => g.key === selectedNote)?.versions ?? [];
    if (!versions.some((v) => v.id === selectedVersion)) selectedVersion = versions[0]?.id ?? null;
    render();
  }
  function render() {
    if (!panel) return;
    const notesList = panel.querySelector(".anb-notes");
    const versionList = panel.querySelector(".anb-versions");
    const preview = panel.querySelector(".anb-preview");
    if (!notesList || !versionList || !preview) return;
    const inTorn = pickerTitles();
    notesList.replaceChildren();
    if (groups.length === 0) notesList.append(make("div", "anb-empty", "No backups yet"));
    for (const note of groups) {
      const row = make("div", "anb-row");
      row.classList.toggle("anb-chosen", note.key === selectedNote);
      row.append(make("div", "anb-row-title", note.title || "Untitled"));
      const newest = note.versions[0];
      const count = `${note.versions.length} ${note.versions.length === 1 ? "version" : "versions"}`;
      row.append(make("div", "anb-row-meta", newest ? `${count} · ${when(newest.saved)}` : count));
      if (inTorn && !inTorn.has(note.title)) row.append(make("div", "anb-tag", "Not in Notes"));
      row.addEventListener("click", () => {
        if (window.getSelection()?.toString()) return;
        selectedNote = note.key;
        selectedVersion = note.versions[0]?.id ?? null;
        render();
      });
      notesList.append(row);
    }
    const versions = groups.find((g) => g.key === selectedNote)?.versions ?? [];
    versionList.replaceChildren();
    for (const version of versions) {
      const row = make("div", "anb-row");
      row.classList.toggle("anb-chosen", version.id === selectedVersion);
      row.append(make("div", "anb-row-title", when(version.saved)));
      const words = `${REASON_LABELS[version.reason]} · ${version.body.length.toLocaleString()} characters`;
      row.append(make("div", "anb-row-meta", words));
      row.addEventListener("click", () => {
        if (window.getSelection()?.toString()) return;
        selectedVersion = version.id ?? null;
        render();
      });
      versionList.append(row);
    }
    preview.value = currentVersion()?.body ?? "";
    const restore2 = panel.querySelector(".anb-restore");
    if (restore2) restore2.disabled = !currentVersion() || !noteIsOpen();
  }
  async function exportAll(target) {
    const versions = (await allVersions()).map(({ id: _id, ...rest }) => rest);
    const file = new Blob([JSON.stringify({ script: "Autumn's Note Backup", exported: Date.now(), versions }, null, 2)], {
      type: "application/json"
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(file);
    link.download = `torn-notes-backup-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1e4);
    flash(target, `Saved ${versions.length}`);
  }
  function importFile(target) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        const list = parsed.versions;
        if (!Array.isArray(list)) throw new Error("no versions in the file");
        const added = await importVersions(list);
        flash(target, `Added ${added}`);
        await refresh();
      } catch (error) {
        log("import failed", error);
        flash(target, "Not a backup file");
      }
    });
    input.click();
  }
  async function copyVersion(target) {
    const version = currentVersion();
    if (!version) return;
    try {
      await navigator.clipboard.writeText(version.body);
      flash(target, "Copied");
    } catch (error) {
      log("copy failed", error);
      flash(target, "Copy failed");
    }
  }
  async function restoreVersion(target) {
    const version = currentVersion();
    if (!version) return;
    if (target.dataset.armed !== "1") {
      target.dataset.armed = "1";
      flash(target, "Replace open note?");
      return;
    }
    delete target.dataset.armed;
    if (await restore(version)) {
      flash(target, "Restored");
      await refresh();
    } else {
      flash(target, "Open a note first");
    }
  }
  function buildPanel() {
    const backdrop = make("div", "");
    backdrop.id = PANEL_ID;
    backdrop.hidden = true;
    const box = make("div", "anb-box");
    backdrop.append(box);
    const head = make("div", "anb-head");
    head.append(make("div", "anb-heading", "Note backups"));
    const exportButton = button("Export", (self) => void exportAll(self));
    const importButton = button("Import", importFile);
    const close = button("Close", hidePanel);
    head.append(exportButton, importButton, close);
    const main = make("div", "anb-main");
    const preview = make("textarea", "anb-preview");
    preview.readOnly = true;
    preview.spellcheck = false;
    main.append(make("div", "anb-list anb-notes"), make("div", "anb-list anb-versions"), preview);
    const foot = make("div", "anb-foot");
    const restore2 = button("Restore", (self) => void restoreVersion(self));
    restore2.classList.add("anb-restore");
    foot.append(button("Copy", (self) => void copyVersion(self)), restore2);
    box.append(head, main, foot);
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) hidePanel();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !backdrop.hidden) hidePanel();
    });
    document.body.append(backdrop);
    return backdrop;
  }
  function showPanel() {
    panel ?? (panel = buildPanel());
    panel.hidden = false;
    void refresh();
  }
  function hidePanel() {
    if (panel) panel.hidden = true;
  }
  function buildIcon() {
    const icon = document.createElement("span");
    icon.id = ICON_ID;
    icon.setAttribute("role", "button");
    icon.setAttribute("aria-label", "Note backups");
    icon.title = "Note backups";
    icon.tabIndex = 0;
    const minimize = document.querySelector(`${SELECTORS.header} ${SELECTORS.minimize} g[fill]`);
    const paint = minimize?.getAttribute("fill") ?? "currentColor";
    icon.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><g fill="${paint}">
<path d="M13 3a9 9 0 0 0-9 9H1l4 4 4-4H6a7 7 0 1 1 2.05 4.95l-1.42 1.42A9 9 0 1 0 13 3Zm-1 5v5l4.25 2.52.77-1.28-3.52-2.09V8Z"/>
</g></svg>`;
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
      icon.addEventListener(type, (event) => event.stopPropagation());
    }
    const open2 = (event) => {
      event.preventDefault();
      event.stopPropagation();
      showPanel();
    };
    icon.addEventListener("click", open2);
    icon.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") open2(event);
    });
    return icon;
  }
  function placeIcon() {
    const header = document.querySelector(SELECTORS.header);
    if (!header) return;
    const icon = document.getElementById(ICON_ID) ?? buildIcon();
    const anchor = header.querySelector(`#${DOODLE_ICON_ID}`) ?? header.querySelector(SELECTORS.minimize);
    if (!anchor) {
      if (icon.parentElement !== header) header.append(icon);
      return;
    }
    const before = icon.parentElement === anchor.parentElement && !!(icon.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (!before) anchor.before(icon);
  }
  function installPanel() {
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        placeIcon();
      });
    }).observe(document.body, { childList: true, subtree: true });
    placeIcon();
  }

  // src/autumns-note-backup/styles.ts
  var STYLE_ID = "anb-styles";
  var CSS = `
  #${ICON_ID} {
    display: inline-flex;
    align-items: center;
    margin: 0 6px 0 14px;
    opacity: 0.9;
    cursor: pointer;
  }
  #${ICON_ID}:hover {
    opacity: 1;
  }
  #${PANEL_ID} {
    position: fixed;
    inset: 0;
    z-index: 2147483100;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    color: #fff !important;
  }
  #${PANEL_ID}[hidden] {
    display: none;
  }
  #${PANEL_ID} .anb-box * {
    color: inherit !important;
  }
  #${PANEL_ID} .anb-box {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    width: min(960px, calc(100vw - 32px));
    height: min(600px, calc(100vh - 32px));
    background: #2e2e2e;
    border: 1px solid #555;
    border-radius: 5px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
    overflow: hidden;
  }
  #${PANEL_ID} .anb-head,
  #${PANEL_ID} .anb-foot {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: linear-gradient(180deg, #4e565e 0%, #303840 100%);
  }
  #${PANEL_ID} .anb-foot {
    justify-content: flex-end;
  }
  #${PANEL_ID} .anb-heading {
    flex: 1;
    font-weight: bold;
    font-size: 13px;
    text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
  }
  #${PANEL_ID} .torn-btn.anb-btn {
    height: 28px;
    line-height: 28px;
    padding: 0 12px;
  }
  #${PANEL_ID} .anb-main {
    flex: 1;
    display: grid;
    grid-template-columns: 220px 220px 1fr;
    min-height: 0;
  }
  #${PANEL_ID} .anb-list {
    overflow-y: auto;
    border-right: 1px solid #444;
  }
  #${PANEL_ID} .anb-row {
    padding: 6px 10px;
    border-bottom: 1px solid #3a3a3a;
    cursor: pointer;
  }
  #${PANEL_ID} .anb-row:hover {
    background: #383838;
  }
  #${PANEL_ID} .anb-row.anb-chosen {
    background: #44515c;
  }
  #${PANEL_ID} .anb-row-title {
    font-weight: bold;
    overflow-wrap: anywhere;
  }
  #${PANEL_ID} .anb-row-meta {
    margin-top: 2px;
    color: #bbb !important;
  }
  #${PANEL_ID} .anb-tag {
    margin-top: 3px;
    color: #f0b35a !important;
  }
  #${PANEL_ID} .anb-empty {
    padding: 10px;
    color: #bbb !important;
  }
  #${PANEL_ID} .anb-preview {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 10px;
    border: 0;
    resize: none;
    background: #262626;
    color: #fff !important;
    font: 13px/1.4 Arial, Helvetica, sans-serif;
    white-space: pre-wrap;
  }
  /* Torn's mobile layout: the columns stack. */
  @media (max-width: 784px) {
    #${PANEL_ID} .anb-main {
      grid-template-columns: 1fr;
      grid-template-rows: 1fr 1fr 2fr;
    }
    #${PANEL_ID} .anb-list {
      border-right: 0;
      border-bottom: 1px solid #444;
    }
  }
`;
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.append(style);
  }

  // src/autumns-note-backup/index.ts
  function start() {
    try {
      injectStyles();
      installPanel();
      watchNotes();
    } catch (error) {
      log("failed to start", error);
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
