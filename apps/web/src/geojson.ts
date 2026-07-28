import { lonLatAt, type CheckpointDef, type LonLat, type RiderPosition, type Route } from "@rtfvis/core";
import { groupCheckpointPairsByName, type CheckpointPairOccupancy } from "./segmentOccupancy.js";

export interface RouteProperties {
  routeId: string;
  category: string;
  name: string;
}

export function routesToGeoJSON(routes: Route[]): GeoJSON.FeatureCollection<GeoJSON.LineString, RouteProperties> {
  return {
    type: "FeatureCollection",
    features: routes.map((route) => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates: route.geometry },
      properties: { routeId: route.id, category: route.category, name: route.name },
    })),
  };
}

export interface RiderProperties {
  startNumber: string;
  status: string;
  category: string;
  routeId: string | null;
  speedMps: number | null;
}

/** Nur Fahrer mit einer bekannten Position werden zu Punkten — notStarted/routeConflict-Fahrer haben keine. */
export function ridersToGeoJSON(
  positions: RiderPosition[],
): GeoJSON.FeatureCollection<GeoJSON.Point, RiderProperties> {
  return {
    type: "FeatureCollection",
    features: positions
      .filter((p): p is RiderPosition & { position: NonNullable<RiderPosition["position"]> } => p.position !== null)
      .map((p) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.position.lon, p.position.lat] },
        properties: {
          startNumber: p.startNumber,
          status: p.status,
          category: p.category ?? "unbekannt",
          routeId: p.routeId,
          speedMps: p.speedMps,
        },
      })),
  };
}

export interface CheckpointProperties {
  id: string;
  name: string;
}

export function checkpointsToGeoJSON(
  checkpoints: CheckpointDef[],
): GeoJSON.FeatureCollection<GeoJSON.Point, CheckpointProperties> {
  return {
    type: "FeatureCollection",
    features: checkpoints.map((cp) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [cp.lon, cp.lat] },
      properties: { id: cp.id, name: cp.name },
    })),
  };
}

export interface CheckpointPairOccupancyProperties {
  fromCheckpointId: string;
  toCheckpointId: string;
  riderCount: number;
}

/**
 * Platziert einen Marker auf halber Strecke ENTLANG DER TATSÄCHLICHEN Streckengeometrie
 * zwischen den beiden Checkpoints eines Abschnitts (nicht als Luftlinie zwischen ihren
 * Koordinaten, die bei einer kurvigen Strecke leicht neben der Straße landen würde).
 *
 * Fasst dafür zunächst nach Checkpoint-NAMEN zusammen (siehe groupCheckpointPairsByName):
 * START und FINISH heißen bei Rundkursen beide "Start/Ziel", wodurch z.B. der reguläre
 * Schlussabschnitt einer Strecke und der nur auf ihrer Sternfahrt-Variante existierende
 * Rückweg-Abschnitt sonst zwei beinah deckungsgleiche Marker mit unterschiedlicher (und
 * einzeln potenziell irreführender) Fahrerzahl ergeben würden — einer davon (oft der mit 0
 * Fahrern eingefärbte) verdeckt dann optisch den anderen. Die Position wird bewusst nur aus
 * EINEM repräsentativen Abschnitt berechnet (eigene IDs + eigene Strecke), nie aus über
 * mehrere Abschnitte gemischten IDs, da sonst die exakte Checkpoint-Reihenfolge in der
 * Referenzstrecke nicht mehr gefunden werden kann.
 */
export function checkpointPairOccupancyToGeoJSON(
  pairs: CheckpointPairOccupancy[],
  routesById: Map<string, Route>,
  checkpointsById: Map<string, CheckpointDef>,
): GeoJSON.FeatureCollection<GeoJSON.Point, CheckpointPairOccupancyProperties> {
  const features: GeoJSON.Feature<GeoJSON.Point, CheckpointPairOccupancyProperties>[] = [];

  for (const group of groupCheckpointPairsByName(pairs, checkpointsById)) {
    const { representative } = group;
    const route = routesById.get(representative.routeIds[0]);
    if (!route) continue;

    const position = midpointAlongRoute(route, representative.fromCheckpointId, representative.toCheckpointId);
    if (!position) continue;

    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [position.lon, position.lat] },
      properties: {
        fromCheckpointId: representative.fromCheckpointId,
        toCheckpointId: representative.toCheckpointId,
        riderCount: group.riderCount,
      },
    });
  }

  return { type: "FeatureCollection", features };
}

/** Findet den ersten Abschnitt (fromId -> toId) in route.checkpoints und gibt dessen geografische Mitte zurück. */
function midpointAlongRoute(route: Route, fromCheckpointId: string, toCheckpointId: string): LonLat | null {
  for (let i = 0; i < route.checkpoints.length - 1; i++) {
    if (route.checkpoints[i].id === fromCheckpointId && route.checkpoints[i + 1].id === toCheckpointId) {
      const midDistanceM = (route.checkpoints[i].distanceM + route.checkpoints[i + 1].distanceM) / 2;
      return lonLatAt(route, midDistanceM);
    }
  }
  return null;
}
