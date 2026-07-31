import type { CheckpointDef, RiderPosition, Route } from "@rtfvis/core";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef } from "react";
import { CATEGORY_COLORS, STATUS_COLORS } from "../constants.js";
import { checkpointPairOccupancyToGeoJSON, checkpointsToGeoJSON, ridersToGeoJSON, routesToGeoJSON } from "../geojson.js";
import type { CheckpointPairOccupancy } from "../segmentOccupancy.js";

const ROUTES_SOURCE = "routes";
const RIDERS_SOURCE = "riders";
const CHECKPOINTS_SOURCE = "checkpoints";
const SEGMENT_OCCUPANCY_SOURCE = "segment-occupancy";

const MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  // Nötig, damit die "symbol"-Layer (Checkpoint-Namen, Cluster-Zahlen) überhaupt Text
  // rendern — ohne "glyphs" lehnt MapLibre jeden Layer mit "text-field" komplett ab.
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    osm: {
      type: "raster",
      tiles: ["/tiles/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

interface MapViewProps {
  routes: Route[];
  checkpoints: CheckpointDef[];
  positions: RiderPosition[];
  checkpointPairOccupancy: CheckpointPairOccupancy[];
  selectedStartNumber: string | null;
  onSelectRider: (startNumber: string | null) => void;
  showRiders: boolean;
  showSegments: boolean;
}

/**
 * Setzt die Daten einer GeoJSON-Source, sobald sie existiert. Prüft bewusst die Existenz der
 * Source selbst statt map.isStyleLoaded(): Letzteres kann nach dem initialen Laden jederzeit
 * kurzzeitig wieder false werden (z.B. während eine ANDERE Source gerade neu gekachelt wird),
 * und map.once("load", ...) würde dann nie mehr feuern — das "load"-Ereignis passiert nur
 * einmal im gesamten Kartenleben. Die Source-Existenz dagegen ist stabil: Sie wird einmalig im
 * "load"-Handler angelegt und danach nie wieder entfernt.
 */
function setSourceDataWhenReady(
  map: maplibregl.Map,
  sourceId: string,
  data: GeoJSON.FeatureCollection<GeoJSON.Geometry>,
): void {
  const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
  if (source) {
    source.setData(data);
  } else {
    map.once("load", () => {
      (map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined)?.setData(data);
    });
  }
}

/**
 * Setzt die Sichtbarkeit einer Gruppe von Layern, sobald sie existieren — analog zu
 * setSourceDataWhenReady und aus demselben Grund über die Layer-Existenz statt
 * map.isStyleLoaded() gesteuert.
 */
function setLayerVisibilityWhenReady(map: maplibregl.Map, layerIds: string[], visible: boolean): void {
  const visibility = visible ? "visible" : "none";
  const apply = () => {
    for (const id of layerIds) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visibility);
    }
  };
  if (layerIds.every((id) => map.getLayer(id))) {
    apply();
  } else {
    map.once("load", apply);
  }
}

export function MapView({
  routes,
  checkpoints,
  positions,
  checkpointPairOccupancy,
  selectedStartNumber,
  onSelectRider,
  showRiders,
  showSegments,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const hasFitBoundsRef = useRef(false);
  const onSelectRiderRef = useRef(onSelectRider);
  onSelectRiderRef.current = onSelectRider;
  const routesById = useMemo(() => new Map(routes.map((r) => [r.id, r])), [routes]);
  const checkpointsById = useMemo(() => new Map(checkpoints.map((c) => [c.id, c])), [checkpoints]);
  // Sternfahrt-Varianten (siehe @rtfvis/core preprocess/sternfahrt.ts) sind geometrisch
  // identisch mit ihrer Basisstrecke (nur doppelt "abgewickelt") — als eigene Linie
  // gezeichnet würden sie nur eine überflüssige Überlagerung erzeugen.
  const lineRoutes = useMemo(() => routes.filter((r) => !r.baseRouteId), [routes]);

  // Karte einmalig aufbauen — Layer/Sourcen werden separat per setData aktualisiert,
  // damit die Karteninstanz nicht bei jedem Datenupdate neu erzeugt wird.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [8.6, 49.8],
      zoom: 10,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", () => {
      map.addSource(ROUTES_SOURCE, { type: "geojson", data: routesToGeoJSON([]) });
      map.addLayer({
        id: "routes-line",
        type: "line",
        source: ROUTES_SOURCE,
        paint: {
          "line-color": [
            "match",
            ["get", "category"],
            "RTF",
            CATEGORY_COLORS.RTF,
            "CTF",
            CATEGORY_COLORS.CTF,
            "Jedermann",
            CATEGORY_COLORS.Jedermann,
            "#888888",
          ],
          "line-width": 3,
          "line-opacity": 0.7,
        },
      });

      map.addSource(CHECKPOINTS_SOURCE, { type: "geojson", data: checkpointsToGeoJSON([]) });
      map.addLayer({
        id: "checkpoints-circle",
        type: "circle",
        source: CHECKPOINTS_SOURCE,
        paint: {
          "circle-radius": 5,
          "circle-color": "#ffffff",
          "circle-stroke-color": "#374151",
          "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: "checkpoints-label",
        type: "symbol",
        source: CHECKPOINTS_SOURCE,
        layout: {
          "text-field": ["get", "name"],
          "text-size": 11,
          "text-offset": [0, 1.2],
          "text-anchor": "top",
        },
        paint: { "text-halo-color": "#ffffff", "text-halo-width": 1 },
      });

      // Marker für die Fahrerauslastung je Streckenabschnitt — separat von den
      // Fahrer-Punkten, damit beides gleichzeitig sichtbar bleibt (kein Ersatz füreinander).
      map.addSource(SEGMENT_OCCUPANCY_SOURCE, {
        type: "geojson",
        data: checkpointPairOccupancyToGeoJSON([], routesById, checkpointsById),
      });
      map.addLayer({
        id: "segment-occupancy-circle",
        type: "circle",
        source: SEGMENT_OCCUPANCY_SOURCE,
        paint: {
          "circle-radius": 11,
          // Lila = mind. ein eindeutig bestätigter Fahrer unterwegs. Gelb = niemand eindeutig
          // bestätigt, aber mind. ein Fahrer mit unklarer Streckenzuordnung könnte theoretisch
          // noch kommen (siehe unclearCount in segmentOccupancy.ts) -- bewusst NICHT grau wie
          // "sicher niemand mehr", sonst würde ein Streckenposten das fälschlich als "alles
          // klar, kann abbauen" lesen.
          "circle-color": [
            "case",
            [">", ["get", "riderCount"], 0],
            "#7c3aed",
            [">", ["get", "unclearCount"], 0],
            "#f59e0b",
            "#d1d5db",
          ],
          "circle-opacity": 0.9,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
        },
      });
      map.addLayer({
        id: "segment-occupancy-label",
        type: "symbol",
        source: SEGMENT_OCCUPANCY_SOURCE,
        layout: {
          "text-field": [
            "case",
            [">", ["get", "unclearCount"], 0],
            ["concat", ["to-string", ["get", "riderCount"]], "+", ["to-string", ["get", "unclearCount"]]],
            ["to-string", ["get", "riderCount"]],
          ],
          "text-size": 11,
        },
        paint: { "text-color": "#ffffff" },
      });

      map.addSource(RIDERS_SOURCE, {
        type: "geojson",
        data: ridersToGeoJSON([]),
        cluster: true,
        clusterRadius: 50,
        clusterMaxZoom: 14,
      });
      map.addLayer({
        id: "riders-cluster",
        type: "circle",
        source: RIDERS_SOURCE,
        filter: ["has", "point_count"],
        paint: {
          "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 50, 26],
          "circle-color": "#2563eb",
          "circle-opacity": 0.85,
        },
      });
      map.addLayer({
        id: "riders-cluster-count",
        type: "symbol",
        source: RIDERS_SOURCE,
        filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12 },
        paint: { "text-color": "#ffffff" },
      });
      map.addLayer({
        id: "riders-point",
        type: "circle",
        source: RIDERS_SOURCE,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": 7,
          "circle-color": [
            "match",
            ["get", "status"],
            "notStarted",
            STATUS_COLORS.notStarted,
            "onCourse",
            STATUS_COLORS.onCourse,
            "overdue",
            STATUS_COLORS.overdue,
            "finished",
            STATUS_COLORS.finished,
            "routeConflict",
            STATUS_COLORS.routeConflict,
            "ambiguousRoute",
            STATUS_COLORS.ambiguousRoute,
            "#000000",
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
        },
      });

      map.on("click", "riders-point", (e) => {
        const feature = e.features?.[0];
        const startNumber = feature?.properties?.startNumber;
        if (startNumber) onSelectRiderRef.current(startNumber);
      });
      map.on("click", "riders-cluster", (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const clusterId = feature.properties?.cluster_id;
        const source = map.getSource(RIDERS_SOURCE) as maplibregl.GeoJSONSource;
        source
          .getClusterExpansionZoom(clusterId)
          .then((zoom) => {
            map.easeTo({ center: (feature.geometry as GeoJSON.Point).coordinates as [number, number], zoom });
          })
          .catch(() => {
            // Zoomstufe konnte nicht ermittelt werden -> Klick einfach ignorieren.
          });
      });
      for (const layer of ["riders-point", "riders-cluster"]) {
        map.on("mouseenter", layer, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layer, () => {
          map.getCanvas().style.cursor = "";
        });
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setSourceDataWhenReady(map, ROUTES_SOURCE, routesToGeoJSON(lineRoutes));

    if (!hasFitBoundsRef.current && lineRoutes.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      for (const route of lineRoutes) {
        for (const [lon, lat] of route.geometry) bounds.extend([lon, lat]);
      }
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 40, duration: 0 });
        hasFitBoundsRef.current = true;
      }
    }
  }, [lineRoutes]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setSourceDataWhenReady(map, CHECKPOINTS_SOURCE, checkpointsToGeoJSON(checkpoints));
  }, [checkpoints]);

  // Fahrer im Ziel bleiben in der Sidebar-Liste auswählbar, sollen aber nicht dauerhaft als
  // Marker auf der Karte liegen bleiben — sonst würde die Karte im Lauf des Renntages
  // zunehmend mit "erledigten" Punkten zugestellt.
  const mapPositions = useMemo(() => positions.filter((p) => p.status !== "finished"), [positions]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setSourceDataWhenReady(map, RIDERS_SOURCE, ridersToGeoJSON(mapPositions));
  }, [mapPositions]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setSourceDataWhenReady(
      map,
      SEGMENT_OCCUPANCY_SOURCE,
      checkpointPairOccupancyToGeoJSON(checkpointPairOccupancy, routesById, checkpointsById),
    );
  }, [checkpointPairOccupancy, routesById, checkpointsById]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setLayerVisibilityWhenReady(map, ["riders-point", "riders-cluster", "riders-cluster-count"], showRiders);
  }, [showRiders]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setLayerVisibilityWhenReady(map, ["segment-occupancy-circle", "segment-occupancy-label"], showSegments);
  }, [showSegments]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedStartNumber) return;
    const rider = positions.find((p) => p.startNumber === selectedStartNumber);
    if (rider?.position) {
      map.easeTo({ center: [rider.position.lon, rider.position.lat], zoom: Math.max(map.getZoom(), 13) });
    }
  }, [selectedStartNumber, positions]);

  return <div ref={containerRef} className="map-container" />;
}
