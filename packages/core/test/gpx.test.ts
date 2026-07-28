import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseGpxFile, parseGpxString } from "../src/preprocess/gpx.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => path.join(__dirname, "fixtures", name);

describe("parseGpxFile", () => {
  it("liest trkpt-Punkte in Dokumentreihenfolge", () => {
    const points = parseGpxFile(fixture("simple-line.gpx"));
    expect(points).toHaveLength(5);
    expect(points[0]).toEqual({ lat: 49.8, lon: 8.6 });
    expect(points[4]).toEqual({ lat: 49.82, lon: 8.62 });
  });

  it("fällt auf rtept zurück, wenn keine trkpt vorhanden sind", () => {
    const points = parseGpxFile(fixture("simple-route.gpx"));
    expect(points).toHaveLength(3);
    expect(points[0]).toEqual({ lat: 49.8, lon: 8.6 });
  });
});

describe("parseGpxString", () => {
  it("wirft bei fehlender <gpx>-Wurzel", () => {
    expect(() => parseGpxString("<not-gpx></not-gpx>")).toThrow(/Wurzel/);
  });

  it("wirft bei zu wenigen Punkten", () => {
    const xml = `<gpx><trk><trkseg><trkpt lat="49.8" lon="8.6"></trkpt></trkseg></trk></gpx>`;
    expect(() => parseGpxString(xml)).toThrow(/zu wenige Punkte/);
  });

  it("wirft bei ungültigen lat/lon-Attributen", () => {
    const xml = `<gpx><trk><trkseg>
      <trkpt lat="49.8" lon="8.6"></trkpt>
      <trkpt lat="nicht-eine-zahl" lon="8.6"></trkpt>
    </trkseg></trk></gpx>`;
    expect(() => parseGpxString(xml)).toThrow(/Ungültiger trkpt/);
  });
});
