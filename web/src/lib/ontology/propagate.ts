/**
 * Count propagation over an ontology.
 *
 * Mirrors the count-propagation logic from src/ontoloviz/core.py:
 *
 *   propagation.enabled = false         → no-op, returns input
 *   propagation.mode    = "off"         → no-op
 *   propagation.mode    = "level"       → child contributes to parent only when
 *                                          the *parent* sits at level >= threshold
 *                                          (mirrors MeSHSunburst.plot)
 *   propagation.mode    = "all"         → child contributes to parent unconditionally,
 *                                          up to the subtree root
 *
 * Implementation notes:
 * - Traversal is strict bottom-up (sorted by node level descending). The Python
 *   reference relies on dict-insertion order, which is order-dependent in subtle
 *   ways; a deterministic sort gives identical results when the input is
 *   well-formed and removes a class of file-ordering bugs.
 * - The function is pure: it deep-clones nodes and returns a new Ontology.
 * - Settings names follow the Python conventions (`atc_propagate_*`, etc.) but
 *   in JS-friendly shape.
 */

import type { Node, Ontology, Subtree } from "./types";

export type CountPropagationMode = "off" | "level" | "all";

export interface PropagationSettings {
  /** Master switch — when false this function is a no-op clone. */
  readonly enabled: boolean;
  /** How to propagate counts up the tree. */
  readonly countMode: CountPropagationMode;
  /**
   * Threshold for `level` mode. A child node's count is added to its parent
   * only when the *parent's* level >= this threshold. Levels are 0-based
   * (0 = subtree root), matching the Node.level field in this codebase.
   */
  readonly level: number;
}

export function propagateCounts(
  ontology: Ontology,
  settings: PropagationSettings,
): Ontology {
  const newSubtrees = new Map<string, Subtree>();
  for (const [rootId, subtree] of ontology.subtrees) {
    newSubtrees.set(rootId, propagateSubtree(subtree, settings));
  }
  return {
    ...ontology,
    subtrees: newSubtrees,
  };
}

function propagateSubtree(subtree: Subtree, settings: PropagationSettings): Subtree {
  // Deep-clone every node so the input is never mutated.
  const nodes = new Map<string, Node>();
  for (const [id, node] of subtree.nodes) {
    nodes.set(id, { ...node });
  }

  if (!settings.enabled || settings.countMode === "off") {
    return { rootId: subtree.rootId, nodes };
  }

  // Bottom-up: children first, so each parent's accumulated count is correct
  // by the time it's read for its own grandparent.
  const sortedIds = [...nodes.keys()].sort(
    (a, b) => nodes.get(b)!.level - nodes.get(a)!.level,
  );

  for (const id of sortedIds) {
    const node = nodes.get(id)!;
    if (!node.parent) continue;
    const parent = nodes.get(node.parent);
    if (!parent) continue;

    if (settings.countMode === "all") {
      nodes.set(parent.id, { ...parent, count: parent.count + node.count });
    } else if (settings.countMode === "level") {
      if (parent.level >= settings.level) {
        nodes.set(parent.id, { ...parent, count: parent.count + node.count });
      }
    }
  }

  return { rootId: subtree.rootId, nodes };
}

/** Convenience: total counts across all subtrees, for sanity-checks / UI. */
export function totalCounts(ontology: Ontology): number {
  let total = 0;
  for (const subtree of ontology.subtrees.values()) {
    for (const node of subtree.nodes.values()) total += node.count;
  }
  return total;
}
