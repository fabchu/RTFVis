import { describe, expect, it } from "vitest";
import { computeConnectionHealth, type ConnectionStatus } from "../src/connectionStatus.js";

function status(overrides: Partial<ConnectionStatus>): ConnectionStatus {
  return {
    dataSource: "apps-script",
    pollIntervalMs: 30_000,
    scanCount: 10,
    riderCount: 5,
    lastSuccessAtMs: 1_000_000,
    lastErrorAtMs: null,
    lastErrorMessage: null,
    consecutiveFailures: 0,
    ...overrides,
  };
}

describe("computeConnectionHealth", () => {
  it("ist ok bei aktuellem Erfolg ohne Fehler", () => {
    expect(computeConnectionHealth(status({ lastSuccessAtMs: 1_000_000 }), 1_010_000)).toBe("ok");
  });

  it("ist error, sobald consecutiveFailures > 0 ist — auch mit kürzlichem Erfolg", () => {
    expect(computeConnectionHealth(status({ consecutiveFailures: 1 }), 1_010_000)).toBe("error");
  });

  it("ist stale, wenn noch nie ein erfolgreicher Poll stattfand", () => {
    expect(computeConnectionHealth(status({ lastSuccessAtMs: null }), 1_010_000)).toBe("stale");
  });

  it("ist stale, sobald mehr als das 3-fache Poll-Intervall ohne Erfolg vergangen ist", () => {
    const s = status({ lastSuccessAtMs: 0, pollIntervalMs: 30_000 });
    expect(computeConnectionHealth(s, 89_999)).toBe("ok");
    expect(computeConnectionHealth(s, 90_001)).toBe("stale");
  });
});
