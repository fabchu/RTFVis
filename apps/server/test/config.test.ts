import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const BASE_ENV = { DATA_SOURCE: "csv", ROSTER_CSV_PATH: "./roster.csv", SCANS_CSV_PATH: "./scans.csv" };

describe("loadConfig", () => {
  it("verwendet 127.0.0.1 als Host-Default (nur lokal erreichbar)", () => {
    const config = loadConfig(BASE_ENV);
    expect(config.host).toBe("127.0.0.1");
  });

  it("übernimmt HOST aus dem Environment (z.B. 0.0.0.0 fürs Hosting)", () => {
    const config = loadConfig({ ...BASE_ENV, HOST: "0.0.0.0" });
    expect(config.host).toBe("0.0.0.0");
  });

  it("lässt basicAuth unset, wenn keine der beiden Variablen gesetzt ist", () => {
    const config = loadConfig(BASE_ENV);
    expect(config.basicAuth).toBeUndefined();
  });

  it("setzt basicAuth, wenn beide Variablen gesetzt sind", () => {
    const config = loadConfig({ ...BASE_ENV, BASIC_AUTH_USER: "orga", BASIC_AUTH_PASS: "geheim" });
    expect(config.basicAuth).toEqual({ user: "orga", pass: "geheim" });
  });

  it("wirft, wenn nur eine der beiden BASIC_AUTH-Variablen gesetzt ist (stiller Fehlerzustand vermeiden)", () => {
    expect(() => loadConfig({ ...BASE_ENV, BASIC_AUTH_USER: "orga" })).toThrow();
    expect(() => loadConfig({ ...BASE_ENV, BASIC_AUTH_PASS: "geheim" })).toThrow();
  });

  it("verwendet 3001 als Port-Default", () => {
    expect(loadConfig(BASE_ENV).httpPort).toBe(3001);
  });

  it("fällt auf PORT zurück (Konvention von Hosting-Plattformen wie Render)", () => {
    expect(loadConfig({ ...BASE_ENV, PORT: "10000" }).httpPort).toBe(10000);
  });

  it("bevorzugt HTTP_PORT vor PORT, falls beide gesetzt sind", () => {
    expect(loadConfig({ ...BASE_ENV, HTTP_PORT: "4000", PORT: "10000" }).httpPort).toBe(4000);
  });
});
