import { describe, expect, it } from "vitest";
import { formatDurationMs } from "../src/format.js";

describe("formatDurationMs", () => {
  it("formatiert unter einer Stunde als 'X Min'", () => {
    expect(formatDurationMs(12 * 60_000)).toBe("12 Min");
  });

  it("formatiert ab einer Stunde als 'X Std Y Min'", () => {
    expect(formatDurationMs(65 * 60_000)).toBe("1 Std 5 Min");
  });

  it("rundet auf ganze Minuten", () => {
    expect(formatDurationMs(90_000)).toBe("2 Min"); // 1.5 Min -> rundet auf 2
  });

  it("behandelt negative Werte als 0", () => {
    expect(formatDurationMs(-5000)).toBe("0 Min");
  });
});
