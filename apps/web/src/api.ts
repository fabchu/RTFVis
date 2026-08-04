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

export function fetchIgnoredRiders(): Promise<string[]> {
  return getJson("/api/ignored-riders");
}

export async function ignoreRider(startNumber: string): Promise<void> {
  const res = await fetch("/api/ignored-riders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ startNumber }),
  });
  if (!res.ok) {
    throw new Error(`Ignorieren von Fahrer ${startNumber} fehlgeschlagen: ${res.status} ${res.statusText}`);
  }
}

export async function unignoreRider(startNumber: string): Promise<void> {
  const res = await fetch(`/api/ignored-riders/${encodeURIComponent(startNumber)}`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(`Zurückholen von Fahrer ${startNumber} fehlgeschlagen: ${res.status} ${res.statusText}`);
  }
}

export async function pausePolling(): Promise<void> {
  const res = await fetch("/api/poller/pause", { method: "POST" });
  if (!res.ok) {
    throw new Error(`Pausieren des Sheet-Pollings fehlgeschlagen: ${res.status} ${res.statusText}`);
  }
}

export async function resumePolling(): Promise<void> {
  const res = await fetch("/api/poller/resume", { method: "POST" });
  if (!res.ok) {
    throw new Error(`Fortsetzen des Sheet-Pollings fehlgeschlagen: ${res.status} ${res.statusText}`);
  }
}
