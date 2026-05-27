/**
 * Sunburst layout for a single Subtree.
 *
 * Builds a `d3-hierarchy` from the flat node map, sums leaf counts, and runs
 * `d3.partition()` to produce angles (`x0`, `x1` in radians) and radii
 * (`y0`, `y1` in [0, 1]). The caller scales radii to pixels.
 *
 * The Plotly sunburst the legacy app produces sizes each slice by the node's
 * count; here we mirror that with `hierarchy.sum((d) => d.count)`. Nodes whose
 * subtree sums to zero get a sentinel value of 1 so the slice is still
 * visible — same behavior Plotly applies via `branchvalues="total"` + a
 * non-zero floor.
 *
 * Click-to-zoom: when `focusId` is provided, the focus node becomes the angular
 * domain [0, 2π] and its radial domain starts at the root of the visualization
 * (y0 = 0). Ancestors are dropped from the layout — the breadcrumb component
 * surfaces them above the canvas.
 *
 * The function is pure: input nodes are never mutated; the returned array is a
 * fresh allocation.
 */

import { hierarchy, partition, type HierarchyRectangularNode } from "d3-hierarchy";

import type { Node, Subtree } from "./types";

export interface LayoutNode {
  /** Original node id (canonical form, same as `Node.id`). */
  readonly id: string;
  /** Parent id in the laid-out tree, or empty string for the layout root. */
  readonly parent: string;
  /** Depth from the layout root (the focused node). 0 = layout root. */
  readonly depth: number;
  /** Inner angle in radians, [0, 2π]. */
  readonly x0: number;
  /** Outer angle in radians, [0, 2π]. */
  readonly x1: number;
  /** Inner radius in [0, 1]. */
  readonly y0: number;
  /** Outer radius in [0, 1]. */
  readonly y1: number;
  /** The source node, for color / label / count lookups during rendering. */
  readonly node: Node;
}

export interface LayoutOptions {
  /**
   * Optional focus node id. When set, the layout is computed from this node
   * as the new root (its descendants only). When unset, the subtree's root
   * is used.
   */
  readonly focusId?: string;
  /**
   * Optional inclusive cap on layout depth, measured from the layout root
   * (depth 0). Slices deeper than the cap are dropped from the result.
   * Used by the overview grid to render simplified previews.
   */
  readonly maxDepth?: number;
  /**
   * Optional per-depth radial thickness weights, indexed by layout depth
   * (0 = the center ring). A weight of `1` is the uniform baseline; `2` makes
   * that ring twice as thick as a baseline ring, `0.5` half. Missing or
   * non-finite entries default to `1`, so a short or sparse array only affects
   * the depths it names. When omitted or empty, rings stay uniform — identical
   * to d3's default partition. Purely visual: angular (count) encoding is
   * untouched, so quantitative meaning is preserved.
   */
  readonly ringWeights?: readonly number[];
}

/**
 * Cumulative radial boundaries in [0, 1] for `bands` rings given per-depth
 * `weights`. Returns `bands + 1` ascending values: ring `d` spans
 * `[out[d], out[d + 1]]`. Falls back to uniform bands when weights sum to ≤ 0.
 */
function ringBoundaries(bands: number, weights: readonly number[]): number[] {
  const out = [0];
  let total = 0;
  const resolved: number[] = [];
  for (let i = 0; i < bands; i++) {
    const w = weights[i];
    const v = Number.isFinite(w) && (w as number) >= 0 ? (w as number) : 1;
    resolved.push(v);
    total += v;
  }
  if (total <= 0) {
    for (let i = 1; i <= bands; i++) out.push(i / bands);
    return out;
  }
  let acc = 0;
  for (let i = 0; i < bands; i++) {
    acc += resolved[i];
    out.push(acc / total);
  }
  return out;
}

/**
 * Compute a radial partition layout for the given subtree.
 *
 * Returns layout nodes in pre-order (root first, then children left to right).
 * Empty array if the focus node is not in the subtree.
 */
export function layoutSunburst(
  subtree: Subtree,
  options: LayoutOptions = {},
): readonly LayoutNode[] {
  const focusId = options.focusId ?? subtree.rootId;
  const focusNode = subtree.nodes.get(focusId);
  if (!focusNode) return [];

  // Build a parent → children index over the subtree. Only descendants of the
  // focus node participate in the layout.
  const childrenByParent = new Map<string, Node[]>();
  for (const node of subtree.nodes.values()) {
    const existing = childrenByParent.get(node.parent);
    if (existing) {
      existing.push(node);
    } else {
      childrenByParent.set(node.parent, [node]);
    }
  }
  // Stable child order — sort by id for determinism (matches what test
  // fixtures and snapshots expect).
  for (const arr of childrenByParent.values()) {
    arr.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  interface TreeShell {
    readonly node: Node;
    readonly children: TreeShell[];
  }
  const buildShell = (node: Node): TreeShell => {
    const kids = childrenByParent.get(node.id) ?? [];
    return { node, children: kids.map(buildShell) };
  };
  const rootShell = buildShell(focusNode);

  const root = hierarchy<TreeShell>(rootShell, (d) => d.children).sum((d) => {
    // Sum only over leaves; internal nodes derive their value from descendants.
    // A leaf with count 0 gets a sentinel of 1 so it remains visible.
    const isLeaf = d.children.length === 0;
    if (!isLeaf) return 0;
    return d.node.count > 0 ? d.node.count : 1;
  });

  const layout = partition<TreeShell>().size([2 * Math.PI, 1])(root);

  // Remap radii by per-depth weight only when asked. d3 lays out `root.height + 1`
  // uniform bands; we keep that geometry untouched (byte-identical output) unless
  // the caller supplies weights, then we resize bands by the cumulative weight.
  const weights = options.ringWeights;
  const boundaries =
    weights && weights.length > 0 ? ringBoundaries(root.height + 1, weights) : null;

  const maxDepth = options.maxDepth;
  const out: LayoutNode[] = [];
  layout.each((d: HierarchyRectangularNode<TreeShell>) => {
    if (maxDepth !== undefined && d.depth > maxDepth) return;
    out.push({
      id: d.data.node.id,
      parent: d.parent?.data.node.id ?? "",
      depth: d.depth,
      x0: d.x0,
      x1: d.x1,
      y0: boundaries ? boundaries[d.depth] : d.y0,
      y1: boundaries ? boundaries[d.depth + 1] : d.y1,
      node: d.data.node,
    });
  });
  return out;
}

/**
 * Compute the breadcrumb trail from the subtree root to `focusId`, inclusive.
 * Returns an empty array if `focusId` is not in the subtree.
 */
export function breadcrumbTrail(subtree: Subtree, focusId: string): readonly Node[] {
  const trail: Node[] = [];
  let cursor: Node | undefined = subtree.nodes.get(focusId);
  while (cursor) {
    trail.unshift(cursor);
    if (cursor.parent === "" || cursor.id === subtree.rootId) break;
    cursor = subtree.nodes.get(cursor.parent);
  }
  return trail;
}
