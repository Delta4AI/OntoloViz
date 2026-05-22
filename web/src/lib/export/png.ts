/**
 * High-DPI PNG export for a sunburst layout.
 *
 * Allocates an off-screen canvas at `width * scale` × `height * scale` and
 * replays `renderSunburst` into it, then asks the browser for a PNG blob.
 *
 * Pure with respect to the on-screen canvas — the caller's DOM is never
 * touched. The download wrapper triggers a temporary `<a download>` click;
 * browsers route that through their standard save dialog.
 */

import type { LayoutNode } from "../ontology/layout";
import { renderSunburst } from "../ontology/render";

export interface PngExportOptions {
  /** Logical width (CSS pixels). */
  readonly width: number;
  /** Logical height (CSS pixels). */
  readonly height: number;
  /** Render scale — typically 2 or 4 for retina-quality output. */
  readonly scale?: number;
  /** Background fill; pass `null` for transparent. */
  readonly background?: string | null;
}

/**
 * Paint the layout into an off-screen canvas and return it. Caller decides
 * what to do with it (toBlob, toDataURL, draw further, etc.).
 */
export function renderLayoutToCanvas(
  layout: readonly LayoutNode[],
  options: PngExportOptions,
): HTMLCanvasElement {
  const scale = options.scale ?? 2;
  const w = Math.max(1, Math.round(options.width));
  const h = Math.max(1, Math.round(options.height));
  const canvas = document.createElement("canvas");
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("renderLayoutToCanvas: 2D context unavailable");
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  renderSunburst(ctx, layout, {
    width: w,
    height: h,
    background: options.background ?? "#0B0B10",
  });
  return canvas;
}

/**
 * Render the layout and return a PNG `Blob`. Resolves to `null` if the
 * browser cannot encode the canvas (very unusual; only old engines).
 */
export async function exportLayoutToPngBlob(
  layout: readonly LayoutNode[],
  options: PngExportOptions,
): Promise<Blob | null> {
  const canvas = renderLayoutToCanvas(layout, options);
  return await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/** Trigger a download of a Blob with the given filename. Browser-only. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Defer revoke to give the browser a tick to consume the URL.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
