# Apps Script Setup

Die Einrichtungsschritte stehen als Kommentar oben in [`Code.gs`](Code.gs). Kurzfassung:

1. Google Sheet öffnen → **Erweiterungen → Apps Script** → Inhalt von `Code.gs` einfügen.
2. **Projekteinstellungen → Skripteigenschaften** → `API_TOKEN` mit einem langen Zufallswert anlegen.
3. Die Konstanten `SCANS_SHEET_NAME`, `SCANS_COLUMNS`, `ROSTER_SHEET_NAME`, `ROSTER_COLUMNS` oben in `Code.gs` an die echten Tabellenblatt- und Spaltennamen anpassen.
4. **Bereitstellen → Neue Bereitstellung → Web-App**: Ausführen als „Ich", Zugriff „Jeder".
5. Die bereitgestellte URL + das Token in `apps/server/.env` eintragen (siehe `.env.example`).

## Testen ohne den Server

```bash
curl "https://script.google.com/macros/s/DEIN_DEPLOYMENT_ID/exec?resource=roster&token=DEIN_TOKEN"
curl "https://script.google.com/macros/s/DEIN_DEPLOYMENT_ID/exec?resource=scans&token=DEIN_TOKEN"
```

Erwartete Antwort: `{"ok":true,"data":[...]}`. Bei falschem Token: `{"ok":false,"error":"unauthorized"}`.

## Erwartete Tabellenblätter

**`Teilnehmer`** (oder wie in `ROSTER_COLUMNS` konfiguriert):

| Startnummer | Kategorie | Strecke |
|---|---|---|
| 101 | RTF | rtf-90 |

`Strecke` darf leer bleiben — dann übernimmt später die Ableitung aus den Scans (Phase 3).

**`Scans`**:

| Startnummer | Checkpoint | Zeitstempel |
|---|---|---|
| 101 | CP1 | 2026-07-25 09:14:32 |

Die Spalte `Zeitstempel` sollte idealerweise ein echter Datums-Typ sein (z.B. automatisch von einem verlinkten Google-Formular befüllt) — dann ist die Zeitzonen-Umrechnung immer korrekt, unabhängig von der Anzeige-Zeitzone des Sheets.
