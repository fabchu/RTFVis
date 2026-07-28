import type { CheckpointDef, Route } from "@rtfvis/core";
import { groupNamedPairsByCategory, type CheckpointPairOccupancy } from "../segmentOccupancy.js";

interface SegmentOccupancyPanelProps {
  pairs: CheckpointPairOccupancy[];
  routesById: Map<string, Route>;
  checkpointsById: Map<string, CheckpointDef>;
}

/** Zeigt die Fahrerverteilung zwischen Checkpoints, nach Kategorie unterteilt. */
export function SegmentOccupancyPanel({ pairs, routesById, checkpointsById }: SegmentOccupancyPanelProps) {
  if (pairs.length === 0) return <p className="segment-occupancy-hint">Keine Streckendaten geladen.</p>;

  const groups = groupNamedPairsByCategory(pairs, routesById, checkpointsById);

  return (
    <div className="segment-occupancy">
      {groups.map((group) => (
        <div key={group.category} className="segment-occupancy-group">
          <h3 className="segment-occupancy-category-name">{group.category}</h3>
          <ul className="segment-occupancy-list">
            {group.segments.map((pair) => (
              <li key={`${pair.fromName}-${pair.toName}`} className="segment-occupancy-item">
                <span className="segment-occupancy-label">
                  {pair.fromName}
                  {" → "}
                  {pair.toName}
                </span>
                <span className="segment-occupancy-count">{pair.riderCount}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
