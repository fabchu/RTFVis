import type { RiderPosition } from "@rtfvis/core";
import { describe, expect, it } from "vitest";
import { computeCategorySummary } from "../src/categorySummary.js";

function position(overrides: Partial<RiderPosition>): RiderPosition {
  return {
    startNumber: "101",
    status: "onCourse",
    category: "RTF",
    routeId: "rtf-90",
    candidateRouteIds: ["rtf-90"],
    rosterConflict: false,
    distanceM: 500,
    position: { lon: 8.65, lat: 49.85 },
    speedMps: 5,
    lastCheckpointId: "CP1",
    lastCheckpointTimeUtc: "2026-07-25T08:00:00Z",
    nextCheckpointId: "CP2",
    lastCheckpointDistanceM: 0,
    nextCheckpointDistanceM: 1000,
    ...overrides,
  };
}

describe("computeCategorySummary", () => {
  it("enthält jede übergebene Kategorie, auch ohne gestartete Fahrer", () => {
    const result = computeCategorySummary([], ["RTF", "CTF", "Jedermann"]);
    expect(result).toEqual([
      { category: "RTF", startedCount: 0, onCourseCount: 0 },
      { category: "CTF", startedCount: 0, onCourseCount: 0 },
      { category: "Jedermann", startedCount: 0, onCourseCount: 0 },
    ]);
  });

  it("zählt notStarted nicht als losgefahren", () => {
    const positions = [position({ category: "RTF", status: "notStarted" })];
    const result = computeCategorySummary(positions, ["RTF"]);
    expect(result).toEqual([{ category: "RTF", startedCount: 0, onCourseCount: 0 }]);
  });

  it("zählt onCourse und overdue als 'losgefahren' und als 'unterwegs'", () => {
    const positions = [
      position({ startNumber: "1", category: "RTF", status: "onCourse" }),
      position({ startNumber: "2", category: "RTF", status: "overdue" }),
    ];
    const result = computeCategorySummary(positions, ["RTF"]);
    expect(result).toEqual([{ category: "RTF", startedCount: 2, onCourseCount: 2 }]);
  });

  it("zählt finished, routeConflict und ambiguousRoute als losgefahren, aber nicht mehr als unterwegs", () => {
    const positions = [
      position({ startNumber: "1", category: "RTF", status: "finished" }),
      position({ startNumber: "2", category: "RTF", status: "routeConflict" }),
      position({ startNumber: "3", category: "RTF", status: "ambiguousRoute" }),
    ];
    const result = computeCategorySummary(positions, ["RTF"]);
    expect(result).toEqual([{ category: "RTF", startedCount: 3, onCourseCount: 0 }]);
  });

  it("trennt die Zählung sauber nach Kategorie", () => {
    const positions = [
      position({ startNumber: "1", category: "RTF", status: "onCourse" }),
      position({ startNumber: "2", category: "CTF", status: "onCourse" }),
      position({ startNumber: "3", category: "CTF", status: "finished" }),
    ];
    const result = computeCategorySummary(positions, ["RTF", "CTF"]);
    expect(result).toEqual([
      { category: "RTF", startedCount: 1, onCourseCount: 1 },
      { category: "CTF", startedCount: 2, onCourseCount: 1 },
    ]);
  });

  it("ignoriert Fahrer mit einer Kategorie, die nicht in der übergebenen Liste enthalten ist", () => {
    const positions = [position({ category: "Jedermann", status: "onCourse" })];
    const result = computeCategorySummary(positions, ["RTF"]);
    expect(result).toEqual([{ category: "RTF", startedCount: 0, onCourseCount: 0 }]);
  });
});
