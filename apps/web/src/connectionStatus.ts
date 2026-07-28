export interface ConnectionStatus {
  dataSource: string;
  pollIntervalMs: number;
  scanCount: number;
  riderCount: number;
  lastSuccessAtMs: number | null;
  lastErrorAtMs: number | null;
  lastErrorMessage: string | null;
  consecutiveFailures: number;
}

export type ConnectionHealth = "ok" | "stale" | "error";

/**
 * "stale" ab dem 3-fachen des Server-Poll-Intervalls ohne erfolgreichen Poll — großzügig
 * genug für einen einzelnen ausgefallenen Versuch samt Backoff, meldet aber verlässlich,
 * wenn der Datenpfad zum Sheet wirklich hängt.
 */
const STALE_MULTIPLIER = 3;

export function computeConnectionHealth(status: ConnectionStatus, nowMs: number): ConnectionHealth {
  if (status.consecutiveFailures > 0) return "error";
  if (status.lastSuccessAtMs === null) return "stale";
  if (nowMs - status.lastSuccessAtMs > status.pollIntervalMs * STALE_MULTIPLIER) return "stale";
  return "ok";
}
