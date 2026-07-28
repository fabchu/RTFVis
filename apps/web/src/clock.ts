import type { ScanRecord } from "@rtfvis/core";

export type PlaybackMode = "live" | "replay";

export interface TimeBounds {
  minMs: number;
  maxMs: number;
}

/** Spannt den Replay-Zeitbereich vom ersten bis zum letzten bekannten Scan auf. */
export function computeReplayBounds(scans: ScanRecord[], fallbackNowMs: number): TimeBounds {
  if (scans.length === 0) return { minMs: fallbackNowMs, maxMs: fallbackNowMs };
  let minMs = Infinity;
  let maxMs = -Infinity;
  for (const scan of scans) {
    const t = Date.parse(scan.timestampUtc);
    if (t < minMs) minMs = t;
    if (t > maxMs) maxMs = t;
  }
  return { minMs, maxMs };
}

export function clampMs(ms: number, bounds: TimeBounds): number {
  return Math.min(Math.max(ms, bounds.minMs), bounds.maxMs);
}

/** Rückt die Replay-Zeit um die reale vergangene Zeit * Geschwindigkeitsfaktor vor, gekappt am Ende. */
export function advanceReplayTimeMs(
  currentMs: number,
  elapsedRealMs: number,
  speedMultiplier: number,
  bounds: TimeBounds,
): number {
  return clampMs(currentMs + elapsedRealMs * speedMultiplier, bounds);
}
