import { describe, expect, it } from "vitest";
import { simplify } from "../src/preprocess/simplify.js";
import type { LonLat } from "../src/types.js";

function straightLine(n: number): LonLat[] {
  const points: LonLat[] = [];
  for (let i = 0; i < n; i++) {
    points.push({ lat: 49.8 + i * 0.001, lon: 8.6 + i * 0.001 });
  }
  return points;
}

describe("simplify", () => {
  it("reduziert eine perfekte Gerade auf Start- und Endpunkt", () => {
    const result = simplify(straightLine(50), 5);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ lat: 49.8, lon: 8.6 });
  });

  it("behält einen deutlichen Knick bei", () => {
    const points: LonLat[] = [
      ...straightLine(20),
      // deutlicher Abzweig nach Norden, weit über der Toleranz
      { lat: 49.83, lon: 8.62 },
      ...straightLine(20).map((p) => ({ lat: p.lat + 0.03, lon: p.lon + 0.005 })),
    ];
    const result = simplify(points, 5);
    expect(result.length).toBeGreaterThan(2);
  });

  it("gibt Arrays mit <=2 Punkten unverändert zurück", () => {
    const points = straightLine(2);
    expect(simplify(points, 5)).toEqual(points);
  });

  it("behält Start- und Endpunkt immer", () => {
    const points = straightLine(30);
    const result = simplify(points, 1000); // riesige Toleranz -> alles bis auf Endpunkte weg
    expect(result[0]).toEqual(points[0]);
    expect(result[result.length - 1]).toEqual(points[points.length - 1]);
  });
});
