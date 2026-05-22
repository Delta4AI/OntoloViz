import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseTsv,
  detectFormat,
  extractCountLabel,
} from "../../src/lib/ontology/parse";

const TEMPLATES = join(__dirname, "..", "..", "..", "templates");
const readTemplate = (name: string) => readFileSync(join(TEMPLATES, name), "utf-8");

describe("detectFormat", () => {
  it("flags parent-based when a Parent column exists", () => {
    expect(detectFormat(["ID", "Parent", "Label", "Count"])).toBe("parent-based");
  });
  it("flags atc when the first column is 'ATC code'", () => {
    expect(detectFormat(["ATC code", "Level", "Label", "Count"])).toBe("atc");
  });
  it("flags separator-based for MeSH-shaped headers", () => {
    expect(detectFormat(["MeSH ID", "Tree ID", "Name", "Count"])).toBe(
      "separator-based",
    );
  });
});

describe("extractCountLabel", () => {
  it("pulls the bracketed label from a Counts header", () => {
    expect(extractCountLabel(["ID", "Counts [Template Drug]", "Color"])).toBe(
      "Template Drug",
    );
  });
  it("falls back to Counts when nothing matches", () => {
    expect(extractCountLabel(["ID", "Foo"])).toBe("Counts");
  });
});

describe("parseTsv — ATC template (positional hierarchy)", () => {
  const ontology = parseTsv(readTemplate("atc_template.tsv"));

  it("uses atc format", () => {
    expect(ontology.format).toBe("atc");
  });

  it("groups nodes under their ATC top-level letter", () => {
    const rootIds = [...ontology.subtrees.keys()];
    expect(rootIds.length).toBeGreaterThan(0);
    for (const root of rootIds) {
      expect(root).toMatch(/^[A-Z]$/);
    }
  });

  it("backfills synthetic ancestors so every chain reaches its root", () => {
    for (const subtree of ontology.subtrees.values()) {
      for (const node of subtree.nodes.values()) {
        if (node.level === 0) continue;
        expect(subtree.nodes.has(node.parent)).toBe(true);
      }
    }
  });

  it("derives parent from positional rules (N05CD01 → N05CD)", () => {
    const subtree = ontology.subtrees.get("N");
    expect(subtree).toBeDefined();
    const node = subtree!.nodes.get("N05CD01");
    expect(node).toBeDefined();
    expect(node!.level).toBe(4); // 0-based: levels 1..5 → 0..4
    expect(node!.parent).toBe("N05CD");
    // and the synthetic chain N → N05 → N05C → N05CD exists
    expect(subtree!.nodes.get("N05CD")!.parent).toBe("N05C");
    expect(subtree!.nodes.get("N05C")!.parent).toBe("N05");
    expect(subtree!.nodes.get("N05")!.parent).toBe("N");
    expect(subtree!.nodes.get("N")!.parent).toBe("");
  });
});

describe("parseTsv — separator-based (MeSH template)", () => {
  const ontology = parseTsv(readTemplate("mesh_template.tsv"));

  it("uses MeSH-shape columns and captures the original meshId", () => {
    const subtree = [...ontology.subtrees.values()][0]!;
    const sample = [...subtree.nodes.values()].find((n) => !n.synthetic);
    expect(sample).toBeDefined();
    expect(sample!.meshId).toMatch(/^D\d+$/);
  });

  it("splits multi-id Tree ID rows on '|'", () => {
    // D000006 has two tree ids in the template
    let found = 0;
    for (const subtree of ontology.subtrees.values()) {
      for (const node of subtree.nodes.values()) {
        if (node.meshId === "D000006") found += 1;
      }
    }
    expect(found).toBe(2);
  });
});

describe("parseTsv — parent-based template", () => {
  // Synthesized from the TEMPLATE_PARENT_BASED_TSV literal in core/web.py.
  const tsv = [
    "ID\tParent\tLabel\tDescription\tCount\tColor",
    "A\t\tgroup 1\t\t\t",
    "X001\tA\tchild 1\tChild attached to group 1\t1\t",
    "X002\tA\tchild 2\tChild attached to group 1\t2\t",
    "X003\tX002\tchild 3\tChild attached to child 2\t3\t#0000FF",
    "B\t\tgroup 2\t\t\t",
    "X004|X005|X006\tB\tchild X\tMultiple children attached to group\t2\t#FF0000",
    "X007|X008\tX005\tchild Y\tMultiple children attached to child 5\t\t",
  ].join("\n");
  const ontology = parseTsv(tsv);

  it("detects parent-based format", () => {
    expect(ontology.format).toBe("parent-based");
  });

  it("creates two subtrees (A and B)", () => {
    expect([...ontology.subtrees.keys()].sort()).toEqual(["A", "B"]);
  });

  it("explodes pipe-separated ids into individual nodes", () => {
    const b = ontology.subtrees.get("B")!;
    for (const id of ["X004", "X005", "X006"]) {
      expect(b.nodes.has(id)).toBe(true);
      expect(b.nodes.get(id)!.parent).toBe("B");
    }
  });

  it("computes level by walking the parent chain", () => {
    const b = ontology.subtrees.get("B")!;
    expect(b.nodes.get("B")!.level).toBe(0);
    expect(b.nodes.get("X005")!.level).toBe(1);
    expect(b.nodes.get("X007")!.level).toBe(2); // X007 → X005 → B
  });

  it("rounds float counts to integers (Python parity)", () => {
    const a = ontology.subtrees.get("A")!;
    expect(a.nodes.get("X003")!.count).toBe(3);
  });

  it("preserves explicit colors and leaves empty cells empty", () => {
    const a = ontology.subtrees.get("A")!;
    expect(a.nodes.get("X003")!.color).toBe("#0000FF");
    expect(a.nodes.get("X001")!.color).toBe("");
  });
});

describe("parseTsv — robustness", () => {
  it("handles CRLF line endings", () => {
    const tsv =
      "ID\tParent\tLabel\tDescription\tCount\tColor\r\n" +
      "A\t\troot\t\t1\t\r\n" +
      "B\tA\tchild\t\t2\t\r\n";
    const o = parseTsv(tsv);
    expect(o.subtrees.get("A")!.nodes.size).toBe(2);
  });

  it("strips a UTF-8 BOM", () => {
    const tsv = "﻿ID\tParent\tLabel\tDescription\tCount\tColor\nA\t\troot\t\t1\t\n";
    const o = parseTsv(tsv);
    expect(o.subtrees.has("A")).toBe(true);
  });

  it("returns warnings, not throws, on duplicate ids", () => {
    const tsv =
      "ID\tParent\tLabel\tDescription\tCount\tColor\n" +
      "A\t\troot\t\t1\t\n" +
      "A\t\tagain\t\t9\t\n";
    const o = parseTsv(tsv);
    expect(o.warnings.length).toBe(1);
    expect(o.warnings[0]).toMatch(/duplicate/i);
    expect(o.subtrees.get("A")!.nodes.get("A")!.count).toBe(1); // first wins
  });

  it("returns an empty ontology with a warning on empty input", () => {
    const o = parseTsv("");
    expect(o.nodeCount).toBe(0);
    expect(o.warnings[0]).toMatch(/empty/i);
  });
});
