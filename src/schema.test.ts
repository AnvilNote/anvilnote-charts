import { test } from "node:test";
import assert from "node:assert/strict";
import { functionPlotSpecSchema } from "./schema.js";

test("accepts a valid single-curve spec", () => {
  const result = functionPlotSpecSchema.parse({
    curves: [{ formula: "sin(x)", color: "#000000", dash: "solid" }],
    xMin: -10,
    xMax: 10,
    showGridlines: true,
  });
  assert.equal(result.curves.length, 1);
});

test("rejects a formula with unsupported characters", () => {
  assert.throws(() =>
    functionPlotSpecSchema.parse({
      curves: [{ formula: "sin(x); rm -rf", color: "#000000", dash: "solid" }],
      xMin: -10,
      xMax: 10,
      showGridlines: true,
    }),
  );
});

test("rejects xMin >= xMax", () => {
  assert.throws(() =>
    functionPlotSpecSchema.parse({
      curves: [{ formula: "x", color: "#000000", dash: "solid" }],
      xMin: 10,
      xMax: -10,
      showGridlines: true,
    }),
  );
});

test("rejects more than 6 curves", () => {
  const curve = { formula: "x", color: "#000000", dash: "solid" as const };
  assert.throws(() =>
    functionPlotSpecSchema.parse({
      curves: Array(7).fill(curve),
      xMin: -10,
      xMax: 10,
      showGridlines: true,
    }),
  );
});

test("rejects an invalid hex color", () => {
  assert.throws(() =>
    functionPlotSpecSchema.parse({
      curves: [{ formula: "x", color: "blue", dash: "solid" }],
      xMin: -10,
      xMax: 10,
      showGridlines: true,
    }),
  );
});
