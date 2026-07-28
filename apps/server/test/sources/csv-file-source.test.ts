import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CsvFileSource } from "../../src/sources/csv-file-source.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "rtfvis-csv-source-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("CsvFileSource", () => {
  it("liest Roster und Scans mit deutschen Standard-Spaltennamen", async () => {
    const rosterPath = path.join(dir, "roster.csv");
    const scansPath = path.join(dir, "scans.csv");
    writeFileSync(rosterPath, "Startnummer,Kategorie,Strecke\n101,RTF,rtf-90\n102,CTF,\n", "utf-8");
    writeFileSync(
      scansPath,
      "Startnummer,Checkpoint,Zeitstempel\n101,CP1,25.07.2026 11:14:32\n102,CP1,25.07.2026 11:20:00\n",
      "utf-8",
    );

    const source = new CsvFileSource({
      rosterCsvPath: rosterPath,
      scansCsvPath: scansPath,
      sheetTimeZone: "Europe/Berlin",
    });

    const roster = await source.fetchRoster();
    expect(roster).toEqual([
      { startNumber: "101", category: "RTF", routeId: "rtf-90" },
      { startNumber: "102", category: "CTF", routeId: undefined },
    ]);

    const scans = await source.fetchScansSince(null);
    expect(scans[0]).toEqual({ startNumber: "101", checkpointId: "CP1", timestampUtc: "2026-07-25T09:14:32.000Z" });
  });

  it("filtert Scans nach sinceUtc", async () => {
    const rosterPath = path.join(dir, "roster.csv");
    const scansPath = path.join(dir, "scans.csv");
    writeFileSync(rosterPath, "Startnummer,Kategorie,Strecke\n", "utf-8");
    writeFileSync(
      scansPath,
      "Startnummer,Checkpoint,Zeitstempel\n101,CP1,25.07.2026 09:00:00\n101,CP2,25.07.2026 10:00:00\n",
      "utf-8",
    );

    const source = new CsvFileSource({ rosterCsvPath: rosterPath, scansCsvPath: scansPath, sheetTimeZone: "Europe/Berlin" });
    const scans = await source.fetchScansSince("2026-07-25T07:30:00.000Z");
    expect(scans.map((s) => s.checkpointId)).toEqual(["CP2"]);
  });
});
