import type { Route, ValidationEntry, ValidationReport } from "../types.js";
import { CHECKPOINT_DEVIATION_WARNING_M } from "./constants.js";

export function buildValidationReport(routes: Route[]): ValidationReport {
  const entries: ValidationEntry[] = [];
  const orderIssues: string[] = [];

  for (const route of routes) {
    let prevDistanceM = -Infinity;
    for (const cp of route.checkpoints) {
      const deviationM = cp.deviationM;
      entries.push({
        routeId: route.id,
        checkpointId: cp.id,
        distanceM: cp.distanceM,
        deviationM,
        warning: deviationM > CHECKPOINT_DEVIATION_WARNING_M,
      });

      if (cp.distanceM <= prevDistanceM) {
        orderIssues.push(
          `${route.id}: Checkpoint ${cp.id} liegt bei ${cp.distanceM.toFixed(0)}m, ` +
            `nicht weiter als der vorherige Checkpoint (${prevDistanceM.toFixed(0)}m). ` +
            `Prüfe die Reihenfolge in route-checkpoints.yaml oder die GPX-Geometrie.`,
        );
      }
      prevDistanceM = cp.distanceM;
    }
  }

  return { generatedAt: new Date().toISOString(), entries, orderIssues };
}

export function formatValidationReport(report: ValidationReport): string {
  const lines: string[] = [];
  lines.push(`Validierungsbericht (${report.generatedAt})`);
  lines.push("");

  const warnings = report.entries.filter((e) => e.warning);
  if (warnings.length === 0) {
    lines.push("Keine Checkpoint-Abweichungen über der Warnschwelle.");
  } else {
    lines.push(`${warnings.length} Checkpoint(s) mit Abweichung > 50m — bitte GPX/Koordinaten prüfen:`);
    for (const w of warnings) {
      lines.push(`  [WARNUNG] ${w.routeId} / ${w.checkpointId}: ${w.deviationM.toFixed(1)}m Abweichung`);
    }
  }

  lines.push("");
  if (report.orderIssues.length === 0) {
    lines.push("Keine Reihenfolge-Probleme gefunden.");
  } else {
    lines.push(`${report.orderIssues.length} Reihenfolge-Problem(e):`);
    for (const issue of report.orderIssues) {
      lines.push(`  [FEHLER] ${issue}`);
    }
  }

  return lines.join("\n");
}
