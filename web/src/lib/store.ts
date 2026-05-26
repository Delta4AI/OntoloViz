/**
 * Application store.
 *
 * Holds the raw parsed ontology, all count/color propagation settings, and
 * derives the propagated ontology on demand. Components subscribe via the
 * `useStore` hook; the propagated ontology is recomputed lazily via a
 * `getPropagated` selector so settings can be tweaked without re-uploading.
 *
 * Why a store and not lifted state: step 6 (virtualized summary grid) will
 * share hover/search/selection state with the sunburst; centralizing avoids
 * prop drilling and lets each surface subscribe to just what it needs.
 */

import { create } from "zustand";

import { propagateColors, type ColorPropagationSettings } from "./ontology/color";
import { propagateCounts, type PropagationSettings } from "./ontology/propagate";
import type { Node, Ontology } from "./ontology/types";

export const DEFAULT_COUNT_SETTINGS: PropagationSettings = {
  enabled: true,
  countMode: "all",
  level: 0,
};

export const DEFAULT_COLOR_STOPS: readonly (readonly [number, string])[] = [
  [0, "#FFFFFF"],
  [0.2, "#403C53"],
  [1, "#C33D35"],
];

export const DEFAULT_COLOR_SETTINGS: ColorPropagationSettings = {
  enabled: true,
  mode: "specific",
  level: 0,
  colorScale: DEFAULT_COLOR_STOPS,
  defaultColor: "#FFFFFF",
};

/**
 * Visualization view mode.
 *
 * - `overview`: small-multiples grid of every subtree at once. Default for
 *   multi-subtree ontologies. Tile click drills into `detail`.
 * - `detail`: single full-interactivity sunburst of the active subtree.
 *   Auto-selected when the ontology has exactly one subtree.
 */
export type ViewMode = "overview" | "detail";

interface AppState {
  /** The raw parsed ontology, before any propagation. */
  readonly raw: Ontology | null;
  /** Currently displayed subtree root id. */
  readonly activeRoot: string | null;
  /** Whether the viz area shows the overview grid or the detail sunburst. */
  readonly viewMode: ViewMode;
  /** Count-propagation settings. */
  readonly count: PropagationSettings;
  /** Color-propagation settings. */
  readonly color: ColorPropagationSettings;
  /**
   * Cross-surface hover. The sunburst sets this when the user mouses over a
   * slice; the grid sets this when the user hovers a row. Both surfaces
   * highlight the matching node. Null when nothing is hovered.
   */
  readonly hoveredId: string | null;
  /** Free-text filter applied to the summary grid. */
  readonly searchQuery: string;

  /** Replace the raw ontology (new upload). Resets activeRoot to the first subtree. */
  setOntology(ontology: Ontology | null): void;
  setActiveRoot(rootId: string | null): void;
  setViewMode(mode: ViewMode): void;
  setCountSettings(partial: Partial<PropagationSettings>): void;
  setColorSettings(partial: Partial<ColorPropagationSettings>): void;
  setHoveredId(id: string | null): void;
  setSearchQuery(query: string): void;
  /**
   * Patch a single node on the raw ontology — for inline editing of count,
   * color, or label from the data table. Triggers re-propagation through
   * the standard derive pipeline because `raw` identity changes.
   */
  updateNode(
    rootId: string,
    nodeId: string,
    patch: Partial<Pick<Node, "count" | "color" | "label">>,
  ): void;
  reset(): void;
}

export const useAppStore = create<AppState>((set) => ({
  raw: null,
  activeRoot: null,
  viewMode: "overview",
  count: DEFAULT_COUNT_SETTINGS,
  color: DEFAULT_COLOR_SETTINGS,
  hoveredId: null,
  searchQuery: "",

  setOntology: (ontology) =>
    set(() => {
      if (!ontology) {
        return { raw: null, activeRoot: null, hoveredId: null, viewMode: "overview" };
      }
      // Single-subtree ontologies skip overview — the grid would render one
      // tile which adds zero information vs. the full sunburst.
      const multi = ontology.subtrees.size > 1;
      const viewMode: ViewMode = multi ? "overview" : "detail";
      // In overview, leave activeRoot null so the data table shows all nodes
      // and the sunburst grid isn't anchored to an arbitrary subtree.
      const activeRoot = multi ? null : (ontology.subtrees.keys().next().value ?? null);
      return { raw: ontology, activeRoot, hoveredId: null, viewMode };
    }),

  setActiveRoot: (rootId) => set(() => ({ activeRoot: rootId })),

  setViewMode: (mode) =>
    set((state) => {
      // Leaving detail for overview should unscope the data table — otherwise
      // the previously-active subtree keeps filtering it.
      if (mode === "overview" && state.raw && state.raw.subtrees.size > 1) {
        return { viewMode: mode, activeRoot: null };
      }
      return { viewMode: mode };
    }),

  setCountSettings: (partial) =>
    set((state) => ({ count: { ...state.count, ...partial } })),

  setColorSettings: (partial) =>
    set((state) => ({ color: { ...state.color, ...partial } })),

  setHoveredId: (id) => set(() => ({ hoveredId: id })),

  setSearchQuery: (searchQuery) => set(() => ({ searchQuery })),

  updateNode: (rootId, nodeId, patch) =>
    set((state) => {
      const raw = state.raw;
      if (!raw) return {};
      const subtree = raw.subtrees.get(rootId);
      if (!subtree) return {};
      const node = subtree.nodes.get(nodeId);
      if (!node) return {};
      const nextNode: Node = { ...node, ...patch };
      const nextNodes = new Map(subtree.nodes);
      nextNodes.set(nodeId, nextNode);
      const nextSubtree = { ...subtree, nodes: nextNodes };
      const nextSubtrees = new Map(raw.subtrees);
      nextSubtrees.set(rootId, nextSubtree);
      return { raw: { ...raw, subtrees: nextSubtrees } };
    }),

  reset: () =>
    set(() => ({
      raw: null,
      activeRoot: null,
      viewMode: "overview",
      count: DEFAULT_COUNT_SETTINGS,
      color: DEFAULT_COLOR_SETTINGS,
      hoveredId: null,
      searchQuery: "",
    })),
}));

/**
 * Derive the propagated ontology from `raw` + current settings.
 *
 * Pure function — pass in a state snapshot. Returns null when no ontology
 * has been loaded. Memoization is the caller's responsibility (`useMemo`
 * keyed on `raw`, `count`, `color`).
 */
export function derivePropagated(
  raw: Ontology | null,
  count: PropagationSettings,
  color: ColorPropagationSettings,
): Ontology | null {
  if (!raw) return null;
  const withCounts = propagateCounts(raw, count);
  return propagateColors(withCounts, color);
}

/** One row in the summary grid — a flattened view across all subtrees. */
export interface GridRow {
  readonly rootId: string;
  readonly node: Node;
}

/**
 * Flatten the propagated ontology to a sorted (by rootId, then id) row list.
 * Pure; the caller memoizes on `ontology` identity.
 */
export function flattenRows(ontology: Ontology | null): readonly GridRow[] {
  if (!ontology) return [];
  const rows: GridRow[] = [];
  for (const [rootId, subtree] of ontology.subtrees) {
    for (const node of subtree.nodes.values()) {
      rows.push({ rootId, node });
    }
  }
  rows.sort((a, b) => {
    if (a.rootId !== b.rootId) return a.rootId < b.rootId ? -1 : 1;
    return a.node.id < b.node.id ? -1 : a.node.id > b.node.id ? 1 : 0;
  });
  return rows;
}

/**
 * Filter rows by a case-insensitive substring match against id + label.
 * Empty/whitespace query returns the input array unchanged.
 */
export function filterRows(
  rows: readonly GridRow[],
  query: string,
): readonly GridRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (r) =>
      r.node.id.toLowerCase().includes(q) || r.node.label.toLowerCase().includes(q),
  );
}
