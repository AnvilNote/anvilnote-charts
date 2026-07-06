import { z } from "zod";
import { functionPlotSpecSchema } from "./function-plot/schema.js";
import { statsChartSpecSchema } from "./stats-chart/schema.js";

// Top-level dispatcher only — each kind's actual fields live in its own
// function-plot/ or stats-chart/ subfolder (schema, Typst generation, and
// their tests), kept fully decoupled from each other. This file's only job
// is picking which of the two a given input JSON belongs to.
export const chartSpecSchema = z.discriminatedUnion("kind", [
  functionPlotSpecSchema,
  statsChartSpecSchema,
]);

export type ChartSpec = z.infer<typeof chartSpecSchema>;

export * from "./function-plot/schema.js";
export * from "./stats-chart/schema.js";
