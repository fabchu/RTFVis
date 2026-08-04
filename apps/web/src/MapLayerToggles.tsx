interface MapLayerTogglesProps {
  showRiders: boolean;
  onToggleRiders: () => void;
  showSegments: boolean;
  onToggleSegments: () => void;
  clusteringEnabled: boolean;
  onToggleClustering: () => void;
}

/** Overlay über der Karte: schaltet die Fahrer-, Segmentauslastungs- und Clustering-Marker ein/aus. */
export function MapLayerToggles({
  showRiders,
  onToggleRiders,
  showSegments,
  onToggleSegments,
  clusteringEnabled,
  onToggleClustering,
}: MapLayerTogglesProps) {
  return (
    <div className="map-layer-toggles">
      <button
        className={showRiders ? "map-layer-toggle active" : "map-layer-toggle"}
        onClick={onToggleRiders}
        aria-pressed={showRiders}
      >
        Fahrer
      </button>
      <button
        className={showSegments ? "map-layer-toggle active" : "map-layer-toggle"}
        onClick={onToggleSegments}
        aria-pressed={showSegments}
      >
        Segmentauslastung
      </button>
      <button
        className={clusteringEnabled ? "map-layer-toggle active" : "map-layer-toggle"}
        onClick={onToggleClustering}
        aria-pressed={clusteringEnabled}
      >
        Clustering
      </button>
    </div>
  );
}
