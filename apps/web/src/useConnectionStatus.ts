import { useCallback, useEffect, useRef, useState } from "react";
import { fetchStatus } from "./api.js";
import type { ConnectionStatus } from "./connectionStatus.js";

export interface ConnectionStatusState {
  status: ConnectionStatus | null;
  /** Fehler beim Erreichen des EIGENEN Backends (nicht zu verwechseln mit status.lastErrorMessage,
   *  das den Apps-Script-Poll betrifft — hier ist der Server selbst nicht erreichbar). */
  fetchError: string | null;
  /** Zeitpunkt der letzten Prüfung — Grundlage für die Stale-Berechnung im UI. */
  checkedAtMs: number;
  /** Fragt den Status sofort neu ab, statt bis zum nächsten Intervall zu warten -- z.B. direkt
   *  nach einem Pause/Resume-Klick, damit die Anzeige nicht erst nach pollIntervalMs nachzieht. */
  refresh: () => void;
}

export function useConnectionStatus(pollIntervalMs: number): ConnectionStatusState {
  const [state, setState] = useState<Omit<ConnectionStatusState, "refresh">>({
    status: null,
    fetchError: null,
    checkedAtMs: Date.now(),
  });
  const cancelledRef = useRef(false);

  const load = useCallback(() => {
    fetchStatus()
      .then((status) => {
        if (!cancelledRef.current) setState({ status, fetchError: null, checkedAtMs: Date.now() });
      })
      .catch((err: unknown) => {
        if (!cancelledRef.current) {
          setState((prev) => ({
            status: prev.status,
            fetchError: err instanceof Error ? err.message : String(err),
            checkedAtMs: Date.now(),
          }));
        }
      });
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    load();
    const id = setInterval(load, pollIntervalMs);
    return () => {
      cancelledRef.current = true;
      clearInterval(id);
    };
  }, [pollIntervalMs, load]);

  return { ...state, refresh: load };
}
