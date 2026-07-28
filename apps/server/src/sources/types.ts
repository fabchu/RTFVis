import type { RosterEntry, ScanRecord } from "../types.js";

export interface ScanSource {
  fetchRoster(): Promise<RosterEntry[]>;
  /** sinceUtc: ISO-8601-UTC-Zeitstempel, oder null für den kompletten Bestand. */
  fetchScansSince(sinceUtc: string | null): Promise<ScanRecord[]>;
}
