import { computePositions } from "@rtfvis/core";
import { useMemo, useState } from "react";
import { computeCategorySummary } from "./categorySummary.js";
import { computeReplayBounds } from "./clock.js";
import { DEFAULT_FILTERS, filterPositions, routeMatchesFilters } from "./filters.js";
import { MapView } from "./map/MapView.js";
import { MapLayerToggles } from "./MapLayerToggles.js";
import { RankingModal } from "./RankingModal.js";
import { SafetyOverviewModal } from "./SafetyOverviewModal.js";
import { computeCheckpointPairOccupancy } from "./segmentOccupancy.js";
import { OrgaPanel } from "./sidebar/OrgaPanel.js";
import { RiderDetail } from "./sidebar/RiderDetail.js";
import { Sidebar } from "./sidebar/Sidebar.js";
import { SyncStatusModal } from "./SyncStatusModal.js";
import { TimelineControl } from "./TimelineControl.js";
import { useClock } from "./useClock.js";
import { useConnectionStatus } from "./useConnectionStatus.js";
import { useRaceLiveData, useRaceStaticData } from "./useRaceData.js";

const LIVE_POLL_INTERVAL_MS = 15_000;
const STATUS_POLL_INTERVAL_MS = 10_000;

export function App() {
  const { routes, checkpoints, loading: staticLoading, error: staticError } = useRaceStaticData();
  const { roster, scans, loading: liveLoading, error: liveError } = useRaceLiveData(LIVE_POLL_INTERVAL_MS);
  const connection = useConnectionStatus(STATUS_POLL_INTERVAL_MS);

  const replayBounds = useMemo(() => computeReplayBounds(scans, Date.now()), [scans]);
  const clock = useClock(replayBounds);

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [selectedStartNumber, setSelectedStartNumber] = useState<string | null>(null);
  const [safetyOverviewOpen, setSafetyOverviewOpen] = useState(false);
  const [rankingOpen, setRankingOpen] = useState(false);
  const [syncStatusOpen, setSyncStatusOpen] = useState(false);
  const [showRiders, setShowRiders] = useState(true);
  const [showSegments, setShowSegments] = useState(true);

  const positions = useMemo(
    () => computePositions(scans, routes, roster, clock.nowMs),
    [scans, routes, roster, clock.nowMs],
  );
  const routeById = useMemo(() => new Map(routes.map((r) => [r.id, r])), [routes]);
  const filteredPositions = useMemo(
    () => filterPositions(positions, filters, routeById),
    [positions, filters, routeById],
  );
  const checkpointsById = useMemo(() => new Map(checkpoints.map((c) => [c.id, c])), [checkpoints]);

  // Sternfahrt-Varianten (siehe @rtfvis/core preprocess/sternfahrt.ts) sind für
  // computePositions/die Kartenmarker wichtig, sollen aber in der Streckenauswahl und
  // im Segment-Panel nicht als eigene, verwirrende Zusatzstrecken auftauchen.
  const displayRoutes = useMemo(() => routes.filter((r) => !r.baseRouteId), [routes]);

  // Abschnittszählung und Kategorien-Übersicht zeigen IMMER das gesamte Feld, unabhängig
  // von den Sidebar-Filtern (wie das Orga-Panel) — sonst würden z.B. bei Kategorie-Filter
  // "RTF" alle CTF-/Jedermann-Zähler auf 0 stehen, was wie ein Defekt statt einer aktiven
  // Filterung aussieht.
  // Nutzt bewusst die VOLLE Streckenliste (inkl. Sternfahrt-Varianten): der Abschnitt
  // "letzter Checkpoint -> START" auf dem Rückweg existiert nur auf der Variante.
  const checkpointPairOccupancy = useMemo(
    () => computeCheckpointPairOccupancy(positions, routes),
    [positions, routes],
  );
  const categories = useMemo(() => Array.from(new Set(displayRoutes.map((r) => r.category))).sort(), [displayRoutes]);
  const categorySummary = useMemo(() => computeCategorySummary(positions, categories), [positions, categories]);

  // Streckendarstellung und Segmentauslastungsmarker auf der KARTE folgen (anders als die
  // immer vollständige Sidebar-Übersicht) den Kategorie-/Strecken-Filtern — inklusive einer
  // eventuell zur ausgewählten Strecke gehörenden Sternfahrt-Variante, damit deren Segmente
  // sichtbar bleiben.
  const mapRoutes = useMemo(
    () => routes.filter((r) => routeMatchesFilters(r, filters)),
    [routes, filters.category, filters.routeId],
  );
  const mapCheckpointPairOccupancy = useMemo(
    () => computeCheckpointPairOccupancy(positions, mapRoutes),
    [positions, mapRoutes],
  );

  const selectedPosition = selectedStartNumber
    ? positions.find((p) => p.startNumber === selectedStartNumber)
    : undefined;
  const selectedRoute = selectedPosition?.routeId ? routeById.get(selectedPosition.routeId) : undefined;

  const loading = staticLoading || liveLoading;
  const error = staticError ?? liveError;

  return (
    <div className="app">
      <Sidebar
        positions={filteredPositions}
        totalCount={positions.length}
        routes={displayRoutes}
        routesById={routeById}
        checkpointPairOccupancy={checkpointPairOccupancy}
        categorySummary={categorySummary}
        checkpointsById={checkpointsById}
        filters={filters}
        onFiltersChange={setFilters}
        selectedStartNumber={selectedStartNumber}
        onSelectRider={setSelectedStartNumber}
        connectionStatus={connection.status}
        connectionFetchError={connection.fetchError}
        connectionCheckedAtMs={connection.checkedAtMs}
        onOpenSyncStatus={() => setSyncStatusOpen(true)}
      />
      <div className="map-area">
        <TimelineControl
          mode={clock.mode}
          onModeChange={clock.setMode}
          nowMs={clock.nowMs}
          replayMinMs={clock.replayMinMs}
          replayMaxMs={clock.replayMaxMs}
          onReplayTimeChange={clock.setReplayTimeMs}
          isPlaying={clock.isPlaying}
          onPlayingChange={clock.setIsPlaying}
          speedMultiplier={clock.speedMultiplier}
          onSpeedChange={clock.setSpeedMultiplier}
        />

        {loading && <div className="status-banner">Lade Daten…</div>}
        {error && <div className="status-banner error">Fehler: {error}</div>}

        <MapView
          routes={mapRoutes}
          checkpoints={checkpoints}
          positions={filteredPositions}
          checkpointPairOccupancy={mapCheckpointPairOccupancy}
          selectedStartNumber={selectedStartNumber}
          onSelectRider={setSelectedStartNumber}
          showRiders={showRiders}
          showSegments={showSegments}
        />

        <MapLayerToggles
          showRiders={showRiders}
          onToggleRiders={() => setShowRiders((v) => !v)}
          showSegments={showSegments}
          onToggleSegments={() => setShowSegments((v) => !v)}
        />

        <OrgaPanel positions={positions} onOpen={() => setSafetyOverviewOpen(true)} />

        <button className="ranking-panel-button" onClick={() => setRankingOpen(true)}>
          Rangliste
        </button>

        {rankingOpen && (
          <RankingModal
            roster={roster}
            scans={scans}
            routes={routes}
            nowMs={clock.nowMs}
            selectedStartNumber={selectedStartNumber}
            onSelectRider={setSelectedStartNumber}
            onClose={() => setRankingOpen(false)}
          />
        )}

        {safetyOverviewOpen && (
          <SafetyOverviewModal
            positions={positions}
            routes={displayRoutes}
            routeById={routeById}
            checkpointsById={checkpointsById}
            scans={scans}
            nowMs={clock.nowMs}
            selectedStartNumber={selectedStartNumber}
            onSelectRider={setSelectedStartNumber}
            onClose={() => setSafetyOverviewOpen(false)}
          />
        )}

        {syncStatusOpen && (
          <SyncStatusModal
            scans={scans}
            checkpointsById={checkpointsById}
            nowMs={clock.nowMs}
            onClose={() => setSyncStatusOpen(false)}
          />
        )}

        {selectedPosition && (
          <RiderDetail
            position={selectedPosition}
            route={selectedRoute}
            scans={scans}
            checkpointsById={checkpointsById}
            onClose={() => setSelectedStartNumber(null)}
          />
        )}
      </div>
    </div>
  );
}
