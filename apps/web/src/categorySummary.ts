import type { Category, RiderPosition } from "@rtfvis/core";

export interface CategorySummary {
  category: Category;
  /** Fahrer mit mindestens einem Scan (Status ungleich "notStarted"). */
  startedCount: number;
  /** Davon aktuell noch auf der Strecke (onCourse oder overdue). */
  onCourseCount: number;
}

/**
 * Fasst pro Kategorie zusammen, wie viele Fahrer bereits losgefahren sind und wie viele
 * davon aktuell noch unterwegs sind. Bekommt die Kategorienliste explizit übergeben, damit
 * auch Kategorien ohne gestartete Fahrer mit 0 auftauchen (wie bei der Segmentauslastung).
 */
export function computeCategorySummary(positions: RiderPosition[], categories: Category[]): CategorySummary[] {
  const counts = new Map<Category, { started: number; onCourse: number }>();
  for (const category of categories) counts.set(category, { started: 0, onCourse: 0 });

  for (const position of positions) {
    const entry = position.category !== null ? counts.get(position.category) : undefined;
    if (!entry) continue;
    if (position.status === "notStarted") continue;
    entry.started++;
    if (position.status === "onCourse" || position.status === "overdue") entry.onCourse++;
  }

  return categories.map((category) => ({
    category,
    startedCount: counts.get(category)!.started,
    onCourseCount: counts.get(category)!.onCourse,
  }));
}
