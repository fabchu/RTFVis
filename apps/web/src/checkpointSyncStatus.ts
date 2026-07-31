import type { CheckpointDef, ScanRecord } from "@rtfvis/core";

export interface CheckpointSyncRow {
  checkpointId: string;
  checkpointName: string;
  /** Ereigniszeit (Zeitstempel) des zuletzt im Sheet angekommenen Scans dieser Station. */
  lastEventTimeUtc: string;
  /** Wann dieser Scan im Sheet ankam (Zeitstempel_tech) -- die eigentliche "zuletzt gesehen". */
  lastTechnicalTimeUtc: string;
}

/**
 * Pro Kontrollstation der zuletzt im Sheet angekommene Scan -- zeigt, wie aktuell die
 * Verbindung dieser Station ist. Nur Scans mit technicalTimestampUtc zählen (Start/Ziel
 * kommen nicht über die AppSheet-Anbindung und haben deshalb keins). Sortiert nach zuletzt
 * angekommen aufsteigend (am längsten her zuerst), damit mögliche Verbindungsprobleme sofort
 * oben auffallen.
 */
export function computeCheckpointSyncStatus(
  scans: ScanRecord[],
  checkpointsById: Map<string, CheckpointDef>,
): CheckpointSyncRow[] {
  const latestByCheckpoint = new Map<string, ScanRecord & { technicalTimestampUtc: string }>();

  for (const scan of scans) {
    if (!scan.technicalTimestampUtc) continue;
    const current = latestByCheckpoint.get(scan.checkpointId);
    if (!current || scan.technicalTimestampUtc > current.technicalTimestampUtc) {
      latestByCheckpoint.set(scan.checkpointId, scan as ScanRecord & { technicalTimestampUtc: string });
    }
  }

  const rows: CheckpointSyncRow[] = [...latestByCheckpoint.entries()].map(([checkpointId, scan]) => ({
    checkpointId,
    checkpointName: checkpointsById.get(checkpointId)?.name ?? checkpointId,
    lastEventTimeUtc: scan.timestampUtc,
    lastTechnicalTimeUtc: scan.technicalTimestampUtc,
  }));

  return rows.sort((a, b) => a.lastTechnicalTimeUtc.localeCompare(b.lastTechnicalTimeUtc));
}
