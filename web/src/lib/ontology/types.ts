/**
 * Immutable data model for ontology trees.
 *
 * Mirrors the Leaf/Branch shape from src/ontoloviz/core.py so the upcoming
 * propagation engine can be parity-tested against the Python reference
 * implementation.
 */

export type OntologyFormat = "parent-based" | "separator-based" | "atc";

/** A single node in an ontology tree. Always immutable. */
export interface Node {
  /** Canonical identifier — for separator-based trees this is the full path. */
  readonly id: string;
  /** Parent id, or empty string for roots. */
  readonly parent: string;
  /** Display label. */
  readonly label: string;
  /** Long-form description shown in tooltip. */
  readonly description: string;
  /** Optional free-text comment (MeSH-style). */
  readonly comment: string;
  /** Raw count from the source file (before propagation). */
  readonly count: number;
  /** Hex color (`#RRGGBB` or `#RRGGBBAA`); empty string = no override. */
  readonly color: string;
  /** Depth from the subtree root. 0 = subtree root. */
  readonly level: number;
  /** Original mesh id for separator-based MeSH trees; empty otherwise. */
  readonly meshId: string;
  /** True if this node was synthesized to fill a gap in the parent chain. */
  readonly synthetic: boolean;
}

/**
 * A connected subtree. Keyed by node id for O(1) lookup. The root is the
 * node whose parent is the empty string (or whose parent is not in this map).
 */
export interface Subtree {
  readonly rootId: string;
  readonly nodes: ReadonlyMap<string, Node>;
}

/**
 * A parsed ontology file. One file can contain many subtrees (e.g. MeSH
 * has 16 top-level categories: A–N, V, Z).
 */
export interface Ontology {
  readonly format: OntologyFormat;
  /** Column header used for the count column, e.g. `Counts [Template Drug]`. */
  readonly countLabel: string;
  /** Subtrees keyed by their root id. */
  readonly subtrees: ReadonlyMap<string, Subtree>;
  /** Total number of nodes across all subtrees (incl. synthesized parents). */
  readonly nodeCount: number;
  /** Warnings collected during parsing — surface, don't throw. */
  readonly warnings: readonly string[];
}

/** Default color when a row leaves the Color cell empty. */
export const DEFAULT_COLOR = "#FFFFFF";

/** Sentinel used by the Python reference for "absent" counts. */
export const FAKE_COUNT_ZERO = 0.000001337;
