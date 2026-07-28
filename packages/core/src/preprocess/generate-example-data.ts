/**
 * Erzeugt Platzhalter-Streckendaten (GPX-Dateien, checkpoints.json, route-checkpoints.yaml),
 * damit die Preprocessing-Pipeline end-to-end lauffähig ist, bevor echte GPX-Dateien vom
 * Renn-Orga-Team vorliegen. Sobald echte Daten da sind: data/gpx/*.gpx, data/checkpoints.json
 * und data/route-checkpoints.yaml einfach ersetzen — der Rest der Pipeline bleibt unverändert.
 *
 * Die erzeugte Geographie ist frei erfunden (kein echter Ort) und dient nur zum Testen.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stringify as stringifyYaml } from "yaml";
import type { CheckpointDef, LonLat } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../../../data");
const GPX_DIR = path.join(DATA_DIR, "gpx");

const checkpoints: CheckpointDef[] = [
  { id: "START", name: "Start/Ziel", lat: 49.8, lon: 8.6 },
  { id: "CP1", name: "Dorfplatz Nord (Beispiel)", lat: 49.83, lon: 8.625 },
  { id: "CP2", name: "Waldrand Ost (Beispiel)", lat: 49.855, lon: 8.66 },
  { id: "CP3", name: "Verpflegung Waldhof (Beispiel)", lat: 49.87, lon: 8.69 },
  { id: "CP4", name: "Talbrücke (Beispiel)", lat: 49.85, lon: 8.73 },
  { id: "CP5", name: "Bergkuppe (Beispiel)", lat: 49.82, lon: 8.755 },
  { id: "CP6", name: "CTF-Schleife Süd (Beispiel)", lat: 49.828, lon: 8.675 },
  { id: "FINISH", name: "Start/Ziel", lat: 49.8, lon: 8.6 },
];

interface ExampleRoute {
  id: string;
  category: "RTF" | "CTF" | "Jedermann";
  name: string;
  gpxFile: string;
  checkpointIds: string[];
}

const exampleRoutes: ExampleRoute[] = [
  {
    id: "rtf-90",
    category: "RTF",
    name: "RTF 90 km (Beispiel)",
    gpxFile: "rtf-90.gpx",
    checkpointIds: ["START", "CP1", "CP2", "CP3", "CP4", "CP5", "FINISH"],
  },
  {
    id: "rtf-45",
    category: "RTF",
    name: "RTF 45 km (Beispiel)",
    gpxFile: "rtf-45.gpx",
    checkpointIds: ["START", "CP1", "CP2", "CP3", "FINISH"],
  },
  {
    id: "ctf-70",
    category: "CTF",
    name: "CTF 70 km (Beispiel)",
    gpxFile: "ctf-70.gpx",
    checkpointIds: ["START", "CP1", "CP2", "CP6", "FINISH"],
  },
];

const checkpointById = new Map(checkpoints.map((c) => [c.id, c]));

function lerp(a: LonLat, b: LonLat, t: number): LonLat {
  return { lon: a.lon + (b.lon - a.lon) * t, lat: a.lat + (b.lat - a.lat) * t };
}

/**
 * Erzeugt eine "wacklige" Polyline zwischen Wegpunkten (statt einer perfekten Geraden),
 * damit die Beispiel-GPX realistischer wirkt und die Vereinfachung (Douglas-Peucker)
 * tatsächlich etwas zu tun hat.
 */
function densify(waypoints: LonLat[], pointsPerSegment: number, jitterDeg: number, seed: number): LonLat[] {
  const points: LonLat[] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    for (let j = 0; j < pointsPerSegment; j++) {
      const t = j / pointsPerSegment;
      const base = lerp(a, b, t);
      const wobble = Math.sin(t * Math.PI * 3 + seed + i) * jitterDeg;
      points.push({ lon: base.lon + wobble, lat: base.lat - wobble * 0.6 });
    }
  }
  points.push(waypoints[waypoints.length - 1]);
  return points;
}

function toGpx(points: LonLat[], name: string): string {
  const trkpts = points.map((p) => `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}"></trkpt>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="rtfvis-example-generator" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${name}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`;
}

function main() {
  mkdirSync(GPX_DIR, { recursive: true });

  writeFileSync(path.join(DATA_DIR, "checkpoints.json"), JSON.stringify(checkpoints, null, 2), "utf-8");

  const routeConfig = {
    routes: exampleRoutes.map((r) => ({
      id: r.id,
      category: r.category,
      name: r.name,
      gpxFile: r.gpxFile,
      checkpoints: r.checkpointIds,
    })),
  };
  writeFileSync(path.join(DATA_DIR, "route-checkpoints.yaml"), stringifyYaml(routeConfig), "utf-8");

  for (const [seed, route] of exampleRoutes.entries()) {
    const waypoints = route.checkpointIds.map((id) => {
      const cp = checkpointById.get(id);
      if (!cp) throw new Error(`Unbekannter Checkpoint ${id} in Beispielroute ${route.id}`);
      return { lon: cp.lon, lat: cp.lat };
    });
    const points = densify(waypoints, 40, 0.0002, seed);
    writeFileSync(path.join(GPX_DIR, route.gpxFile), toGpx(points, route.name), "utf-8");
  }

  console.log(`Platzhalter-Daten geschrieben nach ${DATA_DIR}:`);
  console.log(`  checkpoints.json (${checkpoints.length} Checkpoints)`);
  console.log(`  route-checkpoints.yaml (${exampleRoutes.length} Strecken)`);
  console.log(`  gpx/*.gpx (${exampleRoutes.length} Dateien)`);
  console.log("");
  console.log("Sobald echte Daten vorliegen: diese Dateien ersetzen und `pnpm build:routes` erneut ausführen.");
}

main();
