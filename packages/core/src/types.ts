export type Category = "RTF" | "CTF" | "Jedermann";

export interface LonLat {
  lon: number;
  lat: number;
}

export interface CheckpointDef {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export interface RouteInput {
  id: string;
  category: Category;
  name: string;
  gpxFile: string;
  /** Checkpoint-IDs in Fahrreihenfolge, von Start bis Ziel. */
  checkpoints: string[];
}

export interface RouteCheckpointPosition {
  id: string;
  distanceM: number;
  /** Abstand zwischen Original-Checkpoint-Koordinate und Snap-Position auf der Strecke, in Metern. */
  deviationM: number;
}

export interface Route {
  id: string;
  category: Category;
  name: string;
  totalDistanceM: number;
  checkpoints: RouteCheckpointPosition[];
  /** Vereinfachte Streckengeometrie als [lon, lat]-Paare. */
  geometry: [number, number][];
  /** Kumulierte Distanz in Metern je Geometrie-Stützpunkt, gleiche Länge wie geometry. */
  cumulativeM: number[];
  /**
   * Nur bei automatisch erzeugten Sternfahrt-Varianten gesetzt (siehe
   * preprocess/sternfahrt.ts): verweist auf die reguläre Strecke, aus der diese Variante
   * abgeleitet wurde. Dient der UI, um Varianten aus Streckenauswahl/Kartenlinien/
   * Segmentauslastung herauszufiltern, sie aber für die Routenzuordnung nutzbar zu halten.
   */
  baseRouteId?: string;
}

export interface SnapResult {
  checkpointId: string;
  distanceM: number;
  deviationM: number;
}

export interface ValidationEntry {
  routeId: string;
  checkpointId: string;
  distanceM: number;
  deviationM: number;
  warning: boolean;
}

export interface ValidationReport {
  generatedAt: string;
  entries: ValidationEntry[];
  orderIssues: string[];
}

export interface RosterEntry {
  startNumber: string;
  category: Category;
  /** Vorab zugeordnete Strecke, falls im Sheet gepflegt. Optional — Fallback ist die Ableitung aus den Scans. */
  routeId?: string;
}

export interface ScanRecord {
  startNumber: string;
  checkpointId: string;
  /** ISO 8601, immer in UTC (mit "Z"-Suffix). */
  timestampUtc: string;
}
