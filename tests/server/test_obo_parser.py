"""Unit tests for the OBO parser.

The parser produces the same Ontology shape the frontend uses. These tests
exercise the parser directly (no HTTP) so failures point at the parser, not
the transport layer.
"""

from __future__ import annotations

from ontoloviz_server.obo_parser import parse_obo

SIMPLE_OBO = """format-version: 1.4
ontology: test

[Term]
id: T:0000001
name: Root
def: "Root term." [src]

[Term]
id: T:0000002
name: Child A
def: "First child." [src]
is_a: T:0000001 ! Root

[Term]
id: T:0000003
name: Grandchild
is_a: T:0000002 ! Child A

[Term]
id: T:0000004
name: Child B
is_a: T:0000001 ! Root
"""


def test_simple_obo_builds_single_subtree() -> None:
    ont = parse_obo(SIMPLE_OBO)
    assert ont.format == "parent-based"
    assert ont.node_count == 4
    assert list(ont.subtrees.keys()) == ["T:0000001"]
    root = ont.subtrees["T:0000001"]
    assert root.root_id == "T:0000001"
    assert set(root.nodes.keys()) == {
        "T:0000001",
        "T:0000002",
        "T:0000003",
        "T:0000004",
    }


def test_levels_are_bfs_distance_from_root() -> None:
    ont = parse_obo(SIMPLE_OBO)
    nodes = ont.subtrees["T:0000001"].nodes
    assert nodes["T:0000001"].level == 0
    assert nodes["T:0000002"].level == 1
    assert nodes["T:0000004"].level == 1
    assert nodes["T:0000003"].level == 2


def test_obsolete_terms_are_dropped() -> None:
    obo = """[Term]
id: T:1
name: Live

[Term]
id: T:2
name: Dead
is_a: T:1
is_obsolete: true
"""
    ont = parse_obo(obo)
    assert ont.node_count == 1
    assert "T:2" not in ont.subtrees["T:1"].nodes


def test_unknown_parent_recorded_as_warning() -> None:
    obo = """[Term]
id: T:1
name: A
is_a: T:missing
"""
    ont = parse_obo(obo)
    # T:1 becomes a root because its only is_a pointed at a missing term.
    assert "T:1" in ont.subtrees
    assert ont.subtrees["T:1"].nodes["T:1"].level == 0
    assert any("T:missing" in w for w in ont.warnings)


def test_definition_strips_xref_brackets() -> None:
    obo = """[Term]
id: T:1
name: A
def: "Quoted definition." [provenance:1, provenance:2]
"""
    ont = parse_obo(obo)
    node = ont.subtrees["T:1"].nodes["T:1"]
    assert node.description == "Quoted definition."


def test_multi_parent_recorded_in_comment() -> None:
    obo = """[Term]
id: T:1
name: Root1

[Term]
id: T:2
name: Root2

[Term]
id: T:3
name: Multi
is_a: T:1
is_a: T:2
"""
    ont = parse_obo(obo)
    # The first declared parent wins for the canonical placement.
    assert "T:3" in ont.subtrees["T:1"].nodes
    assert "T:3" not in ont.subtrees["T:2"].nodes
    comment = ont.subtrees["T:1"].nodes["T:3"].comment
    assert "T:2" in comment


def test_cycle_breaks_at_revisit() -> None:
    obo = """[Term]
id: T:1
name: A
is_a: T:2

[Term]
id: T:2
name: B
is_a: T:1
"""
    ont = parse_obo(obo)
    # One canonical parent each → exactly one root, the other lives below it.
    assert ont.node_count == 2
    total_subtree_nodes = sum(len(s.nodes) for s in ont.subtrees.values())
    assert total_subtree_nodes == 2


def test_empty_obo_yields_empty_ontology() -> None:
    ont = parse_obo("format-version: 1.4\n")
    assert ont.node_count == 0
    assert ont.subtrees == {}


# ---------------------------------------------------------------------------
# root_id override — desktop GUI parity (HPO → HP:0000118, etc.)
# ---------------------------------------------------------------------------

# Mini HPO-shaped fixture: HP:0000001 (All) → HP:0000118 (Phenotypic
# abnormality) → two system branches (eye, nervous). HP:0000005 (Mode of
# inheritance) is also a child of HP:0000001 but outside the phenotype branch.
HPO_LIKE = """[Term]
id: HP:0000001
name: All

[Term]
id: HP:0000118
name: Phenotypic abnormality
is_a: HP:0000001

[Term]
id: HP:0000478
name: Abnormality of the eye
is_a: HP:0000118

[Term]
id: HP:0000479
name: Abnormality of the retina
is_a: HP:0000478

[Term]
id: HP:0000707
name: Abnormality of the nervous system
is_a: HP:0000118

[Term]
id: HP:0000005
name: Mode of inheritance
is_a: HP:0000001
"""


def test_root_id_splits_into_per_child_subtrees() -> None:
    ont = parse_obo(HPO_LIKE, root_id="HP:0000118")
    # Two phenotype-system children become independent subtree roots.
    assert set(ont.subtrees.keys()) == {"HP:0000478", "HP:0000707"}
    # Each subtree's root is at level 0 with no parent.
    eye = ont.subtrees["HP:0000478"]
    assert eye.nodes["HP:0000478"].level == 0
    assert eye.nodes["HP:0000478"].parent == ""
    # The descendant inherits level 1.
    assert eye.nodes["HP:0000479"].level == 1
    assert eye.nodes["HP:0000479"].parent == "HP:0000478"
    # HP:0000118 (the override) and HP:0000005 (outside the phenotype branch)
    # are excluded — node_count covers only descendants of HP:0000118.
    all_ids = {nid for s in ont.subtrees.values() for nid in s.nodes}
    assert "HP:0000118" not in all_ids
    assert "HP:0000005" not in all_ids
    assert "HP:0000001" not in all_ids


def test_root_id_falls_back_when_term_missing() -> None:
    ont = parse_obo(HPO_LIKE, root_id="HP:9999999")
    # Falls back to natural-root behaviour with a warning.
    assert "HP:0000001" in ont.subtrees
    assert any("HP:9999999" in w for w in ont.warnings)


def test_min_node_size_drops_small_subtrees() -> None:
    # Without min_node_size: two subtrees (eye=2 nodes, nervous=1 node).
    full = parse_obo(HPO_LIKE, root_id="HP:0000118")
    assert set(full.subtrees.keys()) == {"HP:0000478", "HP:0000707"}
    # With min_node_size=2: nervous-system (single node) is dropped.
    trimmed = parse_obo(HPO_LIKE, root_id="HP:0000118", min_node_size=2)
    assert set(trimmed.subtrees.keys()) == {"HP:0000478"}
    assert trimmed.node_count == 2
