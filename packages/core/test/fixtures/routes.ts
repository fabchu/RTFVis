import type { Category, Route } from "../../src/types.js";

/**
 * Baut eine simple, gerade Teststrecke: Geometrie hat nur zwei Stützpunkte, sodass
 * lonLatAt linear zwischen ihnen interpoliert — reicht aus, um die Positions-, Tempo-
 * und Routing-Logik unabhängig von echten Geo-Koordinaten zu testen.
 */
export function straightRoute(
  id: string,
  category: Category,
  checkpoints: { id: string; distanceM: number }[],
): Route {
  const totalDistanceM = checkpoints[checkpoints.length - 1].distanceM;
  return {
    id,
    category,
    name: id,
    totalDistanceM,
    checkpoints: checkpoints.map((c) => ({ ...c, deviationM: 0 })),
    geometry: [
      [8.6, 49.8],
      [8.6 + totalDistanceM / 100_000, 49.8],
    ],
    cumulativeM: [0, totalDistanceM],
  };
}

// RTF: kurze und lange Variante teilen sich START/CP1/CP2, diverieren danach
// (die lange Strecke hat einen zusätzlichen Checkpoint CP3) — genau das vom
// Nutzer beschriebene Muster "längere Strecken haben zusätzliche Checkpoints".
export const rtfShort = straightRoute("rtf-short", "RTF", [
  { id: "START", distanceM: 0 },
  { id: "CP1", distanceM: 10_000 },
  { id: "CP2", distanceM: 20_000 },
  { id: "FINISH_SHORT", distanceM: 30_000 },
]);

export const rtfLong = straightRoute("rtf-long", "RTF", [
  { id: "START", distanceM: 0 },
  { id: "CP1", distanceM: 10_000 },
  { id: "CP2", distanceM: 20_000 },
  { id: "CP3", distanceM: 35_000 },
  { id: "FINISH_LONG", distanceM: 50_000 },
]);

export const ctfRoute = straightRoute("ctf-70", "CTF", [
  { id: "START", distanceM: 0 },
  { id: "CP1", distanceM: 10_000 },
  { id: "FINISH_CTF", distanceM: 25_000 },
]);

// Strecke mit mehrfach besuchtem Checkpoint (Schleife über denselben Ort) — reales
// Muster aus den Renndaten, z.B. rtf-159, wo K3 zweimal vorkommt.
export const rtfLoop = straightRoute("rtf-loop", "RTF", [
  { id: "START", distanceM: 0 },
  { id: "K1", distanceM: 10_000 },
  { id: "K3", distanceM: 20_000 }, // erstes Vorkommen
  { id: "K4", distanceM: 30_000 },
  { id: "K3", distanceM: 40_000 }, // zweites Vorkommen, andere Distanz als das erste
  { id: "FINISH", distanceM: 50_000 },
]);

// Echter Rundkurs (Geometrie kehrt zum Startpunkt zurück, wie bei den echten Strecken) —
// für Sternfahrt-Tests. straightRoute() liefert bewusst KEINEN Rundkurs (gerade Linie,
// Anfang != Ende), deshalb hier von Hand mit einer quadratischen Geometrie gebaut.
export const rtfRundkurs: Route = {
  id: "rtf-rundkurs",
  category: "RTF",
  name: "rtf-rundkurs",
  totalDistanceM: 50_000,
  checkpoints: [
    { id: "START", distanceM: 0, deviationM: 0 },
    { id: "K1", distanceM: 10_000, deviationM: 0 },
    { id: "K2", distanceM: 20_000, deviationM: 0 },
    { id: "K3", distanceM: 30_000, deviationM: 0 },
    { id: "K4", distanceM: 40_000, deviationM: 0 },
    { id: "FINISH", distanceM: 50_000, deviationM: 0 },
  ],
  geometry: [
    [8.6, 49.8],
    [8.7, 49.8],
    [8.7, 49.9],
    [8.6, 49.9],
    [8.6, 49.8], // zurück zum Startpunkt -> echter Rundkurs
  ],
  cumulativeM: [0, 12_500, 25_000, 37_500, 50_000],
};

export const allRoutes: Route[] = [rtfShort, rtfLong, ctfRoute];
