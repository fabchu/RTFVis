import { describe, expect, it } from "vitest";
import { generateSternfahrtVariants } from "../src/preprocess/sternfahrt.js";
import { computePositions } from "../src/position.js";
import { resolveRoute } from "../src/route-matching.js";
import type { RosterEntry, ScanRecord } from "../src/types.js";
import { rtfRundkurs } from "./fixtures/routes.js";

function scan(startNumber: string, checkpointId: string, timestampUtc: string): ScanRecord {
  return { startNumber, checkpointId, timestampUtc };
}

const T0 = Date.parse("2026-07-25T08:00:00Z");

/**
 * Sternfahrt-Szenario: Der Fahrer startet physisch bei K2 (nicht bei START), fährt
 * vorwärts entlang der Strecke (K2 -> K3 -> K4 -> Ziel), meldet sich dort erstmals
 * offiziell an (Scan "START"), und fährt dann über START weiter (K1). Er wird bei der
 * Rückkehr zu K2 nicht mehr gescannt — sobald K1 gescannt ist, gilt er als fertig.
 *
 * Beobachtete Scan-Reihenfolge: K3, K4, START, K1.
 * Route-Reihenfolge (rtf-rundkurs): START, K1, K2, K3, K4, FINISH.
 */
const sternfahrtScans: ScanRecord[] = [
  scan("1", "K3", new Date(T0).toISOString()),
  scan("1", "K4", new Date(T0 + 1_000_000).toISOString()), // +1000s, 10km -> 10 m/s
  scan("1", "START", new Date(T0 + 2_000_000).toISOString()), // +1000s, 10km -> 10 m/s
  scan("1", "K1", new Date(T0 + 3_000_000).toISOString()), // +1000s, 10km -> 10 m/s
];

describe("Sternfahrt ohne Sternfahrt-Variante (Ausgangslage)", () => {
  it("wird von resolveRoute NICHT als gültige Teilfolge der Strecke erkannt", () => {
    const result = resolveRoute(sternfahrtScans, { startNumber: "1", category: "RTF" }, [rtfRundkurs]);
    // K3/K4 liegen VOR START in der Scan-Reihenfolge, aber NACH START in der
    // Streckenliste -> keine Teilfolge, solange nur die reguläre Strecke bekannt ist.
    expect(result.candidateRouteIds).toEqual([]);
  });

  it("führt zu routeConflict und keiner Position auf der Karte", () => {
    const roster: RosterEntry[] = [{ startNumber: "1", category: "RTF", routeId: "rtf-rundkurs" }];
    const positions = computePositions(sternfahrtScans, [rtfRundkurs], roster, T0 + 3_100_000);
    const p = positions.find((p) => p.startNumber === "1")!;

    expect(p.status).toBe("routeConflict");
    expect(p.position).toBeNull();
  });
});

describe("Sternfahrt MIT Sternfahrt-Variante (behoben)", () => {
  const [sternfahrtVariante] = generateSternfahrtVariants([rtfRundkurs]);
  const routesWithVariant = [rtfRundkurs, sternfahrtVariante];

  it("wird als gültige Teilfolge der Sternfahrt-Variante erkannt", () => {
    const result = resolveRoute(sternfahrtScans, { startNumber: "1", category: "RTF" }, routesWithVariant);
    expect(result.candidateRouteIds).toEqual(["rtf-rundkurs-sternfahrt"]);
  });

  it("liefert eine gültige Position und korrektes Tempo statt routeConflict", () => {
    const roster: RosterEntry[] = [{ startNumber: "1", category: "RTF" }];
    // 100s nach dem letzten Scan (K1) bei 10 m/s -> ca. 1000m weiter Richtung K2.
    const t = T0 + 3_000_000 + 100_000;
    const positions = computePositions(sternfahrtScans, routesWithVariant, roster, t);
    const p = positions.find((p) => p.startNumber === "1")!;

    expect(p.status).toBe("onCourse");
    expect(p.position).not.toBeNull();
    expect(p.speedMps).toBeCloseTo(10, 5);
    // K1 liegt auf der Variante bei 60000m (10000 Basisdistanz + 50000 für die erste
    // Runde), der nächste Checkpoint ist folgerichtig K2 (auf der "zweiten Runde").
    expect(p.distanceM).toBeCloseTo(61_000, 0);
    expect(p.nextCheckpointId).toBe("K2");
  });

  it("bleibt für einen ganz normalen Fahrer auf derselben Strecke unverändert eindeutig", () => {
    const normalScans: ScanRecord[] = [
      scan("2", "START", new Date(T0).toISOString()),
      scan("2", "K1", new Date(T0 + 1_000_000).toISOString()),
    ];
    const roster: RosterEntry[] = [{ startNumber: "2", category: "RTF" }];
    const positions = computePositions(normalScans, routesWithVariant, roster, T0 + 1_100_000);
    const p = positions.find((p) => p.startNumber === "2")!;

    expect(p.status).toBe("onCourse");
    expect(p.routeId).toBe("rtf-rundkurs");
  });
});
