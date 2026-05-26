/**
 * OntoloViz-compatible TSV export.
 *
 * Mirrors the headers produced by the legacy Python desktop app
 * (`src/ontoloviz/core.py` → `export_mesh_tree` / `export_atc_tree`) so the
 * resulting file round-trips through `parse.ts` and the desktop tool. Per the
 * agreed scope this exports the *data* (id graph + counts + colors), not the
 * current view (focus zoom, root overrides, gradient editor state).
 */

import { DEFAULT_COLOR, type Node, type Ontology } from "../ontology/types";

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
        collectRows(ontology, (n) => [
          n.id,
          n.parent,
          n.label,
          n.description,
          template ? 0 : n.count,
          template ? DEFAULT_COLOR : (n.color || DEFAULT_COLOR),
        ]),
      );
    case "atc":
      return serialize(
        ["ATC code", "Level", "Label", "Comment", countCol, "Color"],
        collectRows(ontology, (n) => [
          n.id,
          n.level + 1,
          n.label,
          n.comment,
          template ? 0 : n.count,
          template ? DEFAULT_COLOR : (n.color || DEFAULT_COLOR),
        ]),
      );
    case "separator-based":
      return serialize(
        ["MeSH ID", "Tree ID", "Name", "Description", "Comment", countCol, "Color"],
        collectRows(ontology, (n) => [
          n.meshId || n.id,
          n.id,
          n.label,
          n.description,
          n.comment,
          template ? 0 : n.count,
          template ? DEFAULT_COLOR : (n.color || DEFAULT_COLOR),
        ]),
      );
  }
}

/** Build the `Counts [...]` column header from the ontology's countLabel. */
function countColumnLabel(countLabel: string): string {
  const trimmed = (countLabel ?? "").trim();
  if (!trimmed || trimmed.toLowerCase() === "counts") return "Counts";
  return `Counts [${trimmed}]`;
}

/**
 * Walk every subtree and emit one row per real node. Synthetic placeholders
 * are skipped — the importer rebuilds them deterministically.
 */
function collectRows<T extends readonly (string | number)[]>(
  ontology: Ontology,
  rowFor: (node: Node) => T,
): T[] {
  const rows: T[] = [];
  for (const subtree of ontology.subtrees.values()) {
    const nodes: Node[] = [];
    for (const node of subtree.nodes.values()) {
      if (node.synthetic) continue;
      nodes.push(node);
    }
    // Sort by count desc to match the legacy export ordering; falls back to id
    // for stable output when counts tie (the legacy code used set iteration so
    // ties were nondeterministic — we make it predictable instead).
    nodes.sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
    for (const node of nodes) rows.push(rowFor(node));
  }
  return rows;
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
