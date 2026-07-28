import type { ScanRecord } from "@rtfvis/core";
import { describe, expect, it } from "vitest";
import { advanceReplayTimeMs, clampMs, computeReplayBounds } from "../src/clock.js";

describe("computeReplayBounds", () => {
  it("nimmt frühesten und spätesten Scan-Zeitstempel als Grenzen", () => {
    const scans: ScanRecord[] = [
      { startNumber: "1", checkpointId: "CP1", timestampUtc: "2026-07-25T09:00:00Z" },
      { startNumber: "2", checkpointId: "CP1", timestampUtc: "2026-07-25T08:00:00Z" },
      { startNumber: "1", checkpointId: "CP2", timestampUtc: "2026-07-25T10:00:00Z" },
    ];
    const bounds = computeReplayBounds(scans, 0);
    expect(bounds).toEqual({ minMs: Date.parse("2026-07-25T08:00:00Z"), maxMs: Date.parse("2026-07-25T10:00:00Z") });
  });

  it("fällt ohne Scans auf den übergebenen Zeitpunkt zurück (min=max)", () => {
    const bounds = computeReplayBounds([], 12345);
    expect(bounds).toEqual({ minMs: 12345, maxMs: 12345 });
  });
});

describe("clampMs", () => {
  const bounds = { minMs: 1000, maxMs: 2000 };

  it("lässt Werte innerhalb der Grenzen unverändert", () => {
    expect(clampMs(1500, bounds)).toBe(1500);
  });

  it("kappt nach unten und oben", () => {
    expect(clampMs(500, bounds)).toBe(1000);
    expect(clampMs(2500, bounds)).toBe(2000);
  });
});

describe("advanceReplayTimeMs", () => {
  const bounds = { minMs: 0, maxMs: 100_000 };

  it("rückt die Zeit um vergangene Realzeit * Geschwindigkeit vor", () => {
    // 500ms real * 60x -> 30000ms Replay-Fortschritt
    expect(advanceReplayTimeMs(0, 500, 60, bounds)).toBe(30_000);
  });

  it("kappt am Ende des Replay-Bereichs", () => {
    expect(advanceReplayTimeMs(90_000, 1000, 500, bounds)).toBe(100_000);
  });

  it("bewegt sich bei Geschwindigkeit 1 im Echtzeit-Tempo", () => {
    expect(advanceReplayTimeMs(1000, 250, 1, bounds)).toBe(1250);
  });
});
