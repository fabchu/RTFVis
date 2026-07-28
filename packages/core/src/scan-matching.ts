import type { Route, ScanRecord } from "./types.js";

/**
 * Ordnet jedem Scan (in der gegebenen chronologischen Reihenfolge) die passende Position
 * in route.checkpoints zu — als Index in diese Liste, oder null, wenn dieser einzelne
 * Scan nicht zur Strecke gehört (z.B. Checkpoint einer anderen Strecke).
 *
 * Wichtig bei Strecken, die einen Checkpoint mehrfach besuchen (z.B. eine Schleife, die
 * über denselben Ort führt): ein einfaches findIndex()/eine Map nach Checkpoint-ID würde
 * immer nur EIN Vorkommen liefern, unabhängig davon, welches der Fahrer gerade tatsächlich
 * passiert hat. Diese Funktion geht stattdessen — wie isSubsequence in route-matching.ts,
 * nur mit Index statt Boolean — die Streckenliste monoton mit voran: die n-te Sichtung
 * eines Checkpoints wird so korrekt dem n-ten Vorkommen auf der Strecke zugeordnet.
 *
 * Ein nicht passender Scan verbraucht dabei bewusst NICHT den Streckenzeiger — sonst
 * würde ein einzelner fremder Scan alle danach folgenden, eigentlich passenden Scans
 * fälschlich verwerfen. Für jede Scan-Sequenz, die zuvor bereits als Teilfolge von
 * route.checkpoints bestätigt wurde (siehe resolveRoute), matcht dadurch garantiert jeder
 * einzelne Scan — beide Funktionen sind derselbe Greedy-Zwei-Zeiger-Algorithmus, nur
 * einmal als Boolean, einmal mit Index.
 */
export function matchScansToRouteCheckpoints(scans: ScanRecord[], route: Route): (number | null)[] {
  const matches: (number | null)[] = new Array(scans.length).fill(null);
  let routeIdx = 0;

  for (let i = 0; i < scans.length; i++) {
    let searchIdx = routeIdx;
    while (searchIdx < route.checkpoints.length && route.checkpoints[searchIdx].id !== scans[i].checkpointId) {
      searchIdx++;
    }

    if (searchIdx < route.checkpoints.length) {
      matches[i] = searchIdx;
      routeIdx = searchIdx + 1; // nächster Scan sucht erst ab dem folgenden Streckeneintrag weiter
    }
    // Kein Treffer -> routeIdx bleibt unverändert, damit der nächste Scan trotzdem noch
    // ab derselben Stelle matchen kann (siehe Docstring oben).
  }

  return matches;
}
