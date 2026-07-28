import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvRecords } from "../src/csv.js";

describe("parseCsv", () => {
  it("parst einfache kommaseparierte Zeilen", () => {
    const rows = parseCsv("a,b,c\n1,2,3\n");
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("unterstützt Anführungszeichen-Felder mit Kommas darin", () => {
    const rows = parseCsv('a,b\n"Hallo, Welt",2\n');
    expect(rows).toEqual([
      ["a", "b"],
      ["Hallo, Welt", "2"],
    ]);
  });

  it("unterstützt escapte Anführungszeichen (\"\")", () => {
    const rows = parseCsv('a\n"Sagt ""Hallo""."\n');
    expect(rows[1]).toEqual(['Sagt "Hallo".']);
  });

  it("ignoriert \\r vor \\n (Windows-Zeilenenden)", () => {
    const rows = parseCsv("a,b\r\n1,2\r\n");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("gibt für leeren Inhalt eine leere Liste zurück", () => {
    expect(parseCsv("")).toEqual([]);
  });
});

describe("parseCsvRecords", () => {
  it("verwendet die erste Zeile als Header und trimmt Werte", () => {
    const records = parseCsvRecords("Startnummer, Checkpoint \n 101 , CP1 \n");
    expect(records).toEqual([{ Startnummer: "101", Checkpoint: "CP1" }]);
  });

  it("gibt für nur eine Kopfzeile eine leere Liste zurück", () => {
    expect(parseCsvRecords("a,b\n")).toEqual([]);
  });
});
