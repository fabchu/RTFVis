import { haversineM } from "./geo.js";
import type { Category, Route } from "../types.js";

/**
 * Kategorien, für die Sternfahrt-Varianten erzeugt werden. Jedermann-Strecken bleiben
 * bewusst außen vor (fachlich nicht relevant für Sternfahrten).
 */
const STERNFAHRT_CATEGORIES: Category[] = ["RTF", "CTF"];

/** Ab dieser Distanz zwischen Start- und Endpunkt der Geometrie gilt eine Strecke nicht mehr als Rundkurs. */
const LOOP_TOLERANCE_M = 300;

/**
 * Erzeugt für jede RTF-/CTF-Rundstrecke eine zusätzliche "Sternfahrt"-Variante: dieselbe
 * Checkpoint-Liste und Geometrie zweimal hintereinander gehängt (das gemeinsame Start/
 * Ziel wird dabei nur einmal gezählt).
 *
 * Hintergrund: Bei einer Sternfahrt steigt ein Teilnehmer nicht bei START, sondern bei
 * einem beliebigen Kontrollpunkt ein, fährt die Strecke vorwärts bis Start/Ziel (wo er
 * sich erstmals offiziell anmeldet) und fährt dann über START weiter, bis er wieder in
 * die Nähe seines eigenen Startpunkts kommt. Seine beobachtete Scan-Reihenfolge ist damit
 * eine "phasenverschobene" Version der normalen Streckenreihenfolge — keine Teilfolge der
 * reguläre Route mehr, aber sehr wohl eine Teilfolge von "die Strecke zweimal".
 *
 * Bewusst nur EINE Variante pro Strecke (nicht eine pro möglichem Einstiegspunkt): Da die
 * Variante jede Checkpoint-ID zweimal enthält, deckt eine einzige "doppelte Runde"
 * automatisch JEDEN möglichen Startpunkt ab — der vorhandene Teilfolgen-Test in
 * isSubsequence findet die passende "Phase" von selbst, ganz ohne Änderungen an
 * resolveRoute/computePositions/speed.ts. Die Variante ist einfach ein weiteres,
 * normales Route-Objekt.
 */
export function generateSternfahrtVariants(routes: Route[]): Route[] {
  return routes
    .filter((route) => STERNFAHRT_CATEGORIES.includes(route.category))
    .filter(isLoopRoute)
    .map(buildSternfahrtVariant);
}

function isLoopRoute(route: Route): boolean {
  if (route.geometry.length < 2) return false;
  const [startLon, startLat] = route.geometry[0];
  const [endLon, endLat] = route.geometry[route.geometry.length - 1];
  return haversineM({ lon: startLon, lat: startLat }, { lon: endLon, lat: endLat }) <= LOOP_TOLERANCE_M;
}

function buildSternfahrtVariant(baseRoute: Route): Route {
  const totalDistanceM = baseRoute.totalDistanceM;

  // Der letzte Checkpoint (Ziel) fällt physisch mit dem ersten (Start) zusammen -> beim
  // Aneinanderhängen einmal weglassen, sonst gäbe es zwei Scans für denselben Ort in
  // unmittelbarer Folge.
  const coreCheckpoints = baseRoute.checkpoints.slice(0, -1);

  const doubledCheckpoints = [
    ...coreCheckpoints,
    ...coreCheckpoints.map((c) => ({ ...c, distanceM: c.distanceM + totalDistanceM })),
  ];

  return {
    id: `${baseRoute.id}-sternfahrt`,
    category: baseRoute.category,
    name: `${baseRoute.name} (Sternfahrt)`,
    totalDistanceM: totalDistanceM * 2,
    checkpoints: doubledCheckpoints,
    geometry: [...baseRoute.geometry, ...baseRoute.geometry],
    cumulativeM: [...baseRoute.cumulativeM, ...baseRoute.cumulativeM.map((d) => d + totalDistanceM)],
    baseRouteId: baseRoute.id,
  };
}
