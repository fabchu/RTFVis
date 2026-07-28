import type { PlaybackMode } from "./clock.js";
import { formatTimeWithSeconds } from "./format.js";

const SPEED_OPTIONS = [1, 10, 60, 120, 300, 500];

interface TimelineControlProps {
  mode: PlaybackMode;
  onModeChange: (mode: PlaybackMode) => void;
  nowMs: number;
  replayMinMs: number;
  replayMaxMs: number;
  onReplayTimeChange: (ms: number) => void;
  isPlaying: boolean;
  onPlayingChange: (playing: boolean) => void;
  speedMultiplier: number;
  onSpeedChange: (speed: number) => void;
}

export function TimelineControl({
  mode,
  onModeChange,
  nowMs,
  replayMinMs,
  replayMaxMs,
  onReplayTimeChange,
  isPlaying,
  onPlayingChange,
  speedMultiplier,
  onSpeedChange,
}: TimelineControlProps) {
  const replayHasRange = replayMaxMs > replayMinMs;

  return (
    <div className="timeline-control">
      <div className="timeline-mode-toggle">
        <button className={mode === "live" ? "active" : ""} onClick={() => onModeChange("live")}>
          Live
        </button>
        <button className={mode === "replay" ? "active" : ""} onClick={() => onModeChange("replay")}>
          Replay
        </button>
      </div>

      {mode === "live" ? (
        <span className="timeline-clock">{formatTimeWithSeconds(nowMs)} Uhr</span>
      ) : (
        <div className="timeline-replay-controls">
          <button
            className="play-pause-button"
            onClick={() => onPlayingChange(!isPlaying)}
            disabled={!replayHasRange}
            aria-label={isPlaying ? "Pause" : "Abspielen"}
          >
            {isPlaying ? "⏸" : "▶"}
          </button>

          <span className="timeline-clock">{formatTimeWithSeconds(nowMs)}</span>

          <input
            type="range"
            className="timeline-slider"
            min={replayMinMs}
            max={replayMaxMs}
            step={1000}
            value={nowMs}
            disabled={!replayHasRange}
            onChange={(e) => onReplayTimeChange(Number(e.target.value))}
          />

          <select value={speedMultiplier} onChange={(e) => onSpeedChange(Number(e.target.value))}>
            {SPEED_OPTIONS.map((speed) => (
              <option key={speed} value={speed}>
                {speed}×
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
