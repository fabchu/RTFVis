import type { CheckpointDef, RiderPosition, Route, ScanRecord } from "@rtfvis/core";
import { STATUS_COLORS, STATUS_LABELS } from "../constants.js";
import { formatTime } from "../format.js";
import { estimateNextArrivalMs } from "../nextArrival.js";

interface RiderDetailProps {
  position: RiderPosition;
  route: Route | undefined;
  scans: ScanRecord[];
  checkpointsById: Map<string, CheckpointDef>;
  onClose: () => void;
}

export function RiderDetail({ position, route, scans, checkpointsById, onClose }: RiderDetailProps) {
  const riderScans = scans
    .filter((s) => s.startNumber === position.startNumber)
    .slice()
    .sort((a, b) => a.timestampUtc.localeCompare(b.timestampUtc));

  const nextArrivalMs = estimateNextArrivalMs(position);
  const nextCheckpointName = position.nextCheckpointId
    ? (checkpointsById.get(position.nextCheckpointId)?.name ?? position.nextCheckpointId)
    : null;

  const speedKmh = position.speedMps !== null ? position.speedMps * 3.6 : null;

  return (
    <div className="rider-detail">
      <div className="rider-detail-header">
        <h2>
          Fahrer #{position.startNumber}
        </h2>
        <button className="close-button" onClick={onClose} aria-label="Schließen">
          ×
        </button>
      </div>

      <div className="rider-detail-badge" style={{ backgroundColor: STATUS_COLORS[position.status] }}>
        {STATUS_LABELS[position.status]}
      </div>

      <dl className="rider-detail-facts">
        <dt>Kategorie</dt>
        <dd>{position.category ?? "unbekannt"}</dd>

        <dt>Strecke</dt>
        <dd>
          {route ? route.name : position.candidateRouteIds.length > 0 ? `Unklar: ${position.candidateRouteIds.join(", ")}` : "—"}
        </dd>

        {position.rosterConflict && (
          <>
            <dt>Hinweis</dt>
            <dd className="conflict-note">Vorab zugeordnete Strecke passt nicht zu den Scans — Ableitung verwendet.</dd>
          </>
        )}

        <dt>Tempo</dt>
        <dd>{speedKmh !== null ? `${speedKmh.toFixed(1)} km/h` : "—"}</dd>

        {nextCheckpointName && (
          <>
            <dt>Nächster Checkpoint</dt>
            <dd>
              {nextCheckpointName}
              {nextArrivalMs !== null && ` — erwartet ~${formatTime(nextArrivalMs)}`}
            </dd>
          </>
        )}
      </dl>

      <h3>Scan-Historie</h3>
      {riderScans.length === 0 ? (
        <p className="empty-hint">Noch keine Scans.</p>
      ) : (
        <table className="scan-history">
          <tbody>
            {riderScans.map((s, i) => (
              <tr key={`${s.checkpointId}-${i}`}>
                <td>{checkpointsById.get(s.checkpointId)?.name ?? s.checkpointId}</td>
                <td>{formatTime(new Date(s.timestampUtc).getTime())}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
