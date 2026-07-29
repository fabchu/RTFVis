import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveCheckpointId } from "../src/checkpointIdMapping.js";

const VALID_IDS = ["START", "K1", "K2", "K3/5", "K4", "K6/9", "K7/8", "K10", "K11", "FINISH"];

describe("resolveCheckpointId", () => {
  it("löst ausgeschriebene Sheet-Bezeichnungen auf die kurze interne ID auf (echte Sheet-Beispiele)", () => {
    expect(resolveCheckpointId("K2 RTF Garbenteich", VALID_IDS)).toBe("K2");
    expect(resolveCheckpointId("K3/5 RTF Oberwetz", VALID_IDS)).toBe("K3/5");
    expect(resolveCheckpointId("K4 RTF Dornholzhausen", VALID_IDS)).toBe("K4");
    expect(resolveCheckpointId("K6/9 CTF Hausberg", VALID_IDS)).toBe("K6/9");
    expect(resolveCheckpointId("K11 Jedermann", VALID_IDS)).toBe("K11");
  });

  it("ist tolerant gegenüber Leerzeichen mitten in der ID (z.B. um den Schrägstrich)", () => {
    // Reales Sheet-Beispiel: "K 7/8 CTF Bodenrod" -- ein naiver Split am ersten Leerzeichen
    // würde nur "K" liefern, nicht "K7/8".
    expect(resolveCheckpointId("K 7/8 CTF Bodenrod", VALID_IDS)).toBe("K7/8");
  });

  it("bevorzugt bei Präfix-Kollisionen die längste passende ID (K10/K11 vs. K1)", () => {
    // Reales Sheet-Beispiel: "K 10 CTF Sportplatz Pohlgöns" -- normalisiert "k10..." beginnt
    // auch mit "k1", darf aber nicht fälschlich als K1 matchen.
    expect(resolveCheckpointId("K 10 CTF Sportplatz Pohlgöns", VALID_IDS)).toBe("K10");
    expect(resolveCheckpointId("K11 Jedermann", VALID_IDS)).toBe("K11");
  });

  it("löst weiterhin bereits kurze IDs unverändert auf (alte Bestandsdaten)", () => {
    expect(resolveCheckpointId("K1", VALID_IDS)).toBe("K1");
    expect(resolveCheckpointId("K2", VALID_IDS)).toBe("K2");
    expect(resolveCheckpointId("START", VALID_IDS)).toBe("START");
    expect(resolveCheckpointId("FINISH", VALID_IDS)).toBe("FINISH");
  });

  describe("bei unbekannten Werten", () => {
    beforeEach(() => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("gibt den Rohwert unverändert zurück, statt zu crashen (z.B. alte, nicht mehr verwendete K3-Bestandsdaten)", () => {
      // "K3" bare gibt es nach der Umbenennung zu "K3/5" nicht mehr als gültige ID -- alte
      // Testzeilen im Sheet mit bloßem "K3" sollen den Poll nicht crashen, sondern einfach
      // unaufgelöst durchgereicht werden (matcht dann später keinem Streckenabschnitt).
      expect(resolveCheckpointId("K3", VALID_IDS)).toBe("K3");
    });

    it("loggt eine Warnung für unbekannte Werte", () => {
      resolveCheckpointId("Ganz neuer Checkpoint XYZ", VALID_IDS);
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("Ganz neuer Checkpoint XYZ"));
    });
  });
});
