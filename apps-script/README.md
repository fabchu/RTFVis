# Apps Script Setup

Die Einrichtungsschritte stehen als Kommentar oben in [`Code.gs`](Code.gs). Kurzfassung:

1. Google Sheet öffnen → **Erweiterungen → Apps Script** → Inhalt von `Code.gs` einfügen.
2. **Projekteinstellungen → Skripteigenschaften** → `API_TOKEN` mit einem langen Zufallswert anlegen.
3. Die Konstanten `SCANS_SHEET_NAME`, `SCANS_COLUMNS`, `ROSTER_SHEET_NAME`, `ROSTER_COLUMNS`, `FINISH_SHEET_NAME`, `FINISH_COLUMNS` oben in `Code.gs` an die echten Tabellenblatt- und Spaltennamen anpassen.
4. **Bereitstellen → Neue Bereitstellung → Web-App**: Ausführen als „Ich", Zugriff „Jeder".
5. Die bereitgestellte URL + das Token in `apps/server/.env` eintragen (siehe `.env.example`).

## Testen ohne den Server

```bash
curl "https://script.google.com/macros/s/DEIN_DEPLOYMENT_ID/exec?resource=roster&token=DEIN_TOKEN"
curl "https://script.google.com/macros/s/DEIN_DEPLOYMENT_ID/exec?resource=scans&token=DEIN_TOKEN"
```

Erwartete Antwort: `{"ok":true,"data":[...]}`. Bei falschem Token: `{"ok":false,"error":"unauthorized"}`.

## Erwartete Tabellenblätter

Start und Ziel sind im echten Sheet KEINE Zeilen im Kontrollen-Scan-Blatt, sondern kommen
aus zwei anderen Quellen — `readScans()` in `Code.gs` fügt alle drei zu einer flachen
Scan-Liste zusammen, bevor sie den Server erreichen (unser Datenmodell bleibt dadurch
unverändert: Startnummer/Checkpoint/Zeitstempel).

**`TN Übersicht`** (Teilnehmerübersicht, Blatt- und Spaltennamen in `ROSTER_COLUMNS`):

| Bandnummer | Disziplin | Streckenlänge | Zeitstempel |
|---|---|---|---|
| 101 | RTF | RTF - 49 km | 2026-07-25 08:03:12 |

`Streckenlänge` darf leer bleiben — dann übernimmt später die Ableitung aus den Scans
(Phase 3). Die Werte werden zusätzlich serverseitig über `routeNameMapping.ts` auf unsere
internen Routen-IDs gemappt, da das Sheet Klartext-Bezeichnungen statt unserer IDs enthält.

`Zeitstempel` hier ist der **Start-Scan**: die Spalte wird erst befüllt, sobald der
Fahrer tatsächlich gestartet ist. Leer = noch nicht gestartet, kein Fehler — dafür gibt es
in dieser Zeile schlicht (noch) keinen synthetisierten Start-Scan.

**`Kontrolle2`** — nur die Kontrollen unterwegs, NICHT Start oder Ziel. Befüllt über eine
AppSheet-Anbindung (löst das alte, per Google-Formular befüllte `Kontrolle` ab), die
Kontrollen bei Funklöchern lokal puffert und erst später synct:

| ID | Bandnummer | Kontrolle | Zeitstempel | Zeitstempel_tech |
|---|---|---|---|---|
| 1 | 101 | K1 | 2026-07-25 09:14:32 | 2026-07-25 09:14:40 |

`Zeitstempel` ist die Ereigniszeit (wann die Kontrolle stattfand), `Zeitstempel_tech` wann
die Zeile im Sheet ankam (gesetzt von `markSyncTime()`, per `onChange`-Trigger). Der
`since`-Filter beim Polling läuft bewusst gegen `Zeitstempel_tech`, nicht gegen
`Zeitstempel` — sonst würde ein wegen Pufferung verspätet eingetroffener Scan mit "altem"
Ereignis-Zeitstempel dauerhaft verloren gehen (spätere Polls fragen nur noch nach neueren
Zeitstempeln). `Zeitstempel_tech` kann nie kleiner als `Zeitstempel` sein, daher ist eine
gerade erst angekommene Zeile garantiert neuer als jedes bisherige `since` — unabhängig
davon, wie alt ihr Ereignis tatsächlich war. Der zurückgegebene Scan trägt trotzdem weiter
die Ereigniszeit als `timestampUtc` (entscheidend für Positions-/Tempoberechnung).

**`Zurück im Ziel`** — eigenes Blatt für die Ziel-Ankunft:

| Bandnummer | Zeitstempel |
|---|---|
| 101 | 2026-07-25 14:02:47 |

Die jeweilige `Zeitstempel`-Spalte sollte idealerweise ein echter Datums-Typ sein (z.B.
automatisch von einem verlinkten Google-Formular befüllt) — dann ist die
Zeitzonen-Umrechnung immer korrekt, unabhängig von der Anzeige-Zeitzone des Sheets.
