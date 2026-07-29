import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CheckpointDef } from "@rtfvis/core";
import { loadConfig } from "./config.js";
import { openDb } from "./db.js";
import { startPolling } from "./poller.js";
import { PollStatusTracker } from "./pollStatus.js";
import { buildServer } from "./server.js";
import { createSource } from "./sources/index.js";

// .env liegt neben package.json (apps/server/.env). Wird hier geladen statt vorauszusetzen,
// dass der Aufrufer die Variablen schon im Environment hat (z.B. "pnpm race" tut das nicht) —
// ohne das schlägt loadConfig() unten mit einer verwirrenden "Variable fehlt"-Meldung fehl.
// Optional: fehlt die Datei (z.B. DATA_SOURCE wird stattdessen direkt im Environment
// gesetzt), einfach überspringen statt einen Fehler zu werfen.
const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env");
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const config = loadConfig();
mkdirSync(path.dirname(config.dbPath), { recursive: true });

const db = openDb(config.dbPath);
const source = createSource(config);
const pollStatus = new PollStatusTracker();

// Nur beim Start geladen (ändert sich nicht während des Rennens, siehe server.ts) --
// die IDs braucht der Poller, um ausgeschriebene Checkpoint-Bezeichnungen aus dem Sheet auf
// unsere kurzen internen IDs zu mappen (siehe checkpointIdMapping.ts).
const checkpointsPath = path.join(config.routesDataDir, "checkpoints.json");
const validCheckpointIds = readCheckpointIds(checkpointsPath);

startPolling(source, db, {
  intervalMs: config.pollIntervalMs,
  validCheckpointIds,
  onPollSuccess: (result) => {
    pollStatus.recordSuccess();
    console.log(`[poll] ${result.insertedScans} neue Scans, Roster: ${result.rosterSize} Fahrer.`);
  },
  onPollError: (error, attempt) => {
    const message = error instanceof Error ? error.message : String(error);
    pollStatus.recordError(message, attempt);
    console.error(`[poll] Fehler (Versuch ${attempt}):`, message);
  },
});

const server = buildServer(db, config, pollStatus);
server.listen({ port: config.httpPort, host: "127.0.0.1" }).then(() => {
  console.log(`Server läuft auf http://127.0.0.1:${config.httpPort}`);
});

function readCheckpointIds(filePath: string): string[] {
  try {
    const checkpoints = JSON.parse(readFileSync(filePath, "utf-8")) as CheckpointDef[];
    return checkpoints.map((c) => c.id);
  } catch {
    return [];
  }
}
