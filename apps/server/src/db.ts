import { DatabaseSync } from "node:sqlite";
import type { RosterEntry, ScanRecord } from "./types.js";

export type Db = DatabaseSync;

export function openDb(pathOrMemory: string): Db {
  const db = new DatabaseSync(pathOrMemory);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      start_number TEXT NOT NULL,
      checkpoint_id TEXT NOT NULL,
      timestamp_utc TEXT NOT NULL,
      -- Nur bei Kontrollen-Scans über die AppSheet-Anbindung gesetzt (siehe
      -- apps-script/Code.gs) -- wann die Zeile im Sheet ankam, nicht wann sie passierte.
      technical_timestamp_utc TEXT,
      -- Timestamp bewusst Teil des Unique-Keys: manche Strecken besuchen denselben
      -- Checkpoint mehrfach (Schleifen), ein Fahrer kann also legitim zwei Scans mit
      -- derselben checkpoint_id haben. Der Key dedupliziert weiterhin echte
      -- Mehrfach-Inserts DESSELBEN Ereignisses (z.B. durch überlappende Poll-Fenster,
      -- siehe poller.ts), da diese exakt denselben Zeitstempel tragen.
      UNIQUE(start_number, checkpoint_id, timestamp_utc)
    );
    CREATE INDEX IF NOT EXISTS idx_scans_timestamp ON scans(timestamp_utc);

    CREATE TABLE IF NOT EXISTS roster (
      start_number TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      route_id TEXT
    );

    CREATE TABLE IF NOT EXISTS poller_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Von der Orga manuell als "ignorieren" markierte Fahrer (z.B. bekanntes Aufgeben ohne
    -- weiteren Scan) -- zählen dann nicht mehr als überfällig/unklar und nicht mehr in der
    -- Segmentauslastung. Bewusst serverseitig statt nur im Browser: mehrere Kontrollposten
    -- können die Karte gleichzeitig offen haben und sollen dieselbe Markierung sehen.
    CREATE TABLE IF NOT EXISTS ignored_riders (
      start_number TEXT PRIMARY KEY,
      ignored_at_utc TEXT NOT NULL
    );
  `);
  ensureTechnicalTimestampColumn(db);
  return db;
}

/**
 * Migration für bereits bestehende DB-Dateien von vor Einführung von
 * technical_timestamp_utc -- CREATE TABLE IF NOT EXISTS legt die Spalte nur bei einer
 * brandneuen Tabelle an, ändert eine bereits existierende nicht nachträglich.
 */
function ensureTechnicalTimestampColumn(db: Db): void {
  const columns = db.prepare(`PRAGMA table_info(scans)`).all() as Array<{ name: string }>;
  if (!columns.some((c) => c.name === "technical_timestamp_utc")) {
    db.exec(`ALTER TABLE scans ADD COLUMN technical_timestamp_utc TEXT`);
  }
}

/** Fügt Scans ein, überspringt bereits bekannte (start_number, checkpoint_id)-Paare. Gibt die Anzahl neu eingefügter Zeilen zurück. */
export function insertScans(db: Db, scans: ScanRecord[]): number {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO scans (start_number, checkpoint_id, timestamp_utc, technical_timestamp_utc) VALUES (?, ?, ?, ?)`,
  );
  let inserted = 0;
  db.exec("BEGIN");
  try {
    for (const r of scans) {
      const result = stmt.run(r.startNumber, r.checkpointId, r.timestampUtc, r.technicalTimestampUtc ?? null);
      inserted += Number(result.changes);
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return inserted;
}

export function getAllScans(db: Db): ScanRecord[] {
  const rows = db
    .prepare(
      `SELECT start_number as startNumber, checkpoint_id as checkpointId, timestamp_utc as timestampUtc,
              technical_timestamp_utc as technicalTimestampUtc
       FROM scans ORDER BY timestamp_utc ASC`,
    )
    .all() as unknown as Array<ScanRecord & { technicalTimestampUtc: string | null }>;
  return rows.map((r) => ({ ...r, technicalTimestampUtc: r.technicalTimestampUtc ?? undefined }));
}

export function replaceRoster(db: Db, roster: RosterEntry[]): void {
  db.exec("BEGIN");
  try {
    db.prepare(`DELETE FROM roster`).run();
    // ON CONFLICT statt eines reinen INSERT: das Sheet kann pro Poll dieselbe Startnummer
    // mehrfach enthalten (Tippfehler, nachträglich korrigierte Zeile, die nicht gelöscht
    // wurde). Ohne Konfliktbehandlung crasht das mit UNIQUE constraint failed und blockiert
    // dadurch jeden weiteren Poll. Bei einem Duplikat gewinnt der zuletzt verarbeitete
    // Eintrag (= letzte Zeile im Sheet), da spätere Einträge frühere hier überschreiben.
    const stmt = db.prepare(
      `INSERT INTO roster (start_number, category, route_id) VALUES (?, ?, ?)
       ON CONFLICT(start_number) DO UPDATE SET category = excluded.category, route_id = excluded.route_id`,
    );
    for (const entry of roster) {
      stmt.run(entry.startNumber, entry.category, entry.routeId ?? null);
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function getRoster(db: Db): RosterEntry[] {
  const rows = db
    .prepare(`SELECT start_number as startNumber, category, route_id as routeId FROM roster`)
    .all() as unknown as Array<{ startNumber: string; category: string; routeId: string | null }>;
  return rows.map((r) => ({
    startNumber: r.startNumber,
    category: r.category as RosterEntry["category"],
    routeId: r.routeId ?? undefined,
  }));
}

export function getIgnoredRiders(db: Db): string[] {
  const rows = db.prepare(`SELECT start_number as startNumber FROM ignored_riders`).all() as unknown as Array<{
    startNumber: string;
  }>;
  return rows.map((r) => r.startNumber);
}

export function ignoreRider(db: Db, startNumber: string): void {
  db.prepare(
    `INSERT INTO ignored_riders (start_number, ignored_at_utc) VALUES (?, ?)
     ON CONFLICT(start_number) DO UPDATE SET ignored_at_utc = excluded.ignored_at_utc`,
  ).run(startNumber, new Date().toISOString());
}

export function unignoreRider(db: Db, startNumber: string): void {
  db.prepare(`DELETE FROM ignored_riders WHERE start_number = ?`).run(startNumber);
}

export function getPollerState(db: Db, key: string): string | null {
  const row = db.prepare(`SELECT value FROM poller_state WHERE key = ?`).get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setPollerState(db: Db, key: string, value: string): void {
  db.prepare(
    `INSERT INTO poller_state (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}
