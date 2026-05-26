import { useMemo } from "react";

import { SunburstTile } from "@/components/sunburst/SunburstTile";
import type { Ontology } from "@/lib/ontology/types";

interface OverviewGridProps {
  readonly ontology: Ontology;
  /**
   * Called when a tile is activated. Parent is responsible for setting the
   * active subtree and (typically) switching `viewMode` to `"detail"`.
   */
  readonly onPick: (rootId: string) => void;
}

/**
 * Small-multiples view of every subtree in the ontology. Responsive grid sized
 * so tiles stay legible on phones (single column) up through large displays.
 *
 * Pure presentational layer — all state lives in the store via the parent.
 */
export function OverviewGrid({ ontology, onPick }: OverviewGridProps) {
  // Stable iteration order so tile positions don't shuffle on store updates.
  const subtrees = useMemo(
    () =>
      [...ontology.subtrees.values()].sort((a, b) =>
        a.rootId < b.rootId ? -1 : a.rootId > b.rootId ? 1 : 0,
      ),
    [ontology],
  );

  if (subtrees.length === 0) return null;

  return (
    <div
      role="list"
      aria-label="Subtree overview"
      className="grid gap-4"
      style={{
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
      }}
    >
      {subtrees.map((subtree) => (
        <div role="listitem" key={subtree.rootId}>
          <SunburstTile subtree={subtree} onActivate={onPick} />
        </div>
      ))}
    </div>
  );
}
