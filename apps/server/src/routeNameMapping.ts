/**
 * Bildet die im Sheet gepflegten Streckenbezeichnungen (Freitext, von Menschen eingetragen)
 * auf unsere internen Routen-IDs (siehe data/routes.json) ab. Sheet-Werte sind weder in
 * Schreibweise noch bei Leerzeichen konsistent (z.B. "RTF - 49km" vs. "RTF - 49 km"),
 * deshalb wird für den Lookup auf Kleinschreibung ohne jegliche Leerzeichen normalisiert,
 * statt eine feste Formatierung im Sheet vorauszusetzen.
 */
const ROUTE_NAME_ALIASES: Record<string, string> = {
  "rtf-49km": "rtf-49",
  "rtf-75km": "rtf-75",
  "rtf-115km": "rtf-115",
  "rtf-159km": "rtf-159",
  "ctf-42km": "ctf-42",
  "ctf-63km": "ctf-63",
  // "CTF - 75 km" ist ein Tippfehler im Sheet (sollte 79 km heißen; Korrektur beim
  // Sheet-Ersteller angefragt) — bis dahin beide Schreibweisen auf ctf-79 mappen.
  "ctf-75km": "ctf-79",
  "ctf-79km": "ctf-79",
  // Die vier Jedermann-Distanzen laufen alle über denselben (einzigen) Checkpoint und sind
  // damit für uns ohnehin nicht unterscheidbar — alle auf die eine Jedermann-Route mappen.
  "jedermann5km": "jed-13",
  "jedermann7,5km": "jed-13",
  "jedermann15km": "jed-13",
  "jedermann25km": "jed-13",
};

function normalizeKey(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, "");
}

const warnedUnknownValues = new Set<string>();

/**
 * Löst eine Sheet-Streckenbezeichnung in unsere interne Routen-ID auf. Unbekannte Werte
 * werden NICHT unverändert durchgereicht (das würde in resolveRoute() ohnehin nie exakt
 * matchen), sondern wie "keine Vorab-Zuordnung im Sheet" behandelt, damit der bestehende
 * Checkpoint-Ableitungs-Fallback greift statt eines dauerhaft falschen Konflikts. Jeder
 * unbekannte Wert wird einmalig geloggt, damit neue/geänderte Sheet-Bezeichnungen aus dem
 * echten Betrieb auffallen, statt fehlzuschlagen oder wortlos ignoriert zu werden.
 */
export function mapSheetRouteId(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const key = normalizeKey(raw);
  const mapped = ROUTE_NAME_ALIASES[key];
  if (mapped) return mapped;
  if (!warnedUnknownValues.has(key)) {
    warnedUnknownValues.add(key);
    console.warn(
      `[routeNameMapping] Unbekannte Streckenbezeichnung im Sheet: "${raw}" — falle auf Checkpoint-Ableitung zurück.`,
    );
  }
  return undefined;
}
