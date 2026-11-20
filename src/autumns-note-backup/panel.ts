// The history icon in the Notes header, and the window it opens: every note
// backed up, its versions, and a preview to copy or restore from.

import { log } from "./debug";
import { backup, flush, noteIsOpen, pickerTitles, replaceBody, SELECTORS } from "./notes";
import { allVersions, importVersions, type Reason, type Version } from "./store";

export const ICON_ID = "anb-icon";
export const PANEL_ID = "anb-panel";
/** Note Doodles' icon, which keeps itself just before minimise; ours goes before it. */
const DOODLE_ICON_ID = "doodle-icon";

const REASON_LABELS: Record<Reason, string> = {
  opened: "Opened",
  edited: "Edited",
  deleted: "Before delete",
  restored: "Before restore",
};

/** How long a button shows its result, or waits for a second press, before going back. */
const FLASH_MS = 2500;

/** A note as listed: its key, newest title and versions. */
interface NoteGroup {
  key: string;
  title: string;
  versions: Version[];
}

let panel: HTMLElement | null = null;
let selectedNote: string | null = null;
let selectedVersion: number | null = null;
let groups: NoteGroup[] = [];

/** Returns a date and time short enough for a list row, in the reader's own format. */
function when(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Makes an element with a class and, optionally, text. */
function make<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/** Makes one of Torn's own buttons. */
function button(label: string, onPress: (self: HTMLButtonElement) => void): HTMLButtonElement {
  const element = make("button", "torn-btn anb-btn", label);
  element.type = "button";
  element.addEventListener("click", () => onPress(element));
  return element;
}

/** Shows a result on a button for a moment, then its own label again. */
function flash(target: HTMLButtonElement, text: string): void {
  const label = target.dataset.label ?? target.textContent ?? "";
  target.dataset.label = label;
  target.textContent = text;
  window.setTimeout(() => {
    target.textContent = label;
    delete target.dataset.armed;
  }, FLASH_MS);
}

/** Returns the version shown in the preview. */
function currentVersion(): Version | undefined {
  return groups.find((g) => g.key === selectedNote)?.versions.find((v) => v.id === selectedVersion);
}

/** Groups every version by note, the note saved to most lately first. */
function group(all: Version[]): NoteGroup[] {
  const byKey = new Map<string, NoteGroup>();
  // Newest first, so a note's first version seen holds its present title.
  for (const version of all) {
    const found = byKey.get(version.note);
    if (found) found.versions.push(version);
    else byKey.set(version.note, { key: version.note, title: version.title, versions: [version] });
  }
  return [...byKey.values()];
}

/** Redraws the window from what is stored. */
async function refresh(): Promise<void> {
  if (!panel) return;
  await flush();
  groups = group(await allVersions());
  if (!groups.some((g) => g.key === selectedNote)) selectedNote = groups[0]?.key ?? null;
  const versions = groups.find((g) => g.key === selectedNote)?.versions ?? [];
  if (!versions.some((v) => v.id === selectedVersion)) selectedVersion = versions[0]?.id ?? null;
  render();
}

/** Fills the three columns: notes, the chosen note's versions, and the chosen version. */
function render(): void {
  if (!panel) return;
  const notesList = panel.querySelector<HTMLElement>(".anb-notes");
  const versionList = panel.querySelector<HTMLElement>(".anb-versions");
  const preview = panel.querySelector<HTMLTextAreaElement>(".anb-preview");
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
  const restore = panel.querySelector<HTMLButtonElement>(".anb-restore");
  if (restore) restore.disabled = !currentVersion() || !noteIsOpen();
}

/** Downloads every version as one JSON file. */
async function exportAll(target: HTMLButtonElement): Promise<void> {
  const versions = (await allVersions()).map(({ id: _id, ...rest }) => rest);
  const file = new Blob([JSON.stringify({ script: "Autumn's Note Backup", exported: Date.now(), versions }, null, 2)], {
    type: "application/json",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = `torn-notes-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
  flash(target, `Saved ${versions.length}`);
}

/** Reads an exported file back in, keeping what is here already. */
function importFile(target: HTMLButtonElement): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const list = (parsed as { versions?: unknown }).versions;
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

/** Copies the version in the preview. */
async function copyVersion(target: HTMLButtonElement): Promise<void> {
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

/**
 * Puts the version in the preview into the note open in Torn, in place of
 * its text. Takes two presses, and saves what it replaces first.
 */
async function restoreVersion(target: HTMLButtonElement): Promise<void> {
  const version = currentVersion();
  if (!version) return;
  if (target.dataset.armed !== "1") {
    target.dataset.armed = "1";
    flash(target, "Replace open note?");
    return;
  }
  delete target.dataset.armed;
  await backup("restored");
  if (replaceBody(version.body)) {
    flash(target, "Restored");
    await refresh();
  } else {
    flash(target, "Open a note first");
  }
}

/** Builds the window, hidden. */
function buildPanel(): HTMLElement {
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
  const restore = button("Restore", (self) => void restoreVersion(self));
  restore.classList.add("anb-restore");
  foot.append(button("Copy", (self) => void copyVersion(self)), restore);

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

/** Opens the window on the newest backups. */
function showPanel(): void {
  panel ??= buildPanel();
  panel.hidden = false;
  void refresh();
}

/** Closes the window. */
function hidePanel(): void {
  if (panel) panel.hidden = true;
}

/** Returns the history icon for the Notes header. */
function buildIcon(): HTMLElement {
  // A span, not a button: the header is a button already, and one may not hold another.
  const icon = document.createElement("span");
  icon.id = ICON_ID;
  icon.setAttribute("role", "button");
  icon.setAttribute("aria-label", "Note backups");
  icon.title = "Note backups";
  icon.tabIndex = 0;
  // The paint is borrowed from the minimise icon, so it wears Torn's own gradient.
  const minimize = document.querySelector(`${SELECTORS.header} ${SELECTORS.minimize} g[fill]`);
  const paint = minimize?.getAttribute("fill") ?? "currentColor";
  icon.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><g fill="${paint}">
<path d="M13 3a9 9 0 0 0-9 9H1l4 4 4-4H6a7 7 0 1 1 2.05 4.95l-1.42 1.42A9 9 0 1 0 13 3Zm-1 5v5l4.25 2.52.77-1.28-3.52-2.09V8Z"/>
</g></svg>`;
  // The header collapses Notes on a press, so none of ours may reach it.
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
    icon.addEventListener(type, (event) => event.stopPropagation());
  }
  const open = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    showPanel();
  };
  icon.addEventListener("click", open);
  icon.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") open(event);
  });
  return icon;
}

/**
 * Keeps the icon in the Notes header, before Note Doodles' icon and minimise.
 *
 * It moves only when it is out of place, not whenever minimise's neighbour is
 * something else: Note Doodles keeps its own icon right before minimise, and
 * two scripts each insisting on that spot would move their icons forever.
 */
function placeIcon(): void {
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

/** Puts the icon in the Notes header, and keeps it there as Torn redraws the header. */
export function installPanel(): void {
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
