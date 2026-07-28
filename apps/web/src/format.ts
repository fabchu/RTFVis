export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export function formatTimeWithSeconds(ms: number): string {
  return new Date(ms).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Formatiert eine Dauer in Millisekunden als "X Std Y Min" bzw. "Y Min". */
export function formatDurationMs(ms: number): string {
  const totalMinutes = Math.round(Math.max(0, ms) / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} Min`;
  return `${hours} Std ${minutes} Min`;
}
