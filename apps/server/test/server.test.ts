import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { insertScans, openDb, replaceRoster, type Db } from "../src/db.js";
import { PollStatusTracker } from "../src/pollStatus.js";
import { buildServer } from "../src/server.js";

let db: Db;
let dataDir: string;
let pollStatus: PollStatusTracker;
let app: ReturnType<typeof buildServer>;

beforeEach(() => {
  db = openDb(":memory:");
  dataDir = mkdtempSync(path.join(tmpdir(), "rtfvis-server-test-"));
  writeFileSync(path.join(dataDir, "routes.json"), JSON.stringify([{ id: "rtf-90" }]), "utf-8");
  writeFileSync(path.join(dataDir, "checkpoints.json"), JSON.stringify([{ id: "CP1" }]), "utf-8");
  pollStatus = new PollStatusTracker();
  app = buildServer(
    db,
    { routesDataDir: dataDir, tileCacheDir: path.join(dataDir, "tiles-cache"), dataSource: "csv", pollIntervalMs: 30_000 },
    pollStatus,
  );
});

afterEach(() => {
  db.close();
  rmSync(dataDir, { recursive: true, force: true });
});

describe("GET /health", () => {
  it("antwortet ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});

describe("GET /api/roster", () => {
  it("liefert den aktuellen Roster-Bestand", async () => {
    replaceRoster(db, [{ startNumber: "101", category: "RTF", routeId: "rtf-90" }]);
    const res = await app.inject({ method: "GET", url: "/api/roster" });
    expect(res.json()).toEqual([{ startNumber: "101", category: "RTF", routeId: "rtf-90" }]);
  });
});

describe("GET /api/scans", () => {
  it("liefert alle Scans sortiert nach Zeitstempel", async () => {
    insertScans(db, [{ startNumber: "101", checkpointId: "CP1", timestampUtc: "2026-07-25T09:00:00.000Z" }]);
    const res = await app.inject({ method: "GET", url: "/api/scans" });
    expect(res.json()).toEqual([
      { startNumber: "101", checkpointId: "CP1", timestampUtc: "2026-07-25T09:00:00.000Z" },
    ]);
  });
});

describe("GET /api/routes", () => {
  it("liefert den Inhalt von routes.json aus dem konfigurierten Verzeichnis", async () => {
    const res = await app.inject({ method: "GET", url: "/api/routes" });
    expect(res.json()).toEqual([{ id: "rtf-90" }]);
  });
});

describe("GET /api/checkpoints", () => {
  it("liefert den Inhalt von checkpoints.json aus dem konfigurierten Verzeichnis", async () => {
    const res = await app.inject({ method: "GET", url: "/api/checkpoints" });
    expect(res.json()).toEqual([{ id: "CP1" }]);
  });
});

describe("GET /api/status", () => {
  it("kombiniert Poller-Status mit aktuellen DB-Zählern", async () => {
    insertScans(db, [{ startNumber: "101", checkpointId: "CP1", timestampUtc: "2026-07-25T09:00:00.000Z" }]);
    replaceRoster(db, [{ startNumber: "101", category: "RTF" }]);
    pollStatus.recordError("Netzwerkfehler", 2);

    const res = await app.inject({ method: "GET", url: "/api/status" });
    const body = res.json();

    expect(body.dataSource).toBe("csv");
    expect(body.pollIntervalMs).toBe(30_000);
    expect(body.scanCount).toBe(1);
    expect(body.riderCount).toBe(1);
    expect(body.consecutiveFailures).toBe(2);
    expect(body.lastErrorMessage).toBe("Netzwerkfehler");
  });
});

describe("GET /tiles/:z/:x/:y.png", () => {
  it("lehnt ungültige Kachel-Koordinaten mit 400 ab", async () => {
    const res = await app.inject({ method: "GET", url: "/tiles/abc/1/2.png" });
    expect(res.statusCode).toBe(400);
  });
});
