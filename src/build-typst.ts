import type { FunctionPlotSpec } from "./schema.js";

// Pinned to whatever version is staged under
// anvilnote-desktop/resources/typst-packages/preview/simple-plot/<version>/
// for offline use (see anvilnote-mermaid-plan memory for the same pattern
// used by merman/subpar) — bump both together.
export const SIMPLE_PLOT_VERSION = "0.9.1";

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

  return `#import "@preview/simple-plot:${SIMPLE_PLOT_VERSION}": plot
#import calc: ${CALC_IMPORTS}
#set page(width: auto, height: auto, margin: 8pt)
#plot(
  xmin: ${spec.xMin}, xmax: ${spec.xMax},
  show-grid: ${spec.showGridlines}${tickArgs},
${curveArgs}
)
`;
}
