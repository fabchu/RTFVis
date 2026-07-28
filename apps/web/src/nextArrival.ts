import type { RiderPosition } from "@rtfvis/core";

/**
 * Schätzt den Zeitpunkt (epoch ms), zu dem ein Fahrer den nächsten erwarteten Checkpoint
 * erreicht — aus der Zeit des LETZTEN Scans plus der bei aktuellem Tempo erwarteten Fahrzeit
 * für den Abschnitt.
 *
 * Nutzt bewusst position.lastCheckpointDistanceM/nextCheckpointDistanceM (positionsbasiert
 * aufgelöst in position.ts) statt route.checkpoints.find(id) — bei Strecken mit mehrfach
 * besuchten Checkpoints (z.B. rtf-159, wo K3 zweimal vorkommt) würde find() immer das ERSTE
 * Vorkommen treffen, auch wenn der Fahrer tatsächlich beim zweiten ist. Das konnte zu einer
 * negativen erwarteten Fahrzeit führen — die "erwartete Ankunft" lag dann vor dem letzten Scan.
 *
 * Bewusst NICHT über die aktuelle distanceM plus "jetzt" berechnet: Bei einem überfälligen
 * Fahrer ist distanceM nahe am nächsten Checkpoint eingefroren (Clamp in position.ts), wodurch
 * "jetzt + Restdistanz/Tempo" praktisch immer "gleich jetzt" ergäbe — unabhängig davon, wie
 * lange der Fahrer schon überfällig ist. Für einen tatsächlich onCourse befindlichen Fahrer
 * liefert diese Formel bei konstanter Geschwindigkeitsannahme exakt denselben Zeitpunkt wie
 * die alte "jetzt + Restdistanz/Tempo"-Rechnung — sie hängt nur nicht mehr von "jetzt" ab.
 */
export function estimateNextArrivalMs(position: RiderPosition): number | null {
  if (position.lastCheckpointTimeUtc === null) return null;
  if (position.lastCheckpointDistanceM === null || position.nextCheckpointDistanceM === null) return null;
  if (position.speedMps === null || position.speedMps <= 0) return null;

  const expectedTravelMs = ((position.nextCheckpointDistanceM - position.lastCheckpointDistanceM) / position.speedMps) * 1000;
  return Date.parse(position.lastCheckpointTimeUtc) + expectedTravelMs;
}
