import type { CheckpointDef, RiderPosition, Route } from "@rtfvis/core";
import { useState } from "react";
import { STATUS_COLORS, STATUS_LABELS } from "../constants.js";
import type { CategorySummary } from "../categorySummary.js";
import type { ConnectionStatus } from "../connectionStatus.js";
import { type PositionFilters } from "../filters.js";
import type { CheckpointPairOccupancy } from "../segmentOccupancy.js";
import { CategorySummaryPanel } from "./CategorySummaryPanel.js";
import { ConnectionStatusBadge } from "./ConnectionStatusBadge.js";
import { SegmentOccupancyPanel } from "./SegmentOccupancyPanel.js";

interface SidebarProps {
  positions: RiderPosition[];
  totalCount: number;
  routes: Route[];
  routesById: Map<string, Route>;
  checkpointPairOccupancy: CheckpointPairOccupancy[];
  categorySummary: CategorySummary[];
  checkpointsById: Map<string, CheckpointDef>;
  filters: PositionFilters;
  onFiltersChange: (filters: PositionFilters) => void;
  selectedStartNumber: string | null;
  onSelectRider: (startNumber: string | null) => void;
  connectionStatus: ConnectionStatus | null;
  connectionFetchError: string | null;
  connectionCheckedAtMs: number;
  onOpenSyncStatus: () => void;
}

export function Sidebar({
  positions,
  totalCount,
  routes,
  routesById,
  checkpointPairOccupancy,
  categorySummary,
  checkpointsById,
  filters,
  onFiltersChange,
  selectedStartNumber,
  onSelectRider,
  connectionStatus,
  connectionFetchError,
  connectionCheckedAtMs,
  onOpenSyncStatus,
}: SidebarProps) {
  const categories = Array.from(new Set(routes.map((r) => r.category))).sort();
  const statuses = Object.keys(STATUS_LABELS) as (keyof typeof STATUS_LABELS)[];

  // <details open> als bloßes JSX-Boolean-Attribut wird von React nicht zuverlässig ins
  // DOM übertragen — deshalb hier explizit als kontrollierte Komponente via State/onToggle.
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [categoriesOpen, setCategoriesOpen] = useState(true);
  const [segmentsOpen, setSegmentsOpen] = useState(true);
  // Auf dem Handy (< 768px, siehe MOBILE_BREAKPOINT in index.css) wird die Sidebar zum
  // Overlay über der Karte statt sie zur Seite zu drängen -- dort startet sie standardmäßig
  // zu, damit man beim ersten Laden direkt die Karte sieht statt eine fast bildschirmfüllende
  // Sidebar. Nur der initiale Wert wird per Breite bestimmt, kein Resize-Listener danach.
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 768);

  if (collapsed) {
    return (
      <aside className="sidebar sidebar-collapsed">
        <button
          className="sidebar-toggle"
          onClick={() => setCollapsed(false)}
          title="Sidebar einblenden"
          aria-label="Sidebar einblenden"
        >
          »
        </button>
      </aside>
    );
  }

  return (
    <>
      {/* Nur auf dem Handy sichtbar (siehe CSS) -- tippen schließt die Sidebar wieder, wie
          bei einem typischen Overlay-Drawer. Auf dem Desktop per display:none inert.
          Bewusst ALS GESCHWISTER vor <aside>, nicht darin verschachtelt: ein z-index
          innerhalb der Sidebar würde sonst eine eigene Stapelreihenfolge aufmachen und den
          eigenen Sidebar-Inhalt (inkl. Zuklapp-Button) überdecken statt nur die Karte. */}
      <div className="sidebar-backdrop" onClick={() => setCollapsed(true)} />
      <aside className="sidebar">
      <div className="sidebar-header">
        <h1 className="sidebar-title">RTFVis</h1>
        <button
          className="sidebar-toggle"
          onClick={() => setCollapsed(true)}
          title="Sidebar ausblenden"
          aria-label="Sidebar ausblenden"
        >
          «
        </button>
      </div>

      <ConnectionStatusBadge
        status={connectionStatus}
        fetchError={connectionFetchError}
        checkedAtMs={connectionCheckedAtMs}
        onOpenSyncStatus={onOpenSyncStatus}
      />

      <details
        className="sidebar-section"
        open={filtersOpen}
        onToggle={(e) => setFiltersOpen(e.currentTarget.open)}
      >
        <summary>Filter</summary>
        <div className="filters">
          <label>
            Kategorie
            <select
              value={filters.category}
              onChange={(e) =>
                onFiltersChange({ ...filters, category: e.target.value as PositionFilters["category"] })
              }
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
            <select value={filters.routeId} onChange={(e) => onFiltersChange({ ...filters, routeId: e.target.value })}>
              <option value="all">Alle</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Status
            <select
              value={filters.status}
              onChange={(e) => onFiltersChange({ ...filters, status: e.target.value as PositionFilters["status"] })}
            >
              <option value="all">Alle</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>

          <label>
            Startnummer
            <input
              type="text"
              placeholder="Suche…"
              value={filters.search}
              onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
            />
          </label>
        </div>
      </details>

      <details
        className="sidebar-section"
        open={categoriesOpen}
        onToggle={(e) => setCategoriesOpen(e.currentTarget.open)}
      >
        <summary>Kategorien</summary>
        <CategorySummaryPanel summary={categorySummary} />
      </details>

      <details
        className="sidebar-section"
        open={segmentsOpen}
        onToggle={(e) => setSegmentsOpen(e.currentTarget.open)}
      >
        <summary>Fahrer je Abschnitt</summary>
        <SegmentOccupancyPanel pairs={checkpointPairOccupancy} routesById={routesById} checkpointsById={checkpointsById} />
      </details>

      <div className="rider-count">
        {positions.length} von {totalCount} Fahrern
      </div>

      <ul className="rider-list">
        {positions.map((p) => (
          <li key={p.startNumber}>
            <button
              className={p.startNumber === selectedStartNumber ? "rider-item selected" : "rider-item"}
              onClick={() => onSelectRider(p.startNumber === selectedStartNumber ? null : p.startNumber)}
            >
              <span className="status-dot" style={{ backgroundColor: STATUS_COLORS[p.status] }} />
              <span className="rider-number">#{p.startNumber}</span>
              <span className="rider-status">{STATUS_LABELS[p.status]}</span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
    </>
  );
}
