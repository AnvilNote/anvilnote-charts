import type { CategoricalEntry, StatsChartSpec } from "./schema.js";

// Pinned to whatever versions are staged under
// anvilnote-desktop/resources/typst-packages/preview/{cetz,cetz-plot}/<version>/
// for offline use — same pattern as simple-plot (see function-plot's
// build-typst.ts). CETZ_VERSION is deliberately pinned to match
// cetz-plot's OWN internal dependency (its src/cetz.typ does
// `#import "@preview/cetz:0.4.0"`), not just "whatever the latest cetz
// release is" — using a different cetz version for the outer
// `cetz.canvas(...)` call than the one cetz-plot's internals were built
// and tested against risks subtle incompatibilities even if it happens
// to compile.
export const CETZ_VERSION = "0.4.0";
export const CETZ_PLOT_VERSION = "0.1.2";

// Default grayscale cycle — AnvilNote's design language has zero color
// hues (see function-plot's own DASH_CYCLE/COLOR_CYCLE rationale), so new
// entries default to shades of gray instead of introducing hues; a
// per-entry `color` override still lets a user repaint any single slice/bar.
const DEFAULT_COLOR_CYCLE = ["#000000", "#404040", "#737373", "#a6a6a6", "#d9d9d9"];

function resolveColor(entry: CategoricalEntry, index: number): string {
  return entry.color ?? DEFAULT_COLOR_CYCLE[index % DEFAULT_COLOR_CYCLE.length];
}

function escapeTypstString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

function categoricalDataLiteral(data: CategoricalEntry[]): string {
  const rows = data
    .map((entry) => `  (label: "${escapeTypstString(entry.label)}", value: ${entry.value})`)
    .join(",\n");
  return `(\n${rows},\n)`;
}

// bar/column validate their `bar-style` argument as a "plot-style" — a
// palette FUNCTION (as returned by cetz's own `palette.new(colors: (...))`),
// not a bare array of colors. Confirmed by a real compile: passing a raw
// color array directly to bar-style fails with "plot-style must be of type
// dictionary" (routed through cetz-plot's shared plot.plot machinery).
// piechart's `slice-style` is a separate, more lenient code path that
// accepts a bare array directly (colorArrayLiteral below). pyramid's own
// `level-style` is more lenient too (its source branches on `type(...) ==
// array` as well as `function`) — the palette.new() wrapper isn't strictly
// required there, but is used anyway for consistency with bar/column since
// it's already confirmed working.
// Trailing comma is required, not cosmetic: Typst parses a parenthesized
// expression with no comma as a grouping expression, not a 1-element
// array — `(rgb("#000000"))` is just `rgb("#000000")`, while
// `(rgb("#000000"),)` is the actual 1-element array cetz's palette.new()
// (and piechart's slice-style) expects. Confirmed by a real compile: a
// single-entry chart without this trailing comma fails inside
// palette.new() with "type color has no method `len`" (bar/column/
// pyramid) or "expected function, found none" (pie). The schema's
// `data` array is `.min(1)`, so this must handle exactly one entry
// correctly, not just two or more.
function colorArrayLiteral(data: CategoricalEntry[]): string {
  const colors = data.map((entry, index) => `rgb("${resolveColor(entry, index)}")`).join(", ");
  return `(${colors},)`;
}

function paletteLiteral(data: CategoricalEntry[]): string {
  return `cetz.palette.new(colors: ${colorArrayLiteral(data)})`;
}

export function buildStatsChartTypst(spec: StatsChartSpec): string {
  const header = `#import "@preview/cetz:${CETZ_VERSION}"
#import "@preview/cetz-plot:${CETZ_PLOT_VERSION}": chart
#set page(width: auto, height: auto, margin: 8pt)`;

  if (spec.chartType === "boxwhisker") {
    const boxes = spec.data
      .map(
        (entry, index) =>
          `  (x: ${index + 1}, label: "${escapeTypstString(entry.label)}", min: ${entry.min}, q1: ${entry.q1}, q2: ${entry.median}, q3: ${entry.q3}, max: ${entry.max})`,
      )
      .join(",\n");
    // Width scales with the number of boxes (each occupies ~1 unit, per
    // cetz-plot's own box-width doc default) instead of a fixed constant,
    // so 2 boxes and 15 boxes don't render at the same cramped/wasted size.
    // Unlike bar/columnchart, boxwhisker's own "auto" handling only
    // resolves for the SECOND size entry (verified: passing `auto` for the
    // FIRST entry throws "cannot compare auto and integer"), so the width
    // here must always be a concrete number.
    const width = Math.max(4, spec.data.length * 1.5);
    return `${header}
#cetz.canvas({
  chart.boxwhisker(
    size: (${width}, 4),
    label-key: "label",
    (
${boxes},
    ),
  )
})
`;
  }

  const dataLiteral = categoricalDataLiteral(spec.data);

  if (spec.chartType === "pie") {
    // legend: (label: none) is how cetz-plot's piechart suppresses its
    // otherwise-automatic legend (it renders as soon as any entry has a
    // label) — confirmed by a real compile; there's no separate boolean
    // "show legend" flag in its own API.
    const legendArg = spec.showLegend ? "" : ",\n    legend: (label: none)";
    return `${header}
#cetz.canvas({
  chart.piechart(
    ${dataLiteral},
    value-key: "value",
    label-key: "label",
    radius: 2,
    slice-style: ${colorArrayLiteral(spec.data)}${legendArg}
  )
})
`;
  }

  if (spec.chartType === "pyramid") {
    return `${header}
#cetz.canvas({
  chart.pyramid(
    ${dataLiteral},
    value-key: "value",
    label-key: "label",
    level-style: ${paletteLiteral(spec.data)},
  )
})
`;
  }

  // bar (horizontal) and column (vertical) share the exact same call shape
  // in cetz-plot — only the function name and axis orientation differ
  // (confirmed by reading both barchart.typ and columnchart.typ: identical
  // parameter lists). Barchart stacks entries along its HEIGHT (bars grow
  // left-to-right); columnchart spreads them along its WIDTH (bars grow
  // bottom-to-top) — so which dimension scales with entry count flips
  // between the two, same reasoning as boxwhisker's width above.
  const scaledDimension = Math.max(4, spec.data.length * 1.5);
  const size = spec.chartType === "bar" ? `(4, ${scaledDimension})` : `(${scaledDimension}, 4)`;
  const chartFn = spec.chartType === "bar" ? "barchart" : "columnchart";
  return `${header}
#cetz.canvas({
  chart.${chartFn}(
    ${dataLiteral},
    value-key: "value",
    label-key: "label",
    size: ${size},
    bar-style: ${paletteLiteral(spec.data)},
  )
})
`;
}
