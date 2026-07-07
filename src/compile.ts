import { spawn } from "node:child_process";
import { promises as fs, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// esbuild's CJS bundle target (dist/cli.cjs, format: "cjs") doesn't
// polyfill `import.meta.url` — it warns "You need to set the output
// format to esm" and leaves it undefined, which would break
// fileURLToPath(undefined) at runtime in the packaged desktop app. But
// __dirname (CJS-native) doesn't exist when this file runs as plain ESM
// via tsx (dev/test, unbundled) — referencing it directly there would
// throw a ReferenceError at parse time. `typeof __dirname` sidesteps
// that (safe on an undeclared identifier); the `declare` satisfies TS
// without requiring @types/node's CJS globals in this ESM package.
declare const __dirname: string | undefined;
function currentDir(): string {
  if (typeof __dirname !== "undefined") return __dirname;
  return dirname(fileURLToPath(import.meta.url));
}

const typstBin = process.env.TYPST_BIN || "typst";

// Shorter than the renderer's 30s (full documents can be large; a single
// chart's Typst source is a few lines) — see spec's "已定案的實作細節".
const COMPILE_TIMEOUT_MS = 8_000;

export type CompileResult = { ok: true } | { ok: false; message: string; details?: string };

// Same env vars anvilnote-renderer's own font-paths.ts reads (ANVILNOTE_FONT_DIR,
// falling back to TYPST_FONT_PATH) — NOT a separate anvilnote-charts-specific
// var, so the desktop app's existing ANVILNOTE_FONT_DIR (already forwarded to
// this CLI's subprocess env by anvilnote-api's charts-cli.ts, which spreads
// ...process.env) resolves fonts here too, without anvilnote-charts needing to
// bundle its own copy of the same font files. Without this, chart text (labels
// via fontFamily, axis ticks) silently fell back to whatever font Typst's
// default search happened to resolve, making the fontFamily choice a no-op —
// caught via a real compile showing "sans" and "serif" rendering identically.
//
// Real bug, caught live: unlike anvilnote-renderer's own getFontDir() (which
// falls back to its local fonts/ folder when the env var is unset),
// anvilnote-charts had NO fallback at all — an unset env var silently
// produced an EMPTY args array (no --font-path/--ignore-system-fonts),
// letting Typst fall through to system font resolution. A dev anvilnote-api
// server started without ANVILNOTE_FONT_DIR set ran this way for an entire
// session: fontFamily became a no-op, and CJK category-axis labels drew
// with inconsistent baselines (system font metrics differ per glyph from
// the bundled fonts'). Fixed with the same "local monorepo sibling"
// fallback anvilnote-api's own ANVILNOTE_RENDERER_PATH default already
// assumes: `<this package>/../anvilnote-renderer/fonts`, resolved relative
// to THIS FILE's own location (not process.cwd(), which depends on the
// caller) so it works the same whether invoked from source or from the
// bundled dist/cli.cjs. Desktop/production always sets the env var
// explicitly (see anvilnote-desktop's own font staging), so this fallback
// only matters for local dev — harmless, unused, when the env var is set.
function localFontDirFallback(): string | null {
  const candidate = join(currentDir(), "..", "..", "anvilnote-renderer", "fonts");
  return existsSync(candidate) ? candidate : null;
}

function fontPathArgs(): string[] {
  const fromEnv = (process.env.ANVILNOTE_FONT_DIR ?? process.env.TYPST_FONT_PATH ?? "").trim();
  const dir = fromEnv || localFontDirFallback();
  return dir ? ["--font-path", dir, "--ignore-system-fonts"] : [];
}

export async function compileTypstToSvg(typPath: string, svgPath: string): Promise<CompileResult> {
  await fs.rm(svgPath, { force: true });

  return new Promise<CompileResult>((resolve) => {
    const child = spawn(typstBin, ["compile", ...fontPathArgs(), typPath, svgPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ ok: false, message: "Typst compilation timed out" });
    }, COMPILE_TIMEOUT_MS);

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({ ok: false, message: "Failed to start Typst CLI", details: error.message });
    });

    child.on("close", async (code) => {
      clearTimeout(timeout);

      if (code !== 0) {
        resolve({
          ok: false,
          message: "Typst compilation failed",
          details: stderr.trim() || `typst exited with code ${code ?? "unknown"}`,
        });
        return;
      }

      try {
        await fs.access(svgPath);
        resolve({ ok: true });
      } catch {
        resolve({ ok: false, message: "Typst did not produce an SVG output" });
      }
    });
  });
}
