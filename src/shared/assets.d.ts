// esbuild inlines image imports as data: URIs (see the `loader` map in
// build.mjs), so at runtime these resolve to a self-contained string.
declare module "*.png" {
  const dataUri: string;
  export default dataUri;
}
