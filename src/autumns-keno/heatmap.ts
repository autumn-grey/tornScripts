// Shades the board's number cells by how each number has done.
//
// "Drawn" colours by how far a number's call count sits from fair: red above,
// blue below, stronger the further out. "Wins" colours the numbers you have
// picked by the share of those rounds that paid more than the bet. In either
// mode the ten most drawn numbers are outlined in red.

import { cell } from "./board";
import type { Round } from "./rounds";
import { BALLS, P_CALLED, drawZ, numberRecords } from "./stats";

export type HeatMode = "drawn" | "wins" | "off";

/** The data attribute styles.ts keys the overlay on. */
const HEAT_ATTR = "data-akn-heat";
/** The data attribute styles.ts keys the red outline on. */
const TOP_ATTR = "data-akn-top";
/** How many of the most drawn numbers get the red outline. */
const TOP_COUNT = 10;
/** How many standard deviations count as fully hot or cold. */
const FULL_Z = 3;

/** Returns the overlay colour for a draw count's distance from fair. */
function drawColour(z: number): string {
  const strength = Math.min(Math.abs(z) / FULL_Z, 1);
  const alpha = (0.08 + 0.5 * strength).toFixed(2);
  return z >= 0 ? `rgba(230, 40, 30, ${alpha})` : `rgba(30, 90, 230, ${alpha})`;
}

/** Returns the overlay colour for a win rate, against the best win rate seen. */
function winColour(rate: number, best: number): string {
  const alpha = (0.1 + 0.5 * (best > 0 ? rate / best : 0)).toFixed(2);
  return `rgba(40, 190, 60, ${alpha})`;
}

/** Repaints the board for the given rounds and mode. */
export function paintHeatmap(rounds: Round[], mode: HeatMode): void {
  const records = numberRecords(rounds);
  const bestRate = Math.max(0, ...records.slice(1).map((r) => (r.picked > 0 ? r.wins / r.picked : 0)));
  const expected = (rounds.length * P_CALLED).toFixed(1);
  // Ties at the cut-off go to the lower number, so exactly ten are outlined.
  const top = new Set(
    records
      .slice(1)
      .filter((r) => r.drawn > 0)
      .sort((a, b) => b.drawn - a.drawn || a.number - b.number)
      .slice(0, TOP_COUNT)
      .map((r) => r.number),
  );

  for (let n = 1; n <= BALLS; n++) {
    const target = cell(n);
    const record = records[n];
    if (!target || !record) continue;

    target.toggleAttribute(TOP_ATTR, mode !== "off" && top.has(n));

    let colour: string | null = null;
    let title = "";
    if (mode === "drawn" && rounds.length > 0) {
      colour = drawColour(drawZ(record.drawn, rounds.length));
      title = `Drawn ${record.drawn} times in ${rounds.length} rounds (expected ${expected})`;
    } else if (mode === "wins" && record.picked > 0) {
      const rate = record.wins / record.picked;
      colour = winColour(rate, bestRate);
      title = `Profit in ${record.wins} of ${record.picked} rounds you picked it (${Math.round(rate * 100)}%)`;
    }

    if (colour) {
      target.setAttribute(HEAT_ATTR, "");
      target.style.setProperty("--akn-heat", colour);
      target.title = title;
    } else {
      target.removeAttribute(HEAT_ATTR);
      target.style.removeProperty("--akn-heat");
      target.removeAttribute("title");
    }
  }
}
