import { useEffect, useRef, useState } from "react";
import { advanceReplayTimeMs, clampMs, type PlaybackMode, type TimeBounds } from "./clock.js";

/** ~1 Hz, wie im Plan vorgesehen: Fahrer sollen sich sichtbar bewegen statt bei jedem Datenrefresh zu springen. */
const LIVE_TICK_MS = 1000;
/** Feinere Auflösung für flüssiges Abspielen/Scrubben im Replay. */
const REPLAY_TICK_MS = 100;

export interface ClockState {
  mode: PlaybackMode;
  /** Der für computePositions wirksame Zeitpunkt — je nach Modus liveNowMs oder replayTimeMs. */
  nowMs: number;
  isPlaying: boolean;
  speedMultiplier: number;
  replayMinMs: number;
  replayMaxMs: number;
  setMode: (mode: PlaybackMode) => void;
  setReplayTimeMs: (ms: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setSpeedMultiplier: (speed: number) => void;
}

export function useClock(bounds: TimeBounds): ClockState {
  const [mode, setModeState] = useState<PlaybackMode>("live");
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState(60);
  const [liveNowMs, setLiveNowMs] = useState(() => Date.now());
  const [replayTimeMs, setReplayTimeMsState] = useState(bounds.minMs);
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;

  // bounds ist beim allerersten Render meist noch das Fallback-"jetzt" (Scans sind noch
  // nicht geladen, minMs===maxMs). replayTimeMs bliebe sonst für immer auf diesem
  // veralteten Wert stehen, sobald echte (frühere) Bounds nachladen — und läge dann
  // bereits hinter dem echten Ende, wodurch Replay sofort wieder automatisch pausiert.
  // Deshalb einmalig neu initialisieren, sobald ein echter (nicht-entarteter) Zeitbereich
  // vorliegt; danach nicht mehr eingreifen, um aktives Scrubbing nicht zu überschreiben.
  const hasInitializedReplayRef = useRef(false);
  useEffect(() => {
    if (!hasInitializedReplayRef.current && bounds.maxMs > bounds.minMs) {
      hasInitializedReplayRef.current = true;
      setReplayTimeMsState(bounds.minMs);
    }
  }, [bounds.minMs, bounds.maxMs]);

  useEffect(() => {
    if (mode !== "live") return;
    const id = setInterval(() => setLiveNowMs(Date.now()), LIVE_TICK_MS);
    return () => clearInterval(id);
  }, [mode]);

  useEffect(() => {
    if (mode !== "replay" || !isPlaying) return;
    const id = setInterval(() => {
      setReplayTimeMsState((prev) => advanceReplayTimeMs(prev, REPLAY_TICK_MS, speedMultiplier, boundsRef.current));
    }, REPLAY_TICK_MS);
    return () => clearInterval(id);
  }, [mode, isPlaying, speedMultiplier]);

  // Am Ende des Replay-Bereichs automatisch anhalten.
  useEffect(() => {
    if (mode === "replay" && isPlaying && replayTimeMs >= bounds.maxMs) {
      setIsPlaying(false);
    }
  }, [mode, isPlaying, replayTimeMs, bounds.maxMs]);

  return {
    mode,
    nowMs: mode === "live" ? liveNowMs : replayTimeMs,
    isPlaying,
    speedMultiplier,
    replayMinMs: bounds.minMs,
    replayMaxMs: bounds.maxMs,
    setMode: (m) => {
      setModeState(m);
      setIsPlaying(false);
    },
    setReplayTimeMs: (ms) => setReplayTimeMsState(clampMs(ms, boundsRef.current)),
    setIsPlaying,
    setSpeedMultiplier,
  };
}
