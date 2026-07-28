import { getPollerState, insertScans, replaceRoster, setPollerState, type Db } from "./db.js";
import { mapSheetRouteId } from "./routeNameMapping.js";
import type { ScanSource } from "./sources/types.js";

const LAST_SCAN_TIMESTAMP_KEY = "lastSeenMaxScanTimestampUtc";

/**
 * Sicherheitsspanne für das "since"-Fenster: Scans, die z.B. wegen eines Funklochs am
 * Checkpoint erst nachträglich mit einem älteren Zeitstempel im Sheet auftauchen, werden
 * nur innerhalb dieses Fensters noch nachgeholt (dank Dedup in insertScans ist erneutes
 * Abfragen bereits bekannter Zeilen unschädlich). Größer wählen kostet Antwortgröße,
 * kleiner riskiert dauerhaft verlorene Nachzügler-Scans.
 */
const LATE_ARRIVAL_SAFETY_MARGIN_MS = 15 * 60 * 1000;

export interface PollResult {
  insertedScans: number;
  rosterSize: number;
}

export async function pollOnce(source: ScanSource, db: Db): Promise<PollResult> {
  const rawRoster = await source.fetchRoster();
  const roster = rawRoster.map((entry) => ({ ...entry, routeId: mapSheetRouteId(entry.routeId) }));
  replaceRoster(db, roster);

  const lastSeen = getPollerState(db, LAST_SCAN_TIMESTAMP_KEY);
  const since =
    lastSeen === null ? null : new Date(new Date(lastSeen).getTime() - LATE_ARRIVAL_SAFETY_MARGIN_MS).toISOString();

  const scans = await source.fetchScansSince(since);
  const insertedScans = insertScans(db, scans);

  const newMax = scans.reduce<string | null>(
    (max, s) => (max === null || s.timestampUtc > max ? s.timestampUtc : max),
    lastSeen,
  );
  if (newMax !== null) {
    setPollerState(db, LAST_SCAN_TIMESTAMP_KEY, newMax);
  }

  return { insertedScans, rosterSize: roster.length };
}

export interface PollerOptions {
  intervalMs: number;
  maxBackoffMs?: number;
  onPollError?: (error: unknown, consecutiveFailures: number) => void;
  onPollSuccess?: (result: PollResult) => void;
}

export interface PollerHandle {
  stop: () => void;
}

/** Startet Dauer-Polling mit exponentiellem Backoff bei Fehlern. */
export function startPolling(source: ScanSource, db: Db, options: PollerOptions): PollerHandle {
  const maxBackoffMs = options.maxBackoffMs ?? options.intervalMs * 8;
  let stopped = false;
  let consecutiveFailures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const scheduleNext = (delayMs: number) => {
    if (stopped) return;
    timer = setTimeout(runOnce, delayMs);
  };

  const runOnce = async () => {
    try {
      const result = await pollOnce(source, db);
      consecutiveFailures = 0;
      options.onPollSuccess?.(result);
      scheduleNext(options.intervalMs);
    } catch (error) {
      consecutiveFailures++;
      options.onPollError?.(error, consecutiveFailures);
      const backoff = Math.min(options.intervalMs * 2 ** consecutiveFailures, maxBackoffMs);
      scheduleNext(backoff);
    }
  };

  scheduleNext(0);

  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
