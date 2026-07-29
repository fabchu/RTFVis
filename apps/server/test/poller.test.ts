import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAllScans, getRoster, openDb, type Db } from "../src/db.js";
import { pollOnce, startPolling } from "../src/poller.js";
import type { ScanSource } from "../src/sources/types.js";

const TEST_CHECKPOINT_IDS = ["START", "K1", "K2", "K3/5", "K4", "FINISH"];

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
    await pollOnce(source, db, TEST_CHECKPOINT_IDS);
    expect(source.fetchScansSince).toHaveBeenCalledWith(null);
  });

  it("inserted Scans und meldet Roster-Größe", async () => {
    const source = mockSource();
    (source.fetchScansSince as ReturnType<typeof vi.fn>).mockResolvedValue([
      { startNumber: "101", checkpointId: "CP1", timestampUtc: "2026-07-25T09:00:00.000Z" },
    ]);

    const result = await pollOnce(source, db, TEST_CHECKPOINT_IDS);
    expect(result).toEqual({ insertedScans: 1, rosterSize: 1 });
  });

  it("fragt beim zweiten Poll mit since = letztem Zeitstempel minus 15-Minuten-Sicherheitsspanne", async () => {
    const source = mockSource();
    (source.fetchScansSince as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { startNumber: "101", checkpointId: "CP1", timestampUtc: "2026-07-25T09:30:00.000Z" },
    ]);
    await pollOnce(source, db, TEST_CHECKPOINT_IDS);

    (source.fetchScansSince as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    await pollOnce(source, db, TEST_CHECKPOINT_IDS);

    expect(source.fetchScansSince).toHaveBeenNthCalledWith(2, "2026-07-25T09:15:00.000Z");
  });

  it("löst ausgeschriebene Checkpoint-Bezeichnungen im Sheet auf unsere kurze interne ID auf (echte Sheet-Beispiele)", async () => {
    const source = mockSource();
    (source.fetchScansSince as ReturnType<typeof vi.fn>).mockResolvedValue([
      { startNumber: "20", checkpointId: "K2 RTF Garbenteich", timestampUtc: "2026-07-29T11:07:19.000Z" },
      { startNumber: "20", checkpointId: "K3/5 RTF Oberwetz", timestampUtc: "2026-07-29T11:07:33.000Z" },
      { startNumber: "20", checkpointId: "K4 RTF Dornholzhausen", timestampUtc: "2026-07-29T11:07:42.000Z" },
      // Leerzeichen mitten in der ID -- darf nicht an "K1" hängenbleiben.
      { startNumber: "21", checkpointId: "K 7/8 CTF Bodenrod", timestampUtc: "2026-07-29T11:09:48.000Z" },
      { startNumber: "21", checkpointId: "K 10 CTF Sportplatz Pohlgöns", timestampUtc: "2026-07-29T11:09:59.000Z" },
      { startNumber: "22", checkpointId: "K11 Jedermann", timestampUtc: "2026-07-29T11:10:07.000Z" },
    ]);

    await pollOnce(
      source,
      db,
      ["START", "K1", "K2", "K3/5", "K4", "K6/9", "K7/8", "K10", "K11", "FINISH"],
    );

    const scans = getAllScans(db);
    expect(scans.map((s) => s.checkpointId)).toEqual(["K2", "K3/5", "K4", "K7/8", "K10", "K11"]);
  });

  it("löst Sheet-Streckenbezeichnungen im Roster vor dem Speichern in unsere interne Routen-ID auf", async () => {
    const source = mockSource();
    (source.fetchRoster as ReturnType<typeof vi.fn>).mockResolvedValue([
      { startNumber: "101", category: "RTF", routeId: "RTF - 49 km" },
      { startNumber: "102", category: "CTF", routeId: "unbekannte Streckenbezeichnung" },
    ]);

    await pollOnce(source, db, TEST_CHECKPOINT_IDS);

    const roster = getRoster(db);
    expect(roster.find((r) => r.startNumber === "101")?.routeId).toBe("rtf-49");
    expect(roster.find((r) => r.startNumber === "102")?.routeId).toBeUndefined();
  });

  it("dedupliziert erneut gemeldete Scans über die Sicherheitsspanne hinweg", async () => {
    const source = mockSource();
    const scan = { startNumber: "101", checkpointId: "CP1", timestampUtc: "2026-07-25T09:30:00.000Z" };
    (source.fetchScansSince as ReturnType<typeof vi.fn>).mockResolvedValueOnce([scan]);
    await pollOnce(source, db, TEST_CHECKPOINT_IDS);

    // Zweiter Poll liefert denselben Scan erneut (Überlappungsfenster) plus einen neuen.
    (source.fetchScansSince as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      scan,
      { startNumber: "101", checkpointId: "CP2", timestampUtc: "2026-07-25T09:45:00.000Z" },
    ]);
    const result = await pollOnce(source, db, TEST_CHECKPOINT_IDS);

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

    const handle = startPolling(source, db, { intervalMs: 1000, validCheckpointIds: TEST_CHECKPOINT_IDS, onPollSuccess });

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

    const handle = startPolling(source, db, { intervalMs: 1000, validCheckpointIds: TEST_CHECKPOINT_IDS, maxBackoffMs: 10_000, onPollError });

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
    const handle = startPolling(source, db, { intervalMs: 1000, validCheckpointIds: TEST_CHECKPOINT_IDS, onPollSuccess });

    await vi.advanceTimersByTimeAsync(0);
    handle.stop();
    await vi.advanceTimersByTimeAsync(5000);

    expect(onPollSuccess).toHaveBeenCalledTimes(1);
  });
});
