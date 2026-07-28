import type { CheckpointDef, RiderPosition, Route } from "@rtfvis/core";
import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckpointPairOccupancy } from "../src/segmentOccupancy.js";

// Minimaler Fake für maplibregl.Map: reicht aus, um MapView.tsx komplett durchzurendern
// und zu prüfen, WELCHE Daten tatsächlich per source.setData() an die Karte übergeben würden
// — ohne echtes WebGL/Canvas-Rendering, das in jsdom ohnehin nicht existiert.
class FakeSource {
  data: unknown;
  setData(d: unknown) {
    this.data = d;
  }
  getClusterExpansionZoom() {
    return Promise.resolve(10);
  }
}

class FakeMap {
  sources = new Map<string, FakeSource>();
  layers = new Set<string>();
  loadHandlers: Array<() => void> = [];
  loaded = false;

  addControl() {}
  addSource(id: string, opts: { data: unknown }) {
    const source = new FakeSource();
    source.data = opts.data;
    this.sources.set(id, source);
  }
  getSource(id: string) {
    return this.sources.get(id);
  }
  addLayer(layer: { id: string }) {
    this.layers.add(layer.id);
  }
  getLayer(id: string) {
    return this.layers.has(id) ? {} : undefined;
  }
  setLayoutProperty() {}
  on(event: string, ...args: unknown[]) {
    if (event !== "load") return;
    const handler = args[args.length - 1] as () => void;
    this.loadHandlers.push(handler);
  }
  once(event: string, handler: () => void) {
    if (event !== "load") return;
    this.loadHandlers.push(handler);
  }
  isStyleLoaded() {
    return this.loaded;
  }
  fireLoad() {
    this.loaded = true;
    // MapLibre ruft alle "load"-Listener in Registrierungsreihenfolge auf.
    for (const handler of this.loadHandlers.splice(0)) handler();
  }
  fitBounds() {}
  getCanvas() {
    return { style: {} as CSSStyleDeclaration };
  }
  easeTo() {}
  getZoom() {
    return 10;
  }
  remove() {}
}

let lastCreatedMap: FakeMap | null = null;

vi.mock("maplibre-gl", () => {
  class MapCtor extends FakeMap {
    constructor() {
      super();
      lastCreatedMap = this;
    }
  }
  class NavigationControl {}
  class LngLatBounds {
    extend() {}
    isEmpty() {
      return false;
    }
  }
  return { default: { Map: MapCtor, NavigationControl, LngLatBounds } };
});

const { MapView } = await import("../src/map/MapView.js");

const rtfRoute: Route = {
  id: "rtf-90",
  category: "RTF",
  name: "RTF 90",
  totalDistanceM: 1000,
  checkpoints: [
    { id: "START", distanceM: 0, deviationM: 0 },
    { id: "K1", distanceM: 1000, deviationM: 0 },
  ],
  geometry: [
    [8.6, 49.8],
    [8.7, 49.9],
  ],
  cumulativeM: [0, 1000],
};

const ctfRoute: Route = {
  id: "ctf-70",
  category: "CTF",
  name: "CTF 70",
  totalDistanceM: 1000,
  checkpoints: [
    { id: "START", distanceM: 0, deviationM: 0 },
    { id: "C1", distanceM: 1000, deviationM: 0 },
  ],
  geometry: [
    [8.6, 49.8],
    [8.5, 49.9],
  ],
  cumulativeM: [0, 1000],
};

const checkpoints: CheckpointDef[] = [
  { id: "START", name: "Start/Ziel", lat: 49.8, lon: 8.6 },
  { id: "K1", name: "Villingen", lat: 49.9, lon: 8.7 },
  { id: "C1", name: "Hausberg", lat: 49.9, lon: 8.5 },
];

const rtfPair: CheckpointPairOccupancy = { fromCheckpointId: "START", toCheckpointId: "K1", routeIds: ["rtf-90"], riderCount: 5 };
const ctfPair: CheckpointPairOccupancy = { fromCheckpointId: "START", toCheckpointId: "C1", routeIds: ["ctf-70"], riderCount: 3 };

function noop() {}

describe("MapView: reagiert auf Prop-Änderungen wie sie App.tsx beim Filtern erzeugt", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    lastCreatedMap = null;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("aktualisiert die Segmentauslastungs-Quelle, wenn checkpointPairOccupancy sich ändert (z.B. durch einen Kategorie-Filter)", () => {
    act(() => {
      root.render(
        <MapView
          routes={[rtfRoute, ctfRoute]}
          checkpoints={checkpoints}
          positions={[]}
          checkpointPairOccupancy={[rtfPair, ctfPair]}
          selectedStartNumber={null}
          onSelectRider={noop}
          showRiders={true}
          showSegments={true}
        />,
      );
    });

    const map = lastCreatedMap!;
    act(() => {
      map.fireLoad();
    });

    const initialFeatures = (map.getSource("segment-occupancy")!.data as GeoJSON.FeatureCollection).features;
    expect(initialFeatures).toHaveLength(2);

    // Simuliert exakt das, was App.tsx beim Setzen von filters.category="RTF" tut:
    // routes und checkpointPairOccupancy werden auf die RTF-Teilmenge reduziert.
    act(() => {
      root.render(
        <MapView
          routes={[rtfRoute]}
          checkpoints={checkpoints}
          positions={[]}
          checkpointPairOccupancy={[rtfPair]}
          selectedStartNumber={null}
          onSelectRider={noop}
          showRiders={true}
          showSegments={true}
        />,
      );
    });

    const filteredFeatures = (map.getSource("segment-occupancy")!.data as GeoJSON.FeatureCollection).features;
    expect(filteredFeatures).toHaveLength(1);
    expect(filteredFeatures[0].properties).toMatchObject({ fromCheckpointId: "START", toCheckpointId: "K1", riderCount: 5 });
  });

  it("aktualisiert die Quelle auch, wenn map.isStyleLoaded() zwischenzeitlich wieder false zurückgibt (Regression)", () => {
    // MapLibre kann isStyleLoaded() nach dem initialen Laden jederzeit kurz wieder false
    // liefern (z.B. während eine ANDERE Source gerade neu kachelt). Ein Update-Effekt, der
    // dafür auf map.once("load", ...) zurückfällt, würde nie mehr feuern — das "load"-Ereignis
    // passiert nur einmal im Kartenleben. Dieser Test bildet genau dieses reale Szenario nach.
    act(() => {
      root.render(
        <MapView
          routes={[rtfRoute, ctfRoute]}
          checkpoints={checkpoints}
          positions={[]}
          checkpointPairOccupancy={[rtfPair, ctfPair]}
          selectedStartNumber={null}
          onSelectRider={noop}
          showRiders={true}
          showSegments={true}
        />,
      );
    });
    const map = lastCreatedMap!;
    act(() => {
      map.fireLoad();
    });

    // Simuliert die zwischenzeitliche Kachel-Neuberechnung einer anderen Source.
    map.loaded = false;

    act(() => {
      root.render(
        <MapView
          routes={[rtfRoute]}
          checkpoints={checkpoints}
          positions={[]}
          checkpointPairOccupancy={[rtfPair]}
          selectedStartNumber={null}
          onSelectRider={noop}
          showRiders={true}
          showSegments={true}
        />,
      );
    });

    const filteredFeatures = (map.getSource("segment-occupancy")!.data as GeoJSON.FeatureCollection).features;
    expect(filteredFeatures).toHaveLength(1);
    expect(filteredFeatures[0].properties).toMatchObject({ fromCheckpointId: "START", toCheckpointId: "K1", riderCount: 5 });
  });

  it("zeigt Fahrer im Ziel nicht als Marker auf der Karte", () => {
    function position(overrides: Partial<RiderPosition>): RiderPosition {
      return {
        startNumber: "101",
        status: "onCourse",
        category: "RTF",
        routeId: "rtf-90",
        candidateRouteIds: ["rtf-90"],
        rosterConflict: false,
        distanceM: 500,
        position: { lon: 8.65, lat: 49.85 },
        speedMps: 5,
        lastCheckpointId: "START",
        lastCheckpointTimeUtc: "2026-07-25T08:00:00Z",
        nextCheckpointId: "K1",
        lastCheckpointDistanceM: 0,
        nextCheckpointDistanceM: 1000,
        ...overrides,
      };
    }
    const onCourse = position({ startNumber: "101", status: "onCourse" });
    const finished = position({ startNumber: "202", status: "finished", nextCheckpointId: null });

    act(() => {
      root.render(
        <MapView
          routes={[rtfRoute]}
          checkpoints={checkpoints}
          positions={[onCourse, finished]}
          checkpointPairOccupancy={[rtfPair]}
          selectedStartNumber={null}
          onSelectRider={noop}
          showRiders={true}
          showSegments={true}
        />,
      );
    });
    const map = lastCreatedMap!;
    act(() => {
      map.fireLoad();
    });

    const riderFeatures = (map.getSource("riders")!.data as GeoJSON.FeatureCollection).features;
    expect(riderFeatures).toHaveLength(1);
    expect(riderFeatures[0].properties).toMatchObject({ startNumber: "101" });
  });

  it("aktualisiert auch die Streckenlinien-Quelle beim Filtern", () => {
    act(() => {
      root.render(
        <MapView
          routes={[rtfRoute, ctfRoute]}
          checkpoints={checkpoints}
          positions={[]}
          checkpointPairOccupancy={[rtfPair, ctfPair]}
          selectedStartNumber={null}
          onSelectRider={noop}
          showRiders={true}
          showSegments={true}
        />,
      );
    });
    const map = lastCreatedMap!;
    act(() => {
      map.fireLoad();
    });
    expect((map.getSource("routes")!.data as GeoJSON.FeatureCollection).features).toHaveLength(2);

    act(() => {
      root.render(
        <MapView
          routes={[rtfRoute]}
          checkpoints={checkpoints}
          positions={[]}
          checkpointPairOccupancy={[rtfPair]}
          selectedStartNumber={null}
          onSelectRider={noop}
          showRiders={true}
          showSegments={true}
        />,
      );
    });
    expect((map.getSource("routes")!.data as GeoJSON.FeatureCollection).features).toHaveLength(1);
  });
});
