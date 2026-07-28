import type { LonLat } from "../types.js";

const EARTH_RADIUS_M = 6371000;

export function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Großkreisdistanz zwischen zwei Punkten in Metern. */
export function haversineM(a: LonLat, b: LonLat): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * Lokale equirektanguläre Projektion nach Metern, zentriert auf `origin`.
 * Für Distanzen innerhalb eines einzelnen Rennens (wenige hundert km) ausreichend
 * genau; nicht für globale Anwendung gedacht.
 */
export function toLocalMeters(p: LonLat, origin: LonLat): Vec2 {
  const latRad = toRad(origin.lat);
  const x = toRad(p.lon - origin.lon) * EARTH_RADIUS_M * Math.cos(latRad);
  const y = toRad(p.lat - origin.lat) * EARTH_RADIUS_M;
  return { x, y };
}

export function fromLocalMeters(p: Vec2, origin: LonLat): LonLat {
  const latRad = toRad(origin.lat);
  const lon = origin.lon + (p.x / (EARTH_RADIUS_M * Math.cos(latRad))) * (180 / Math.PI);
  const lat = origin.lat + (p.y / EARTH_RADIUS_M) * (180 / Math.PI);
  return { lon, lat };
}

/** Nächstgelegener Punkt auf dem Segment [a,b] (lokale Meter) zu p. */
export function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): { point: Vec2; t: number } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  let t = lenSq === 0 ? 0 : ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return { point: { x: a.x + t * abx, y: a.y + t * aby }, t };
}

/** Senkrechter Abstand von p zur Gerade durch a und b (lokale Meter). Für Douglas-Peucker. */
export function perpendicularDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len = Math.hypot(abx, aby);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs((p.x - a.x) * aby - (p.y - a.y) * abx) / len;
}

export function buildCumulativeDistances(points: LonLat[]): number[] {
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + haversineM(points[i - 1], points[i]));
  }
  return cum;
}
