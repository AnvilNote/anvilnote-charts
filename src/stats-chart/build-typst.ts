import type { CategoricalEntry, StatsChartSpec } from "./schema.js";

// Pinned to whatever versions are staged under
// anvilnote-desktop/resources/typst-packages/preview/{cetz,cetz-plot}/<version>/
// for offline use — same pattern as simple-plot (see function-plot's
// build-typst.ts). cetz-plot depends on cetz directly, so both must be
// bundled together.
export const CETZ_VERSION = "0.4.2";
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
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function categoricalDataLiteral(data: CategoricalEntry[]): string {
  const rows = data
    .map((entry) => `  (label: "${escapeTypstString(entry.label)}", value: ${entry.value})`)
    .join(",\n");
  return `(\n${rows},\n)`;
}

// bar/column/pyramid all validate their `bar-style`/`level-style` argument
// as a "plot-style" — a palette FUNCTION (as returned by cetz's own
// `palette.new(colors: (...))`), not a bare array of colors. Confirmed by a
// real compile: passing a raw color array directly to bar-style fails with
// "plot-style must be of type dictionary", while piechart's `slice-style`
// (a separate, more lenient code path) accepts a bare array directly — the
// two chart families don't share the same style-argument handling despite
// looking similar in the docs.
function paletteLiteral(data: CategoricalEntry[]): string {
  const colors = data.map((entry, index) => `rgb("${resolveColor(entry, index)}")`).join(", ");
  return `cetz.palette.new(colors: (${colors}))`;
}

function pieColorArrayLiteral(data: CategoricalEntry[]): string {
  const colors = data.map((entry, index) => `rgb("${resolveColor(entry, index)}")`).join(", ");
  return `(${colors})`;
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
    slice-style: ${pieColorArrayLiteral(spec.data)}${legendArg}
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
