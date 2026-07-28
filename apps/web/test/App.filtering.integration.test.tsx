import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// End-to-end-artiger Test gegen den ECHTEN Produktionscode (App.tsx, Sidebar.tsx, filters.ts,
// segmentOccupancy.ts, geojson.ts, MapView.tsx) und ECHTE Streckendaten aus data/routes.json —
// nur die Netzwerk-Hooks und maplibre-gl selbst werden ersetzt. Grund: ein isolierter
// MapView-Test allein hatte die Verdrahtung als korrekt bestätigt, aber nicht ausgeschlossen,
// dass der Fehler in App.tsx selbst liegt (z.B. useMemo-Abhängigkeiten) oder darin, wie die
// Sidebar-Filter tatsächlich per DOM-Event den React-State erreichen.

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
    this.loadHandlers.push(args[args.length - 1] as () => void);
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../../data");
const realRoutes = JSON.parse(readFileSync(path.join(DATA_DIR, "routes.json"), "utf-8"));
const realCheckpoints = JSON.parse(readFileSync(path.join(DATA_DIR, "checkpoints.json"), "utf-8"));

vi.mock("../src/useRaceData.js", () => ({
  useRaceStaticData: () => ({ routes: realRoutes, checkpoints: realCheckpoints, loading: false, error: null }),
  useRaceLiveData: () => ({ roster: [], scans: [], loading: false, error: null }),
}));

vi.mock("../src/useConnectionStatus.js", () => ({
  useConnectionStatus: () => ({ status: null, fetchError: null, checkedAtMs: Date.now() }),
}));

const { App } = await import("../src/App.js");

describe("App: Kategorie-Filter wirkt sich auf die Segmentauslastungsmarker der Karte aus (echte Produktionsdaten)", () => {
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

  it("reduziert die Zahl der Segmentauslastungs-Marker, wenn im Sidebar-Filter eine Kategorie gewählt wird", () => {
    act(() => {
      root.render(<App />);
    });

    const map = lastCreatedMap!;
    act(() => {
      map.fireLoad();
    });

    const allFeatures = (map.getSource("segment-occupancy")!.data as GeoJSON.FeatureCollection).features;
    expect(allFeatures.length).toBeGreaterThan(0);

    const categorySelect = container.querySelectorAll("select")[0] as HTMLSelectElement;
    expect(categorySelect).toBeTruthy();

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      "value",
    )!.set!;

    act(() => {
      nativeInputValueSetter.call(categorySelect, "CTF");
      categorySelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const ctfFeatures = (map.getSource("segment-occupancy")!.data as GeoJSON.FeatureCollection).features;
    expect(ctfFeatures.length).toBeGreaterThan(0);
    expect(ctfFeatures.length).toBeLessThan(allFeatures.length);

    // Ein RTF-eigener Checkpoint (Villingen) darf nach dem CTF-Filter in keinem Marker mehr auftauchen.
    const villingenId = realCheckpoints.find((c: { name: string }) => c.name === "Villingen")?.id;
    expect(villingenId).toBeTruthy();
    const stillHasRtfCheckpoint = ctfFeatures.some(
      (f: GeoJSON.Feature) => f.properties!.fromCheckpointId === villingenId || f.properties!.toCheckpointId === villingenId,
    );
    expect(stillHasRtfCheckpoint).toBe(false);
  });
});
