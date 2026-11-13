// Where the drawings are kept in this browser, and the one layout fact read from Torn.
//
// Pictures go in IndexedDB, as PNG blobs. They were first kept in
// localStorage as text, which holds about 5 MB for the whole of torn.com,
// shared with Torn and every other script; a few busy drawings filled it
// and the rest would not save. IndexedDB allows hundreds of megabytes.

const DB_NAME = "autumns-note-doodles";
const STORE = "drawings";
/** Where drawings were kept in localStorage, by this script and before it by Autumn's UI Enhancer. */
const OLD_PREFIXES = ["AND_DRAWING_", "AUE_DRAWING_"];

// Torn switches to its mobile layout at this width.
const MOBILE_QUERY = "(max-width: 784px)";

/** Whether Torn is showing its mobile layout. */
export function isMobileView(): boolean {
  return matchMedia(MOBILE_QUERY).matches;
}

let opened: Promise<IDBDatabase> | null = null;

/** Returns the database, opened once. */
function database(): Promise<IDBDatabase> {
  opened ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return opened;
}

/** Runs one request against the drawings store. */
async function run<T>(mode: IDBTransactionMode, ask: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = ask(transaction.objectStore(STORE));
    // Resolved on the transaction's completion, not the request's success:
    // a write is only safe once committed, and a full disk shows up here.
    transaction.oncomplete = () => resolve(request.result as T);
    transaction.onerror = () => reject(transaction.error ?? request.error);
    transaction.onabort = () => reject(transaction.error ?? new Error("aborted"));
  });
}

/** Returns a drawing's stored picture, or null when this browser has none. */
export async function readPicture(id: string): Promise<Blob | null> {
  try {
    const stored = await run<Blob | undefined>("readonly", (store) => store.get(id));
    if (stored) return stored;
  } catch {
    // Falls through to the old store, in case the database cannot be opened.
  }
  return oldPicture(id);
}

/** Stores a drawing's picture. Returns whether it was kept. */
export async function writePicture(id: string, picture: Blob): Promise<boolean> {
  try {
    await run("readwrite", (store) => store.put(picture, id));
    forgetOld(id);
    return true;
  } catch {
    return false;
  }
}

/** Returns a picture still in localStorage from before, as a blob. */
function oldPicture(id: string): Blob | null {
  for (const prefix of OLD_PREFIXES) {
    let text: string | null = null;
    try {
      text = localStorage.getItem(prefix + id);
    } catch {}
    if (text) return dataUrlToBlob(text);
  }
  return null;
}

/** Takes a drawing's old copy out of localStorage. */
function forgetOld(id: string): void {
  for (const prefix of OLD_PREFIXES) {
    try {
      localStorage.removeItem(prefix + id);
    } catch {}
  }
}

/**
 * Moves every drawing still in localStorage into the database, freeing the
 * space it took there. A drawing is only removed once its copy is committed.
 */
export async function moveOldPictures(): Promise<number> {
  const found: { id: string; text: string }[] = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) ?? "";
      const prefix = OLD_PREFIXES.find((one) => key.startsWith(one));
      const text = prefix ? localStorage.getItem(key) : null;
      if (prefix && text) found.push({ id: key.slice(prefix.length), text });
    }
  } catch {
    return 0;
  }
  let moved = 0;
  for (const { id, text } of found) {
    try {
      const existing = await run<Blob | undefined>("readonly", (store) => store.get(id));
      if (!existing) await run("readwrite", (store) => store.put(dataUrlToBlob(text), id));
      forgetOld(id);
      moved += 1;
    } catch {
      // Left where it is, to be tried again on the next page.
    }
  }
  return moved;
}

/** Returns the picture in a data URL as a blob, without a request. */
function dataUrlToBlob(text: string): Blob {
  const [head = "", body = ""] = text.split(",", 2);
  const type = /data:([^;,]+)/.exec(head)?.[1] ?? "image/png";
  const bytes = atob(body);
  const array = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) array[index] = bytes.charCodeAt(index);
  return new Blob([array], { type });
}
