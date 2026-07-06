import type { FunctionPlotSpec } from "./schema.js";

// Pinned to whatever version is staged under
// anvilnote-desktop/resources/typst-packages/preview/simple-plot/<version>/
// for offline use (see anvilnote-mermaid-plan memory for the same pattern
// used by merman/subpar) — bump both together.
export const SIMPLE_PLOT_VERSION = "0.9.1";

// simple-plot defaults to a fixed 6x6cm square (width: 6, height: 6) when
// neither is passed, AND defaults ymin/ymax to a fixed -5/5 (span 10)
// whenever they're not explicitly given (confirmed by reading its own
// lib.typ: `resolve(ymin, "ymin", -5)`/`resolve(ymax, "ymax", 5)`) — our
// schema/dialog only exposes xMin/xMax, never ymin/ymax, so the y-span is
// ALWAYS 10 regardless of what x-range the user picks. Reported: this
// forced every plot into a small, always-square 1:1 box no matter the
// actual xMin/xMax spread. Since width/height directly set each axis's
// canvas-units-per-data-unit scale (`x-scale = width / (xmax-xmin)`,
// `y-scale = height / (ymax-ymin)` per simple-plot's own source), an
// explicit width/height computed from the actual x-span (against the
// package's fixed 10-unit y-span) gives a plot whose ASPECT matches the
// data instead of being forced square, while also being bigger overall
// than the tiny 6cm default.
const BASE_WIDTH_CM = 10;
const DEFAULT_Y_SPAN = 10; // simple-plot's own fixed ymin:-5/ymax:5 default
const MIN_HEIGHT_CM = 4;
const MAX_HEIGHT_CM = 14;

function computePlotSize(xMin: number, xMax: number): { width: number; height: number } {
  const xSpan = xMax - xMin;
  const rawHeight = BASE_WIDTH_CM * (DEFAULT_Y_SPAN / xSpan);
  const height = Math.min(Math.max(rawHeight, MIN_HEIGHT_CM), MAX_HEIGHT_CM);
  return { width: BASE_WIDTH_CM, height };
}

export function buildFunctionPlotTypst(spec: FunctionPlotSpec): string {
  const curveArgs = spec.curves
    .map(
      (curve) =>
        `  (fn: x => ${curve.formula}, stroke: (paint: rgb("${curve.color}"), thickness: 1.5pt, dash: "${curve.dash}"))`,
    )
    .join(",\n");

  // width/height: auto + zero-ish margin crops the page to the plot's own
  // bounding box, since this .typ file's entire content IS the chart (not
  // embedded in a larger document) — standard technique for generating a
  // standalone SVG asset with Typst.
  //
  // Typst has no bare global `sin`/`cos`/`pow`/etc. — they only exist under
  // the built-in `calc` module (`calc.sin(x)`, not `sin(x)`). Users typing a
  // formula naturally write `sin(x)`, so import the common names out of
  // `calc` into scope here (Typst supports `#import <module>: <names>` for
  // built-in modules, not just file/package imports) rather than requiring
  // everyone to type the `calc.` prefix themselves.
  const CALC_IMPORTS =
    "sin, cos, tan, asin, acos, atan, sinh, cosh, tanh, pow, sqrt, exp, ln, log, abs, floor, ceil, round, min, max, pi, e";

  // simple-plot's `xtick`/`ytick` separately control the tick marks +
  // number labels along each axis from `show-grid` (the background grid
  // squares) — confirmed via a real compile that `xtick: none, ytick: none`
  // hides both the tick marks and their numbers while leaving the axis
  // lines/arrows and (if enabled) the background gridlines untouched.
  const tickArgs = spec.showAxisTicks ? "" : ",\n  xtick: none, ytick: none";
  const { width, height } = computePlotSize(spec.xMin, spec.xMax);

  return `#import "@preview/simple-plot:${SIMPLE_PLOT_VERSION}": plot
#import calc: ${CALC_IMPORTS}
#set page(width: auto, height: auto, margin: 8pt)
#plot(
  xmin: ${spec.xMin}, xmax: ${spec.xMax},
  width: ${width}, height: ${height},
  show-grid: ${spec.showGridlines}${tickArgs},
${curveArgs}
)
`;
}
