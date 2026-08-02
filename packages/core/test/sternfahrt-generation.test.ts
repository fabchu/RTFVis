import { describe, expect, it } from "vitest";
import { generateSternfahrtVariants } from "../src/preprocess/sternfahrt.js";
import type { Route } from "../src/types.js";

function loopRoute(id: string, category: Route["category"]): Route {
  return {
    id,
    category,
    name: id,
    totalDistanceM: 40_000,
    checkpoints: [
      { id: "START", distanceM: 0, deviationM: 0 },
      { id: "K1", distanceM: 10_000, deviationM: 0 },
      { id: "K2", distanceM: 20_000, deviationM: 0 },
      { id: "K3", distanceM: 30_000, deviationM: 0 },
      { id: "FINISH", distanceM: 40_000, deviationM: 0 },
    ],
    // Start und Ende der Geometrie an derselben Stelle -> echter Rundkurs.
    geometry: [
      [8.6, 49.8],
      [8.7, 49.9],
      [8.6, 49.8],
    ],
    cumulativeM: [0, 20_000, 40_000],
  };
}

function nonLoopRoute(id: string, category: Route["category"]): Route {
  const route = loopRoute(id, category);
  // Endpunkt weit weg vom Start -> kein Rundkurs.
  route.geometry = [
    [8.6, 49.8],
    [9.6, 50.8],
  ];
  route.cumulativeM = [0, 40_000];
  return route;
}

describe("generateSternfahrtVariants", () => {
  it("erzeugt für eine RTF-Rundstrecke genau eine Variante", () => {
    const variants = generateSternfahrtVariants([loopRoute("rtf-90", "RTF")]);
    expect(variants).toHaveLength(1);
    expect(variants[0].id).toBe("rtf-90-sternfahrt");
    expect(variants[0].baseRouteId).toBe("rtf-90");
  });

  it("erzeugt Varianten für CTF, aber nicht für Jedermann", () => {
    const variants = generateSternfahrtVariants([
      loopRoute("ctf-70", "CTF"),
      loopRoute("jed-13", "Jedermann"),
    ]);
    expect(variants.map((v) => v.baseRouteId)).toEqual(["ctf-70"]);
  });

  it("überspringt Strecken, die kein Rundkurs sind (Start/Ende weit auseinander)", () => {
    const variants = generateSternfahrtVariants([nonLoopRoute("rtf-point-to-point", "RTF")]);
    expect(variants).toHaveLength(0);
  });

  it("hängt die VOLLSTÄNDIGE Checkpoint-Liste (inkl. FINISH) zweimal aneinander, mit fortlaufend steigender Distanz", () => {
    // Beim Durchfahren von Start/Ziel entsteht organisatorisch immer ein FINISH- UND ein
    // START-Scan (siehe apps-script/Code.gs) -- die Checkpoint-Liste der Variante muss
    // FINISH deshalb kennen, auch mitten in der Sequenz, nicht nur am echten Ende.
    const [variant] = generateSternfahrtVariants([loopRoute("rtf-90", "RTF")]);
    expect(variant.checkpoints.map((c) => c.id)).toEqual([
      "START",
      "K1",
      "K2",
      "K3",
      "FINISH",
      "START",
      "K1",
      "K2",
      "K3",
      "FINISH",
    ]);

    const distances = variant.checkpoints.map((c) => c.distanceM);
    for (let i = 1; i < distances.length; i++) {
      expect(distances[i]).toBeGreaterThanOrEqual(distances[i - 1]);
    }
    expect(distances).toEqual([0, 10_000, 20_000, 30_000, 40_000, 40_000, 50_000, 60_000, 70_000, 80_000]);
  });

  it("verdoppelt Geometrie und totalDistanceM konsistent", () => {
    const [variant] = generateSternfahrtVariants([loopRoute("rtf-90", "RTF")]);
    expect(variant.totalDistanceM).toBe(80_000);
    expect(variant.geometry).toHaveLength(6); // 3 Punkte der Basisstrecke, zweimal
    expect(variant.cumulativeM).toEqual([0, 20_000, 40_000, 40_000, 60_000, 80_000]);
  });
});
