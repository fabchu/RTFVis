import { describe, expect, it } from "vitest";
import { buildValidationReport } from "../src/preprocess/validate.js";
import type { Route } from "../src/types.js";

function makeRoute(overrides: Partial<Route> = {}): Route {
  return {
    id: "test-route",
    category: "RTF",
    name: "Testroute",
    totalDistanceM: 10000,
    checkpoints: [
      { id: "START", distanceM: 0, deviationM: 2 },
      { id: "CP1", distanceM: 5000, deviationM: 10 },
      { id: "FINISH", distanceM: 10000, deviationM: 1 },
    ],
    geometry: [],
    cumulativeM: [],
    ...overrides,
  };
}

describe("buildValidationReport", () => {
  it("meldet keine Warnungen bei sauberen Daten", () => {
    const report = buildValidationReport([makeRoute()]);
    expect(report.entries.every((e) => !e.warning)).toBe(true);
    expect(report.orderIssues).toHaveLength(0);
  });

  it("markiert Checkpoints mit Abweichung über 50m als Warnung", () => {
    const route = makeRoute({
      checkpoints: [
        { id: "START", distanceM: 0, deviationM: 2 },
        { id: "CP1", distanceM: 5000, deviationM: 75 },
      ],
    });
    const report = buildValidationReport([route]);
    const warning = report.entries.find((e) => e.checkpointId === "CP1");
    expect(warning?.warning).toBe(true);
  });

  it("meldet ein Reihenfolge-Problem bei nicht steigender Distanz", () => {
    const route = makeRoute({
      checkpoints: [
        { id: "START", distanceM: 0, deviationM: 1 },
        { id: "CP1", distanceM: 5000, deviationM: 1 },
        { id: "CP2", distanceM: 4000, deviationM: 1 }, // liegt VOR CP1 -> Fehler
      ],
    });
    const report = buildValidationReport([route]);
    expect(report.orderIssues).toHaveLength(1);
    expect(report.orderIssues[0]).toMatch(/CP2/);
  });
});
