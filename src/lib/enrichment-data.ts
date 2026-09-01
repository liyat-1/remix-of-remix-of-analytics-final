/**
 * Compatibility shim.
 *
 * The analytics model now lives in `@/lib/analytics-model`. The bridge, funnel,
 * fill-bar, self-scaled and staircase views still speak the flat `Totals`
 * shape, which the model produces through `toTotals()`.
 */
export { compact, nf, pct, type Totals } from "@/lib/analytics-model";
