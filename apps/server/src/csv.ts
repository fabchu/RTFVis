/** Minimaler CSV-Parser mit Unterstützung für Anführungszeichen-Felder (inkl. "" als Escape). */
export function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < content.length) {
    const char = content[i];

    if (inQuotes) {
      if (char === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += char;
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (char === ",") {
      pushField();
      i++;
      continue;
    }
    if (char === "\r") {
      i++;
      continue;
    }
    if (char === "\n") {
      pushRow();
      i++;
      continue;
    }
    field += char;
    i++;
  }

  if (field.length > 0 || row.length > 0) pushRow();

  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

/** Parst CSV-Inhalt mit Kopfzeile zu einer Liste von Records, geschlüsselt nach (getrimmtem) Spaltennamen. */
export function parseCsvRecords(content: string): Record<string, string>[] {
  const rows = parseCsv(content);
  if (rows.length === 0) return [];
  const [header, ...rest] = rows;
  const trimmedHeader = header.map((h) => h.trim());
  return rest.map((row) => {
    const record: Record<string, string> = {};
    trimmedHeader.forEach((key, idx) => {
      record[key] = (row[idx] ?? "").trim();
    });
    return record;
  });
}
