import { describe, expect, it } from "vitest";
import { matchScansToRouteCheckpoints } from "../src/scan-matching.js";
import type { ScanRecord } from "../src/types.js";
import { rtfLoop, rtfShort } from "./fixtures/routes.js";

function scan(checkpointId: string, isoTime: string): ScanRecord {
  return { startNumber: "1", checkpointId, timestampUtc: isoTime };
}

describe("matchScansToRouteCheckpoints", () => {
  it("ordnet Scans ohne Wiederholungen ihrer jeweiligen Position zu", () => {
    const scans = [scan("START", "t0"), scan("CP1", "t1"), scan("CP2", "t2")];
    expect(matchScansToRouteCheckpoints(scans, rtfShort)).toEqual([0, 1, 2]);
  });

  it("ordnet die erste Sichtung eines mehrfach besuchten Checkpoints dem ERSTEN Vorkommen zu", () => {
    const scans = [scan("START", "t0"), scan("K1", "t1"), scan("K3", "t2")];
    // rtf-loop: START=0, K1=1, K3=2(1. Vorkommen), K4=3, K3=4(2. Vorkommen), FINISH=5
    expect(matchScansToRouteCheckpoints(scans, rtfLoop)).toEqual([0, 1, 2]);
  });

  it("ordnet die zweite Sichtung demselben Checkpoints dem ZWEITEN Vorkommen zu, nicht wieder dem ersten", () => {
    const scans = [
      scan("START", "t0"),
      scan("K1", "t1"),
      scan("K3", "t2"), // 1. Vorkommen -> Index 2
      scan("K4", "t3"), // Index 3
      scan("K3", "t4"), // 2. Vorkommen -> Index 4, NICHT wieder 2
    ];
    expect(matchScansToRouteCheckpoints(scans, rtfLoop)).toEqual([0, 1, 2, 3, 4]);
  });

  it("lässt einen ausgelassenen Scan zwischen den beiden Vorkommen zu (Teilfolge-Toleranz)", () => {
    // K4 fehlt (z.B. Scanner-Ausfall) -> die zweite K3-Sichtung muss trotzdem korrekt
    // dem zweiten (nicht dem ersten) Vorkommen zugeordnet werden.
    const scans = [scan("K3", "t0"), scan("K3", "t1")];
    expect(matchScansToRouteCheckpoints(scans, rtfLoop)).toEqual([2, 4]);
  });

  it("gibt null für einen einzelnen fremden Scan zurück, ohne den Zeiger für spätere passende Scans zu verbrauchen", () => {
    // "UNBEKANNT" gehört zu keiner Strecke (z.B. Checkpoint einer anderen Strecke) —
    // muss übersprungen werden, ohne dass CP1 danach fälschlich unmatched bleibt.
    const scans = [scan("START", "t0"), scan("UNBEKANNT", "t1"), scan("CP1", "t2")];
    expect(matchScansToRouteCheckpoints(scans, rtfShort)).toEqual([0, null, 1]);
  });
});
