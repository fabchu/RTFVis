import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import Fastify from "fastify";
import type { ServerConfig } from "./config.js";
import { getAllScans, getRoster, type Db } from "./db.js";
import type { PollStatusTracker } from "./pollStatus.js";

const TILE_UPSTREAM_BASE = "https://tile.openstreetmap.org";
/** Identifiziert uns gegenüber dem OSM-Tile-Server, wie von deren Nutzungsrichtlinie gefordert. */
const TILE_USER_AGENT = "RTFVis/0.1 (lokales Renn-Orga-Tool, nicht oeffentlich gehostet)";

export function buildServer(
  db: Db,
  config: Pick<ServerConfig, "routesDataDir" | "tileCacheDir" | "dataSource" | "pollIntervalMs">,
  pollStatus: PollStatusTracker,
) {
  const app = Fastify({ logger: false });

  // routes.json/checkpoints.json ändern sich nur, wenn die Orga `pnpm build:routes` neu
  // laufen lässt (nicht während des Rennens) — daher einmalig beim Start laden, nicht bei
  // jeder Anfrage neu von der Platte lesen. Ein Serverneustart übernimmt Änderungen.
  const routesPath = path.join(config.routesDataDir, "routes.json");
  const checkpointsPath = path.join(config.routesDataDir, "checkpoints.json");
  const routes = readJsonSyncOrEmpty(routesPath);
  const checkpoints = readJsonSyncOrEmpty(checkpointsPath);

  app.get("/health", async () => ({ ok: true }));
  app.get("/api/roster", async () => getRoster(db));
  app.get("/api/scans", async () => getAllScans(db));
  app.get("/api/routes", async () => routes);
  app.get("/api/checkpoints", async () => checkpoints);

  // Verbindungsstatus fürs Frontend (Anzeige, ob der Datenpfad zum Sheet noch funktioniert).
  app.get("/api/status", async () => ({
    dataSource: config.dataSource,
    pollIntervalMs: config.pollIntervalMs,
    scanCount: getAllScans(db).length,
    riderCount: getRoster(db).length,
    ...pollStatus.snapshot(),
  }));

  app.get("/tiles/:z/:x/:yFile", async (request, reply) => {
    const { z, x, yFile } = request.params as { z: string; x: string; yFile: string };
    const y = yFile.endsWith(".png") ? yFile.slice(0, -4) : yFile;

    if (![z, x, y].every((v) => /^\d+$/.test(v))) {
      return reply.code(400).send({ error: "invalid tile coordinates" });
    }

    const tile = await getTile(config.tileCacheDir, z, x, y);
    if (!tile) return reply.code(502).send({ error: "upstream tile fetch failed" });

    reply.header("Content-Type", "image/png");
    reply.header("Cache-Control", "public, max-age=2592000");
    return reply.send(tile);
  });

  return app;
}

function readJsonSyncOrEmpty(filePath: string): unknown[] {
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return [];
  }
}

async function getTile(cacheDir: string, z: string, x: string, y: string): Promise<Buffer | null> {
  const cachePath = path.join(cacheDir, z, x, `${y}.png`);

  try {
    return await readFile(cachePath);
  } catch {
    // Noch nicht im Cache -> von OSM holen.
  }

  const response = await fetch(`${TILE_UPSTREAM_BASE}/${z}/${x}/${y}.png`, {
    headers: { "User-Agent": TILE_USER_AGENT },
  });
  if (!response.ok) return null;

  const buffer = Buffer.from(await response.arrayBuffer());
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, buffer);
  return buffer;
}
