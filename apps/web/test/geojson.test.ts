import type { CheckpointDef, RiderPosition, Route } from "@rtfvis/core";
import { describe, expect, it } from "vitest";
import { checkpointPairOccupancyToGeoJSON, checkpointsToGeoJSON, ridersToGeoJSON, routesToGeoJSON } from "../src/geojson.js";
import type { CheckpointPairOccupancy } from "../src/segmentOccupancy.js";

const route: Route = {
  id: "rtf-90",
  category: "RTF",
  name: "RTF 90",
  totalDistanceM: 1000,
  checkpoints: [],
  geometry: [
    [8.6, 49.8],
    [8.7, 49.9],
  ],
  cumulativeM: [0, 1000],
};

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

describe("routesToGeoJSON", () => {
  it("baut eine LineString-Feature-Collection mit den erwarteten Properties", () => {
    const fc = routesToGeoJSON([route]);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry).toEqual({ type: "LineString", coordinates: route.geometry });
    expect(fc.features[0].properties).toEqual({ routeId: "rtf-90", category: "RTF", name: "RTF 90" });
  });
});

describe("ridersToGeoJSON", () => {
  it("überspringt Fahrer ohne Position", () => {
    const fc = ridersToGeoJSON([position({ position: null, status: "notStarted" })]);
    expect(fc.features).toHaveLength(0);
  });

  it("wandelt einen Fahrer mit Position in ein Point-Feature um", () => {
    const fc = ridersToGeoJSON([position({})]);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry).toEqual({ type: "Point", coordinates: [8.65, 49.85] });
    expect(fc.features[0].properties).toEqual({
      startNumber: "101",
      status: "onCourse",
      category: "RTF",
      routeId: "rtf-90",
      speedMps: 5,
    });
  });

  it("verwendet 'unbekannt' als Kategorie, wenn keine gesetzt ist", () => {
    const fc = ridersToGeoJSON([position({ category: null })]);
    expect(fc.features[0].properties.category).toBe("unbekannt");
  });
});

describe("checkpointsToGeoJSON", () => {
  it("wandelt Checkpoints in Point-Features um", () => {
    const checkpoints: CheckpointDef[] = [{ id: "CP1", name: "Verpflegung", lat: 49.8, lon: 8.6 }];
    const fc = checkpointsToGeoJSON(checkpoints);
    expect(fc.features[0].geometry).toEqual({ type: "Point", coordinates: [8.6, 49.8] });
    expect(fc.features[0].properties).toEqual({ id: "CP1", name: "Verpflegung" });
  });
});

describe("checkpointPairOccupancyToGeoJSON", () => {
  // Gerade Strecke von (8.6,49.8) nach (8.7,49.9), CP1 bei 200m, CP2 bei 800m von 1000m
  // Gesamtlänge -> Mitte zwischen ihnen liegt bei 500m = exakt der geografischen Mitte
  // der Geometrie (8.65, 49.85).
  const routeWithCheckpoints: Route = {
    ...route,
    checkpoints: [
      { id: "CP1", distanceM: 200, deviationM: 0 },
      { id: "CP2", distanceM: 800, deviationM: 0 },
    ],
  };
  const routesById = new Map<string, Route>([["rtf-90", routeWithCheckpoints]]);
  const checkpointsById = new Map<string, CheckpointDef>([
    ["CP1", { id: "CP1", name: "CP1", lat: 0, lon: 0 }],
    ["CP2", { id: "CP2", name: "CP2", lat: 0, lon: 0 }],
  ]);

  it("platziert den Marker auf halber Strecke ENTLANG DER STRECKENGEOMETRIE, nicht als Luftlinie zwischen den Checkpoint-Koordinaten", () => {
    const pairs: CheckpointPairOccupancy[] = [
      { fromCheckpointId: "CP1", toCheckpointId: "CP2", routeIds: ["rtf-90"], riderCount: 3, unclearCount: 0 },
    ];
    const fc = checkpointPairOccupancyToGeoJSON(pairs, routesById, checkpointsById);
    expect(fc.features[0].geometry.type).toBe("Point");
    const [lon, lat] = (fc.features[0].geometry as GeoJSON.Point).coordinates;
    expect(lon).toBeCloseTo(8.65, 10);
    expect(lat).toBeCloseTo(49.85, 10);
    expect(fc.features[0].properties).toEqual({
      fromCheckpointId: "CP1",
      toCheckpointId: "CP2",
      riderCount: 3,
      unclearCount: 0,
    });
  });

  it("überspringt Paare, deren referenzierte Strecke nicht bekannt ist", () => {
    const pairs: CheckpointPairOccupancy[] = [
      { fromCheckpointId: "CP1", toCheckpointId: "CP2", routeIds: ["unbekannte-strecke"], riderCount: 1, unclearCount: 0 },
    ];
    expect(checkpointPairOccupancyToGeoJSON(pairs, routesById, checkpointsById).features).toHaveLength(0);
  });

  it("überspringt Paare, deren Checkpoint-Abschnitt nicht (mehr) in der Strecke vorkommt", () => {
    const pairs: CheckpointPairOccupancy[] = [
      { fromCheckpointId: "CP1", toCheckpointId: "UNBEKANNT", routeIds: ["rtf-90"], riderCount: 1, unclearCount: 0 },
    ];
    expect(checkpointPairOccupancyToGeoJSON(pairs, routesById, checkpointsById).features).toHaveLength(0);
  });

  it("fasst zwei Abschnitte mit identischem Checkpoint-Namenspaar zu EINEM Marker mit der Summe der Fahrer zusammen", () => {
    // Regression: START und FINISH heißen bei Rundkursen beide "Start/Ziel" (z.B. der
    // reguläre Schlussabschnitt einer Strecke und der Rückweg-Abschnitt ihrer Sternfahrt-
    // Variante) — vorher entstanden daraus zwei fast deckungsgleiche Marker, von denen einer
    // (oft grau mit 0 Fahrern) den anderen mit der echten Fahrerzahl optisch verdeckte.
    const namedCheckpointsById = new Map<string, CheckpointDef>([
      ["CP1", { id: "CP1", name: "CP1", lat: 0, lon: 0 }],
      ["CP2", { id: "CP2", name: "Start/Ziel", lat: 0, lon: 0 }],
      ["CP2_VARIANT", { id: "CP2_VARIANT", name: "Start/Ziel", lat: 0, lon: 0 }],
    ]);
    const pairs: CheckpointPairOccupancy[] = [
      { fromCheckpointId: "CP1", toCheckpointId: "CP2", routeIds: ["rtf-90"], riderCount: 15, unclearCount: 0 },
      { fromCheckpointId: "CP1", toCheckpointId: "CP2_VARIANT", routeIds: ["rtf-90-sternfahrt"], riderCount: 0, unclearCount: 0 },
    ];
    const fc = checkpointPairOccupancyToGeoJSON(pairs, routesById, namedCheckpointsById);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].properties.riderCount).toBe(15);
  });
});
