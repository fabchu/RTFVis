import type { Route, RosterEntry, ScanRecord } from "./types.js";

export interface RouteResolution {
  /** Eine oder mehrere mögliche Strecken. Leer, wenn keine Strecke zu den beobachteten Scans passt. */
  candidateRouteIds: string[];
  /**
   * True, wenn im Roster eine Strecke hinterlegt war, diese aber nicht zu den
   * beobachteten Scans passt (z.B. Fahrer ist spontan die kürzere Runde gefahren).
   * candidateRouteIds enthält in diesem Fall das Ergebnis der Ableitung aus den Scans,
   * nicht die (widersprüchliche) Roster-Zuordnung.
   */
  conflict: boolean;
}

/**
 * Löst die wahrscheinliche(n) Strecke(n) eines Fahrers auf.
 *
 * Reihenfolge: Roster-Zuordnung, falls vorhanden und mit den Scans verträglich. Sonst
 * Ableitung aus den Scans — alle Strecken der Kategorie, deren Checkpoint-Reihenfolge
 * die beobachteten Scans als TEILFOLGE enthält (nicht als Präfix), damit ein einzelner
 * verpasster Scan den Fahrer nicht aus allen Kandidaten wirft.
 */
export function resolveRoute(scans: ScanRecord[], roster: RosterEntry | undefined, routes: Route[]): RouteResolution {
  const checkpointSequence = scans.map((s) => s.checkpointId);

  if (roster?.routeId) {
    const assigned = routes.find((r) => r.id === roster.routeId);
    if (assigned && isSubsequence(checkpointSequence, assigned.checkpoints.map((c) => c.id))) {
      return { candidateRouteIds: [assigned.id], conflict: false };
    }
    return { candidateRouteIds: deriveCandidates(checkpointSequence, roster.category, routes), conflict: true };
  }

  return { candidateRouteIds: deriveCandidates(checkpointSequence, roster?.category, routes), conflict: false };
}

function deriveCandidates(
  checkpointSequence: string[],
  category: RosterEntry["category"] | undefined,
  routes: Route[],
): string[] {
  const categoryPool = category ? routes.filter((r) => r.category === category) : routes;

  // Reguläre Strecken haben Vorrang. Sternfahrt-Varianten (siehe preprocess/sternfahrt.ts)
  // enthalten dieselben Checkpoint-IDs zweimal und würden sonst JEDEN normalen Fahrer
  // während seines gesamten Ritts (bis kurz vor dem Ziel) fälschlich als mehrdeutig
  // zwischen "Strecke" und "Strecke (Sternfahrt)" zeigen — obwohl daran nichts unklar
  // ist. Varianten werden deshalb nur als Rückfall probiert, wenn KEINE reguläre Strecke
  // (mehr) zur beobachteten Scan-Reihenfolge passt.
  const realRoutes = categoryPool.filter((r) => !r.baseRouteId);
  const realMatches = matchRoutes(checkpointSequence, realRoutes);
  if (realMatches.length > 0) return realMatches;

  const variantRoutes = categoryPool.filter((r) => r.baseRouteId);
  return matchRoutes(checkpointSequence, variantRoutes);
}

function matchRoutes(checkpointSequence: string[], routes: Route[]): string[] {
  return routes
    .filter((r) => isSubsequence(checkpointSequence, r.checkpoints.map((c) => c.id)))
    .map((r) => r.id);
}

/** True, wenn jedes Element von `needle` in derselben Reihenfolge in `haystack` vorkommt (nicht notwendig direkt aufeinanderfolgend). */
export function isSubsequence(needle: string[], haystack: string[]): boolean {
  let i = 0;
  for (const item of haystack) {
    if (i < needle.length && needle[i] === item) i++;
  }
  return i === needle.length;
}
