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
  return `#import "@preview/simple-plot:${SIMPLE_PLOT_VERSION}": plot
#set page(width: auto, height: auto, margin: 8pt)
#plot(
  xmin: ${spec.xMin}, xmax: ${spec.xMax},
  show-grid: ${spec.showGridlines},
${curveArgs}
)
`;
}
