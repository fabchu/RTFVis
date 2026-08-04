import { useCallback, useEffect, useState } from "react";
import { fetchIgnoredRiders, ignoreRider as ignoreRiderRequest, unignoreRider as unignoreRiderRequest } from "./api.js";

export interface IgnoredRidersState {
  ignoredStartNumbers: Set<string>;
  ignore: (startNumber: string) => void;
  unignore: (startNumber: string) => void;
}

/**
 * Von der Orga ignorierte Fahrer -- serverseitig gespeichert (siehe apps/server/src/db.ts),
 * damit mehrere gleichzeitig geöffnete Ansichten (z.B. mehrere Kontrollposten) dieselbe
 * Markierung sehen, nicht nur der eigene Browser. Ignorieren/Zurückholen aktualisiert den
 * lokalen State sofort (optimistisch), damit der Klick nicht auf den nächsten Poll warten
 * muss -- der nächste Poll gleicht ihn ohnehin mit dem Server ab.
 */
export function useIgnoredRiders(pollIntervalMs: number): IgnoredRidersState {
  const [ignoredStartNumbers, setIgnoredStartNumbers] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      fetchIgnoredRiders()
        .then((list) => {
          if (!cancelled) setIgnoredStartNumbers(new Set(list));
        })
        .catch((err: unknown) => {
          console.error("Laden der ignorierten Fahrer fehlgeschlagen:", err);
        });
    };

    load();
    const id = setInterval(load, pollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pollIntervalMs]);

  const ignore = useCallback((startNumber: string) => {
    setIgnoredStartNumbers((prev) => new Set(prev).add(startNumber));
    ignoreRiderRequest(startNumber).catch((err: unknown) => {
      console.error(err);
    });
  }, []);

  const unignore = useCallback((startNumber: string) => {
    setIgnoredStartNumbers((prev) => {
      const next = new Set(prev);
      next.delete(startNumber);
      return next;
    });
    unignoreRiderRequest(startNumber).catch((err: unknown) => {
      console.error(err);
    });
  }, []);

  return { ignoredStartNumbers, ignore, unignore };
}
