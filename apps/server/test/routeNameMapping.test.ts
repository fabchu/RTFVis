import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mapSheetRouteId } from "../src/routeNameMapping.js";

describe("mapSheetRouteId", () => {
  it("mappt bekannte Sheet-Bezeichnungen auf unsere interne Routen-ID", () => {
    expect(mapSheetRouteId("RTF - 49 km")).toBe("rtf-49");
    expect(mapSheetRouteId("CTF - 42 km")).toBe("ctf-42");
    expect(mapSheetRouteId("RTF - 159 km")).toBe("rtf-159");
  });

  it("ist tolerant gegenüber Groß-/Kleinschreibung und Leerzeichen-Variationen", () => {
    expect(mapSheetRouteId("RTF - 49km")).toBe("rtf-49");
    expect(mapSheetRouteId("rtf-49 km")).toBe("rtf-49");
    expect(mapSheetRouteId("  RTF-49KM  ")).toBe("rtf-49");
  });

  it("mappt mehrere unterschiedliche Sheet-Werte auf dieselbe Routen-ID (CTF-Tippfehler)", () => {
    // "CTF - 75 km" ist ein Tippfehler im Sheet für "CTF - 79 km" (Korrektur angefragt,
    // bis dahin sollen beide Schreibweisen auf dieselbe echte Strecke ctf-79 zeigen).
    expect(mapSheetRouteId("CTF - 75 km")).toBe("ctf-79");
    expect(mapSheetRouteId("CTF - 79 km")).toBe("ctf-79");
  });

  it("mappt alle vier Jedermann-Distanzen auf die eine Jedermann-Route", () => {
    // Nur ein Checkpoint auf der Jedermann-Strecke -> die vier Distanzen sind für uns
    // ohnehin nicht unterscheidbar, deshalb bewusst alle auf jed-13.
    expect(mapSheetRouteId("Jedermann 5 km")).toBe("jed-13");
    expect(mapSheetRouteId("Jedermann 7,5 km")).toBe("jed-13");
    expect(mapSheetRouteId("Jedermann 15 km")).toBe("jed-13");
    expect(mapSheetRouteId("Jedermann 25 km")).toBe("jed-13");
  });

  it("gibt undefined zurück, wenn keine Sheet-Bezeichnung vorliegt", () => {
    expect(mapSheetRouteId(undefined)).toBeUndefined();
  });

  describe("bei unbekannten Sheet-Werten", () => {
    beforeEach(() => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("gibt undefined zurück, statt den unbekannten Rohwert durchzureichen", () => {
      expect(mapSheetRouteId("Neue Strecke 2027")).toBeUndefined();
    });

    it("loggt eine Warnung für unbekannte Werte", () => {
      mapSheetRouteId("Ganz neue Bezeichnung XYZ");
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("Ganz neue Bezeichnung XYZ"));
    });
  });
});
