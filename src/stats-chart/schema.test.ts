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

test("accepts a valid line chart spec", () => {
  const result = statsChartSpecSchema.parse({
    kind: "statsChart",
    chartType: "line",
    data: [{ label: "Mon", value: 10 }],
  });
  assert.equal(result.chartType, "line");
});

test("accepts a valid scatter chart spec", () => {
  const result = statsChartSpecSchema.parse({
    kind: "statsChart",
    chartType: "scatter",
    data: [{ x: 1, y: 2 }],
  });
  assert.equal(result.chartType, "scatter");
  if (result.chartType === "scatter") {
    assert.equal(result.trendLine, "none");
  }
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

test("accepts a valid stacked column spec", () => {
  const result = statsChartSpecSchema.parse({
    kind: "statsChart",
    chartType: "stackedColumn",
    data: [
      { label: "Q1", values: [10, 20] },
      { label: "Q2", values: [15, 25] },
    ],
    seriesLabels: ["Product A", "Product B"],
  });
  assert.equal(result.chartType, "stackedColumn");
  if (result.chartType === "stackedColumn") {
    assert.equal(result.showLegend, true);
    assert.equal(result.showGridLines, true);
  }
});

test("rejects stacked entries whose value count does not match series labels", () => {
  assert.throws(() =>
    statsChartSpecSchema.parse({
      kind: "statsChart",
      chartType: "stackedBar",
      data: [{ label: "Q1", values: [10] }],
      seriesLabels: ["Product A", "Product B"],
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

test("accepts optional width/height overrides, independent of each other", () => {
  const parsed = statsChartSpecSchema.parse({
    kind: "statsChart",
    chartType: "bar",
    data: [{ label: "Mon", value: 10 }],
    width: 15,
  });
  assert.equal(parsed.chartType === "bar" && parsed.width, 15);
  assert.equal(parsed.chartType === "bar" && parsed.height, undefined);
});

test("rejects width/height outside the 1-50cm range", () => {
  assert.throws(() =>
    statsChartSpecSchema.parse({
      kind: "statsChart",
      chartType: "column",
      data: [{ label: "Mon", value: 10 }],
      width: 0,
    }),
  );
  assert.throws(() =>
    statsChartSpecSchema.parse({
      kind: "statsChart",
      chartType: "column",
      data: [{ label: "Mon", value: 10 }],
      height: 51,
    }),
  );
});
