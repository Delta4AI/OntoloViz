import { describe, expect, it } from "vitest";

import {
  breadcrumbTrail,
  layoutSunburst,
  type LayoutNode,
} from "@/lib/ontology/layout";
import type { Node, Subtree } from "@/lib/ontology/types";

function mkNode(id: string, parent: string, level: number, count: number): Node {
  return {
    id,
    parent,
    label: id,
    description: "",
    comment: "",
    count,
    color: "",
    level,
    meshId: "",
    synthetic: false,
  };
}

/**
 *           A (root, count 0)
 *          / \
 *        A.B(10)  A.C(5)
 *       /    \
 *    A.B.1(7) A.B.2(3)
 */
function makeSubtree(): Subtree {
  const nodes = new Map<string, Node>();
  nodes.set("A", mkNode("A", "", 0, 0));
  nodes.set("A.B", mkNode("A.B", "A", 1, 10));
  nodes.set("A.B.1", mkNode("A.B.1", "A.B", 2, 7));
  nodes.set("A.B.2", mkNode("A.B.2", "A.B", 2, 3));
  nodes.set("A.C", mkNode("A.C", "A", 1, 5));
  return { rootId: "A", nodes };
}

describe("layoutSunburst", () => {
  it("returns one entry per node, with the root first", () => {
    const layout = layoutSunburst(makeSubtree());
    expect(layout).toHaveLength(5);
    expect(layout[0]!.id).toBe("A");
    expect(layout[0]!.depth).toBe(0);
  });

  it("covers a full circle at the root", () => {
    const layout = layoutSunburst(makeSubtree());
    const root = layout[0]!;
    expect(root.x0).toBe(0);
    expect(root.x1).toBeCloseTo(2 * Math.PI, 10);
    expect(root.y0).toBe(0);
  });

  it("partitions the angular domain across siblings without gaps", () => {
    const layout = layoutSunburst(makeSubtree());
    const depthOne = layout.filter((n) => n.depth === 1);
    expect(depthOne).toHaveLength(2);
    // Children are emitted in id order: A.B then A.C.
    const total = depthOne.reduce((acc, n) => acc + (n.x1 - n.x0), 0);
    expect(total).toBeCloseTo(2 * Math.PI, 10);
    // Each child slice is contiguous with the next.
    expect(depthOne[0]!.x1).toBeCloseTo(depthOne[1]!.x0, 10);
  });

  it("sizes slices by leaf-count sum", () => {
    const layout = layoutSunburst(makeSubtree());
    const ab = layout.find((n) => n.id === "A.B")!;
    const ac = layout.find((n) => n.id === "A.C")!;
    // A.B sums 7 + 3 = 10, A.C is itself a leaf with count 5.
    const abShare = (ab.x1 - ab.x0) / (2 * Math.PI);
    const acShare = (ac.x1 - ac.x0) / (2 * Math.PI);
    expect(abShare).toBeCloseTo(10 / 15, 6);
    expect(acShare).toBeCloseTo(5 / 15, 6);
  });

  it("isolates the focused subtree when focusId is set", () => {
    const layout = layoutSunburst(makeSubtree(), { focusId: "A.B" });
    expect(layout.map((n) => n.id).sort()).toEqual(["A.B", "A.B.1", "A.B.2"]);
    expect(layout[0]!.id).toBe("A.B");
    expect(layout[0]!.x0).toBe(0);
    expect(layout[0]!.x1).toBeCloseTo(2 * Math.PI, 10);
  });

  it("returns an empty array for an unknown focus id", () => {
    expect(layoutSunburst(makeSubtree(), { focusId: "missing" })).toEqual([]);
  });

  it("gives zero-count leaves a visible (non-zero) slice", () => {
    const nodes = new Map<string, Node>();
    nodes.set("R", mkNode("R", "", 0, 0));
    nodes.set("R.x", mkNode("R.x", "R", 1, 0));
    nodes.set("R.y", mkNode("R.y", "R", 1, 0));
    const layout = layoutSunburst({ rootId: "R", nodes });
    const x = layout.find((n) => n.id === "R.x")!;
    const y = layout.find((n) => n.id === "R.y")!;
    expect(x.x1 - x.x0).toBeGreaterThan(0);
    expect(y.x1 - y.x0).toBeGreaterThan(0);
    expect(x.x1 - x.x0).toBeCloseTo(y.x1 - y.x0, 10);
  });

  it("caps result depth when maxDepth is provided", () => {
    const layout = layoutSunburst(makeSubtree(), { maxDepth: 1 });
    // Depth 0 (A) + depth 1 (A.B, A.C) only — A.B.1 / A.B.2 are dropped.
    expect(layout.map((n) => n.id).sort()).toEqual(["A", "A.B", "A.C"]);
    for (const n of layout) {
      expect(n.depth).toBeLessThanOrEqual(1);
    }
  });

  it("returns only the focus node when maxDepth is 0", () => {
    const layout = layoutSunburst(makeSubtree(), { maxDepth: 0 });
    expect(layout).toHaveLength(1);
    expect(layout[0]!.id).toBe("A");
  });

  it("composes maxDepth with focusId", () => {
    const layout = layoutSunburst(makeSubtree(), { focusId: "A.B", maxDepth: 0 });
    expect(layout).toHaveLength(1);
    expect(layout[0]!.id).toBe("A.B");
    expect(layout[0]!.depth).toBe(0);
  });

  it("does not mutate the input subtree", () => {
    const subtree = makeSubtree();
    const before = JSON.stringify([...subtree.nodes.entries()]);
    layoutSunburst(subtree, { focusId: "A.B" });
    const after = JSON.stringify([...subtree.nodes.entries()]);
    expect(after).toBe(before);
  });
});

/**
 * `makeSubtree` is three rings deep (depths 0, 1, 2), so d3 lays out three
 * uniform radial bands of 1/3 each. These tests pin the `ringWeights` remap
 * against that baseline.
 */
describe("layoutSunburst ringWeights", () => {
  const byId = (layout: readonly LayoutNode[], id: string) =>
    layout.find((n) => n.id === id)!;

  it("leaves radii at uniform thirds when omitted or empty", () => {
    for (const opts of [{}, { ringWeights: [] }]) {
      const layout = layoutSunburst(makeSubtree(), opts);
      expect(byId(layout, "A").y1).toBeCloseTo(1 / 3, 10);
      const ab = byId(layout, "A.B");
      expect(ab.y0).toBeCloseTo(1 / 3, 10);
      expect(ab.y1).toBeCloseTo(2 / 3, 10);
      expect(byId(layout, "A.B.1").y1).toBeCloseTo(1, 10);
    }
  });

  it("resizes bands proportionally to per-depth weights", () => {
    // Weights [1, 1, 2] sum to 4 → boundaries 0, 0.25, 0.5, 1.0.
    const layout = layoutSunburst(makeSubtree(), { ringWeights: [1, 1, 2] });
    expect(byId(layout, "A").y1).toBeCloseTo(0.25, 10);
    const ab = byId(layout, "A.B");
    expect(ab.y0).toBeCloseTo(0.25, 10);
    expect(ab.y1).toBeCloseTo(0.5, 10);
    const leaf = byId(layout, "A.B.1");
    expect(leaf.y0).toBeCloseTo(0.5, 10);
    expect(leaf.y1).toBeCloseTo(1, 10);
    // The outer ring is now twice as thick as either inner ring.
    expect(leaf.y1 - leaf.y0).toBeCloseTo(2 * (ab.y1 - ab.y0), 10);
  });

  it("defaults unspecified depths to weight 1 (short array)", () => {
    // [2] → depth 0 weight 2, depths 1 & 2 default to 1 → sum 4.
    const layout = layoutSunburst(makeSubtree(), { ringWeights: [2] });
    expect(byId(layout, "A").y1).toBeCloseTo(0.5, 10);
    expect(byId(layout, "A.B").y1).toBeCloseTo(0.75, 10);
    expect(byId(layout, "A.B.1").y1).toBeCloseTo(1, 10);
  });

  it("collapses a ring to zero thickness at weight 0", () => {
    // [1, 0, 1] → sum 2 → boundaries 0, 0.5, 0.5, 1.0.
    const layout = layoutSunburst(makeSubtree(), { ringWeights: [1, 0, 1] });
    const ab = byId(layout, "A.B");
    expect(ab.y0).toBeCloseTo(0.5, 10);
    expect(ab.y1).toBeCloseTo(0.5, 10);
  });

  it("falls back to uniform when all weights are zero", () => {
    const layout = layoutSunburst(makeSubtree(), { ringWeights: [0, 0, 0] });
    expect(byId(layout, "A").y1).toBeCloseTo(1 / 3, 10);
    expect(byId(layout, "A.B.1").y0).toBeCloseTo(2 / 3, 10);
  });

  it("ignores negative or non-finite weights (treats them as 1)", () => {
    const layout = layoutSunburst(makeSubtree(), {
      ringWeights: [-5, Number.NaN, 1],
    });
    // All three coerce to 1 → uniform thirds.
    expect(byId(layout, "A").y1).toBeCloseTo(1 / 3, 10);
    expect(byId(layout, "A.B").y1).toBeCloseTo(2 / 3, 10);
  });

  it("does not touch the angular (count) encoding", () => {
    const base = layoutSunburst(makeSubtree());
    const weighted = layoutSunburst(makeSubtree(), { ringWeights: [3, 0.5, 2] });
    for (const b of base) {
      const w = weighted.find((n) => n.id === b.id)!;
      expect(w.x0).toBeCloseTo(b.x0, 10);
      expect(w.x1).toBeCloseTo(b.x1, 10);
    }
  });
});

describe("breadcrumbTrail", () => {
  it("walks root → focus inclusive", () => {
    const subtree = makeSubtree();
    const trail = breadcrumbTrail(subtree, "A.B.1");
    expect(trail.map((n) => n.id)).toEqual(["A", "A.B", "A.B.1"]);
  });

  it("returns [root] when focus is the root", () => {
    const subtree = makeSubtree();
    expect(breadcrumbTrail(subtree, "A").map((n) => n.id)).toEqual(["A"]);
  });

  it("returns empty when focus id is missing", () => {
    expect(breadcrumbTrail(makeSubtree(), "missing")).toEqual([]);
  });
});
