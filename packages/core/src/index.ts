// Öffentliche Laufzeit-API von @rtfvis/core — bewusst frei von den preprocess/*-Modulen
// (GPX-Parsing, Snapping, ...), die node:fs verwenden. Ein Re-Export von hier würde deren
// node:fs-Import unbedingt mitziehen (auch ohne tatsächlichen Aufruf) und damit jeden
// Import von "@rtfvis/core" im Browser (apps/web) zum Absturz bringen. Preprocessing bleibt
// Build-Zeit-Tooling und wird direkt aus packages/core/src/preprocess/* importiert, nicht
// über diesen Barrel-Export.
export * from "./types.js";
export { computePositions, lonLatAt, type ComputePositionsOptions, type RiderPosition, type RiderStatus } from "./position.js";
export { resolveRoute, isSubsequence, type RouteResolution } from "./route-matching.js";
export { matchScansToRouteCheckpoints } from "./scan-matching.js";
export { estimateSpeed } from "./speed.js";
