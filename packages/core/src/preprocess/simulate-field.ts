/**
 * Erzeugt ein synthetisches Testfeld (Roster + Scans als CSV) für Last-/Sichttests gegen
 * echte Streckendaten — nutzt data/routes.json (Ausgabe von `pnpm build:routes`), simuliert
 * für jeden Fahrer eine individuelle Startzeit und ein individuelles Tempo, und schreibt nur
 * die Scans, die bis "jetzt" bereits passiert wären (Live-Schnappschuss eines laufenden
 * Rennens, mit realistischem Mix aus "noch nicht gestartet" / "unterwegs" / "im Ziel").
 *
 * Aufruf: `pnpm simulate:field` (aus dem Repo-Root) oder `pnpm --filter @rtfvis/core simulate:field`.
 * Ausgabe: data/simulation/roster.csv, data/simulation/scans.csv.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Category, Route } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../../../data");
const OUTPUT_DIR = path.join(DATA_DIR, "simulation");

const AVERAGE_SPEED_MPS = (20 * 1000) / 3600; // 20 km/h
const SPEED_VARIATION_MPS = 1.5; // Streuung ums Durchschnittstempo (~±5.4 km/h typische Abweichung)
const MIN_SPEED_MPS = (8 * 1000) / 3600; // Sicherheitsuntergrenze, verhindert Division durch ~0

/** Hauptfokus RTF, dann CTF, dann Jedermann — innerhalb der Kategorie sind die mittleren Distanzen am beliebtesten. */
const ROUTE_RIDER_COUNTS: Record<string, number> = {
  "rtf-159": 20,
  "rtf-115": 40,
  "rtf-75": 55,
  "rtf-49": 35,
  "ctf-79": 15,
  "ctf-63": 40,
  "ctf-42": 45,
  "jed-13": 50,
};

const START_NUMBER_BASE: Record<Category, number> = { RTF: 100, CTF: 400, Jedermann: 700 };

// Rolling Start über mehrere Stunden vor "jetzt", ein paar Startzeiten auch leicht in der
// Zukunft — damit beim Betrachten ein realistischer Mix aus "noch nicht gestartet",
// "unterwegs" und "im Ziel" über alle Streckenlängen hinweg entsteht.
const START_WINDOW_EARLIEST_MS = -4 * 60 * 60 * 1000;
const START_WINDOW_LATEST_MS = 20 * 60 * 1000;

const GROUP_PROBABILITY = 0.35;
const GROUP_SIZE_MIN = 2;
const GROUP_SIZE_MAX = 5;
const GROUP_START_JITTER_MS = 20_000;
const GROUP_SPEED_JITTER_MPS = 0.3;

interface SimulatedRider {
  startNumber: string;
  category: Category;
  routeId: string;
  startTimeMs: number;
  speedMps: number;
}

interface SimulatedScan {
  startNumber: string;
  checkpointId: string;
  timestampMs: number;
}

/** Kleiner seedbarer PRNG (mulberry32), damit ein Simulationslauf reproduzierbar ist. */
function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260726);

function randRange(min: number, max: number): number {
  return min + rand() * (max - min);
}

/** Summe dreier Uniform-Zufallszahlen nähert sich einer Glockenkurve an — reicht für plausible Tempo-Streuung. */
function randNormalish(mean: number, spread: number): number {
  const sum = rand() + rand() + rand() - 1.5;
  return mean + sum * spread;
}

function loadRoutes(): Route[] {
  const raw = readFileSync(path.join(DATA_DIR, "routes.json"), "utf-8");
  return JSON.parse(raw);
}

function generateRiders(routesById: Map<string, Route>, nowMs: number): SimulatedRider[] {
  const riders: SimulatedRider[] = [];
  const startNumberCounters: Record<Category, number> = { ...START_NUMBER_BASE };

  for (const [routeId, count] of Object.entries(ROUTE_RIDER_COUNTS)) {
    const route = routesById.get(routeId);
    if (!route) {
      throw new Error(`Route "${routeId}" nicht in routes.json gefunden — vorher "pnpm build:routes" ausführen?`);
    }

    let remaining = count;
    while (remaining > 0) {
      const isGroup = rand() < GROUP_PROBABILITY && remaining > 1;
      const groupSize = isGroup ? Math.min(remaining, Math.round(randRange(GROUP_SIZE_MIN, GROUP_SIZE_MAX))) : 1;

      const leaderStartTimeMs = nowMs + randRange(START_WINDOW_EARLIEST_MS, START_WINDOW_LATEST_MS);
      const leaderSpeedMps = Math.max(MIN_SPEED_MPS, randNormalish(AVERAGE_SPEED_MPS, SPEED_VARIATION_MPS));

      for (let i = 0; i < groupSize; i++) {
        const startNumber = String(startNumberCounters[route.category]++);
        const startTimeMs =
          groupSize === 1 ? leaderStartTimeMs : leaderStartTimeMs + randRange(-GROUP_START_JITTER_MS, GROUP_START_JITTER_MS);
        const speedMps =
          groupSize === 1
            ? leaderSpeedMps
            : Math.max(MIN_SPEED_MPS, leaderSpeedMps + randRange(-GROUP_SPEED_JITTER_MPS, GROUP_SPEED_JITTER_MPS));
        riders.push({ startNumber, category: route.category, routeId, startTimeMs, speedMps });
      }
      remaining -= groupSize;
    }
  }

  return riders;
}

function simulateScans(riders: SimulatedRider[], routesById: Map<string, Route>, nowMs: number): SimulatedScan[] {
  const scans: SimulatedScan[] = [];
  for (const rider of riders) {
    const route = routesById.get(rider.routeId)!;
    for (const cp of route.checkpoints) {
      const passMs = rider.startTimeMs + (cp.distanceM / rider.speedMps) * 1000;
      if (passMs <= nowMs) {
        scans.push({ startNumber: rider.startNumber, checkpointId: cp.id, timestampMs: passMs });
      }
    }
  }
  return scans;
}

/** Formatiert einen Zeitpunkt als "dd.MM.yyyy HH:mm:ss" in Europe/Berlin — das vom CSV-Fallback erwartete Format. */
function formatBerlinTimestamp(ms: number): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.day}.${parts.month}.${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function toCsvValue(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function writeCsv(filePath: string, header: string[], rows: string[][]): void {
  const lines = [header, ...rows].map((row) => row.map(toCsvValue).join(","));
  writeFileSync(filePath, lines.join("\r\n"), "utf-8");
}

function main() {
  const routes = loadRoutes();
  const routesById = new Map(routes.map((r) => [r.id, r]));
  const nowMs = Date.now();

  const riders = generateRiders(routesById, nowMs);
  const scans = simulateScans(riders, routesById, nowMs);

  mkdirSync(OUTPUT_DIR, { recursive: true });

  writeCsv(
    path.join(OUTPUT_DIR, "roster.csv"),
    ["Startnummer", "Kategorie", "Strecke"],
    riders.map((r) => [r.startNumber, r.category, r.routeId]),
  );

  const sortedScans = scans.slice().sort((a, b) => a.timestampMs - b.timestampMs);
  writeCsv(
    path.join(OUTPUT_DIR, "scans.csv"),
    ["Startnummer", "Checkpoint", "Zeitstempel"],
    sortedScans.map((s) => [s.startNumber, s.checkpointId, formatBerlinTimestamp(s.timestampMs)]),
  );

  let notStarted = 0;
  let onCourse = 0;
  let finished = 0;
  for (const rider of riders) {
    const route = routesById.get(rider.routeId)!;
    const lastCp = route.checkpoints[route.checkpoints.length - 1];
    const finishMs = rider.startTimeMs + (lastCp.distanceM / rider.speedMps) * 1000;
    if (rider.startTimeMs > nowMs) notStarted++;
    else if (finishMs <= nowMs) finished++;
    else onCourse++;
  }

  console.log(`${riders.length} Fahrer simuliert, ${scans.length} Scans generiert (Stand: ${new Date(nowMs).toISOString()}).`);
  console.log(`  Noch nicht gestartet: ${notStarted}`);
  console.log(`  Unterwegs:            ${onCourse}`);
  console.log(`  Vermutlich im Ziel:   ${finished}`);
  console.log(`Geschrieben nach ${OUTPUT_DIR}`);
}

main();
