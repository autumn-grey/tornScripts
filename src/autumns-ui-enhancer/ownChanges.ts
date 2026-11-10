// Tells this script's own page changes apart from Torn's and other scripts'.

/** Everything this script adds to the page has an id starting with this. */
const OWN_SELECTOR = '[id^="aue-"]';

/** Whether a node is, or sits inside, something this script added. */
function isOurs(node: Node): boolean {
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest(OWN_SELECTOR) != null;
}

/**
 * Whether every change in a batch was this script's own doing.
 *
 * A watcher that wakes on its own additions does its work twice for nothing.
 * Removals outside our elements are never counted as ours, since Torn taking
 * our icon away with a redraw is exactly what the watchers are there to see.
 */
export function onlyOurs(records: MutationRecord[]): boolean {
  for (const record of records) {
    if (isOurs(record.target)) continue;
    if (record.removedNodes.length > 0) return false;
    for (const node of record.addedNodes) {
      if (!isOurs(node)) return false;
    }
  }
  return true;
}
