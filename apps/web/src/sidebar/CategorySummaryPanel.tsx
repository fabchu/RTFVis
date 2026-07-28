import type { CategorySummary } from "../categorySummary.js";

interface CategorySummaryPanelProps {
  summary: CategorySummary[];
}

export function CategorySummaryPanel({ summary }: CategorySummaryPanelProps) {
  if (summary.length === 0) return <p className="segment-occupancy-hint">Keine Kategorien geladen.</p>;

  return (
    <table className="category-summary">
      <thead>
        <tr>
          <th>Kategorie</th>
          <th>Losgefahren</th>
          <th>Unterwegs</th>
        </tr>
      </thead>
      <tbody>
        {summary.map((row) => (
          <tr key={row.category}>
            <td>{row.category}</td>
            <td>{row.startedCount}</td>
            <td>{row.onCourseCount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
