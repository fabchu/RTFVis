import { describe, expect, it } from "vitest";
import { estimateSpeed } from "../src/speed.js";
import type { ScanRecord } from "../src/types.js";
import { rtfLoop, rtfLong, rtfShort } from "./fixtures/routes.js";

function scan(checkpointId: string, isoTime: string): ScanRecord {
  return { startNumber: "1", checkpointId, timestampUtc: isoTime };
}

describe("estimateSpeed", () => {
  it("gibt null zurück ohne genug Scans", () => {
    expect(estimateSpeed([], rtfShort)).toBeNull();
    expect(estimateSpeed([scan("START", "2026-07-25T08:00:00Z")], rtfShort)).toBeNull();
  });

  it("berechnet die Geschwindigkeit aus genau einem Abschnitt", () => {
    // 10km in 1000s = 10 m/s
    const scans = [scan("START", "2026-07-25T08:00:00Z"), scan("CP1", "2026-07-25T08:16:40Z")];
    expect(estimateSpeed(scans, rtfShort)).toBeCloseTo(10, 5);
  });

  it("gewichtet die letzten drei Abschnitte 0.5/0.3/0.2 (neuester zuerst)", () => {
    // START->CP1: 10km/1000s=10 m/s, CP1->CP2: 10km/500s=20 m/s
    const scans = [
      scan("START", "2026-07-25T08:00:00Z"),
      scan("CP1", "2026-07-25T08:16:40Z"), // +1000s, 10 m/s
      scan("CP2", "2026-07-25T08:25:00Z"), // +500s, 20 m/s
    ];
    const expected = 20 * 0.5 + 10 * 0.3 + 0 * 0.2; // gewichtet, neuester (20 m/s) zuerst
    const normalized = expected / (0.5 + 0.3);
    expect(estimateSpeed(scans, rtfShort)).toBeCloseTo(normalized, 5);
  });

  it("berücksichtigt nur die letzten drei Abschnitte, auch wenn mehr vorhanden sind", () => {
    // rtf-long: START=0, CP1=10000, CP2=20000, CP3=35000, FINISH_LONG=50000
    const withExtra = [
      scan("START", "2026-07-25T07:00:00Z"), // zusätzlicher, sehr langsamer Abschnitt davor (10km/3600s)
      scan("CP1", "2026-07-25T08:00:00Z"),
      scan("CP2", "2026-07-25T08:16:40Z"), // +1000s, 10 m/s
      scan("CP3", "2026-07-25T08:25:00Z"), // +500s, 30 m/s
      scan("FINISH_LONG", "2026-07-25T08:35:00Z"), // +600s, 25 m/s
    ];
    const withoutExtra = [
      scan("CP1", "2026-07-25T08:00:00Z"),
      scan("CP2", "2026-07-25T08:16:40Z"),
      scan("CP3", "2026-07-25T08:25:00Z"),
      scan("FINISH_LONG", "2026-07-25T08:35:00Z"),
    ];
    // withExtra hat 4 Abschnitte (START-CP1 zusätzlich), withoutExtra nur die letzten 3
    // davon — das Ergebnis muss identisch sein, der zusätzliche frühere Abschnitt darf
    // nicht mitgewichtet werden.
    expect(estimateSpeed(withExtra, rtfLong)).toBeCloseTo(estimateSpeed(withoutExtra, rtfLong)!, 5);
  });

  it("ignoriert Abschnitte mit Zeit- oder Reihenfolge-Anomalien (Distanz oder Zeit nicht positiv)", () => {
    const scans = [
      scan("CP1", "2026-07-25T08:16:40Z"),
      scan("START", "2026-07-25T08:00:00Z"), // liegt VOR CP1 zeitlich, aber Distanz davor -> negative dDist
    ];
    expect(estimateSpeed(scans, rtfShort)).toBeNull();
  });

  it("ignoriert Checkpoints, die nicht zur übergebenen Strecke gehören", () => {
    const scans = [
      scan("START", "2026-07-25T08:00:00Z"),
      scan("NICHT_AUF_DER_STRECKE", "2026-07-25T08:05:00Z"),
      scan("CP1", "2026-07-25T08:16:40Z"),
    ];
    expect(estimateSpeed(scans, rtfShort)).toBeCloseTo(10, 5);
  });

  describe("mehrfach besuchte Checkpoints (Schleifenstrecke)", () => {
    // rtf-loop: START=0, K1=10000, K3(1.)=20000, K4=30000, K3(2.)=40000, FINISH=50000

    it("verwendet für die erste Sichtung die Distanz des ERSTEN Vorkommens, nicht die des letzten", () => {
      // K1->K3 in 1000s: bei korrekter (erster) Distanz 20000 -> 10 m/s.
      // Eine ID->Distanz-Map (letztes Vorkommen gewinnt) würde stattdessen 40000 nehmen
      // und fälschlich 30 m/s liefern.
      const scans = [scan("K1", "2026-07-25T08:00:00Z"), scan("K3", "2026-07-25T08:16:40Z")];
      expect(estimateSpeed(scans, rtfLoop)).toBeCloseTo(10, 5);
    });

    it("berechnet über beide Vorkommen hinweg durchgehend korrekte, positive Abschnittsgeschwindigkeiten", () => {
      const scans = [
        scan("K1", "2026-07-25T08:00:00Z"),
        scan("K3", "2026-07-25T08:16:40Z"), // 1. Vorkommen, +1000s -> 10 m/s
        scan("K4", "2026-07-25T08:33:20Z"), // +1000s -> 10 m/s
        scan("K3", "2026-07-25T08:50:00Z"), // 2. Vorkommen, +1000s -> 10 m/s
      ];
      expect(estimateSpeed(scans, rtfLoop)).toBeCloseTo(10, 5);
    });
  });
});
