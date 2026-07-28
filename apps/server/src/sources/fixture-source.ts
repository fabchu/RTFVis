import type { RosterEntry, ScanRecord } from "../types.js";
import type { ScanSource } from "./types.js";

/** In-Memory-Quelle für Tests und lokale Entwicklung ohne Google Sheet. */
export class FixtureSource implements ScanSource {
  constructor(
    private roster: RosterEntry[],
    private scans: ScanRecord[],
  ) {}

  async fetchRoster(): Promise<RosterEntry[]> {
    return this.roster;
  }

  async fetchScansSince(sinceUtc: string | null): Promise<ScanRecord[]> {
    if (sinceUtc === null) return this.scans;
    return this.scans.filter((s) => s.timestampUtc > sinceUtc);
  }
}
