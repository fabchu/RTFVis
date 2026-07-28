import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRoutes } from "./build-routes.js";
import { generateSternfahrtVariants } from "./sternfahrt.js";
import { buildValidationReport, formatValidationReport } from "./validate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../../../data");

console.log(`Verarbeite Streckendaten aus ${DATA_DIR} ...`);
const routes = buildRoutes(DATA_DIR);

const sternfahrtVariants = generateSternfahrtVariants(routes);
const allRoutes = [...routes, ...sternfahrtVariants];

mkdirSync(DATA_DIR, { recursive: true });

const outPath = path.join(DATA_DIR, "routes.json");
writeFileSync(outPath, JSON.stringify(allRoutes, null, 2), "utf-8");
console.log(
  `${routes.length} Strecke(n) geschrieben nach ${outPath}` +
    (sternfahrtVariants.length > 0 ? ` (plus ${sternfahrtVariants.length} Sternfahrt-Variante(n))` : ""),
);

// Validierung bewusst nur gegen die regulären Strecken — die Sternfahrt-Varianten sind
// eine reine Ableitung derselben Geometrie/Checkpoints und würden dieselben Befunde nur
// doppelt melden.
const report = buildValidationReport(routes);
writeFileSync(path.join(DATA_DIR, "validation-report.json"), JSON.stringify(report, null, 2), "utf-8");

console.log("");
console.log(formatValidationReport(report));

if (report.orderIssues.length > 0) {
  process.exitCode = 1;
}
