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

test("defaults showAxisTicks to true when omitted (older saved specs)", () => {
  const result = functionPlotSpecSchema.parse({
    curves: [{ formula: "sin(x)", color: "#000000", dash: "solid" }],
    xMin: -10,
    xMax: 10,
    showGridlines: true,
  });
  assert.equal(result.showAxisTicks, true);
});

test("accepts showAxisTicks: false", () => {
  const result = functionPlotSpecSchema.parse({
    curves: [{ formula: "sin(x)", color: "#000000", dash: "solid" }],
    xMin: -10,
    xMax: 10,
    showGridlines: true,
    showAxisTicks: false,
  });
  assert.equal(result.showAxisTicks, false);
});

test("defaults curve thickness to 1.5 when omitted (older saved specs)", () => {
  const result = functionPlotSpecSchema.parse({
    curves: [{ formula: "sin(x)", color: "#000000", dash: "solid" }],
    xMin: -10,
    xMax: 10,
    showGridlines: true,
  });
  assert.equal(result.curves[0].thickness, 1.5);
});

test("accepts an explicit curve thickness", () => {
  const result = functionPlotSpecSchema.parse({
    curves: [{ formula: "sin(x)", color: "#000000", dash: "solid", thickness: 3 }],
    xMin: -10,
    xMax: 10,
    showGridlines: true,
  });
  assert.equal(result.curves[0].thickness, 3);
});

test("rejects a curve thickness outside [0.5, 4]", () => {
  assert.throws(() =>
    functionPlotSpecSchema.parse({
      curves: [{ formula: "sin(x)", color: "#000000", dash: "solid", thickness: 5 }],
      xMin: -10,
      xMax: 10,
      showGridlines: true,
    }),
  );
});
