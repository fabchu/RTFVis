import type { CheckpointDef, RosterEntry, Route, ScanRecord } from "@rtfvis/core";
import { useEffect, useState } from "react";
import { fetchCheckpoints, fetchRoster, fetchRoutes, fetchScans } from "./api.js";

export interface RaceStaticData {
  routes: Route[];
  checkpoints: CheckpointDef[];
  loading: boolean;
  error: string | null;
}

/** Strecken/Checkpoints ändern sich während des Rennens nicht — einmaliger Ladevorgang. */
export function useRaceStaticData(): RaceStaticData {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [checkpoints, setCheckpoints] = useState<CheckpointDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchRoutes(), fetchCheckpoints()])
      .then(([routesRes, checkpointsRes]) => {
        if (cancelled) return;
        setRoutes(routesRes);
        setCheckpoints(checkpointsRes);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { routes, checkpoints, loading, error };
}

export interface RaceLiveData {
  roster: RosterEntry[];
  scans: ScanRecord[];
  loading: boolean;
  error: string | null;
}

/**
 * Roster/Scans ändern sich laufend — periodischer Refresh. Läuft unabhängig vom
 * Live/Replay-Anzeigemodus: Replay braucht denselben (wachsenden) Datenbestand wie Live,
 * nur die Zeit `t` für computePositions unterscheidet sich (siehe useClock).
 */
export function useRaceLiveData(pollIntervalMs: number): RaceLiveData {
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      Promise.all([fetchRoster(), fetchScans()])
        .then(([rosterRes, scansRes]) => {
          if (cancelled) return;
          setRoster(rosterRes);
          setScans(scansRes);
          setError(null);
        })
        .catch((err: unknown) => {
          if (!cancelled) setError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    load();
    const id = setInterval(load, pollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pollIntervalMs]);

  return { roster, scans, loading, error };
}
