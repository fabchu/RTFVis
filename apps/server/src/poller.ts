import { resolveCheckpointId } from "./checkpointIdMapping.js";
import { getPollerState, getRoster, insertScans, replaceRoster, setPollerState, type Db } from "./db.js";
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
  /** Startnummern, die im vorherigen Roster-Bestand noch nicht bekannt waren. */
  newRiders: number;
}

export async function pollOnce(source: ScanSource, db: Db, validCheckpointIds: readonly string[]): Promise<PollResult> {
  // Vor dem Überschreiben abfragen -- replaceRoster ersetzt den kompletten Bestand, ohne das
  // gäbe es keine Grundlage, um "neue" Fahrer von schon bekannten zu unterscheiden (fürs
  // Poll-Log, siehe index.ts).
  const previousStartNumbers = new Set(getRoster(db).map((r) => r.startNumber));

  const rawRoster = await source.fetchRoster();
  const roster = rawRoster.map((entry) => ({ ...entry, routeId: mapSheetRouteId(entry.routeId) }));
  replaceRoster(db, roster);
  const newRiders = roster.filter((entry) => !previousStartNumbers.has(entry.startNumber)).length;

  const lastSeen = getPollerState(db, LAST_SCAN_TIMESTAMP_KEY);
  const since =
    lastSeen === null ? null : new Date(new Date(lastSeen).getTime() - LATE_ARRIVAL_SAFETY_MARGIN_MS).toISOString();

  const rawScans = await source.fetchScansSince(since);
  const scans = rawScans.map((s) => ({ ...s, checkpointId: resolveCheckpointId(s.checkpointId, validCheckpointIds) }));
  const insertedScans = insertScans(db, scans);

  const newMax = scans.reduce<string | null>(
    (max, s) => (max === null || s.timestampUtc > max ? s.timestampUtc : max),
    lastSeen,
  );
  if (newMax !== null) {
    setPollerState(db, LAST_SCAN_TIMESTAMP_KEY, newMax);
  }

  return { insertedScans, rosterSize: roster.length, newRiders };
}

export interface PollerOptions {
  intervalMs: number;
  validCheckpointIds: readonly string[];
  maxBackoffMs?: number;
  onPollError?: (error: unknown, consecutiveFailures: number) => void;
  onPollSuccess?: (result: PollResult) => void;
}

export interface PollerHandle {
  stop: () => void;
  /** Hält das Polling an, ohne es zu beenden -- z.B. um das Sheet/AppSheet-Kontingent zu
   *  schonen. Ein bereits laufender Request wird nicht abgebrochen, nur der nächste Zyklus
   *  nicht mehr eingeplant. Betrifft ALLE Betrachter, da der Poller einmalig im Backend läuft
   *  (siehe useIgnoredRiders für dasselbe "geteilter Server-Zustand"-Muster). */
  pause: () => void;
  /** Setzt das Polling fort und stößt sofort einen Zyklus an (statt bis zum nächsten
   *  planmäßigen Intervall zu warten). */
  resume: () => void;
  isPaused: () => boolean;
}

/** Startet Dauer-Polling mit exponentiellem Backoff bei Fehlern. */
export function startPolling(source: ScanSource, db: Db, options: PollerOptions): PollerHandle {
  const maxBackoffMs = options.maxBackoffMs ?? options.intervalMs * 8;
  let stopped = false;
  let paused = false;
  let consecutiveFailures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const scheduleNext = (delayMs: number) => {
    if (stopped || paused) return;
    timer = setTimeout(runOnce, delayMs);
  };

  const runOnce = async () => {
    try {
      const result = await pollOnce(source, db, options.validCheckpointIds);
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
    pause: () => {
      if (stopped || paused) return;
      paused = true;
      if (timer) clearTimeout(timer);
    },
    resume: () => {
      if (stopped || !paused) return;
      paused = false;
      scheduleNext(0);
    },
    isPaused: () => paused,
  };
}
