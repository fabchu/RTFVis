import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getAllScans,
  getPollerState,
  getRoster,
  insertScans,
  openDb,
  replaceRoster,
  setPollerState,
  type Db,
} from "../src/db.js";

let db: Db;

beforeEach(() => {
  db = openDb(":memory:");
});

afterEach(() => {
  db.close();
});

describe("insertScans", () => {
  it("fügt neue Scans ein und gibt die Anzahl zurück", () => {
    const inserted = insertScans(db, [
      { startNumber: "101", checkpointId: "CP1", timestampUtc: "2026-07-25T09:00:00.000Z" },
      { startNumber: "102", checkpointId: "CP1", timestampUtc: "2026-07-25T09:01:00.000Z" },
    ]);
    expect(inserted).toBe(2);
    expect(getAllScans(db)).toHaveLength(2);
  });

  it("dedupliziert exakt gleiche (start_number, checkpoint_id, timestamp_utc) — auch bei erneutem Poll mit Überlappung", () => {
    insertScans(db, [{ startNumber: "101", checkpointId: "CP1", timestampUtc: "2026-07-25T09:00:00.000Z" }]);
    const insertedSecondTime = insertScans(db, [
      { startNumber: "101", checkpointId: "CP1", timestampUtc: "2026-07-25T09:00:00.000Z" },
      { startNumber: "101", checkpointId: "CP2", timestampUtc: "2026-07-25T09:30:00.000Z" },
    ]);
    expect(insertedSecondTime).toBe(1);
    expect(getAllScans(db)).toHaveLength(2);
  });

  it("verwirft KEINEN zweiten Scan desselben Checkpoints mit anderem Zeitstempel (Schleifenstrecke)", () => {
    // Manche Strecken besuchen denselben Checkpoint zweimal (z.B. eine Schleife) — ein
    // Fahrer kann daher legitim zwei Scans mit derselben checkpoint_id haben, nur zu
    // unterschiedlichen Zeiten. Der Unique-Key darf das nicht als Duplikat behandeln.
    insertScans(db, [{ startNumber: "101", checkpointId: "K3", timestampUtc: "2026-07-25T09:00:00.000Z" }]);
    const insertedSecondTime = insertScans(db, [
      { startNumber: "101", checkpointId: "K3", timestampUtc: "2026-07-25T11:00:00.000Z" },
    ]);
    expect(insertedSecondTime).toBe(1);
    expect(getAllScans(db)).toHaveLength(2);
  });

  it("liefert Scans sortiert nach Zeitstempel aufsteigend", () => {
    insertScans(db, [
      { startNumber: "101", checkpointId: "CP2", timestampUtc: "2026-07-25T09:30:00.000Z" },
      { startNumber: "101", checkpointId: "CP1", timestampUtc: "2026-07-25T09:00:00.000Z" },
    ]);
    const scans = getAllScans(db);
    expect(scans.map((s) => s.checkpointId)).toEqual(["CP1", "CP2"]);
  });
});

describe("replaceRoster / getRoster", () => {
  it("ersetzt den kompletten Roster-Bestand", () => {
    replaceRoster(db, [{ startNumber: "101", category: "RTF", routeId: "rtf-90" }]);
    replaceRoster(db, [
      { startNumber: "102", category: "CTF" },
      { startNumber: "103", category: "Jedermann", routeId: "jm-30" },
    ]);

    const roster = getRoster(db);
    expect(roster).toHaveLength(2);
    expect(roster.find((r) => r.startNumber === "101")).toBeUndefined();
    expect(roster.find((r) => r.startNumber === "102")?.routeId).toBeUndefined();
  });

  it("crasht nicht bei doppelter Startnummer im selben Batch, sondern übernimmt den letzten Eintrag (Regression)", () => {
    // Reales Beispiel aus dem Sheet: Startnummer 13 kam zweimal vor (Tippfehler/nachträglich
    // korrigierte Zeile) und ließ den reinen INSERT vorher mit UNIQUE constraint failed
    // crashen -- das hätte am Renntag jeden weiteren Poll blockiert.
    replaceRoster(db, [
      { startNumber: "13", category: "Jedermann", routeId: "jed-13" },
      { startNumber: "13", category: "Jedermann", routeId: "jed-13-korrigiert" },
    ]);

    const roster = getRoster(db);
    expect(roster).toHaveLength(1);
    expect(roster[0]).toEqual({ startNumber: "13", category: "Jedermann", routeId: "jed-13-korrigiert" });
  });
});

describe("poller_state", () => {
  it("gibt null zurück, wenn kein Wert gesetzt ist", () => {
    expect(getPollerState(db, "unknownKey")).toBeNull();
  });

  it("speichert und überschreibt Werte", () => {
    setPollerState(db, "lastSeenMaxScanTimestampUtc", "2026-07-25T09:00:00.000Z");
    expect(getPollerState(db, "lastSeenMaxScanTimestampUtc")).toBe("2026-07-25T09:00:00.000Z");

    setPollerState(db, "lastSeenMaxScanTimestampUtc", "2026-07-25T10:00:00.000Z");
    expect(getPollerState(db, "lastSeenMaxScanTimestampUtc")).toBe("2026-07-25T10:00:00.000Z");
  });
});
