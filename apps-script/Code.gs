/**
 * RTFVis — Apps-Script-Web-App für den Datenzugriff aufs Renn-Sheet.
 *
 * Gibt NUR die für die Kartenvisualisierung nötigen Felder heraus (Startnummer,
 * Checkpoint, Zeitstempel, Kategorie, Strecke) — bewusst keine Klarnamen, Telefonnummern
 * oder sonstige personenbezogenen Daten, damit ein Leak der Web-App-URL begrenzten
 * Schaden anrichtet.
 *
 * Einrichtung:
 * 1. Im Google Sheet: Erweiterungen > Apps Script, diesen Code einfügen.
 * 2. Projekteinstellungen > Skripteigenschaften > "API_TOKEN" mit einem langen,
 *    zufälligen Wert anlegen (z.B. per Passwortgenerator). Diesen Wert später als
 *    APPS_SCRIPT_TOKEN in der Server-.env eintragen.
 * 3. Die Konstanten unten (SHEET-Namen und Spaltennamen) an das echte Sheet anpassen.
 * 4. Bereitstellen > Neue Bereitstellung > Web-App:
 *    - Ausführen als: Ich
 *    - Zugriff: Jeder ("Jeder" bedeutet: jeder mit der URL — die URL+Token wirken
 *      zusammen wie ein Passwort. Nicht in ein öffentliches Repo committen!)
 * 5. Die bereitgestellte URL als APPS_SCRIPT_URL in der Server-.env eintragen.
 */

// ---- Konfiguration: an das echte Sheet anpassen ----------------------------------

// Enthält NUR die Kontrollen unterwegs -- Start und Ziel sind bewusst NICHT hier drin,
// siehe readStartScans()/readFinishScans() unten.
const SCANS_SHEET_NAME = "Kontrolle";
const SCANS_COLUMNS = {
  startNumber: "Bandnummer",
  checkpointId: "Kontrolle",
  timestamp: "Zeitstempel",
};

const ROSTER_SHEET_NAME = "TN Übersicht";
const ROSTER_COLUMNS = {
  startNumber: "Bandnummer",
  category: "Disziplin",
  routeId: "Streckenlänge", // optional, kann leer bleiben -> Fallback-Ableitung aus den Scans
  // Der Start-Scan ist keine eigene Zeile in einem Scan-Sheet, sondern diese Spalte hier
  // in der Teilnehmerübersicht -- sie wird erst befüllt, sobald der Fahrer tatsächlich
  // gestartet ist. Siehe readStartScans() unten.
  startTimestamp: "Zeitstempel",
};

// Eigenes Tabellenblatt für die Ziel-Ankunft ("wieder im Ziel"), enthält nur Zeitstempel
// und Bandnummer -- siehe readFinishScans() unten.
const FINISH_SHEET_NAME = "Zurück im Ziel";
const FINISH_COLUMNS = {
  startNumber: "Bandnummer",
  timestamp: "Zeitstempel",
};

// Checkpoint-IDs für synthetisierte Start-/Ziel-Scans, siehe data/checkpoints.json.
const START_CHECKPOINT_ID = "START";
const FINISH_CHECKPOINT_ID = "FINISH";

// -----------------------------------------------------------------------------------

function doGet(e) {
  const token = e.parameter.token;
  const expectedToken = PropertiesService.getScriptProperties().getProperty("API_TOKEN");

  if (!expectedToken) {
    return jsonResponse({ ok: false, error: "Server-Konfiguration unvollständig (API_TOKEN fehlt)." });
  }
  if (!token || token !== expectedToken) {
    return jsonResponse({ ok: false, error: "unauthorized" });
  }

  const resource = e.parameter.resource;
  try {
    if (resource === "roster") {
      return jsonResponse({ ok: true, data: readRoster() });
    }
    if (resource === "scans") {
      const since = e.parameter.since || null;
      return jsonResponse({ ok: true, data: readScans(since) });
    }
    return jsonResponse({ ok: false, error: `Unbekannte resource "${resource}". Erwartet: roster | scans.` });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function readRoster() {
  const rows = readSheetAsRecords(ROSTER_SHEET_NAME);
  return rows
    .filter((r) => r[ROSTER_COLUMNS.startNumber])
    .map((r) => ({
      startNumber: String(r[ROSTER_COLUMNS.startNumber]),
      category: String(r[ROSTER_COLUMNS.category]),
      routeId: r[ROSTER_COLUMNS.routeId] ? String(r[ROSTER_COLUMNS.routeId]) : undefined,
    }));
}

/**
 * Baut die vollständige Scan-Liste aus drei unterschiedlichen Quell-Sheets zusammen --
 * unser Datenmodell (eine flache scans-Tabelle: Startnummer/Checkpoint/Zeitstempel) bleibt
 * dabei unverändert, nur die Herkunft der einzelnen Zeilen unterscheidet sich:
 *  1. Kontrollen unterwegs: eigene Zeile pro Scan im SCANS_SHEET_NAME-Blatt.
 *  2. Start: keine eigene Zeile, sondern eine Spalte in der Teilnehmerübersicht.
 *  3. Ziel: eigenes Blatt mit nur Zeitstempel + Bandnummer.
 */
function readScans(sinceIso) {
  const scans = readCheckpointScans().concat(readStartScans(), readFinishScans());

  if (!sinceIso) return scans;
  return scans.filter((s) => s.timestampUtc > sinceIso);
}

function readCheckpointScans() {
  const rows = readSheetAsRecords(SCANS_SHEET_NAME);
  return rows
    .filter((r) => r[SCANS_COLUMNS.startNumber] && r[SCANS_COLUMNS.timestamp])
    .map((r) => ({
      startNumber: String(r[SCANS_COLUMNS.startNumber]),
      checkpointId: String(r[SCANS_COLUMNS.checkpointId]),
      timestampUtc: toIsoUtc(r[SCANS_COLUMNS.timestamp]),
    }));
}

/**
 * Zeilen ohne befüllte Start-Zeitstempel-Spalte sind Teilnehmer, die schlicht noch nicht
 * gestartet sind -- bewusst kein Scan für sie, nicht etwa ein Fehler.
 */
function readStartScans() {
  const rows = readSheetAsRecords(ROSTER_SHEET_NAME);
  return rows
    .filter((r) => r[ROSTER_COLUMNS.startNumber] && r[ROSTER_COLUMNS.startTimestamp])
    .map((r) => ({
      startNumber: String(r[ROSTER_COLUMNS.startNumber]),
      checkpointId: START_CHECKPOINT_ID,
      timestampUtc: toIsoUtc(r[ROSTER_COLUMNS.startTimestamp]),
    }));
}

function readFinishScans() {
  const rows = readSheetAsRecords(FINISH_SHEET_NAME);
  return rows
    .filter((r) => r[FINISH_COLUMNS.startNumber] && r[FINISH_COLUMNS.timestamp])
    .map((r) => ({
      startNumber: String(r[FINISH_COLUMNS.startNumber]),
      checkpointId: FINISH_CHECKPOINT_ID,
      timestampUtc: toIsoUtc(r[FINISH_COLUMNS.timestamp]),
    }));
}

/**
 * Wandelt einen Zellenwert nach UTC-ISO um. Ist die Zelle ein echter Datums-Typ (z.B. durch
 * ein verknüpftes Google-Formular automatisch befüllt), liefert toISOString() bereits den
 * korrekten absoluten Zeitpunkt — unabhängig von der Anzeige-Zeitzone des Sheets. Nur bei
 * einer reinen Text-Zelle wird explizit mit der Sheet-Zeitzone geparst.
 */
function toIsoUtc(value) {
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return value.toISOString();
  }
  const timeZone = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) {
    throw new Error(`Zeitstempel "${value}" konnte nicht geparst werden.`);
  }
  // Utilities.formatDate liest den Date-Wert in der angegebenen Zeitzone und gibt ihn im
  // gewünschten Format zurück; für einen bereits korrekten Date-Wert entspricht das exakt
  // dem UTC-Zeitpunkt. Für reine Text-Zellen ohne erkennbare Zeitzone bleibt dies ein
  // bestmöglicher Versuch — siehe README für Details zum CSV-Fallback mit expliziter Zeitzone.
  return Utilities.formatDate(parsed, timeZone, "yyyy-MM-dd'T'HH:mm:ss'Z'");
}

function readSheetAsRecords(sheetName) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" nicht gefunden.`);
  }
  const values = sheet.getDataRange().getValues();
  if (values.length === 0) return [];

  const header = values[0].map((h) => String(h).trim());
  return values.slice(1).map((row) => {
    const record = {};
    header.forEach((key, idx) => {
      record[key] = row[idx];
    });
    return record;
  });
}

function jsonResponse(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
