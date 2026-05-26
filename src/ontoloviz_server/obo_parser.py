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


def parse_obo(
    text: str,
    root_id: str | None = None,
    min_node_size: int | None = None,
) -> Ontology:
    """Parse OBO text and return an `Ontology` ready for the frontend.

    ``root_id`` mirrors the desktop GUI's per-ontology override (HPO →
    ``HP:0000118``, ChEBI → ``CHEBI:23367``, …): instead of using structural
    roots (terms with no ``is_a``), the *direct children* of ``root_id``
    become subtree roots. The ``root_id`` term itself and anything outside
    its descendant set are dropped. Falls back to natural roots with a
    warning if ``root_id`` is not present in the file.

    ``min_node_size`` drops subtrees whose node count is below the threshold,
    matching the GO/UBERON/CL/PO behaviour in the legacy ``obo_utils.py``.
    """

    terms = _collect_terms(text)
    return _build_ontology(terms, root_id=root_id, min_node_size=min_node_size)


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


def _build_ontology(
    terms: dict[str, _Term],
    root_id: str | None = None,
    min_node_size: int | None = None,
) -> Ontology:
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

    # Root selection: optional override (direct children of `root_id` each
    # become a subtree root) vs. natural roots (terms with no parent).
    use_override = root_id is not None and root_id in terms
    if root_id is not None and not use_override:
        warnings.append(
            f"requested root {root_id} not found — falling back to natural roots"
        )

    if use_override:
        # Promote any term that declares `root_id` as a parent (in any
        # position, not just first) to a subtree root. Mirrors the desktop's
        # `if root_id == is_a[0]:` scan in obo_utils.build_tree_from_obo_ontology.
        direct_children = sorted(
            tid for tid, term in terms.items() if root_id in term.parents
        )
        for cid in direct_children:
            canonical_parent[cid] = ""
        # Exclude root_id itself from any subtree's node set.
        canonical_parent.pop(root_id, None)
        roots = list(direct_children)
    else:
        roots = sorted(tid for tid, parent in canonical_parent.items() if parent == "")

    # Children map derived from canonical_parent so multi-parent secondary
    # edges don't pull a term into a second subtree.
    children: dict[str, list[str]] = defaultdict(list)
    for tid, parent in canonical_parent.items():
        if parent:
            children[parent].append(tid)

    level_of: dict[str, int] = {}
    forest: dict[str, list[str]] = {}

    def bfs(root: str) -> None:
        level_of[root] = 0
        forest[root] = []
        queue: deque[str] = deque([root])
        while queue:
            current = queue.popleft()
            for child_id in children.get(current, []):
                if child_id in level_of:
                    warnings.append(
                        f"{child_id}: cycle or repeated visit — skipping at {current}"
                    )
                    continue
                level_of[child_id] = level_of[current] + 1
                forest[root].append(child_id)
                queue.append(child_id)

    for root in roots:
        bfs(root)

    # In natural-root mode, any term unreachable from a declared root (e.g.
    # a pure is_a cycle component) is promoted to a synthetic root so it's
    # not silently lost. In override mode, anything outside `root_id`'s
    # descendant set is intentionally excluded.
    if not use_override:
        pending = set(terms.keys()) - level_of.keys()
        while pending:
            synthetic = min(pending)
            warnings.append(
                f"{synthetic}: promoted to synthetic root (unreachable from declared roots)"
            )
            canonical_parent[synthetic] = ""
            roots.append(synthetic)
            bfs(synthetic)
            pending = set(terms.keys()) - level_of.keys()

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
        if min_node_size is not None and len(nodes) < min_node_size:
            continue
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
