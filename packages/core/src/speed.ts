import { matchScansToRouteCheckpoints } from "./scan-matching.js";
import type { Route, ScanRecord } from "./types.js";

/** Gewichte für die letzten (bis zu drei) gefahrenen Abschnitte, neuester zuerst. */
const SEGMENT_WEIGHTS = [0.5, 0.3, 0.2];

/**
 * Plausibilitätsgrenze für die Abschnittsgeschwindigkeit (~72 km/h) -- ein einzelner
 * fehlerhafter Scan (z.B. zwei Kontrollen binnen Sekunden eingetragen, GPS-/Zeitfehler)
 * kann sonst eine absurd hohe Geschwindigkeit für den ganzen Abschnitt ergeben und damit
 * über die Gewichtung die komplette Tempo-Schätzung (und darauf basierend die erwartete
 * Ankunftszeit) verfälschen. Bewusst grosszügig gewählt, damit ein echter schneller
 * Downhill-Abschnitt nicht fälschlich verworfen wird.
 */
const MAX_PLAUSIBLE_SPEED_MPS = 20;

/**
 * Schätzt das aktuelle Tempo (m/s) eines Fahrers aus seinen bisherigen Scans auf der
 * angegebenen Strecke. Exponentiell gewichteter Mittelwert der letzten (bis zu drei)
 * gefahrenen Abschnitte — dämpft Verpflegungspausen und verzögerte Scans, ohne einen
 * echten Tempoabfall komplett zu verschlucken.
 *
 * Gibt null zurück, wenn keine verwertbare Abschnittsgeschwindigkeit ermittelt werden
 * kann (weniger als zwei passende Scans, oder alle Abschnitte mit Zeit-/Reihenfolge-
 * Anomalien oder unplausibel hoher Geschwindigkeit) — die Aufrufer entscheiden dann über
 * einen Fallback (z.B. Kategorie-Median).
 */
export function estimateSpeed(sortedScans: ScanRecord[], route: Route): number | null {
  // Positionsbasiert statt über eine ID->Distanz-Map, damit Strecken mit mehrfach
  // besuchten Checkpoints (gleiche ID, unterschiedliche Distanz je Vorkommen) korrekt
  // behandelt werden — siehe scan-matching.ts.
  const matchedIndices = matchScansToRouteCheckpoints(sortedScans, route);

  const points: { distanceM: number; timeMs: number }[] = [];
  for (let i = 0; i < sortedScans.length; i++) {
    const routeIdx = matchedIndices[i];
    if (routeIdx === null) continue; // Checkpoint gehört nicht (mehr) zu dieser Strecke
    points.push({ distanceM: route.checkpoints[routeIdx].distanceM, timeMs: new Date(sortedScans[i].timestampUtc).getTime() });
  }

  const segmentSpeeds: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const dDist = points[i].distanceM - points[i - 1].distanceM;
    const dTimeS = (points[i].timeMs - points[i - 1].timeMs) / 1000;
    if (dTimeS <= 0 || dDist <= 0) continue; // Uhr-/Reihenfolge-Anomalie -> ignorieren statt verfälschen
    const speed = dDist / dTimeS;
    if (speed > MAX_PLAUSIBLE_SPEED_MPS) continue; // unplausibler Ausreißer -> ignorieren statt verfälschen
    segmentSpeeds.push(speed);
  }

  if (segmentSpeeds.length === 0) return null;

  const mostRecentFirst = segmentSpeeds.slice(-3).reverse();
  let weightedSum = 0;
  let weightSum = 0;
  mostRecentFirst.forEach((speed, i) => {
    const weight = SEGMENT_WEIGHTS[i];
    weightedSum += speed * weight;
    weightSum += weight;
  });

  return weightedSum / weightSum;
}
