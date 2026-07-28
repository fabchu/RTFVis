import { describe, expect, it } from "vitest";
import { buildCumulativeDistances } from "../src/preprocess/geo.js";
import { snapCheckpointsMonotonic } from "../src/preprocess/snap.js";
import type { CheckpointDef, LonLat } from "../src/types.js";

function cp(id: string, lat: number, lon: number): CheckpointDef {
  return { id, name: id, lat, lon };
}

describe("snapCheckpointsMonotonic", () => {
  it("ordnet Checkpoints auf einer geraden Strecke ihrer erwarteten Distanz zu", () => {
    const geometry: LonLat[] = [
      { lat: 49.8, lon: 8.6 },
      { lat: 49.8, lon: 8.65 },
      { lat: 49.8, lon: 8.7 },
    ];
    const cumulativeM = buildCumulativeDistances(geometry);
    const checkpoints = [cp("A", 49.8, 8.6), cp("B", 49.8, 8.65), cp("C", 49.8, 8.7)];

    const result = snapCheckpointsMonotonic(geometry, cumulativeM, checkpoints);

    expect(result[0].distanceM).toBeCloseTo(0, 0);
    expect(result[1].distanceM).toBeCloseTo(cumulativeM[1], 0);
    expect(result[2].distanceM).toBeCloseTo(cumulativeM[2], 0);
    for (const r of result) expect(r.deviationM).toBeLessThan(1);
  });

  it("wählt bei einer selbstüberlappenden Strecke den korrekten (späteren) Abschnitt statt des global nächstgelegenen", () => {
    // Strecke: Ostwärts, Wende, dann parallel (110m nördlich versetzt) zurück nach Westen.
    // Ein zweiter Checkpoint nahe der Wendeschleife liegt (durch GPS-Ungenauigkeit)
    // geometrisch näher am HINgeweg als am Rückweg — ein globaler Nearest-Neighbour
    // würde ihn fälschlich auf den Hinweg snappen.
    const geometry: LonLat[] = [
      { lat: 49.8, lon: 8.6 }, // 0: Start
      { lat: 49.8, lon: 8.65 }, // 1: Hinweg
      { lat: 49.8, lon: 8.7 }, // 2: Wendepunkt
      { lat: 49.801, lon: 8.65 }, // 3: Rückweg (110m nördlich versetzt)
      { lat: 49.801, lon: 8.62 }, // 4: Rückweg, nahe zweitem Checkpoint
      { lat: 49.801, lon: 8.6 }, // 5: Rückweg Ende
    ];
    const cumulativeM = buildCumulativeDistances(geometry);

    const checkpointA = cp("A", 49.8, 8.62); // liegt exakt auf dem Hinweg (Segment 0-1)
    // liegt nahe lon 8.62, aber mit Versatz Richtung Hinweg (49.8 statt 49.801) —
    // näher am Hinweg (~22m) als am eigentlich gemeinten Rückweg (~89m).
    const checkpointB = cp("B", 49.8002, 8.62);

    const result = snapCheckpointsMonotonic(geometry, cumulativeM, [checkpointA, checkpointB]);

    // Monotonie: B muss weiter auf der Strecke liegen als A, auch wenn ein Punkt
    // auf dem Hinweg geometrisch näher wäre.
    expect(result[1].distanceM).toBeGreaterThan(result[0].distanceM);
    // B wurde auf den (weiter entfernten) Rückweg gesnappt, nicht auf den nahen Hinweg.
    expect(result[1].deviationM).toBeGreaterThan(80);
    expect(result[1].deviationM).toBeLessThan(100);
  });

  it("wirft, wenn ein Checkpoint nicht projiziert werden kann (Geometrie zu kurz)", () => {
    const geometry: LonLat[] = [{ lat: 49.8, lon: 8.6 }];
    expect(() => snapCheckpointsMonotonic(geometry, [0], [cp("A", 49.8, 8.6)])).toThrow();
  });

  it("snappt den ersten Checkpoint NICHT ans andere Ende eines Rundkurses, wenn der echte Anfang >50m abweicht", () => {
    // Track beginnt ~72m vom START-Checkpoint entfernt (z.B. weil die GPX-Aufzeichnung
    // erst kurz nach der Startlinie einsetzt), läuft weit weg und kommt am Streckenende
    // (viele km später) sehr nah (~7m) am selben Ort wieder vorbei — genau das reale
    // Rundkurs-Muster aus ctf-63. Ohne Suchlimit für den allerersten Checkpoint würde
    // "START" fälschlich ans (näher liegende) Streckenende snappen.
    const geometry: LonLat[] = [
      { lat: 49.8, lon: 8.601 }, // 0: Track-Anfang, ~72m vom Checkpoint entfernt
      { lat: 49.8, lon: 8.7 }, // 1
      { lat: 49.8, lon: 8.9 }, // 2: hier bereits >10km kumulierte Distanz erreicht
      { lat: 49.8, lon: 8.7 }, // 3: zurück
      { lat: 49.8, lon: 8.6001 }, // 4: Streckenende, nur ~7m vom Checkpoint entfernt
    ];
    const cumulativeM = buildCumulativeDistances(geometry);
    const start = cp("START", 49.8, 8.6);

    const result = snapCheckpointsMonotonic(geometry, cumulativeM, [start]);

    expect(result[0].distanceM).toBeLessThan(10_000);
    expect(result[0].deviationM).toBeGreaterThan(50); // die einzig erreichbare Stelle ist nicht perfekt...
    expect(result[0].deviationM).toBeLessThan(100); // ...aber klar die Stelle am Streckenanfang, nicht die 7m-Stelle am Ende
  });

  it("snappt eine wiederholte Checkpoint-ID nicht auf das direkt folgende (noch nahe) Segment, sondern auf die echte spätere Durchquerung", () => {
    // "X" kommt zweimal in Folge in der Checkpoint-Liste vor (wie C1/C2 bei ctf-79/63).
    // Direkt nach der ersten exakten Durchquerung liegt noch ein Punkt, der geometrisch
    // fast am selben Fleck ist (~7m) — das darf nicht als "zweite Durchquerung"
    // durchgehen. Die echte zweite Durchquerung liegt viele km weiter hinten.
    const geometry: LonLat[] = [
      { lat: 49.8, lon: 8.6 }, // 0: Start
      { lat: 49.8, lon: 8.62 }, // 1: X, 1. Durchquerung (exakt)
      { lat: 49.8, lon: 8.6201 }, // 2: nur ~7m weiter, geometrisch fast am selben Fleck
      { lat: 49.8, lon: 8.8 }, // 3: weit weg
      { lat: 49.8, lon: 9.0 }, // 4: noch weiter weg
      { lat: 49.8, lon: 8.62 }, // 5: X, 2. Durchquerung (exakt, viele km später)
      { lat: 49.8, lon: 8.6 }, // 6: Ziel
    ];
    const cumulativeM = buildCumulativeDistances(geometry);
    const checkpoints = [
      cp("START", 49.8, 8.6),
      cp("X", 49.8, 8.62),
      cp("X", 49.8, 8.62),
      cp("FINISH", 49.8, 8.6),
    ];

    const result = snapCheckpointsMonotonic(geometry, cumulativeM, checkpoints);
    const [, firstX, secondX] = result;

    expect(secondX.distanceM).toBeGreaterThan(firstX.distanceM + 500);
    expect(secondX.deviationM).toBeLessThan(1); // hat die exakte zweite Durchquerung gefunden, nicht den nahen Folgepunkt
  });
});
