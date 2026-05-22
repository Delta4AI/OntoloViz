import { describe, expect, it } from "vitest";

import { layoutSunburst } from "@/lib/ontology/layout";
import { hitTest } from "@/lib/ontology/render";
import type { Node, Subtree } from "@/lib/ontology/types";

function mkNode(id: string, parent: string, level: number, count: number): Node {
  return {
    id,
    parent,
    label: id,
    description: "",
    comment: "",
    count,
    color: "#FFFFFF",
    level,
    meshId: "",
    synthetic: false,
  };
}

function makeSubtree(): Subtree {
  const nodes = new Map<string, Node>();
  nodes.set("A", mkNode("A", "", 0, 0));
  nodes.set("A.B", mkNode("A.B", "A", 1, 10));
  nodes.set("A.B.1", mkNode("A.B.1", "A.B", 2, 7));
  nodes.set("A.B.2", mkNode("A.B.2", "A.B", 2, 3));
  nodes.set("A.C", mkNode("A.C", "A", 1, 5));
  return { rootId: "A", nodes };
}

describe("hitTest", () => {
  const W = 400;
  const H = 400;
  const opts = { width: W, height: H };
  const layout = layoutSunburst(makeSubtree());

  it("returns the root id at the dead center", () => {
    expect(hitTest(layout, opts, W / 2, H / 2)).toBe("A");
  });

  it("returns null outside the circle", () => {
    expect(hitTest(layout, opts, 0, 0)).toBeNull();
    expect(hitTest(layout, opts, W, H)).toBeNull();
  });

  it("identifies the top-of-circle slice as A.B's branch", () => {
    // 12 o'clock is angle 0 in our layout (angleOffset = -π/2 in renderer).
    // Children sorted by id put A.B first, so the very top slice in the
    // outermost ring should be a descendant of A.B.
    const px = W / 2;
    const py = 10; // just inside the outer ring
    const hit = hitTest(layout, opts, px, py);
    expect(hit === "A.B.1" || hit === "A.B.2").toBe(true);
  });

  it("returns null for invalid viewports", () => {
    expect(hitTest(layout, { width: 0, height: 0 }, 0, 0)).toBeNull();
  });
});
