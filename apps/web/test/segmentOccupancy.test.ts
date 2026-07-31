import type { CheckpointDef, RiderPosition, Route } from "@rtfvis/core";
import { describe, expect, it } from "vitest";
import {
  computeCheckpointPairOccupancy,
  groupCheckpointPairsByName,
  groupNamedPairsByCategory,
  type CheckpointPairOccupancy,
} from "../src/segmentOccupancy.js";

const rtfShort: Route = {
  id: "rtf-short",
  category: "RTF",
  name: "RTF kurz",
  totalDistanceM: 30_000,
  checkpoints: [
    { id: "START", distanceM: 0, deviationM: 0 },
    { id: "CP1", distanceM: 10_000, deviationM: 0 },
    { id: "CP2", distanceM: 20_000, deviationM: 0 },
    { id: "FINISH_SHORT", distanceM: 30_000, deviationM: 0 },
  ],
  geometry: [],
  cumulativeM: [],
};

const rtfLong: Route = {
  id: "rtf-long",
  category: "RTF",
  name: "RTF lang",
  totalDistanceM: 50_000,
  checkpoints: [
    { id: "START", distanceM: 0, deviationM: 0 },
    { id: "CP1", distanceM: 10_000, deviationM: 0 },
    { id: "CP2", distanceM: 20_000, deviationM: 0 },
    { id: "CP3", distanceM: 35_000, deviationM: 0 },
    { id: "FINISH_LONG", distanceM: 50_000, deviationM: 0 },
  ],
  geometry: [],
  cumulativeM: [],
};

const routes = [rtfShort, rtfLong];

function position(overrides: Partial<RiderPosition>): RiderPosition {
  return {
    startNumber: "101",
    status: "onCourse",
    category: "RTF",
    routeId: "rtf-short",
    candidateRouteIds: ["rtf-short"],
    rosterConflict: false,
    distanceM: 15_000,
    position: { lon: 8.65, lat: 49.85 },
    speedMps: 5,
    lastCheckpointId: "CP1",
    lastCheckpointTimeUtc: "2026-07-25T08:00:00Z",
    nextCheckpointId: "CP2",
    lastCheckpointDistanceM: 10_000,
    nextCheckpointDistanceM: 20_000,
    ...overrides,
  };
}

describe("computeCheckpointPairOccupancy", () => {
  it("enthält jeden physischen Checkpoint-Abschnitt genau einmal, auch wenn mehrere Strecken ihn teilen", () => {
    const result = computeCheckpointPairOccupancy([], routes);
    // Eindeutige Paare: START-CP1, CP1-CP2 (beide geteilt), CP2-FINISH_SHORT (nur kurz),
    // CP2-CP3, CP3-FINISH_LONG (nur lang) -> 5, nicht 3+4=7.
    expect(result).toHaveLength(5);
    const pair = result.find((p) => p.fromCheckpointId === "START" && p.toCheckpointId === "CP1");
    expect(pair?.routeIds.sort()).toEqual(["rtf-long", "rtf-short"]);
  });

  it("enthält auch Abschnitte mit 0 Fahrern", () => {
    const result = computeCheckpointPairOccupancy([], routes);
    expect(result.every((p) => p.riderCount === 0)).toBe(true);
  });

  it("zählt einen eindeutig aufgelösten Fahrer im richtigen Abschnitt", () => {
    const result = computeCheckpointPairOccupancy([position({})], routes);
    const pair = result.find((p) => p.fromCheckpointId === "CP1" && p.toCheckpointId === "CP2");
    expect(pair?.riderCount).toBe(1);
    expect(result.filter((p) => p.riderCount > 0)).toHaveLength(1);
  });

  it("zählt einen mehrdeutigen Fahrer auf einem geteilten Abschnitt nur EINMAL (nicht pro Kandidatenstrecke)", () => {
    const ambiguous = position({
      routeId: null,
      candidateRouteIds: ["rtf-short", "rtf-long"],
      lastCheckpointId: "CP1",
      nextCheckpointId: "CP2",
    });
    const result = computeCheckpointPairOccupancy([ambiguous], routes);
    const pair = result.find((p) => p.fromCheckpointId === "CP1" && p.toCheckpointId === "CP2");
    expect(pair?.riderCount).toBe(1);
    expect(pair?.routeIds.sort()).toEqual(["rtf-long", "rtf-short"]);
  });

  it("zählt zwei eindeutig verschiedene Fahrer auf verschiedenen Strecken korrekt getrennt", () => {
    const onShort = position({
      routeId: "rtf-short",
      candidateRouteIds: ["rtf-short"],
      lastCheckpointId: "CP2",
      nextCheckpointId: "FINISH_SHORT",
    });
    const onLong = position({
      routeId: "rtf-long",
      candidateRouteIds: ["rtf-long"],
      lastCheckpointId: "CP2",
      nextCheckpointId: "CP3",
    });
    const result = computeCheckpointPairOccupancy([onShort, onLong], routes);
    expect(result.find((p) => p.toCheckpointId === "FINISH_SHORT")?.riderCount).toBe(1);
    expect(result.find((p) => p.toCheckpointId === "CP3")?.riderCount).toBe(1);
  });

  it("zählt notStarted, finished, routeConflict und ambiguousRoute nicht in riderCount", () => {
    const positions = [
      position({ status: "notStarted", lastCheckpointId: null, nextCheckpointId: null }),
      position({ status: "finished", nextCheckpointId: null }),
      position({ status: "routeConflict", candidateRouteIds: [], routeId: null, nextCheckpointId: null }),
      position({ status: "ambiguousRoute", routeId: null, nextCheckpointId: null }),
    ];
    const result = computeCheckpointPairOccupancy(positions, routes);
    expect(result.every((p) => p.riderCount === 0)).toBe(true);
  });

  it("zählt overdue-Fahrer im aktuellen Abschnitt mit", () => {
    const result = computeCheckpointPairOccupancy([position({ status: "overdue" })], routes);
    const pair = result.find((p) => p.fromCheckpointId === "CP1" && p.toCheckpointId === "CP2");
    expect(pair?.riderCount).toBe(1);
  });
});

describe("computeCheckpointPairOccupancy: unclearCount", () => {
  it("zählt einen ambiguousRoute-Fahrer als unclearCount auf JEDEM Abschnitt, den eine seiner Kandidatenstrecken ab dem letzten Checkpoint noch nehmen könnte", () => {
    // rtf-short und rtf-long teilen sich CP1, laufen danach beide über CP2 weiter -> nur
    // EIN möglicher nächster Abschnitt (CP1->CP2), obwohl zwei Kandidatenstrecken.
    const ambiguous = position({
      status: "ambiguousRoute",
      routeId: null,
      candidateRouteIds: ["rtf-short", "rtf-long"],
      lastCheckpointId: "CP1",
      nextCheckpointId: null,
    });
    const result = computeCheckpointPairOccupancy([ambiguous], routes);
    const pair = result.find((p) => p.fromCheckpointId === "CP1" && p.toCheckpointId === "CP2");
    expect(pair?.unclearCount).toBe(1);
    expect(pair?.riderCount).toBe(0);
    expect(result.filter((p) => p.unclearCount > 0)).toHaveLength(1);
  });

  it("zählt einen ambiguousRoute-Fahrer auf ECHT unterschiedlichen möglichen Abschnitten mehrfach (verschiedene Segmente, nicht derselbe Fahrer doppelt)", () => {
    // Ab CP2 divergieren rtf-short (-> FINISH_SHORT) und rtf-long (-> CP3) tatsächlich.
    const ambiguous = position({
      status: "ambiguousRoute",
      routeId: null,
      candidateRouteIds: ["rtf-short", "rtf-long"],
      lastCheckpointId: "CP2",
      nextCheckpointId: null,
    });
    const result = computeCheckpointPairOccupancy([ambiguous], routes);
    expect(result.find((p) => p.fromCheckpointId === "CP2" && p.toCheckpointId === "FINISH_SHORT")?.unclearCount).toBe(1);
    expect(result.find((p) => p.fromCheckpointId === "CP2" && p.toCheckpointId === "CP3")?.unclearCount).toBe(1);
    expect(result.filter((p) => p.unclearCount > 0)).toHaveLength(2);
  });

  it("zählt einen routeConflict-Fahrer (Route komplett unbekannt) auf allen Abschnitten seiner Kategorie ab dem letzten bekannten Checkpoint", () => {
    const conflicted = position({
      status: "routeConflict",
      routeId: null,
      candidateRouteIds: [],
      category: "RTF",
      lastCheckpointId: "CP1",
      nextCheckpointId: null,
    });
    const result = computeCheckpointPairOccupancy([conflicted], routes);
    const pair = result.find((p) => p.fromCheckpointId === "CP1" && p.toCheckpointId === "CP2");
    expect(pair?.unclearCount).toBe(1);
    expect(pair?.riderCount).toBe(0);
  });

  it("routeConflict ohne bekannte Kategorie trägt zu keinem Abschnitt unclearCount bei (keine Grundlage für eine Vermutung)", () => {
    const conflicted = position({
      status: "routeConflict",
      routeId: null,
      candidateRouteIds: [],
      category: null,
      lastCheckpointId: "CP1",
      nextCheckpointId: null,
    });
    const result = computeCheckpointPairOccupancy([conflicted], routes);
    expect(result.every((p) => p.unclearCount === 0)).toBe(true);
  });

  it("notStarted und finished tragen nicht zu unclearCount bei", () => {
    const positions = [
      position({ status: "notStarted", lastCheckpointId: null, nextCheckpointId: null }),
      position({ status: "finished", nextCheckpointId: null }),
    ];
    const result = computeCheckpointPairOccupancy(positions, routes);
    expect(result.every((p) => p.unclearCount === 0)).toBe(true);
  });
});

describe("groupCheckpointPairsByName", () => {
  const checkpointsById = new Map<string, CheckpointDef>([
    ["START", { id: "START", name: "Start/Ziel", lat: 0, lon: 0 }],
    ["FINISH", { id: "FINISH", name: "Start/Ziel", lat: 0, lon: 0 }],
    ["K1", { id: "K1", name: "Villingen", lat: 0, lon: 0 }],
  ]);

  function pair(overrides: Partial<CheckpointPairOccupancy>): CheckpointPairOccupancy {
    return { fromCheckpointId: "K1", toCheckpointId: "FINISH", routeIds: ["rtf-90"], riderCount: 0, unclearCount: 0, ...overrides };
  }

  it("fasst Abschnitte mit identischem Namenspaar zusammen (z.B. START und FINISH heißen beide 'Start/Ziel')", () => {
    const pairs = [pair({ toCheckpointId: "FINISH", riderCount: 7 }), pair({ toCheckpointId: "START", riderCount: 3 })];
    const result = groupCheckpointPairsByName(pairs, checkpointsById);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ fromName: "Villingen", toName: "Start/Ziel", riderCount: 10 });
  });

  it("summiert unclearCount genauso wie riderCount über zusammengefasste Abschnitte hinweg", () => {
    const pairs = [
      pair({ toCheckpointId: "FINISH", unclearCount: 2 }),
      pair({ toCheckpointId: "START", unclearCount: 5 }),
    ];
    const result = groupCheckpointPairsByName(pairs, checkpointsById);
    expect(result[0].unclearCount).toBe(7);
  });

  it("nutzt den ZUERST gesehenen Abschnitt als Repräsentant (eigene IDs bleiben zusammengehörig, werden nie gemischt)", () => {
    const first = pair({ toCheckpointId: "FINISH", riderCount: 7, routeIds: ["rtf-90"] });
    const second = pair({ toCheckpointId: "START", riderCount: 3, routeIds: ["rtf-90-sternfahrt"] });
    const result = groupCheckpointPairsByName([first, second], checkpointsById);
    expect(result[0].representative).toBe(first);
  });

  it("lässt Abschnitte mit unterschiedlichem Namenspaar getrennt", () => {
    const pairs = [
      pair({ toCheckpointId: "FINISH", riderCount: 5 }),
      pair({ fromCheckpointId: "START", toCheckpointId: "K1", riderCount: 2 }),
    ];
    const result = groupCheckpointPairsByName(pairs, checkpointsById);
    expect(result.map((p) => ({ fromName: p.fromName, toName: p.toName, riderCount: p.riderCount }))).toEqual([
      { fromName: "Start/Ziel", toName: "Villingen", riderCount: 2 },
      { fromName: "Villingen", toName: "Start/Ziel", riderCount: 5 },
    ]);
  });

  it("sortiert alphabetisch nach Von- dann Nach-Namen", () => {
    const pairs = [
      pair({ fromCheckpointId: "K1", toCheckpointId: "FINISH" }),
      pair({ fromCheckpointId: "START", toCheckpointId: "K1" }),
    ];
    const result = groupCheckpointPairsByName(pairs, checkpointsById);
    expect(result.map((p) => p.fromName)).toEqual(["Start/Ziel", "Villingen"]);
  });
});

describe("groupNamedPairsByCategory", () => {
  const ctfRoute: Route = {
    id: "ctf-1",
    category: "CTF",
    name: "CTF 1",
    totalDistanceM: 20_000,
    checkpoints: [
      { id: "START", distanceM: 0, deviationM: 0 },
      { id: "D1", distanceM: 10_000, deviationM: 0 },
      { id: "FINISH_CTF", distanceM: 20_000, deviationM: 0 },
    ],
    geometry: [],
    cumulativeM: [],
  };

  const routesById = new Map<string, Route>([
    ["rtf-short", rtfShort],
    ["rtf-long", rtfLong],
    ["ctf-1", ctfRoute],
  ]);

  const checkpointsById = new Map<string, CheckpointDef>([
    ["START", { id: "START", name: "Start/Ziel", lat: 0, lon: 0 }],
    ["CP1", { id: "CP1", name: "Punkt1", lat: 0, lon: 0 }],
    ["CP2", { id: "CP2", name: "Punkt2", lat: 0, lon: 0 }],
    ["CP3", { id: "CP3", name: "Punkt3", lat: 0, lon: 0 }],
    ["FINISH_SHORT", { id: "FINISH_SHORT", name: "Start/Ziel", lat: 0, lon: 0 }],
    ["FINISH_LONG", { id: "FINISH_LONG", name: "Start/Ziel", lat: 0, lon: 0 }],
    ["D1", { id: "D1", name: "CTF-Punkt", lat: 0, lon: 0 }],
    ["FINISH_CTF", { id: "FINISH_CTF", name: "Start/Ziel", lat: 0, lon: 0 }],
  ]);

  const allRoutes = [rtfShort, rtfLong, ctfRoute];
  const pairs = computeCheckpointPairOccupancy([], allRoutes);

  it("unterteilt die Abschnitte nach Kategorie", () => {
    const result = groupNamedPairsByCategory(pairs, routesById, checkpointsById);
    expect(result.map((g) => g.category)).toEqual(["CTF", "RTF"]);
  });

  it("sortiert Abschnitte innerhalb einer Kategorie in der Reihenfolge der längsten Strecke dieser Kategorie", () => {
    const result = groupNamedPairsByCategory(pairs, routesById, checkpointsById);
    const rtfGroup = result.find((g) => g.category === "RTF")!;
    // rtf-long (50km) ist die längste RTF-Strecke: Start/Ziel->Punkt1->Punkt2->Punkt3->Start/Ziel.
    // "Punkt2->Start/Ziel" existiert nur auf rtf-short und landet daher als einziger nicht
    // gefundener Abschnitt am Ende.
    expect(rtfGroup.segments.map((s) => `${s.fromName}->${s.toName}`)).toEqual([
      "Start/Ziel->Punkt1",
      "Punkt1->Punkt2",
      "Punkt2->Punkt3",
      "Punkt3->Start/Ziel",
      "Punkt2->Start/Ziel",
    ]);
  });

  it("sortiert die CTF-Kategorie anhand ihrer eigenen (einzigen) Strecke", () => {
    const result = groupNamedPairsByCategory(pairs, routesById, checkpointsById);
    const ctfGroup = result.find((g) => g.category === "CTF")!;
    expect(ctfGroup.segments.map((s) => `${s.fromName}->${s.toName}`)).toEqual([
      "Start/Ziel->CTF-Punkt",
      "CTF-Punkt->Start/Ziel",
    ]);
  });

  it("ignoriert Sternfahrt-Varianten bei der Suche nach der längsten Strecke", () => {
    const rtfLongSternfahrt: Route = { ...rtfLong, id: "rtf-long-sternfahrt", baseRouteId: "rtf-long", totalDistanceM: 100_000 };
    const routesWithVariant = new Map(routesById);
    routesWithVariant.set("rtf-long-sternfahrt", rtfLongSternfahrt);
    const result = groupNamedPairsByCategory(pairs, routesWithVariant, checkpointsById);
    const rtfGroup = result.find((g) => g.category === "RTF")!;
    // Trotz höherer totalDistanceM der (nicht existenten) Variante bleibt rtf-long
    // (echte, längste reale Strecke) die Referenz für die Sortierung.
    expect(rtfGroup.segments.map((s) => `${s.fromName}->${s.toName}`)[0]).toBe("Start/Ziel->Punkt1");
  });
});
