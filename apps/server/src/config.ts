import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** apps/server/src -> Repo-Root/data (dort liegen routes.json/checkpoints.json aus packages/core). */
const DEFAULT_ROUTES_DATA_DIR = path.resolve(__dirname, "../../../data");
/** apps/server/src -> apps/web/dist (Ausgabe von `pnpm --filter @rtfvis/web build`). */
const DEFAULT_WEB_DIST_DIR = path.resolve(__dirname, "../../web/dist");

export interface ServerConfig {
  dataSource: "apps-script" | "csv" | "fixture";
  appsScript?: { baseUrl: string; token: string };
  csv?: { rosterCsvPath: string; scansCsvPath: string; sheetTimeZone: string };
  pollIntervalMs: number;
  dbPath: string;
  httpPort: number;
  /**
   * Standard 127.0.0.1: nur vom eigenen Rechner erreichbar (lokaler Renntag-Betrieb).
   * Für Hosting (z.B. Render) per HOST=0.0.0.0 überschreiben, damit von außen erreichbar.
   */
  host: string;
  /** Nur gesetzt, wenn beide BASIC_AUTH_*-Variablen vorhanden sind -- schützt dann jede Anfrage. */
  basicAuth?: { user: string; pass: string };
  /** Verzeichnis mit routes.json und checkpoints.json (Ausgabe von `pnpm build:routes`). */
  routesDataDir: string;
  /** Verzeichnis für den lokalen OSM-Tile-Cache. */
  tileCacheDir: string;
  /** Verzeichnis mit dem Produktions-Build des Frontends (apps/web/dist), falls vorhanden. */
  webDistDir: string;
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
    // PORT (nicht HTTP_PORT) ist die Konvention, über die Hosting-Plattformen wie Render
    // den zugewiesenen Port mitteilen -- als Fallback, damit dort ohne manuelle
    // Portkonfiguration deployt werden kann. HTTP_PORT (eigener Name) hat Vorrang, falls
    // beide gesetzt sind, z.B. für einen bewusst abweichenden lokalen Port.
    httpPort: Number(env.HTTP_PORT ?? env.PORT ?? 3001),
    host: env.HOST ?? "127.0.0.1",
    basicAuth: loadBasicAuth(env),
    routesDataDir: env.ROUTES_DATA_DIR ?? DEFAULT_ROUTES_DATA_DIR,
    tileCacheDir: env.TILE_CACHE_DIR ?? path.join(DEFAULT_ROUTES_DATA_DIR, "tiles-cache"),
    webDistDir: env.WEB_DIST_DIR ?? DEFAULT_WEB_DIST_DIR,
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

/**
 * Nur eine der beiden Variablen zu setzen wäre ein stiller Fehlerzustand (Basic Auth bliebe
 * unbemerkt deaktiviert, obwohl offensichtlich eine Zugangsbeschränkung gewollt war) --
 * deshalb hier hart abbrechen statt defensiv zu erraten.
 */
function loadBasicAuth(env: NodeJS.ProcessEnv): ServerConfig["basicAuth"] {
  const user = env.BASIC_AUTH_USER;
  const pass = env.BASIC_AUTH_PASS;
  if (!user && !pass) return undefined;
  if (!user || !pass) {
    throw new Error("BASIC_AUTH_USER und BASIC_AUTH_PASS müssen beide gesetzt sein (oder beide leer bleiben).");
  }
  return { user, pass };
}
