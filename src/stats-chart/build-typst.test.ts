import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStatsChartTypst, CETZ_VERSION, CETZ_PLOT_VERSION } from "./build-typst.js";
import type { StatsChartSpec } from "./schema.js";

test("generates imports pinned to the bundled cetz/cetz-plot versions", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    fontFamily: "sans",
    chartType: "bar",
    showValues: false,
    showGridLines: true,
    xLabel: "",
    yLabel: "",
    yLabelRotated: true,
    data: [{ label: "Mon", value: 10 }],
  });
  assert.match(typ, new RegExp(`#import "@preview/cetz:${CETZ_VERSION}"`));
  assert.match(typ, new RegExp(`#import "@preview/cetz-plot:${CETZ_PLOT_VERSION}": chart`));
});

test("bar chart uses chart.barchart with a palette built from resolved colors", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    fontFamily: "sans",
    chartType: "bar",
    showValues: false,
    showGridLines: true,
    xLabel: "",
    yLabel: "",
    yLabelRotated: true,
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
    fontFamily: "sans",
    chartType: "column",
    showValues: false,
    showGridLines: true,
    xLabel: "",
    yLabel: "",
    yLabelRotated: true,
    data: [{ label: "Mon", value: 10 }],
  });
  assert.match(typ, /chart\.columnchart\(/);
});

test("pie chart uses a bare color array for slice-style and shows legend by default", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    fontFamily: "sans",
    chartType: "pie",
    data: [
      { label: "Male", value: 10 },
      { label: "Female", value: 20 },
    ],
    // Zod's .default(true)/.default(false) only applies during .parse() —
    // this test calls buildStatsChartTypst directly with a hand-built
    // object, so both fields must be set explicitly here.
    showLegend: true,
    showPercentage: "none",
  });
  assert.match(typ, /chart\.piechart\(/);
  assert.match(typ, /slice-style: \(rgb\("#000000"\), rgb\("#404040"\),\)/);
  assert.doesNotMatch(typ, /legend:/);
});

test("pie chart suppresses the legend when showLegend is false", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    fontFamily: "sans",
    chartType: "pie",
    data: [{ label: "Male", value: 10 }],
    showLegend: false,
    showPercentage: "none",
  });
  assert.match(typ, /legend: \(label: none\)/);
});

test("boxwhisker chart maps median to q2 and scales width with entry count", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    fontFamily: "sans",
    chartType: "boxwhisker",
    data: [
      { label: "A", min: 10, q1: 20, median: 30, q3: 40, max: 50 },
      { label: "B", min: 5, q1: 15, median: 25, q3: 35, max: 45 },
      { label: "C", min: 0, q1: 10, median: 20, q3: 30, max: 40 },
    ],
  });
  assert.match(typ, /chart\.boxwhisker\(/);
  assert.match(typ, /q2: 30/);
  // 3 entries: scaledDimension(3) = max(6, 6) = 6 (width); fixed height is 8
  assert.match(typ, /size: \(6, 8\)/);
});

test("boxwhisker always fixes the value axis floor at 0, regardless of the data's own min", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    fontFamily: "sans",
    chartType: "boxwhisker",
    data: [{ label: "A", min: 10, q1: 20, median: 30, q3: 40, max: 50 }],
  });
  assert.match(typ, /y-min: 0/);
});

test("bar chart height scales with entry count; column chart width scales instead", () => {
  const manyEntries = Array.from({ length: 6 }, (_, i) => ({ label: `L${i}`, value: i }));
  const bar = buildStatsChartTypst({ kind: "statsChart", fontFamily: "sans", chartType: "bar", showValues: false, showGridLines: true, xLabel: "", yLabel: "", yLabelRotated: true, data: manyEntries });
  const column = buildStatsChartTypst({ kind: "statsChart", fontFamily: "sans", chartType: "column", showValues: false, showGridLines: true, xLabel: "", yLabel: "", yLabelRotated: true, data: manyEntries });
  assert.match(bar, /size: \(8, 12\)/);
  assert.match(column, /size: \(12, 8\)/);
});

test("entry-count scaling clamps at a max dimension, instead of growing unbounded", () => {
  // At MAX_ENTRIES (20), the naive count*2 formula would produce 40 —
  // far past a size a preview pane/embedded document can display without
  // overflowing. The clamp keeps the chart's overall size bounded; bars
  // just get proportionally narrower instead.
  const twentyEntries = Array.from({ length: 20 }, (_, i) => ({ label: `L${i}`, value: i }));
  const bar = buildStatsChartTypst({ kind: "statsChart", fontFamily: "sans", chartType: "bar", showValues: false, showGridLines: true, xLabel: "", yLabel: "", yLabelRotated: true, data: twentyEntries });
  const column = buildStatsChartTypst({ kind: "statsChart", fontFamily: "sans", chartType: "column", showValues: false, showGridLines: true, xLabel: "", yLabel: "", yLabelRotated: true, data: twentyEntries });
  const boxwhiskerData = Array.from({ length: 20 }, (_, i) => ({
    label: `L${i}`,
    min: 0,
    q1: 1,
    median: 2,
    q3: 3,
    max: 4,
  }));
  const boxwhisker = buildStatsChartTypst({ kind: "statsChart", fontFamily: "sans", chartType: "boxwhisker", data: boxwhiskerData });
  assert.match(bar, /size: \(8, 24\)/);
  assert.match(column, /size: \(24, 8\)/);
  assert.match(boxwhisker, /size: \(24, 8\)/);
});

test("bar chart computes a nice x-tick-step from the max value, avoiding crowded/overlapping tick labels", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    fontFamily: "sans",
    chartType: "bar",
    showValues: false,
    showGridLines: true,
    xLabel: "",
    yLabel: "",
    yLabelRotated: true,
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
    fontFamily: "sans",
    chartType: "column",
    showValues: false,
    showGridLines: true,
    xLabel: "",
    yLabel: "",
    yLabelRotated: true,
    data: [{ label: "Test", value: 100 }],
  });
  assert.match(typ, /y-tick-step: 20/);
});

test("nice tick step rounds to 1/2/5/10 x a power of ten, not an arbitrary fraction", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    fontFamily: "sans",
    chartType: "bar",
    showValues: false,
    showGridLines: true,
    xLabel: "",
    yLabel: "",
    yLabelRotated: true,
    data: [{ label: "A", value: 13 }],
  });
  assert.match(typ, /x-tick-step: 2\b/);
});

test("bar chart rounds axis max up to the next tick-step multiple past the data max", () => {
  // Reported bug: max value 92 with a 20-step axis only showed a
  // gridline up to 80, leaving the tallest bar floating above the
  // topmost labeled line. x-max should round up to 100.
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    fontFamily: "sans",
    chartType: "bar",
    showValues: false,
    showGridLines: true,
    xLabel: "",
    yLabel: "",
    yLabelRotated: true,
    data: [
      { label: "Mon", value: 42 },
      { label: "Wed", value: 92 },
    ],
  });
  assert.match(typ, /x-tick-step: 20/);
  assert.match(typ, /x-max: 100/);
});

test("column chart rounds axis max up using y-max", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    fontFamily: "sans",
    chartType: "column",
    showValues: false,
    showGridLines: true,
    xLabel: "",
    yLabel: "",
    yLabelRotated: true,
    data: [{ label: "A", value: 92 }],
  });
  assert.match(typ, /y-tick-step: 20/);
  assert.match(typ, /y-max: 100/);
});

test("axis max is unchanged when the data max is already an exact tick-step multiple", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    fontFamily: "sans",
    chartType: "bar",
    showValues: false,
    showGridLines: true,
    xLabel: "",
    yLabel: "",
    yLabelRotated: true,
    data: [{ label: "A", value: 100 }],
  });
  assert.match(typ, /x-max: 100/);
});

test("column chart rotates labels via an explicit x-ticks override when a label exceeds the long-label threshold", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    fontFamily: "sans",
    chartType: "column",
    showValues: false,
    showGridLines: true,
    xLabel: "",
    yLabel: "",
    yLabelRotated: true,
    data: [
      { label: "Week2-Monday", value: 10 },
      { label: "Week2-Tuesday", value: 20 },
    ],
  });
  assert.match(typ, /x-ticks: \(/);
  assert.match(typ, /\(0, rotate\(45deg, reflow: true\)\[#"Week2-Monday"\]\)/);
  assert.match(typ, /\(1, rotate\(45deg, reflow: true\)\[#"Week2-Tuesday"\]\)/);
});

test("column chart does not add an x-ticks override when all labels are short", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    fontFamily: "sans",
    chartType: "column",
    showValues: false,
    showGridLines: true,
    xLabel: "",
    yLabel: "",
    yLabelRotated: true,
    data: [
      { label: "Mon", value: 10 },
      { label: "Tue", value: 20 },
    ],
  });
  assert.doesNotMatch(typ, /x-ticks:/);
});

test("bar chart never rotates labels, even with long labels (category axis is vertical, not crowded)", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    fontFamily: "sans",
    chartType: "bar",
    showValues: false,
    showGridLines: true,
    xLabel: "",
    yLabel: "",
    yLabelRotated: true,
    data: [{ label: "Week2-Monday", value: 10 }],
  });
  assert.doesNotMatch(typ, /x-ticks:/);
});

// Regression test: an earlier approach used cetz's AMBIENT
// draw.set-style(axes: (tick: (label: (angle: ...)))) to rotate labels,
// which — per real user feedback — rotated the VALUE axis's numeric
// ticks too (that style root applies to every axis, not just the one
// meant to be rotated). The x-ticks-array approach replaced it
// specifically to avoid this; this test pins that the old ambient
// mechanism is gone, not just that some rotation exists.
test("rotation never uses the ambient axes style (would also rotate the value axis)", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    fontFamily: "sans",
    chartType: "column",
    showValues: false,
    showGridLines: true,
    xLabel: "",
    yLabel: "",
    yLabelRotated: true,
    data: [{ label: "Week2-Wednesday", value: 10 }],
  });
  assert.doesNotMatch(typ, /draw\.set-style/);
});

test("boxwhisker rotates labels via an x-ticks override, 1-indexed to match its own box x positions", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    fontFamily: "sans",
    chartType: "boxwhisker",
    data: [
      { label: "Week2-Monday", min: 0, q1: 1, median: 2, q3: 3, max: 4 },
      { label: "Week2-Tuesday", min: 0, q1: 1, median: 2, q3: 3, max: 4 },
    ],
  });
  assert.match(typ, /\(1, rotate\(45deg, reflow: true\)\[#"Week2-Monday"\]\)/);
  assert.match(typ, /\(2, rotate\(45deg, reflow: true\)\[#"Week2-Tuesday"\]\)/);
});

test("rotated tick content escapes markup-sensitive characters as a safe string, not raw markup", () => {
  // The rotated content sits inside a Typst markup block ([...]) — a raw
  // "#" there would start CODE mode (arbitrary function calls), and "*"/
  // "_" would apply formatting. Wrapping the label as #"...string..."
  // interpolates it as inert text no matter what it contains, so a label
  // like `#read("/etc/passwd")` or `*bold*` can never be reinterpreted.
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    fontFamily: "sans",
    chartType: "column",
    showValues: false,
    showGridLines: true,
    xLabel: "",
    yLabel: "",
    yLabelRotated: true,
    data: [{ label: '#dangerous "quote" *and* stuff-long', value: 10 }],
  });
  assert.match(typ, /rotate\(45deg, reflow: true\)\[#"#dangerous \\"quote\\" \*and\* stuff-long"\]/);
});

test("escapes double quotes in labels", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    fontFamily: "sans",
    chartType: "bar",
    showValues: false,
    showGridLines: true,
    xLabel: "",
    yLabel: "",
    yLabelRotated: true,
    data: [{ label: 'Say "hi"', value: 1 }],
  });
  assert.match(typ, /label: "Say \\"hi\\""/);
});

test("escapes newlines/tabs/carriage-returns in labels", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    fontFamily: "sans",
    chartType: "bar",
    showValues: false,
    showGridLines: true,
    xLabel: "",
    yLabel: "",
    yLabelRotated: true,
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
test("single-entry bar/column palette produces a valid 1-element array (trailing comma)", () => {
  const data = [{ label: "Solo", value: 1 }];
  for (const chartType of ["bar", "column"] as const) {
    const typ = buildStatsChartTypst({
      kind: "statsChart",
      fontFamily: "sans",
      chartType,
      data,
      showValues: false,
      showGridLines: true,
      xLabel: "",
      yLabel: "",
      yLabelRotated: true,
    } as StatsChartSpec);
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
    fontFamily: "sans",
    chartType: "pie",
    data: [{ label: "Solo", value: 1 }],
    showLegend: true,
    showPercentage: "none",
  });
  assert.match(typ, /slice-style: \(rgb\("#000000"\),\)/);
});

test("column/bar showValues bypasses chart.columnchart/barchart and annotates each bar with its value", () => {
  const data = [
    { label: "Mon", value: 42 },
    { label: "Tue", value: 78.456 },
  ];
  const column = buildStatsChartTypst({
    kind: "statsChart",
    fontFamily: "sans",
    chartType: "column",
    showValues: true,
    showGridLines: true,
    xLabel: "",
    yLabel: "",
    yLabelRotated: true,
    data,
  });
  assert.doesNotMatch(column, /chart\.columnchart\(/);
  assert.match(column, /plot\.add-bar\(/);
  assert.match(column, /plot\.annotate\(/);
  // 78.456 rounds to at most 2 decimals: 78.46, not the raw value. Value
  // labels render in math mode ($78.46$), not plain text, per explicit
  // feedback that numbers always use the math font.
  assert.match(column, /\[\$78\.46\$\]/);
  assert.match(column, /\[\$42\$\]/);

  const bar = buildStatsChartTypst({
    kind: "statsChart",
    fontFamily: "sans",
    chartType: "bar",
    showValues: true,
    showGridLines: true,
    xLabel: "",
    yLabel: "",
    yLabelRotated: true,
    data,
  });
  assert.doesNotMatch(bar, /chart\.barchart\(/);
  assert.match(bar, /plot\.add-bar\(/);
  assert.match(bar, /bar-width: -0\.8/);
});

test("column/bar without showValues still uses the normal chart.columnchart/barchart wrapper", () => {
  const data = [{ label: "Mon", value: 42 }];
  const column = buildStatsChartTypst({
    kind: "statsChart",
    fontFamily: "sans",
    chartType: "column",
    showValues: false,
    showGridLines: true,
    xLabel: "",
    yLabel: "",
    yLabelRotated: true,
    data,
  });
  assert.match(column, /chart\.columnchart\(/);
  assert.doesNotMatch(column, /plot\.annotate\(/);
});

test("pie showPercentage appends each slice's share of the total to its label, summing to exactly 100.00%", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    fontFamily: "sans",
    chartType: "pie",
    showLegend: false,
    showPercentage: "beside",
    data: [
      { label: "A", value: 1 },
      { label: "B", value: 1 },
      { label: "C", value: 1 },
    ],
  });
  // Naive independent rounding of 1/3 each gives 33.33 x3 = 99.99, not
  // 100.00 — largest-remainder apportionment must bump exactly one entry
  // up to 33.34 so the three sum to exactly 100.00. Percentage now routes
  // through outer-label's content function (math mode), not a mutated
  // label string, so the lookup dict itself (not "Label (XX.XX%)" inline)
  // is what carries these values — see outerLabelPercentageArg.
  assert.match(typ, /outer-label: \(content: \(value, label\) =>/);
  assert.match(typ, /"A": "33\.34%"/);
  assert.match(typ, /"B": "33\.33%"/);
  assert.match(typ, /"C": "33\.33%"/);
});

test("pie showPercentage: none leaves labels unchanged", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    fontFamily: "sans",
    chartType: "pie",
    showLegend: true,
    showPercentage: "none",
    data: [{ label: "A", value: 1 }],
  });
  assert.match(typ, /label: "A"/);
  assert.doesNotMatch(typ, /%/);
});

test("pie showPercentage: onSlice keeps labels plain and adds an inner-label lookup instead", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    fontFamily: "sans",
    chartType: "pie",
    showLegend: true,
    showPercentage: "onSlice",
    data: [
      { label: "A", value: 1 },
      { label: "B", value: 1 },
      { label: "C", value: 1 },
    ],
  });
  // Labels themselves stay plain — no "(XX.XX%)" appended, unlike "beside".
  assert.match(typ, /label: "A"/);
  assert.match(typ, /label: "B"/);
  assert.match(typ, /label: "C"/);
  assert.doesNotMatch(typ, /label: "A \(/);
  // Percentage goes through inner-label's own lookup dict instead — each
  // entry pairs the percentage string with a pre-computed contrasting
  // text color (see contrastingTextColor's own comment for why: plain
  // black text is invisible against this feature's own default near-
  // black slice colors).
  assert.match(typ, /inner-label: \(content: \(value, label\) =>/);
  // Default color cycle's first 3 entries (#000000, #404040, #737373) are
  // all dark enough that white is the correct contrast choice for all
  // three here.
  assert.match(typ, /"A": \(pct: "33\.34%", color: white\)/);
  assert.match(typ, /"B": \(pct: "33\.33%", color: white\)/);
  assert.match(typ, /"C": \(pct: "33\.33%", color: white\)/);
});

test("contrastingTextColor picks white for dark slice fills and black for light ones", () => {
  // Exercised indirectly through the pie onSlice path, using the default
  // color cycle's full range (including its lightest entry, #d9d9d9,
  // which needs BLACK text, unlike the darker entries above).
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    fontFamily: "sans",
    chartType: "pie",
    showLegend: true,
    showPercentage: "onSlice",
    data: [
      { label: "A", value: 1 },
      { label: "B", value: 1 },
      { label: "C", value: 1 },
      { label: "D", value: 1 },
      { label: "E", value: 1 },
    ],
  });
  assert.match(typ, /"A": \(pct: "20\.00%", color: white\)/);
  assert.match(typ, /"E": \(pct: "20\.00%", color: black\)/);
});

// Real bug: CJK category-axis tick labels (even very short ones, well
// under hasLongLabels's own rotation threshold) visually overlapped the
// bar/plot area right at the axis line — cetz-plot's default tick-label
// offset is sized for Latin text, and most CJK fonts have taller ascent/
// descent than Latin ones. Fixed via an ambient set-style call (axes:
// bottom/left tick label offset) emitted into every affected chart's
// canvas body — see AXIS_TICK_LABEL_CLEARANCE's own comment for why this
// specific mechanism (not a "style:"/"bottom:" keyword arg, which has no
// effect) was needed.
test("bar/column/line/boxwhisker all set an explicit axis tick-label clearance style", () => {
  const data = [
    { label: "測試", value: 42 },
    { label: "你好", value: 78 },
  ];
  const axisLabelDefaults = { showGridLines: true, xLabel: "", yLabel: "", yLabelRotated: true } as const;
  for (const spec of [
    { kind: "statsChart", chartType: "column", fontFamily: "sans", showValues: false, ...axisLabelDefaults, data } as const,
    { kind: "statsChart", chartType: "bar", fontFamily: "sans", showValues: false, ...axisLabelDefaults, data } as const,
    { kind: "statsChart", chartType: "column", fontFamily: "sans", showValues: true, ...axisLabelDefaults, data } as const,
    { kind: "statsChart", chartType: "bar", fontFamily: "sans", showValues: true, ...axisLabelDefaults, data } as const,
    { kind: "statsChart", chartType: "line", fontFamily: "sans", ...axisLabelDefaults, data } as const,
  ]) {
    const typ = buildStatsChartTypst(spec as StatsChartSpec);
    assert.match(
      typ,
      /set-style\(axes: \(bottom: \(tick: \(label: \(offset: 1cm\)\)\), left: \(tick: \(label: \(offset: 1cm\)\)\)\)\)/,
      `${spec.chartType} (showValues=${"showValues" in spec ? spec.showValues : "n/a"}) missing axis tick clearance`,
    );
  }

  const boxwhisker = buildStatsChartTypst({
    kind: "statsChart",
    chartType: "boxwhisker",
    fontFamily: "sans",
    data: [{ label: "測試", min: 10, q1: 20, median: 30, q3: 40, max: 50 }],
  });
  assert.match(boxwhisker, /set-style\(axes: \(bottom:/);
});

test("scatter chart plots raw (x, y) points with no connecting line", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    chartType: "scatter",
    fontFamily: "sans",
    trendLine: "none",
    trendLineColor: "#737373",
    showGridLines: true,
    xLabel: "",
    yLabel: "",
    yLabelRotated: true,
    data: [
      { x: 1, y: 2 },
      { x: 2, y: 4 },
      { x: 3, y: 3 },
    ],
  });
  assert.match(typ, /plot\.add\(/);
  assert.match(typ, /style: \(stroke: none\)/);
  assert.match(typ, /\(1, 2\)/);
  assert.doesNotMatch(typ, /trend/i);
});

test("scatter chart's linear trend line uses the user-chosen trendLineColor, not a fixed default", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    chartType: "scatter",
    fontFamily: "sans",
    trendLine: "linear",
    trendLineColor: "#ff0000",
    showGridLines: true,
    xLabel: "",
    yLabel: "",
    yLabelRotated: true,
    data: [
      { x: 0, y: 0 },
      { x: 1, y: 2 },
      { x: 2, y: 4 },
      { x: 3, y: 6 },
    ],
  });
  assert.match(typ, /stroke: rgb\("#ff0000"\) \+ 2pt/);
});

test("scatter chart's lowess trend line also uses the user-chosen trendLineColor", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    chartType: "scatter",
    fontFamily: "sans",
    trendLine: "lowess",
    trendLineColor: "#00ff00",
    showGridLines: true,
    xLabel: "",
    yLabel: "",
    yLabelRotated: true,
    data: Array.from({ length: 10 }, (_, i) => ({ x: i, y: i * i })),
  });
  assert.match(typ, /stroke: rgb\("#00ff00"\) \+ 2pt/);
  assert.match(typ, /line: "spline"/);
});

test("scatter chart's value axes always floor at 0, regardless of the data's own min", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    chartType: "scatter",
    fontFamily: "sans",
    trendLine: "none",
    trendLineColor: "#737373",
    showGridLines: true,
    xLabel: "",
    yLabel: "",
    yLabelRotated: true,
    data: [
      { x: 40, y: 400 },
      { x: 60, y: 600 },
    ],
  });
  assert.match(typ, /x-min: 0/);
  assert.match(typ, /y-min: 0/);
});

test("scatter chart's tick step only ever chooses a 5-or-10-per-decade step, never 1/2", () => {
  // Data max of 13 would round to step 2 under the general niceTickStep
  // (used by bar/column) — scatter must use its own narrower step
  // chooser instead, landing on 5 here (13/5 = 2.6 rough step, rounds up
  // to the 5-per-decade candidate, not niceTickStep's "2").
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    chartType: "scatter",
    fontFamily: "sans",
    trendLine: "none",
    trendLineColor: "#737373",
    showGridLines: true,
    xLabel: "",
    yLabel: "",
    yLabelRotated: true,
    data: [{ x: 13, y: 13 }],
  });
  assert.match(typ, /x-tick-step: 5\b/);
  assert.match(typ, /y-tick-step: 5\b/);
  // max rounds up to the next step-5 multiple past 13: 15.
  assert.match(typ, /x-max: 15\b/);
});

test("scatter chart's tick step targets ~5 ticks instead of always rounding to the widest decade", () => {
  // Real bug, caught via a live screenshot: a y max of ~520 was
  // rendering with y-max: 1000 (step 500 — only 2 ticks total) instead
  // of a step that actually fits the data. The old algorithm derived
  // "5 or 10" from the rough step's OWN decade only (104 normalizes to
  // 1.04 against magnitude 100, which the old code always rounded UP to
  // "5" since there was no "1" option) — the fix scores every 5-or-10
  // candidate across ALL decades by how close its resulting tick count
  // is to a target of 5, correctly landing on step 100 (6 ticks) here
  // instead of step 500 (2 ticks).
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    chartType: "scatter",
    fontFamily: "sans",
    trendLine: "none",
    trendLineColor: "#737373",
    showGridLines: true,
    xLabel: "",
    yLabel: "",
    yLabelRotated: true,
    data: [{ x: 1, y: 520 }],
  });
  assert.match(typ, /y-tick-step: 100\b/);
  assert.match(typ, /y-max: 600\b/);
  assert.doesNotMatch(typ, /y-max: 1000\b/);
});

test("scatter chart's x-axis gets the same targeted tick-step fix as y (computed independently)", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    chartType: "scatter",
    fontFamily: "sans",
    trendLine: "none",
    trendLineColor: "#737373",
    showGridLines: true,
    xLabel: "",
    yLabel: "",
    yLabelRotated: true,
    data: [{ x: 520, y: 1 }],
  });
  assert.match(typ, /x-tick-step: 100\b/);
  assert.match(typ, /x-max: 600\b/);
  assert.doesNotMatch(typ, /x-max: 1000\b/);
});

test("scatter chart's showGridLines toggles both axes' gridlines together", () => {
  const typ = buildStatsChartTypst({
    kind: "statsChart",
    chartType: "scatter",
    fontFamily: "sans",
    trendLine: "none",
    trendLineColor: "#737373",
    showGridLines: false,
    xLabel: "",
    yLabel: "",
    yLabelRotated: true,
    data: [{ x: 1, y: 1 }],
  });
  assert.match(typ, /x-grid: false/);
  assert.match(typ, /y-grid: false/);
});
