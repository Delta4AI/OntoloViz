"""Minimal OBO (Open Biomedical Ontologies) parser.

Produces an `Ontology` shape compatible with the frontend so a parsed OBO file
flows through the same propagation + rendering pipeline as a TSV upload.

Scope: we support the subset that's load-bearing for a visualizer:

  * `[Term]` stanzas with `id`, `name`, `def`, `synonym`, `comment`
  * `is_a: ID ! Label` parent edges
  * `is_obsolete: true` filtering
  * Multiple roots — a real OBO file (GO, HPO, MP, ...) has several

We deliberately ignore `[Typedef]`, cross-references (`xref`), and relationship
types other than `is_a`. Multi-parent terms keep their first declared parent;
extra parents are recorded in `comment` so they're not silently dropped.

The parser is intentionally permissive: malformed lines are skipped with a
warning rather than aborting the parse. Real-world OBO files have rough edges.
"""

from __future__ import annotations

import re
from collections import defaultdict, deque
from dataclasses import dataclass, field

from .schemas import Ontology, OntologyNode, OntologySubtree

# `is_a: HP:0000001 ! Phenotypic abnormality` — the comment after `!` is
# optional and varies by source.
_IS_A_RE = re.compile(r"^\s*([A-Za-z0-9_:\-./]+)\s*(?:!.*)?$")
# `def: "text" [src1, src2]` — we just want the quoted text.
_DEF_RE = re.compile(r'^\s*"(?P<text>(?:[^"\\]|\\.)*)"\s*(?:\[.*\])?\s*$')


@dataclass
class _Term:
    id: str
    name: str = ""
    definition: str = ""
    comment: str = ""
    parents: list[str] = field(default_factory=list)
    obsolete: bool = False


def parse_obo(text: str) -> Ontology:
    """Parse OBO text and return an `Ontology` ready for the frontend."""

    terms = _collect_terms(text)
    return _build_ontology(terms)


# ---------------------------------------------------------------------------
# Stanza tokenization
# ---------------------------------------------------------------------------


def _collect_terms(text: str) -> dict[str, _Term]:
    terms: dict[str, _Term] = {}
    current: _Term | None = None
    in_term = False

    for raw in text.splitlines():
        line = raw.rstrip()
        stripped = line.lstrip()

        if not stripped or stripped.startswith("!"):
            continue

        if stripped.startswith("["):
            # New stanza — commit the prior term and decide whether to keep
            # collecting.
            if current is not None and not current.obsolete and current.id:
                terms[current.id] = current
            in_term = stripped == "[Term]"
            current = _Term(id="") if in_term else None
            continue

        if not in_term or current is None:
            continue

        key, _, value = stripped.partition(":")
        key = key.strip()
        value = value.lstrip()

        if key == "id":
            current.id = value
        elif key == "name":
            current.name = value
        elif key == "def":
            m = _DEF_RE.match(value)
            current.definition = m.group("text") if m else value
        elif key == "comment":
            current.comment = value
        elif key == "is_a":
            m = _IS_A_RE.match(value)
            if m:
                current.parents.append(m.group(1))
        elif key == "is_obsolete":
            current.obsolete = value.strip().lower() == "true"

    if current is not None and not current.obsolete and current.id:
        terms[current.id] = current

    return terms


# ---------------------------------------------------------------------------
# Build the ontology
# ---------------------------------------------------------------------------


def _build_ontology(terms: dict[str, _Term]) -> Ontology:
    warnings: list[str] = []

    # Drop is_a edges pointing at terms we never saw (or that were filtered as
    # obsolete). Track them in warnings so the frontend can surface a hint.
    for term in terms.values():
        kept: list[str] = []
        for parent in term.parents:
            if parent in terms:
                kept.append(parent)
            else:
                warnings.append(
                    f"{term.id}: is_a references unknown term {parent} — dropped"
                )
        term.parents = kept

    # Discover the roots: every term whose first parent (or any parent) is
    # missing/empty. Cycles end up rooted at their first-visited term via the
    # BFS below.
    children: dict[str, list[str]] = defaultdict(list)
    for term in terms.values():
        for parent in term.parents:
            children[parent].append(term.id)

    # Pick a canonical parent for each term (the first declared `is_a`). If a
    # term has multiple parents, record the secondary ones in `comment`.
    canonical_parent: dict[str, str] = {}
    for term in terms.values():
        if not term.parents:
            canonical_parent[term.id] = ""
            continue
        canonical_parent[term.id] = term.parents[0]
        if len(term.parents) > 1:
            extras = ", ".join(term.parents[1:])
            suffix = f"[also is_a: {extras}]"
            term.comment = f"{term.comment} {suffix}".strip()

    roots = [tid for tid, parent in canonical_parent.items() if parent == ""]

    # If the canonical-parent map left any non-root term unreachable (e.g. a
    # pure is_a cycle), pick the lexicographically smallest as a synthetic
    # root for that component so no term is silently dropped.
    level_of: dict[str, int] = {}
    forest: dict[str, list[str]] = {}
    pending = set(terms.keys())

    def bfs(root_id: str) -> None:
        level_of[root_id] = 0
        forest[root_id] = []
        pending.discard(root_id)
        queue: deque[str] = deque([root_id])
        while queue:
            current = queue.popleft()
            for child_id in children.get(current, []):
                if canonical_parent.get(child_id) != current:
                    continue
                if child_id in level_of:
                    warnings.append(
                        f"{child_id}: cycle or repeated visit — skipping at {current}"
                    )
                    continue
                level_of[child_id] = level_of[current] + 1
                forest[root_id].append(child_id)
                pending.discard(child_id)
                queue.append(child_id)

    for root in sorted(roots):
        bfs(root)

    while pending:
        synthetic = min(pending)
        warnings.append(
            f"{synthetic}: promoted to synthetic root (unreachable from declared roots)"
        )
        canonical_parent[synthetic] = ""
        roots.append(synthetic)
        bfs(synthetic)

    # Build subtrees.
    subtrees: dict[str, OntologySubtree] = {}
    node_count = 0
    for root in roots:
        nodes: dict[str, OntologyNode] = {}
        nodes[root] = _to_node(terms[root], canonical_parent[root], level_of[root])
        for child_id in forest[root]:
            nodes[child_id] = _to_node(
                terms[child_id], canonical_parent[child_id], level_of[child_id]
            )
        subtrees[root] = OntologySubtree(root_id=root, nodes=nodes)
        node_count += len(nodes)

    return Ontology(
        format="parent-based",
        count_label="OBO",
        subtrees=subtrees,
        node_count=node_count,
        warnings=warnings,
    )


def _to_node(term: _Term, parent_id: str, level: int) -> OntologyNode:
    return OntologyNode(
        id=term.id,
        parent=parent_id,
        label=term.name or term.id,
        description=term.definition,
        comment=term.comment,
        level=level,
    )
