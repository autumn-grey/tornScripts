// Looking up Torn users by name, the way the item send form does.

import { log } from "./debug";

const SEARCH_URL = "https://www.torn.com/autocompleteUserAjaxAction.php";
/** How many names the list offers. */
const MAX_RESULTS = 8;
/** Shorter than this returns most of Torn, so it is not worth asking. */
export const MIN_QUERY = 2;

export interface FoundUser {
  id: string;
  name: string;
  online: boolean;
}

/** The lookup in flight, if any. */
let pending: AbortController | null = null;

/** Returns one user from a row of Torn's reply. */
function readUser(row: unknown): FoundUser | null {
  if (!row || typeof row !== "object") return null;
  const entry = row as Record<string, unknown>;
  const id = String(entry.id ?? "");
  const name = String(entry.name ?? "");
  if (!/^\d+$/.test(id) || !name) return null;
  return { id, name, online: entry.online === "online" };
}

/** Returns the users whose name matches what was typed. */
export async function searchUsers(query: string): Promise<FoundUser[]> {
  pending?.abort();
  const controller = new AbortController();
  pending = controller;

  const url = `${SEARCH_URL}?q=${encodeURIComponent(query)}&option=ac-all`;
  try {
    const response = await fetch(url, {
      headers: { "X-Requested-With": "XMLHttpRequest" },
      signal: controller.signal,
    });
    if (!response.ok) {
      log("search: Torn answered", response.status);
      return [];
    }
    const body: unknown = await response.json();
    if (!Array.isArray(body)) return [];
    return body
      .slice(0, MAX_RESULTS)
      .map(readUser)
      .filter((user): user is FoundUser => user !== null);
  } catch {
    return [];
  }
}
