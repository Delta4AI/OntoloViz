import { describe, it, expect } from "vitest";
import { parseTsv } from "../../src/lib/ontology/parse";
import { propagateCounts } from "../../src/lib/ontology/propagate";
import type { Ontology } from "../../src/lib/ontology/types";

const PARENT_TSV = [
  "ID\tParent\tLabel\tDescription\tCount\tColor",
  "A\t\troot\t\t0\t",
  "B\tA\tchild b\t\t0\t",
  "C\tA\tchild c\t\t0\t",
  "D\tB\tleaf d\t\t5\t",
  "E\tB\tleaf e\t\t3\t",
  "F\tC\tleaf f\t\t7\t",
].join("\n");

const original = parseTsv(PARENT_TSV);
const get = (o: Ontology, id: string) => o.subtrees.get("A")!.nodes.get(id)!.count;

describe("propagateCounts", () => {
  it("is a no-op when disabled", () => {
    const result = propagateCounts(original, {
      enabled: false,
      countMode: "all",
      level: 0,
    });
    expect(get(result, "A")).toBe(0);
    expect(get(result, "B")).toBe(0);
    expect(get(result, "D")).toBe(5);
  });

  it("is a no-op for countMode = off", () => {
    const result = propagateCounts(original, {
      enabled: true,
      countMode: "off",
      level: 0,
    });
    expect(get(result, "A")).toBe(0);
    expect(get(result, "B")).toBe(0);
  });

  it("propagates all counts to the root when mode = all", () => {
    const result = propagateCounts(original, {
      enabled: true,
      countMode: "all",
      level: 0,
    });
    expect(get(result, "D")).toBe(5);
    expect(get(result, "E")).toBe(3);
    expect(get(result, "F")).toBe(7);
    expect(get(result, "B")).toBe(8); // 5 + 3
    expect(get(result, "C")).toBe(7);
    expect(get(result, "A")).toBe(15); // 5 + 3 + 7
  });

  it("does not mutate the input ontology", () => {
    propagateCounts(original, { enabled: true, countMode: "all", level: 0 });
    // re-read from the original
    expect(get(original, "A")).toBe(0);
    expect(get(original, "B")).toBe(0);
  });

  describe("mode = level", () => {
    // Tree: A(L0) → B(L1) → D(L2), E(L2)
    //       A(L0) → C(L1) → F(L2)
    it("with threshold 0 propagates everywhere (parent at L0 >= 0)", () => {
      const result = propagateCounts(original, {
        enabled: true,
        countMode: "level",
        level: 0,
      });
      // L2 → L1: parent (L1) >= 0 → adds. L1 → L0: parent (L0) >= 0 → adds.
      expect(get(result, "B")).toBe(8);
      expect(get(result, "C")).toBe(7);
      expect(get(result, "A")).toBe(15);
    });

    it("with threshold 1 stops at level 1 (only L2 → L1 contributes)", () => {
      const result = propagateCounts(original, {
        enabled: true,
        countMode: "level",
        level: 1,
      });
      // L2 → L1: parent (L1) >= 1 → adds. L1 → L0: parent (L0) >= 1 → false → no add.
      expect(get(result, "B")).toBe(8);
      expect(get(result, "C")).toBe(7);
      expect(get(result, "A")).toBe(0);
    });

    it("with threshold 2 yields no propagation (no parent at L2)", () => {
      const result = propagateCounts(original, {
        enabled: true,
        countMode: "level",
        level: 2,
      });
      expect(get(result, "A")).toBe(0);
      expect(get(result, "B")).toBe(0);
      expect(get(result, "C")).toBe(0);
    });
  });

  it("returns a new Ontology object distinct from the input", () => {
    const result = propagateCounts(original, {
      enabled: true,
      countMode: "all",
      level: 0,
    });
    expect(result).not.toBe(original);
    expect(result.subtrees).not.toBe(original.subtrees);
  });

  it("preserves non-count node fields", () => {
    const result = propagateCounts(original, {
      enabled: true,
      countMode: "all",
      level: 0,
    });
    const a = result.subtrees.get("A")!.nodes.get("A")!;
    expect(a.label).toBe("root");
    expect(a.parent).toBe("");
    expect(a.level).toBe(0);
  });
});
