/**
 * TSV parser for ontology files.
 *
 * Supports two formats, matching the Python reference implementation
 * in src/ontoloviz/core.py:
 *
 *   PARENT-BASED   (e.g. custom):  ID  Parent  Label  Description  Count  Color
 *   SEPARATOR-BASED (e.g. ATC, MeSH): IDs encode hierarchy via a separator,
 *      and a row may contain multiple ids joined by `|` (the id-separator),
 *      e.g. `C23.888.592|C23.888.821`.
 *
 * Missing parent nodes are reconstructed as synthetic nodes so every tree is
 * fully connected.
 *
 * The parser is pure: no I/O, no globals, no side effects. Errors surface as
 * `warnings` on the returned Ontology — the caller decides what to show.
 */

import {
  DEFAULT_COLOR,
  type Node,
  type Ontology,
  type OntologyFormat,
  type Subtree,
} from "./types";

/** Pipe is hard-coded as the id-separator in the Python reference. */
const ID_SEPARATOR = "|";

interface MutableSubtree {
  rootId: string;
  nodes: Map<string, Node>;
}

export interface ParseOptions {
  /** Hierarchy separator used inside one id. Default `.` (MeSH/ATC). */
  readonly levelSeparator?: string;
  /** Force a format instead of auto-detecting from the header. */
  readonly format?: OntologyFormat;
}

/**
 * Auto-detect format from the header row. The parent-based template has a
 * `Parent` column; separator-based templates encode the hierarchy in the id
 * itself and never have one.
 */
export function detectFormat(headerRow: readonly string[]): OntologyFormat {
  const lowered = headerRow.map((h) => h.trim().toLowerCase());
  if (lowered.includes("parent")) return "parent-based";
  // ATC template ships with the header "ATC code" in column 0.
  if (lowered[0] === "atc code") return "atc";
  return "separator-based";
}

/**
 * Extract a human-readable count label from a header like
 * `Counts [Template Drug]` → `Template Drug`. Falls back to `Counts`.
 */
export function extractCountLabel(headerRow: readonly string[]): string {
  for (const h of headerRow) {
    const match = h.match(/Counts\s*\[(.+?)\]/i);
    if (match) return match[1]!.trim();
  }
  return "Counts";
}

export function parseTsv(text: string, options: ParseOptions = {}): Ontology {
  const rows = splitRows(text);
  if (rows.length === 0) {
    return emptyOntology("separator-based", "Counts", ["File is empty."]);
  }
  const header = rows[0]!.map((c) => c.trim());
  const format = options.format ?? detectFormat(header);
  const countLabel = extractCountLabel(header);
  const dataRows = rows.slice(1);

  if (format === "parent-based") return parseParentBased(dataRows, countLabel);
  if (format === "atc") return parseAtc(dataRows, countLabel);
  return parseSeparatorBased(dataRows, countLabel, options.levelSeparator ?? ".");
}

/* -------------------------------------------------------------------------- */
/* ATC (positional, variable-width)                                            */
/* -------------------------------------------------------------------------- */

/**
 * Parent of an ATC code at the given level.
 *
 *   level 1 → "N"        → ""
 *   level 2 → "N05"      → "N"      (strip 2)
 *   level 3 → "N05C"     → "N05"    (strip 1)
 *   level 4 → "N05CD"    → "N05C"   (strip 1)
 *   level 5 → "N05CD01"  → "N05CD"  (strip 2)
 */
function atcParent(code: string, level: number): string {
  if (level <= 1) return "";
  if (level === 5 || level === 2) return code.slice(0, -2);
  return code.slice(0, -1);
}

function parseAtc(rows: readonly string[][], countLabel: string): Ontology {
  const warnings: string[] = [];
  const subtrees = new Map<string, MutableSubtree>();

  for (const [idx, row] of rows.entries()) {
    // Schema: ATC code | Level | Label | Comment | Count | Color
    const code = (row[0] ?? "").trim();
    const levelStr = (row[1] ?? "").trim();
    const label = (row[2] ?? "").trim();
    const comment = (row[3] ?? "").trim();
    const countStr = row[4] ?? "";
    const colorStr = row[5] ?? "";

    if (!code || !levelStr) continue;

    const level = Number(levelStr);
    if (!Number.isFinite(level) || level < 1 || level > 5) {
      warnings.push(
        `Row ${idx + 2}: invalid ATC level "${levelStr}" for code "${code}".`,
      );
      continue;
    }
    const rootId = code[0]!;
    const parent = atcParent(code, level);

    const subtree = ensureSubtree(subtrees, rootId);
    const existing = subtree.nodes.get(code);
    if (existing && !existing.synthetic) {
      warnings.push(
        `Row ${idx + 2}: duplicate ATC code "${code}" — keeping the first occurrence.`,
      );
      continue;
    }
    subtree.nodes.set(code, {
      id: code,
      parent,
      label: label || code,
      description: "",
      comment,
      count: parseCount(countStr),
      color: parseColor(colorStr),
      level: level - 1, // expose 0-based level to match the other formats
      meshId: "",
      synthetic: false,
    });
    backfillAtcAncestors(subtree, code, level);
  }

  return freezeOntology(subtrees, "atc", countLabel, warnings);
}

function backfillAtcAncestors(
  subtree: MutableSubtree,
  code: string,
  level: number,
): void {
  let cursor = code;
  let cursorLevel = level;
  while (cursorLevel > 1) {
    const parent = atcParent(cursor, cursorLevel);
    if (!parent) break;
    const parentLevel = cursorLevel - 1;
    if (!subtree.nodes.has(parent)) {
      const grandparent = atcParent(parent, parentLevel);
      subtree.nodes.set(parent, {
        id: parent,
        parent: grandparent,
        label: "",
        description: "",
        comment: "",
        count: 0,
        color: DEFAULT_COLOR,
        level: parentLevel - 1,
        meshId: "",
        synthetic: true,
      });
    }
    cursor = parent;
    cursorLevel = parentLevel;
  }
}

/* -------------------------------------------------------------------------- */
/* Parent-based                                                                */
/* -------------------------------------------------------------------------- */

function parseParentBased(rows: readonly string[][], countLabel: string): Ontology {
  const warnings: string[] = [];
  // Single working map; we partition into subtrees in a second pass once all
  // rows are seen (parent may appear after child in the file).
  const allNodes = new Map<string, Node>();

  for (const [idx, row] of rows.entries()) {
    const [rawIds, parent = "", label = "", description = "", count = "", color = ""] =
      row;
    if (!rawIds || rawIds.trim() === "") continue;

    const ids = rawIds.split(ID_SEPARATOR);
    for (const id of ids) {
      const trimmed = id.trim();
      if (!trimmed) continue;
      if (allNodes.has(trimmed)) {
        warnings.push(
          `Row ${idx + 2}: duplicate id "${trimmed}" — keeping the first occurrence.`,
        );
        continue;
      }
      allNodes.set(trimmed, {
        id: trimmed,
        parent: parent.trim(),
        label: label.trim() || trimmed,
        description: description.trim(),
        comment: "",
        count: parseCount(count),
        color: parseColor(color),
        level: 0, // computed in the partitioning pass
        meshId: "",
        synthetic: false,
      });
    }
  }

  // Partition into subtrees rooted at nodes whose parent is missing or empty.
  const subtrees = new Map<string, MutableSubtree>();
  const rootIdByNode = new Map<string, string>();

  for (const node of allNodes.values()) {
    const rootId = findRootId(node.id, allNodes);
    rootIdByNode.set(node.id, rootId);
    if (!subtrees.has(rootId)) {
      subtrees.set(rootId, { rootId, nodes: new Map() });
    }
  }
  for (const node of allNodes.values()) {
    const rootId = rootIdByNode.get(node.id)!;
    const level = computeLevel(node.id, allNodes);
    subtrees.get(rootId)!.nodes.set(node.id, { ...node, level });
  }

  return freezeOntology(subtrees, "parent-based", countLabel, warnings);
}

function findRootId(id: string, nodes: Map<string, Node>): string {
  let cursor = id;
  const seen = new Set<string>();
  while (true) {
    if (seen.has(cursor)) return cursor; // cycle guard
    seen.add(cursor);
    const node = nodes.get(cursor);
    if (!node || !node.parent || !nodes.has(node.parent)) return cursor;
    cursor = node.parent;
  }
}

function computeLevel(id: string, nodes: Map<string, Node>): number {
  let level = 0;
  let cursor = id;
  const seen = new Set<string>();
  while (true) {
    if (seen.has(cursor)) return level;
    seen.add(cursor);
    const node = nodes.get(cursor);
    if (!node || !node.parent || !nodes.has(node.parent)) return level;
    cursor = node.parent;
    level += 1;
  }
}

/* -------------------------------------------------------------------------- */
/* Separator-based                                                             */
/* -------------------------------------------------------------------------- */

function parseSeparatorBased(
  rows: readonly string[][],
  countLabel: string,
  sep: string,
): Ontology {
  const warnings: string[] = [];
  const subtrees = new Map<string, MutableSubtree>();

  for (const [idx, row] of rows.entries()) {
    // Two known schemas for separator-based:
    //   ATC:  ATC code | Level | Label | Comment | Count | Color
    //   MeSH: MeSH ID  | Tree IDs | Name | Description | Comment | Count | Color
    // We detect by column count.
    const cols = row.map((c) => c ?? "");
    const isMeshShape = cols.length >= 7;

    let primaryIdField: string;
    let label: string;
    let description: string;
    let comment: string;
    let countStr: string;
    let colorStr: string;
    let meshId = "";

    if (isMeshShape) {
      primaryIdField = (cols[1] ?? "").trim(); // Tree IDs (the actual hierarchy)
      meshId = (cols[0] ?? "").trim();
      label = (cols[2] ?? "").trim();
      description = (cols[3] ?? "").trim();
      comment = (cols[4] ?? "").trim();
      countStr = cols[5] ?? "";
      colorStr = cols[6] ?? "";
    } else {
      // ATC-shape: id, level (ignored — we derive it), label, comment, count, color
      primaryIdField = (cols[0] ?? "").trim();
      label = (cols[2] ?? "").trim();
      description = ""; // ATC has no description column
      comment = (cols[3] ?? "").trim();
      countStr = cols[4] ?? "";
      colorStr = cols[5] ?? "";
    }

    if (!primaryIdField) continue;

    const ids = primaryIdField.split(ID_SEPARATOR);
    for (const rawId of ids) {
      const id = rawId.trim();
      if (!id) continue;
      const rootId = id.split(sep)[0]!;
      const level = countOccurrences(id, sep);
      const parent = level > 0 ? id.slice(0, id.lastIndexOf(sep)) : "";

      const subtree = ensureSubtree(subtrees, rootId);
      const existing = subtree.nodes.get(id);
      if (existing && !existing.synthetic) {
        warnings.push(
          `Row ${idx + 2}: duplicate id "${id}" — keeping the first occurrence.`,
        );
        continue;
      }
      const node: Node = {
        id,
        parent,
        label: label || id,
        description,
        comment,
        count: parseCount(countStr),
        color: parseColor(colorStr),
        level,
        meshId,
        synthetic: false,
      };
      // If a synthetic placeholder exists (created earlier when a descendant
      // was inserted), this real row supersedes it.
      subtree.nodes.set(id, node);
      backfillAncestors(subtree, id, sep);
    }
  }

  return freezeOntology(subtrees, "separator-based", countLabel, warnings);
}

function backfillAncestors(subtree: MutableSubtree, id: string, sep: string): void {
  let cursor = id;
  while (cursor.includes(sep)) {
    const parent = cursor.slice(0, cursor.lastIndexOf(sep));
    if (!parent) break;
    if (!subtree.nodes.has(parent)) {
      const parentLevel = countOccurrences(parent, sep);
      const grandparent =
        parentLevel > 0 ? parent.slice(0, parent.lastIndexOf(sep)) : "";
      subtree.nodes.set(parent, {
        id: parent,
        parent: grandparent,
        label: "N/A",
        description: "",
        comment: "",
        count: 0,
        color: DEFAULT_COLOR,
        level: parentLevel,
        meshId: "",
        synthetic: true,
      });
    }
    cursor = parent;
  }
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function ensureSubtree(
  map: Map<string, MutableSubtree>,
  rootId: string,
): MutableSubtree {
  let s = map.get(rootId);
  if (!s) {
    s = { rootId, nodes: new Map() };
    map.set(rootId, s);
  }
  return s;
}

function splitRows(text: string): string[][] {
  // Strip BOM, normalize line endings, drop trailing empty line.
  const cleaned = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const lines = cleaned.split("\n");
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.map((line) => line.split("\t"));
}

function parseCount(raw: string): number {
  if (raw == null) return 0;
  const trimmed = raw.toString().trim();
  if (!trimmed) return 0;
  // Match Python behavior: floats are rounded to ints.
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

function parseColor(raw: string): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  return trimmed;
}

function countOccurrences(s: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  let i = 0;
  while ((i = s.indexOf(needle, i)) !== -1) {
    n += 1;
    i += needle.length;
  }
  return n;
}

function freezeOntology(
  subtrees: Map<string, MutableSubtree>,
  format: OntologyFormat,
  countLabel: string,
  warnings: string[],
): Ontology {
  let nodeCount = 0;
  const frozen = new Map<string, Subtree>();
  for (const [rootId, mut] of subtrees) {
    nodeCount += mut.nodes.size;
    frozen.set(rootId, { rootId, nodes: mut.nodes });
  }
  return {
    format,
    countLabel,
    subtrees: frozen,
    nodeCount,
    warnings: Object.freeze([...warnings]),
  };
}

function emptyOntology(
  format: OntologyFormat,
  countLabel: string,
  warnings: string[],
): Ontology {
  return {
    format,
    countLabel,
    subtrees: new Map(),
    nodeCount: 0,
    warnings: Object.freeze([...warnings]),
  };
}
