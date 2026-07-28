import { readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { CheckpointDef, Route, RouteInput } from "../types.js";
import { buildCumulativeDistances } from "./geo.js";
import { parseGpxFile } from "./gpx.js";
import { simplify } from "./simplify.js";
import { snapCheckpointsMonotonic } from "./snap.js";

const SIMPLIFY_TOLERANCE_M = 5;

/** Reine Funktion ohne Seiteneffekte — liest aus dataDir, schreibt nichts. Für Tests und den CLI-Runner. */
export function buildRoutes(dataDir: string): Route[] {
  const checkpoints: CheckpointDef[] = JSON.parse(
    readFileSync(path.join(dataDir, "checkpoints.json"), "utf-8"),
  );
  const checkpointById = new Map(checkpoints.map((c) => [c.id, c]));

  const routeConfig = parseYaml(readFileSync(path.join(dataDir, "route-checkpoints.yaml"), "utf-8")) as {
    routes: RouteInput[];
  };

  const routes: Route[] = [];

  for (const input of routeConfig.routes) {
    const gpxPath = path.join(dataDir, "gpx", input.gpxFile);
    const rawPoints = parseGpxFile(gpxPath);
    const geometry = simplify(rawPoints, SIMPLIFY_TOLERANCE_M);
    const cumulativeM = buildCumulativeDistances(geometry);

    const orderedCheckpoints = input.checkpoints.map((id) => {
      const cp = checkpointById.get(id);
      if (!cp) {
        throw new Error(
          `Route ${input.id} referenziert unbekannten Checkpoint "${id}" — fehlt er in checkpoints.json?`,
        );
      }
      return cp;
    });

    const snapResults = snapCheckpointsMonotonic(geometry, cumulativeM, orderedCheckpoints);

    routes.push({
      id: input.id,
      category: input.category,
      name: input.name,
      totalDistanceM: cumulativeM[cumulativeM.length - 1],
      checkpoints: snapResults.map((s) => ({
        id: s.checkpointId,
        distanceM: s.distanceM,
        deviationM: s.deviationM,
      })),
      geometry: geometry.map((p) => [p.lon, p.lat]),
      cumulativeM,
    });
  }

  return routes;
}
