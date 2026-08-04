export interface ConnectionStatus {
  dataSource: string;
  pollIntervalMs: number;
  scanCount: number;
  riderCount: number;
  lastSuccessAtMs: number | null;
  lastErrorAtMs: number | null;
  lastErrorMessage: string | null;
  consecutiveFailures: number;
  /** True, wenn das Sheet-Polling im Backend bewusst angehalten wurde (siehe SyncStatusModal) --
   *  betrifft ALLE Betrachter gleichzeitig, da der Poller nur einmal im Backend läuft. */
  paused: boolean;
}

export type ConnectionHealth = "ok" | "stale" | "error" | "paused";

/**
 * "stale" ab dem 3-fachen des Server-Poll-Intervalls ohne erfolgreichen Poll — großzügig
 * genug für einen einzelnen ausgefallenen Versuch samt Backoff, meldet aber verlässlich,
 * wenn der Datenpfad zum Sheet wirklich hängt.
 */
const STALE_MULTIPLIER = 3;

/**
 * "paused" hat Vorrang vor allem anderen: ein bewusst pausierter Poller sieht sonst nach
 * spätestens dem 3-fachen Poll-Intervall wie "stale" aus (fälschlich nach Störung), obwohl
 * alles wie gewollt läuft.
 */
export function computeConnectionHealth(status: ConnectionStatus, nowMs: number): ConnectionHealth {
  if (status.paused) return "paused";
  if (status.consecutiveFailures > 0) return "error";
  if (status.lastSuccessAtMs === null) return "stale";
  if (nowMs - status.lastSuccessAtMs > status.pollIntervalMs * STALE_MULTIPLIER) return "stale";
  return "ok";
}
