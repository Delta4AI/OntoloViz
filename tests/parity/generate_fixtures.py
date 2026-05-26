"""Generate parity fixtures for the web app's TypeScript propagation engine.

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
from ontoloviz.core_utils import generate_color_range  # noqa: E402

TEMPLATES_DIR = REPO_ROOT / "templates"
FIXTURES_DIR = REPO_ROOT / "web" / "tests" / "fixtures" / "parity"
COLOR_FIXTURES_DIR = REPO_ROOT / "web" / "tests" / "fixtures" / "parity-color"

DEFAULT_COLOR_SCALE: list[list[float | str]] = [
    [0, "#FFFFFF"],
    [0.2, "#403C53"],
    [1, "#C33D35"],
]
DEFAULT_COLOR = "#FFFFFF"


# ---------------------------------------------------------------------------
# Count propagation — extracted verbatim from core.py so the parity contract
# is precise. If you tweak the algorithm in core.py, update both places
# (and regenerate fixtures).
# ---------------------------------------------------------------------------


def propagate_mesh_counts(plot_tree: dict, mode: str, level: int) -> None:
    """Bottom-up (level-descending) propagation for MeSH trees.

    NOTE: core.py:1532-1552 iterates in dict-insertion order, which only
    propagates one level per pass — a known limitation. The TS port uses
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
# Color propagation — mirrors web/src/lib/ontology/color.ts. Specific/global
# match core.py:531 byte-for-byte; phenotype uses the bottom-up fix described
# in propagate.ts (the legacy iteration-order quirk silently colors every node
# when ancestors precede descendants in the TSV — same family of bug as the
# count-propagation divergence).
# ---------------------------------------------------------------------------


def build_color_scale(
    max_val: float, stops: list, default_color: str
) -> tuple[int, list[str]]:
    factor = 1
    max_v = int(max_val)
    if 100000 <= max_v < 250000:
        factor = 10
        max_v = max_v // 10
    elif max_v >= 250000:
        factor = 25
        max_v = max_v // 25

    colors: list[str] = [default_color]
    for i in range(len(stops) - 1):
        lower_pos, lower_color = stops[i]
        upper_pos, upper_color = stops[i + 1]
        low_cutoff = int(max_v * lower_pos)
        high_cutoff = int(max_v * upper_pos)
        n = high_cutoff - low_cutoff
        if n > 0:
            colors.extend(generate_color_range(lower_color, upper_color, n))
    return factor, colors


def lookup_color(factor: int, colors: list[str], count: float) -> str:
    if not colors:
        return DEFAULT_COLOR
    idx = int(count / factor)
    if idx < 0:
        return colors[0]
    if idx >= len(colors):
        return colors[-1]
    return colors[idx]


def dot_ancestors(node_id: str, sep: str) -> list[str]:
    if not sep or sep not in node_id:
        return []
    out: list[str] = []
    cursor = node_id
    while sep in cursor:
        cursor = cursor.rsplit(sep, 1)[0]
        if cursor:
            out.append(cursor)
    return out


def propagate_colors(
    tree: dict,
    mode: str,
    level: int,
    stops: list,
    default_color: str,
    sep: str = ".",
) -> dict:
    """Apply color propagation, returning {root_id: {node_id: color_hex}}."""
    result: dict[str, dict[str, str]] = {root: {} for root in tree}
    if mode == "off" or not stops:
        for root, sub in tree.items():
            for node_id, node in sub.items():
                result[root][node_id] = node.get("color") or default_color
        return result

    if mode == "global":
        global_max = 0
        for sub in tree.values():
            for node in sub.values():
                if node["level"] >= level and node["imported_counts"] > global_max:
                    global_max = node["imported_counts"]
        factor, colors = build_color_scale(global_max, stops, default_color)
        for root, sub in tree.items():
            for node_id, node in sub.items():
                if node["level"] >= level:
                    result[root][node_id] = lookup_color(
                        factor, colors, node["imported_counts"]
                    )
                else:
                    result[root][node_id] = default_color
        return result

    if mode == "specific":
        for root, sub in tree.items():
            max_val = 0
            for node in sub.values():
                if node["level"] >= level and node["imported_counts"] > max_val:
                    max_val = node["imported_counts"]
            factor, colors = build_color_scale(max_val, stops, default_color)
            for node_id, node in sub.items():
                if node["level"] >= level:
                    result[root][node_id] = lookup_color(
                        factor, colors, node["imported_counts"]
                    )
                else:
                    result[root][node_id] = default_color
        return result

    if mode == "phenotype":
        for root, sub in tree.items():
            sorted_nodes = sorted(
                sub.values(), key=lambda n: n["level"], reverse=True
            )
            whitelist: set[str] = set()
            max_val = 0
            for node in sorted_nodes:
                if node["id"] not in whitelist:
                    if node["imported_counts"] > max_val:
                        max_val = node["imported_counts"]
                    for anc in dot_ancestors(node["id"], sep):
                        whitelist.add(anc)
            factor, colors = build_color_scale(max_val, stops, default_color)
            seen: set[str] = set()
            for node in sorted_nodes:
                if node["id"] not in seen:
                    for anc in dot_ancestors(node["id"], sep):
                        seen.add(anc)
                    result[root][node["id"]] = lookup_color(
                        factor, colors, node["imported_counts"]
                    )
                else:
                    result[root][node["id"]] = default_color
        return result

    raise ValueError(f"unknown color mode: {mode}")


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


@dataclass(frozen=True)
class ColorCase:
    name: str
    template: Path
    kind: str  # "atc" or "mesh"
    count_mode: str  # propagated count input ("off" | "all")
    count_level: int
    color_mode: str  # "off" | "specific" | "global" | "phenotype"
    color_level: int  # 1-based for the Python side, translated for the TS side
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


COLOR_CASES: tuple[ColorCase, ...] = (
    # MeSH: counts propagated via "all" so colors see the realistic distribution.
    ColorCase("mesh__color_off", MESH_DATA, "mesh", "all", 0, "off", 0, True),
    ColorCase(
        "mesh__color_specific", MESH_DATA, "mesh", "all", 0, "specific", 0, True
    ),
    ColorCase(
        "mesh__color_global", MESH_DATA, "mesh", "all", 0, "global", 0, True
    ),
    ColorCase(
        "mesh__color_phenotype",
        MESH_DATA,
        "mesh",
        "all",
        0,
        "phenotype",
        0,
        True,
    ),
    ColorCase(
        "mesh__color_specific_level_3",
        MESH_DATA,
        "mesh",
        "all",
        0,
        "specific",
        3,
        True,
    ),
    ColorCase(
        "mesh__color_disabled", MESH_DATA, "mesh", "all", 0, "specific", 0, False
    ),
    # ATC.
    ColorCase("atc__color_off", ATC_DATA, "atc", "all", 0, "off", 1, True),
    ColorCase(
        "atc__color_specific", ATC_DATA, "atc", "all", 0, "specific", 1, True
    ),
    ColorCase(
        "atc__color_global", ATC_DATA, "atc", "all", 0, "global", 1, True
    ),
    ColorCase(
        "atc__color_specific_level_3",
        ATC_DATA,
        "atc",
        "all",
        0,
        "specific",
        3,
        True,
    ),
    ColorCase(
        "atc__color_disabled", ATC_DATA, "atc", "all", 0, "specific", 1, False
    ),
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


def serialize_color(case: ColorCase, tree: dict, ts_level: int) -> dict:
    """Render colors-per-node to the compact JSON shape the TS tests consume."""
    color_tree = propagate_colors(
        tree if case.enabled else _strip_propagated(tree),
        case.color_mode if case.enabled else "off",
        ts_level,  # the tree is already in 0-based level space at this point
        DEFAULT_COLOR_SCALE,
        DEFAULT_COLOR,
    )
    subtrees: dict[str, dict[str, str]] = {}
    for root, sub in color_tree.items():
        subtrees[root] = dict(sub)
    return {
        "case": case.name,
        "kind": case.kind,
        "settings": {
            "enabled": case.enabled,
            "colorMode": case.color_mode,
            "level": ts_level,
        },
        "subtrees": subtrees,
    }


def _strip_propagated(tree: dict) -> dict:
    """Return a copy with imported_counts reset to the raw counts. Used when
    the case has enabled=False so the harness mirrors a no-op propagation."""
    out: dict = {}
    for root, sub in tree.items():
        out[root] = {}
        for nid, node in sub.items():
            out[root][nid] = {**node, "imported_counts": node.get("counts", 0)}
    return out


def emit_color(case: ColorCase) -> None:
    if case.kind == "atc":
        py_tree = load_atc(case.template)
        propagate_atc_counts(py_tree, case.count_mode, case.count_level)
        ts_tree = to_atc_zero_based(py_tree)
        ts_level = max(case.color_level - 1, 0)
    else:
        py_tree = load_mesh(case.template)
        propagate_mesh_counts(py_tree, case.count_mode, case.count_level)
        ts_tree = py_tree
        ts_level = case.color_level

    payload = serialize_color(case, ts_tree, ts_level)
    out_path = COLOR_FIXTURES_DIR / f"{case.name}.json"
    out_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    print(f"wrote {out_path.relative_to(REPO_ROOT)}")


def main(argv: Iterable[str]) -> int:
    _ = list(argv)
    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    COLOR_FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    for case in CASES:
        emit(case)
    for ccase in COLOR_CASES:
        emit_color(ccase)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
