import type { CheckpointDef, RiderPosition, ScanRecord } from "@rtfvis/core";
import { describe, expect, it } from "vitest";
import { computeLatenessMs, computeSafetyOverview } from "../src/safety.js";

const checkpointsById = new Map<string, CheckpointDef>([
  ["START", { id: "START", name: "Start/Ziel", lat: 0, lon: 0 }],
  ["CP1", { id: "CP1", name: "Checkpoint 1", lat: 0, lon: 0 }],
  ["CP2", { id: "CP2", name: "Checkpoint 2", lat: 0, lon: 0 }],
]);

function position(overrides: Partial<RiderPosition>): RiderPosition {
  return {
    startNumber: "101",
    status: "overdue",
    category: "RTF",
    routeId: "rtf-90",
    candidateRouteIds: ["rtf-90"],
    rosterConflict: false,
    distanceM: 19_800,
    position: { lon: 8.65, lat: 49.85 },
    speedMps: 5,
    lastCheckpointId: "CP1",
    lastCheckpointTimeUtc: "2026-07-25T08:00:00Z",
    nextCheckpointId: "CP2",
    lastCheckpointDistanceM: 10_000,
    nextCheckpointDistanceM: 20_000,
    ...overrides,
  };
}

function scan(startNumber: string, checkpointId: string, timestampUtc: string): ScanRecord {
  return { startNumber, checkpointId, timestampUtc };
}

const NOW = Date.parse("2026-07-25T09:00:00Z");

describe("computeLatenessMs", () => {
  it("ist positiv, wenn ein Fahrer den nächsten Checkpoint bereits überfällig ist", () => {
    // CP1 vor 60 Min, erwartete Fahrzeit 10000m/5m/s=2000s=33.3min -> ~26.7 Min überfällig
    const p = position({ lastCheckpointTimeUtc: "2026-07-25T08:00:00Z" });
    const latenessMs = computeLatenessMs(p, NOW);
    expect(latenessMs).not.toBeNull();
    expect(latenessMs!).toBeGreaterThan(0);
    expect(latenessMs! / 60_000).toBeCloseTo(26.7, 1);
  });

  it("ist negativ, wenn rechnerisch noch Zeit bis zum nächsten Checkpoint übrig ist", () => {
    const p = position({ status: "onCourse", lastCheckpointTimeUtc: "2026-07-25T08:55:00Z" });
    const latenessMs = computeLatenessMs(p, NOW);
    expect(latenessMs).not.toBeNull();
    expect(latenessMs!).toBeLessThan(0);
  });

  it("gibt null zurück ohne Tempo (z.B. finished/routeConflict)", () => {
    expect(computeLatenessMs(position({ speedMps: null }), NOW)).toBeNull();
  });

  it("gibt null zurück, wenn die Streckendistanzen unbekannt sind (z.B. routeConflict)", () => {
    expect(computeLatenessMs(position({ lastCheckpointDistanceM: null, nextCheckpointDistanceM: null }), NOW)).toBeNull();
  });

  it("bleibt unabhängig von der (bei Überfälligkeit gekappten) distanceM — Regression", () => {
    // Zwei ansonsten identische Fahrer, nur distanceM unterscheidet sich (wie beim Clamp)
    // -> die Verspätung darf trotzdem exakt gleich sein, da sie NICHT auf distanceM beruht.
    const a = computeLatenessMs(position({ distanceM: 19_800 }), NOW);
    const b = computeLatenessMs(position({ distanceM: 19_801 }), NOW);
    expect(a).toBe(b);
  });
});

describe("computeSafetyOverview", () => {
  it("sortiert unbekannten Standort (routeConflict/ambiguousRoute) vor overdue, unabhängig von der Verspätung", () => {
    const positions = [
      position({ startNumber: "overdue-stark", lastCheckpointTimeUtc: "2026-07-25T05:00:00Z" }),
      position({
        startNumber: "konflikt",
        status: "routeConflict",
        lastCheckpointId: null,
        nextCheckpointId: null,
        lastCheckpointDistanceM: null,
        nextCheckpointDistanceM: null,
      }),
      position({
        startNumber: "unklar",
        status: "ambiguousRoute",
        nextCheckpointId: null,
        routeId: null,
        nextCheckpointDistanceM: null,
      }),
    ];
    const result = computeSafetyOverview(positions, checkpointsById, [], NOW);
    expect(result.map((r) => r.position.startNumber)).toEqual(["konflikt", "unklar", "overdue-stark"]);
  });

  it("sortiert innerhalb derselben Dringlichkeitsstufe absteigend nach Verspätung", () => {
    const positions = [
      position({ startNumber: "leicht", lastCheckpointTimeUtc: "2026-07-25T07:30:00Z" }),
      position({ startNumber: "stark", lastCheckpointTimeUtc: "2026-07-25T06:00:00Z" }),
    ];
    const result = computeSafetyOverview(positions, checkpointsById, [], NOW);
    expect(result.map((r) => r.position.startNumber)).toEqual(["stark", "leicht"]);
  });

  it("zeigt onCourse-Fahrer nach overdue, aber vor notStarted/finished", () => {
    const positions = [
      position({
        startNumber: "finished",
        status: "finished",
        nextCheckpointId: null,
        speedMps: null,
        nextCheckpointDistanceM: null,
      }),
      position({
        startNumber: "notstarted",
        status: "notStarted",
        lastCheckpointId: null,
        lastCheckpointTimeUtc: null,
        nextCheckpointId: null,
        lastCheckpointDistanceM: null,
        nextCheckpointDistanceM: null,
      }),
      position({ startNumber: "onCourse", status: "onCourse", lastCheckpointTimeUtc: "2026-07-25T08:55:00Z" }),
      position({ startNumber: "overdue" }),
    ];
    const result = computeSafetyOverview(positions, checkpointsById, [], NOW);
    expect(result.map((r) => r.position.startNumber)).toEqual(["overdue", "onCourse", "notstarted", "finished"]);
  });

  it("löst Checkpoint-IDs auf lesbare Namen auf", () => {
    const result = computeSafetyOverview([position({})], checkpointsById, [], NOW);
    expect(result[0].lastCheckpointName).toBe("Checkpoint 1");
    expect(result[0].nextCheckpointName).toBe("Checkpoint 2");
  });

  it("liefert die erwartete Ankunftszeit aus der Zeit des letzten Checkpoints plus erwarteter Fahrzeit, unabhängig von jetzt/distanceM", () => {
    // CP1(10000)->CP2(20000): 10000m bei 5m/s -> 2000s nach lastCheckpointTimeUtc, NICHT nach NOW.
    const result = computeSafetyOverview(
      [position({ status: "onCourse", distanceM: 15_000, lastCheckpointTimeUtc: "2026-07-25T08:00:00Z" })],
      checkpointsById,
      [],
      NOW,
    );
    expect(result[0].expectedNextArrivalMs).toBe(Date.parse("2026-07-25T08:00:00Z") + 2000 * 1000);
  });

  it("liefert bei einem mehrfach besuchten Checkpoint keine Ankunft vor dem letzten Scan (Regression)", () => {
    // Siehe nextArrival.test.ts für den Hintergrund: route.checkpoints.find(id) hätte bei
    // einem zweiten K3-Vorkommen fälschlich das ERSTE (frühere) K3 getroffen.
    const result = computeSafetyOverview(
      [
        position({
          lastCheckpointId: "K4",
          nextCheckpointId: "K3",
          lastCheckpointDistanceM: 90_000,
          nextCheckpointDistanceM: 102_000,
          lastCheckpointTimeUtc: "2026-07-25T08:00:00Z",
          speedMps: 10,
        }),
      ],
      checkpointsById,
      [],
      NOW,
    );
    const lastCheckpointTimeMs = Date.parse("2026-07-25T08:00:00Z");
    expect(result[0].expectedNextArrivalMs).not.toBeNull();
    expect(result[0].expectedNextArrivalMs!).toBeGreaterThan(lastCheckpointTimeMs);
  });

  it("ermittelt den Zeitpunkt des ersten Scans als startedAtMs", () => {
    const scans = [scan("101", "START", "2026-07-25T06:00:00Z"), scan("101", "CP1", "2026-07-25T08:00:00Z")];
    const result = computeSafetyOverview([position({})], checkpointsById, scans, NOW);
    expect(result[0].startedAtMs).toBe(Date.parse("2026-07-25T06:00:00Z"));
  });

  it("gibt startedAtMs/isSternfahrer als null zurück, wenn noch kein Scan vorliegt", () => {
    const result = computeSafetyOverview([position({})], checkpointsById, [], NOW);
    expect(result[0].startedAtMs).toBeNull();
    expect(result[0].isSternfahrer).toBeNull();
  });

  it("erkennt KEINEN Sternfahrer, wenn der erste Scan am START-Checkpoint liegt", () => {
    const scans = [scan("101", "START", "2026-07-25T06:00:00Z"), scan("101", "CP1", "2026-07-25T08:00:00Z")];
    const result = computeSafetyOverview([position({})], checkpointsById, scans, NOW);
    expect(result[0].isSternfahrer).toBe(false);
  });

  it("erkennt einen Sternfahrer, wenn der erste Scan NICHT am START-Checkpoint liegt", () => {
    const scans = [scan("101", "CP1", "2026-07-25T06:00:00Z"), scan("101", "START", "2026-07-25T08:00:00Z")];
    const result = computeSafetyOverview([position({})], checkpointsById, scans, NOW);
    expect(result[0].isSternfahrer).toBe(true);
  });
});
