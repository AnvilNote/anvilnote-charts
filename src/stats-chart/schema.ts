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

// bar/column/pyramid share one data shape and have no legend concept in
// cetz-plot (no `legend` style key on any of the three) — only piechart
// has a built-in legend, confirmed by reading cetz-plot's own source
// (grep for "legend" across chart/*.typ turned up nothing for these three).
const categoricalBase = z.object({
  kind: z.literal("statsChart"),
  data: z.array(categoricalEntrySchema).min(1).max(MAX_ENTRIES),
  fontFamily: fontFamilySchema,
});

// showValues: prints each bar/column's own value above/beside it (rounded
// to at most 2 decimal places — see build-typst.ts's formatValueLabel).
// Defaulted false (not required): added after the initial spec shape
// shipped, so older saved specs missing this field still validate.
const barChartSchema = categoricalBase.extend({
  chartType: z.literal("bar"),
  showValues: z.boolean().default(false),
});
const columnChartSchema = categoricalBase.extend({
  chartType: z.literal("column"),
  showValues: z.boolean().default(false),
});
const pyramidChartSchema = categoricalBase.extend({ chartType: z.literal("pyramid") });
// Point-connected line over the same categorical (label, value) data shape
// as bar/column — NOT a continuous function-plot; x positions are just
// each entry's index, same as bar/column's own category axis. Since a
// single connected line has one color (not one per point), only the
// FIRST entry's resolved color (or the default cycle's first color) is
// actually used — see build-typst.ts's lineChart branch.
const lineChartSchema = categoricalBase.extend({ chartType: z.literal("line") });
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
  pyramidChartSchema,
  lineChartSchema,
  boxWhiskerChartSchema,
]);

export type CategoricalEntry = z.infer<typeof categoricalEntrySchema>;
export type BoxWhiskerEntry = z.infer<typeof boxWhiskerEntrySchema>;
export type StatsChartSpec = z.infer<typeof statsChartSpecSchema>;
export type FontFamily = z.infer<typeof fontFamilySchema>;
export { FONT_FAMILIES };
