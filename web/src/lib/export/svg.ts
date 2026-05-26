/**
 * SVG export for the sunburst layout.
 *
 * Pure: takes a laid-out node list and returns a self-contained SVG string.
 * Uses the same angular convention as the canvas renderer (-π/2 offset so
 * the layout's `x=0` maps to "12 o'clock"). The output is render-equivalent
 * to what the user sees on screen, minus the hover highlight ring.
 *
 * Browser-native `<title>` children give light interactivity (the browser
 * shows a tooltip on hover) without shipping any JS.
 */

import type { LayoutNode } from "../ontology/layout";

export interface SvgOptions {
  /** Output viewbox width in CSS pixels. */
  readonly width: number;
  /** Output viewbox height in CSS pixels. */
  readonly height: number;
  /** Background fill; pass `null` to omit the backdrop rect. */
  readonly background?: string | null;
  /** Stroke for slice borders. Defaults to a subtle dark line. */
  readonly stroke?: string;
  /** Stroke width. Defaults to 0.5. */
  readonly strokeWidth?: number;
  /** Optional document title — embedded as &lt;title&gt; at the top. */
  readonly title?: string;
  /**
   * When true, paths carry a `data-id` attribute and the per-slice
   * `<title>` child is omitted — leaving tooltip presentation to an
   * outer host (e.g. the standalone HTML export's JS overlay).
   */
  readonly interactive?: boolean;
}

const TWO_PI = 2 * Math.PI;
// Angular fuzz below which a slice's `<path>` collapses to a degenerate arc
// and Safari renders it as a hairline. Skipping these slices is harmless.
const MIN_ANGLE_EPS = 1e-9;

/**
 * Build an SVG string for the given layout.
 *
 * The radial mapping mirrors `renderSunburst`: `r = min(w, h)/2 - 4`, slices
 * are arc-shaped between `y0*r` and `y1*r` with the angular offset baked in.
 */
export function layoutToSvg(
  layout: readonly LayoutNode[],
  options: SvgOptions,
): string {
  const { width, height } = options;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 4;
  const stroke = options.stroke ?? "rgba(0, 0, 0, 0.35)";
  const strokeWidth = options.strokeWidth ?? 0.5;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
  );
  if (options.title) {
    parts.push(`<title>${escapeXml(options.title)}</title>`);
  }
  if (options.background !== null) {
    if (options.interactive) {
      // Interactive exports theme the canvas via CSS class, so the background
      // follows the host document's `data-theme` attribute.
      parts.push(`<rect class="ov-canvas-bg" width="${width}" height="${height}" />`);
    } else {
      const bg = options.background ?? "#0B0B10";
      parts.push(`<rect width="${width}" height="${height}" fill="${bg}" />`);
    }
  }

  for (const slice of layout) {
    const dAngle = slice.x1 - slice.x0;
    if (dAngle <= MIN_ANGLE_EPS) continue;
    const r0 = slice.y0 * radius;
    const r1 = slice.y1 * radius;
    if (r1 <= r0) continue;

    const path = arcPath(cx, cy, slice.x0, slice.x1, r0, r1);
    const fill = slice.node.color || "#FFFFFF";
    if (options.interactive) {
      parts.push(
        `<path d="${path}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" data-id="${escapeXml(slice.node.id)}"></path>`,
      );
    } else {
      const tooltip = `${slice.node.id} · ${slice.node.label} · ${slice.node.count.toLocaleString()}`;
      parts.push(
        `<path d="${path}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"><title>${escapeXml(tooltip)}</title></path>`,
      );
    }
  }

  parts.push("</svg>");
  return parts.join("");
}

/**
 * SVG path for an annular sector ("donut slice"). Uses the renderer's angular
 * offset (-π/2). Handles the full-ring case (dAngle = 2π) with two semicircles
 * because a single arc with start == end is degenerate in SVG.
 */
function arcPath(
  cx: number,
  cy: number,
  startAngle: number,
  endAngle: number,
  r0: number,
  r1: number,
): string {
  const offset = -Math.PI / 2;
  const a0 = startAngle + offset;
  const a1 = endAngle + offset;
  const dAngle = endAngle - startAngle;
  const largeArc = dAngle > Math.PI ? 1 : 0;

  const x0outer = cx + r1 * Math.cos(a0);
  const y0outer = cy + r1 * Math.sin(a0);
  const x1outer = cx + r1 * Math.cos(a1);
  const y1outer = cy + r1 * Math.sin(a1);
  const x0inner = cx + r0 * Math.cos(a1);
  const y0inner = cy + r0 * Math.sin(a1);
  const x1inner = cx + r0 * Math.cos(a0);
  const y1inner = cy + r0 * Math.sin(a0);

  // Special case: a full ring (the layout root) — arc start == arc end so
  // the browser draws nothing. Split into two semicircles.
  if (dAngle >= TWO_PI - 1e-9) {
    const midAngle = a0 + Math.PI;
    const midX = cx + r1 * Math.cos(midAngle);
    const midY = cy + r1 * Math.sin(midAngle);
    if (r0 <= 0) {
      // Solid disk.
      return [
        `M ${x0outer} ${y0outer}`,
        `A ${r1} ${r1} 0 1 1 ${midX} ${midY}`,
        `A ${r1} ${r1} 0 1 1 ${x0outer} ${y0outer}`,
        "Z",
      ].join(" ");
    }
    const midInnerX = cx + r0 * Math.cos(midAngle);
    const midInnerY = cy + r0 * Math.sin(midAngle);
    return [
      `M ${x0outer} ${y0outer}`,
      `A ${r1} ${r1} 0 1 1 ${midX} ${midY}`,
      `A ${r1} ${r1} 0 1 1 ${x0outer} ${y0outer}`,
      `M ${midInnerX} ${midInnerY}`,
      `A ${r0} ${r0} 0 1 0 ${cx + r0 * Math.cos(a0)} ${cy + r0 * Math.sin(a0)}`,
      `A ${r0} ${r0} 0 1 0 ${midInnerX} ${midInnerY}`,
      "Z",
    ].join(" ");
  }

  if (r0 <= 0) {
    // Pie slice — no inner arc, just a triangle-to-arc.
    return [
      `M ${cx} ${cy}`,
      `L ${x0outer} ${y0outer}`,
      `A ${r1} ${r1} 0 ${largeArc} 1 ${x1outer} ${y1outer}`,
      "Z",
    ].join(" ");
  }

  return [
    `M ${x1inner} ${y1inner}`,
    `L ${x0outer} ${y0outer}`,
    `A ${r1} ${r1} 0 ${largeArc} 1 ${x1outer} ${y1outer}`,
    `L ${x0inner} ${y0inner}`,
    `A ${r0} ${r0} 0 ${largeArc} 0 ${x1inner} ${y1inner}`,
    "Z",
  ].join(" ");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
