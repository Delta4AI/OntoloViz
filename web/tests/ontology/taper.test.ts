import { describe, expect, it } from "vitest";

import { RING_WEIGHT_MAX, RING_WEIGHT_MIN } from "@/lib/store";
import { TAPER_MIN_RINGS, taperRamp } from "@/lib/ontology/taper";

describe("taperRamp", () => {
  it("returns all-baseline weights at taper 0 (visually uniform)", () => {
    expect(taperRamp(0, 5)).toEqual([1, 1, 1, 1, 1]);
  });

  it("fattens the edge and thins the center at positive taper", () => {
    const ramp = taperRamp(1, 5);
    // Monotonically increasing center → edge.
    for (let i = 1; i < ramp.length; i++) {
      expect(ramp[i]).toBeGreaterThan(ramp[i - 1]);
    }
    expect(ramp[0]).toBeLessThan(1);
    expect(ramp[ramp.length - 1]).toBeGreaterThan(1);
  });

  it("fattens the center and thins the edge at negative taper", () => {
    const ramp = taperRamp(-1, 5);
    for (let i = 1; i < ramp.length; i++) {
      expect(ramp[i]).toBeLessThan(ramp[i - 1]);
    }
    expect(ramp[0]).toBeGreaterThan(1);
    expect(ramp[ramp.length - 1]).toBeLessThan(1);
  });

  it("keeps the middle ring on the baseline for an odd ring count", () => {
    const ramp = taperRamp(1, 5);
    expect(ramp[2]).toBe(1);
  });

  it("is symmetric about the center: opposite tapers mirror each other", () => {
    const up = taperRamp(0.6, 6);
    const down = taperRamp(-0.6, 6);
    for (let i = 0; i < up.length; i++) {
      expect(up[i]).toBeCloseTo(down[down.length - 1 - i], 6);
    }
  });

  it("never produces a weight outside the slider bounds", () => {
    for (const t of [-1, -0.5, 0, 0.5, 1]) {
      for (const count of [TAPER_MIN_RINGS, 8, 14]) {
        for (const w of taperRamp(t, count)) {
          expect(w).toBeGreaterThanOrEqual(RING_WEIGHT_MIN);
          expect(w).toBeLessThanOrEqual(RING_WEIGHT_MAX);
        }
      }
    }
  });

  it("emits one weight per ring", () => {
    expect(taperRamp(0.5, 7)).toHaveLength(7);
  });

  it("handles degenerate ring counts", () => {
    expect(taperRamp(1, 0)).toEqual([]);
    expect(taperRamp(1, 1)).toEqual([1]);
  });

  it("clamps out-of-range taper input", () => {
    expect(taperRamp(5, 5)).toEqual(taperRamp(1, 5));
    expect(taperRamp(-5, 5)).toEqual(taperRamp(-1, 5));
  });
});
