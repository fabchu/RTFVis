import { computeConnectionHealth, type ConnectionHealth, type ConnectionStatus } from "../connectionStatus.js";
import { formatTime } from "../format.js";

interface ConnectionStatusBadgeProps {
  status: ConnectionStatus | null;
  fetchError: string | null;
  checkedAtMs: number;
  onOpenSyncStatus: () => void;
}

const HEALTH_LABELS: Record<ConnectionHealth, string> = {
  ok: "Verbunden",
  stale: "Keine aktuellen Daten",
  error: "Fehler",
};

export function ConnectionStatusBadge({ status, fetchError, checkedAtMs, onOpenSyncStatus }: ConnectionStatusBadgeProps) {
  const health: ConnectionHealth = fetchError
    ? "error"
    : status
      ? computeConnectionHealth(status, checkedAtMs)
      : "stale";

  const errorDetail = fetchError ?? (health !== "ok" ? status?.lastErrorMessage : null);

  return (
    <div
      className={`connection-status connection-status-${health} connection-status-clickable`}
      role="button"
      tabIndex={0}
      onClick={onOpenSyncStatus}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenSyncStatus();
        }
      }}
      title="Verbindungsstatus je Kontrollstation anzeigen"
    >
      <div className="connection-status-headline">
        <span className="connection-dot" />
        <span>{HEALTH_LABELS[health]}</span>
      </div>

      {fetchError && <div className="connection-detail">Backend nicht erreichbar: {fetchError}</div>}

      {!fetchError && status && (
        <div className="connection-detail">
          {status.dataSource} · {status.scanCount} Scans · {status.riderCount} Fahrer
          {status.lastSuccessAtMs !== null && ` · zuletzt ${formatTime(status.lastSuccessAtMs)}`}
        </div>
      )}

      {!fetchError && errorDetail && <div className="connection-error-detail">{errorDetail}</div>}
    </div>
  );
}
