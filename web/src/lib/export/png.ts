/**
 * High-DPI PNG export for a sunburst layout.
 *
 * Allocates an off-screen canvas at `(width * scale)` × `(height * scale)` and
 * replays `renderSunburst` into it, then asks the browser for a PNG blob. The
 * canvas can optionally include a title band on top and a caption band on the
 * bottom — both rendered with the export theme's font — so a single PNG can
 * stand alone as a publication or slide figure without extra layout work.
 *
 * Pure with respect to the on-screen canvas — the caller's DOM is never
 * touched. The download wrapper triggers a temporary `<a download>` click;
 * browsers route that through their standard save dialog.
 */

import type { LayoutNode } from "../ontology/layout";
import { renderSunburst } from "../ontology/render";
import { EXPORT_THEME_DEFAULT, type ExportTheme } from "./theme";

export interface PngExportOptions {
  /** Logical width (CSS pixels). */
  readonly width: number;
  /** Logical height (CSS pixels). */
  readonly height: number;
  /** Render scale — typically 2 or 4 for retina-quality output. */
  readonly scale?: number;
  /** Background fill; pass `null` for transparent. */
  readonly background?: string | null;
  /** Optional title rendered above the sunburst (requires `showHeader: true`). */
  readonly title?: string;
  /** Optional caption rendered below the sunburst (requires `showHeader: true`). */
  readonly caption?: string;
  /**
   * Render title + caption as visible bands burned into the PNG. Off by
   * default so legacy callers (the export dropdown) keep producing a clean
   * chart image at the original dimensions.
   */
  readonly showHeader?: boolean;
  /** Font size (CSS px) for the title band. Defaults to 18. */
  readonly titleFontSize?: number;
  /** Font size (CSS px) for the caption band. Defaults to 12. */
  readonly captionFontSize?: number;
  /**
   * Theme baseline for background/stroke/font. Per-field options above
   * still win.
   */
  readonly theme?: ExportTheme;
}

const DEFAULT_TITLE_FONT = 18;
const DEFAULT_CAPTION_FONT = 12;
const titleBandFor = (fontSize: number): number => Math.round(fontSize * 2.4);
const captionBandFor = (fontSize: number): number => Math.round(fontSize * 2.8);

/**
 * Slice-border thickness that keeps borders visually consistent regardless
 * of figure size. Calibrated so an 800px figure gets ~1.3px borders (matching
 * the on-screen sunburst's perceived weight) and a 2400px figure gets ~4px
 * borders that survive PNG viewer downsampling without disappearing.
 */
export function proportionalStrokeWidth(width: number, height: number): number {
  return Math.max(1, Math.min(width, height) / 600);
}

/**
 * Paint the layout into an off-screen canvas and return it. Caller decides
 * what to do with it (toBlob, toDataURL, draw further, etc.).
 */
export function renderLayoutToCanvas(
  layout: readonly LayoutNode[],
  options: PngExportOptions,
): HTMLCanvasElement {
  const theme = options.theme ?? EXPORT_THEME_DEFAULT;
  const scale = options.scale ?? 2;
  const w = Math.max(1, Math.round(options.width));
  const h = Math.max(1, Math.round(options.height));
  const wantBands = options.showHeader === true;
  const titleText = options.title?.trim() ?? "";
  const captionText = options.caption?.trim() ?? "";
  const titleFontSize = options.titleFontSize ?? DEFAULT_TITLE_FONT;
  const captionFontSize = options.captionFontSize ?? DEFAULT_CAPTION_FONT;
  const topBand = wantBands && titleText ? titleBandFor(titleFontSize) : 0;
  const bottomBand = wantBands && captionText ? captionBandFor(captionFontSize) : 0;
  const sunburstHeight = Math.max(1, h - topBand - bottomBand);

  const canvas = document.createElement("canvas");
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("renderLayoutToCanvas: 2D context unavailable");
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  const bg = options.background ?? theme.background;
  if (options.background !== null) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
  }

  if (topBand > 0) {
    ctx.fillStyle = theme.labelColor;
    ctx.font = `600 ${titleFontSize}px ${theme.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(titleText, w / 2, topBand * 0.55);
  }

  ctx.save();
  ctx.translate(0, topBand);
  renderSunburst(ctx, layout, {
    width: w,
    height: sunburstHeight,
    // The outer canvas already carries the background; keep the inner area
    // transparent so the title/caption bands aren't double-painted.
    background: null,
    theme,
    // Scale border thickness with figure size so a 2400×2400 export's
    // strokes don't read as hairlines after PNG viewers downsample.
    strokeWidth: proportionalStrokeWidth(w, sunburstHeight),
  });
  ctx.restore();

  if (bottomBand > 0) {
    ctx.fillStyle = theme.sublabelColor;
    ctx.font = `${captionFontSize}px ${theme.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(captionText, w / 2, h - bottomBand * 0.45);
  }

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
