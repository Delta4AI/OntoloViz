/**
 * Color propagation over an ontology.
 *
 * Ports the algorithm from src/ontoloviz/core.py:
 *
 *   • `calculate_color_scale_for_node` (core.py:331)
 *   • `tree_color_propagation`         (core.py:531)
 *   • `generate_color_range` / `rgb_to_hex` (core_utils.py)
 *
 * Modes (`ColorPropagationMode`):
 *   "off"       — no-op clone, preserves the TSV `color` column verbatim.
 *   "specific"  — one color scale per subtree; nodes below `level` get default.
 *   "global"    — single scale derived from the global max; same level gate.
 *   "phenotype" — per-subtree scale derived from "outermost" nodes by dot count;
 *                 only those outermost nodes are colored, ancestors stay default.
 *                 Uses a strict bottom-up (level-descending) walk; the legacy
 *                 Python implementation iterates in dict-insertion order, which
 *                 silently degenerates to "color every node" when ancestors come
 *                 before descendants in the TSV. See the docstring inside
 *                 `applyPhenotypeColors` for the rationale.
 *
 * Implementation notes:
 *   • Linear RGB interpolation matches Plotly's `n_colors`; output hex strings
 *     truncate floats with `Math.trunc` to match Python's `int()` semantics.
 *   • Negative channel values are clamped to 0, mirroring the comment in
 *     `core_utils.rgb_to_hex` about Plotly producing very slight underflows.
 *   • Levels are 0-based throughout. Callers passing 1-based thresholds (the
 *     legacy Python convention) must translate to 0-based first; the parity
 *     harness handles this for ATC.
 *   • The function is pure — it deep-clones nodes and returns a new Ontology.
 */

import { DEFAULT_COLOR, type Node, type Ontology, type Subtree } from "./types";

export type ColorPropagationMode = "off" | "specific" | "global" | "phenotype";

/** A single stop in a multi-stop linear color scale. */
export type ColorStop = readonly [position: number, color: string];

export interface ColorPropagationSettings {
  /** Master switch — when false this function is a no-op clone. */
  readonly enabled: boolean;
  /** Which scaling strategy to apply. */
  readonly mode: ColorPropagationMode;
  /** Level gate for `specific`/`global` modes. Inclusive, 0-based. */
  readonly level: number;
  /**
   * Stops in ascending position order, positions in [0, 1].
   * The first stop's color also serves as `defaultColor` in the Python
   * reference, but we accept an explicit override below for clarity.
   */
  readonly colorScale: readonly ColorStop[];
  /** Color used for nodes outside the active region. */
  readonly defaultColor: string;
  /**
   * Optional level separator used by phenotype mode to detect "outermost"
   * nodes via dot counting. Defaults to "." (MeSH convention). ATC nodes
   * never contain this character, so phenotype mode colors every ATC node
   * — same behavior as the Python reference.
   */
  readonly levelSeparator?: string;
}

/* -------------------------------------------------------------------------- */
/* Public entry point                                                          */
/* -------------------------------------------------------------------------- */

export function propagateColors(
  ontology: Ontology,
  settings: ColorPropagationSettings,
): Ontology {
  const newSubtrees = new Map<string, Subtree>();

  // Compute one global max once when needed.
  let globalScale: BuiltScale | null = null;
  if (
    settings.enabled &&
    settings.mode === "global" &&
    settings.colorScale.length > 0
  ) {
    let globalMax = 0;
    for (const subtree of ontology.subtrees.values()) {
      for (const node of subtree.nodes.values()) {
        if (node.level >= settings.level && node.count > globalMax) {
          globalMax = node.count;
        }
      }
    }
    globalScale = buildColorScale(globalMax, settings.colorScale, settings.defaultColor);
  }

  for (const [rootId, subtree] of ontology.subtrees) {
    newSubtrees.set(
      rootId,
      propagateSubtreeColors(subtree, settings, globalScale),
    );
  }

  return { ...ontology, subtrees: newSubtrees };
}

/* -------------------------------------------------------------------------- */
/* Per-subtree application                                                     */
/* -------------------------------------------------------------------------- */

function propagateSubtreeColors(
  subtree: Subtree,
  settings: ColorPropagationSettings,
  globalScale: BuiltScale | null,
): Subtree {
  // Deep-clone so the input is never mutated; resolve "no override" cells to
  // the default color so every node ends up with a renderable hex value.
  const nodes = new Map<string, Node>();
  for (const [id, node] of subtree.nodes) {
    nodes.set(id, {
      ...node,
      color: node.color || settings.defaultColor,
    });
  }

  if (
    !settings.enabled ||
    settings.mode === "off" ||
    settings.colorScale.length === 0
  ) {
    return { rootId: subtree.rootId, nodes };
  }

  const sep = settings.levelSeparator ?? ".";

  if (settings.mode === "phenotype") {
    applyPhenotypeColors(nodes, subtree, settings, sep);
    return { rootId: subtree.rootId, nodes };
  }

  // "specific" or "global": level-gated, one scale per (sub)tree.
  const scale =
    settings.mode === "global"
      ? globalScale
      : buildScaleForSubtree(subtree, settings);

  if (!scale) return { rootId: subtree.rootId, nodes };

  for (const [id, node] of nodes) {
    if (node.level >= settings.level) {
      nodes.set(id, { ...node, color: lookupColor(scale, node.count) });
    } else {
      nodes.set(id, { ...node, color: settings.defaultColor });
    }
  }
  return { rootId: subtree.rootId, nodes };
}

function buildScaleForSubtree(
  subtree: Subtree,
  settings: ColorPropagationSettings,
): BuiltScale {
  // Max over nodes at or below the level gate.
  let maxVal = 0;
  for (const node of subtree.nodes.values()) {
    if (node.level >= settings.level && node.count > maxVal) {
      maxVal = node.count;
    }
  }
  return buildColorScale(maxVal, settings.colorScale, settings.defaultColor);
}

function applyPhenotypeColors(
  nodes: Map<string, Node>,
  subtree: Subtree,
  settings: ColorPropagationSettings,
  sep: string,
): void {
  // Iterate strict bottom-up (deepest first). This is the fix-divergence
  // from core.py's dict-insertion-order traversal: when the legacy iteration
  // visits ancestors before descendants, the ancestor-whitelist guard fires
  // too late and every node ends up colored. A level-descending walk colors
  // only the outermost nodes — which is what "phenotype" semantically means.
  const sortedNodes = [...subtree.nodes.values()].sort(
    (a, b) => b.level - a.level,
  );

  const ancestorWhitelist = new Set<string>();
  let maxVal = 0;
  for (const node of sortedNodes) {
    if (!ancestorWhitelist.has(node.id)) {
      if (node.count > maxVal) maxVal = node.count;
      for (const ancestor of dotAncestors(node.id, sep)) {
        ancestorWhitelist.add(ancestor);
      }
    }
  }

  const scale = buildColorScale(maxVal, settings.colorScale, settings.defaultColor);

  const seenAncestors = new Set<string>();
  for (const node of sortedNodes) {
    if (!seenAncestors.has(node.id)) {
      for (const ancestor of dotAncestors(node.id, sep)) {
        seenAncestors.add(ancestor);
      }
      nodes.set(node.id, { ...node, color: lookupColor(scale, node.count) });
    } else {
      nodes.set(node.id, { ...node, color: settings.defaultColor });
    }
  }
}

/** Yield every strict ancestor of `id` derived by stripping trailing
 *  `sep`-separated segments. For "C01.001.005" this yields "C01.001", "C01". */
function dotAncestors(id: string, sep: string): string[] {
  if (!sep || !id.includes(sep)) return [];
  const out: string[] = [];
  let cursor = id;
  while (cursor.includes(sep)) {
    cursor = cursor.slice(0, cursor.lastIndexOf(sep));
    if (cursor) out.push(cursor);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Scale construction & lookup                                                 */
/* -------------------------------------------------------------------------- */

interface BuiltScale {
  readonly factor: number;
  readonly colors: readonly string[];
}

/**
 * Build a color scale for a single max value. Mirrors `calculate_color_scale_for_node`.
 *
 * The scale starts with `defaultColor` (index 0) and extends through each pair
 * of adjacent stops via linear RGB interpolation. The returned `factor` lets
 * callers shrink the scale for very large maxima — a count of N looks up
 * `colors[floor(N / factor)]`.
 */
export function buildColorScale(
  maxVal: number,
  stops: readonly ColorStop[],
  defaultColor: string,
): BuiltScale {
  let factor = 1;
  let max = Math.trunc(maxVal);
  if (max >= 100000 && max < 250000) {
    factor = 10;
    max = Math.trunc(max / 10);
  } else if (max >= 250000) {
    factor = 25;
    max = Math.trunc(max / 25);
  }

  const colors: string[] = [defaultColor];
  for (let i = 0; i < stops.length - 1; i++) {
    const [lowPos, lowColor] = stops[i]!;
    const [highPos, highColor] = stops[i + 1]!;
    const lowCutoff = Math.trunc(max * lowPos);
    const highCutoff = Math.trunc(max * highPos);
    const segmentSize = highCutoff - lowCutoff;
    if (segmentSize <= 0) continue;
    for (const c of generateColorRange(lowColor, highColor, segmentSize)) {
      colors.push(c);
    }
  }
  return { factor, colors };
}

function lookupColor(scale: BuiltScale, count: number): string {
  if (scale.colors.length === 0) return DEFAULT_COLOR;
  const idx = Math.trunc(count / scale.factor);
  if (idx < 0) return scale.colors[0]!;
  if (idx >= scale.colors.length) return scale.colors[scale.colors.length - 1]!;
  return scale.colors[idx]!;
}

/* -------------------------------------------------------------------------- */
/* RGB helpers                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Generate `n` evenly-spaced colors between `start` and `stop` (inclusive),
 * matching Plotly's `n_colors`. For `n === 1` returns `[start]`.
 */
export function generateColorRange(start: string, stop: string, n: number): string[] {
  if (n <= 0) return [];
  const lo = hexToRgb(start);
  const hi = hexToRgb(stop);
  if (n === 1) return [rgbToHex(lo)];
  const out: string[] = [];
  const denom = n - 1;
  for (let i = 0; i < n; i++) {
    const t = i / denom;
    out.push(
      rgbToHex([
        lo[0] + (hi[0] - lo[0]) * t,
        lo[1] + (hi[1] - lo[1]) * t,
        lo[2] + (hi[2] - lo[2]) * t,
      ]),
    );
  }
  return out;
}

export function hexToRgb(hex: string): [number, number, number] {
  const trimmed = hex.startsWith("#") ? hex.slice(1) : hex;
  if (trimmed.length !== 6) {
    throw new Error(`hexToRgb: expected #RRGGBB, got "${hex}"`);
  }
  const r = Number.parseInt(trimmed.slice(0, 2), 16);
  const g = Number.parseInt(trimmed.slice(2, 4), 16);
  const b = Number.parseInt(trimmed.slice(4, 6), 16);
  return [r, g, b];
}

export function rgbToHex(rgb: readonly [number, number, number]): string {
  const channels = rgb.map((c) => {
    // Match Python core_utils.rgb_to_hex: clamp negatives to 0, truncate.
    const clamped = c < 0 ? 0 : c;
    return Math.trunc(clamped);
  });
  return `#${channels.map((c) => c.toString(16).toUpperCase().padStart(2, "0")).join("")}`;
}
