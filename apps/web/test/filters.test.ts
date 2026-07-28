import type { RiderPosition, Route } from "@rtfvis/core";
import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, filterPositions, routeMatchesFilters, type PositionFilters } from "../src/filters.js";

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

function route(id: string, overrides: Partial<Route> = {}): Route {
  return {
    id,
    category: "RTF",
    name: id,
    totalDistanceM: 1000,
    checkpoints: [],
    geometry: [],
    cumulativeM: [],
    ...overrides,
  };
}

const routesById = new Map<string, Route>([
  ["rtf-90", route("rtf-90")],
  ["rtf-45", route("rtf-45")],
  ["ctf-70", route("ctf-70", { category: "CTF" })],
  ["rtf-90-sternfahrt", route("rtf-90-sternfahrt", { baseRouteId: "rtf-90" })],
]);

const riders: RiderPosition[] = [
  position({ startNumber: "101", category: "RTF", routeId: "rtf-90", status: "onCourse" }),
  position({ startNumber: "202", category: "CTF", routeId: "ctf-70", candidateRouteIds: ["ctf-70"], status: "overdue" }),
  position({
    startNumber: "303",
    category: "RTF",
    routeId: null,
    candidateRouteIds: ["rtf-90", "rtf-45"],
    status: "ambiguousRoute",
  }),
];

describe("filterPositions", () => {
  it("gibt bei Standardfiltern alle Fahrer zurück", () => {
    expect(filterPositions(riders, DEFAULT_FILTERS, routesById)).toHaveLength(3);
  });

  it("filtert nach Kategorie", () => {
    const filters: PositionFilters = { ...DEFAULT_FILTERS, category: "CTF" };
    expect(filterPositions(riders, filters, routesById).map((r) => r.startNumber)).toEqual(["202"]);
  });

  it("filtert nach Status", () => {
    const filters: PositionFilters = { ...DEFAULT_FILTERS, status: "overdue" };
    expect(filterPositions(riders, filters, routesById).map((r) => r.startNumber)).toEqual(["202"]);
  });

  it("filtert nach Strecke und berücksichtigt auch Kandidatenstrecken mehrdeutiger Fahrer", () => {
    const filters: PositionFilters = { ...DEFAULT_FILTERS, routeId: "rtf-45" };
    // Fahrer 303 hat routeId=null, aber rtf-45 als Kandidat -> sollte trotzdem erscheinen.
    expect(filterPositions(riders, filters, routesById).map((r) => r.startNumber)).toEqual(["303"]);
  });

  it("filtert per Startnummern-Suche, case-insensitive als Teilstring", () => {
    const filters: PositionFilters = { ...DEFAULT_FILTERS, search: "20" };
    expect(filterPositions(riders, filters, routesById).map((r) => r.startNumber)).toEqual(["202"]);
  });

  it("kombiniert mehrere Filter (UND-Verknüpfung)", () => {
    const filters: PositionFilters = { ...DEFAULT_FILTERS, category: "RTF", status: "onCourse" };
    expect(filterPositions(riders, filters, routesById).map((r) => r.startNumber)).toEqual(["101"]);
  });

  describe("Sternfahrt-Varianten", () => {
    it("zählt einen Fahrer auf einer Sternfahrt-Variante beim Filtern nach der Basis-Strecke mit", () => {
      const sternfahrer = position({ startNumber: "404", routeId: "rtf-90-sternfahrt", candidateRouteIds: ["rtf-90-sternfahrt"] });
      const filters: PositionFilters = { ...DEFAULT_FILTERS, routeId: "rtf-90" };
      const result = filterPositions([...riders, sternfahrer], filters, routesById);
      // 303 hat rtf-90 explizit als Kandidat (Mehrdeutigkeit ohne Sternfahrt-Bezug) und
      // gehört daher unabhängig vom Sternfahrt-Fix ebenfalls zum Treffer.
      expect(result.map((r) => r.startNumber).sort()).toEqual(["101", "303", "404"]);
    });

    it("berücksichtigt Sternfahrt-Varianten auch in candidateRouteIds", () => {
      const sternfahrer = position({
        startNumber: "404",
        routeId: null,
        candidateRouteIds: ["rtf-90-sternfahrt"],
        status: "ambiguousRoute",
      });
      const filters: PositionFilters = { ...DEFAULT_FILTERS, routeId: "rtf-90" };
      expect(filterPositions([sternfahrer], filters, routesById).map((r) => r.startNumber)).toEqual(["404"]);
    });
  });
});

describe("routeMatchesFilters", () => {
  const rtf90 = route("rtf-90");
  const rtf45 = route("rtf-45");
  const ctf70 = route("ctf-70", { category: "CTF" });
  const rtf90Sternfahrt = route("rtf-90-sternfahrt", { baseRouteId: "rtf-90" });

  it("lässt bei Standardfiltern jede Strecke durch", () => {
    expect(routeMatchesFilters(rtf90, DEFAULT_FILTERS)).toBe(true);
    expect(routeMatchesFilters(ctf70, DEFAULT_FILTERS)).toBe(true);
  });

  it("filtert nach Kategorie", () => {
    const filters = { ...DEFAULT_FILTERS, category: "CTF" as const };
    expect(routeMatchesFilters(rtf90, filters)).toBe(false);
    expect(routeMatchesFilters(ctf70, filters)).toBe(true);
  });

  it("filtert nach Strecke", () => {
    const filters = { ...DEFAULT_FILTERS, routeId: "rtf-90" };
    expect(routeMatchesFilters(rtf90, filters)).toBe(true);
    expect(routeMatchesFilters(rtf45, filters)).toBe(false);
  });

  it("lässt die Sternfahrt-Variante einer ausgewählten Strecke ebenfalls durch", () => {
    const filters = { ...DEFAULT_FILTERS, routeId: "rtf-90" };
    expect(routeMatchesFilters(rtf90Sternfahrt, filters)).toBe(true);
  });

  it("kombiniert Kategorie- und Streckenfilter (UND-Verknüpfung)", () => {
    const filters = { ...DEFAULT_FILTERS, category: "CTF" as const, routeId: "rtf-90" };
    expect(routeMatchesFilters(rtf90, filters)).toBe(false);
    expect(routeMatchesFilters(ctf70, filters)).toBe(false);
  });
});
