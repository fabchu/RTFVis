import type { Category, CheckpointDef, RiderPosition, Route, ScanRecord } from "@rtfvis/core";
import { useMemo, useState } from "react";
import { STATUS_COLORS, STATUS_LABELS } from "./constants.js";
import { formatDurationMs, formatTime } from "./format.js";
import { computeSafetyOverview, type SafetyRow } from "./safety.js";

interface SafetyOverviewModalProps {
  positions: RiderPosition[];
  /** Bereits ignorierte Fahrer (siehe useIgnoredRiders) -- eigene Mini-Liste am Ende mit Zurückholen-Möglichkeit. */
  ignoredPositions: RiderPosition[];
  onIgnoreRider: (startNumber: string) => void;
  onUnignoreRider: (startNumber: string) => void;
  routes: Route[];
  routeById: Map<string, Route>;
  checkpointsById: Map<string, CheckpointDef>;
  scans: ScanRecord[];
  nowMs: number;
  selectedStartNumber: string | null;
  onSelectRider: (startNumber: string | null) => void;
  onClose: () => void;
}

type SortDirection = "asc" | "desc";
interface SortState {
  key: string;
  direction: SortDirection;
}

interface Column {
  key: string;
  label: string;
  /** null/undefined bedeutet "nicht sortierbar". */
  getSortValue?: (row: SafetyRow, route: Route | undefined) => string | number | null;
  render: (row: SafetyRow, route: Route | undefined) => React.ReactNode;
}

function routeLabel(position: RiderPosition, route: Route | undefined): string {
  if (route) return route.name;
  if (position.candidateRouteIds.length > 0) return `Unklar: ${position.candidateRouteIds.join(", ")}`;
  return "—";
}

function latenessCell(row: SafetyRow) {
  if (row.latenessMs === null) return <span className="safety-lateness-hint">—</span>;
  if (row.latenessMs >= 0) {
    return <span className="safety-lateness-overdue">+{formatDurationMs(row.latenessMs)}</span>;
  }
  return <span className="safety-lateness-ok">noch {formatDurationMs(-row.latenessMs)}</span>;
}

const COLUMNS: Column[] = [
  {
    key: "status",
    label: "Status",
    getSortValue: (row) => STATUS_LABELS[row.position.status],
    render: (row) => (
      <span className="safety-status-cell">
        <span className="status-dot" style={{ backgroundColor: STATUS_COLORS[row.position.status] }} />
        {STATUS_LABELS[row.position.status]}
      </span>
    ),
  },
  {
    key: "startNumber",
    label: "Nr.",
    getSortValue: (row) => Number.parseInt(row.position.startNumber, 10) || row.position.startNumber,
    render: (row) => <span className="rider-number">#{row.position.startNumber}</span>,
  },
  {
    key: "category",
    label: "Kategorie",
    getSortValue: (row) => row.position.category,
    render: (row) => row.position.category ?? "—",
  },
  {
    key: "route",
    label: "Strecke",
    getSortValue: (row, route) => routeLabel(row.position, route),
    render: (row, route) => routeLabel(row.position, route),
  },
  {
    key: "startedAt",
    label: "Gestartet um",
    getSortValue: (row) => row.startedAtMs,
    render: (row) => (row.startedAtMs !== null ? formatTime(row.startedAtMs) : "—"),
  },
  {
    key: "sternfahrer",
    label: "Sternfahrer",
    getSortValue: (row) => (row.isSternfahrer === null ? null : row.isSternfahrer ? 1 : 0),
    render: (row) => (row.isSternfahrer === null ? "—" : row.isSternfahrer ? "Ja" : "Nein"),
  },
  {
    key: "lastCheckpoint",
    label: "Zuletzt bei",
    getSortValue: (row) => row.lastCheckpointName,
    render: (row) => row.lastCheckpointName ?? "—",
  },
  {
    key: "lastCheckpointTime",
    label: "Zuletzt um",
    getSortValue: (row) => (row.position.lastCheckpointTimeUtc ? Date.parse(row.position.lastCheckpointTimeUtc) : null),
    render: (row) => (row.position.lastCheckpointTimeUtc ? formatTime(Date.parse(row.position.lastCheckpointTimeUtc)) : "—"),
  },
  {
    key: "nextCheckpoint",
    label: "Nächster Checkpoint",
    getSortValue: (row) => row.nextCheckpointName,
    render: (row) => row.nextCheckpointName ?? (row.position.status === "finished" ? "Ziel erreicht" : "—"),
  },
  {
    key: "expectedArrival",
    label: "Erwartet um",
    getSortValue: (row) => row.expectedNextArrivalMs,
    render: (row) => (row.expectedNextArrivalMs !== null ? formatTime(row.expectedNextArrivalMs) : "—"),
  },
  {
    key: "lateness",
    label: "Verspätung",
    getSortValue: (row) => row.latenessMs,
    render: (row) => latenessCell(row),
  },
];

function compareValues(a: string | number | null | undefined, b: string | number | null | undefined): number {
  if ((a === null || a === undefined) && (b === null || b === undefined)) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

/**
 * Zentrale Sicherheitsübersicht: IMMER das gesamte Feld (Filter hier sind rein lokal für
 * diese Ansicht, unabhängig von den Sidebar-Filtern). Standardmäßig nach Dringlichkeit
 * sortiert (siehe computeSafetyOverview) — Spaltenklick sortiert stattdessen nach dieser
 * Spalte (auf/ab/zurück zur Standardsortierung).
 */
export function SafetyOverviewModal({
  positions,
  ignoredPositions,
  onIgnoreRider,
  onUnignoreRider,
  routes,
  routeById,
  checkpointsById,
  scans,
  nowMs,
  selectedStartNumber,
  onSelectRider,
  onClose,
}: SafetyOverviewModalProps) {
  const [category, setCategory] = useState<Category | "all">("all");
  const [routeId, setRouteId] = useState<string | "all">("all");
  const [sort, setSort] = useState<SortState | null>(null);
  // Standardmäßig eingeklappt: die Haupttabelle (die eigentlich relevanten Fahrer) soll nicht
  // mit wachsender Ignoriert-Liste immer weniger Platz bekommen -- siehe Diskussion, die zu
  // dieser Sektion geführt hat.
  const [ignoredSectionOpen, setIgnoredSectionOpen] = useState(false);

  const categories = useMemo(() => Array.from(new Set(routes.map((r) => r.category))).sort(), [routes]);
  const routesInCategory = useMemo(
    () => (category === "all" ? routes : routes.filter((r) => r.category === category)),
    [routes, category],
  );

  const allRows = useMemo(
    () => computeSafetyOverview(positions, checkpointsById, scans, nowMs),
    [positions, checkpointsById, scans, nowMs],
  );
  const ignoredRows = useMemo(
    () => computeSafetyOverview(ignoredPositions, checkpointsById, scans, nowMs),
    [ignoredPositions, checkpointsById, scans, nowMs],
  );

  const filteredRows = useMemo(
    () =>
      allRows.filter((row) => {
        if (category !== "all" && row.position.category !== category) return false;
        if (routeId !== "all") {
          const effectiveRouteId = row.position.routeId ? (routeById.get(row.position.routeId)?.baseRouteId ?? row.position.routeId) : null;
          const effectiveCandidates = row.position.candidateRouteIds.map((id) => routeById.get(id)?.baseRouteId ?? id);
          if (effectiveRouteId !== routeId && !effectiveCandidates.includes(routeId)) return false;
        }
        return true;
      }),
    [allRows, category, routeId, routeById],
  );

  const rows = useMemo(() => {
    if (!sort) return filteredRows;
    const column = COLUMNS.find((c) => c.key === sort.key);
    if (!column?.getSortValue) return filteredRows;
    const routeForRow = (row: SafetyRow) => (row.position.routeId ? routeById.get(row.position.routeId) : undefined);
    const sorted = filteredRows
      .slice()
      .sort((a, b) => compareValues(column.getSortValue!(a, routeForRow(a)), column.getSortValue!(b, routeForRow(b))));
    return sort.direction === "asc" ? sorted : sorted.reverse();
  }, [filteredRows, sort, routeById]);

  function handleHeaderClick(column: Column) {
    if (!column.getSortValue) return;
    setSort((prev) => {
      if (!prev || prev.key !== column.key) return { key: column.key, direction: "asc" };
      if (prev.direction === "asc") return { key: column.key, direction: "desc" };
      return null;
    });
  }

  return (
    <div className="safety-modal-backdrop" onClick={onClose}>
      <div className="safety-modal" onClick={(e) => e.stopPropagation()}>
        <div className="safety-modal-header">
          <h2>Sicherheitsübersicht</h2>
          <button className="close-button" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </div>

        <div className="safety-modal-filters">
          <label>
            Kategorie
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value as Category | "all");
                setRouteId("all");
              }}
            >
              <option value="all">Alle</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            Strecke
            <select value={routeId} onChange={(e) => setRouteId(e.target.value)}>
              <option value="all">Alle</option>
              {routesInCategory.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <span className="safety-modal-count">
            {rows.length} von {positions.length} Fahrern
          </span>
        </div>

        <div className="safety-table-wrap">
          <table className="safety-table">
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className={col.getSortValue ? "safety-th-sortable" : undefined}
                    onClick={() => handleHeaderClick(col)}
                  >
                    {col.label}
                    {sort?.key === col.key && <span className="safety-sort-indicator">{sort.direction === "asc" ? " ▲" : " ▼"}</span>}
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const route = row.position.routeId ? routeById.get(row.position.routeId) : undefined;
                return (
                  <tr
                    key={row.position.startNumber}
                    className={row.position.startNumber === selectedStartNumber ? "safety-row selected" : "safety-row"}
                    onClick={() => {
                      onSelectRider(row.position.startNumber);
                      onClose();
                    }}
                  >
                    {COLUMNS.map((col) => (
                      <td key={col.key}>{col.render(row, route)}</td>
                    ))}
                    <td>
                      <button
                        className="safety-ignore-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onIgnoreRider(row.position.startNumber);
                        }}
                      >
                        Ignorieren
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <p className="empty-hint">Keine Fahrer für diese Filterauswahl.</p>}
        </div>

        {ignoredRows.length > 0 && (
          <div className="safety-ignored-section">
            <button
              className="safety-ignored-header"
              onClick={() => setIgnoredSectionOpen((v) => !v)}
              aria-expanded={ignoredSectionOpen}
            >
              <h3>Ignorierte Fahrer ({ignoredRows.length})</h3>
              <span className="safety-sort-indicator">{ignoredSectionOpen ? "▲" : "▼"}</span>
            </button>
            {ignoredSectionOpen && (
              <ul className="safety-ignored-list">
                {ignoredRows.map((row) => (
                  <li key={row.position.startNumber}>
                    <span className="rider-number">#{row.position.startNumber}</span>
                    <span className="safety-ignored-detail">
                      {row.position.category ?? "—"} · zuletzt bei {row.lastCheckpointName ?? "—"}
                    </span>
                    <button
                      className="safety-unignore-button"
                      onClick={() => onUnignoreRider(row.position.startNumber)}
                    >
                      Zurückholen
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
