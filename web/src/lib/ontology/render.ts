/**
 * Canvas 2D renderer for sunburst layouts.
 *
 * Stays pure with respect to React: takes a `CanvasRenderingContext2D` plus a
 * laid-out node list and paints. The caller owns the canvas element, DPR
 * scaling, and event handling.
 *
 * Coordinate convention: layout angles run clockwise from "12 o'clock" (the
 * `-π/2` offset below). Radii in the layout are in [0, 1]; we scale them to
 * the inner half of the smaller canvas dimension so a square or near-square
 * viewport works without per-tree tuning.
 */

import type { LayoutNode } from "./layout";

/**
 * Pick a hover stroke that stays visible on any fill. Uses Rec.601 luminance
 * on the raw 8-bit channels — accurate enough to flip at the white/black
 * boundary without a gamma pass. Falls back to white if the fill isn't a
 * `#RRGGBB` string (e.g. a CSS color name from upstream data).
 */
function contrastingHoverStroke(fill: string): string {
  const dark = "rgba(20, 20, 24, 0.9)";
  const light = "rgba(245, 245, 250, 0.95)";
  if (fill.length !== 7 || fill.charCodeAt(0) !== 35 /* '#' */) return dark;
  const r = Number.parseInt(fill.slice(1, 3), 16);
  const g = Number.parseInt(fill.slice(3, 5), 16);
  const b = Number.parseInt(fill.slice(5, 7), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return dark;
  // Rec.601 luminance; threshold ~140 keeps mid-tones on the dark-stroke side.
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  return luma > 140 ? dark : light;
}

export interface RenderOptions {
  /** CSS pixel width of the canvas viewport. */
  readonly width: number;
  /** CSS pixel height of the canvas viewport. */
  readonly height: number;
  /** Optional hover/focus highlight; node id rendered with a brighter stroke. */
  readonly highlightId?: string;
  /** Stroke color for slice borders. Defaults to a subtle dark line. */
  readonly strokeStyle?: string;
  /** Background color drawn first; pass `null` to skip clearing. */
  readonly background?: string | null;
}

/**
 * Paint a sunburst layout into the given 2D context.
 *
 * Assumes the context's transform is already set so that drawing in CSS pixels
 * lands correctly on the backing store (i.e. the caller multiplied by DPR).
 */
export function renderSunburst(
  ctx: CanvasRenderingContext2D,
  layout: readonly LayoutNode[],
  options: RenderOptions,
): void {
  const { width, height } = options;
  if (width <= 0 || height <= 0 || layout.length === 0) return;

  if (options.background !== null) {
    ctx.fillStyle = options.background ?? "#0B0B10";
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.clearRect(0, 0, width, height);
  }

  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 4;

  const strokeStyle = options.strokeStyle ?? "rgba(0, 0, 0, 0.35)";
  const angleOffset = -Math.PI / 2;

  for (const slice of layout) {
    // Skip the synthetic outer root of zero-area slices.
    if (slice.x1 - slice.x0 <= 0) continue;
    const r0 = slice.y0 * radius;
    const r1 = slice.y1 * radius;
    if (r1 <= r0) continue;

    ctx.beginPath();
    ctx.arc(cx, cy, r1, angleOffset + slice.x0, angleOffset + slice.x1, false);
    ctx.arc(cx, cy, r0, angleOffset + slice.x1, angleOffset + slice.x0, true);
    ctx.closePath();

    ctx.fillStyle = slice.node.color || "#FFFFFF";
    ctx.fill();

    if (options.highlightId && slice.id === options.highlightId) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = contrastingHoverStroke(slice.node.color || "#FFFFFF");
    } else {
      ctx.lineWidth = 1;
      ctx.strokeStyle = strokeStyle;
    }
    ctx.stroke();
  }
}

/**
 * Hit-test a point against a laid-out sunburst. Returns the topmost slice id
 * that contains the point, or `null` if the point is outside every slice.
 *
 * Iterates in reverse (deepest first) so leaves win over their ancestors when
 * radial bands happen to overlap due to floating-point fuzz.
 */
export function hitTest(
  layout: readonly LayoutNode[],
  options: { readonly width: number; readonly height: number },
  px: number,
  py: number,
): string | null {
  const { width, height } = options;
  if (width <= 0 || height <= 0) return null;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 4;

  const dx = px - cx;
  const dy = py - cy;
  const r = Math.hypot(dx, dy) / radius;
  if (r > 1 || r < 0) return null;

  // atan2 with the y-axis pointing down gives angles measured clockwise from
  // "3 o'clock"; we offset by +π/2 to match the renderer's "12 o'clock" start.
  let theta = Math.atan2(dy, dx) + Math.PI / 2;
  if (theta < 0) theta += 2 * Math.PI;
  if (theta >= 2 * Math.PI) theta -= 2 * Math.PI;

  for (let i = layout.length - 1; i >= 0; i--) {
    const slice = layout[i]!;
    if (r < slice.y0 || r > slice.y1) continue;
    if (theta < slice.x0 || theta > slice.x1) continue;
    return slice.id;
  }
  return null;
}
