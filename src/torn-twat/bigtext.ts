// Six-row block lettering (the "ANSI Shadow" figlet style) for the T.W.A.T. and BLAME DAPHOK titles.

/** Glyphs for the letters the titles use. Every row of a glyph has the same width. */
const GLYPHS: Record<string, readonly string[]> = {
  T: ["████████╗", "╚══██╔══╝", "   ██║   ", "   ██║   ", "   ██║   ", "   ╚═╝   "],
  W: ["██╗    ██╗", "██║    ██║", "██║ █╗ ██║", "██║███╗██║", "╚███╔███╔╝", " ╚══╝╚══╝ "],
  A: [" █████╗ ", "██╔══██╗", "███████║", "██╔══██║", "██║  ██║", "╚═╝  ╚═╝"],
  ".": ["   ", "   ", "   ", "   ", "██╗", "╚═╝"],
  B: ["██████╗ ", "██╔══██╗", "██████╔╝", "██╔══██╗", "██████╔╝", "╚═════╝ "],
  L: ["██╗     ", "██║     ", "██║     ", "██║     ", "███████╗", "╚══════╝"],
  M: ["███╗   ███╗", "████╗ ████║", "██╔████╔██║", "██║╚██╔╝██║", "██║ ╚═╝ ██║", "╚═╝     ╚═╝"],
  E: ["███████╗", "██╔════╝", "█████╗  ", "██╔══╝  ", "███████╗", "╚══════╝"],
  D: ["██████╗ ", "██╔══██╗", "██║  ██║", "██║  ██║", "██████╔╝", "╚═════╝ "],
  P: ["██████╗ ", "██╔══██╗", "██████╔╝", "██╔═══╝ ", "██║     ", "╚═╝     "],
  H: ["██╗  ██╗", "██║  ██║", "███████║", "██╔══██║", "██║  ██║", "╚═╝  ╚═╝"],
  O: [" ██████╗ ", "██╔═══██╗", "██║   ██║", "██║   ██║", "╚██████╔╝", " ╚═════╝ "],
  K: ["██╗  ██╗", "██║ ██╔╝", "█████╔╝ ", "██╔═██╗ ", "██║  ██╗", "╚═╝  ╚═╝"],
  " ": ["   ", "   ", "   ", "   ", "   ", "   "],
};

/** Renders text in block letters, returning its six rows. Letters without a glyph are skipped. */
export function bigText(text: string): string[] {
  const rows = ["", "", "", "", "", ""];
  for (const ch of text.toUpperCase()) {
    const glyph = GLYPHS[ch];
    if (!glyph) continue;
    glyph.forEach((part, i) => (rows[i] += part));
  }
  return rows.map((r) => r.replace(/\s+$/, ""));
}
