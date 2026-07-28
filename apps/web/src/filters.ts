import type { Category, RiderPosition, RiderStatus, Route } from "@rtfvis/core";

export interface PositionFilters {
  category: Category | "all";
  routeId: string | "all";
  status: RiderStatus | "all";
  /** Freitext-Suche über die Startnummer, case-insensitive Teilstring-Treffer. */
  search: string;
}

export const DEFAULT_FILTERS: PositionFilters = { category: "all", routeId: "all", status: "all", search: "" };

/**
 * Löst eine Sternfahrt-Variante (siehe @rtfvis/core preprocess/sternfahrt.ts) auf ihre
 * Basis-Strecke auf, damit der Streckenfilter (der nur reguläre Strecken zur Auswahl
 * anbietet) auch Sternfahrer korrekt erfasst — ein Fahrer mit routeId
 * "rtf-90-sternfahrt" gilt beim Filtern nach "rtf-90" ganz normal als Treffer.
 */
function toEffectiveRouteId(routeId: string | null, routesById: Map<string, Route>): string | null {
  if (routeId === null) return null;
  return routesById.get(routeId)?.baseRouteId ?? routeId;
}

/**
 * Prüft, ob eine Strecke zu den Kategorie-/Strecken-Filtern passt — für die Kartendarstellung
 * (Streckenlinien, Segmentauslastungsmarker), die denselben Filtern folgen soll wie die
 * Fahrerliste. Bei einer ausgewählten Strecke zählt auch ihre Sternfahrt-Variante (siehe
 * @rtfvis/core preprocess/sternfahrt.ts) als Treffer, damit deren Segmente — insbesondere der
 * nur dort existierende Rückweg-Abschnitt — auf der Karte sichtbar bleiben.
 */
export function routeMatchesFilters(route: Route, filters: Pick<PositionFilters, "category" | "routeId">): boolean {
  if (filters.category !== "all" && route.category !== filters.category) return false;
  if (filters.routeId !== "all" && route.id !== filters.routeId && route.baseRouteId !== filters.routeId) return false;
  return true;
}

export function filterPositions(
  positions: RiderPosition[],
  filters: PositionFilters,
  routesById: Map<string, Route>,
): RiderPosition[] {
  const search = filters.search.trim().toLowerCase();

  return positions.filter((p) => {
    if (filters.category !== "all" && p.category !== filters.category) return false;
    if (filters.status !== "all" && p.status !== filters.status) return false;
    if (filters.routeId !== "all") {
      const effectiveRouteId = toEffectiveRouteId(p.routeId, routesById);
      const effectiveCandidateIds = p.candidateRouteIds.map((id) => toEffectiveRouteId(id, routesById));
      if (effectiveRouteId !== filters.routeId && !effectiveCandidateIds.includes(filters.routeId)) return false;
    }
    if (search !== "" && !p.startNumber.toLowerCase().includes(search)) return false;
    return true;
  });
}
