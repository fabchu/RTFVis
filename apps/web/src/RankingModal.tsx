import type { Route, RosterEntry, ScanRecord } from "@rtfvis/core";
import { Fragment, useMemo, useState } from "react";
import { formatDurationMs } from "./format.js";
import { computeRanking, type RankingRow, type RouteAssignmentMode } from "./ranking.js";

const TOP_N_DEFAULT = 3;
const MEDALS = ["🥇", "🥈", "🥉"];

interface RankingModalProps {
  roster: RosterEntry[];
  scans: ScanRecord[];
  routes: Route[];
  nowMs: number;
  selectedStartNumber: string | null;
  onSelectRider: (startNumber: string | null) => void;
  onClose: () => void;
}

interface RankingSection {
  route: Route;
  rows: RankingRow[];
}

function rankLabel(rank: number): string {
  return MEDALS[rank - 1] ?? `${rank}.`;
}

/**
 * Rangliste je Strecke. Ohne Streckenfilter: die besten drei Finisher JEDER Strecke
 * (gruppiert). Mit Streckenfilter: die vollständige Liste dieser Strecke. Eine gefundene
 * Startnummer wählt automatisch deren Strecke als Filter, damit die (ggf. nicht in den
 * Top 3 liegende) Zeile sichtbar wird.
 */
export function RankingModal({ roster, scans, routes, nowMs, selectedStartNumber, onSelectRider, onClose }: RankingModalProps) {
  const [mode, setMode] = useState<RouteAssignmentMode>("registered");
  const [routeId, setRouteId] = useState<string | "all">("all");
  const [search, setSearch] = useState("");

  const realRoutes = useMemo(
    () => routes.filter((r) => !r.baseRouteId).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)),
    [routes],
  );

  const grouped = useMemo(() => computeRanking(roster, scans, routes, nowMs, mode), [roster, scans, routes, nowMs, mode]);

  function handleSearchChange(value: string) {
    setSearch(value);
    const trimmed = value.trim();
    if (!trimmed) return;
    for (const rows of grouped.values()) {
      const match = rows.find((row) => row.startNumber === trimmed);
      if (match) {
        setRouteId(match.routeId);
        return;
      }
    }
  }

  // Bei "Alle": eine Sektion (mit Streckennamen als Trennzeile) je Strecke mit
  // mindestens einem Finisher. Bei Streckenfilter: eine einzelne Sektion ohne
  // Trennzeile (siehe Rendering unten) -- die Auswahl im Dropdown sagt bereits, welche.
  const sections: RankingSection[] = useMemo(() => {
    if (routeId !== "all") {
      const route = realRoutes.find((r) => r.id === routeId);
      if (!route) return [];
      return [{ route, rows: grouped.get(routeId) ?? [] }];
    }
    return realRoutes
      .map((route) => ({ route, rows: (grouped.get(route.id) ?? []).slice(0, TOP_N_DEFAULT) }))
      .filter((section) => section.rows.length > 0);
  }, [grouped, routeId, realRoutes]);

  const totalRows = sections.reduce((sum, s) => sum + s.rows.length, 0);

  return (
    <div className="safety-modal-backdrop" onClick={onClose}>
      <div className="safety-modal" onClick={(e) => e.stopPropagation()}>
        <div className="safety-modal-header">
          <h2>Rangliste</h2>
          <button className="close-button" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </div>

        <div className="safety-modal-filters">
          <label>
            Streckenzuordnung
            <span className="timeline-mode-toggle ranking-mode-toggle">
              <button className={mode === "registered" ? "active" : undefined} onClick={() => setMode("registered")}>
                Anmeldung
              </button>
              <button className={mode === "scans" ? "active" : undefined} onClick={() => setMode("scans")}>
                Scans
              </button>
            </span>
          </label>
          <label>
            Strecke
            <select value={routeId} onChange={(e) => setRouteId(e.target.value)}>
              <option value="all">Alle (Top 3)</option>
              {realRoutes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Startnummer
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="suchen…"
              className="ranking-search-input"
            />
          </label>
        </div>

        <div className="safety-table-wrap">
          <table className="safety-table">
            <thead>
              <tr>
                <th>Platz</th>
                <th>Nr.</th>
                <th>Kategorie</th>
                <th>Zeit</th>
                <th title="Anmeldung und Scans deuten auf unterschiedliche Strecken hin">⚠</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((section) => (
                <Fragment key={section.route.id}>
                  {sections.length > 1 && (
                    <tr key={`${section.route.id}-header`} className="ranking-section-header">
                      <td colSpan={5}>{section.route.name}</td>
                    </tr>
                  )}
                  {section.rows.map((row) => (
                    <tr
                      key={row.startNumber}
                      className={
                        row.startNumber === selectedStartNumber || row.startNumber === search.trim()
                          ? "safety-row selected"
                          : "safety-row"
                      }
                      onClick={() => {
                        onSelectRider(row.startNumber);
                        onClose();
                      }}
                    >
                      <td>{rankLabel(row.rank)}</td>
                      <td className="rider-number">#{row.startNumber}</td>
                      <td>{row.category}</td>
                      <td>{formatDurationMs(row.finishDurationMs)}</td>
                      <td>
                        {row.routeMismatch && (
                          <span className="ranking-warning-icon" title="Scans passen nicht zur Anmeldung">
                            ⚠
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
          {totalRows === 0 && <p className="empty-hint">Noch keine Finisher für diese Auswahl.</p>}
        </div>
      </div>
    </div>
  );
}
