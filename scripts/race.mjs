#!/usr/bin/env node
/**
 * Renntag-Anlaufhilfe: startet Backend und Frontend und öffnet die Karte im Browser,
 * sobald der Dev-Server bereit ist. Ctrl+C beendet beide Prozesse sauber.
 */
import { spawn } from "node:child_process";
import net from "node:net";

const WEB_PORT = 5173;
const WEB_URL = `http://localhost:${WEB_PORT}`;

function run(label, args) {
  // shell:true wird gebraucht, damit "pnpm" unter Windows (pnpm.cmd/.ps1) gefunden wird.
  // Mit shell:true übernimmt die Shell das Parsen, deshalb hier bewusst ein einzelner,
  // vollständig fest codierter Befehlsstring statt eines Args-Arrays (siehe Node DEP0190) —
  // unproblematisch, da keine der Komponenten aus nicht vertrauenswürdiger Eingabe stammt.
  const child = spawn(`pnpm ${args.join(" ")}`, { stdio: "inherit", shell: true });
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[race] ${label} wurde mit Code ${code} beendet.`);
    }
  });
  return child;
}

function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      // "localhost" statt "127.0.0.1": Vite bindet standardmäßig an ::1 (IPv6), ein
      // fest auf IPv4 gerichteter Check würde dort nie eine Verbindung finden.
      const socket = net.createConnection(port, "localhost");
      socket.once("connect", () => {
        socket.end();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() > deadline) {
          reject(new Error(`Zeitüberschreitung beim Warten auf Port ${port}.`));
        } else {
          setTimeout(tryConnect, 300);
        }
      });
    };
    tryConnect();
  });
}

function openBrowser(url) {
  // url ist immer die fest codierte WEB_URL-Konstante oben, nie externe Eingabe.
  if (process.platform === "win32") {
    spawn(`cmd /c start "" "${url}"`, { shell: true, stdio: "ignore" });
  } else if (process.platform === "darwin") {
    spawn(`open "${url}"`, { shell: true, stdio: "ignore" });
  } else {
    spawn(`xdg-open "${url}"`, { shell: true, stdio: "ignore" });
  }
}

console.log("[race] Starte Backend (apps/server) ...");
const server = run("Backend", ["--filter", "@rtfvis/server", "start"]);

console.log("[race] Starte Frontend (apps/web) ...");
const web = run("Frontend", ["--filter", "@rtfvis/web", "dev"]);

waitForPort(WEB_PORT, 20_000)
  .then(() => {
    console.log(`[race] Öffne ${WEB_URL} im Browser ...`);
    openBrowser(WEB_URL);
  })
  .catch((err) => {
    console.error(`[race] Konnte das Frontend nicht automatisch öffnen: ${err.message}`);
    console.error(`[race] Bitte manuell öffnen: ${WEB_URL}`);
  });

function shutdown() {
  console.log("\n[race] Beende Backend und Frontend ...");
  server.kill();
  web.kill();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
