"""Generate parity fixtures for the V2 web app's TypeScript propagation engine.

For each shipped template TSV and each settings combination, this script:

1. Loads the file through src/ontoloviz/core.py (the Python reference).
2. Runs the same count-propagation step that core.py runs inside plot(),
   isolated so we can capture the final per-node counts without invoking
   Plotly figure construction.
3. Writes a JSON fixture under web/tests/fixtures/parity/.

The TypeScript test suite loads these fixtures and asserts byte-for-byte
equality with the output of its own pipeline (parseTsv → propagateCounts).

Run from the repo root:

    uv run python tests/parity/generate_fixtures.py

The script is intentionally hermetic: only stdlib + ontoloviz. No pytest.
"""

from __future__ import annotations

import copy
import json
import sys
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "src"))

from ontoloviz.core import ATCSunburst, MeSHSunburst  # noqa: E402

TEMPLATES_DIR = REPO_ROOT / "templates"
FIXTURES_DIR = REPO_ROOT / "web" / "tests" / "fixtures" / "parity"


# ---------------------------------------------------------------------------
# Count propagation — extracted verbatim from core.py so the parity contract
# is precise. If you tweak the algorithm in core.py, update both places
# (and regenerate fixtures).
# ---------------------------------------------------------------------------


def propagate_mesh_counts(plot_tree: dict, mode: str, level: int) -> None:
    """Bottom-up (level-descending) propagation for MeSH trees.

    NOTE: core.py:1532-1552 iterates in dict-insertion order, which only
    propagates one level per pass — a known limitation. The V2 TS port uses
    a deterministic bottom-up walk so that ancestor counts truly reflect
    every descendant. This harness mirrors the TS semantics so the parity
    contract validates the *intended* behavior, not the legacy iteration
    quirk. See web/src/lib/ontology/propagate.ts for details.
    """
    if mode == "off":
        return
    for v in plot_tree.values():
        for vv in sorted(v.values(), key=lambda x: x["level"], reverse=True):
            parent = v.get(vv["parent"])
            if parent is None:
                continue
            if mode == "level":
                if parent["level"] >= level:
                    parent["imported_counts"] += vv["imported_counts"]
            elif mode == "all":
                parent["imported_counts"] += vv["imported_counts"]


def propagate_atc_counts(plot_tree: dict, mode: str, level: int) -> None:
    """Bottom-up propagation for ATC trees, matching core.py:1900-1927
    (which already sorts by level descending).

    The level check in core.py reads `inner.level > threshold` on 1-based
    levels. The TS port uses 0-based levels and checks `parent.level >=
    threshold`; the equivalent translation is performed in `emit()` below.
    """
    for val in plot_tree.values():
        for inner_val in sorted(
            val.values(), key=lambda x: x["level"], reverse=True
        ):
            if inner_val["parent"] == "":
                continue
            parent = val[inner_val["parent"]]
            if mode == "level":
                if inner_val["level"] > level:
                    parent["imported_counts"] += inner_val["imported_counts"]
            elif mode == "all":
                parent["imported_counts"] += inner_val["imported_counts"]


# ---------------------------------------------------------------------------
# Loaders that capture each tree as a {root: {id: node}} dict and prime
# imported_counts the way core.py's plot() does.
# ---------------------------------------------------------------------------


def load_atc(path: Path) -> dict:
    s = ATCSunburst()
    s.populate_atc_from_tsv(str(path))
    tree = copy.deepcopy(s.atc_tree)
    for v in tree.values():
        for vv in v.values():
            vv["imported_counts"] = vv.get("counts", 0)
    return tree


def load_mesh(path: Path) -> dict:
    s = MeSHSunburst()
    s.populate_mesh_from_tsv(str(path))
    tree = copy.deepcopy(s.mesh_tree)
    for v in tree.values():
        for vv in v.values():
            vv["imported_counts"] = vv.get("counts", 0)
    return tree


# ---------------------------------------------------------------------------
# Fixture matrix
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Case:
    name: str
    template: Path
    kind: str  # "atc" or "mesh"
    mode: str  # "off" | "level" | "all"
    level: int
    enabled: bool


ATC_DATA = TEMPLATES_DIR / "atc_example_covid_drugs_experimental.tsv"
MESH_DATA = TEMPLATES_DIR / "mesh_example_pubmed_mapped.tsv"

CASES: tuple[Case, ...] = (
    # ATC — uses the COVID drugs example with real non-zero counts.
    Case("atc__off", ATC_DATA, "atc", "off", 0, True),
    Case("atc__all", ATC_DATA, "atc", "all", 0, True),
    Case("atc__level_3", ATC_DATA, "atc", "level", 3, True),
    Case("atc__level_4", ATC_DATA, "atc", "level", 4, True),
    Case("atc__disabled", ATC_DATA, "atc", "all", 0, False),
    # MeSH — uses the PubMed-mapped example with real non-zero counts.
    Case("mesh__off", MESH_DATA, "mesh", "off", 0, True),
    Case("mesh__all", MESH_DATA, "mesh", "all", 0, True),
    Case("mesh__level_3", MESH_DATA, "mesh", "level", 3, True),
    Case("mesh__level_5", MESH_DATA, "mesh", "level", 5, True),
    Case("mesh__disabled", MESH_DATA, "mesh", "all", 0, False),
)


def to_atc_zero_based(tree: dict) -> dict:
    """Translate core.py's 1-based ATC levels to the 0-based level used by
    the TS port. The TS port's level field is `python_level - 1`."""
    out: dict[str, dict] = {}
    for root, sub in tree.items():
        out[root] = {}
        for k, v in sub.items():
            out[root][k] = {**v, "level": v["level"] - 1}
    return out


def serialize(
    case: Case, tree: dict, ts_level: int, ts_mode: str
) -> dict:
    """Render a tree to the compact JSON shape the TS tests consume."""
    subtrees: dict[str, dict[str, int]] = {}
    for root, sub in tree.items():
        subtrees[root] = {
            node_id: int(round(node["imported_counts"]))
            for node_id, node in sub.items()
        }
    return {
        "case": case.name,
        "kind": case.kind,
        "settings": {
            "enabled": case.enabled,
            "countMode": ts_mode,
            "level": ts_level,
        },
        "subtrees": subtrees,
    }


def emit(case: Case) -> None:
    if case.kind == "atc":
        py_tree = load_atc(case.template)
        if case.enabled:
            # ATC: core.py uses `inner.level > level`, ie. propagate when the
            # *child*'s 1-based level exceeds the threshold. The TS port uses
            # a parent-side check on 0-based levels; the equivalent threshold
            # is `level - 1` (because child.python_level > T  ⇔
            # child.ts_level >= T  ⇔  parent.ts_level >= T - 1).
            propagate_atc_counts(py_tree, case.mode, case.level)
        ts_tree = to_atc_zero_based(py_tree)
        ts_level = max(case.level - 1, 0)
    else:
        py_tree = load_mesh(case.template)
        if case.enabled:
            propagate_mesh_counts(py_tree, case.mode, case.level)
        ts_tree = py_tree
        ts_level = case.level

    payload = serialize(case, ts_tree, ts_level=ts_level, ts_mode=case.mode)
    out_path = FIXTURES_DIR / f"{case.name}.json"
    out_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    print(f"wrote {out_path.relative_to(REPO_ROOT)}")


def main(argv: Iterable[str]) -> int:
    _ = list(argv)
    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    for case in CASES:
        emit(case)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
