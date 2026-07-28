import { readFileSync } from "node:fs";
import type { Category } from "@rtfvis/core";
import { parseCsvRecords } from "../csv.js";
import { parseSheetTimestamp } from "../timezone.js";
import type { RosterEntry, ScanRecord } from "../types.js";
import type { ScanSource } from "./types.js";

export interface CsvColumnMap {
  startNumber: string;
  category: string;
  routeId: string;
}

export interface ScanColumnMap {
  startNumber: string;
  checkpointId: string;
  timestamp: string;
}

export interface CsvFileSourceOptions {
  rosterCsvPath: string;
  scansCsvPath: string;
  /** IANA-Zeitzone, in der die Zeitstempel-Spalte im CSV-Export vorliegt (z.B. "Europe/Berlin"). */
  sheetTimeZone: string;
  rosterColumns?: CsvColumnMap;
  scanColumns?: ScanColumnMap;
}

const DEFAULT_ROSTER_COLUMNS: CsvColumnMap = { startNumber: "Startnummer", category: "Kategorie", routeId: "Strecke" };
const DEFAULT_SCAN_COLUMNS: ScanColumnMap = {
  startNumber: "Startnummer",
  checkpointId: "Checkpoint",
  timestamp: "Zeitstempel",
};

/**
 * Offline-Fallback: liest roster.csv/scans.csv, wie sie per "Datei > Herunterladen > CSV"
 * aus Google Sheets exportiert werden. Anders als beim Apps Script sind die Zeitstempel hier
 * garantiert unformatierte Text-Strings in der Sheet-Anzeige-Zeitzone, deshalb die explizite
 * Konvertierung über parseSheetTimestamp.
 */
export class CsvFileSource implements ScanSource {
  private readonly rosterColumns: CsvColumnMap;
  private readonly scanColumns: ScanColumnMap;

  constructor(private options: CsvFileSourceOptions) {
    this.rosterColumns = options.rosterColumns ?? DEFAULT_ROSTER_COLUMNS;
    this.scanColumns = options.scanColumns ?? DEFAULT_SCAN_COLUMNS;
  }

  async fetchRoster(): Promise<RosterEntry[]> {
    const records = parseCsvRecords(readFileSync(this.options.rosterCsvPath, "utf-8"));
    const cols = this.rosterColumns;
    return records
      .filter((r) => r[cols.startNumber])
      .map((r) => ({
        startNumber: r[cols.startNumber],
        category: r[cols.category] as Category,
        routeId: r[cols.routeId] || undefined,
      }));
  }

  async fetchScansSince(sinceUtc: string | null): Promise<ScanRecord[]> {
    const records = parseCsvRecords(readFileSync(this.options.scansCsvPath, "utf-8"));
    const cols = this.scanColumns;
    const scans = records
      .filter((r) => r[cols.startNumber] && r[cols.timestamp])
      .map((r) => ({
        startNumber: r[cols.startNumber],
        checkpointId: r[cols.checkpointId],
        timestampUtc: parseSheetTimestamp(r[cols.timestamp], { timeZone: this.options.sheetTimeZone }),
      }));
    if (sinceUtc === null) return scans;
    return scans.filter((s) => s.timestampUtc > sinceUtc);
  }
}
