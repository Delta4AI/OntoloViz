import { beforeEach, describe, expect, it } from "vitest";

import {
  derivePropagated,
  filterRows,
  flattenRows,
  useAppStore,
  type GridRow,
} from "@/lib/store";
import { parseTsv } from "@/lib/ontology/parse";
import type { Node } from "@/lib/ontology/types";

// Minimal ATC fixture: one 5-level chain so propagation has somewhere to go.
const TSV = [
  "ATC code\tLevel\tLabel\tComment\tCounts\tColor",
  "A01AA01\t5\tcompound\t\t4\t",
].join("\n");

describe("useAppStore", () => {
  beforeEach(() => {
    useAppStore.getState().reset();
  });

  it("starts with null ontology and default settings", () => {
    const state = useAppStore.getState();
    expect(state.raw).toBeNull();
    expect(state.activeRoot).toBeNull();
    expect(state.count.countMode).toBe("off");
    expect(state.color.mode).toBe("specific");
  });

  it("setOntology picks the first root as activeRoot", () => {
    const ont = parseTsv(TSV);
    useAppStore.getState().setOntology(ont);
    const state = useAppStore.getState();
    expect(state.raw).toBe(ont);
    expect(state.activeRoot).toBe([...ont.subtrees.keys()][0]);
  });

  it("setOntology forces viewMode='detail' for single-subtree ontologies", () => {
    const ont = parseTsv(TSV);
    expect(ont.subtrees.size).toBe(1);
    useAppStore.getState().setOntology(ont);
    expect(useAppStore.getState().viewMode).toBe("detail");
  });

  it("setOntology defaults viewMode='overview' for multi-subtree ontologies", () => {
    const multi = parseTsv(
      [
        "ATC code\tLevel\tLabel\tComment\tCounts\tColor",
        "A01AA01\t5\tcompound-a\t\t4\t",
        "B01AA01\t5\tcompound-b\t\t2\t",
      ].join("\n"),
    );
    expect(multi.subtrees.size).toBeGreaterThan(1);
    useAppStore.getState().setOntology(multi);
    expect(useAppStore.getState().viewMode).toBe("overview");
  });

  it("setViewMode updates the mode independently", () => {
    useAppStore.getState().setViewMode("detail");
    expect(useAppStore.getState().viewMode).toBe("detail");
    useAppStore.getState().setViewMode("overview");
    expect(useAppStore.getState().viewMode).toBe("overview");
  });

  it("setOntology(null) returns viewMode to overview", () => {
    useAppStore.getState().setViewMode("detail");
    useAppStore.getState().setOntology(null);
    expect(useAppStore.getState().viewMode).toBe("overview");
  });

  it("setCountSettings merges (preserves untouched keys)", () => {
    useAppStore.getState().setCountSettings({ countMode: "level", level: 2 });
    const c = useAppStore.getState().count;
    expect(c.countMode).toBe("level");
    expect(c.level).toBe(2);
    expect(c.enabled).toBe(true); // untouched default
  });

  it("setColorSettings merges (preserves untouched keys)", () => {
    useAppStore.getState().setColorSettings({ mode: "phenotype" });
    const c = useAppStore.getState().color;
    expect(c.mode).toBe("phenotype");
    expect(c.enabled).toBe(true);
    expect(c.defaultColor).toBe("#FFFFFF");
  });

  it("reset clears ontology and restores defaults", () => {
    const ont = parseTsv(TSV);
    useAppStore.getState().setOntology(ont);
    useAppStore.getState().setColorSettings({ mode: "off" });
    useAppStore.getState().setHoveredId("foo");
    useAppStore.getState().setSearchQuery("query");
    useAppStore.getState().reset();
    const state = useAppStore.getState();
    expect(state.raw).toBeNull();
    expect(state.color.mode).toBe("specific");
    expect(state.hoveredId).toBeNull();
    expect(state.searchQuery).toBe("");
  });

  it("starts with empty ring weights (uniform)", () => {
    expect(useAppStore.getState().layout.ringWeights).toEqual([]);
  });

  it("setRingWeight sets a single ring's multiplier", () => {
    useAppStore.getState().setRingWeight(0, 2);
    expect(useAppStore.getState().layout.ringWeights).toEqual([2]);
  });

  it("setRingWeight pads intervening rings with the baseline", () => {
    // Setting depth 2 without 0/1 fills them with weight 1.
    useAppStore.getState().setRingWeight(2, 0.5);
    expect(useAppStore.getState().layout.ringWeights).toEqual([1, 1, 0.5]);
  });

  it("setRingWeight overwrites in place without regrowing the array", () => {
    useAppStore.getState().setRingWeight(2, 0.5);
    useAppStore.getState().setRingWeight(0, 3);
    expect(useAppStore.getState().layout.ringWeights).toEqual([3, 1, 0.5]);
  });

  it("setRingWeight ignores negative depths", () => {
    useAppStore.getState().setRingWeight(-1, 2);
    expect(useAppStore.getState().layout.ringWeights).toEqual([]);
  });

  it("resetRingWeights clears back to uniform", () => {
    useAppStore.getState().setRingWeight(1, 2);
    useAppStore.getState().resetRingWeights();
    expect(useAppStore.getState().layout.ringWeights).toEqual([]);
  });

  it("setRingWeights replaces the whole array", () => {
    useAppStore.getState().setRingWeight(0, 2);
    useAppStore.getState().setRingWeights([0.5, 1, 1.5]);
    expect(useAppStore.getState().layout.ringWeights).toEqual([0.5, 1, 1.5]);
  });

  it("setRingWeights stores a copy so the source can't mutate state", () => {
    const source = [0.5, 1, 1.5];
    useAppStore.getState().setRingWeights(source);
    source[0] = 99;
    expect(useAppStore.getState().layout.ringWeights).toEqual([0.5, 1, 1.5]);
  });

  it("reset restores uniform ring weights", () => {
    useAppStore.getState().setRingWeight(0, 2.5);
    useAppStore.getState().reset();
    expect(useAppStore.getState().layout.ringWeights).toEqual([]);
  });

  it("defaults angularMode to count", () => {
    expect(useAppStore.getState().layout.angularMode).toBe("count");
  });

  it("setAngularMode switches the wedge-size mode", () => {
    useAppStore.getState().setAngularMode("uniform");
    expect(useAppStore.getState().layout.angularMode).toBe("uniform");
  });

  it("setAngularMode preserves ring weights", () => {
    useAppStore.getState().setRingWeights([0.5, 1, 2]);
    useAppStore.getState().setAngularMode("uniform");
    expect(useAppStore.getState().layout.ringWeights).toEqual([0.5, 1, 2]);
  });

  it("reset restores angularMode to count", () => {
    useAppStore.getState().setAngularMode("uniform");
    useAppStore.getState().reset();
    expect(useAppStore.getState().layout.angularMode).toBe("count");
  });

  it("setHoveredId / setSearchQuery update independently", () => {
    useAppStore.getState().setHoveredId("X.Y");
    useAppStore.getState().setSearchQuery("abc");
    const state = useAppStore.getState();
    expect(state.hoveredId).toBe("X.Y");
    expect(state.searchQuery).toBe("abc");
  });
});

/* -------------------------------------------------------------------------- */
/* Grid row selectors                                                          */
/* -------------------------------------------------------------------------- */

function mkRow(rootId: string, id: string, label: string): GridRow {
  const node: Node = {
    id,
    parent: "",
    label,
    description: "",
    comment: "",
    count: 0,
    color: "#FFFFFF",
    level: 0,
    meshId: "",
    synthetic: false,
  };
  return { rootId, node };
}

describe("flattenRows", () => {
  it("returns [] for null ontology", () => {
    expect(flattenRows(null)).toEqual([]);
  });

  it("returns one row per node, sorted by rootId then id", () => {
    const ont = parseTsv(TSV);
    const rows = flattenRows(ont);
    expect(rows.length).toBeGreaterThan(0);
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1]!;
      const curr = rows[i]!;
      const prevKey = `${prev.rootId}::${prev.node.id}`;
      const currKey = `${curr.rootId}::${curr.node.id}`;
      expect(prevKey <= currKey).toBe(true);
    }
  });
});

describe("filterRows", () => {
  const rows = [
    mkRow("A", "A01", "Alimentary"),
    mkRow("A", "A02", "Antacids"),
    mkRow("B", "B01", "Blood"),
  ];

  it("returns input unchanged for empty query", () => {
    expect(filterRows(rows, "")).toBe(rows);
    expect(filterRows(rows, "   ")).toBe(rows);
  });

  it("matches id substring case-insensitively", () => {
    const out = filterRows(rows, "a0");
    expect(out.map((r) => r.node.id)).toEqual(["A01", "A02"]);
  });

  it("matches label substring case-insensitively", () => {
    const out = filterRows(rows, "BLOOD");
    expect(out).toHaveLength(1);
    expect(out[0]!.node.id).toBe("B01");
  });

  it("returns [] when nothing matches", () => {
    expect(filterRows(rows, "zzz")).toEqual([]);
  });
});

describe("derivePropagated", () => {
  it("returns null when raw is null", () => {
    const state = useAppStore.getState();
    expect(derivePropagated(null, state.count, state.color)).toBeNull();
  });

  it("produces an ontology with the same subtree roots as the input", () => {
    const ont = parseTsv(TSV);
    const state = useAppStore.getState();
    const out = derivePropagated(ont, state.count, state.color);
    expect(out).not.toBeNull();
    expect([...out!.subtrees.keys()]).toEqual([...ont.subtrees.keys()]);
  });

  it("changes the propagated count when countMode flips", () => {
    const ont = parseTsv(TSV);
    const [rootId] = [...ont.subtrees.keys()];
    expect(rootId).toBeTruthy();

    const off = derivePropagated(
      ont,
      { enabled: true, countMode: "off", level: 0 },
      useAppStore.getState().color,
    )!;
    const all = derivePropagated(
      ont,
      { enabled: true, countMode: "all", level: 0 },
      useAppStore.getState().color,
    )!;
    const offRoot = off.subtrees.get(rootId!)!.nodes.get(rootId!)!.count;
    const allRoot = all.subtrees.get(rootId!)!.nodes.get(rootId!)!.count;
    // Single leaf with count 4 — "off" leaves the root untouched (count 0
    // from the synthesized parent), "all" rolls the leaf's 4 up.
    expect(allRoot).toBeGreaterThan(offRoot);
  });
});
