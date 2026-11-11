// Everything read from or found on Torn's Keno board. Selectors live here so a
// Torn redesign only needs fixing in one place.

export const SELECTORS = {
  /** The whole game; the panel goes after it. */
  game: "#kenoGame",
  /** The 8 x 10 grid of numbers. */
  board: "#boardContainer",
  /** The bet shown under the board, like "10K". */
  bet: "#betAmount",
};

/** Number cells are spans with ids keno_item_1 to keno_item_80. */
const CELL_PREFIX = "keno_item_";

/**
 * Cell classes Torn sets: "marked" for a pick, "lost" for a called number
 * that was not picked. A picked number that was also called carries some
 * other class, so anything but "lost" counts as picked.
 */
const NOT_PICKED = new Set(["lost"]);

/** Returns the board cell for a number, if the board is on the page. */
export function cell(n: number): HTMLElement | null {
  return document.getElementById(CELL_PREFIX + n);
}

/** Returns the numbers currently picked on the board, ascending. */
export function readPicks(): number[] {
  const picks: number[] = [];
  for (let n = 1; n <= 80; n++) {
    const tokens = [...(cell(n)?.classList ?? [])];
    if (tokens.some((t) => !NOT_PICKED.has(t))) picks.push(n);
  }
  return picks;
}

/** Returns the bet shown under the board in dollars, or 0 when it cannot be read. */
export function readBet(): number {
  const text = document.querySelector(SELECTORS.bet)?.textContent?.trim().toUpperCase() ?? "";
  const match = /^([\d.,]+)\s*([KMB]?)$/.exec(text);
  if (!match?.[1]) return 0;
  const scale = { "": 1, K: 1e3, M: 1e6, B: 1e9 }[match[2] ?? ""] ?? 1;
  return Math.round(Number(match[1].replace(/,/g, "")) * scale);
}

/** Resolves once the board is on the page. */
export function waitForBoard(): Promise<HTMLElement> {
  return new Promise((resolve) => {
    const found = document.querySelector<HTMLElement>(SELECTORS.board);
    if (found) return resolve(found);
    const observer = new MutationObserver(() => {
      const board = document.querySelector<HTMLElement>(SELECTORS.board);
      if (!board) return;
      observer.disconnect();
      resolve(board);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}
