// Where the drawings are kept in this browser, and the one layout fact read from Torn.

/** Every key this script stores starts with this. */
const PREFIX = "AND_DRAWING_";
// Before this was a script of its own it was part of Autumn's UI Enhancer,
// which kept drawings under its own prefix. Those are still read.
const OLD_PREFIX = "AUE_DRAWING_";

// Torn switches to its mobile layout at this width.
const MOBILE_QUERY = "(max-width: 784px)";

/** Whether Torn is showing its mobile layout. */
export function isMobileView(): boolean {
  return matchMedia(MOBILE_QUERY).matches;
}

/** Returns a drawing's stored picture as a data URL, or "" when this browser has none. */
export function readPicture(id: string): string {
  try {
    return localStorage.getItem(PREFIX + id) ?? localStorage.getItem(OLD_PREFIX + id) ?? "";
  } catch {
    return "";
  }
}

/** Stores a drawing's picture; a full or blocked storage is left for the caller to notice. */
export function writePicture(id: string, picture: string): void {
  try {
    localStorage.setItem(PREFIX + id, picture);
    localStorage.removeItem(OLD_PREFIX + id);
  } catch {}
}
