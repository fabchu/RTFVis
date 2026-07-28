import { mkdirSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "./config.js";
import { openDb } from "./db.js";
import { startPolling } from "./poller.js";
import { PollStatusTracker } from "./pollStatus.js";
import { buildServer } from "./server.js";
import { createSource } from "./sources/index.js";

const config = loadConfig();
mkdirSync(path.dirname(config.dbPath), { recursive: true });

const db = openDb(config.dbPath);
const source = createSource(config);
const pollStatus = new PollStatusTracker();

startPolling(source, db, {
  intervalMs: config.pollIntervalMs,
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
