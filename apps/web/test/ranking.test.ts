import type { Category, Route, RosterEntry, ScanRecord } from "@rtfvis/core";
import { describe, expect, it } from "vitest";
import { computeRanking } from "../src/ranking.js";

function route(id: string, category: Category, checkpointIds: string[], overrides: Partial<Route> = {}): Route {
  return {
    id,
    category,
    name: id,
    totalDistanceM: checkpointIds.length * 10_000,
    checkpoints: checkpointIds.map((cid, i) => ({ id: cid, distanceM: i * 10_000, deviationM: 0 })),
    geometry: [
      [8.6, 49.8],
      [8.7, 49.9],
    ],
    cumulativeM: [0, checkpointIds.length * 10_000],
    ...overrides,
  };
}

const rtf49 = route("rtf-49", "RTF", ["START", "K1", "FINISH"]);
// Bewusst OHNE K1: eine [START,K1,FINISH]-Sequenz darf hier NICHT auch reinpassen, sonst
// wären rtf-49- und rtf-90-Scans in den Tests unten fälschlich mehrdeutig.
const rtf90 = route("rtf-90", "RTF", ["START", "K9", "K2", "FINISH"]);
const rtf49Sternfahrt = route("rtf-49-sternfahrt", "RTF", ["K1", "FINISH", "START"], { baseRouteId: "rtf-49" });
const ROUTES = [rtf49, rtf90, rtf49Sternfahrt];

function roster(startNumber: string, category: Category, routeId?: string): RosterEntry {
  return { startNumber, category, routeId };
}

function scan(startNumber: string, checkpointId: string, timestampUtc: string): ScanRecord {
  return { startNumber, checkpointId, timestampUtc };
}

const NOW = Date.parse("2026-07-25T12:00:00Z");

describe("computeRanking", () => {
  it("berechnet die Zielzeit als FINISH minus START und sortiert je Strecke aufsteigend", () => {
    const rosterEntries = [roster("1", "RTF", "rtf-49"), roster("2", "RTF", "rtf-49")];
    const scans = [
      scan("1", "START", "2026-07-25T09:00:00Z"),
      scan("1", "K1", "2026-07-25T09:10:00Z"),
      scan("1", "FINISH", "2026-07-25T09:20:00Z"), // 20 Min
      scan("2", "START", "2026-07-25T09:00:00Z"),
      scan("2", "K1", "2026-07-25T09:15:00Z"),
      scan("2", "FINISH", "2026-07-25T09:25:00Z"), // 25 Min
    ];

    const result = computeRanking(rosterEntries, scans, ROUTES, NOW, "registered");
    const rows = result.get("rtf-49");
    expect(rows?.map((r) => r.startNumber)).toEqual(["1", "2"]);
    expect(rows?.[0].rank).toBe(1);
    expect(rows?.[0].finishDurationMs).toBe(20 * 60_000);
    expect(rows?.[1].rank).toBe(2);
  });

  it("berücksichtigt nur Fahrer mit sowohl START- als auch FINISH-Scan", () => {
    const rosterEntries = [roster("1", "RTF", "rtf-49"), roster("2", "RTF", "rtf-49")];
    const scans = [
      scan("1", "START", "2026-07-25T09:00:00Z"),
      scan("1", "K1", "2026-07-25T09:10:00Z"),
      scan("1", "FINISH", "2026-07-25T09:20:00Z"),
      // Fahrer 2 ist noch unterwegs, kein FINISH-Scan
      scan("2", "START", "2026-07-25T09:00:00Z"),
      scan("2", "K1", "2026-07-25T09:15:00Z"),
    ];

    const result = computeRanking(rosterEntries, scans, ROUTES, NOW, "registered");
    expect(result.get("rtf-49")?.map((r) => r.startNumber)).toEqual(["1"]);
  });

  it("ignoriert Scans nach nowMs (Replay-konsistent)", () => {
    const rosterEntries = [roster("1", "RTF", "rtf-49")];
    const scans = [
      scan("1", "START", "2026-07-25T09:00:00Z"),
      scan("1", "K1", "2026-07-25T09:10:00Z"),
      scan("1", "FINISH", "2026-07-25T09:20:00Z"),
    ];
    const beforeFinish = Date.parse("2026-07-25T09:15:00Z");

    const result = computeRanking(rosterEntries, scans, ROUTES, beforeFinish, "registered");
    expect(result.get("rtf-49") ?? []).toEqual([]);
  });

  it("ignoriert Sternfahrt-Varianten komplett -- auch wenn die Scans dazu passen würden", () => {
    const rosterEntries = [roster("1", "RTF", undefined)];
    // Sequenz passt exakt zur Sternfahrt-Variante (K1, FINISH, START), aber zu keiner
    // regulären Strecke -- darf in KEINEM Modus in der Rangliste auftauchen.
    const scans = [
      scan("1", "K1", "2026-07-25T09:00:00Z"),
      scan("1", "FINISH", "2026-07-25T09:05:00Z"),
      scan("1", "START", "2026-07-25T09:10:00Z"),
    ];

    const registered = computeRanking(rosterEntries, scans, ROUTES, NOW, "registered");
    const scansMode = computeRanking(rosterEntries, scans, ROUTES, NOW, "scans");
    expect([...registered.values()].flat()).toEqual([]);
    expect([...scansMode.values()].flat()).toEqual([]);
  });

  describe("Streckenzuordnung: Anmeldung vs. Scans", () => {
    // Anmeldung sagt rtf-49, aber die Scans (START,K9,K2,FINISH) passen nur zu rtf-90.
    const rosterEntries = [roster("1", "RTF", "rtf-49")];
    const scans = [
      scan("1", "START", "2026-07-25T09:00:00Z"),
      scan("1", "K9", "2026-07-25T09:10:00Z"),
      scan("1", "K2", "2026-07-25T09:20:00Z"),
      scan("1", "FINISH", "2026-07-25T09:30:00Z"),
    ];

    it('gruppiert im Modus "registered" nach der Anmeldung, auch bei abweichenden Scans', () => {
      const result = computeRanking(rosterEntries, scans, ROUTES, NOW, "registered");
      expect(result.get("rtf-49")?.map((r) => r.startNumber)).toEqual(["1"]);
      expect(result.get("rtf-90") ?? []).toEqual([]);
    });

    it('gruppiert im Modus "scans" nach der aus den Checkpoints abgeleiteten Strecke', () => {
      const result = computeRanking(rosterEntries, scans, ROUTES, NOW, "scans");
      expect(result.get("rtf-90")?.map((r) => r.startNumber)).toEqual(["1"]);
      expect(result.get("rtf-49") ?? []).toEqual([]);
    });

    it("markiert routeMismatch, wenn Anmeldung und Scan-Ableitung sich widersprechen", () => {
      const result = computeRanking(rosterEntries, scans, ROUTES, NOW, "registered");
      expect(result.get("rtf-49")?.[0].routeMismatch).toBe(true);
    });
  });

  it("markiert routeMismatch NICHT, wenn Anmeldung und Scans übereinstimmen", () => {
    const rosterEntries = [roster("1", "RTF", "rtf-49")];
    const scans = [
      scan("1", "START", "2026-07-25T09:00:00Z"),
      scan("1", "K1", "2026-07-25T09:10:00Z"),
      scan("1", "FINISH", "2026-07-25T09:20:00Z"),
    ];

    const result = computeRanking(rosterEntries, scans, ROUTES, NOW, "registered");
    expect(result.get("rtf-49")?.[0].routeMismatch).toBe(false);
  });

  it("fällt ohne Anmeldung auf die Scan-Ableitung zurück, auch im Modus 'registered'", () => {
    const rosterEntries = [roster("1", "RTF", undefined)];
    const scans = [
      scan("1", "START", "2026-07-25T09:00:00Z"),
      scan("1", "K1", "2026-07-25T09:10:00Z"),
      scan("1", "FINISH", "2026-07-25T09:20:00Z"),
    ];

    const result = computeRanking(rosterEntries, scans, ROUTES, NOW, "registered");
    expect(result.get("rtf-49")?.map((r) => r.startNumber)).toEqual(["1"]);
  });

  it("fällt ohne eindeutig ableitbare Scan-Strecke auf die Anmeldung zurück, auch im Modus 'scans'", () => {
    // Sequenz passt sowohl zu rtf-49 als auch zu rtf-90 (Teilfolge von beiden) -> mehrdeutig.
    const rosterEntries = [roster("1", "RTF", "rtf-49")];
    const scans = [scan("1", "START", "2026-07-25T09:00:00Z"), scan("1", "FINISH", "2026-07-25T09:20:00Z")];

    const result = computeRanking(rosterEntries, scans, ROUTES, NOW, "scans");
    expect(result.get("rtf-49")?.map((r) => r.startNumber)).toEqual(["1"]);
  });
});
