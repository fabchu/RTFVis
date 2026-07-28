import { readFileSync } from "node:fs";
import { XMLParser } from "fast-xml-parser";
import type { LonLat } from "../types.js";

export function parseGpxFile(filePath: string): LonLat[] {
  return parseGpxString(readFileSync(filePath, "utf-8"));
}

export function parseGpxString(xml: string): LonLat[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const doc = parser.parse(xml);
  const gpx = doc.gpx;
  if (!gpx) throw new Error("Keine <gpx>-Wurzel gefunden.");

  const points: LonLat[] = [];
  for (const trk of asArray(gpx.trk)) {
    for (const seg of asArray(trk?.trkseg)) {
      for (const pt of asArray(seg?.trkpt)) {
        points.push(readLonLat(pt));
      }
    }
  }

  if (points.length === 0) {
    // Fallback: <rte><rtept> statt Track
    for (const rte of asArray(gpx.rte)) {
      for (const pt of asArray(rte?.rtept)) {
        points.push(readLonLat(pt));
      }
    }
  }

  if (points.length < 2) {
    throw new Error("GPX enthält zu wenige Punkte (<trkpt> oder <rtept> erwartet).");
  }
  return points;
}

function readLonLat(pt: Record<string, unknown>): LonLat {
  const lat = Number(pt["@_lat"]);
  const lon = Number(pt["@_lon"]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error(`Ungültiger trkpt/rtept ohne gültige lat/lon-Attribute: ${JSON.stringify(pt)}`);
  }
  return { lat, lon };
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}
