import type { CheckpointDef, ScanRecord } from "@rtfvis/core";
import { useMemo, useState } from "react";
import { computeCheckpointSyncStatus } from "./checkpointSyncStatus.js";
import type { ConnectionStatus } from "./connectionStatus.js";
import { formatDurationMs, formatTime, formatTimeWithSeconds } from "./format.js";

interface SyncStatusModalProps {
  scans: ScanRecord[];
  checkpointsById: Map<string, CheckpointDef>;
  nowMs: number;
  status: ConnectionStatus | null;
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
  onClose: () => void;
}

/**
 * Zeigt je Kontrollstation, wann sie zuletzt Daten ins Sheet gespielt hat (Zeitstempel_tech)
 * und welches Ereignis das war (Zeitstempel) -- Hilfsmittel, um Stationen mit möglichen
 * Verbindungsproblemen zu erkennen (lange her seit dem letzten Sync). Bietet außerdem einen
 * Pause/Fortsetzen-Schalter für das Sheet-Polling -- der Poller läuft nur einmal im Backend,
 * betrifft also ALLE gleichzeitig geöffneten Ansichten, nicht nur den eigenen Browser.
 */
export function SyncStatusModal({ scans, checkpointsById, nowMs, status, onPause, onResume, onClose }: SyncStatusModalProps) {
  const rows = useMemo(() => computeCheckpointSyncStatus(scans, checkpointsById), [scans, checkpointsById]);
  const [pending, setPending] = useState(false);
  const paused = status?.paused ?? false;

  async function handleToggle() {
    setPending(true);
    try {
      await (paused ? onResume() : onPause());
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="safety-modal-backdrop" onClick={onClose}>
      <div className="safety-modal" onClick={(e) => e.stopPropagation()}>
        <div className="safety-modal-header">
          <h2>Verbindungsstatus je Kontrollstation</h2>
          <button className="close-button" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </div>

        <div className="sync-poller-control">
          <div>
            <strong>Sheet-Polling: {paused ? "pausiert" : "läuft"}</strong>
            {!paused && status?.lastSuccessAtMs !== null && status?.lastSuccessAtMs !== undefined && (
              <span className="connection-detail"> · zuletzt {formatTime(status.lastSuccessAtMs)}</span>
            )}
            <p className="sync-poller-hint">
              Betrifft ALLE gerade geöffneten Ansichten, nicht nur diesen Browser -- z.B. nützlich, um kurzzeitig
              Google-Kontingent zu schonen.
            </p>
          </div>
          <button className={paused ? "safety-unignore-button" : "safety-ignore-button"} onClick={handleToggle} disabled={pending}>
            {paused ? "Fortsetzen" : "Pausieren"}
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
