/**
 * Ring-thickness taper: turn one "fatten center ↔ fatten edge" knob into a
 * full per-ring weight ramp.
 *
 * The sunburst normalizes ring bands by their cumulative weight, so scaling
 * every ring by the same factor is a no-op — only the *gradient* from the
 * center ring to the edge ring changes anything visible. A taper expresses
 * exactly that gradient with a single value, sparing the user from dragging
 * every per-ring slider on a deep ontology.
 */

import { RING_WEIGHT_DEFAULT, RING_WEIGHT_MAX, RING_WEIGHT_MIN } from "../store";

/** Taper amount is `[-1, 1]`: -1 = fatten center fully, 0 = uniform, 1 = fatten edge. */
export const TAPER_MIN = -1;
export const TAPER_MAX = 1;
export const TAPER_DEFAULT = 0;

/**
 * Half-spread at full taper. At `t = ±1` the edge/center rings land at
 * `1 ± 0.75` (1.75 and 0.25), keeping every generated weight inside the
 * `[RING_WEIGHT_MIN, RING_WEIGHT_MAX]` slider bounds without clamping.
 */
const TAPER_MAX_SPREAD = 0.75;

/** Lowest ring count at which a taper is worth offering over plain per-ring sliders. */
export const TAPER_MIN_RINGS = 4;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Build a linear per-ring weight ramp for `ringCount` rings (index 0 = center).
 *
 * The ramp is centered on the uniform baseline: the middle ring stays at `1`,
 * the center and edge rings move symmetrically by `t * TAPER_MAX_SPREAD`. A
 * `t` of 0 returns an all-baseline array (visually identical to uniform).
 * Each value is clamped to the slider range as a safety net.
 */
export function taperRamp(t: number, ringCount: number): number[] {
  if (ringCount <= 0) return [];
  if (ringCount === 1) return [RING_WEIGHT_DEFAULT];
  const amount = clamp(t, TAPER_MIN, TAPER_MAX);
  return Array.from({ length: ringCount }, (_, i) => {
    // centered ∈ [-1, 1]: -1 at the center ring, +1 at the edge ring.
    const centered = (i / (ringCount - 1)) * 2 - 1;
    const w = RING_WEIGHT_DEFAULT + amount * TAPER_MAX_SPREAD * centered;
    return clamp(Number(w.toFixed(4)), RING_WEIGHT_MIN, RING_WEIGHT_MAX);
  });
}
