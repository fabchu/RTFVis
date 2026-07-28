import type { Category, RiderStatus } from "@rtfvis/core";

export const STATUS_COLORS: Record<RiderStatus, string> = {
  notStarted: "#9ca3af",
  onCourse: "#16a34a",
  overdue: "#f59e0b",
  finished: "#2563eb",
  routeConflict: "#dc2626",
  ambiguousRoute: "#9333ea",
};

export const STATUS_LABELS: Record<RiderStatus, string> = {
  notStarted: "Nicht gestartet",
  onCourse: "Unterwegs",
  overdue: "Überfällig",
  finished: "Im Ziel",
  routeConflict: "Streckenkonflikt",
  ambiguousRoute: "Strecke unklar",
};

export const CATEGORY_COLORS: Record<Category, string> = {
  RTF: "#2563eb",
  CTF: "#00e0c6",
  Jedermann: "#9333ea",
};
