/**
 * OntoloViz-compatible TSV export.
 *
 * Mirrors the headers produced by the legacy Python desktop app
 * (`src/ontoloviz/core.py` → `export_mesh_tree` / `export_atc_tree`) so the
 * resulting file round-trips through `parse.ts` and the desktop tool. Per the
 * agreed scope this exports the *data* (id graph + counts + colors) for the
 * whole ontology, not the current view (focus zoom, root overrides, gradient
 * editor state).
 *
 * Always exports every subtree — the legacy format is whole-ontology and
 * partial files import as partial ontologies, which is rarely what users want.
 */

import { DEFAULT_COLOR, type Node, type Ontology } from "../ontology/types";

const ID_SEPARATOR = "|";

export interface TsvExportOptions {
  /**
   * If true, emit zero counts and white colors so the file can be reused as a
   * fresh template. Matches the "Create Template" toggle in the desktop app.
   */
  readonly template?: boolean;
}

/** Serialize an Ontology to an OntoloViz-compatible TSV string. */
export function ontologyToTsv(
  ontology: Ontology,
  options: TsvExportOptions = {},
): string {
  const template = options.template === true;
  const countCol = countColumnLabel(ontology.countLabel);

  switch (ontology.format) {
    case "parent-based":
      return serialize(
        ["ID", "Parent", "Label", "Description", countCol, "Color"],
        parentBasedRows(ontology, template),
      );
    case "atc":
      return serialize(
        ["ATC code", "Level", "Label", "Comment", countCol, "Color"],
        atcRows(ontology, template),
      );
    case "separator-based":
      return serialize(
        ["MeSH ID", "Tree ID", "Name", "Description", "Comment", countCol, "Color"],
        meshRows(ontology, template),
      );
  }
}

function parentBasedRows(ontology: Ontology, template: boolean): (string | number)[][] {
  const rows: (string | number)[][] = [];
  for (const subtree of ontology.subtrees.values()) {
    const nodes = realNodes(subtree.nodes.values());
    nodes.sort(byCountDescThenId);
    for (const n of nodes) {
      rows.push([
        n.id,
        n.parent,
        n.label,
        n.description,
        template ? 0 : n.count,
        template ? DEFAULT_COLOR : n.color || DEFAULT_COLOR,
      ]);
    }
  }
  return rows;
}

function atcRows(ontology: Ontology, template: boolean): (string | number)[][] {
  const rows: (string | number)[][] = [];
  for (const subtree of ontology.subtrees.values()) {
    const nodes = realNodes(subtree.nodes.values());
    nodes.sort(byCountDescThenId);
    for (const n of nodes) {
      rows.push([
        n.id,
        n.level + 1,
        n.label,
        n.comment,
        template ? 0 : n.count,
        template ? DEFAULT_COLOR : n.color || DEFAULT_COLOR,
      ]);
    }
  }
  return rows;
}

/**
 * MeSH-style rows. Nodes that share a `meshId` represent one term mapped into
 * multiple tree positions (e.g. a disease that lives under both C23 and C28).
 * The parser expanded each tree-id into its own Node — we collapse them back
 * into one row with `|`-joined tree-ids so the file round-trips losslessly
 * through the desktop app.
 */
function meshRows(ontology: Ontology, template: boolean): (string | number)[][] {
  const groups = new Map<string, Node[]>();
  const ungrouped: Node[] = [];

  for (const subtree of ontology.subtrees.values()) {
    for (const node of subtree.nodes.values()) {
      if (node.synthetic) continue;
      if (node.meshId) {
        const bucket = groups.get(node.meshId);
        if (bucket) bucket.push(node);
        else groups.set(node.meshId, [node]);
      } else {
        ungrouped.push(node);
      }
    }
  }

  const rows: (string | number)[][] = [];

  for (const [meshId, nodes] of groups) {
    const sorted = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
    const head = sorted[0]!;
    rows.push([
      meshId,
      sorted.map((n) => n.id).join(ID_SEPARATOR),
      head.label,
      head.description,
      head.comment,
      template ? 0 : head.count,
      template ? DEFAULT_COLOR : head.color || DEFAULT_COLOR,
    ]);
  }

  for (const n of ungrouped) {
    rows.push([
      n.id,
      n.id,
      n.label,
      n.description,
      n.comment,
      template ? 0 : n.count,
      template ? DEFAULT_COLOR : n.color || DEFAULT_COLOR,
    ]);
  }

  // Sort by count desc, then tree-id ascending, for predictable output.
  rows.sort((a, b) => {
    const ca = a[5] as number;
    const cb = b[5] as number;
    if (cb !== ca) return cb - ca;
    return String(a[1]).localeCompare(String(b[1]));
  });

  return rows;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function countColumnLabel(countLabel: string): string {
  const trimmed = (countLabel ?? "").trim();
  if (!trimmed || trimmed.toLowerCase() === "counts") return "Counts";
  return `Counts [${trimmed}]`;
}

function realNodes(iter: Iterable<Node>): Node[] {
  const out: Node[] = [];
  for (const n of iter) if (!n.synthetic) out.push(n);
  return out;
}

function byCountDescThenId(a: Node, b: Node): number {
  return b.count - a.count || a.id.localeCompare(b.id);
}

function serialize(
  header: readonly (string | number)[],
  rows: readonly (readonly (string | number)[])[],
): string {
  const lines = [header.map(cell).join("\t")];
  for (const row of rows) lines.push(row.map(cell).join("\t"));
  return lines.join("\n") + "\n";
}

/**
 * TSV-safe cell: tabs become spaces, newlines become "; ". Matches the legacy
 * sanitization (`description.replace("\n", ";")`) closely enough that the
 * parser round-trips cleanly.
 */
function cell(value: string | number): string {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "0";
  return value.replace(/\t/g, " ").replace(/\r?\n/g, "; ");
}
