// Selectors for Torn's CSS-module class names, which carry a per-build hash.

/**
 * Returns a selector matching one of Torn's hashed classes in either of the
 * two forms CSS modules write them in: `name___hash` and `_name_hash`.
 *
 * Every Torn build seen so far uses the first form. TornW3B Companion matches
 * both, which suggests some builds ship the second, so both are matched as a
 * safeguard. The result is wrapped in :is() so it behaves like one attribute
 * selector: it can follow a tag, sit inside :not() and be chained with
 * descendant combinators, which a plain comma-joined pair could not.
 *
 * @param name The class's readable front, without underscores ("title").
 * @param atStart Match only where the class starts a word of the attribute,
 *     so "duration" does not also catch "flightDuration___".
 */
export function hashedClass(name: string, atStart = false): string {
  const forms = [`${name}___`, `_${name}_`];
  const parts = atStart
    ? forms.flatMap((form) => [`[class^="${form}"]`, `[class*=" ${form}"]`])
    : forms.map((form) => `[class*="${form}"]`);
  return `:is(${parts.join(", ")})`;
}
