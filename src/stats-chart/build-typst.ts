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

// Font stacks mirroring anvilnote-renderer's own "title" (sans-ish) and
// "body" (serif-ish) preset ROLES — see schema.ts's fontFamilySchema
// comment for why these are duplicated literals, not a shared import.
// Every font family listed here is already bundled for offline use (see
// anvilnote-renderer's REQUIRED_FONT_FAMILIES / anvilnote-desktop's font
// packaging), so this needs no new font files.
const FONT_STACKS: Record<"sans" | "serif", string[]> = {
  sans: ["Roboto", "TaiwanPearl", "思源黑體 TW", "Noto Sans", "Noto Sans JP", "Noto Sans KR", "Noto Sans Thai"],
  serif: ["Tinos", "TW-MOE-Std-Song", "Noto Serif JP", "Noto Serif KR", "Noto Serif Thai", "Noto Serif"],
};

function fontStackLiteral(fontFamily: "sans" | "serif"): string {
  return `(${FONT_STACKS[fontFamily].map((name) => `"${name}"`).join(", ")})`;
}

// Applied once at the top of the generated document — covers every piece
// of chart text (axis ticks/labels, legend, value/percentage labels)
// since #set text is ambient or all markup/content after it.
const FONT_SET_TEXT: Record<"sans" | "serif", string> = {
  sans: `#set text(font: ${fontStackLiteral("sans")})`,
  serif: `#set text(font: ${fontStackLiteral("serif")})`,
};

// Real bug caught via a real compile: CJK category-axis tick labels (e.g.
// "測試", "你好") visually overlap the bar/plot area right at the axis
// line, even for very short labels — NOT gated by hasLongLabels's own
// rotation threshold, which only fires for labels over 6 characters. The
// default tick-label offset (cetz-plot's own axes.typ default,
// tick.label.offset: .15cm) is sized for Latin text; most CJK fonts have
// taller ascent/descent than Latin ones, so that fixed clearance isn't
// enough and the glyphs' ink visibly intrudes into the bar area.
// Reproduced with Typst's own default font (no custom font override), so
// this isn't specific to any one bundled font. `chart.barchart/
// columnchart` don't expose a "style:" or "tick offset" parameter of
// their own (their `..plot-args` only forwards to plot.plot's NAMED
// args) — the only place this style key resolves from is cetz's AMBIENT
// style context (ctx.style), set via `set-style` BEFORE the chart call,
// confirmed via real compile (passing style/bottom/tick as direct
// keyword args to chart.columnchart had no effect; set-style did).
// Applied to both "bottom" (column/line's horizontal category axis) and
// "left" (bar's vertical category axis) unconditionally — harmless extra
// clearance on whichever axis carries numeric (not category) labels too.
const AXIS_TICK_LABEL_CLEARANCE = [
  `import cetz.draw: set-style`,
  `set-style(axes: (bottom: (tick: (label: (offset: 1cm))), left: (tick: (label: (offset: 1cm)))))`,
].join("\n  ");

// Default grayscale cycle — AnvilNote's design language has zero color
// hues (see function-plot's own DASH_CYCLE/COLOR_CYCLE rationale), so new
// entries default to shades of gray instead of introducing hues; a
// per-entry `color` override still lets a user repaint any single slice/bar.
const DEFAULT_COLOR_CYCLE = ["#000000", "#404040", "#737373", "#a6a6a6", "#d9d9d9"];

function resolveColor(entry: CategoricalEntry, index: number): string {
  return entry.color ?? DEFAULT_COLOR_CYCLE[index % DEFAULT_COLOR_CYCLE.length];
}

// Relative luminance (WCAG formula, sRGB channels linearized) — used only
// to pick a legible on-slice text color (white on a dark slice, black on
// a light one). Not intended as a full WCAG contrast-ratio check (no
// comparison against a specific text size/weight threshold); a simple
// midpoint split is enough for pure black/white text against arbitrary
// fills, and was caught as a REAL bug via a real compile: on-slice
// percentage text is black by Typst's own default, which was completely
// invisible against this feature's own default near-black slice colors
// (#000000, #404040) until this fix.
function luminance(hexColor: string): number {
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(hexColor.slice(1 + offset, 3 + offset), 16) / 255);
  const linear = (channel: number) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrastingTextColor(hexColor: string): "white" | "black" {
  return luminance(hexColor) < 0.4 ? "white" : "black";
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

// Rounds to at most 2 decimal places, trimming trailing zeros (42 -> "42",
// 42.5 -> "42.5", 42.567 -> "42.57") — JS's own Number-to-string conversion
// already drops trailing zeros once the value itself is rounded, so no
// separate trim step is needed beyond the rounding.
function formatValueLabel(value: number): string {
  return String(Math.round(value * 100) / 100);
}

// Largest-remainder rounding: computes each entry's share of the total as a
// percentage string with exactly 2 decimals, guaranteed to sum to exactly
// "100.00" — naively rounding each entry's raw percentage independently
// (e.g. 33.333...% three ways) can sum to 99.99 or 100.01 depending on
// which way each one happens to round. Working in hundredths-of-a-percent
// integers (so the target sum is the exact integer 10000, not a float)
// avoids floating-point drift entirely: floor every entry first, then
// distribute the leftover 1-unit remainders to the entries with the
// largest fractional part, largest first — the standard "largest
// remainder" apportionment method.
function percentageStrings(data: CategoricalEntry[]): string[] {
  const total = data.reduce((sum, entry) => sum + entry.value, 0);
  if (total === 0) return data.map(() => "0.00");

  const scaled = data.map((entry) => (entry.value / total) * 10000);
  const floors = scaled.map(Math.floor);
  const distributed = floors.reduce((sum, value) => sum + value, 0);
  let remainder = 10000 - distributed;

  const byRemainingFraction = scaled
    .map((value, index) => ({ index, fraction: value - floors[index] }))
    .sort((a, b) => b.fraction - a.fraction);

  const result = [...floors];
  for (const { index } of byRemainingFraction) {
    if (remainder <= 0) break;
    result[index] += 1;
    remainder -= 1;
  }
  return result.map((hundredthsPercent) => (hundredthsPercent / 100).toFixed(2));
}

// Same shape as categoricalDataLiteral, but each label has its entry's
// percentage-of-total appended — used only when showPercentage is on.
// Percentages are computed from the data itself (not user-entered), so
// this always reflects the actual proportions and always sums to exactly
// 100.00% (see percentageStrings above).
function categoricalDataLiteralWithPercentage(data: CategoricalEntry[]): string {
  const percentages = percentageStrings(data);
  const rows = data
    .map(
      (entry, index) =>
        `  (label: "${escapeTypstString(`${entry.label} (${percentages[index]}%)`)}", value: ${entry.value})`,
    )
    .join(",\n");
  return `(\n${rows},\n)`;
}

// Builds cetz-plot piechart's `inner-label: (content: (value, label) =>
// ...)` argument for the "onSlice" percentage placement — a lookup
// function lazily reading from a Typst dictionary keyed by each entry's
// own (escaped) label string, embedded right above it. Labels are
// expected to be unique per entry (the common case); if two entries
// happen to share an identical label AND identical value, both slices
// correctly show the same percentage; if they share a label but differ
// in value, the dict key collision means both slices show whichever one
// happens to be the LAST matching key in source order — a cosmetic edge
// case, not a crash, and not worth a hard validation error over.
//
// This can't be done by simply appending "(XX.XX%)" onto the label text
// (categoricalDataLiteralWithPercentage's approach for "beside") because
// inner-label and outer-label are two SEPARATE cetz-plot mechanisms reading
// from two separate keys — outer-label defaults to the plain label, and
// "onSlice" mode needs that label to stay untouched while placing the
// percentage via inner-label instead. Confirmed via a real compile that
// inner-label's content function can be an arbitrary Typst function, and
// that dict.at(key, default: ...) works with arbitrary string keys (not
// just identifier-safe ones).
//
// Each entry's lookup value also carries a pre-computed contrasting text
// color (white/black, via contrastingTextColor), NOT just the percentage
// string — Typst's own default on-slice text color is black, which is
// completely invisible against this feature's own default near-black
// slice colors (#000000, #404040). Caught via a real compile showing an
// entirely blank slice where "40.00%" should have been.
function innerLabelPercentageArg(data: CategoricalEntry[]): string {
  const percentages = percentageStrings(data);
  const entries = data
    .map((entry, index) => {
      const color = resolveColor(entry, index);
      return `"${escapeTypstString(entry.label)}": (pct: "${percentages[index]}%", color: ${contrastingTextColor(color)})`;
    })
    .join(", ");
  return `,\n    inner-label: (content: (value, label) => {
      let entry = (${entries}).at(label, default: none)
      if entry == none { none } else { text(fill: entry.color)[#entry.pct] }
    })`;
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

// The fixed (non-entry-scaled) dimension shared by bar/column/boxwhisker —
// bumped from 6 to 8 per explicit feedback that charts felt too short.
const BASE_VALUE_AXIS_DIMENSION = 8;

// Long category labels along a horizontal axis overlap each other well
// before the chart itself runs out of room (confirmed visually: 4 entries
// like "Week2-Monday" already collide at the default horizontal
// orientation). Rotating them 45° gives each label a diagonal strip of
// space instead of a horizontal one, which is the standard fix charting
// libraries use for this.
//
// Only columnchart and boxwhisker need this: both lay their category
// labels along the x-axis at the bottom. barchart's category labels run
// along the y-axis instead (a vertical list, one per line — see barchart
// vs. columnchart orientation comment above), which doesn't have the
// same horizontal crowding problem regardless of label length.
//
// Mechanism: passing an explicit `x-ticks:` array of (position, content)
// pairs — with the content itself pre-wrapped in `rotate(45deg, ...)` —
// scopes the rotation to ONLY the x-axis's tick labels. An earlier
// approach used cetz's ambient `draw.set-style(axes: (tick: (label:
// (angle: ...))))`, but that style root applies to EVERY axis sharing
// the same "axes" style resolution (confirmed by real-world feedback:
// the value axis's own numeric ticks were rotating too, not just the
// intended category axis) — there's no separate x-only/y-only key at
// that shared root. Passing x-ticks directly bypasses that ambient
// system entirely; verified via a real compile that the y-axis's
// numbers stay perfectly upright with this approach, for both
// columnchart and boxwhisker (neither errors on a duplicate `x-ticks`
// argument, despite each already building its own internal tick list —
// confirmed empirically, not just assumed).
const LONG_LABEL_THRESHOLD = 6;

function hasLongLabels(entries: { label: string }[]): boolean {
  return entries.some((entry) => entry.label.length > LONG_LABEL_THRESHOLD);
}

// `[#"literal string"]` — NOT splicing the label directly into markup
// content — is required here: this content sits inside a Typst markup
// block (`[...]`), where `#`, `*`, `_`, `[`, `]`, etc. are all
// syntactically meaningful (a `#` in markup mode starts CODE, i.e.
// arbitrary function calls). A label is free-form user/import-provided
// text with no character whitelist (unlike function-plot's formula
// field), so splicing it as raw markup would let a label re-interpret
// itself as Typst code/markup instead of literal text — wrapping it as
// `#"...string..."` interpolates the STRING's contents as plain text,
// never re-parsed as markup, regardless of what characters it contains.
// Confirmed via a real compile with a label containing `*`, `#`, `[`,
// `]` — rendered completely literally, no formatting/injection.
// startIndex differs by chart type: columnchart's own internal x-tick
// positions are 0-based (matching its data array's index), while our own
// boxwhisker data literal (see the `x: index + 1` in buildStatsChartTypst
// below) is 1-based — the override's positions must match whichever
// convention the specific chart already uses, confirmed via real
// compiles for both.
function rotatedXTicksLiteral(entries: { label: string }[], startIndex: number): string {
  const ticks = entries
    .map(
      (entry, index) =>
        `      (${startIndex + index}, rotate(45deg, reflow: true)[#"${escapeTypstString(entry.label)}"])`,
    )
    .join(",\n");
  return `x-ticks: (\n${ticks},\n    ),\n    `;
}

// Same markup-injection-safety reasoning as rotatedXTicksLiteral above
// (`[#"..."]`, not raw markup splicing), but WITHOUT the rotate() wrapper —
// used by the custom showValues bar/column path (see buildStatsChartTypst
// below), which bypasses chart.barchart/columnchart's own internal tick-
// list generation entirely and so must always supply its own x-ticks/
// y-ticks, rotated or not, not just in the "long labels" case.
function plainTicksLiteral(entries: { label: string }[], startIndex: number): string {
  return entries
    .map((entry, index) => `      (${startIndex + index}, [#"${escapeTypstString(entry.label)}"])`)
    .join(",\n");
}

// Fraction of the value axis's own max used as clearance between a bar's
// value label and the bar's own top/end edge — a fixed pixel/point offset
// would look right at one axis scale and cramped/floating at another,
// since the chart's own size is independent of the axis's numeric range.
// Verified via a real compile: without any offset, a label's anchor point
// sits exactly at the bar's top edge, overlapping it (illegible against a
// dark fill); this fraction gives clear, consistent visual separation
// across small and large axis ranges alike.
const VALUE_LABEL_OFFSET_FRACTION = 0.03;

// content(...) calls for chart.columnchart's plot.annotate block — one
// per bar, anchored "south" (bottom-center of the label sits at the
// point, so the label grows upward, clearing the bar's top edge by
// _label-offset). Same markup-injection-safety reasoning as
// plainTicksLiteral above.
function columnValueAnnotationsLiteral(data: CategoricalEntry[]): string {
  return data
    .map(
      (entry, index) =>
        `      content((${index}, ${entry.value} + _label-offset), anchor: "south", [#"${escapeTypstString(formatValueLabel(entry.value))}"])`,
    )
    .join("\n");
}

// Same as columnValueAnnotationsLiteral, for chart.barchart's horizontal
// orientation instead: anchored "west" (left edge of the label sits at
// the point, so the label grows rightward past the bar's end), and
// positions mirror barchart's own reversed convention (entry 0 renders
// topmost, at position data.len()-1 — see buildStatsChartTypst's bar
// branch for the matching data-tuple construction).
function barValueAnnotationsLiteral(data: CategoricalEntry[]): string {
  const n = data.length;
  return data
    .map(
      (entry, index) =>
        `      content((${entry.value} + _label-offset, ${n - index - 1}), anchor: "west", [#"${escapeTypstString(formatValueLabel(entry.value))}"])`,
    )
    .join("\n");
}

export function buildStatsChartTypst(spec: StatsChartSpec): string {
  // `plot` (not just `chart`) is needed by: the custom showValues
  // bar/column path (calls plot.plot/plot.add-bar/plot.annotate directly
  // instead of going through chart.barchart/columnchart), and the line
  // chart type (built directly on plot.plot/plot.add — cetz-plot has no
  // dedicated categorical line-chart wrapper). Importing it unconditionally
  // for every other chart type would be a harmless but needless unused
  // import.
  const needsPlotImport =
    spec.chartType === "line" ||
    ((spec.chartType === "bar" || spec.chartType === "column") && spec.showValues);
  const header = `#import "@preview/cetz:${CETZ_VERSION}"
#import "@preview/cetz-plot:${CETZ_PLOT_VERSION}": chart${needsPlotImport ? ", plot" : ""}
#set page(width: auto, height: auto, margin: 8pt)
${FONT_SET_TEXT[spec.fontFamily]}`;

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
    // Our own box data literal above uses 1-based x positions (x: index+1),
    // so the tick-position override must match that, not start at 0.
    const rotateTicksArg = hasLongLabels(spec.data) ? rotatedXTicksLiteral(spec.data, 1) : "";
    // y-min: 0 — the value axis always starts at 0 regardless of the
    // data's own min (e.g. a box-whisker summary whose lowest value is
    // 10 still gets a y-axis floor of 0, not 10), per explicit feedback.
    // Only the floor is fixed; y-max is left to cetz-plot's own
    // auto-fit, unlike bar/columnchart's explicit categoricalAxisMax
    // rounding below (box-whisker's value spread is usually tighter and
    // didn't have the same "floating above the last gridline" complaint).
    return `${header}
#cetz.canvas({
  ${AXIS_TICK_LABEL_CLEARANCE}
  chart.boxwhisker(
    size: (${width}, ${BASE_VALUE_AXIS_DIMENSION}),
    label-key: "label",
    y-min: 0,
    ${rotateTicksArg}(
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
    // "beside": percentage baked directly into each slice's own label
    // text — piechart has no built-in "show percentage" option, but its
    // label IS just whatever string label-key resolves to, so appending
    // "(XX.XX%)" there is sufficient and needs no other change to the
    // call itself. "onSlice": label text stays plain; percentage instead
    // goes through inner-label, a genuinely separate cetz-plot mechanism
    // (see innerLabelPercentageArg's own comment for why these can't
    // share one code path).
    const pieDataLiteral =
      spec.showPercentage === "beside" ? categoricalDataLiteralWithPercentage(spec.data) : dataLiteral;
    const innerLabelArg = spec.showPercentage === "onSlice" ? innerLabelPercentageArg(spec.data) : "";
    return `${header}
#cetz.canvas({
  chart.piechart(
    ${pieDataLiteral},
    value-key: "value",
    label-key: "label",
    radius: 3,
    slice-style: ${colorArrayLiteral(spec.data)}${legendArg}${innerLabelArg}
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

  if (spec.chartType === "line") {
    // cetz-plot has no dedicated "categorical line chart" wrapper (unlike
    // bar/column/pyramid/pie) — built directly on plot.plot/plot.add, the
    // same lower-level primitives chart.barchart/columnchart themselves
    // sit on top of (see showValues's own comment below for that same
    // pattern). Each entry's x position is just its own index, exactly
    // like bar/column's category axis, NOT a continuous domain the way
    // function-plot's curves are.
    //
    // A connected line has ONE color, not one per point — the per-entry
    // `color` override (meaningful for bar/pie/pyramid slices) doesn't
    // apply here; only the first entry's resolved color (or the default
    // cycle's first color) is used for the whole line + its markers.
    const lineColor = resolveColor(spec.data[0], 0);
    const n = spec.data.length;
    const axisMax = categoricalAxisMax(spec.data);
    const entryAxisDimension = scaledDimension(n);
    const pointTuples = spec.data.map((entry, index) => `      (${index}, ${entry.value})`).join(",\n");
    const ticksLiteral = hasLongLabels(spec.data)
      ? spec.data
          .map(
            (entry, index) =>
              `      (${index}, rotate(45deg, reflow: true)[#"${escapeTypstString(entry.label)}"])`,
          )
          .join(",\n")
      : plainTicksLiteral(spec.data, 0);
    return `${header}
#cetz.canvas({
  ${AXIS_TICK_LABEL_CLEARANCE}
  plot.plot(
    size: (${entryAxisDimension}, ${BASE_VALUE_AXIS_DIMENSION}),
    axis-style: "scientific-auto",
    y-grid: true,
    y-tick-step: ${categoricalTickStep(spec.data)},
    y-max: ${axisMax},
    x-tick-step: none,
    x-ticks: (
${ticksLiteral},
    ),
    {
      plot.add(
        (
${pointTuples},
        ),
        mark: "o",
        mark-style: (stroke: rgb("${lineColor}"), fill: rgb("${lineColor}")),
        style: (stroke: rgb("${lineColor}")),
      )
    }
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
  const size =
    spec.chartType === "bar"
      ? `(${BASE_VALUE_AXIS_DIMENSION}, ${entryAxisDimension})`
      : `(${entryAxisDimension}, ${BASE_VALUE_AXIS_DIMENSION})`;
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
  // this). columnchart's own internal x-tick positions are 0-based.
  const rotateTicksArg =
    spec.chartType === "column" && hasLongLabels(spec.data) ? rotatedXTicksLiteral(spec.data, 0) : "";

  if (!spec.showValues) {
    return `${header}
#cetz.canvas({
  ${AXIS_TICK_LABEL_CLEARANCE}
  chart.${chartFn}(
    ${dataLiteral},
    value-key: "value",
    label-key: "label",
    size: ${size},
    ${valueAxisArgs}${rotateTicksArg}bar-style: ${paletteLiteral(spec.data)},
  )
})
`;
  }

  // showValues bypasses chart.barchart/columnchart entirely, calling
  // plot.plot/plot.add-bar/plot.annotate directly — cetz-plot's own
  // bar/columnchart wrappers have no per-bar value-label feature (grep
  // across chart/*.typ turned up nothing), and their `..plot-args` only
  // forwards NAMED arguments to the internal plot.plot call, not extra
  // BODY content, so a value-label overlay can't be injected into their
  // existing call from the outside. plot.add-bar is the exact same
  // primitive chart.barchart/columnchart use internally (confirmed by
  // reading both files' source) — this replicates their setup (x/y-min/
  // max, tick lists, bar-width, axes orientation) rather than reimplementing
  // bar POSITIONING itself, which stays inside that shared, already-tested
  // primitive. Verified via real compiles for both orientations that this
  // produces the same visual bar layout as the wrapped call, plus correctly
  // positioned value labels.
  const n = spec.data.length;
  const axisMax = categoricalAxisMax(spec.data);
  const labelOffsetLet = `#let _label-offset = ${axisMax} * ${VALUE_LABEL_OFFSET_FRACTION}`;

  if (spec.chartType === "column") {
    const ticksLiteral = hasLongLabels(spec.data)
      ? spec.data
          .map(
            (entry, index) =>
              `      (${index}, rotate(45deg, reflow: true)[#"${escapeTypstString(entry.label)}"])`,
          )
          .join(",\n")
      : plainTicksLiteral(spec.data, 0);
    const dataTuples = spec.data
      .map((entry, index) => `      (${index}, (${entry.value},), ())`)
      .join(",\n");
    return `${header}
${labelOffsetLet}
#cetz.canvas({
  import cetz.draw: content
  ${AXIS_TICK_LABEL_CLEARANCE}
  let _x-inset = calc.max(1, 0.8 / 2)
  plot.plot(
    size: ${size},
    axis-style: "scientific-auto",
    y-grid: true,
    y-tick-step: ${categoricalTickStep(spec.data)},
    y-max: ${axisMax},
    x-min: -_x-inset,
    x-max: ${n} + _x-inset - 1,
    x-tick-step: none,
    x-ticks: (
${ticksLiteral},
    ),
    plot-style: ${paletteLiteral(spec.data)},
    {
      plot.add-bar(
        (
${dataTuples},
        ),
        x-key: 0,
        y-key: 1,
        mode: "basic",
        bar-width: 0.8,
        axes: ("x", "y"),
      )
      plot.annotate({
${columnValueAnnotationsLiteral(spec.data)}
      })
    }
  )
})
`;
  }

  // bar (horizontal): entries render topmost-first, at position
  // data.len()-1 down to 0 — matching chart.barchart's own reversed
  // convention (see barValueAnnotationsLiteral's comment) — and bar-width
  // is negative, also matching barchart.typ's own call exactly.
  const barTicksLiteral = spec.data
    .map((entry, index) => `      (${n - index - 1}, [#"${escapeTypstString(entry.label)}"])`)
    .join(",\n");
  const barDataTuples = spec.data
    .map((entry, index) => `      (${n - index - 1}, (${entry.value},), ())`)
    .join(",\n");
  return `${header}
${labelOffsetLet}
#cetz.canvas({
  import cetz.draw: content
  ${AXIS_TICK_LABEL_CLEARANCE}
  let _y-inset = calc.max(1, 0.8 / 2)
  plot.plot(
    size: ${size},
    axis-style: "scientific-auto",
    x-grid: true,
    x-tick-step: ${categoricalTickStep(spec.data)},
    x-max: ${axisMax},
    y-min: -_y-inset,
    y-max: ${n} + _y-inset - 1,
    y-tick-step: none,
    y-ticks: (
${barTicksLiteral},
    ),
    plot-style: ${paletteLiteral(spec.data)},
    {
      plot.add-bar(
        (
${barDataTuples},
        ),
        x-key: 0,
        y-key: 1,
        mode: "basic",
        bar-width: -0.8,
        axes: ("y", "x"),
      )
      plot.annotate({
${barValueAnnotationsLiteral(spec.data)}
      })
    }
  )
})
`;
}
