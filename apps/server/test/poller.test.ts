import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRoster, openDb, type Db } from "../src/db.js";
import { pollOnce, startPolling } from "../src/poller.js";
import type { ScanSource } from "../src/sources/types.js";

let db: Db;

beforeEach(() => {
  db = openDb(":memory:");
});

afterEach(() => {
  db.close();
});

function mockSource(): ScanSource {
  return {
    fetchRoster: vi.fn().mockResolvedValue([{ startNumber: "101", category: "RTF" }]),
    fetchScansSince: vi.fn().mockResolvedValue([]),
  };
}

describe("pollOnce", () => {
  it("fragt beim ersten Poll ohne since (kompletter Bestand)", async () => {
    const source = mockSource();
    await pollOnce(source, db);
    expect(source.fetchScansSince).toHaveBeenCalledWith(null);
  });

  it("inserted Scans und meldet Roster-Größe", async () => {
    const source = mockSource();
    (source.fetchScansSince as ReturnType<typeof vi.fn>).mockResolvedValue([
      { startNumber: "101", checkpointId: "CP1", timestampUtc: "2026-07-25T09:00:00.000Z" },
    ]);

    const result = await pollOnce(source, db);
    expect(result).toEqual({ insertedScans: 1, rosterSize: 1 });
  });

  it("fragt beim zweiten Poll mit since = letztem Zeitstempel minus 15-Minuten-Sicherheitsspanne", async () => {
    const source = mockSource();
    (source.fetchScansSince as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { startNumber: "101", checkpointId: "CP1", timestampUtc: "2026-07-25T09:30:00.000Z" },
    ]);
    await pollOnce(source, db);

    (source.fetchScansSince as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    await pollOnce(source, db);

    expect(source.fetchScansSince).toHaveBeenNthCalledWith(2, "2026-07-25T09:15:00.000Z");
  });

  it("löst Sheet-Streckenbezeichnungen im Roster vor dem Speichern in unsere interne Routen-ID auf", async () => {
    const source = mockSource();
    (source.fetchRoster as ReturnType<typeof vi.fn>).mockResolvedValue([
      { startNumber: "101", category: "RTF", routeId: "RTF - 49 km" },
      { startNumber: "102", category: "CTF", routeId: "unbekannte Streckenbezeichnung" },
    ]);

    await pollOnce(source, db);

    const roster = getRoster(db);
    expect(roster.find((r) => r.startNumber === "101")?.routeId).toBe("rtf-49");
    expect(roster.find((r) => r.startNumber === "102")?.routeId).toBeUndefined();
  });

  it("dedupliziert erneut gemeldete Scans über die Sicherheitsspanne hinweg", async () => {
    const source = mockSource();
    const scan = { startNumber: "101", checkpointId: "CP1", timestampUtc: "2026-07-25T09:30:00.000Z" };
    (source.fetchScansSince as ReturnType<typeof vi.fn>).mockResolvedValueOnce([scan]);
    await pollOnce(source, db);

    // Zweiter Poll liefert denselben Scan erneut (Überlappungsfenster) plus einen neuen.
    (source.fetchScansSince as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      scan,
      { startNumber: "101", checkpointId: "CP2", timestampUtc: "2026-07-25T09:45:00.000Z" },
    ]);
    const result = await pollOnce(source, db);

    expect(result.insertedScans).toBe(1);
  });
});

describe("startPolling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("pollt sofort und danach im konfigurierten Intervall", async () => {
    const source = mockSource();
    const onPollSuccess = vi.fn();

    const handle = startPolling(source, db, { intervalMs: 1000, onPollSuccess });

    await vi.advanceTimersByTimeAsync(0);
    expect(onPollSuccess).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(onPollSuccess).toHaveBeenCalledTimes(2);

    handle.stop();
  });

  it("erhöht das Intervall exponentiell nach Fehlern und meldet sie", async () => {
    const source = mockSource();
    (source.fetchRoster as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Netzwerkfehler"));
    const onPollError = vi.fn();

    const handle = startPolling(source, db, { intervalMs: 1000, maxBackoffMs: 10_000, onPollError });

    await vi.advanceTimersByTimeAsync(0);
    expect(onPollError).toHaveBeenCalledTimes(1);
    expect(onPollError).toHaveBeenLastCalledWith(expect.any(Error), 1);

    // Backoff nach 1. Fehler: intervalMs * 2^1 = 2000ms
    await vi.advanceTimersByTimeAsync(2000);
    expect(onPollError).toHaveBeenCalledTimes(2);
    expect(onPollError).toHaveBeenLastCalledWith(expect.any(Error), 2);

    handle.stop();
  });

  it("stoppt zukünftige Polls nach stop()", async () => {
    const source = mockSource();
    const onPollSuccess = vi.fn();
    const handle = startPolling(source, db, { intervalMs: 1000, onPollSuccess });

    await vi.advanceTimersByTimeAsync(0);
    handle.stop();
    await vi.advanceTimersByTimeAsync(5000);

    expect(onPollSuccess).toHaveBeenCalledTimes(1);
  });
});
