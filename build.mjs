// Builds every script in src/ into a standalone .user.js in dist/.
//
//   node build.mjs           one-off build
//   node build.mjs --watch   rebuild on save
//
// A script is any src/<name>/ directory containing meta.json and index.ts.
// meta.json becomes the userscript metadata block; index.ts is the entry point.
//
// Output is deliberately NOT minified — GreasyFork rejects minified source.

import { readdir, readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import * as esbuild from "esbuild";

const SRC = "src";
const DIST = "dist";
const RAW_BASE =
  "https://raw.githubusercontent.com/autumn-grey/tornScripts/main/dist";

const watch = process.argv.includes("--watch");

/** Render meta.json as a userscript metadata block. */
function renderMeta(meta, name) {
  // Keys that may appear more than once (e.g. several @match lines).
  const multi = ["match", "include", "exclude", "grant", "require", "resource"];

  const lines = [];
  const add = (key, value) => lines.push([key, value]);

  add("name", meta.name);
  add("namespace", meta.namespace ?? "https://github.com/autumn-grey");
  add("version", meta.version);
  add("description", meta.description);
  add("author", meta.author ?? "AutumnGrey");
  add("license", meta.license ?? "MIT");

  for (const key of multi) {
    const value = meta[key];
    if (!value) continue;
    for (const item of Array.isArray(value) ? value : [value]) add(key, item);
  }

  // Lets Tampermonkey auto-update installs that came from the raw GitHub URL.
  add("downloadURL", `${RAW_BASE}/${name}.user.js`);
  add("updateURL", `${RAW_BASE}/${name}.user.js`);

  const width = Math.max(...lines.map(([k]) => k.length));
  const body = lines
    .map(([k, v]) => `// @${k.padEnd(width)}  ${v}`)
    .join("\n");

  return `// ==UserScript==\n${body}\n// ==/UserScript==\n`;
}

async function findScripts() {
  if (!existsSync(SRC)) return [];
  const entries = await readdir(SRC, { withFileTypes: true });
  const found = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = `${SRC}/${entry.name}`;
    if (!existsSync(`${dir}/meta.json`)) continue; // shared/ and the like
    const meta = JSON.parse(await readFile(`${dir}/meta.json`, "utf8"));
    found.push({ name: entry.name, dir, meta });
  }
  return found;
}

const scripts = await findScripts();

if (scripts.length === 0) {
  console.log("No scripts found in src/ (need meta.json + index.ts).");
  process.exit(0);
}

await mkdir(DIST, { recursive: true });

for (const { name, dir, meta } of scripts) {
  const options = {
    entryPoints: [`${dir}/index.ts`],
    outfile: `${DIST}/${name}.user.js`,
    bundle: true,
    format: "iife",
    target: "es2020",
    minify: false,
    banner: { js: renderMeta(meta, name) },
    legalComments: "inline",
    charset: "utf8",
  };

  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log(`watching ${name} (v${meta.version})`);
  } else {
    await esbuild.build(options);
    console.log(`${name} v${meta.version} -> ${DIST}/${name}.user.js`);
  }
}

if (watch) console.log("\nWatching for changes. Ctrl+C to stop.");
