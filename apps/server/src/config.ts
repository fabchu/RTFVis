import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** apps/server/src -> Repo-Root/data (dort liegen routes.json/checkpoints.json aus packages/core). */
const DEFAULT_ROUTES_DATA_DIR = path.resolve(__dirname, "../../../data");

export interface ServerConfig {
  dataSource: "apps-script" | "csv" | "fixture";
  appsScript?: { baseUrl: string; token: string };
  csv?: { rosterCsvPath: string; scansCsvPath: string; sheetTimeZone: string };
  pollIntervalMs: number;
  dbPath: string;
  httpPort: number;
  /** Verzeichnis mit routes.json und checkpoints.json (Ausgabe von `pnpm build:routes`). */
  routesDataDir: string;
  /** Verzeichnis für den lokalen OSM-Tile-Cache. */
  tileCacheDir: string;
}

function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`Umgebungsvariable ${name} fehlt (siehe .env.example).`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const dataSource = (env.DATA_SOURCE ?? "apps-script") as ServerConfig["dataSource"];

  const config: ServerConfig = {
    dataSource,
    pollIntervalMs: Number(env.POLL_INTERVAL_MS ?? 30_000),
    dbPath: env.DB_PATH ?? "./data/rtfvis.db",
    httpPort: Number(env.HTTP_PORT ?? 3001),
    routesDataDir: env.ROUTES_DATA_DIR ?? DEFAULT_ROUTES_DATA_DIR,
    tileCacheDir: env.TILE_CACHE_DIR ?? path.join(DEFAULT_ROUTES_DATA_DIR, "tiles-cache"),
  };

  if (dataSource === "apps-script") {
    config.appsScript = { baseUrl: requireEnv(env, "APPS_SCRIPT_URL"), token: requireEnv(env, "APPS_SCRIPT_TOKEN") };
  } else if (dataSource === "csv") {
    config.csv = {
      rosterCsvPath: requireEnv(env, "ROSTER_CSV_PATH"),
      scansCsvPath: requireEnv(env, "SCANS_CSV_PATH"),
      sheetTimeZone: env.SHEET_TIMEZONE ?? "Europe/Berlin",
    };
  }

  return config;
}
