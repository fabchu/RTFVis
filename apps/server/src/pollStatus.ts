export interface PollStatusSnapshot {
  lastSuccessAtMs: number | null;
  lastErrorAtMs: number | null;
  lastErrorMessage: string | null;
  consecutiveFailures: number;
}

/** Kleiner In-Memory-Zustand, den der Poller (siehe poller.ts) bei jedem Versuch aktualisiert. */
export class PollStatusTracker {
  private lastSuccessAtMs: number | null = null;
  private lastErrorAtMs: number | null = null;
  private lastErrorMessage: string | null = null;
  private consecutiveFailures = 0;

  recordSuccess(): void {
    this.lastSuccessAtMs = Date.now();
    this.consecutiveFailures = 0;
  }

  recordError(message: string, consecutiveFailures: number): void {
    this.lastErrorAtMs = Date.now();
    this.lastErrorMessage = message;
    this.consecutiveFailures = consecutiveFailures;
  }

  snapshot(): PollStatusSnapshot {
    return {
      lastSuccessAtMs: this.lastSuccessAtMs,
      lastErrorAtMs: this.lastErrorAtMs,
      lastErrorMessage: this.lastErrorMessage,
      consecutiveFailures: this.consecutiveFailures,
    };
  }
}
