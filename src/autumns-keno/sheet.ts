// Talking to the Apps Script web app that keeps the round history in a Google Sheet.
//
// The web app answers GET with every stored round and appends the rounds in a
// POST body, skipping any whose ID it already has (see appsScript.gs). Both
// answers arrive after a redirect to script.googleusercontent.com, which
// GM_xmlhttpRequest follows; a page fetch could not, as Google sends no CORS
// headers on the POST.

import type { Round } from "./rounds";

/** A round as the sheet returns it: the number lists are space-separated text. */
interface SheetRound {
  id: string;
  time: string;
  picks: string;
  drawn: string;
  matches: number;
  bet: number;
  won: number;
}

/** Returns the parsed JSON answer to one request to the web app. */
function request(method: "GET" | "POST", url: string, body?: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const details: Tampermonkey.Request = {
      method,
      url,
      timeout: 30000,
      onload: (response) => {
        try {
          resolve(JSON.parse(response.responseText));
        } catch {
          reject(new Error(`not JSON (HTTP ${response.status})`));
        }
      },
      onerror: () => reject(new Error("network error")),
      ontimeout: () => reject(new Error("timed out")),
    };
    if (body !== undefined) {
      details.data = body;
      // text/plain keeps Apps Script from trying to parse the body as a form.
      details.headers = { "Content-Type": "text/plain;charset=utf-8" };
    }
    GM_xmlhttpRequest(details);
  });
}

/** Returns the numbers in a space-separated list. */
function numbers(text: string): number[] {
  return text
    .split(/\s+/)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 80);
}

/** Returns every round stored in the sheet. */
export async function fetchHistory(url: string): Promise<Round[]> {
  const answer = (await request("GET", url)) as { ok?: boolean; rounds?: SheetRound[] };
  if (!answer || answer.ok !== true || !Array.isArray(answer.rounds)) {
    throw new Error("not the Autumn's Keno web app");
  }
  return answer.rounds.map((r) => ({
    id: String(r.id),
    time: String(r.time),
    picks: numbers(String(r.picks)),
    drawn: numbers(String(r.drawn)),
    matches: Number(r.matches) || 0,
    bet: Number(r.bet) || 0,
    won: Number(r.won) || 0,
  }));
}

/** Sends rounds to the sheet and returns how many it had not already stored. */
export async function postRounds(url: string, rounds: Round[]): Promise<number> {
  const answer = (await request("POST", url, JSON.stringify({ rounds }))) as {
    ok?: boolean;
    added?: number;
  };
  if (!answer || answer.ok !== true) throw new Error("sheet refused the rounds");
  return Number(answer.added) || 0;
}
