/**
 * Löst eine Checkpoint-Bezeichnung aus dem "Kontrolle"-Sheet (ausgeschriebener Freitext,
 * z.B. "K4 RTF Dornholzhausen") auf unsere kurze interne Checkpoint-ID (z.B. "K4", siehe
 * data/checkpoints.json) auf. Statt einer festen Alias-Tabelle wie bei den Streckennamen
 * (routeNameMapping.ts) reicht hier ein Präfix-Vergleich: die interne ID steht offenbar
 * immer am Anfang des Sheet-Werts, gefolgt von zusätzlichem Beschreibungstext. Die
 * Leerzeichennutzung ist dabei inkonsistent (z.B. bei ID's wie "K3/5" mal mit, mal ohne
 * Leerzeichen um den Schrägstrich) -- deshalb wird für den Vergleich jeglicher Whitespace
 * entfernt, nicht nur getrimmt.
 */

function normalize(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, "");
}

const warnedUnknownValues = new Set<string>();

/**
 * Gibt die längste unter validIds normalisiert passende ID zurück, deren normalisierte
 * Form ein Präfix des normalisierten Sheet-Werts ist (längste zuerst geprüft, damit z.B.
 * "K10 ..." nicht fälschlich schon an "K1" matcht). Kein Match -> der Rohwert wird
 * unverändert durchgereicht (matcht dann später einfach keinem Streckenabschnitt, statt
 * den Poll mit einem Fehler abzubrechen) und einmalig geloggt.
 */
export function resolveCheckpointId(raw: string, validIds: readonly string[]): string {
  const key = normalize(raw);
  const byLengthDesc = [...validIds].sort((a, b) => b.length - a.length);
  for (const id of byLengthDesc) {
    if (key.startsWith(normalize(id))) return id;
  }
  if (!warnedUnknownValues.has(key)) {
    warnedUnknownValues.add(key);
    console.warn(`[checkpointIdMapping] Unbekannte Checkpoint-Bezeichnung im Sheet: "${raw}" -- keine bekannte ID als Präfix gefunden.`);
  }
  return raw;
}
