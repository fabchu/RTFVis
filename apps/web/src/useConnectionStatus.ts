import { useEffect, useState } from "react";
import { fetchStatus } from "./api.js";
import type { ConnectionStatus } from "./connectionStatus.js";

export interface ConnectionStatusState {
  status: ConnectionStatus | null;
  /** Fehler beim Erreichen des EIGENEN Backends (nicht zu verwechseln mit status.lastErrorMessage,
   *  das den Apps-Script-Poll betrifft — hier ist der Server selbst nicht erreichbar). */
  fetchError: string | null;
  /** Zeitpunkt der letzten Prüfung — Grundlage für die Stale-Berechnung im UI. */
  checkedAtMs: number;
}

export function useConnectionStatus(pollIntervalMs: number): ConnectionStatusState {
  const [state, setState] = useState<ConnectionStatusState>({
    status: null,
    fetchError: null,
    checkedAtMs: Date.now(),
  });

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      fetchStatus()
        .then((status) => {
          if (!cancelled) setState({ status, fetchError: null, checkedAtMs: Date.now() });
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setState((prev) => ({
              status: prev.status,
              fetchError: err instanceof Error ? err.message : String(err),
              checkedAtMs: Date.now(),
            }));
          }
        });
    };

    load();
    const id = setInterval(load, pollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pollIntervalMs]);

  return state;
}
