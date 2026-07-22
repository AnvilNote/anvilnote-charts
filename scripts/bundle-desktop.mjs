/* global console */

// Bundle the CLI into a single self-contained dist/cli.cjs so the desktop
// app can run it under Electron's Node runtime with NO external
// node_modules (mirrors anvilnote-docx-exporter's scripts/bundle-desktop.mjs).
//
// .cjs, not .js: this package is "type": "module", so plain .js here would
// be ESM, but the desktop app's charts/ resource dir ships dist/ only, no
// package.json — Node would resolve a plain .js there as CommonJS by
// nearest-package.json default. .cjs sidesteps the ambiguity entirely.
import { build } from "esbuild";
import { chmod } from "node:fs/promises";

await build({
  entryPoints: ["src/cli.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  outfile: "dist/cli.cjs",
  legalComments: "none",
  logLevel: "info",
});

await chmod("dist/cli.cjs", 0o755);
console.log("bundled dist/cli.cjs (standalone — no node_modules required at runtime)");
