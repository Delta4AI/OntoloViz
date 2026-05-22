import { describe, expect, it } from "vitest";

import { buildStandaloneHtml } from "@/lib/export/html";
import { layoutToSvg } from "@/lib/export/svg";
import { layoutSunburst } from "@/lib/ontology/layout";
import type { Node, Subtree } from "@/lib/ontology/types";

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
