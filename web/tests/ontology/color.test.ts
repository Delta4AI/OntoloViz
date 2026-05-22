import { describe, expect, it } from "vitest";

import {
  buildColorScale,
  generateColorRange,
  hexToRgb,
  propagateColors,
  rgbToHex,
  type ColorPropagationSettings,
  type ColorStop,
} from "@/lib/ontology/color";
import type { Node, Ontology } from "@/lib/ontology/types";

const STOPS: readonly ColorStop[] = [
  [0, "#FFFFFF"],
  [0.2, "#403C53"],
  [1, "#C33D35"],
];
const DEFAULT_COLOR = "#FFFFFF";

/* -------------------------------------------------------------------------- */
/* RGB helpers                                                                 */
/* -------------------------------------------------------------------------- */

describe("hex/rgb conversion", () => {
  it("round-trips canonical hex values", () => {
    expect(rgbToHex(hexToRgb("#FFFFFF"))).toBe("#FFFFFF");
    expect(rgbToHex(hexToRgb("#000000"))).toBe("#000000");
    expect(rgbToHex(hexToRgb("#403C53"))).toBe("#403C53");
  });

  it("rejects malformed hex strings", () => {
    expect(() => hexToRgb("#FFF")).toThrow();
    expect(() => hexToRgb("not-a-color")).toThrow();
  });

  it("clamps negative channel values to zero (Python parity)", () => {
    expect(rgbToHex([-3, 0, 255])).toBe("#0000FF");
  });

  it("truncates float channels to match Python int()", () => {
    expect(rgbToHex([200.7, 100.9, 50.1])).toBe("#C86432");
  });
});

/* -------------------------------------------------------------------------- */
/* generateColorRange                                                          */
/* -------------------------------------------------------------------------- */

describe("generateColorRange", () => {
  it("returns the start color for n=1", () => {
    expect(generateColorRange("#FFFFFF", "#000000", 1)).toEqual(["#FFFFFF"]);
  });

  it("returns endpoints exactly for n=2", () => {
    expect(generateColorRange("#FFFFFF", "#000000", 2)).toEqual(["#FFFFFF", "#000000"]);
  });

  it("interpolates linearly in RGB", () => {
    const out = generateColorRange("#000000", "#646464", 5);
    // Step = 100/4 = 25 per channel.
    expect(out).toEqual(["#000000", "#191919", "#323232", "#4B4B4B", "#646464"]);
  });

  it("returns empty array for n<=0", () => {
    expect(generateColorRange("#FFFFFF", "#000000", 0)).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* buildColorScale                                                             */
/* -------------------------------------------------------------------------- */

describe("buildColorScale", () => {
  it("returns a single default color when max is 0", () => {
    const scale = buildColorScale(0, STOPS, DEFAULT_COLOR);
    expect(scale.factor).toBe(1);
    expect(scale.colors).toEqual([DEFAULT_COLOR]);
  });

  it("constructs `max+1` colors for small maxima", () => {
    const scale = buildColorScale(100, STOPS, DEFAULT_COLOR);
    expect(scale.factor).toBe(1);
    // 1 default + (20 - 0) from segment 1 + (100 - 20) from segment 2 = 101
    expect(scale.colors).toHaveLength(101);
    expect(scale.colors[0]).toBe(DEFAULT_COLOR);
    // Index 1 = start of first segment (#FFFFFF since n_colors[0] = start).
    expect(scale.colors[1]).toBe("#FFFFFF");
    // Index 20 = end of first segment, exactly #403C53.
    expect(scale.colors[20]).toBe("#403C53");
    // Last entry = end of last segment.
    expect(scale.colors[scale.colors.length - 1]).toBe("#C33D35");
  });

  it("applies factor 10 for maxima in [100_000, 250_000)", () => {
    const scale = buildColorScale(150_000, STOPS, DEFAULT_COLOR);
    expect(scale.factor).toBe(10);
  });

  it("applies factor 25 for maxima >= 250_000", () => {
    const scale = buildColorScale(500_000, STOPS, DEFAULT_COLOR);
    expect(scale.factor).toBe(25);
  });
});

/* -------------------------------------------------------------------------- */
/* propagateColors                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Test fixture: a single subtree with five nodes.
 *
 *           A (level 0, count 0)
 *          / \
 *        B(1,10)  C(1,5)
 *       /    \
 *    B.1(2,7) B.2(2,3)
 *
 * IDs use the dot separator so phenotype mode can exercise its ancestor logic.
 */
function makeOntology(): Ontology {
  const mk = (id: string, parent: string, level: number, count: number): Node => ({
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
  });
  const nodes = new Map<string, Node>();
  nodes.set("A", mk("A", "", 0, 0));
  nodes.set("A.B", mk("A.B", "A", 1, 10));
  nodes.set("A.B.1", mk("A.B.1", "A.B", 2, 7));
  nodes.set("A.B.2", mk("A.B.2", "A.B", 2, 3));
  nodes.set("A.C", mk("A.C", "A", 1, 5));
  return {
    format: "separator-based",
    countLabel: "Counts",
    subtrees: new Map([["A", { rootId: "A", nodes }]]),
    nodeCount: 5,
    warnings: [],
  };
}

const baseSettings: ColorPropagationSettings = {
  enabled: true,
  mode: "specific",
  level: 0,
  colorScale: STOPS,
  defaultColor: DEFAULT_COLOR,
};

describe("propagateColors", () => {
  it("resolves empty cells to defaultColor when disabled", () => {
    const ont = makeOntology();
    const out = propagateColors(ont, { ...baseSettings, enabled: false });
    expect(out).not.toBe(ont);
    for (const id of ["A", "A.B", "A.B.1", "A.B.2", "A.C"]) {
      expect(out.subtrees.get("A")!.nodes.get(id)!.color).toBe(DEFAULT_COLOR);
    }
  });

  it("resolves empty cells to defaultColor when mode is off", () => {
    const ont = makeOntology();
    const out = propagateColors(ont, { ...baseSettings, mode: "off" });
    expect(out.subtrees.get("A")!.nodes.get("A.B")!.color).toBe(DEFAULT_COLOR);
  });

  it("preserves explicit hex colors from the TSV when disabled", () => {
    const ont = makeOntology();
    const tinted = new Map(ont.subtrees.get("A")!.nodes);
    const existing = tinted.get("A.B")!;
    tinted.set("A.B", { ...existing, color: "#ABCDEF" });
    const wrapped: Ontology = {
      ...ont,
      subtrees: new Map([["A", { rootId: "A", nodes: tinted }]]),
    };
    const out = propagateColors(wrapped, { ...baseSettings, enabled: false });
    expect(out.subtrees.get("A")!.nodes.get("A.B")!.color).toBe("#ABCDEF");
  });

  it("does not mutate the input ontology", () => {
    const ont = makeOntology();
    const before = ont.subtrees.get("A")!.nodes.get("A.B")!.color;
    propagateColors(ont, baseSettings);
    expect(ont.subtrees.get("A")!.nodes.get("A.B")!.color).toBe(before);
  });

  it("specific mode colors every node at level >= 0", () => {
    const ont = makeOntology();
    const out = propagateColors(ont, baseSettings);
    const subtree = out.subtrees.get("A")!;
    for (const node of subtree.nodes.values()) {
      expect(node.color).not.toBe("");
    }
    // max(0,10,7,3,5) = 10 → scale has 11 colors. count=10 → last color.
    expect(subtree.nodes.get("A.B")!.color).toBe("#C33D35");
    // count=0 → default at index 0.
    expect(subtree.nodes.get("A")!.color).toBe(DEFAULT_COLOR);
  });

  it("specific mode gates nodes below threshold to defaultColor", () => {
    const ont = makeOntology();
    const out = propagateColors(ont, { ...baseSettings, level: 2 });
    const subtree = out.subtrees.get("A")!;
    expect(subtree.nodes.get("A")!.color).toBe(DEFAULT_COLOR);
    expect(subtree.nodes.get("A.B")!.color).toBe(DEFAULT_COLOR);
    expect(subtree.nodes.get("A.C")!.color).toBe(DEFAULT_COLOR);
    // Leaves at level 2 are colored, scale derived from max(7,3) = 7.
    expect(subtree.nodes.get("A.B.1")!.color).not.toBe(DEFAULT_COLOR);
    expect(subtree.nodes.get("A.B.2")!.color).not.toBe(DEFAULT_COLOR);
  });

  it("global mode shares one scale across all subtrees", () => {
    // Build a two-subtree ontology.
    const ont = makeOntology();
    const extraNodes = new Map<string, Node>();
    extraNodes.set("X", {
      id: "X",
      parent: "",
      label: "X",
      description: "",
      comment: "",
      count: 100, // dominates the global max
      color: "",
      level: 0,
      meshId: "",
      synthetic: false,
    });
    const merged: Ontology = {
      ...ont,
      subtrees: new Map([...ont.subtrees, ["X", { rootId: "X", nodes: extraNodes }]]),
      nodeCount: ont.nodeCount + 1,
    };
    const out = propagateColors(merged, { ...baseSettings, mode: "global" });
    // Both subtrees should use the same scale; the smaller tree's max (10)
    // should map roughly 10% along the gradient instead of saturating.
    const aMax = out.subtrees.get("A")!.nodes.get("A.B")!.color;
    expect(aMax).not.toBe("#C33D35");
    expect(out.subtrees.get("X")!.nodes.get("X")!.color).toBe("#C33D35");
  });

  it("phenotype mode colors leaves and defaults ancestors", () => {
    const ont = makeOntology();
    const out = propagateColors(ont, { ...baseSettings, mode: "phenotype" });
    const subtree = out.subtrees.get("A")!;
    // A and A.B are ancestors of leaves so they get the default.
    expect(subtree.nodes.get("A")!.color).toBe(DEFAULT_COLOR);
    expect(subtree.nodes.get("A.B")!.color).toBe(DEFAULT_COLOR);
    // A.B.1, A.B.2 and A.C are outermost — they get scaled colors.
    expect(subtree.nodes.get("A.B.1")!.color).not.toBe(DEFAULT_COLOR);
    expect(subtree.nodes.get("A.B.2")!.color).not.toBe(DEFAULT_COLOR);
    expect(subtree.nodes.get("A.C")!.color).not.toBe(DEFAULT_COLOR);
  });
});
