import { describe, expect, it } from "vitest";
import { generateSternfahrtVariants } from "../src/preprocess/sternfahrt.js";
import { isSubsequence, resolveRoute } from "../src/route-matching.js";
import type { ScanRecord } from "../src/types.js";
import { allRoutes, ctfRoute, rtfLong, rtfRundkurs, rtfShort } from "./fixtures/routes.js";

function scan(startNumber: string, checkpointId: string, timestampUtc: string): ScanRecord {
  return { startNumber, checkpointId, timestampUtc };
}

describe("isSubsequence", () => {
  it("ist true für eine leere Nadel", () => {
    expect(isSubsequence([], ["A", "B"])).toBe(true);
  });

  it("erkennt eine Teilfolge trotz ausgelassener Elemente", () => {
    expect(isSubsequence(["A", "C"], ["A", "B", "C", "D"])).toBe(true);
  });

  it("erkennt falsche Reihenfolge als keine Teilfolge", () => {
    expect(isSubsequence(["C", "A"], ["A", "B", "C", "D"])).toBe(false);
  });

  it("erkennt ein nicht vorhandenes Element als keine Teilfolge", () => {
    expect(isSubsequence(["A", "X"], ["A", "B", "C"])).toBe(false);
  });
});

describe("resolveRoute", () => {
  it("gibt bei fehlenden Scans alle Strecken der Kategorie als Kandidaten zurück", () => {
    const result = resolveRoute([], { startNumber: "1", category: "RTF" }, allRoutes);
    expect(result.candidateRouteIds.sort()).toEqual(["rtf-long", "rtf-short"]);
    expect(result.conflict).toBe(false);
  });

  it("filtert nach Kategorie, auch ohne Scans", () => {
    const result = resolveRoute([], { startNumber: "1", category: "CTF" }, allRoutes);
    expect(result.candidateRouteIds).toEqual(["ctf-70"]);
  });

  it("übernimmt die Roster-Zuordnung, wenn sie zu den Scans passt", () => {
    const scans = [scan("1", "START", "t1"), scan("1", "CP1", "t2")];
    const result = resolveRoute(scans, { startNumber: "1", category: "RTF", routeId: "rtf-short" }, allRoutes);
    expect(result).toEqual({ candidateRouteIds: ["rtf-short"], conflict: false });
  });

  it("meldet einen Konflikt und fällt auf die Ableitung zurück, wenn die Roster-Zuordnung nicht passt", () => {
    // Roster sagt rtf-short, aber der Fahrer hat CP3 gescannt, das nur auf rtf-long existiert.
    const scans = [scan("1", "START", "t1"), scan("1", "CP3", "t2")];
    const result = resolveRoute(scans, { startNumber: "1", category: "RTF", routeId: "rtf-short" }, allRoutes);
    expect(result).toEqual({ candidateRouteIds: ["rtf-long"], conflict: true });
  });

  it("bleibt mehrdeutig, solange die beobachteten Scans zu mehreren Strecken passen", () => {
    const scans = [scan("1", "START", "t1"), scan("1", "CP1", "t2"), scan("1", "CP2", "t3")];
    const result = resolveRoute(scans, { startNumber: "1", category: "RTF" }, allRoutes);
    expect(result.candidateRouteIds.sort()).toEqual(["rtf-long", "rtf-short"]);
  });

  it("löst eindeutig auf, sobald ein Scan nur zu einer Strecke passt", () => {
    const scans = [scan("1", "START", "t1"), scan("1", "CP1", "t2"), scan("1", "CP2", "t3"), scan("1", "CP3", "t4")];
    const result = resolveRoute(scans, { startNumber: "1", category: "RTF" }, allRoutes);
    expect(result.candidateRouteIds).toEqual(["rtf-long"]);
  });

  it("toleriert einen einzelnen ausgelassenen Scan (Teilfolge statt Präfix)", () => {
    // CP1 fehlt (z.B. Scanner-Ausfall), trotzdem sollte rtf-short weiter erkannt werden.
    const scans = [scan("1", "START", "t1"), scan("1", "CP2", "t2"), scan("1", "FINISH_SHORT", "t3")];
    const result = resolveRoute(scans, { startNumber: "1", category: "RTF" }, allRoutes);
    expect(result.candidateRouteIds).toEqual(["rtf-short"]);
  });

  it("gibt keine Kandidaten zurück, wenn kein Streckenverlauf passt", () => {
    const scans = [scan("1", "UNBEKANNTER_CP", "t1")];
    const result = resolveRoute(scans, { startNumber: "1", category: "RTF" }, allRoutes);
    expect(result.candidateRouteIds).toEqual([]);
  });

  it("funktioniert auch ganz ohne Roster-Eintrag (durchsucht alle Kategorien)", () => {
    const scans = [scan("1", "FINISH_CTF", "t1")];
    const result = resolveRoute(scans, undefined, allRoutes);
    expect(result.candidateRouteIds).toEqual(["ctf-70"]);
  });
});

describe("resolveRoute mit Sternfahrt-Varianten", () => {
  const [sternfahrtVariante] = generateSternfahrtVariants([rtfRundkurs]);
  const routesWithVariant = [rtfRundkurs, sternfahrtVariante];

  it("bleibt für einen normalen, vorwärts fahrenden Fahrer eindeutig — die Variante wird NICHT als Kandidat mitgezählt", () => {
    // Ohne Rückfall-Priorität wäre das hier fälschlich mehrdeutig (die Variante enthält
    // dieselbe Präfix-Sequenz auch), obwohl ein ganz normaler Fahrer unterwegs ist.
    const scans = [scan("1", "START", "t1"), scan("1", "K1", "t2"), scan("1", "K2", "t3")];
    const result = resolveRoute(scans, { startNumber: "1", category: "RTF" }, routesWithVariant);
    expect(result.candidateRouteIds).toEqual(["rtf-rundkurs"]);
  });

  it("fällt auf die Sternfahrt-Variante zurück, wenn keine reguläre Strecke mehr passt", () => {
    // Sternfahrer: physisch bei K2 gestartet, fährt K2->K3->K4->START (Anmeldung)->K1.
    const scans = [
      scan("1", "K3", "t1"),
      scan("1", "K4", "t2"),
      scan("1", "START", "t3"),
      scan("1", "K1", "t4"),
    ];
    const result = resolveRoute(scans, { startNumber: "1", category: "RTF" }, routesWithVariant);
    expect(result.candidateRouteIds).toEqual(["rtf-rundkurs-sternfahrt"]);
  });

  it("erkennt eine explizite Roster-Zuordnung zur Sternfahrt-Variante direkt, ohne über die Ableitung zu gehen", () => {
    const scans = [scan("1", "K3", "t1"), scan("1", "K4", "t2")];
    const result = resolveRoute(
      scans,
      { startNumber: "1", category: "RTF", routeId: "rtf-rundkurs-sternfahrt" },
      routesWithVariant,
    );
    expect(result).toEqual({ candidateRouteIds: ["rtf-rundkurs-sternfahrt"], conflict: false });
  });
});
