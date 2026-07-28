import type { LonLat } from "../types.js";
import { perpendicularDistance, toLocalMeters } from "./geo.js";

/**
 * Douglas-Peucker-Vereinfachung mit Toleranz in Metern. Start- und Endpunkt bleiben
 * immer erhalten. Läuft in lokalen Metern (equirektangulär um points[0]), was für
 * die Streckenlängen eines Radrennens ausreichend genau ist.
 */
export function simplify(points: LonLat[], toleranceM: number): LonLat[] {
  if (points.length <= 2) return points;

  const origin = points[0];
  const local = points.map((p) => toLocalMeters(p, origin));
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let maxDist = -1;
    let maxIdx = -1;
    for (let i = start + 1; i < end; i++) {
      const d = perpendicularDistance(local[i], local[start], local[end]);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }
    if (maxDist > toleranceM && maxIdx !== -1) {
      keep[maxIdx] = true;
      stack.push([start, maxIdx]);
      stack.push([maxIdx, end]);
    }
  }

  return points.filter((_, i) => keep[i]);
}
