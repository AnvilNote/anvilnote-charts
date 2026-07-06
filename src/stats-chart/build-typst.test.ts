import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStatsChartTypst, CETZ_VERSION, CETZ_PLOT_VERSION } from "./build-typst.js";

test("generates imports pinned to the bundled cetz/cetz-plot versions", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    chartType: "bar",
    data: [{ label: "Mon", value: 10 }],
  });
  assert.match(typ, new RegExp(`#import "@preview/cetz:${CETZ_VERSION}"`));
  assert.match(typ, new RegExp(`#import "@preview/cetz-plot:${CETZ_PLOT_VERSION}": chart`));
});

test("bar chart uses chart.barchart with a palette built from resolved colors", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    chartType: "bar",
    data: [
      { label: "Mon", value: 10, color: "#111111" },
      { label: "Tue", value: 5 },
    ],
  });
  assert.match(typ, /chart\.barchart\(/);
  assert.match(typ, /label: "Mon", value: 10/);
  assert.match(typ, /cetz\.palette\.new\(colors: \(rgb\("#111111"\), rgb\("#404040"\),\)\)/);
});

test("column chart uses chart.columnchart", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    chartType: "column",
    data: [{ label: "Mon", value: 10 }],
  });
  assert.match(typ, /chart\.columnchart\(/);
});

test("pie chart uses a bare color array for slice-style and shows legend by default", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    chartType: "pie",
    data: [
      { label: "Male", value: 10 },
      { label: "Female", value: 20 },
    ],
    // Zod's .default(true) only applies during .parse() — this test calls
    // buildStatsChartTypst directly with a hand-built object, so the field
    // must be set explicitly here to exercise the "shown" branch.
    showLegend: true,
  });
  assert.match(typ, /chart\.piechart\(/);
  assert.match(typ, /slice-style: \(rgb\("#000000"\), rgb\("#404040"\),\)/);
  assert.doesNotMatch(typ, /legend:/);
});

test("pie chart suppresses the legend when showLegend is false", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    chartType: "pie",
    data: [{ label: "Male", value: 10 }],
    showLegend: false,
  });
  assert.match(typ, /legend: \(label: none\)/);
});

test("pyramid chart uses chart.pyramid with a palette", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    chartType: "pyramid",
    data: [{ label: "Top", value: 10 }],
  });
  assert.match(typ, /chart\.pyramid\(/);
  assert.match(typ, /cetz\.palette\.new/);
});

test("boxwhisker chart maps median to q2 and scales width with entry count", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    chartType: "boxwhisker",
    data: [
      { label: "A", min: 10, q1: 20, median: 30, q3: 40, max: 50 },
      { label: "B", min: 5, q1: 15, median: 25, q3: 35, max: 45 },
      { label: "C", min: 0, q1: 10, median: 20, q3: 30, max: 40 },
    ],
  });
  assert.match(typ, /chart\.boxwhisker\(/);
  assert.match(typ, /q2: 30/);
  assert.match(typ, /size: \(6, 6\)/);
});

test("bar chart height scales with entry count; column chart width scales instead", () => {
  const manyEntries = Array.from({ length: 6 }, (_, i) => ({ label: `L${i}`, value: i }));
  const bar = buildStatsChartTypst({ kind: "statsChart", chartType: "bar", data: manyEntries });
  const column = buildStatsChartTypst({ kind: "statsChart", chartType: "column", data: manyEntries });
  assert.match(bar, /size: \(6, 12\)/);
  assert.match(column, /size: \(12, 6\)/);
});

test("entry-count scaling clamps at a max dimension, instead of growing unbounded", () => {
  // At MAX_ENTRIES (20), the naive count*2 formula would produce 40 —
  // far past a size a preview pane/embedded document can display without
  // overflowing. The clamp keeps the chart's overall size bounded; bars
  // just get proportionally narrower instead.
  const twentyEntries = Array.from({ length: 20 }, (_, i) => ({ label: `L${i}`, value: i }));
  const bar = buildStatsChartTypst({ kind: "statsChart", chartType: "bar", data: twentyEntries });
  const column = buildStatsChartTypst({ kind: "statsChart", chartType: "column", data: twentyEntries });
  const boxwhiskerData = Array.from({ length: 20 }, (_, i) => ({
    label: `L${i}`,
    min: 0,
    q1: 1,
    median: 2,
    q3: 3,
    max: 4,
  }));
  const boxwhisker = buildStatsChartTypst({ kind: "statsChart", chartType: "boxwhisker", data: boxwhiskerData });
  assert.match(bar, /size: \(6, 24\)/);
  assert.match(column, /size: \(24, 6\)/);
  assert.match(boxwhisker, /size: \(24, 6\)/);
});

test("bar chart computes a nice x-tick-step from the max value, avoiding crowded/overlapping tick labels", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    chartType: "bar",
    data: [
      { label: "Test", value: 100 },
      { label: "Hi", value: 12 },
    ],
  });
  assert.match(typ, /x-tick-step: 20/);
});

test("column chart computes a nice y-tick-step from the max value", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    chartType: "column",
    data: [{ label: "Test", value: 100 }],
  });
  assert.match(typ, /y-tick-step: 20/);
});

test("nice tick step rounds to 1/2/5/10 x a power of ten, not an arbitrary fraction", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    chartType: "bar",
    data: [{ label: "A", value: 13 }],
  });
  assert.match(typ, /x-tick-step: 2\b/);
});

test("escapes double quotes in labels", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    chartType: "bar",
    data: [{ label: 'Say "hi"', value: 1 }],
  });
  assert.match(typ, /label: "Say \\"hi\\""/);
});

test("escapes newlines/tabs/carriage-returns in labels", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    chartType: "bar",
    data: [{ label: "line1\nline2\ttabbed\r", value: 1 }],
  });
  assert.match(typ, /label: "line1\\nline2\\ttabbed\\r"/);
  // The raw control characters must not appear literally in the output —
  // an unescaped newline inside a Typst string literal breaks the parse.
  assert.ok(!typ.includes("line1\nline2"));
});

// Regression test for a real bug: Typst parses a parenthesized expression
// with no comma as a grouping expression, not a 1-element array —
// `(rgb("#000000"))` is just `rgb("#000000")`, not a 1-item array. Every
// chart type here uses `.min(1)` in its schema, so a single data point
// must produce a valid array literal, not just two-or-more. This was
// caught by an actual `typst compile` of the generated output (which
// failed with "type color has no method `len`" / "expected function,
// found none" before the trailing-comma fix) — the regexes below check
// the same shape these compiles depend on.
test("single-entry bar/column/pyramid palette produces a valid 1-element array (trailing comma)", () => {
  const data = [{ label: "Solo", value: 1 }];
  for (const chartType of ["bar", "column", "pyramid"] as const) {
    const typ = buildStatsChartTypst({ kind: "statsChart", chartType, data });
    assert.match(
      typ,
      /colors: \(rgb\("#000000"\),\)/,
      `${chartType}: expected trailing comma in single-entry palette`,
    );
  }
});

test("single-entry pie slice-style produces a valid 1-element array (trailing comma)", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    chartType: "pie",
    data: [{ label: "Solo", value: 1 }],
    showLegend: true,
  });
  assert.match(typ, /slice-style: \(rgb\("#000000"\),\)/);
});
