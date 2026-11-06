// Telling a shop's own purchase message from the same purchase in the log.

/** Where Torn's activity log and other page furniture live, never a shop's message. */
const FURNITURE_SELECTOR = "#header-root, #sidebarroot, #chatRoot";
// The log says "You bought 1x Plain Silver Ring at $100 each for a total of
// $100 from Jewelry Store"; the shop says "You bought a Plain Silver Ring for
// a total of $100", with no price each.
const LOG_WORDING = /\bat\s+\$[\d,]+\s+each\b/i;

/** Whether "You bought ..." text is a log entry rather than the shop confirming a purchase. */
export function isLogEntry(node: Node): boolean {
  const element = node instanceof Element ? node : node.parentElement;
  if (element?.closest(FURNITURE_SELECTOR)) return true;
  return LOG_WORDING.test(node.textContent ?? "");
}
