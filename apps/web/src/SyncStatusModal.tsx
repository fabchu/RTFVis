import type { CheckpointDef, ScanRecord } from "@rtfvis/core";
import { useMemo } from "react";
import { computeCheckpointSyncStatus } from "./checkpointSyncStatus.js";
import { formatDurationMs, formatTimeWithSeconds } from "./format.js";

interface SyncStatusModalProps {
  scans: ScanRecord[];
  checkpointsById: Map<string, CheckpointDef>;
  nowMs: number;
  onClose: () => void;
}

/**
 * Zeigt je Kontrollstation, wann sie zuletzt Daten ins Sheet gespielt hat (Zeitstempel_tech)
 * und welches Ereignis das war (Zeitstempel) -- Hilfsmittel, um Stationen mit möglichen
 * Verbindungsproblemen zu erkennen (lange her seit dem letzten Sync).
 */
export function SyncStatusModal({ scans, checkpointsById, nowMs, onClose }: SyncStatusModalProps) {
  const rows = useMemo(() => computeCheckpointSyncStatus(scans, checkpointsById), [scans, checkpointsById]);

  return (
    <div className="safety-modal-backdrop" onClick={onClose}>
      <div className="safety-modal" onClick={(e) => e.stopPropagation()}>
        <div className="safety-modal-header">
          <h2>Verbindungsstatus je Kontrollstation</h2>
          <button className="close-button" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </div>

        <div className="safety-table-wrap">
          <table className="safety-table">
            <thead>
              <tr>
                <th>Kontrollstation</th>
                <th>Zuletzt Daten erhalten</th>
                <th>Letztes Ereignis</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.checkpointId} className="safety-row">
                  <td>{row.checkpointName}</td>
                  <td>
                    {formatTimeWithSeconds(Date.parse(row.lastTechnicalTimeUtc))}
                    <span className="sync-status-ago"> (vor {formatDurationMs(nowMs - Date.parse(row.lastTechnicalTimeUtc))})</span>
                  </td>
                  <td>{formatTimeWithSeconds(Date.parse(row.lastEventTimeUtc))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="empty-hint">Noch keine Kontrollen-Scans mit Sync-Zeitstempel erhalten.</p>}
        </div>
      </div>
    </div>
  );
}
