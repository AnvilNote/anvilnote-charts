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

// cetz-plot's own tick-step default for bar/columnchart's value axis packs
// one tick per unit of the axis's "natural" step, which crowds together
// (and visibly overlaps, e.g. "90100") once the value range is much wider
// than the chart's fixed size — the axis length scales with entry COUNT
// (see scaledDimension below), not with value MAGNITUDE, so a chart with
// only 2 bars but a max value of 100 gets the same narrow axis as one
// with a max value of 10. Computing an explicit "nice" step (aiming for
// ~5 ticks) and passing it via x-tick-step/y-tick-step fixes this
// regardless of chart size — confirmed via a real compile comparing
// default vs. explicit step for the same 0-100 range.
function niceTickStep(maxAbsValue: number): number {
  if (maxAbsValue <= 0) return 1;
  const roughStep = maxAbsValue / 5;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const niceNormalized = normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10;
  return niceNormalized * magnitude;
}

function categoricalTickStep(data: CategoricalEntry[]): number {
  const maxAbsValue = Math.max(...data.map((entry) => Math.abs(entry.value)));
  return niceTickStep(maxAbsValue);
}

// Without an explicit upper bound, cetz-plot's value axis auto-fits to
// the exact data max (e.g. 92) rather than a round number — the topmost
// gridline lands wherever the last tick-step multiple below the data max
// falls (80, for a max of 92 with a step of 20), leaving the tallest
// bar's actual value floating above the last labeled gridline instead of
// the axis extending to a clean rounded top. Rounding the max UP to the
// next tick-step multiple (100, for a max of 92 with a step of 20) gives
// the axis a full final gridline at a round number. Confirmed via a real
// compile: passing this as x-max/y-max alongside the existing
// x-tick-step/y-tick-step produces exactly that.
function categoricalAxisMax(data: CategoricalEntry[]): number {
  const maxValue = Math.max(...data.map((entry) => entry.value));
  const step = categoricalTickStep(data);
  return Math.ceil(maxValue / step) * step;
}

// Scales the chart's entry-count axis with the number of entries (so a
// 2-bar chart isn't rendered at the same size as a 15-bar chart), but
// clamped at MAX_SCALED_DIMENSION — without a ceiling, a chart with many
// entries (e.g. a 20-row CSV import, right at the schema's MAX_ENTRIES)
// grows unboundedly wide/tall and overflows its container instead of
// just packing bars/boxes more tightly at a fixed overall size, which is
// the standard "adjust bandwidth to entry count" behavior other charting
// tools use. Verified via a real compile with 20 categorical entries: the
// clamp keeps the chart within a fixed size, with individual bars
// getting proportionally narrower instead of the whole chart exploding
// past its bounds.
const MIN_SCALED_DIMENSION = 6;
const MAX_SCALED_DIMENSION = 24;

function scaledDimension(entryCount: number): number {
  return Math.min(Math.max(MIN_SCALED_DIMENSION, entryCount * 2), MAX_SCALED_DIMENSION);
}

// Long category labels along a horizontal axis overlap each other well
// before the chart itself runs out of room (confirmed visually: 4 entries
// like "Week2-Monday" already collide at the default horizontal
// orientation). Rotating them 45° gives each label a diagonal strip of
// space instead of a horizontal one, which is the standard fix charting
// libraries use for this — confirmed via a real compile: identical data
// goes from fully overlapping to fully legible with this override.
//
// Only columnchart and boxwhisker need this: both lay their category
// labels along the x-axis at the bottom (confirmed for boxwhisker via a
// real compile using the same override). barchart's category labels run
// along the y-axis instead (a vertical list, one per line — see barchart
// vs. columnchart orientation comment above), which doesn't have the
// same horizontal crowding problem regardless of label length.
//
// Mechanism: this is NOT a named parameter any chart wrapper function
// exposes — attempts to pass it as `x-tick-label-angle:` or a `style:`
// keyword argument were silently accepted but had no visible effect.
// cetz's actual style system is ambient (set via `draw.set-style(...)`
// inside the same canvas scope, read later by `styles.resolve(ctx.style,
// root: "axes", ...)` inside cetz-plot's axes.typ), not argument-based.
const LONG_LABEL_THRESHOLD = 6;

function hasLongLabels(entries: { label: string }[]): boolean {
  return entries.some((entry) => entry.label.length > LONG_LABEL_THRESHOLD);
}

// The label offset (distance from tick to rotated label) needs to scale
// with the LONGEST label's length, not be one fixed constant — a longer
// rotated string reaches further back up toward the bar directly above
// its tick, so it needs proportionally more clearance to avoid visually
// intersecting that bar; a short label needs much less. Confirmed via
// real compiles at both ends: 4 entries with ~13-character labels needed
// ~1.2cm to fully clear their bars, while a fixed .3cm-ish base is enough
// for labels just past the rotation threshold.
function rotatedLabelOffset(maxLabelLength: number): string {
  const cm = Math.min(0.3 + maxLabelLength * 0.08, 2.5);
  return `${cm.toFixed(2)}cm`;
}

function rotateLabelsStyle(entries: { label: string }[]): string {
  const maxLabelLength = Math.max(...entries.map((entry) => entry.label.length));
  const offset = rotatedLabelOffset(maxLabelLength);
  return `cetz.draw.set-style(axes: (tick: (label: (angle: 45deg, offset: ${offset}))))\n  `;
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
    const width = scaledDimension(spec.data.length);
    const rotateStyle = hasLongLabels(spec.data) ? rotateLabelsStyle(spec.data) : "";
    return `${header}
#cetz.canvas({
  ${rotateStyle}chart.boxwhisker(
    size: (${width}, 6),
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
    radius: 3,
    slice-style: ${colorArrayLiteral(spec.data)}${legendArg}
  )
})
`;
  }

  if (spec.chartType === "pyramid") {
    // level-height defaults to 1 in cetz-plot; doubled to 2 per explicit
    // feedback that the default rendered too small/cramped.
    return `${header}
#cetz.canvas({
  chart.pyramid(
    ${dataLiteral},
    value-key: "value",
    label-key: "label",
    level-height: 2,
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
  const entryAxisDimension = scaledDimension(spec.data.length);
  const size = spec.chartType === "bar" ? `(6, ${entryAxisDimension})` : `(${entryAxisDimension}, 6)`;
  const chartFn = spec.chartType === "bar" ? "barchart" : "columnchart";
  // barchart's category axis is y (so its VALUE axis, needing the
  // tick-step/max fix, is x); columnchart's category axis is x (so its
  // value axis is y) — confirmed by reading both files' own
  // `x-tick-step: none` / category tick-list placement.
  const valueAxisArgs =
    spec.chartType === "bar"
      ? `x-tick-step: ${categoricalTickStep(spec.data)},\n    x-max: ${categoricalAxisMax(spec.data)},\n    `
      : `y-tick-step: ${categoricalTickStep(spec.data)},\n    y-max: ${categoricalAxisMax(spec.data)},\n    `;
  // Only columnchart's category labels run along the horizontal x-axis
  // (see hasLongLabels's own comment above for why barchart doesn't need
  // this).
  const rotateStyle = spec.chartType === "column" && hasLongLabels(spec.data) ? rotateLabelsStyle(spec.data) : "";
  return `${header}
#cetz.canvas({
  ${rotateStyle}chart.${chartFn}(
    ${dataLiteral},
    value-key: "value",
    label-key: "label",
    size: ${size},
    ${valueAxisArgs}bar-style: ${paletteLiteral(spec.data)},
  )
})
`;
}
