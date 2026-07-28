import { resolveRoute } from "./route-matching.js";
import { matchScansToRouteCheckpoints } from "./scan-matching.js";
import { estimateSpeed } from "./speed.js";
import type { Category, LonLat, Route, RosterEntry, ScanRecord } from "./types.js";

export type RiderStatus =
  | "notStarted"
  | "onCourse"
  | "overdue"
  | "finished"
  /** Beobachtete Scans passen zu keiner bekannten Strecke (z.B. Tippfehler in der Checkpoint-ID). */
  | "routeConflict"
  /**
   * Mehrere Kandidatenstrecken teilen sich den bisherigen Streckenverlauf, führen ab dem
   * letzten beobachteten Checkpoint aber unterschiedlich weiter (echte Verzweigung) oder
   * einige Kandidaten enden dort bereits, während andere weiterlaufen. Position ist bis
   * zum letzten Checkpoint bekannt, eine Extrapolation darüber hinaus wäre Rätselraten.
   */
  | "ambiguousRoute";

export interface RiderPosition {
  startNumber: string;
  status: RiderStatus;
  category: Category | null;
  /** Aufgelöste Strecke, nur gesetzt wenn eindeutig. */
  routeId: string | null;
  candidateRouteIds: string[];
  /** True, wenn eine im Roster hinterlegte Strecke nicht zu den Scans passte (Fallback wurde verwendet). */
  rosterConflict: boolean;
  distanceM: number | null;
  position: LonLat | null;
  speedMps: number | null;
  lastCheckpointId: string | null;
  lastCheckpointTimeUtc: string | null;
  nextCheckpointId: string | null;
  /**
   * Streckendistanz (m) des letzten/nächsten Checkpoints — positionsbasiert aufgelöst, nicht
   * über die Checkpoint-ID (siehe scan-matching.ts). Wichtig für Strecken mit mehrfach
   * besuchten Checkpoints: route.checkpoints.find(id) würde dort immer das ERSTE Vorkommen
   * treffen, auch wenn der Fahrer tatsächlich beim zweiten ist — mit u.U. falscher (sogar
   * rückwärtiger) Distanz als Folge. Konsumenten, die eine Restdistanz/erwartete Ankunftszeit
   * berechnen wollen, sollten IMMER diese Felder verwenden, nie selbst per ID nachschlagen.
   */
  lastCheckpointDistanceM: number | null;
  nextCheckpointDistanceM: number | null;
}

/** Anteil der Distanz zum nächsten Checkpoint, ab dem die Extrapolation gekappt wird. */
const CLAMP_FRACTION = 0.98;

/** Letzter Rückfall, falls noch niemand im gesamten Feld eine verwertbare Geschwindigkeit geliefert hat (~20 km/h). */
const DEFAULT_FALLBACK_SPEED_MPS = 5.55;

export interface ComputePositionsOptions {
  /** Überschreibt den globalen Rückfall-Wert (m/s), falls kein Kategorie-Median verfügbar ist. */
  globalFallbackSpeedMps?: number;
}

/**
 * Berechnet für jeden Fahrer im Feld die geschätzte Position zum Zeitpunkt `t`.
 *
 * Reine Funktion der übergebenen Scans (nicht nur der neuesten) — Live-Betrieb ruft sie
 * mit t=Date.now() auf, Replay mit der Zeit des Zeitleisten-Sliders. Kein separater
 * Code-Pfad für Replay.
 */
export function computePositions(
  scans: ScanRecord[],
  routes: Route[],
  roster: RosterEntry[],
  t: number,
  options: ComputePositionsOptions = {},
): RiderPosition[] {
  const routeById = new Map(routes.map((r) => [r.id, r]));
  const rosterByNumber = new Map(roster.map((r) => [r.startNumber, r]));
  const scansByRider = groupBy(scans, (s) => s.startNumber);

  const allStartNumbers = new Set<string>([...scansByRider.keys(), ...roster.map((r) => r.startNumber)]);

  interface Interim {
    startNumber: string;
    rosterEntry: RosterEntry | undefined;
    sortedScans: ScanRecord[];
    resolution: ReturnType<typeof resolveRoute>;
  }

  const interims: Interim[] = [];
  for (const startNumber of allStartNumbers) {
    const rosterEntry = rosterByNumber.get(startNumber);
    // Nur Scans bis einschließlich t berücksichtigen — im Replay ist t oft in der
    // Vergangenheit relativ zu späteren (bereits vorliegenden) Scans dieses Fahrers. Ohne
    // diesen Schnitt würde z.B. bei einem Rücksprung auf 09:00 trotzdem schon der Scan von
    // 11:00 als "letzter Scan" gelten: elapsedS wird negativ, auf 0 gekappt, und die Position
    // bleibt bis 11:00 regungslos am (aus Sicht von t) noch gar nicht erreichten Checkpoint
    // stehen. Im Live-Betrieb ist t=Date.now() ohnehin immer nach allen echten Scans, der
    // Schnitt ist dort also ein No-op.
    const sortedScans = (scansByRider.get(startNumber) ?? [])
      .filter((s) => Date.parse(s.timestampUtc) <= t)
      .slice()
      .sort((a, b) => a.timestampUtc.localeCompare(b.timestampUtc));
    const resolution = resolveRoute(sortedScans, rosterEntry, routes);
    interims.push({ startNumber, rosterEntry, sortedScans, resolution });
  }

  // Erster Durchlauf: reale Geschwindigkeitsschätzungen einsammeln, um Kategorie-Mediane
  // für Fahrer mit weniger als zwei passenden Scans zu bilden.
  const speedsByCategory = new Map<Category, number[]>();
  const allSpeeds: number[] = [];
  for (const interim of interims) {
    if (interim.resolution.candidateRouteIds.length !== 1) continue;
    const route = routeById.get(interim.resolution.candidateRouteIds[0]);
    if (!route) continue;
    const speed = estimateSpeed(interim.sortedScans, route);
    if (speed === null) continue;
    allSpeeds.push(speed);
    const category = interim.rosterEntry?.category ?? route.category;
    pushToMapArray(speedsByCategory, category, speed);
  }

  const categoryMedian = new Map<Category, number>();
  for (const [category, speeds] of speedsByCategory) {
    categoryMedian.set(category, median(speeds)!);
  }
  const globalFallback = options.globalFallbackSpeedMps ?? median(allSpeeds) ?? DEFAULT_FALLBACK_SPEED_MPS;

  const positions: RiderPosition[] = [];
  for (const interim of interims) {
    const { startNumber, rosterEntry, sortedScans, resolution } = interim;
    const category = rosterEntry?.category ?? null;

    if (sortedScans.length === 0) {
      positions.push(
        emptyPosition(startNumber, "notStarted", category, resolution.candidateRouteIds, resolution.conflict),
      );
      continue;
    }

    const lastScan = sortedScans[sortedScans.length - 1];
    const candidateRoutes = resolution.candidateRouteIds
      .map((id) => routeById.get(id))
      .filter((r): r is Route => r !== undefined);

    if (resolution.candidateRouteIds.length === 0 || candidateRoutes.length === 0) {
      positions.push({
        ...emptyPosition(startNumber, "routeConflict", category, resolution.candidateRouteIds, resolution.conflict),
        lastCheckpointId: lastScan.checkpointId,
        lastCheckpointTimeUtc: lastScan.timestampUtc,
      });
      continue;
    }

    // Positionsbasiert statt über die Checkpoint-ID, damit Strecken mit mehrfach
    // besuchten Checkpoints (z.B. eine Schleife über denselben Ort) korrekt behandelt
    // werden: die n-te Sichtung wird so dem n-ten Vorkommen zugeordnet, nicht immer dem
    // ersten (findIndex) — siehe scan-matching.ts.
    const representative = candidateRoutes[0];
    const matchedIndicesPerCandidate = candidateRoutes.map((r) => matchScansToRouteCheckpoints(sortedScans, r));
    const lastScanIdx = sortedScans.length - 1;

    const representativeCheckpointIndex = matchedIndicesPerCandidate[0][lastScanIdx];
    if (representativeCheckpointIndex === null) {
      // Kann durch die Kandidatenauflösung eigentlich nicht vorkommen (resolveRoute hat
      // bereits bestätigt, dass alle Scans zur Strecke passen) — defensiv trotzdem als
      // Datenproblem behandeln statt mit einem falschen Index abzustürzen.
      positions.push({
        ...emptyPosition(startNumber, "routeConflict", category, resolution.candidateRouteIds, resolution.conflict),
        lastCheckpointId: lastScan.checkpointId,
        lastCheckpointTimeUtc: lastScan.timestampUtc,
      });
      continue;
    }
    const lastCheckpointDistanceM = representative.checkpoints[representativeCheckpointIndex].distanceM;

    const nextCheckpoints = candidateRoutes.map((r, i) => {
      const idx = matchedIndicesPerCandidate[i][lastScanIdx];
      if (idx === null) return undefined;
      return r.checkpoints[idx + 1]; // undefined, wenn die Route hier endet
    });
    const allFinished = nextCheckpoints.every((cp) => cp === undefined);
    const firstNext = nextCheckpoints.find((cp) => cp !== undefined);
    const sharedNext =
      firstNext && nextCheckpoints.every((cp) => cp !== undefined && cp.id === firstNext.id) ? firstNext : null;

    const resolvedRouteId = candidateRoutes.length === 1 ? representative.id : null;

    if (allFinished) {
      positions.push({
        startNumber,
        status: "finished",
        category: category ?? representative.category,
        routeId: resolvedRouteId,
        candidateRouteIds: resolution.candidateRouteIds,
        rosterConflict: resolution.conflict,
        distanceM: lastCheckpointDistanceM,
        position: lonLatAt(representative, lastCheckpointDistanceM),
        speedMps: null,
        lastCheckpointId: lastScan.checkpointId,
        lastCheckpointTimeUtc: lastScan.timestampUtc,
        nextCheckpointId: null,
        lastCheckpointDistanceM,
        nextCheckpointDistanceM: null,
      });
      continue;
    }

    if (!sharedNext) {
      positions.push({
        startNumber,
        status: "ambiguousRoute",
        category: category ?? representative.category,
        routeId: null,
        candidateRouteIds: resolution.candidateRouteIds,
        rosterConflict: resolution.conflict,
        distanceM: lastCheckpointDistanceM,
        position: lonLatAt(representative, lastCheckpointDistanceM),
        speedMps: null,
        lastCheckpointId: lastScan.checkpointId,
        lastCheckpointTimeUtc: lastScan.timestampUtc,
        nextCheckpointId: null,
        lastCheckpointDistanceM,
        nextCheckpointDistanceM: null,
      });
      continue;
    }

    const resolvedCategory = category ?? representative.category;
    const rawSpeed = estimateSpeed(sortedScans, representative);
    const speedMps = rawSpeed ?? categoryMedian.get(resolvedCategory) ?? globalFallback;

    const elapsedS = (t - new Date(lastScan.timestampUtc).getTime()) / 1000;
    const rawDistanceM = lastCheckpointDistanceM + Math.max(0, elapsedS) * speedMps;

    const clampLimitM = lastCheckpointDistanceM + (sharedNext.distanceM - lastCheckpointDistanceM) * CLAMP_FRACTION;
    const overdue = rawDistanceM > clampLimitM;
    const distanceM = Math.min(rawDistanceM, clampLimitM);

    positions.push({
      startNumber,
      status: overdue ? "overdue" : "onCourse",
      category: resolvedCategory,
      routeId: resolvedRouteId,
      candidateRouteIds: resolution.candidateRouteIds,
      rosterConflict: resolution.conflict,
      distanceM,
      position: lonLatAt(representative, distanceM),
      speedMps,
      lastCheckpointId: lastScan.checkpointId,
      lastCheckpointTimeUtc: lastScan.timestampUtc,
      nextCheckpointId: sharedNext.id,
      lastCheckpointDistanceM,
      nextCheckpointDistanceM: sharedNext.distanceM,
    });
  }

  return positions;
}

function emptyPosition(
  startNumber: string,
  status: RiderStatus,
  category: Category | null,
  candidateRouteIds: string[],
  rosterConflict: boolean,
): RiderPosition {
  return {
    startNumber,
    status,
    category,
    routeId: candidateRouteIds.length === 1 ? candidateRouteIds[0] : null,
    candidateRouteIds,
    rosterConflict,
    distanceM: null,
    position: null,
    speedMps: null,
    lastCheckpointId: null,
    lastCheckpointTimeUtc: null,
    nextCheckpointId: null,
    lastCheckpointDistanceM: null,
    nextCheckpointDistanceM: null,
  };
}

/** Wandelt eine Distanz entlang der Streckengeometrie in eine Lon/Lat-Position um (Binärsuche + lineare Interpolation). */
export function lonLatAt(route: Route, distanceM: number): LonLat {
  const { cumulativeM, geometry } = route;
  const clamped = Math.max(0, Math.min(distanceM, cumulativeM[cumulativeM.length - 1]));

  let lo = 0;
  let hi = cumulativeM.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (cumulativeM[mid] <= clamped) lo = mid;
    else hi = mid - 1;
  }

  if (lo >= geometry.length - 1) {
    const [lon, lat] = geometry[geometry.length - 1];
    return { lon, lat };
  }

  const segStart = cumulativeM[lo];
  const segEnd = cumulativeM[lo + 1];
  const segLen = segEnd - segStart;
  const t = segLen === 0 ? 0 : (clamped - segStart) / segLen;
  const [lon1, lat1] = geometry[lo];
  const [lon2, lat2] = geometry[lo + 1];
  return { lon: lon1 + (lon2 - lon1) * t, lat: lat1 + (lat2 - lat1) * t };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return map;
}

function pushToMapArray<K>(map: Map<K, number[]>, key: K, value: number): void {
  if (!map.has(key)) map.set(key, []);
  map.get(key)!.push(value);
}
