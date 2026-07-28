interface MapLayerTogglesProps {
  showRiders: boolean;
  onToggleRiders: () => void;
  showSegments: boolean;
  onToggleSegments: () => void;
}

/** Overlay über der Karte: schaltet die Fahrer- bzw. Segmentauslastungs-Marker ein/aus. */
export function MapLayerToggles({ showRiders, onToggleRiders, showSegments, onToggleSegments }: MapLayerTogglesProps) {
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
    </div>
  );
}
