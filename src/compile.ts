import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";

const typstBin = process.env.TYPST_BIN || "typst";

// Shorter than the renderer's 30s (full documents can be large; a single
// chart's Typst source is a few lines) — see spec's "已定案的實作細節".
const COMPILE_TIMEOUT_MS = 8_000;

export type CompileResult = { ok: true } | { ok: false; message: string; details?: string };

export async function compileTypstToSvg(typPath: string, svgPath: string): Promise<CompileResult> {
  await fs.rm(svgPath, { force: true });

  return new Promise<CompileResult>((resolve) => {
    const child = spawn(typstBin, ["compile", typPath, svgPath], {
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
