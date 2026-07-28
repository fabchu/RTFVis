# RTFVis

Visualisierung von Radfahrern auf einer Karte für ein Radrennen (RTF/CTF/Jedermann),
basierend auf Checkpoint-Registrierungen mit Zeitstempel aus einem Google Sheet.

Da es kein GPS-Tracking gibt, wird die Position zwischen zwei Checkpoints anhand des
zuletzt gefahrenen Tempos entlang der echten Streckengeometrie interpoliert. Die App
läuft lokal (kein öffentliches Hosting), unterstützt Live-Betrieb während des Rennens
und Replay danach.

## Aufbau

```
packages/core     Reine Domänenlogik: Positionsberechnung, Routenzuordnung, GPX-Preprocessing
apps/server       Fastify-Backend: pollt das Sheet, persistiert in SQLite, liefert JSON-API
apps/web          React/MapLibre-Frontend
apps-script/      Code.gs — Web-App fürs Google Sheet
data/             checkpoints.json, route-checkpoints.yaml, gpx/, generierte routes.json
```

## Einrichtung

### 1. Abhängigkeiten installieren

```bash
pnpm install
```

Voraussetzung: Node.js ≥ 22.5 (wegen des eingebauten `node:sqlite`-Moduls).

### 2. Streckendaten aufbereiten

Mit Platzhalterdaten zum Ausprobieren:

```bash
pnpm generate:example-data
pnpm build:routes
```

Mit echten Daten: `data/checkpoints.json`, `data/route-checkpoints.yaml` und
`data/gpx/*.gpx` durch die echten Dateien ersetzen, dann `pnpm build:routes` erneut
ausführen. Der Befehl schreibt `data/validation-report.json` und gibt Warnungen aus,
wenn ein Checkpoint weit von der Strecke abweicht oder die Reihenfolge nicht passt —
diese vor dem Renntag beheben.

### 3. Google Sheet und Apps Script

Siehe [apps-script/README.md](apps-script/README.md) für die Einrichtung des Sheets
und des Web-App-Deployments.

### 4. Server konfigurieren

```bash
cp apps/server/.env.example apps/server/.env
```

`.env` ausfüllen (siehe Kommentare in der Datei): `APPS_SCRIPT_URL`, `APPS_SCRIPT_TOKEN`,
ggf. `SHEET_TIMEZONE` für den CSV-Fallback.

### 5. Starten

```bash
pnpm race
```

Startet Backend und Frontend und öffnet die Karte im Browser. Alternativ einzeln:

```bash
pnpm --filter @rtfvis/server start
pnpm --filter @rtfvis/web dev
```

## Tests

```bash
pnpm test
```

## Renntag-Checkliste

**Vorbereitung (Tage vorher):**

- [ ] Echte GPX-Dateien, Checkpoints und Streckenzuordnungen eingespielt, `pnpm build:routes`
      läuft ohne Warnungen im Validierungsbericht
- [ ] Google Sheet eingerichtet (Tabellenblätter `Teilnehmer`/`Scans`, Spaltennamen passen
      zu `apps-script/Code.gs`)
- [ ] Sheet-Zeitzone geprüft (Datei → Tabelleneinstellungen) — muss zur tatsächlichen
      Zeitzone der Zeitstempel passen
- [ ] Apps Script deployt, `API_TOKEN` gesetzt, URL + Token in `apps/server/.env`
- [ ] Trockenlauf: ein paar Test-Scans ins Sheet eintragen, `pnpm race` starten, prüfen
      dass die Fahrer auf der Karte erscheinen und die Zeiten stimmen (Zeitzonen-Fallstrick!)
- [ ] CSV-Fallback vorbereitet: `DATA_SOURCE=csv`, `ROSTER_CSV_PATH`, `SCANS_CSV_PATH`,
      `SHEET_TIMEZONE` bekannt, falls das Apps Script am Renntag ausfällt (Google Sheet
      dann per "Datei → Herunterladen → CSV" exportieren und Server mit dieser
      Konfiguration neu starten)

**Am Renntag:**

- [ ] Laptop-Akku/Stromversorgung und WLAN am Einsatzort getestet
- [ ] `pnpm race` gestartet, Verbindungsstatus in der Sidebar zeigt "Verbunden" (grün)
- [ ] Ersten echten Scan probeweise verfolgt, bevor das Feld startet

**Falls etwas nicht stimmt:**

- Verbindungsstatus zeigt "Keine aktuellen Daten" oder "Fehler" → Serverlog prüfen
  (`[poll] Fehler ...`), meist Netzwerk- oder Token-Problem
- Fahrer fehlt komplett → Startnummer im Roster-Tabellenblatt prüfen
- Fahrer an falscher Position → Zeitzone prüfen, `data/validation-report.json` auf
  Abweichungen am betroffenen Checkpoint prüfen
