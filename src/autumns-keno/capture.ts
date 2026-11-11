// Spots each Keno result as Torn's own page receives it.
//
// Every round is its own request to page.php, answered with JSON like
// {"matches":2,"winnings":15000,"money":785823,"randomNumbers":[79,74,...]}.
// The answer carries neither the picks nor the bet, so both are read off the
// board when the request goes out, before the board changes for the result.
// Nothing is requested here: the script only listens to what the player's
// own clicks send.

import { readBet, readPicks } from "./board";
import { log } from "./debug";
import type { Round } from "./rounds";

/** The fields of a Keno result this script uses. */
interface KenoResult {
  matches: number;
  winnings: number;
  randomNumbers: number[];
}

/** What the board showed when a request went out. */
interface Snapshot {
  picks: number[];
  bet: number;
}

/** Returns the Keno result in a response body, or null for any other response. */
function parseResult(text: string): KenoResult | null {
  if (!text.includes("randomNumbers")) return null;
  try {
    const data = JSON.parse(text) as Partial<KenoResult>;
    if (!Array.isArray(data.randomNumbers) || typeof data.matches !== "number") return null;
    return { matches: data.matches, winnings: Number(data.winnings) || 0, randomNumbers: data.randomNumbers.map(Number) };
  } catch {
    return null;
  }
}

/** Returns the round a result describes. */
function toRound(result: KenoResult, snapshot: Snapshot): Round {
  const drawn = result.randomNumbers;
  let picks = snapshot.picks;
  const matched = picks.filter((n) => drawn.includes(n)).length;
  // A count that disagrees with Torn's means the board was misread; a round
  // with no picks is better than one that skews every pick statistic.
  if (matched !== result.matches) {
    log("picks did not match the result", picks, drawn, result.matches);
    picks = [];
  }
  return {
    id: crypto.randomUUID(),
    time: new Date().toISOString(),
    picks,
    drawn,
    matches: result.matches,
    bet: snapshot.bet,
    won: result.winnings,
  };
}

/** Returns an XHR's response as text, whatever type it was asked for as. */
function responseText(xhr: XMLHttpRequest): string {
  try {
    if (xhr.responseType === "" || xhr.responseType === "text") return xhr.responseText;
    if (xhr.responseType === "json") return JSON.stringify(xhr.response);
  } catch {
    // An aborted request can throw on read; there is nothing to record.
  }
  return "";
}

/** Calls onRound with every Keno result the page receives from now on. */
export function installCapture(onRound: (round: Round) => void): void {
  const page = unsafeWindow;

  /** Records a response body if it is a Keno result. */
  const handle = (text: string, snapshot: Snapshot): void => {
    const result = parseResult(text);
    if (result) onRound(toRound(result, snapshot));
  };

  const proto = page.XMLHttpRequest.prototype;
  const send = proto.send;
  proto.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    const snapshot = { picks: readPicks(), bet: readBet() };
    this.addEventListener("load", () => handle(responseText(this), snapshot));
    return send.call(this, body);
  };

  const pageFetch = page.fetch;
  page.fetch = function (this: unknown, ...args: Parameters<typeof fetch>) {
    const snapshot = { picks: readPicks(), bet: readBet() };
    const reply = pageFetch.apply(this, args);
    reply
      .then((response) => response.clone().text())
      .then((text) => handle(text, snapshot))
      .catch(() => undefined);
    return reply;
  };
}
