import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildRoutes } from "../src/preprocess/build-routes.js";

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "rtfvis-build-routes-"));
  mkdirSync(path.join(dataDir, "gpx"));

  const checkpoints = [
    { id: "START", name: "Start", lat: 49.8, lon: 8.6 },
    { id: "CP1", name: "Checkpoint 1", lat: 49.8, lon: 8.65 },
    { id: "FINISH", name: "Ziel", lat: 49.8, lon: 8.7 },
  ];
  writeFileSync(path.join(dataDir, "checkpoints.json"), JSON.stringify(checkpoints), "utf-8");

  const gpx = `<?xml version="1.0"?>
<gpx><trk><trkseg>
  <trkpt lat="49.8" lon="8.6"></trkpt>
  <trkpt lat="49.8" lon="8.62"></trkpt>
  <trkpt lat="49.8" lon="8.65"></trkpt>
  <trkpt lat="49.8" lon="8.68"></trkpt>
  <trkpt lat="49.8" lon="8.7"></trkpt>
</trkseg></trk></gpx>`;
  writeFileSync(path.join(dataDir, "gpx", "test-route.gpx"), gpx, "utf-8");

  const routeConfig = `routes:
  - id: test-route
    category: RTF
    name: "Testroute"
    gpxFile: test-route.gpx
    checkpoints: [START, CP1, FINISH]
`;
  writeFileSync(path.join(dataDir, "route-checkpoints.yaml"), routeConfig, "utf-8");
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe("buildRoutes", () => {
  it("baut eine Route mit korrekt aufsteigenden Checkpoint-Distanzen", () => {
    const routes = buildRoutes(dataDir);
    expect(routes).toHaveLength(1);

    const route = routes[0];
    expect(route.id).toBe("test-route");
    expect(route.category).toBe("RTF");
    expect(route.checkpoints.map((c) => c.id)).toEqual(["START", "CP1", "FINISH"]);

    const distances = route.checkpoints.map((c) => c.distanceM);
    expect(distances[0]).toBeLessThan(distances[1]);
    expect(distances[1]).toBeLessThan(distances[2]);

    for (const c of route.checkpoints) {
      expect(c.deviationM).toBeLessThan(1);
    }

    expect(route.totalDistanceM).toBeCloseTo(route.cumulativeM[route.cumulativeM.length - 1], 3);
    expect(route.geometry.length).toBe(route.cumulativeM.length);
  });

  it("wirft eine aussagekräftige Fehlermeldung bei unbekannter Checkpoint-ID", () => {
    const routeConfig = `routes:
  - id: broken
    category: RTF
    name: "Kaputt"
    gpxFile: test-route.gpx
    checkpoints: [START, DOES_NOT_EXIST]
`;
    writeFileSync(path.join(dataDir, "route-checkpoints.yaml"), routeConfig, "utf-8");
    expect(() => buildRoutes(dataDir)).toThrow(/DOES_NOT_EXIST/);
  });
});
