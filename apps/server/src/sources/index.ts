import type { ServerConfig } from "../config.js";
import { AppsScriptSource } from "./apps-script-source.js";
import { CsvFileSource } from "./csv-file-source.js";
import type { ScanSource } from "./types.js";

export function createSource(config: ServerConfig): ScanSource {
  switch (config.dataSource) {
    case "apps-script":
      if (!config.appsScript) {
        throw new Error("APPS_SCRIPT_URL/APPS_SCRIPT_TOKEN fehlen für DATA_SOURCE=apps-script.");
      }
      return new AppsScriptSource(config.appsScript);
    case "csv":
      if (!config.csv) {
        throw new Error("ROSTER_CSV_PATH/SCANS_CSV_PATH fehlen für DATA_SOURCE=csv.");
      }
      return new CsvFileSource(config.csv);
    case "fixture":
      throw new Error("DATA_SOURCE=fixture ist nur für Tests gedacht, nicht für den Server-Start.");
    default:
      throw new Error(`Unbekannte DATA_SOURCE: ${config.dataSource satisfies never}`);
  }
}

export type { ScanSource } from "./types.js";
export { AppsScriptSource } from "./apps-script-source.js";
export { CsvFileSource } from "./csv-file-source.js";
export { FixtureSource } from "./fixture-source.js";
