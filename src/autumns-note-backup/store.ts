// Where the note versions are kept: IndexedDB, in this browser only.
//
// One record per version, tied to a note by a key this script makes up. Torn
// gives its notes no id on the page, so a note is known by its title when it
// is opened, and keeps its key through a rename typed while it is open.

const DB_NAME = "autumns-note-backup";
const STORE = "versions";

/** Why a version was taken. */
export type Reason = "opened" | "edited" | "deleted" | "restored";

/** One saved copy of a note. */
export interface Version {
  id?: number;
  /** The note's key, shared by all its versions. */
  note: string;
  title: string;
  body: string;
  /** When it was last written, in ms since the epoch. */
  saved: number;
  reason: Reason;
}

const REASONS: Reason[] = ["opened", "edited", "deleted", "restored"];

let opened: Promise<IDBDatabase> | null = null;

/** Returns the database, opened once. */
function database(): Promise<IDBDatabase> {
  opened ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      store.createIndex("note", "note");
      store.createIndex("title", "title");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return opened;
}

/** Runs work against the store in one transaction, resolving with its result once committed. */
async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest | void): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = work(transaction.objectStore(STORE));
    // Resolved on completion, not on the request's success: a write is only
    // safe once committed, and a full disk shows up here.
    transaction.oncomplete = () => resolve((request ? request.result : undefined) as T);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error("aborted"));
  });
}

/** Adds a version and returns its id. */
export function addVersion(version: Version): Promise<number> {
  return run("readwrite", (store) => store.add(version));
}

/** Writes over a version already stored. */
export function putVersion(version: Version): Promise<number> {
  return run("readwrite", (store) => store.put(version));
}

/** Returns every version, newest first. */
export async function allVersions(): Promise<Version[]> {
  const all = await run<Version[]>("readonly", (store) => store.getAll());
  return all.sort((a, b) => b.saved - a.saved);
}

/** Returns one note's versions, newest first. */
export async function versionsOf(note: string): Promise<Version[]> {
  const list = await run<Version[]>("readonly", (store) => store.index("note").getAll(note));
  return list.sort((a, b) => b.saved - a.saved);
}

/** Returns the newest version saved under a title, by any note. */
export async function latestWithTitle(title: string): Promise<Version | undefined> {
  const list = await run<Version[]>("readonly", (store) => store.index("title").getAll(title));
  return list.sort((a, b) => b.saved - a.saved)[0];
}

/** Deletes a note's oldest versions past the newest `keep`. */
export async function prune(note: string, keep: number): Promise<void> {
  const extra = (await versionsOf(note)).slice(keep);
  if (extra.length === 0) return;
  await run("readwrite", (store) => {
    for (const version of extra) if (version.id !== undefined) store.delete(version.id);
  });
}

/** Whether a parsed value has the shape of a version, for checking an imported file. */
function isVersion(value: unknown): value is Version {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.note === "string" &&
    typeof v.title === "string" &&
    typeof v.body === "string" &&
    typeof v.saved === "number" &&
    REASONS.includes(v.reason as Reason)
  );
}

/**
 * Adds the versions from an exported file that are not already here, and
 * returns how many were added. Ids are dropped, as they belong to the browser
 * that exported them.
 */
export async function importVersions(values: unknown[]): Promise<number> {
  const have = new Set((await allVersions()).map((v) => `${v.note}\n${v.saved}\n${v.body}`));
  const fresh: Version[] = [];
  for (const value of values) {
    if (!isVersion(value)) continue;
    const id = `${value.note}\n${value.saved}\n${value.body}`;
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
