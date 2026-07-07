import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";

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
function fontPathArgs(): string[] {
  const dir = (process.env.ANVILNOTE_FONT_DIR ?? process.env.TYPST_FONT_PATH ?? "").trim();
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
