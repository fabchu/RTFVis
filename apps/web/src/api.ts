import type { CheckpointDef, RosterEntry, Route, ScanRecord } from "@rtfvis/core";
import type { ConnectionStatus } from "./connectionStatus.js";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Anfrage an ${url} fehlgeschlagen: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export function fetchRoster(): Promise<RosterEntry[]> {
  return getJson("/api/roster");
}

export function fetchScans(): Promise<ScanRecord[]> {
  return getJson("/api/scans");
}

export function fetchRoutes(): Promise<Route[]> {
  return getJson("/api/routes");
}

export function fetchCheckpoints(): Promise<CheckpointDef[]> {
  return getJson("/api/checkpoints");
}

export function fetchStatus(): Promise<ConnectionStatus> {
  return getJson("/api/status");
}
