import { describe, expect, it } from "vitest";
import {
  buildCumulativeDistances,
  closestPointOnSegment,
  fromLocalMeters,
  haversineM,
  toLocalMeters,
} from "../src/preprocess/geo.js";

describe("haversineM", () => {
  it("misst ~111.2km für 1° Breitengrad-Unterschied", () => {
    const d = haversineM({ lat: 49.0, lon: 8.0 }, { lat: 50.0, lon: 8.0 });
    expect(d).toBeGreaterThan(110_500);
    expect(d).toBeLessThan(111_500);
  });

  it("ist 0 für identische Punkte", () => {
    expect(haversineM({ lat: 49.5, lon: 8.5 }, { lat: 49.5, lon: 8.5 })).toBe(0);
  });
});

describe("toLocalMeters / fromLocalMeters", () => {
  it("ist eine Roundtrip-Inverse", () => {
    const origin = { lat: 49.8, lon: 8.6 };
    const p = { lat: 49.85, lon: 8.7 };
    const local = toLocalMeters(p, origin);
    const back = fromLocalMeters(local, origin);
    expect(back.lat).toBeCloseTo(p.lat, 6);
    expect(back.lon).toBeCloseTo(p.lon, 6);
  });

  it("origin selbst liegt bei (0,0)", () => {
    const origin = { lat: 49.8, lon: 8.6 };
    const local = toLocalMeters(origin, origin);
    expect(local.x).toBeCloseTo(0, 6);
    expect(local.y).toBeCloseTo(0, 6);
  });
});

describe("closestPointOnSegment", () => {
  it("clampt auf den Endpunkt, wenn die Projektion außerhalb des Segments liegt", () => {
    const { point, t } = closestPointOnSegment({ x: -10, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    expect(t).toBe(0);
    expect(point).toEqual({ x: 0, y: 0 });
  });

  it("findet den Lotpunkt innerhalb des Segments", () => {
    const { point, t } = closestPointOnSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    expect(t).toBeCloseTo(0.5, 6);
    expect(point.x).toBeCloseTo(5, 6);
    expect(point.y).toBeCloseTo(0, 6);
  });
});

describe("buildCumulativeDistances", () => {
  it("ist monoton steigend und beginnt bei 0", () => {
    const points = [
      { lat: 49.8, lon: 8.6 },
      { lat: 49.81, lon: 8.61 },
      { lat: 49.82, lon: 8.62 },
    ];
    const cum = buildCumulativeDistances(points);
    expect(cum[0]).toBe(0);
    expect(cum[1]).toBeGreaterThan(cum[0]);
    expect(cum[2]).toBeGreaterThan(cum[1]);
    expect(cum.length).toBe(points.length);
  });
});
