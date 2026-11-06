# Parked

Code that is not part of any script and is not built. `tsconfig.json` only
includes `src/**/*.ts`, so nothing here is compiled or type-checked, and
`build.mjs` only walks `src/`, so nothing here reaches `dist/`.

A file here is one we mean to come back to. Deleting it would lose working
code; leaving it in `src/` would ship something broken.

Nothing is parked at the moment. `shopSend.ts`, the send option after a shop
purchase, went back into **Autumn's UI Enhancer** at 0.20.7.
