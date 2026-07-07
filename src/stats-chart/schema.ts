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

// bar/column/pyramid share one data shape and have no legend concept in
// cetz-plot (no `legend` style key on any of the three) — only piechart
// has a built-in legend, confirmed by reading cetz-plot's own source
// (grep for "legend" across chart/*.typ turned up nothing for these three).
const categoricalBase = z.object({
  kind: z.literal("statsChart"),
  data: z.array(categoricalEntrySchema).min(1).max(MAX_ENTRIES),
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
const pieChartSchema = categoricalBase.extend({
  chartType: z.literal("pie"),
  showLegend: z.boolean().default(true),
  // Appends each slice's share of the total (e.g. "Label (12.34%)") to its
  // displayed label — computed from the data itself, not user-entered, and
  // always sums to exactly 100.00% via largest-remainder rounding (see
  // build-typst.ts's percentageLabels).
  showPercentage: z.boolean().default(false),
});

const boxWhiskerChartSchema = z.object({
  kind: z.literal("statsChart"),
  chartType: z.literal("boxwhisker"),
  data: z.array(boxWhiskerEntrySchema).min(1).max(MAX_ENTRIES),
});

export const statsChartSpecSchema = z.discriminatedUnion("chartType", [
  barChartSchema,
  columnChartSchema,
  pieChartSchema,
  pyramidChartSchema,
  boxWhiskerChartSchema,
]);

export type CategoricalEntry = z.infer<typeof categoricalEntrySchema>;
export type BoxWhiskerEntry = z.infer<typeof boxWhiskerEntrySchema>;
export type StatsChartSpec = z.infer<typeof statsChartSpecSchema>;
