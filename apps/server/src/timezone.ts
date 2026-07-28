import { DateTime } from "luxon";

export interface ParseSheetTimestampOptions {
  /** IANA-Zeitzone des Google Sheets, z.B. "Europe/Berlin". */
  timeZone: string;
  /** Luxon-Formatstrings, der Reihe nach probiert. Deckt gängige Sheets-Exportformate ab. */
  formats?: string[];
}

const DEFAULT_FORMATS = [
  "yyyy-MM-dd HH:mm:ss",
  "dd.MM.yyyy HH:mm:ss",
  "MM/dd/yyyy HH:mm:ss",
  "yyyy-MM-dd'T'HH:mm:ss",
];

const HAS_EXPLICIT_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/;

/**
 * Wandelt einen Zeitstempel aus dem Google Sheet nach UTC (ISO 8601) um.
 *
 * Enthält der Rohwert bereits eine explizite Zeitzone (z.B. weil das Apps Script ihn
 * schon konvertiert hat), wird diese direkt übernommen — keine Rätselraterei nötig.
 * Sonst wird der Wert als "naive" lokale Zeit in der übergebenen Sheet-Zeitzone
 * interpretiert (typischer Fall bei einem manuellen CSV-Export ohne Zeitzonen-Info).
 */
export function parseSheetTimestamp(raw: string, options: ParseSheetTimestampOptions): string {
  const trimmed = raw.trim();
  if (trimmed === "") {
    throw new Error("Leerer Zeitstempel kann nicht geparst werden.");
  }

  if (HAS_EXPLICIT_OFFSET.test(trimmed)) {
    const withOffset = DateTime.fromISO(trimmed, { setZone: true });
    if (withOffset.isValid) {
      return toIsoUtc(withOffset);
    }
  }

  const formats = options.formats ?? DEFAULT_FORMATS;
  for (const format of formats) {
    const dt = DateTime.fromFormat(trimmed, format, { zone: options.timeZone });
    if (dt.isValid) {
      return toIsoUtc(dt);
    }
  }

  throw new Error(
    `Zeitstempel "${raw}" konnte in keinem der bekannten Formate geparst werden ` +
      `(Zeitzone ${options.timeZone}). Prüfe das Exportformat oder ergänze ein passendes ` +
      `Format in timezone.ts.`,
  );
}

function toIsoUtc(dt: DateTime): string {
  const iso = dt.toUTC().toISO();
  if (!iso) throw new Error("Unerwarteter Fehler bei der Zeitzonen-Konvertierung.");
  return iso;
}
