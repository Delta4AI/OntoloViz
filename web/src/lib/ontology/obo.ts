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
}

/**
 * Hand-picked, broadly used ontologies. The .obo files are served by OBO
 * Foundry's `purl.obolibrary.org` and tend to be 5–50 MB — well within the
 * server's 50 MB cap.
 */
export const OBO_PRESETS: readonly OboPreset[] = [
  {
    id: "hp",
    name: "Human Phenotype Ontology (HPO)",
    description: "Phenotypic abnormalities encountered in human disease.",
    url: "https://purl.obolibrary.org/obo/hp.obo",
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
  },
  {
    id: "go",
    name: "Gene Ontology (GO)",
    description: "Molecular function, biological process, cellular component.",
    url: "https://purl.obolibrary.org/obo/go.obo",
  },
  {
    id: "chebi",
    name: "ChEBI",
    description: "Chemical entities of biological interest.",
    url: "https://purl.obolibrary.org/obo/chebi.obo",
  },
  {
    id: "uberon",
    name: "Uberon Anatomy",
    description: "Cross-species anatomical structures.",
    url: "https://purl.obolibrary.org/obo/uberon.obo",
  },
  {
    id: "cl",
    name: "Cell Ontology",
    description: "Canonical cell types across species.",
    url: "https://purl.obolibrary.org/obo/cl.obo",
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

/**
 * Fetch a remote .obo file via the backend proxy and return the parsed
 * Ontology. Throws on network / HTTP / decoding errors.
 */
export async function fetchObo(url: string, signal?: AbortSignal): Promise<Ontology> {
  const params = new URLSearchParams({ url });
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
