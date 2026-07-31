import type { CheckpointDef, ScanRecord } from "@rtfvis/core";
import { describe, expect, it } from "vitest";
import { computeCheckpointSyncStatus } from "../src/checkpointSyncStatus.js";

const checkpointsById = new Map<string, CheckpointDef>([
  ["K1", { id: "K1", name: "Villingen", lat: 0, lon: 0 }],
  ["K2", { id: "K2", name: "Garbenteich", lat: 0, lon: 0 }],
]);

function scan(overrides: Partial<ScanRecord>): ScanRecord {
  return { startNumber: "101", checkpointId: "K1", timestampUtc: "2026-07-25T09:00:00Z", ...overrides };
}

describe("computeCheckpointSyncStatus", () => {
  it("ignoriert Scans ohne technicalTimestampUtc (z.B. synthetisierte Start-/Ziel-Scans)", () => {
    const rows = computeCheckpointSyncStatus(
      [scan({ checkpointId: "START", technicalTimestampUtc: undefined })],
      checkpointsById,
    );
    expect(rows).toEqual([]);
  });

  it("nimmt je Kontrollstation den Scan mit dem spätesten technicalTimestampUtc", () => {
    const rows = computeCheckpointSyncStatus(
      [
        scan({ startNumber: "101", checkpointId: "K1", timestampUtc: "2026-07-25T09:00:00Z", technicalTimestampUtc: "2026-07-25T09:00:05Z" }),
        scan({ startNumber: "102", checkpointId: "K1", timestampUtc: "2026-07-25T09:10:00Z", technicalTimestampUtc: "2026-07-25T09:10:20Z" }),
      ],
      checkpointsById,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      checkpointId: "K1",
      checkpointName: "Villingen",
      lastEventTimeUtc: "2026-07-25T09:10:00Z",
      lastTechnicalTimeUtc: "2026-07-25T09:10:20Z",
    });
  });

  it("löst den Checkpoint-Namen auf, fällt auf die ID zurück, wenn unbekannt", () => {
    const rows = computeCheckpointSyncStatus(
      [scan({ checkpointId: "UNBEKANNT", technicalTimestampUtc: "2026-07-25T09:00:05Z" })],
      checkpointsById,
    );
    expect(rows[0].checkpointName).toBe("UNBEKANNT");
  });

  it("sortiert nach zuletzt angekommen aufsteigend (am längsten her zuerst)", () => {
    const rows = computeCheckpointSyncStatus(
      [
        scan({ checkpointId: "K1", technicalTimestampUtc: "2026-07-25T09:20:00Z" }),
        scan({ checkpointId: "K2", technicalTimestampUtc: "2026-07-25T09:05:00Z" }),
      ],
      checkpointsById,
    );
    expect(rows.map((r) => r.checkpointId)).toEqual(["K2", "K1"]);
  });

  it("liefert mehrere Kontrollstationen unabhängig voneinander", () => {
    const rows = computeCheckpointSyncStatus(
      [
        scan({ checkpointId: "K1", technicalTimestampUtc: "2026-07-25T09:00:05Z" }),
        scan({ checkpointId: "K2", technicalTimestampUtc: "2026-07-25T09:05:05Z" }),
      ],
      checkpointsById,
    );
    expect(rows.map((r) => r.checkpointId).sort()).toEqual(["K1", "K2"]);
  });
});
