import { timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import type { ServerConfig } from "./config.js";
import { getAllScans, getIgnoredRiders, getRoster, ignoreRider, unignoreRider, type Db } from "./db.js";
import type { PollStatusTracker } from "./pollStatus.js";

const TILE_UPSTREAM_BASE = "https://tile.openstreetmap.org";
/** Identifiziert uns gegenüber dem OSM-Tile-Server, wie von deren Nutzungsrichtlinie gefordert. */
const TILE_USER_AGENT = "RTFVis/0.1 (Renn-Orga-Tool)";

export function buildServer(
  db: Db,
  config: Pick<
    ServerConfig,
    "routesDataDir" | "tileCacheDir" | "dataSource" | "pollIntervalMs" | "basicAuth" | "webDistDir"
  >,
  pollStatus: PollStatusTracker,
) {
  const app = Fastify({ logger: false });

  // /health bleibt bewusst OHNE Basic Auth: Hosting-Plattformen wie Render schicken beim
  // Health-Check keine Zugangsdaten mit -- mit Auth davor würde der Service ständig als
  // "unhealthy" gelten und neu gestartet werden.
  if (config.basicAuth) {
    registerBasicAuth(app, config.basicAuth);
  }

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

  // Von der Orga ignorierte Fahrer (siehe db.ts) -- serverseitig, damit alle gleichzeitig
  // geöffneten Ansichten (z.B. mehrere Kontrollposten) dieselbe Markierung sehen.
  app.get("/api/ignored-riders", async () => getIgnoredRiders(db));
  app.post("/api/ignored-riders", async (request, reply) => {
    const body = request.body as { startNumber?: unknown } | undefined;
    const startNumber = typeof body?.startNumber === "string" ? body.startNumber.trim() : "";
    if (!startNumber) {
      return reply.code(400).send({ error: "startNumber (nicht-leerer String) erforderlich." });
    }
    ignoreRider(db, startNumber);
    return reply.code(204).send();
  });
  app.delete("/api/ignored-riders/:startNumber", async (request, reply) => {
    const { startNumber } = request.params as { startNumber: string };
    unignoreRider(db, startNumber);
    return reply.code(204).send();
  });

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

  // Produktions-Build des Frontends (apps/web/dist) mit ausliefern, falls vorhanden -- so
  // lässt sich ein einzelner Service (z.B. auf Render) deployen, ohne Frontend und Backend
  // getrennt hosten zu müssen. Lokal per `pnpm race` existiert dieses Verzeichnis nicht
  // (Vite-Dev-Server läuft separat) -- dann bleibt dieser Block einfach wirkungslos.
  if (existsSync(config.webDistDir)) {
    app.register(fastifyStatic, { root: config.webDistDir, index: "index.html" });
  }

  return app;
}

function registerBasicAuth(app: FastifyInstance, basicAuth: { user: string; pass: string }): void {
  const expected = Buffer.from(`Basic ${Buffer.from(`${basicAuth.user}:${basicAuth.pass}`).toString("base64")}`);

  app.addHook("onRequest", async (request, reply) => {
    if (request.url === "/health") return;

    const provided = request.headers.authorization;
    if (!provided || !constantTimeEquals(Buffer.from(provided), expected)) {
      reply.header("WWW-Authenticate", 'Basic realm="RTFVis"');
      reply.code(401).send({ error: "unauthorized" });
    }
  });
}

/** Vergleich in konstanter Zeit, damit die Antwortdauer keine Rückschlüsse auf korrekte Zeichen zulässt. */
function constantTimeEquals(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
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
