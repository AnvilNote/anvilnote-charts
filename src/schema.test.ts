import { test } from "node:test";
import assert from "node:assert/strict";
import { chartSpecSchema } from "./schema.js";

// This is the actual schema cli.ts parses against — a caller must always
// send "kind" explicitly. This is the discriminated union's routing
// contract, not a bug: z.discriminatedUnion reads "kind" directly off the
// raw input to pick a branch, before any per-branch schema default (like
// functionPlotSpecSchema's own `kind: z.literal("functionPlot")
// .default("functionPlot")`) ever runs — so a kind-less input can never
// be routed anywhere, regardless of that default. That default exists
// only for convenience when parsing functionPlotSpecSchema directly (e.g.
// in function-plot/schema.test.ts), not as a fallback here. Every real
// caller (anvilnote-api, which anvilnote-web always sends "kind" to) must
// include the field explicitly — see anvilnote-web's
// function-plot-render.ts / stats-chart-render.ts.
test("rejects an input missing kind entirely, even though functionPlotSpecSchema itself defaults it", () => {
  assert.throws(() =>
    chartSpecSchema.parse({
      curves: [{ formula: "sin(x)", color: "#000000", dash: "solid" }],
      xMin: -10,
      xMax: 10,
      showGridlines: true,
    }),
  );
});

test("routes a functionPlot-kind input to the function-plot branch", () => {
  const result = chartSpecSchema.parse({
    kind: "functionPlot",
    curves: [{ formula: "sin(x)", color: "#000000", dash: "solid" }],
    xMin: -10,
    xMax: 10,
    showGridlines: true,
  });
  assert.equal(result.kind, "functionPlot");
});

test("routes a statsChart-kind input to the stats-chart branch", () => {
  const result = chartSpecSchema.parse({
    kind: "statsChart",
    chartType: "bar",
    data: [{ label: "Mon", value: 10 }],
  });
  assert.equal(result.kind, "statsChart");
});
