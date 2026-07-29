import type { Category, Route, RosterEntry, ScanRecord } from "@rtfvis/core";
import { resolveRoute } from "@rtfvis/core";

const START_CHECKPOINT_ID = "START";
const FINISH_CHECKPOINT_ID = "FINISH";

/**
 * "registered": Strecke wie im Anmeldeformular angegeben (roster.routeId).
 * "scans": Strecke wie aus der beobachteten Checkpoint-Folge abgeleitet, unabhängig von
 * der Anmeldung -- deckt z.B. spontane Streckenwechsel auf.
 * Beide Modi fallen auf den jeweils anderen Wert zurück, wenn der bevorzugte fehlt, damit
 * ein Fahrer nicht allein wegen einer fehlenden Angabe komplett aus der Rangliste fällt.
 */
export type RouteAssignmentMode = "registered" | "scans";

export interface RankingRow {
  startNumber: string;
  category: Category;
  routeId: string;
  rank: number;
  finishDurationMs: number;
  startedAtMs: number;
  finishedAtMs: number;
  /** True, wenn Anmeldung und Scan-Ableitung existieren, aber unterschiedliche Strecken ergeben. */
  routeMismatch: boolean;
}

function groupScansByRider(scans: ScanRecord[]): Map<string, ScanRecord[]> {
  const map = new Map<string, ScanRecord[]>();
  for (const scan of scans) {
    if (!map.has(scan.startNumber)) map.set(scan.startNumber, []);
    map.get(scan.startNumber)!.push(scan);
  }
  return map;
}

/**
 * Rangliste je Strecke, sortiert nach Zielzeit aufsteigend. Sternfahrt-Varianten (siehe
 * @rtfvis/core preprocess/sternfahrt.ts) werden komplett ignoriert -- deren Zeit ist wegen
 * des abweichenden Startpunkts nicht mit der regulären Strecke vergleichbar. Nur Fahrer mit
 * sowohl START- als auch FINISH-Scan (bis nowMs) zählen als Finisher.
 */
export function computeRanking(
  roster: RosterEntry[],
  scans: ScanRecord[],
  routes: Route[],
  nowMs: number,
  mode: RouteAssignmentMode,
): Map<string, RankingRow[]> {
  const realRoutes = routes.filter((r) => !r.baseRouteId);
  const realRouteIds = new Set(realRoutes.map((r) => r.id));
  const realRoutesById = new Map(realRoutes.map((r) => [r.id, r]));
  const rosterByStartNumber = new Map(roster.map((r) => [r.startNumber, r]));
  const relevantScans = scans.filter((s) => Date.parse(s.timestampUtc) <= nowMs);
  const scansByRider = groupScansByRider(relevantScans);

  const grouped = new Map<string, RankingRow[]>();

  for (const [startNumber, riderScans] of scansByRider) {
    const sorted = [...riderScans].sort((a, b) => a.timestampUtc.localeCompare(b.timestampUtc));
    const startScan = sorted.find((s) => s.checkpointId === START_CHECKPOINT_ID);
    const finishScan = [...sorted].reverse().find((s) => s.checkpointId === FINISH_CHECKPOINT_ID);
    if (!startScan || !finishScan) continue;

    const finishDurationMs = Date.parse(finishScan.timestampUtc) - Date.parse(startScan.timestampUtc);
    if (finishDurationMs <= 0) continue;

    const rosterEntry = rosterByStartNumber.get(startNumber);
    const registeredRouteId =
      rosterEntry?.routeId && realRouteIds.has(rosterEntry.routeId) ? rosterEntry.routeId : undefined;

    const derivedCandidates = resolveRoute(sorted, undefined, realRoutes).candidateRouteIds;
    const scanDerivedRouteId = derivedCandidates.length === 1 ? derivedCandidates[0] : undefined;

    const bucketRouteId = mode === "registered" ? (registeredRouteId ?? scanDerivedRouteId) : (scanDerivedRouteId ?? registeredRouteId);
    if (!bucketRouteId) continue;

    const category = rosterEntry?.category ?? realRoutesById.get(bucketRouteId)?.category;
    if (!category) continue;

    const row: RankingRow = {
      startNumber,
      category,
      routeId: bucketRouteId,
      rank: 0, // wird unten nach dem Sortieren je Strecke gesetzt
      finishDurationMs,
      startedAtMs: Date.parse(startScan.timestampUtc),
      finishedAtMs: Date.parse(finishScan.timestampUtc),
      routeMismatch: registeredRouteId !== undefined && scanDerivedRouteId !== undefined && registeredRouteId !== scanDerivedRouteId,
    };

    if (!grouped.has(bucketRouteId)) grouped.set(bucketRouteId, []);
    grouped.get(bucketRouteId)!.push(row);
  }

  for (const rows of grouped.values()) {
    rows.sort(
      (a, b) => a.finishDurationMs - b.finishDurationMs || a.startNumber.localeCompare(b.startNumber, undefined, { numeric: true }),
    );
    rows.forEach((row, index) => {
      row.rank = index + 1;
    });
  }

  return grouped;
}
