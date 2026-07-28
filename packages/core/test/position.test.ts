import { describe, expect, it } from "vitest";
import { computePositions } from "../src/position.js";
import type { RosterEntry, ScanRecord } from "../src/types.js";
import { allRoutes, rtfLoop, rtfLong, rtfShort } from "./fixtures/routes.js";

function scan(startNumber: string, checkpointId: string, timestampUtc: string): ScanRecord {
  return { startNumber, checkpointId, timestampUtc };
}

const T0 = Date.parse("2026-07-25T08:00:00Z");

function byNumber(positions: ReturnType<typeof computePositions>, startNumber: string) {
  const p = positions.find((p) => p.startNumber === startNumber);
  if (!p) throw new Error(`Keine Position für ${startNumber}`);
  return p;
}

describe("computePositions", () => {
  it("markiert einen Fahrer ohne Scans als notStarted", () => {
    const roster: RosterEntry[] = [{ startNumber: "1", category: "RTF", routeId: "rtf-short" }];
    const positions = computePositions([], allRoutes, roster, T0);
    const p = byNumber(positions, "1");
    expect(p.status).toBe("notStarted");
    expect(p.position).toBeNull();
    expect(p.candidateRouteIds).toEqual(["rtf-short"]);
  });

  it("extrapoliert die Position anhand des geschätzten Tempos", () => {
    const roster: RosterEntry[] = [{ startNumber: "1", category: "RTF", routeId: "rtf-short" }];
    const scans: ScanRecord[] = [
      scan("1", "START", new Date(T0).toISOString()),
      scan("1", "CP1", new Date(T0 + 1000 * 1000).toISOString()), // 10km in 1000s -> 10 m/s
    ];
    // 300s nach CP1 bei 10 m/s -> +3000m ab CP1 (10000m) = 13000m
    const t = T0 + 1000 * 1000 + 300 * 1000;
    const p = byNumber(computePositions(scans, allRoutes, roster, t), "1");

    expect(p.status).toBe("onCourse");
    expect(p.routeId).toBe("rtf-short");
    expect(p.distanceM).toBeCloseTo(13000, 0);
    expect(p.speedMps).toBeCloseTo(10, 5);
    // Bei 13000m auf einer Geraden von (8.6,49.8) nach (8.6+30000/100000, 49.8) = (8.9,49.8)
    expect(p.position!.lon).toBeCloseTo(8.6 + 13000 / 100_000, 5);
    expect(p.position!.lat).toBeCloseTo(49.8, 5);
  });

  it("kappt die Extrapolation bei ~98% der Distanz zum nächsten Checkpoint und markiert overdue", () => {
    const roster: RosterEntry[] = [{ startNumber: "1", category: "RTF", routeId: "rtf-short" }];
    const scans: ScanRecord[] = [
      scan("1", "START", new Date(T0).toISOString()),
      scan("1", "CP1", new Date(T0 + 1000 * 1000).toISOString()), // 10 m/s
    ];
    // Sehr viel Zeit vergangen -> weit über den nächsten Checkpoint (CP2 bei 20000m) hinaus
    const t = T0 + 1000 * 1000 + 100_000 * 1000;
    const p = byNumber(computePositions(scans, allRoutes, roster, t), "1");

    expect(p.status).toBe("overdue");
    const clampLimit = 10_000 + (20_000 - 10_000) * 0.98;
    expect(p.distanceM).toBeCloseTo(clampLimit, 0);
  });

  it("markiert einen Fahrer als finished, sobald er den letzten Checkpoint seiner Strecke erreicht", () => {
    const roster: RosterEntry[] = [{ startNumber: "1", category: "RTF", routeId: "rtf-short" }];
    const scans: ScanRecord[] = [scan("1", "FINISH_SHORT", new Date(T0).toISOString())];
    const p = byNumber(computePositions(scans, allRoutes, roster, T0 + 999_000_000), "1");

    expect(p.status).toBe("finished");
    expect(p.distanceM).toBe(30_000);
    expect(p.speedMps).toBeNull();
  });

  it("bleibt ambiguousRoute, solange rtf-short und rtf-long ab dem letzten Checkpoint unterschiedlich weiterführen", () => {
    // Kein Roster-Eintrag -> Ableitung aus Scans. START/CP1/CP2 sind auf beiden Strecken
    // identisch, aber CP2 ist bei rtf-short der vorletzte (Ziel folgt), bei rtf-long geht's
    // weiter zu CP3 -> keine gemeinsame Fortsetzung mehr.
    const scans: ScanRecord[] = [
      scan("1", "START", new Date(T0).toISOString()),
      scan("1", "CP1", new Date(T0 + 500_000).toISOString()),
      scan("1", "CP2", new Date(T0 + 1_000_000).toISOString()),
    ];
    const p = byNumber(computePositions(scans, allRoutes, [], T0 + 1_100_000), "1");

    expect(p.status).toBe("ambiguousRoute");
    expect(p.routeId).toBeNull();
    expect(p.candidateRouteIds.sort()).toEqual(["rtf-long", "rtf-short"]);
    expect(p.distanceM).toBe(20_000); // an der letzten gemeinsamen Position eingefroren
    expect(p.speedMps).toBeNull();
  });

  it("löst sich aus ambiguousRoute, sobald ein weiterer Scan eindeutig eine Strecke bestätigt", () => {
    const scans: ScanRecord[] = [
      scan("1", "START", new Date(T0).toISOString()),
      scan("1", "CP1", new Date(T0 + 500_000).toISOString()),
      scan("1", "CP2", new Date(T0 + 1_000_000).toISOString()),
      scan("1", "CP3", new Date(T0 + 1_500_000).toISOString()),
    ];
    const p = byNumber(computePositions(scans, allRoutes, [], T0 + 1_600_000), "1");

    expect(p.status).toBe("onCourse");
    expect(p.routeId).toBe("rtf-long");
  });

  it("markiert routeConflict, wenn kein Streckenverlauf zu den Scans passt", () => {
    const scans: ScanRecord[] = [scan("1", "UNBEKANNT", new Date(T0).toISOString())];
    const p = byNumber(computePositions(scans, allRoutes, [], T0), "1");

    expect(p.status).toBe("routeConflict");
    expect(p.position).toBeNull();
    expect(p.lastCheckpointId).toBe("UNBEKANNT");
  });

  it("setzt rosterConflict, wenn die Roster-Zuordnung nicht zu den Scans passt, blockiert aber nicht die normale Auflösung", () => {
    const roster: RosterEntry[] = [{ startNumber: "1", category: "RTF", routeId: "rtf-short" }];
    const scans: ScanRecord[] = [
      scan("1", "START", new Date(T0).toISOString()),
      scan("1", "CP3", new Date(T0 + 1_000_000).toISOString()), // existiert nur auf rtf-long
    ];
    const p = byNumber(computePositions(scans, allRoutes, roster, T0 + 1_000_000), "1");

    expect(p.rosterConflict).toBe(true);
    expect(p.routeId).toBe("rtf-long");
    expect(p.status).not.toBe("routeConflict");
  });

  it("verwendet den Kategorie-Median als Tempo-Fallback für Fahrer mit weniger als zwei Scans", () => {
    const roster: RosterEntry[] = [
      { startNumber: "1", category: "RTF", routeId: "rtf-short" },
      { startNumber: "2", category: "RTF", routeId: "rtf-short" },
    ];
    // Fahrer 1 liefert eine echte Geschwindigkeit von 10 m/s — beide Scans liegen deutlich vor
    // t, damit sie beim Zeitschnitt (nur Scans bis einschließlich t) sichtbar bleiben.
    const scansRider1: ScanRecord[] = [
      scan("1", "START", new Date(T0 - 2_000_000).toISOString()),
      scan("1", "CP1", new Date(T0 - 1_000_000).toISOString()),
    ];
    // Fahrer 2 hat nur einen Scan -> kein eigener Wert, muss den Median (=10) übernehmen.
    const scansRider2: ScanRecord[] = [scan("2", "START", new Date(T0).toISOString())];

    const t = T0 + 500 * 1000; // 500s nach Fahrer 2s START
    const positions = computePositions([...scansRider1, ...scansRider2], allRoutes, roster, t);
    const p2 = byNumber(positions, "2");

    expect(p2.speedMps).toBeCloseTo(10, 5);
    expect(p2.distanceM).toBeCloseTo(5000, 0); // 500s * 10 m/s
  });

  describe("mehrfach besuchte Checkpoints (Schleifenstrecke)", () => {
    // rtf-loop: START=0, K1=10000, K3(1.)=20000, K4=30000, K3(2.)=40000, FINISH=50000
    const roster: RosterEntry[] = [{ startNumber: "1", category: "RTF", routeId: "rtf-loop" }];

    it("positioniert nach der zweiten Sichtung korrekt zwischen dem ZWEITEN K3-Vorkommen und FINISH", () => {
      const scans: ScanRecord[] = [
        scan("1", "K1", new Date(T0).toISOString()),
        scan("1", "K3", new Date(T0 + 1_000_000).toISOString()), // 1. Vorkommen, 10 m/s
        scan("1", "K4", new Date(T0 + 2_000_000).toISOString()), // 10 m/s
        scan("1", "K3", new Date(T0 + 3_000_000).toISOString()), // 2. Vorkommen, 10 m/s
      ];
      // 100s nach der zweiten K3-Sichtung bei 10 m/s -> 40000 + 1000 = 41000m
      const t = T0 + 3_000_000 + 100_000;
      const p = byNumber(computePositions(scans, [rtfLoop], roster, t), "1");

      expect(p.status).toBe("onCourse");
      expect(p.nextCheckpointId).toBe("FINISH");
      expect(p.distanceM).toBeCloseTo(41_000, 0);
      // Der ursprüngliche Bug (findIndex/Map fand immer nur EIN Vorkommen) hätte den
      // Fahrer hier fälschlich auf ~21000m zwischen dem ERSTEN K3 und K4 zurückgeworfen.
      expect(p.distanceM).not.toBeCloseTo(21_000, 0);
      expect(p.nextCheckpointId).not.toBe("K4");
    });

    it("erkennt finished erst am echten Streckenende, nicht schon beim ersten K3-Vorkommen", () => {
      const scans: ScanRecord[] = [
        scan("1", "K1", new Date(T0).toISOString()),
        scan("1", "K3", new Date(T0 + 1_000_000).toISOString()),
        scan("1", "K4", new Date(T0 + 2_000_000).toISOString()),
        scan("1", "K3", new Date(T0 + 3_000_000).toISOString()),
        scan("1", "FINISH", new Date(T0 + 4_000_000).toISOString()),
      ];
      const p = byNumber(computePositions(scans, [rtfLoop], roster, T0 + 5_000_000), "1");

      expect(p.status).toBe("finished");
      expect(p.distanceM).toBe(50_000);
    });
  });

  it("ignoriert beim Replay auf einen früheren Zeitpunkt Scans, die aus Sicht von t noch in der Zukunft liegen", () => {
    // Regression: computePositions nahm bisher immer den ABSOLUT letzten Scan eines Fahrers,
    // unabhängig von t. Im Replay (t liegt vor späteren, bereits im Datensatz vorhandenen
    // Scans) fror die Position dadurch am noch gar nicht erreichten Checkpoint ein — bis die
    // Replay-Uhr den echten Zeitpunkt dieses Scans erreichte ("nichts passiert" trotz
    // eigentlich laufender Bewegung).
    const roster: RosterEntry[] = [{ startNumber: "1", category: "RTF", routeId: "rtf-short" }];
    const scans: ScanRecord[] = [
      scan("1", "START", new Date(T0).toISOString()),
      scan("1", "CP1", new Date(T0 + 1000 * 1000).toISOString()), // 10 m/s
      scan("1", "CP2", new Date(T0 + 10_000_000).toISOString()), // liegt weit NACH dem Replay-Zeitpunkt unten
    ];
    // Replay-Zeitpunkt: 300s nach CP1, aber lange vor dem CP2-Scan.
    const t = T0 + 1000 * 1000 + 300 * 1000;
    const p = byNumber(computePositions(scans, allRoutes, roster, t), "1");

    expect(p.status).toBe("onCourse");
    expect(p.lastCheckpointId).toBe("CP1");
    expect(p.nextCheckpointId).toBe("CP2");
    // Muss wie im rein-CP1-Fall extrapoliert werden (10000m + 300s*10m/s), nicht am
    // (aus Sicht von t) noch nicht erreichten CP2 (20000m) einfrieren.
    expect(p.distanceM).toBeCloseTo(13000, 0);
  });

  describe("verpasster Scan an einem Kontrollpunkt (z.B. vergessen zu halten oder kein Internet vor Ort)", () => {
    // rtf-long: START=0, CP1=10000, CP2=20000, CP3=35000, FINISH_LONG=50000.
    const roster: RosterEntry[] = [{ startNumber: "1", category: "RTF", routeId: "rtf-long" }];
    const scansUntilCp1: ScanRecord[] = [
      scan("1", "START", new Date(T0).toISOString()),
      scan("1", "CP1", new Date(T0 + 1000 * 1000).toISOString()), // 10 m/s
    ];

    it("wartet (kappt) vor dem verpassten Checkpoint und markiert overdue, statt einfach weiterzulaufen", () => {
      // Sehr viel Zeit seit CP1 vergangen, aber CP2 wurde nie gescannt (Fahrer angehalten,
      // aber nicht gescannt, oder Scanner ohne Empfang) -> Extrapolation kappt kurz vor CP2.
      const t = T0 + 1000 * 1000 + 100_000 * 1000;
      const p = byNumber(computePositions(scansUntilCp1, [rtfLong], roster, t), "1");

      expect(p.status).toBe("overdue");
      expect(p.lastCheckpointId).toBe("CP1");
      expect(p.nextCheckpointId).toBe("CP2");
      const clampLimit = 10_000 + (20_000 - 10_000) * 0.98;
      expect(p.distanceM).toBeCloseTo(clampLimit, 0);
    });

    it("springt beim nächsten tatsächlichen Scan direkt zur übersprungenen Station weiter, statt CP2 nachträglich zu erfinden", () => {
      // CP3-Scan trifft ein, CP2 wurde nie gescannt — die Teilfolgen-Auflösung toleriert
      // das (siehe route-matching.ts), computePositions springt direkt auf CP3s Position.
      const scansWithCp3: ScanRecord[] = [
        ...scansUntilCp1,
        scan("1", "CP3", new Date(T0 + 1000 * 1000 + 2500 * 1000).toISOString()), // 25000m/2500s = 10 m/s
      ];
      const t = T0 + 1000 * 1000 + 2500 * 1000 + 500 * 1000; // 500s nach dem CP3-Scan
      const p = byNumber(computePositions(scansWithCp3, [rtfLong], roster, t), "1");

      expect(p.status).toBe("onCourse");
      expect(p.lastCheckpointId).toBe("CP3");
      expect(p.nextCheckpointId).toBe("FINISH_LONG");
      // Direkt ab CP3 weiterextrapoliert (35000 + 500s*10m/s), nicht am übersprungenen
      // CP2 (20000) hängengeblieben.
      expect(p.distanceM).toBeCloseTo(40_000, 0);
    });
  });

  it("ist eine reine Funktion von t — Replay mit fester Zeit liefert dasselbe Ergebnis wie Live zum selben Zeitpunkt", () => {
    const roster: RosterEntry[] = [{ startNumber: "1", category: "RTF", routeId: "rtf-short" }];
    const scans: ScanRecord[] = [
      scan("1", "START", new Date(T0).toISOString()),
      scan("1", "CP1", new Date(T0 + 1000 * 1000).toISOString()),
    ];
    const t = T0 + 1_200_000;
    const a = computePositions(scans, allRoutes, roster, t);
    const b = computePositions(scans, allRoutes, roster, t);
    expect(a).toEqual(b);
  });
});
