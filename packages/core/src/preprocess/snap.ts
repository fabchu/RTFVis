import type { CheckpointDef, LonLat, SnapResult } from "../types.js";
import { CHECKPOINT_DEVIATION_WARNING_M } from "./constants.js";
import { closestPointOnSegment, fromLocalMeters, haversineM, toLocalMeters } from "./geo.js";

/**
 * Der allererste Checkpoint (typischerweise START) darf höchstens so weit in die Strecke
 * hinein gesucht werden. Verhindert, dass er bei einem Rundkurs (Start/Ziel am selben
 * Ort) fälschlich ans STRECKENENDE snappt, wenn die echte Anfangsposition zufällig mehr
 * als CHECKPOINT_DEVIATION_WARNING_M abweicht (z.B. weil die GPX-Aufzeichnung erst kurz
 * nach der Startlinie beginnt) — dann greift der normale Frühabbruch unten nicht, und
 * ohne dieses Limit würde einfach der global nächstgelegene Punkt gewinnen, der bei einer
 * Schleife oft zufällig nahe dem Ziel liegt.
 */
const FIRST_CHECKPOINT_SEARCH_CAP_M = 10_000;

/**
 * Wird derselbe Checkpoint mehrfach besucht, muss die nächste Durchquerung mindestens so
 * weit hinter der vorherigen eigenen Position liegen. Ohne dieses Limit könnte das direkt
 * auf den Grenzsegment-Ausschluss folgende Segment (das geometrisch oft noch fast am
 * selben Fleck liegt, z.B. dieselbe Kurve) fälschlich als "die zweite Durchquerung"
 * durchgehen, obwohl es nur das Ende desselben Straßenabschnitts der ERSTEN ist — noch
 * bevor die echte, oft viele Kilometer entfernte zweite Durchquerung gefunden wird.
 */
const MIN_REPEAT_CHECKPOINT_GAP_M = 500;

/**
 * Ordnet jedem Checkpoint eine Distanz entlang der Streckengeometrie zu.
 *
 * Wichtig: Sucht NICHT global nach dem nächstgelegenen Punkt der gesamten Strecke,
 * sondern monoton — Checkpoint n+1 wird nur ab der für Checkpoint n gefundenen
 * Position weitergesucht (gleiches Segment erlaubt, aber nur strikt danach). Strecken
 * können sich selbst kreuzen oder an einem Ort zweimal vorbeiführen; ein globaler
 * Nearest-Neighbour würde dann fälschlich den falschen Streckenabschnitt treffen. Die
 * Checkpoint-Reihenfolge muss daher der tatsächlichen Fahrreihenfolge entsprechen
 * (siehe route-checkpoints.yaml).
 *
 * Zweite Falle, speziell beim allerersten Checkpoint: Rundkurse haben oft Start und
 * Ziel am selben Platz. Ohne Bremse würde die Suche für "START" die komplette Strecke
 * bis zum Ende absuchen und dort einen zufällig noch minimal näheren Punkt (nahe dem
 * Ziel) finden. Deshalb bricht die Suche ab, sobald ein hinreichend plausibler Treffer
 * (Abweichung innerhalb der Warnschwelle) gefunden ist, statt stur global zu
 * optimieren — ein Fahrer im Feld interessiert sich nicht für die letzten paar Meter
 * Genauigkeit, wenn eine deutlich frühere Stelle bereits eindeutig auf der Strecke liegt.
 * Reicht die Abweichung selbst am Anfang nirgends unter die Warnschwelle (z.B. weil die
 * GPX-Aufzeichnung erst neben der Startlinie beginnt), greift zusätzlich das harte
 * Distanzlimit FIRST_CHECKPOINT_SEARCH_CAP_M oben.
 */
export function snapCheckpointsMonotonic(
  geometry: LonLat[],
  cumulativeM: number[],
  orderedCheckpoints: CheckpointDef[],
): SnapResult[] {
  if (geometry.length < 2) {
    throw new Error("Geometrie braucht mindestens zwei Punkte zum Snapping.");
  }

  const totalDistanceM = cumulativeM[cumulativeM.length - 1];
  const results: SnapResult[] = [];
  let boundarySegIdx = 0;
  let boundaryT = -Infinity; // keine Einschränkung für den allerersten Checkpoint
  const lastDistanceByCheckpointId = new Map<string, number>();

  for (let cpIndex = 0; cpIndex < orderedCheckpoints.length; cpIndex++) {
    const cp = orderedCheckpoints[cpIndex];
    const minDistanceForRepeat = lastDistanceByCheckpointId.get(cp.id);
    let best: { segIdx: number; t: number; distanceM: number; deviationM: number } | null = null;

    const searchEndIdx =
      cpIndex === 0
        ? indexAtOrAfterDistance(cumulativeM, Math.min(FIRST_CHECKPOINT_SEARCH_CAP_M, totalDistanceM / 2))
        : geometry.length - 1;

    for (let i = boundarySegIdx; i < searchEndIdx; i++) {
      const a = geometry[i];
      const b = geometry[i + 1];
      const pLocal = toLocalMeters(cp, a);
      const aLocal = { x: 0, y: 0 };
      const bLocal = toLocalMeters(b, a);
      const { point, t } = closestPointOnSegment(pLocal, aLocal, bLocal);

      if (i === boundarySegIdx && t <= boundaryT) {
        // Läge auf oder vor der Position des vorherigen Checkpoints innerhalb
        // desselben Segments — ausschließen. Sonst könnte ein Checkpoint fälschlich
        // erneut auf denselben (oder einen früheren) Punkt wie sein Vorgänger
        // snappen, wenn die Strecke nahe an sich selbst vorbeiführt.
        continue;
      }

      const snapped = fromLocalMeters(point, a);
      const deviationM = haversineM(cp, snapped);
      const segLen = cumulativeM[i + 1] - cumulativeM[i];
      const distanceM = cumulativeM[i] + t * segLen;

      if (minDistanceForRepeat !== undefined && distanceM <= minDistanceForRepeat + MIN_REPEAT_CHECKPOINT_GAP_M) {
        // Zu dicht an der vorherigen eigenen Durchquerung dieses Checkpoints -> das ist
        // keine echte neue Sichtung, sondern derselbe Streckenabschnitt.
        continue;
      }

      if (!best || deviationM < best.deviationM) {
        best = { segIdx: i, t, distanceM, deviationM };
      } else if (best.deviationM <= CHECKPOINT_DEVIATION_WARNING_M) {
        // Schon ein plausibler Treffer gefunden und dieser Kandidat ist nicht besser
        // -> nicht weiter stromabwärts nach einem zufällig noch näheren Punkt suchen.
        break;
      }
    }

    if (!best) {
      throw new Error(`Checkpoint ${cp.id} konnte nicht auf die Strecke projiziert werden.`);
    }

    results.push({ checkpointId: cp.id, distanceM: best.distanceM, deviationM: best.deviationM });
    boundarySegIdx = best.segIdx;
    boundaryT = best.t;
    lastDistanceByCheckpointId.set(cp.id, best.distanceM);
  }

  return results;
}

/** Index des ersten Geometriepunkts, dessen kumulierte Distanz maxDistanceM erreicht oder überschreitet (min. 1, max. letzter Index). */
function indexAtOrAfterDistance(cumulativeM: number[], maxDistanceM: number): number {
  for (let i = 1; i < cumulativeM.length; i++) {
    if (cumulativeM[i] >= maxDistanceM) return i;
  }
  return cumulativeM.length - 1;
}
