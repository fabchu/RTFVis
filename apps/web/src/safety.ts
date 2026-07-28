import type { CheckpointDef, RiderPosition, ScanRecord } from "@rtfvis/core";
import { estimateNextArrivalMs } from "./nextArrival.js";

/** Checkpoint-ID des offiziellen Start/Ziel-Banners in den Streckendaten (siehe data/checkpoints.json). */
const START_CHECKPOINT_ID = "START";

export interface SafetyRow {
  position: RiderPosition;
  lastCheckpointName: string | null;
  nextCheckpointName: string | null;
  expectedNextArrivalMs: number | null;
  /**
   * "Jetzt" minus die erwartete Ankunftszeit am nächsten Checkpoint — positiv = schon
   * überfällig, negativ = rechnerisch noch Zeit übrig. Nur für onCourse/overdue bestimmbar
   * (dort allein sind Tempo + nächster Checkpoint bekannt); sonst null.
   */
  latenessMs: number | null;
  /** Zeitpunkt des allerersten Scans dieses Fahrers, oder null ohne jeden Scan. */
  startedAtMs: number | null;
  /**
   * Sternfahrer: der erste Scan liegt NICHT am offiziellen Start/Ziel-Banner — der Fahrer ist
   * also bei einem Kontrollpunkt eingestiegen (siehe preprocess/sternfahrt.ts). Null, solange
   * noch kein Scan vorliegt.
   */
  isSternfahrer: boolean | null;
}

/**
 * Dringlichkeits-Rang je Status für die Sicherheitsübersicht — je kleiner, desto dringender.
 * Ein unbekannter Standort (routeConflict/ambiguousRoute) wiegt schwerer als eine bekannte,
 * auch große Verspätung: Dort kennt man wenigstens die letzte Position und kann abschätzen,
 * seit wann jemand fehlt.
 */
const URGENCY_RANK: Record<RiderPosition["status"], number> = {
  routeConflict: 0,
  ambiguousRoute: 1,
  overdue: 2,
  onCourse: 3,
  notStarted: 4,
  finished: 5,
};

/**
 * Wie lange ein Fahrer den nächsten Checkpoint bereits überfällig ist (positiv) bzw. bei
 * aktuellem Tempo noch Zeit dafür hätte (negativ).
 */
export function computeLatenessMs(position: RiderPosition, nowMs: number): number | null {
  const expectedArrivalMs = estimateNextArrivalMs(position);
  if (expectedArrivalMs === null) return null;
  return nowMs - expectedArrivalMs;
}

function groupScansByRider(scans: ScanRecord[]): Map<string, ScanRecord[]> {
  const map = new Map<string, ScanRecord[]>();
  for (const scan of scans) {
    if (!map.has(scan.startNumber)) map.set(scan.startNumber, []);
    map.get(scan.startNumber)!.push(scan);
  }
  return map;
}

/**
 * Baut die vollständige, nach Dringlichkeit sortierte Sicherheitsübersicht — IMMER über das
 * gesamte Feld (Filterung übernimmt die aufrufende Komponente separat für die Anzeige).
 */
export function computeSafetyOverview(
  positions: RiderPosition[],
  checkpointsById: Map<string, CheckpointDef>,
  scans: ScanRecord[],
  nowMs: number,
): SafetyRow[] {
  const checkpointName = (id: string) => checkpointsById.get(id)?.name ?? id;
  const scansByRider = groupScansByRider(scans);

  const rows: SafetyRow[] = positions.map((position) => {
    const expectedNextArrivalMs = estimateNextArrivalMs(position);

    const riderScans = scansByRider.get(position.startNumber) ?? [];
    const firstScan = riderScans.reduce<ScanRecord | null>((earliest, s) => {
      if (!earliest || s.timestampUtc.localeCompare(earliest.timestampUtc) < 0) return s;
      return earliest;
    }, null);

    return {
      position,
      lastCheckpointName: position.lastCheckpointId ? checkpointName(position.lastCheckpointId) : null,
      nextCheckpointName: position.nextCheckpointId ? checkpointName(position.nextCheckpointId) : null,
      expectedNextArrivalMs,
      latenessMs: expectedNextArrivalMs !== null ? nowMs - expectedNextArrivalMs : null,
      startedAtMs: firstScan ? Date.parse(firstScan.timestampUtc) : null,
      isSternfahrer: firstScan ? firstScan.checkpointId !== START_CHECKPOINT_ID : null,
    };
  });

  return rows.sort((a, b) => {
    const rankDiff = URGENCY_RANK[a.position.status] - URGENCY_RANK[b.position.status];
    if (rankDiff !== 0) return rankDiff;
    if (a.latenessMs !== null && b.latenessMs !== null && a.latenessMs !== b.latenessMs) {
      return b.latenessMs - a.latenessMs;
    }
    return a.position.startNumber.localeCompare(b.position.startNumber, undefined, { numeric: true });
  });
}
