import type { Category, CheckpointDef, RiderPosition, Route } from "@rtfvis/core";

export interface CheckpointPairOccupancy {
  fromCheckpointId: string;
  toCheckpointId: string;
  /** Alle Strecken, die genau diesen Abschnitt (in dieser Reihenfolge) enthalten. */
  routeIds: string[];
  riderCount: number;
  /**
   * Fahrer, deren Position auf diesem Abschnitt nicht verlässlich ist -- entweder unklare
   * Streckenzuordnung (ambiguousRoute/routeConflict) oder ein Sternfahrer, der bereits sein
   * Start/Ziel-Durchfahrt hinter sich hat (siehe computeCheckpointPairOccupancy). Grobe
   * Schätzung, keine exakte Zuordnung. Bewusst getrennt von riderCount, damit dieser weiterhin
   * ein eindeutiger, verlässlicher Wert bleibt.
   */
  unclearCount: number;
}

/**
 * Zählt für jeden physischen Checkpoint-Abschnitt (from→to), unabhängig davon welche
 * Strecke(n) ihn enthalten, wie viele Fahrer sich gerade dazwischen befinden. Ein von
 * mehreren Strecken geteilter Abschnitt ist dadurch nur EIN Eintrag, nicht einer pro
 * Strecke — und ein mehrdeutiger Fahrer wird dafür bewusst nur EINMAL gezählt (nicht pro
 * Kandidatenstrecke), sonst würde er auf einem geteilten Abschnitt beim Zusammenfassen
 * mehrfach gezählt.
 *
 * Nutzt bewusst nur die bereits vorhandenen lastCheckpointId/nextCheckpointId-Felder aus
 * computePositions statt eigener Distanzvergleiche — bei "onCourse"/"overdue" ist
 * nextCheckpointId immer der über ALLE Kandidatenstrecken geteilte nächste Checkpoint
 * (siehe position.ts). Fahrer mit "ambiguousRoute" (echte Verzweigung erreicht,
 * nextCheckpointId===null) oder "routeConflict" zählen NICHT in riderCount -- ihre Position
 * zwischen zwei Checkpoints ist nicht eindeutig bestimmbar -- landen aber in unclearCount auf
 * jedem Abschnitt, den sie ab ihrem letzten bekannten Checkpoint theoretisch noch erreichen
 * könnten (siehe unten). Sonst würde ein Streckenposten bei "0 Fahrer unterwegs" fälschlich
 * annehmen können, dass niemand mehr kommt, obwohl da noch ein Fahrer mit unklarer Zuordnung
 * unterwegs sein könnte. "finished" und "notStarted" zählen weiterhin nirgends mit.
 *
 * Sonderfall Sternfahrer (siehe preprocess/sternfahrt.ts): auf einer Sternfahrt-Variante
 * verdoppelt sich die Checkpoint-Liste, damit der Fahrer über Start/Ziel hinweg weiter
 * verfolgt werden kann -- wir wissen aber NICHT, wie weit er nach seiner offiziellen
 * Start/Ziel-Durchfahrt tatsächlich noch fährt (er hört bei seinem eigenen Einstiegspunkt
 * auf, ohne das zu scannen). Ein "onCourse"/"overdue"-Sternfahrer, dessen letzter Checkpoint
 * bereits auf der zweiten (verdoppelten) Hälfte seiner Variante liegt, landet deshalb
 * ebenfalls in unclearCount statt riderCount für seinen aktuellen Abschnitt -- die Annahme
 * "er fährt sicher bis zum nächsten Checkpoint" trifft für ihn strukturell nicht zu.
 */
export function computeCheckpointPairOccupancy(positions: RiderPosition[], routes: Route[]): CheckpointPairOccupancy[] {
  const routeById = new Map(routes.map((r) => [r.id, r]));
  const routeIdsByPair = new Map<string, Set<string>>();
  // Je Strecke: Checkpoint-ID -> Menge der direkt folgenden Checkpoint-IDs (an JEDER Position,
  // falls die Strecke denselben Checkpoint mehrfach besucht) -- Grundlage für unclearCount.
  const nextIdsByRoute = new Map<string, Map<string, Set<string>>>();
  for (const route of routes) {
    const nextIds = new Map<string, Set<string>>();
    for (let i = 0; i < route.checkpoints.length - 1; i++) {
      const fromId = route.checkpoints[i].id;
      const toId = route.checkpoints[i + 1].id;
      const key = pairKey(fromId, toId);
      if (!routeIdsByPair.has(key)) routeIdsByPair.set(key, new Set());
      routeIdsByPair.get(key)!.add(route.id);

      if (!nextIds.has(fromId)) nextIds.set(fromId, new Set());
      nextIds.get(fromId)!.add(toId);
    }
    nextIdsByRoute.set(route.id, nextIds);
  }

  // Für routeConflict (Route komplett unbekannt, candidateRouteIds daher leer) bleibt nur die
  // grobe Annahme "irgendeine reale Strecke der eigenen Kategorie" -- Sternfahrt-Varianten
  // bewusst ausgeklammert wie überall sonst bei der Ableitung.
  const realRouteIdsByCategory = new Map<Category, string[]>();
  for (const route of routes) {
    if (route.baseRouteId) continue;
    if (!realRouteIdsByCategory.has(route.category)) realRouteIdsByCategory.set(route.category, []);
    realRouteIdsByCategory.get(route.category)!.push(route.id);
  }

  const counts = new Map<string, number>();
  const unclearCounts = new Map<string, number>();
  for (const key of routeIdsByPair.keys()) {
    counts.set(key, 0);
    unclearCounts.set(key, 0);
  }

  for (const position of positions) {
    if (position.status === "onCourse" || position.status === "overdue") {
      if (position.lastCheckpointId === null || position.nextCheckpointId === null) continue;
      const key = pairKey(position.lastCheckpointId, position.nextCheckpointId);

      // Sternfahrer auf der zweiten (verdoppelten) Hälfte ihrer Variante -- siehe Docstring
      // oben -- zählen als unklar statt sicher, auch wenn nextCheckpointId eindeutig ist.
      const representativeRouteId = position.routeId ?? position.candidateRouteIds[0];
      const representativeRoute = representativeRouteId ? routeById.get(representativeRouteId) : undefined;
      const isUncertainSternfahrtTail =
        representativeRoute?.baseRouteId !== undefined &&
        position.lastCheckpointDistanceM !== null &&
        position.lastCheckpointDistanceM >= representativeRoute.totalDistanceM / 2;

      const target = isUncertainSternfahrtTail ? unclearCounts : counts;
      const current = target.get(key);
      if (current !== undefined) target.set(key, current + 1);
      continue;
    }

    if (position.status !== "ambiguousRoute" && position.status !== "routeConflict") continue;
    if (position.lastCheckpointId === null) continue;

    const candidateRouteIds =
      position.status === "ambiguousRoute"
        ? position.candidateRouteIds
        : (position.category ? realRouteIdsByCategory.get(position.category) : undefined) ?? [];

    // Ein Fahrer zählt je Abschnitt höchstens einmal, auch wenn ihn mehrere seiner
    // Kandidatenstrecken teilen (analog zur riderCount-Logik oben).
    const alreadyCounted = new Set<string>();
    for (const routeId of candidateRouteIds) {
      const toIds = nextIdsByRoute.get(routeId)?.get(position.lastCheckpointId);
      if (!toIds) continue;
      for (const toId of toIds) {
        const key = pairKey(position.lastCheckpointId, toId);
        if (alreadyCounted.has(key)) continue;
        alreadyCounted.add(key);
        const current = unclearCounts.get(key);
        if (current !== undefined) unclearCounts.set(key, current + 1);
      }
    }
  }

  return Array.from(routeIdsByPair.entries()).map(([key, routeIdSet]) => {
    const [fromCheckpointId, toCheckpointId] = key.split("::");
    return {
      fromCheckpointId,
      toCheckpointId,
      routeIds: Array.from(routeIdSet),
      riderCount: counts.get(key)!,
      unclearCount: unclearCounts.get(key)!,
    };
  });
}

function pairKey(fromId: string, toId: string): string {
  return `${fromId}::${toId}`;
}

export interface NamedPairOccupancy {
  fromName: string;
  toName: string;
  riderCount: number;
  unclearCount: number;
  /**
   * Einer der ursprünglichen Abschnitte dieser Gruppe (eigene Checkpoint-IDs + eigene
   * Strecken-IDs) — als Anker für z.B. eine Geometrie-Positionierung, die IDs und Strecke
   * konsistent zueinander braucht und nicht über mehrere Abschnitte hinweg gemischt werden darf.
   */
  representative: CheckpointPairOccupancy;
}

/**
 * Fasst Abschnitte mit identischem Namenspaar zusammen (z.B. teilen sich START und FINISH bei
 * Rundkursen denselben Namen "Start/Ziel", wodurch der reguläre Schlussabschnitt einer Strecke
 * und der nur auf ihrer Sternfahrt-Variante existierende Rückweg-Abschnitt sonst als zwei
 * ununterscheidbare, aber unterschiedlich gezählte Einträge auftauchen würden — auf der Karte
 * sogar als zwei beinah deckungsgleiche Marker, von denen der "falsche" (z.B. grau mit 0
 * Fahrern) den anderen verdeckt).
 */
export function groupCheckpointPairsByName(
  pairs: CheckpointPairOccupancy[],
  checkpointsById: Map<string, CheckpointDef>,
): NamedPairOccupancy[] {
  const checkpointName = (id: string) => checkpointsById.get(id)?.name ?? id;
  const byName = new Map<string, NamedPairOccupancy>();
  for (const pair of pairs) {
    const fromName = checkpointName(pair.fromCheckpointId);
    const toName = checkpointName(pair.toCheckpointId);
    const key = `${fromName}::${toName}`;
    const existing = byName.get(key);
    if (existing) {
      existing.riderCount += pair.riderCount;
      existing.unclearCount += pair.unclearCount;
    } else {
      byName.set(key, { fromName, toName, riderCount: pair.riderCount, unclearCount: pair.unclearCount, representative: pair });
    }
  }
  return Array.from(byName.values()).sort(
    (a, b) => a.fromName.localeCompare(b.fromName) || a.toName.localeCompare(b.toName),
  );
}

export interface CategorySegmentGroup {
  category: Category;
  segments: NamedPairOccupancy[];
}

/**
 * Fasst die nach Namen zusammengefassten Abschnitte zusätzlich nach Kategorie und sortiert
 * sie innerhalb einer Kategorie in der Reihenfolge, in der sie auf der längsten (nicht
 * Sternfahrt-)Strecke dieser Kategorie vorkommen. Die längste Strecke enthält typischerweise
 * alle gemeinsamen Kontrollpunkte der Kategorie in der vollständigsten Reihenfolge — kürzere
 * Strecken sind meist Teilabschnitte davon. Abschnitte, die dort nicht vorkommen (z.B. der nur
 * auf einer Sternfahrt-Variante existierende Rückweg-Abschnitt), landen alphabetisch sortiert
 * am Ende.
 */
export function groupNamedPairsByCategory(
  pairs: CheckpointPairOccupancy[],
  routesById: Map<string, Route>,
  checkpointsById: Map<string, CheckpointDef>,
): CategorySegmentGroup[] {
  const named = groupCheckpointPairsByName(pairs, checkpointsById);

  const byCategory = new Map<Category, NamedPairOccupancy[]>();
  for (const group of named) {
    const category = routesById.get(group.representative.routeIds[0])?.category;
    if (!category) continue;
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category)!.push(group);
  }

  const routesByCategory = new Map<Category, Route[]>();
  for (const route of routesById.values()) {
    if (route.baseRouteId) continue;
    if (!routesByCategory.has(route.category)) routesByCategory.set(route.category, []);
    routesByCategory.get(route.category)!.push(route);
  }

  const checkpointName = (id: string) => checkpointsById.get(id)?.name ?? id;

  const result: CategorySegmentGroup[] = [];
  for (const [category, segments] of byCategory) {
    const routesOfCategory = routesByCategory.get(category) ?? [];
    const longestRoute = routesOfCategory.reduce(
      (longest, r) => (!longest || r.totalDistanceM > longest.totalDistanceM ? r : longest),
      undefined as Route | undefined,
    );

    const orderIndex = new Map<string, number>();
    if (longestRoute) {
      for (let i = 0; i < longestRoute.checkpoints.length - 1; i++) {
        const key = `${checkpointName(longestRoute.checkpoints[i].id)}::${checkpointName(longestRoute.checkpoints[i + 1].id)}`;
        if (!orderIndex.has(key)) orderIndex.set(key, i);
      }
    }

    const sorted = segments.slice().sort((a, b) => {
      const aIndex = orderIndex.get(`${a.fromName}::${a.toName}`) ?? Number.POSITIVE_INFINITY;
      const bIndex = orderIndex.get(`${b.fromName}::${b.toName}`) ?? Number.POSITIVE_INFINITY;
      if (aIndex !== bIndex) return aIndex - bIndex;
      return a.fromName.localeCompare(b.fromName) || a.toName.localeCompare(b.toName);
    });

    result.push({ category, segments: sorted });
  }

  return result.sort((a, b) => a.category.localeCompare(b.category));
}
