#!/usr/bin/env node
// CLI entry point. Contract mirrors anvilnote-renderer/anvilnote-docx-exporter
// so anvilnote-api can shell out to all three the same way:
//   node dist/cli.cjs --input <path-to-json> --output <path-to-svg>
// stdout is a single JSON line:
//   { ok: true, status: "COMPLETED", svgPath, logs }
//   { ok: false, status: "FAILED", error: { message, details? }, logs }
import { readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { functionPlotSpecSchema } from "./schema.js";
import { buildFunctionPlotTypst } from "./build-typst.js";
import { compileTypstToSvg } from "./compile.js";

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--")) {
      args[argv[i].slice(2)] = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const logs: string[] = [];

  if (!args.input || !args.output) {
    process.stdout.write(
      JSON.stringify({
        ok: false,
        status: "FAILED",
        error: { message: "Missing required --input and/or --output" },
        logs,
      }),
    );
    process.exitCode = 1;
    return;
  }

  const tempTypPath = path.join(os.tmpdir(), `function-plot-${randomUUID()}.typ`);

  try {
    const raw = await readFile(args.input, "utf8");
    const spec = functionPlotSpecSchema.parse(JSON.parse(raw));
    logs.push(`Read input from ${args.input}`);

    const typst = buildFunctionPlotTypst(spec);
    await writeFile(tempTypPath, typst, "utf8");

    const result = await compileTypstToSvg(tempTypPath, args.output);
    if (!result.ok) {
      process.stdout.write(
        JSON.stringify({
          ok: false,
          status: "FAILED",
          error: { message: result.message, details: result.details },
          logs,
        }),
      );
      process.exitCode = 1;
      return;
    }

    logs.push(`Wrote SVG to ${args.output}`);
    process.stdout.write(
      JSON.stringify({ ok: true, status: "COMPLETED", svgPath: args.output, logs }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    process.stdout.write(
      JSON.stringify({ ok: false, status: "FAILED", error: { message }, logs }),
    );
    process.exitCode = 1;
  } finally {
    await rm(tempTypPath, { force: true });
  }
}

void main();
