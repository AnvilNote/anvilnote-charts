import { z } from "zod";

// Typst's own `calc` module expressions (e.g. "sin(x)", "calc.pow(x, 2)") —
// formulas are spliced directly into generated Typst source (see
// build-typst.ts), so this whitelist exists to fail clearly on anything that
// could break the generated .typ file's structure, not as a sandbox: Typst
// itself grants no filesystem/network access from within a compiled document.
const FORMULA_PATTERN = /^[a-zA-Z0-9+\-*/^().,\s]+$/;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const DASH_VALUES = ["solid", "dashed", "dotted", "dash-dot"] as const;

export const curveSchema = z.object({
  formula: z
    .string()
    .min(1)
    .max(200)
    .regex(FORMULA_PATTERN, "Formula contains unsupported characters"),
  color: z.string().regex(HEX_COLOR_PATTERN, "Color must be a 6-digit hex value"),
  dash: z.enum(DASH_VALUES),
});

export const functionPlotSpecSchema = z
  .object({
    // Defaulted for convenience when parsing this schema directly (e.g. in
    // this file's own tests) — NOT a backward-compat safety net at the
    // outer `chartSpecSchema` discriminated union in schema.ts. Verified:
    // z.discriminatedUnion picks a branch by reading the raw input's
    // literal "kind" value directly; it does not try each candidate
    // schema's own .default() to see if one would end up matching, so an
    // input missing "kind" entirely fails union routing regardless of this
    // default. Callers of the CLI/API MUST always send "kind" explicitly.
    kind: z.literal("functionPlot").default("functionPlot"),
    curves: z.array(curveSchema).min(1).max(6),
    xMin: z.number().finite(),
    xMax: z.number().finite(),
    showGridlines: z.boolean(),
    // Defaulted (not required): added after the initial spec shape shipped,
    // so older saved documents' cached specs that predate this field still
    // validate — they just get the pre-existing "ticks visible" behavior.
    showAxisTicks: z.boolean().default(true),
  })
  .refine((spec) => spec.xMin < spec.xMax, {
    message: "xMin must be less than xMax",
    path: ["xMin"],
  });

export type Curve = z.infer<typeof curveSchema>;
export type FunctionPlotSpec = z.infer<typeof functionPlotSpecSchema>;
