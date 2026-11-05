# Parked

Code that is not part of any script and is not built. `tsconfig.json` only
includes `src/**/*.ts`, so nothing here is compiled or type-checked, and
`build.mjs` only walks `src/`, so nothing here reaches `dist/`.

A file here is one we mean to come back to. Deleting it would lose working
code; leaving it in `src/` would ship something broken.

## shopSend.ts

The send option that appeared beside a shop purchase message, which opened
Torn's own item page send form with the recipient and the amount already
filled in. Taken out of **Autumn's UI Enhancer** at 0.18.6.

**Why it is here:** the button stopped appearing at all. The cause was never
found — what it does once it is up was never the problem.

**Why it has not been fixed:** testing it needs a shop purchase in hand, and
Torn allows only so many a day. Once the day's buying is done it cannot be
exercised again until the next day, so a fix cannot be confirmed on demand.

**Putting it back:** move it to `src/autumns-ui-enhancer/`, then in
`index.ts` import `SHOP_PATHS` and `installShopSend` from it and start it
again on those paths. Its imports (`./debug`, `./recipient`, `./settings`)
are all still there, and the switch it reads is still `PREFERRED_RECIPIENT`
— which, having lost the shop half, is now named for what is left of it.
Note that the preferences panel would want a second switch again, or a
broader name, if both halves are running.
