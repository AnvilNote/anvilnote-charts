import { test } from "node:test";
import assert from "node:assert/strict";
import { statsChartSpecSchema } from "./schema.js";

test("accepts a valid bar chart spec", () => {
  const result = statsChartSpecSchema.parse({
    kind: "statsChart",
    chartType: "bar",
    data: [{ label: "Mon", value: 10 }],
  });
  assert.equal(result.chartType, "bar");
});

test("accepts a valid column chart spec", () => {
  const result = statsChartSpecSchema.parse({
    kind: "statsChart",
    chartType: "column",
    data: [{ label: "Mon", value: 10 }],
  });
  assert.equal(result.chartType, "column");
});

test("accepts a valid pyramid chart spec", () => {
  const result = statsChartSpecSchema.parse({
    kind: "statsChart",
    chartType: "pyramid",
    data: [{ label: "Top", value: 10 }],
  });
  assert.equal(result.chartType, "pyramid");
});

test("pie chart defaults showLegend to true", () => {
  const result = statsChartSpecSchema.parse({
    kind: "statsChart",
    chartType: "pie",
    data: [{ label: "Male", value: 10 }],
  });
  assert.equal(result.chartType, "pie");
  if (result.chartType === "pie") {
    assert.equal(result.showLegend, true);
  }
});

test("pie chart accepts showLegend: false", () => {
  const result = statsChartSpecSchema.parse({
    kind: "statsChart",
    chartType: "pie",
    data: [{ label: "Male", value: 10 }],
    showLegend: false,
  });
  if (result.chartType === "pie") {
    assert.equal(result.showLegend, false);
  }
});

test("bar/column/pyramid do not accept showLegend (not a legend-bearing chart type)", () => {
  const result = statsChartSpecSchema.parse({
    kind: "statsChart",
    chartType: "bar",
    data: [{ label: "Mon", value: 10 }],
    showLegend: false,
  });
  assert.equal((result as { showLegend?: boolean }).showLegend, undefined);
});

test("accepts a valid boxwhisker spec", () => {
  const result = statsChartSpecSchema.parse({
    kind: "statsChart",
    chartType: "boxwhisker",
    data: [{ label: "A", min: 10, q1: 20, median: 30, q3: 40, max: 50 }],
  });
  assert.equal(result.chartType, "boxwhisker");
});

test("rejects boxwhisker entry with out-of-order values", () => {
  assert.throws(() =>
    statsChartSpecSchema.parse({
      kind: "statsChart",
      chartType: "boxwhisker",
      data: [{ label: "A", min: 10, q1: 50, median: 30, q3: 40, max: 50 }],
    }),
  );
});

test("rejects more than 20 entries", () => {
  const entry = { label: "x", value: 1 };
  assert.throws(() =>
    statsChartSpecSchema.parse({
      kind: "statsChart",
      chartType: "bar",
      data: Array(21).fill(entry),
    }),
  );
});

test("rejects an invalid hex color", () => {
  assert.throws(() =>
    statsChartSpecSchema.parse({
      kind: "statsChart",
      chartType: "bar",
      data: [{ label: "Mon", value: 10, color: "blue" }],
    }),
  );
});

test("rejects an unknown chartType", () => {
  assert.throws(() =>
    statsChartSpecSchema.parse({
      kind: "statsChart",
      chartType: "scatter",
      data: [{ label: "Mon", value: 10 }],
    }),
  );
});
