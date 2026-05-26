/**
 * OBO Foundry fetch + shape conversion.
 *
 * The backend `/api/obo/fetch` and `/api/obo/parse` endpoints return an
 * Ontology JSON whose subtrees and nodes are plain objects. The frontend
 * data model uses `Map` for O(1) lookup, so we convert on the boundary.
 */

import { DEFAULT_COLOR, type Node, type Ontology, type Subtree } from "./types";

/** A curated OBO Foundry shortcut. URL points at the canonical .obo file. */
export interface OboPreset {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly url: string;
  /**
   * Optional subtree-root override. When set, direct children of this term
   * become subtree roots (matches the desktop GUI's per-ontology default,
   * e.g. HPO → `HP:0000118` "Phenotypic abnormality"). Without it, the
   * parser uses structural roots — for HPO that's the single `HP:0000001`
   * "All", which collapses the visualization into one giant sunburst.
   */
  readonly rootId?: string;
  /** Drop subtrees with fewer nodes than this threshold. */
  readonly minNodeSize?: number;
}

/**
 * Hand-picked, broadly used ontologies. The .obo files are served by OBO
 * Foundry's `purl.obolibrary.org` and tend to be 5–50 MB — well within the
 * server's 50 MB cap. The `rootId` / `minNodeSize` defaults mirror
 * `src/ontoloviz/obo_utils.py::get_remote_ontology` in the desktop GUI.
 */
export const OBO_PRESETS: readonly OboPreset[] = [
  {
    id: "hp",
    name: "Human Phenotype Ontology (HPO)",
    description: "Phenotypic abnormalities encountered in human disease.",
    url: "https://purl.obolibrary.org/obo/hp.obo",
    rootId: "HP:0000118",
  },
  {
    id: "mondo",
    name: "Mondo Disease Ontology",
    description: "Unified, harmonized disease ontology across sources.",
    url: "https://purl.obolibrary.org/obo/mondo.obo",
  },
  {
    id: "doid",
    name: "Disease Ontology",
    description: "Human disease classification with stable identifiers.",
    url: "https://purl.obolibrary.org/obo/doid.obo",
    rootId: "DOID:4",
  },
  {
    id: "go",
    name: "Gene Ontology (GO)",
    description: "Molecular function, biological process, cellular component.",
    url: "https://purl.obolibrary.org/obo/go.obo",
    minNodeSize: 2,
  },
  {
    id: "chebi",
    name: "ChEBI",
    description: "Chemical entities of biological interest.",
    // chebi_lite strips structures/formulas/charge (~50 MB vs ~260 MB for
    // the full release). Mirrors the desktop GUI's ChEBI source.
    url: "https://purl.obolibrary.org/obo/chebi/chebi_lite.obo",
    rootId: "CHEBI:23367",
  },
  {
    id: "uberon",
    name: "Uberon Anatomy",
    description: "Cross-species anatomical structures.",
    url: "https://purl.obolibrary.org/obo/uberon.obo",
    rootId: "UBERON:0000061",
    minNodeSize: 2,
  },
  {
    id: "cl",
    name: "Cell Ontology",
    description: "Canonical cell types across species.",
    url: "https://purl.obolibrary.org/obo/cl.obo",
    minNodeSize: 2,
  },
];

/** Wire shape from the backend (mirrors `OntologyNode` pydantic schema). */
interface WireNode {
  readonly id: string;
  readonly parent?: string;
  readonly label?: string;
  readonly description?: string;
  readonly comment?: string;
  readonly count?: number;
  readonly color?: string;
  readonly level: number;
  readonly meshId?: string;
  readonly synthetic?: boolean;
}

interface WireSubtree {
  readonly rootId: string;
  readonly nodes: Record<string, WireNode>;
}

interface WireOntology {
  readonly format: string;
  readonly countLabel?: string;
  readonly subtrees: Record<string, WireSubtree>;
  readonly nodeCount: number;
  readonly warnings?: readonly string[];
}

function toNode(w: WireNode): Node {
  return {
    id: w.id,
    parent: w.parent ?? "",
    label: w.label ?? w.id,
    description: w.description ?? "",
    comment: w.comment ?? "",
    count: typeof w.count === "number" ? Math.round(w.count) : 0,
    color: w.color || DEFAULT_COLOR,
    level: w.level,
    meshId: w.meshId ?? "",
    synthetic: Boolean(w.synthetic),
  };
}

function toOntology(wire: WireOntology): Ontology {
  const subtrees = new Map<string, Subtree>();
  for (const [rootId, ws] of Object.entries(wire.subtrees)) {
    const nodes = new Map<string, Node>();
    for (const [nid, wn] of Object.entries(ws.nodes)) {
      nodes.set(nid, toNode(wn));
    }
    subtrees.set(rootId, { rootId: ws.rootId, nodes });
  }
  return {
    format: (wire.format as Ontology["format"]) ?? "parent-based",
    countLabel: wire.countLabel ?? "Counts",
    subtrees,
    nodeCount: wire.nodeCount,
    warnings: Object.freeze([...(wire.warnings ?? [])]),
  };
}

/** Optional per-ontology parsing overrides (see `OboPreset`). */
export interface FetchOboOptions {
  readonly rootId?: string;
  readonly minNodeSize?: number;
  readonly signal?: AbortSignal;
}

/**
 * Fetch a remote .obo file via the backend proxy and return the parsed
 * Ontology. Throws on network / HTTP / decoding errors.
 */
export async function fetchObo(
  url: string,
  options: FetchOboOptions = {},
): Promise<Ontology> {
  const { rootId, minNodeSize, signal } = options;
  const params = new URLSearchParams({ url });
  if (rootId) params.set("rootId", rootId);
  if (typeof minNodeSize === "number") {
    params.set("minNodeSize", String(minNodeSize));
  }
  const res = await fetch(
    `/api/obo/fetch?${params.toString()}`,
    signal ? { signal } : {},
  );
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // empty/invalid JSON body — fall back to the status code.
    }
    throw new Error(detail);
  }
  const wire = (await res.json()) as WireOntology;
  return toOntology(wire);
}
