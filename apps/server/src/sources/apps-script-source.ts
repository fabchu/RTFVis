import type { RosterEntry, ScanRecord } from "../types.js";
import type { ScanSource } from "./types.js";

export interface AppsScriptSourceOptions {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
}

interface AppsScriptEnvelope {
  ok: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Holt Roster und Scans vom deployten Apps-Script-Web-App-Endpunkt (siehe apps-script/Code.gs).
 * Erwartet, dass Zeitstempel dort bereits nach UTC-ISO konvertiert wurden — dieser Adapter
 * macht keine eigene Zeitzonen-Interpretation (anders als CsvFileSource).
 */
export class AppsScriptSource implements ScanSource {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AppsScriptSourceOptions) {
    this.baseUrl = options.baseUrl;
    this.token = options.token;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async fetchRoster(): Promise<RosterEntry[]> {
    return (await this.request("roster", {})) as RosterEntry[];
  }

  async fetchScansSince(sinceUtc: string | null): Promise<ScanRecord[]> {
    const params: Record<string, string> = sinceUtc ? { since: sinceUtc } : {};
    return (await this.request("scans", params)) as ScanRecord[];
  }

  private async request(resource: string, extraParams: Record<string, string>): Promise<unknown> {
    const url = new URL(this.baseUrl);
    url.searchParams.set("resource", resource);
    url.searchParams.set("token", this.token);
    for (const [key, value] of Object.entries(extraParams)) {
      url.searchParams.set(key, value);
    }

    const response = await this.fetchImpl(url.toString());
    if (!response.ok) {
      throw new Error(
        `Apps Script antwortete mit ${response.status} ${response.statusText} für Resource "${resource}".`,
      );
    }

    const body = (await response.json()) as AppsScriptEnvelope;
    if (!body.ok) {
      throw new Error(`Apps Script meldete einen Fehler für Resource "${resource}": ${body.error ?? "unbekannt"}`);
    }
    return body.data;
  }
}
