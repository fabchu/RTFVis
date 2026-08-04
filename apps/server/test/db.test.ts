import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getAllScans,
  getIgnoredRiders,
  getPollerState,
  getRoster,
  ignoreRider,
  insertScans,
  openDb,
  replaceRoster,
  setPollerState,
  unignoreRider,
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

  it("speichert und liefert technicalTimestampUtc, wenn vorhanden (Kontrollen-Scans)", () => {
    insertScans(db, [
      {
        startNumber: "101",
        checkpointId: "K1",
        timestampUtc: "2026-07-25T09:00:00.000Z",
        technicalTimestampUtc: "2026-07-25T09:00:05.000Z",
      },
    ]);
    expect(getAllScans(db)[0].technicalTimestampUtc).toBe("2026-07-25T09:00:05.000Z");
  });

  it("lässt technicalTimestampUtc undefined statt null, wenn nicht vorhanden (Start/Ziel-Scans)", () => {
    insertScans(db, [{ startNumber: "101", checkpointId: "START", timestampUtc: "2026-07-25T09:00:00.000Z" }]);
    expect(getAllScans(db)[0].technicalTimestampUtc).toBeUndefined();
  });
});

describe("openDb Migration", () => {
  it("ergänzt technical_timestamp_utc in einer bereits bestehenden DB-Datei ohne diese Spalte", () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "rtfvis-db-migration-test-"));
    const dbPath = path.join(dataDir, "old-schema.db");
    try {
      // Simuliert den Stand VOR Einführung von technical_timestamp_utc.
      const oldDb = new DatabaseSync(dbPath);
      oldDb.exec(`
        CREATE TABLE scans (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          start_number TEXT NOT NULL,
          checkpoint_id TEXT NOT NULL,
          timestamp_utc TEXT NOT NULL,
          UNIQUE(start_number, checkpoint_id, timestamp_utc)
        );
      `);
      oldDb.prepare(`INSERT INTO scans (start_number, checkpoint_id, timestamp_utc) VALUES (?, ?, ?)`).run(
        "101",
        "K1",
        "2026-07-25T09:00:00.000Z",
      );
      oldDb.close();

      const migratedDb = openDb(dbPath);
      const scans = getAllScans(migratedDb);
      expect(scans).toHaveLength(1);
      expect(scans[0].technicalTimestampUtc).toBeUndefined();

      insertScans(migratedDb, [
        {
          startNumber: "102",
          checkpointId: "K1",
          timestampUtc: "2026-07-25T09:01:00.000Z",
          technicalTimestampUtc: "2026-07-25T09:01:05.000Z",
        },
      ]);
      expect(getAllScans(migratedDb).find((s) => s.startNumber === "102")?.technicalTimestampUtc).toBe(
        "2026-07-25T09:01:05.000Z",
      );
      migratedDb.close();
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
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

describe("ignored_riders", () => {
  it("ist anfangs leer", () => {
    expect(getIgnoredRiders(db)).toEqual([]);
  });

  it("nimmt einen Fahrer in die Ignorieren-Liste auf", () => {
    ignoreRider(db, "42");
    expect(getIgnoredRiders(db)).toEqual(["42"]);
  });

  it("erneutes Ignorieren derselben Startnummer erzeugt keinen zweiten Eintrag", () => {
    ignoreRider(db, "42");
    ignoreRider(db, "42");
    expect(getIgnoredRiders(db)).toEqual(["42"]);
  });

  it("unignoreRider nimmt die Markierung wieder zurück", () => {
    ignoreRider(db, "42");
    unignoreRider(db, "42");
    expect(getIgnoredRiders(db)).toEqual([]);
  });

  it("unignoreRider für eine nie ignorierte Startnummer bleibt folgenlos", () => {
    expect(() => unignoreRider(db, "999")).not.toThrow();
    expect(getIgnoredRiders(db)).toEqual([]);
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
