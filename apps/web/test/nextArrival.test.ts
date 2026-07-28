import type { RiderPosition } from "@rtfvis/core";
import { describe, expect, it } from "vitest";
import { estimateNextArrivalMs } from "../src/nextArrival.js";

function position(overrides: Partial<RiderPosition>): RiderPosition {
  return {
    startNumber: "101",
    status: "onCourse",
    category: "RTF",
    routeId: "rtf-90",
    candidateRouteIds: ["rtf-90"],
    rosterConflict: false,
    distanceM: 15_000,
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

describe("estimateNextArrivalMs", () => {
  it("berechnet die erwartete Ankunftszeit aus der Zeit des letzten Checkpoints plus erwarteter Fahrzeit", () => {
    // 10000m bei 5 m/s -> 2000s
    const result = estimateNextArrivalMs(position({}));
    expect(result).toBe(Date.parse("2026-07-25T08:00:00Z") + 2000 * 1000);
  });

  it("liefert einen Zeitpunkt in der Vergangenheit für einen bereits stark überfälligen Fahrer (Regression)", () => {
    // distanceM ist bei Überfälligkeit nahe des nächsten Checkpoints eingefroren (Clamp) —
    // die Berechnung darf sich davon NICHT beeinflussen lassen, sondern muss weiterhin die
    // ursprünglich erwartete Ankunftszeit relativ zum letzten Checkpoint liefern, auch wenn
    // die schon lange vorbei ist.
    const p = position({ status: "overdue", distanceM: 19_800, lastCheckpointTimeUtc: "2026-07-25T00:00:00Z" });
    const result = estimateNextArrivalMs(p);
    const now = Date.parse("2026-07-25T08:00:00Z");
    expect(result).not.toBeNull();
    expect(result!).toBeLessThan(now);
    expect(result).toBe(Date.parse("2026-07-25T00:00:00Z") + 2000 * 1000);
  });

  it("bleibt bei einem mehrfach besuchten Checkpoint korrekt, statt eine Ankunft VOR dem letzten Scan zu liefern (Regression)", () => {
    // Nachgebautes rtf-159-Muster: K3 kommt zweimal vor (früh bei 20000m, erneut spät bei
    // 102000m). Ein früherer Bug löste Checkpoint-IDs naiv über route.checkpoints.find(id)
    // auf — das trifft IMMER das ERSTE Vorkommen. Ist der Fahrer tatsächlich beim K4->K3(2.)
    // Abschnitt, würde das fälschlich das FRÜHE K3 (20000m, vor K4) statt des späten K3
    // (102000m) verwenden -> negative erwartete Fahrzeit -> Ankunft "vor" dem letzten Scan.
    // lastCheckpointDistanceM/nextCheckpointDistanceM sind positionsbasiert aufgelöst (siehe
    // position.ts) und dürfen sich davon nicht täuschen lassen.
    const p = position({
      lastCheckpointId: "K4",
      nextCheckpointId: "K3",
      lastCheckpointDistanceM: 90_000, // K4
      nextCheckpointDistanceM: 102_000, // K3, ZWEITES Vorkommen (nicht das erste bei 20000m!)
      lastCheckpointTimeUtc: "2026-07-25T08:00:00Z",
      speedMps: 10,
    });
    const result = estimateNextArrivalMs(p);
    const lastCheckpointTimeMs = Date.parse("2026-07-25T08:00:00Z");
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(lastCheckpointTimeMs);
    expect(result).toBe(lastCheckpointTimeMs + 1200 * 1000); // (102000-90000)/10 = 1200s
  });

  it("gibt null zurück ohne lastCheckpointTimeUtc", () => {
    expect(estimateNextArrivalMs(position({ lastCheckpointTimeUtc: null }))).toBeNull();
  });

  it("gibt null zurück ohne lastCheckpointDistanceM oder nextCheckpointDistanceM", () => {
    expect(estimateNextArrivalMs(position({ lastCheckpointDistanceM: null }))).toBeNull();
    expect(estimateNextArrivalMs(position({ nextCheckpointDistanceM: null }))).toBeNull();
  });

  it("gibt null zurück ohne Tempo", () => {
    expect(estimateNextArrivalMs(position({ speedMps: null }))).toBeNull();
    expect(estimateNextArrivalMs(position({ speedMps: 0 }))).toBeNull();
  });
});
