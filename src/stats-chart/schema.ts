import { z } from "zod";

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const LABEL_MAX_LEN = 100;
const MAX_ENTRIES = 20;

const categoricalEntrySchema = z.object({
  label: z.string().min(1).max(LABEL_MAX_LEN),
  value: z.number().finite(),
  // Per-entry override; the CLI falls back to a default grayscale cycle
  // (see build-typst.ts) when omitted, matching function-plot's own
  // "grayscale by default, user can repaint via the color picker" design.
  color: z.string().regex(HEX_COLOR_PATTERN, "Color must be a 6-digit hex value").optional(),
});

// Scatter's own point shape: a genuine numeric (x, y) pair, NOT
// categorical's (label, value) — a scatter plot's whole point is
// plotting two independent numeric variables against each other, with
// no meaningful "category" axis. MAX_ENTRIES is deliberately larger than
// categorical's own 20-entry cap (scatter data is commonly a larger
// sample; a trend line needs enough points to be meaningful).
const SCATTER_MAX_ENTRIES = 200;
const scatterEntrySchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

// cetz-plot's chart.boxwhisker takes one dict per box: {min, q1, q2 (median),
// q3, max} plus a label — q1 <= median <= q3 and min <= q1, q3 <= max are
// real statistical constraints (a box-whisker summary is nonsensical
// otherwise), not just a Typst-syntax whitelist like function-plot's.
const boxWhiskerEntrySchema = z
  .object({
    label: z.string().min(1).max(LABEL_MAX_LEN),
    min: z.number().finite(),
    q1: z.number().finite(),
    median: z.number().finite(),
    q3: z.number().finite(),
    max: z.number().finite(),
  })
  .refine((e) => e.min <= e.q1 && e.q1 <= e.median && e.median <= e.q3 && e.q3 <= e.max, {
    message: "Values must satisfy min <= q1 <= median <= q3 <= max",
    path: ["min"],
  });

// Chart-wide text font — mirrors anvilnote-renderer's own "title"
// (sans-ish: Roboto/TaiwanPearl/思源黑體 TW/Noto Sans...) vs. "body"
// (serif-ish: Tinos/TW-MOE-Std-Song/Noto Serif...) preset ROLES, per
// explicit feedback that chart font choice should match the app's
// existing font vocabulary — NOT a shared import (anvilnote-charts and
// anvilnote-renderer don't share source; see build-typst.ts's own
// duplicated-stack comment), just the same two stack CONTENTS. Applies
// to every piece of chart text (axis ticks, labels, legend, value/
// percentage labels) via a single #set text(font: ...) at the top of
// the generated document. Defaulted (not required): added after the
// initial spec shape shipped.
const FONT_FAMILIES = ["sans", "serif"] as const;
const fontFamilySchema = z.enum(FONT_FAMILIES).default("sans");

// bar/column/line share one data shape and have no legend concept in
// cetz-plot (no `legend` style key on any of them) — only piechart has a
// built-in legend, confirmed by reading cetz-plot's own source (grep for
// "legend" across chart/*.typ turned up nothing for these three).
const categoricalBase = z.object({
  kind: z.literal("statsChart"),
  data: z.array(categoricalEntrySchema).min(1).max(MAX_ENTRIES),
  fontFamily: fontFamilySchema,
});

// Custom axis label text + rotation, for the three chart types built on
// cetz-plot's plot.plot (bar/column/line) — NOT pie/boxwhisker, which
// don't expose this same axis-label mechanism (piechart has no x/y axes
// at all; chart.boxwhisker doesn't forward x-label/y-label). cetz-plot's
// own plot/util.typ defaults an axis's label to `$#name$` (a literal "x"
// or "y" math-mode symbol) whenever no explicit x-label/y-label option is
// given — confirmed by reading setup-axes's own `get-axis-option(name,
// "label", $#name$)`. An empty string here means "no label" (passed as
// `none`), not literally falling back to that "x"/"y" placeholder, since
// showing a meaningless single-letter axis label by default is far less
// useful than hiding it when the user hasn't set one.
//
// yLabelRotated: cetz-plot's own default axis-label angle is "auto",
// which already rotates a VERTICAL axis's label -90° (confirmed via real
// compile) — this toggle exists so a user who prefers a horizontal
// (non-rotated) y-axis label can turn that default off, not because
// rotation is otherwise unavailable.
const axisLabelFields = {
  xLabel: z.string().max(50).default(""),
  yLabel: z.string().max(50).default(""),
  yLabelRotated: z.boolean().default(true),
};

// showValues: prints each bar/column's own value above/beside it (rounded
// to at most 2 decimal places — see build-typst.ts's formatValueLabel).
// Defaulted false (not required): added after the initial spec shape
// shipped, so older saved specs missing this field still validate.
//
// showGridLines: toggles the reference gridlines running across the
// value axis (cetz-plot's own x-grid/y-grid option) — bar/column only,
// per explicit feedback; not added to line (not requested, and a line
// chart's own data-connecting strokes already give it a different visual
// density than bar/column's discrete bars).
const barChartSchema = categoricalBase.extend({
  chartType: z.literal("bar"),
  showValues: z.boolean().default(false),
  showGridLines: z.boolean().default(true),
  ...axisLabelFields,
});
const columnChartSchema = categoricalBase.extend({
  chartType: z.literal("column"),
  showValues: z.boolean().default(false),
  showGridLines: z.boolean().default(true),
  ...axisLabelFields,
});
// Point-connected line over the same categorical (label, value) data shape
// as bar/column — NOT a continuous function-plot; x positions are just
// each entry's index, same as bar/column's own category axis. Since a
// single connected line has one color (not one per point), only the
// FIRST entry's resolved color (or the default cycle's first color) is
// actually used — see build-typst.ts's lineChart branch.
const lineChartSchema = categoricalBase.extend({ chartType: z.literal("line"), ...axisLabelFields });

// "linear": ordinary least-squares straight-line fit.
// "lowess": locally weighted scatterplot smoothing — a non-linear curve
// that follows local trends rather than forcing one global straight
// line; better for data with a curved or non-monotonic relationship.
// Both computed from the data itself in build-typst.ts, not user-entered.
const TREND_LINE_KINDS = ["none", "linear", "lowess"] as const;
// User-pickable trend-line color, separate from the scatter points' own
// SCATTER_POINT_COLOR — defaulted (not required) so a spec predating this
// field still validates; build-typst.ts falls back to its own
// TREND_LINE_COLOR constant when this is left at the default gray.
const scatterChartSchema = z.object({
  kind: z.literal("statsChart"),
  chartType: z.literal("scatter"),
  data: z.array(scatterEntrySchema).min(1).max(SCATTER_MAX_ENTRIES),
  fontFamily: fontFamilySchema,
  trendLine: z.enum(TREND_LINE_KINDS).default("none"),
  trendLineColor: z.string().regex(HEX_COLOR_PATTERN, "Color must be a 6-digit hex value").default("#737373"),
  // Value axis reference gridlines — same concept as bar/column's own
  // showGridLines, defaulted true (existing behavior unchanged).
  showGridLines: z.boolean().default(true),
  ...axisLabelFields,
});
// Where (if at all) each slice's share of the total is displayed:
//   - "none": no percentage shown
//   - "onSlice": percentage rendered directly on the slice itself (via
//     cetz-plot's inner-label mechanism), label text stays plain
//   - "beside": percentage appended to the label text next to the slice
//     (e.g. "Label (12.34%)"), matching the outer-label position
// Computed from the data itself (not user-entered) either way, and always
// sums to exactly 100.00% via largest-remainder rounding (see
// build-typst.ts's percentageStrings).
const PERCENTAGE_PLACEMENTS = ["none", "onSlice", "beside"] as const;
const pieChartSchema = categoricalBase.extend({
  chartType: z.literal("pie"),
  showLegend: z.boolean().default(true),
  showPercentage: z.enum(PERCENTAGE_PLACEMENTS).default("none"),
});

const boxWhiskerChartSchema = z.object({
  kind: z.literal("statsChart"),
  chartType: z.literal("boxwhisker"),
  data: z.array(boxWhiskerEntrySchema).min(1).max(MAX_ENTRIES),
  fontFamily: fontFamilySchema,
});

export const statsChartSpecSchema = z.discriminatedUnion("chartType", [
  barChartSchema,
  columnChartSchema,
  pieChartSchema,
  lineChartSchema,
  scatterChartSchema,
  boxWhiskerChartSchema,
]);

export type CategoricalEntry = z.infer<typeof categoricalEntrySchema>;
export type ScatterEntry = z.infer<typeof scatterEntrySchema>;
export type BoxWhiskerEntry = z.infer<typeof boxWhiskerEntrySchema>;
export type StatsChartSpec = z.infer<typeof statsChartSpecSchema>;
export type FontFamily = z.infer<typeof fontFamilySchema>;
export { FONT_FAMILIES };
