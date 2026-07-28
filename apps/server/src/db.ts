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
  `);
  return db;
}

/** Fügt Scans ein, überspringt bereits bekannte (start_number, checkpoint_id)-Paare. Gibt die Anzahl neu eingefügter Zeilen zurück. */
export function insertScans(db: Db, scans: ScanRecord[]): number {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO scans (start_number, checkpoint_id, timestamp_utc) VALUES (?, ?, ?)`,
  );
  let inserted = 0;
  db.exec("BEGIN");
  try {
    for (const r of scans) {
      const result = stmt.run(r.startNumber, r.checkpointId, r.timestampUtc);
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
      `SELECT start_number as startNumber, checkpoint_id as checkpointId, timestamp_utc as timestampUtc
       FROM scans ORDER BY timestamp_utc ASC`,
    )
    .all();
  return rows as unknown as ScanRecord[];
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
