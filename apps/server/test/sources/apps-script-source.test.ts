import { describe, expect, it, vi } from "vitest";
import { AppsScriptSource } from "../../src/sources/apps-script-source.js";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    json: async () => body,
  } as unknown as Response;
}

describe("AppsScriptSource", () => {
  it("hängt resource und token als Query-Parameter an und liefert data zurück", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ ok: true, data: [{ startNumber: "101", category: "RTF" }] }),
    );
    const source = new AppsScriptSource({ baseUrl: "https://example.com/exec", token: "secret", fetchImpl });

    const roster = await source.fetchRoster();

    expect(roster).toEqual([{ startNumber: "101", category: "RTF" }]);
    const calledUrl = new URL(fetchImpl.mock.calls[0][0] as string);
    expect(calledUrl.searchParams.get("resource")).toBe("roster");
    expect(calledUrl.searchParams.get("token")).toBe("secret");
  });

  it("hängt since nur an, wenn gesetzt", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true, data: [] }));
    const source = new AppsScriptSource({ baseUrl: "https://example.com/exec", token: "secret", fetchImpl });

    await source.fetchScansSince(null);
    expect(new URL(fetchImpl.mock.calls[0][0] as string).searchParams.has("since")).toBe(false);

    await source.fetchScansSince("2026-07-25T09:00:00.000Z");
    expect(new URL(fetchImpl.mock.calls[1][0] as string).searchParams.get("since")).toBe(
      "2026-07-25T09:00:00.000Z",
    );
  });

  it("wirft bei HTTP-Fehler", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false, 500));
    const source = new AppsScriptSource({ baseUrl: "https://example.com/exec", token: "secret", fetchImpl });
    await expect(source.fetchRoster()).rejects.toThrow(/500/);
  });

  it("wirft bei ok:false im Response-Body (z.B. falsches Token)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: false, error: "unauthorized" }));
    const source = new AppsScriptSource({ baseUrl: "https://example.com/exec", token: "wrong", fetchImpl });
    await expect(source.fetchRoster()).rejects.toThrow(/unauthorized/);
  });
});
