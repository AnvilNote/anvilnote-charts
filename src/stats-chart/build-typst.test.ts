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
  assert.match(typ, /cetz\.palette\.new\(colors: \(rgb\("#111111"\), rgb\("#404040"\)\)\)/);
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
  assert.match(typ, /slice-style: \(rgb\("#000000"\), rgb\("#404040"\)\)/);
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
  assert.match(typ, /size: \(4\.5, 4\)/);
});

test("bar chart height scales with entry count; column chart width scales instead", () => {
  const manyEntries = Array.from({ length: 6 }, (_, i) => ({ label: `L${i}`, value: i }));
  const bar = buildStatsChartTypst({ kind: "statsChart", chartType: "bar", data: manyEntries });
  const column = buildStatsChartTypst({ kind: "statsChart", chartType: "column", data: manyEntries });
  assert.match(bar, /size: \(4, 9\)/);
  assert.match(column, /size: \(9, 4\)/);
});

test("escapes double quotes in labels", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    chartType: "bar",
    data: [{ label: 'Say "hi"', value: 1 }],
  });
  assert.match(typ, /label: "Say \\"hi\\""/);
});
