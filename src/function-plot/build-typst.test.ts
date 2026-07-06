import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFunctionPlotTypst, SIMPLE_PLOT_VERSION } from "./build-typst.js";

test("generates an import pinned to the bundled simple-plot version", () => {
  const typ = buildFunctionPlotTypst({
    kind: "functionPlot",
    curves: [{ formula: "sin(x)", color: "#000000", dash: "solid", thickness: 1.5 }],
    xMin: -10,
    xMax: 10,
    showGridlines: true,
    showAxisTicks: true,
  });
  assert.match(typ, new RegExp(`#import "@preview/simple-plot:${SIMPLE_PLOT_VERSION}": plot`));
});

test("passes an explicit domain: (xmin, xmax) on every curve", () => {
  const typ = buildFunctionPlotTypst({
    kind: "functionPlot",
    curves: [
      { formula: "ln(x)", color: "#000000", dash: "solid", thickness: 1.5 },
      { formula: "sqrt(x)", color: "#595959", dash: "dashed", thickness: 1.5 },
    ],
    xMin: 10,
    xMax: 100,
    showGridlines: true,
    showAxisTicks: true,
  });
  const domainMatches = [...typ.matchAll(/domain: \(10, 100\)/g)];
  assert.equal(domainMatches.length, 2);
});

test("splices each curve's own thickness into its stroke, not a hardcoded value", () => {
  const typ = buildFunctionPlotTypst({
    kind: "functionPlot",
    curves: [
      { formula: "sin(x)", color: "#000000", dash: "solid", thickness: 1.5 },
      { formula: "cos(x)", color: "#595959", dash: "dashed", thickness: 3 },
    ],
    xMin: -10,
    xMax: 10,
    showGridlines: true,
    showAxisTicks: true,
  });
  assert.match(typ, /thickness: 1\.5pt/);
  assert.match(typ, /thickness: 3pt/);
});

test("includes one plot() curve entry per input curve, in order", () => {
  const typ = buildFunctionPlotTypst({
    kind: "functionPlot",
    curves: [
      { formula: "sin(x)", color: "#000000", dash: "solid", thickness: 1.5 },
      { formula: "cos(x)", color: "#595959", dash: "dashed", thickness: 1.5 },
    ],
    xMin: -10,
    xMax: 10,
    showGridlines: false,
    showAxisTicks: true,
  });
  assert.match(typ, /fn: x => sin\(x\)/);
  assert.match(typ, /fn: x => cos\(x\)/);
  assert.match(typ, /rgb\("#595959"\)/);
  assert.match(typ, /dash: "dashed"/);
  assert.match(typ, /show-grid: false/);
});

test("passes xmin/xmax through unchanged", () => {
  const typ = buildFunctionPlotTypst({
    kind: "functionPlot",
    curves: [{ formula: "x", color: "#000000", dash: "solid", thickness: 1.5 }],
    xMin: -3.5,
    xMax: 7,
    showGridlines: true,
    showAxisTicks: true,
  });
  assert.match(typ, /xmin: -3\.5, xmax: 7/);
});

test("imports calc module names so bare sin/cos/etc. resolve in formulas", () => {
  const typ = buildFunctionPlotTypst({
    kind: "functionPlot",
    curves: [{ formula: "sin(x)", color: "#000000", dash: "solid", thickness: 1.5 }],
    xMin: -10,
    xMax: 10,
    showGridlines: true,
    showAxisTicks: true,
  });
  assert.match(typ, /#import calc: sin, cos/);
});

test("omits xtick/ytick args when showAxisTicks is true", () => {
  const typ = buildFunctionPlotTypst({
    kind: "functionPlot",
    curves: [{ formula: "sin(x)", color: "#000000", dash: "solid", thickness: 1.5 }],
    xMin: -10,
    xMax: 10,
    showGridlines: true,
    showAxisTicks: true,
  });
  assert.doesNotMatch(typ, /xtick/);
  assert.doesNotMatch(typ, /ytick/);
});

test("sets xtick/ytick to none when showAxisTicks is false", () => {
  const typ = buildFunctionPlotTypst({
    kind: "functionPlot",
    curves: [{ formula: "sin(x)", color: "#000000", dash: "solid", thickness: 1.5 }],
    xMin: -10,
    xMax: 10,
    showGridlines: true,
    showAxisTicks: false,
  });
  assert.match(typ, /xtick: none, ytick: none/);
});
