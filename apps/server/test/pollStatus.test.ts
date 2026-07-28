import { describe, expect, it } from "vitest";
import { PollStatusTracker } from "../src/pollStatus.js";

describe("PollStatusTracker", () => {
  it("startet mit leerem Zustand", () => {
    const tracker = new PollStatusTracker();
    expect(tracker.snapshot()).toEqual({
      lastSuccessAtMs: null,
      lastErrorAtMs: null,
      lastErrorMessage: null,
      consecutiveFailures: 0,
    });
  });

  it("setzt consecutiveFailures nach einem Erfolg zurück", () => {
    const tracker = new PollStatusTracker();
    tracker.recordError("Netzwerkfehler", 3);
    tracker.recordSuccess();
    const snap = tracker.snapshot();
    expect(snap.consecutiveFailures).toBe(0);
    expect(snap.lastSuccessAtMs).not.toBeNull();
  });

  it("merkt sich die letzte Fehlermeldung und den Fehlerzähler", () => {
    const tracker = new PollStatusTracker();
    tracker.recordError("erster Fehler", 1);
    tracker.recordError("zweiter Fehler", 2);
    const snap = tracker.snapshot();
    expect(snap.lastErrorMessage).toBe("zweiter Fehler");
    expect(snap.consecutiveFailures).toBe(2);
  });

  it("gibt bei jedem Aufruf eine unabhängige Kopie zurück", () => {
    const tracker = new PollStatusTracker();
    const a = tracker.snapshot();
    tracker.recordSuccess();
    const b = tracker.snapshot();
    expect(a.lastSuccessAtMs).toBeNull();
    expect(b.lastSuccessAtMs).not.toBeNull();
  });
});
