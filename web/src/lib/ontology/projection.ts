/**
 * Focus-frame projection for sunburst zoom transitions.
 *
 * The interactive sunburst keeps a single full partition (computed once per
 * subtree) and projects it through a moving `FocusFrame` that defines the
 * current zoom lens: which angular wedge maps to the full ring, and how
 * radii rescale so the focused subtree fills the canvas. Interpolating the
 * frame between two states yields a smooth zoom — the canonical D3
 * zoomable-sunburst tween, adapted for the canvas renderer.
 */

import type { LayoutNode } from "./layout";

/**
 * A snapshot of the zoom lens.
 *
 * Angles `x0`/`x1` are in the full layout's coordinate space (radians, the
 * partition's `[0, 2π]`). `y0` is the inner radius of the focused node in
 * full-layout coords; `yScale` rescales the residual radial range so the
 * deepest descendant of focus lands on the outer canvas ring.
 */
export interface FocusFrame {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly yScale: number;
}

const TWO_PI = 2 * Math.PI;

/** The identity frame: maps the full layout to itself (no zoom). */
export function rootFrame(): FocusFrame {
  return { x0: 0, x1: TWO_PI, y0: 0, yScale: 1 };
}

/**
 * Compute the frame that places `focusId` at the centre of the canvas with
 * its descendant subtree filling the ring. Returns `null` if the id is not
 * in the layout.
 */
export function focusFrameFor(
  full: readonly LayoutNode[],
  focusId: string,
): FocusFrame | null {
  const focus = full.find((n) => n.id === focusId);
  if (!focus) return null;

  // The full layout is in pre-order, so a single forward pass over parent
  // links is enough to materialise the descendant set.
  const descendants = new Set<string>([focus.id]);
  for (const n of full) {
    if (descendants.has(n.parent)) descendants.add(n.id);
  }

  let maxY = focus.y1;
  for (const n of full) {
    if (descendants.has(n.id) && n.y1 > maxY) maxY = n.y1;
  }

  const denom = maxY - focus.y0;
  const yScale = denom > 1e-9 ? 1 / denom : 1;
  return { x0: focus.x0, x1: focus.x1, y0: focus.y0, yScale };
}

/**
 * Project every node in `full` through `frame`, returning the slices that
 * are currently visible. Out-of-lens nodes (ancestors and non-descendant
 * siblings) collapse to zero size and are dropped.
 */
export function projectLayout(
  full: readonly LayoutNode[],
  frame: FocusFrame,
): readonly LayoutNode[] {
  const span = frame.x1 - frame.x0;
  if (span <= 1e-9) return [];
  const out: LayoutNode[] = [];
  for (const slice of full) {
    const a0 = clamp01((slice.x0 - frame.x0) / span) * TWO_PI;
    const a1 = clamp01((slice.x1 - frame.x0) / span) * TWO_PI;
    if (a1 - a0 <= 1e-6) continue;
    const r0 = clamp01((slice.y0 - frame.y0) * frame.yScale);
    const r1 = clamp01((slice.y1 - frame.y0) * frame.yScale);
    if (r1 - r0 <= 1e-6) continue;
    out.push({ ...slice, x0: a0, x1: a1, y0: r0, y1: r1 });
  }
  return out;
}

/** Linear interpolation between two frames at parameter `t ∈ [0, 1]`. */
export function lerpFrame(a: FocusFrame, b: FocusFrame, t: number): FocusFrame {
  return {
    x0: a.x0 + (b.x0 - a.x0) * t,
    x1: a.x1 + (b.x1 - a.x1) * t,
    y0: a.y0 + (b.y0 - a.y0) * t,
    yScale: a.yScale + (b.yScale - a.yScale) * t,
  };
}

/** Standard ease-out-cubic — fast start, gentle settle. */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
