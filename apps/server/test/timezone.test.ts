import { describe, expect, it } from "vitest";
import { parseSheetTimestamp } from "../src/timezone.js";

describe("parseSheetTimestamp", () => {
  it("übernimmt einen Wert mit explizitem UTC-Offset direkt", () => {
    const result = parseSheetTimestamp("2026-07-25T09:14:32Z", { timeZone: "Europe/Berlin" });
    expect(result).toBe("2026-07-25T09:14:32.000Z");
  });

  it("übernimmt einen Wert mit explizitem Nicht-UTC-Offset korrekt umgerechnet", () => {
    const result = parseSheetTimestamp("2026-07-25T11:14:32+02:00", { timeZone: "Europe/Berlin" });
    expect(result).toBe("2026-07-25T09:14:32.000Z");
  });

  it("interpretiert eine naive Zeit im Sommer als CEST (UTC+2)", () => {
    const result = parseSheetTimestamp("2026-07-25 11:14:32", { timeZone: "Europe/Berlin" });
    expect(result).toBe("2026-07-25T09:14:32.000Z");
  });

  it("interpretiert eine naive Zeit im Winter als CET (UTC+1)", () => {
    const result = parseSheetTimestamp("2026-01-15 11:14:32", { timeZone: "Europe/Berlin" });
    expect(result).toBe("2026-01-15T10:14:32.000Z");
  });

  it("unterstützt das deutsche Datumsformat dd.MM.yyyy", () => {
    const result = parseSheetTimestamp("25.07.2026 11:14:32", { timeZone: "Europe/Berlin" });
    expect(result).toBe("2026-07-25T09:14:32.000Z");
  });

  it("wirft bei leerem Wert", () => {
    expect(() => parseSheetTimestamp("  ", { timeZone: "Europe/Berlin" })).toThrow(/Leerer Zeitstempel/);
  });

  it("wirft bei unbekanntem Format", () => {
    expect(() => parseSheetTimestamp("nicht ein datum", { timeZone: "Europe/Berlin" })).toThrow(
      /konnte in keinem der bekannten Formate/,
    );
  });
});
