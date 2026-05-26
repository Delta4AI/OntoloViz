import { describe, expect, it } from "vitest";

import { buildStandaloneHtml } from "@/lib/export/html";
import { layoutToSvg } from "@/lib/export/svg";
import { ontologyToTsv } from "@/lib/export/tsv";
import { layoutSunburst } from "@/lib/ontology/layout";
import { parseTsv } from "@/lib/ontology/parse";
import type { Node, Ontology, Subtree } from "@/lib/ontology/types";

function mkNode(id: string, parent: string, level: number, count: number): Node {
  return {
    id,
    parent,
    label: `Label of ${id}`,
    description: "",
    comment: "",
    count,
    color: "#C33D35",
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

describe("layoutToSvg", () => {
  const layout = layoutSunburst(makeSubtree());

  it("opens with an <svg> root and closes with </svg>", () => {
    const svg = layoutToSvg(layout, { width: 400, height: 400 });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain('viewBox="0 0 400 400"');
  });

  it("emits one <path> per non-degenerate slice", () => {
    const svg = layoutToSvg(layout, { width: 400, height: 400 });
    const matches = svg.match(/<path /g) ?? [];
    expect(matches.length).toBe(layout.length);
  });

  it("includes <title> children with node id and count for tooltips", () => {
    const svg = layoutToSvg(layout, { width: 400, height: 400 });
    expect(svg).toContain("A.B.1");
    expect(svg).toContain("Label of A.B.1");
  });

  it("escapes characters that would break XML", () => {
    const subtree = makeSubtree();
    const tricky = new Map(subtree.nodes);
    const ab = tricky.get("A.B")!;
    tricky.set("A.B", { ...ab, label: `<x & y>` });
    const layout2 = layoutSunburst({ rootId: "A", nodes: tricky });
    const svg = layoutToSvg(layout2, { width: 200, height: 200 });
    expect(svg).toContain("&lt;x &amp; y&gt;");
    expect(svg).not.toContain("<x & y>");
  });

  it("omits the background rect when background is null", () => {
    const svg = layoutToSvg(layout, { width: 200, height: 200, background: null });
    expect(svg).not.toContain("<rect");
  });

  it("emits an SVG-level <title> when title option is set", () => {
    const svg = layoutToSvg(layout, { width: 200, height: 200, title: "X" });
    // first <title> appears before any <path>
    const firstTitle = svg.indexOf("<title>");
    const firstPath = svg.indexOf("<path");
    expect(firstTitle).toBeGreaterThan(-1);
    expect(firstTitle).toBeLessThan(firstPath);
    expect(svg.slice(firstTitle, firstTitle + 30)).toContain("X");
  });
});

describe("ontologyToTsv", () => {
  function buildParentBased(): Ontology {
    const tsv = [
      "ID\tParent\tLabel\tDescription\tCounts [Demo]\tColor",
      "root\t\tRoot\tThe root\t0\t#FFFFFF",
      "a\troot\tAlpha\tFirst child\t5\t#FF0000",
      "b\troot\tBeta\tSecond child\t12\t#00FF00",
      "a.1\ta\tA-One\tLeaf\t2\t#0000FF",
    ].join("\n");
    return parseTsv(tsv);
  }

  it("round-trips a parent-based ontology back through the parser", () => {
    const original = buildParentBased();
    const tsv = ontologyToTsv(original);
    const reparsed = parseTsv(tsv);

    expect(reparsed.format).toBe("parent-based");
    expect(reparsed.countLabel).toBe("Demo");
    expect(reparsed.nodeCount).toBe(original.nodeCount);

    const root = reparsed.subtrees.get("root")!;
    expect(root.nodes.get("a")!.count).toBe(5);
    expect(root.nodes.get("b")!.count).toBe(12);
    expect(root.nodes.get("a.1")!.parent).toBe("a");
    expect(root.nodes.get("a")!.color).toBe("#FF0000");
  });

  it("emits the OntoloViz parent-based header with the count label", () => {
    const tsv = ontologyToTsv(buildParentBased());
    const header = tsv.split("\n")[0]!;
    expect(header).toBe("ID\tParent\tLabel\tDescription\tCounts [Demo]\tColor");
  });

  it("sorts rows by count descending within each subtree", () => {
    const tsv = ontologyToTsv(buildParentBased());
    const lines = tsv.trim().split("\n").slice(1);
    const counts = lines.map((line) => Number(line.split("\t")[4]));
    // root(0), a(5), b(12), a.1(2) → desc: 12, 5, 2, 0
    expect(counts).toEqual([12, 5, 2, 0]);
  });

  it("zeros counts and whitens colors in template mode", () => {
    const tsv = ontologyToTsv(buildParentBased(), { template: true });
    const lines = tsv.trim().split("\n").slice(1);
    for (const line of lines) {
      const cols = line.split("\t");
      expect(cols[4]).toBe("0");
      expect(cols[5]).toBe("#FFFFFF");
    }
  });

  it("escapes tabs and newlines inside cell values", () => {
    const tsv = [
      "ID\tParent\tLabel\tDescription\tCounts\tColor",
      "x\t\tname\tfirst\\tsecond\n\nmultiline\t0\t#000000",
    ]
      .join("\n")
      .replace("\\t", "\t");
    const reparsed = parseTsv(tsv);
    const out = ontologyToTsv(reparsed);
    const dataLine = out.trim().split("\n")[1]!;
    expect(dataLine.split("\t")).toHaveLength(6);
    expect(dataLine).not.toMatch(/\n/);
  });

  it("uses the ATC header for ATC ontologies", () => {
    const atc = parseTsv(
      [
        "ATC code\tLevel\tLabel\tComment\tCounts [Pheno]\tColor",
        "A\t1\tAlimentary tract\t\t0\t#FFFFFF",
        "A01\t2\tStomatological\t\t3\t#123456",
      ].join("\n"),
    );
    const out = ontologyToTsv(atc);
    expect(out.split("\n")[0]).toBe(
      "ATC code\tLevel\tLabel\tComment\tCounts [Pheno]\tColor",
    );
    const reparsed = parseTsv(out);
    expect(reparsed.format).toBe("atc");
    expect(reparsed.subtrees.get("A")!.nodes.get("A01")!.count).toBe(3);
  });

  it("skips synthetic placeholder nodes", () => {
    // Separator-based input where the intermediate parent is missing — the
    // parser backfills "A.B" as synthetic. Export must not write it back.
    const ontology = parseTsv(
      [
        "MeSH ID\tTree ID\tName\tDescription\tComment\tCounts\tColor",
        "x1\tA\tRoot\t\t\t0\t#FFFFFF",
        "x2\tA.B.C\tLeaf\t\t\t1\t#FFFFFF",
      ].join("\n"),
    );
    const out = ontologyToTsv(ontology);
    const dataLines = out.trim().split("\n").slice(1);
    const ids = dataLines.map((line) => line.split("\t")[1]);
    expect(ids).toContain("A");
    expect(ids).toContain("A.B.C");
    expect(ids).not.toContain("A.B");
  });
});

describe("buildStandaloneHtml", () => {
  const layout = layoutSunburst(makeSubtree());

  it("returns a doctype + html document", () => {
    const html = buildStandaloneHtml(layout, { width: 200, height: 200 });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
  });

  it("embeds the SVG inline", () => {
    const html = buildStandaloneHtml(layout, { width: 200, height: 200 });
    expect(html).toContain("<svg");
    expect(html).toContain("</svg>");
  });

  it("renders the optional caption escaped", () => {
    const html = buildStandaloneHtml(layout, {
      width: 200,
      height: 200,
      caption: "5 < 10 & rising",
    });
    expect(html).toContain("5 &lt; 10 &amp; rising");
    expect(html).toContain("<figcaption");
  });

  it("uses documentTitle for the <head><title>", () => {
    const html = buildStandaloneHtml(layout, {
      width: 200,
      height: 200,
      documentTitle: "My export",
    });
    expect(html).toMatch(/<title>My export<\/title>/);
  });
});
