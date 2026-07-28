import type { RiderPosition } from "@rtfvis/core";

interface OrgaPanelProps {
  positions: RiderPosition[];
  onOpen: () => void;
}

/** Immer sichtbare, kompakte Zusammenfassung — zeigt IMMER das gesamte Feld, unabhängig von
 *  den Sidebar-Filtern (Sicherheitsrelevanz). Öffnet auf Klick die vollständige
 *  Sicherheitsübersicht. */
export function OrgaPanel({ positions, onOpen }: OrgaPanelProps) {
  const overdueCount = positions.filter((p) => p.status === "overdue").length;
  const unknownCount = positions.filter((p) => p.status === "routeConflict" || p.status === "ambiguousRoute").length;

  return (
    <button
      className={overdueCount > 0 || unknownCount > 0 ? "orga-panel-button alert" : "orga-panel-button"}
      onClick={onOpen}
    >
      <span className="orga-panel-title">Sicherheitsübersicht</span>
      <span className="orga-panel-stats">
        {overdueCount > 0 && <span>{overdueCount} überfällig</span>}
        {unknownCount > 0 && <span>{unknownCount} unklar</span>}
        {overdueCount === 0 && unknownCount === 0 && <span>Alles im grünen Bereich</span>}
      </span>
    </button>
  );
}
