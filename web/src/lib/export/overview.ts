/**
 * Overview-grid export.
 *
 * The on-screen overview is a grid of small sunburst tiles, one per subtree.
 * The image exporters (PNG/SVG/HTML) only know how to render a single
 * sunburst, so this module composes them into one artifact.
 *
 * SVG path: emit one `<g transform>` per tile wrapping the per-subtree slices.
 * PNG path: paint into an offscreen canvas, translating between tiles.
 * HTML path: reuses the SVG inside the existing standalone-HTML template.
 *
 * Theming: pass an `ExportTheme` for background/stroke/label/font. Two label
 * placements are supported — `above` (legacy app look) and `below`
 * (figure-caption style for publication) and `overlay` (in-tile). Tile
 * borders are opt-in via `tileBorder` so publication exports can ship a
 * borderless grid.
 */

import { layoutSunburst, type LayoutNode } from "../ontology/layout";
import { renderSunburst } from "../ontology/render";
import { proportionalStrokeWidth } from "./png";
import type { Ontology, Subtree } from "../ontology/types";
import {
  RUNTIME_CSS,
  RUNTIME_JS,
  encodeRuntimeJson,
  toRuntimeSubtree,
  type HtmlTheme,
} from "./runtime";
import {
  DEFAULT_OVERVIEW_LABEL_POSITIONS,
  DEFAULT_OVERVIEW_LABEL_STYLES,
  EXPORT_THEME_DEFAULT,
  type ExportLabelFlags,
  type ExportTheme,
  type LabelAlign,
  type LabelPosition,
  type LabelPositions,
  type OverviewLabelStyle,
  type OverviewLabelStyles,
} from "./theme";

export interface OverviewExportOptions {
  /** Tile size in CSS pixels (sunburst area only — label sits above it). */
  readonly tileSize?: number;
  /** Number of columns. Falls back to a sqrt-based default. */
  readonly columns?: number;
  /** Outer background; pass `null` for transparent. */
  readonly background?: string | null;
  /** Document title — used for the SVG/HTML title tag. */
  readonly title?: string;
  /** Optional caption rendered below the grid (requires `showHeader: true`). */
  readonly caption?: string;
  /**
   * Render title + caption as visible bands above/below the grid. Off by
   * default so legacy callers (the dropdown) keep producing the same
   * artifact; the panel turns this on explicitly.
   */
  readonly showHeader?: boolean;
  /** Font size (CSS px) for the title band. Defaults to 18. */
  readonly titleFontSize?: number;
  /** Font size (CSS px) for the caption band. Defaults to 12. */
  readonly captionFontSize?: number;
  /**
   * When true, each tile is wrapped in a clickable `<g class="ov-tile"
   * data-rootid="...">` with a transparent hit rect on top. Used by the
   * interactive HTML export to drill from overview into a single subtree.
   */
  readonly interactive?: boolean;
  /** Theme baseline. Defaults to the in-app dark look for back-compat. */
  readonly theme?: ExportTheme;
  /** Whether to draw a 1px stroke around each tile. */
  readonly tileBorder?: boolean;
  /** Per-label placement (above tile / below tile / overlay inside tile). */
  readonly labelPositions?: LabelPositions;
  /** Which label fields to include per tile. */
  readonly labels?: ExportLabelFlags;
  /** Per-element styling (font size, weight, alignment) for tile labels. */
  readonly labelStyles?: OverviewLabelStyles;
  /** Outer padding around the grid in CSS px. */
  readonly outerPadding?: number;
  /** Gap between tiles in CSS px. */
  readonly tileGap?: number;
  /**
   * Per-depth ring thickness weights (see `LayoutOptions.ringWeights`). Applied
   * to every static grid tile so the export matches the on-screen overview.
   */
  readonly ringWeights?: readonly number[];
}

export interface OverviewPngOptions extends OverviewExportOptions {
  /** Retina multiplier. */
  readonly scale?: number;
}

// Matches the pre-panel overview look so the dropdown's one-shot exports
// keep producing the same artifact when callers don't pass `labels`.
const DEFAULT_LABELS: ExportLabelFlags = { id: true, count: true, name: true };
const DEFAULT_TITLE_FONT = 18;
const DEFAULT_CAPTION_FONT = 12;
const titleBandFor = (fontSize: number): number => Math.round(fontSize * 2.6);
const captionBandFor = (fontSize: number): number => Math.round(fontSize * 3);

interface Tile {
  readonly subtree: Subtree;
  readonly layout: readonly LayoutNode[];
  readonly title: string;
  readonly sublabel: string;
}

/** Source order — labels stack id → count → name within each band. */
const LABEL_ORDER: readonly (keyof OverviewLabelStyles)[] = ["id", "count", "name"];

type LabelKey = keyof OverviewLabelStyles;

/**
 * A single label placement inside a tile. `yOffset` is measured from the
 * tile's top-left corner (the slot that includes the above-band, sunburst,
 * and below-band), so render code can simply compute `y + yOffset` without
 * branching on position.
 */
interface LabelPlacement {
  readonly key: LabelKey;
  readonly position: LabelPosition;
  readonly yOffset: number;
  /**
   * Effective horizontal anchor for this label. For above/below labels this
   * mirrors the user's per-label align. For overlay labels it is fixed by
   * role (id → left, count → right, name → center) so id + count share the
   * top row instead of stacking and name sits at bottom-center.
   */
  readonly align: LabelAlign;
}

/**
 * Overlay-mode slot per label key. Drives both vertical anchor (top vs
 * bottom of the tile) and horizontal alignment when the user picks overlay.
 */
const OVERLAY_SLOTS: Record<
  LabelKey,
  {
    readonly align: LabelAlign;
    readonly anchor: "top" | "bottom";
  }
> = {
  id: { align: "left", anchor: "top" },
  count: { align: "right", anchor: "top" },
  name: { align: "center", anchor: "bottom" },
};

interface Composition {
  readonly tiles: readonly Tile[];
  readonly cols: number;
  readonly rows: number;
  readonly tileSize: number;
  readonly tileTotalHeight: number;
  readonly aboveBandH: number;
  readonly belowBandH: number;
  /** Per-label placements, in render order. Drives both SVG and PNG paths. */
  readonly placements: readonly LabelPlacement[];
  readonly outerPadding: number;
  readonly tileGap: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly topBand: number;
  readonly bottomBand: number;
  readonly titleFontSize: number;
  readonly captionFontSize: number;
  readonly labelStyles: OverviewLabelStyles;
  readonly labels: ExportLabelFlags;
}

/**
 * Plan per-label placements and the heights of the above/below bands. Each
 * enabled label contributes its own row in its chosen band, so users can mix
 * (e.g. id overlay, count below, name below) without one position dictating
 * the others. Overlay labels stack inside the sunburst area from the top.
 */
function computeLayout(
  labels: ExportLabelFlags,
  positions: LabelPositions,
  styles: OverviewLabelStyles,
  tileSize: number,
): {
  placements: LabelPlacement[];
  aboveBandH: number;
  belowBandH: number;
} {
  const rowH = (k: LabelKey): number => styles[k].fontSize + 8;
  const aboveKeys: LabelKey[] = [];
  const belowKeys: LabelKey[] = [];
  const overlayKeys: LabelKey[] = [];
  for (const k of LABEL_ORDER) {
    if (!labels[k]) continue;
    const pos = positions[k];
    if (pos === "above") aboveKeys.push(k);
    else if (pos === "below") belowKeys.push(k);
    else overlayKeys.push(k);
  }

  const aboveBandH = aboveKeys.reduce((s, k) => s + rowH(k), 0);
  const belowBandH = belowKeys.reduce((s, k) => s + rowH(k), 0);

  const placements: LabelPlacement[] = [];

  // Above band — stack from the top, each row spaced by its own font.
  let cursor = 0;
  for (const k of aboveKeys) {
    placements.push({
      key: k,
      position: "above",
      yOffset: cursor + Math.round(styles[k].fontSize * 0.85) + 4,
      align: styles[k].align,
    });
    cursor += rowH(k);
  }

  // Below band — starts immediately under the sunburst.
  cursor = aboveBandH + tileSize;
  for (const k of belowKeys) {
    placements.push({
      key: k,
      position: "below",
      yOffset: cursor + Math.round(styles[k].fontSize * 0.85) + 4,
      align: styles[k].align,
    });
    cursor += rowH(k);
  }

  // Overlay — slot-based by key so id + count share the top row (left and
  // right corners) and name sits centered at the bottom. Top-row labels
  // share a baseline derived from the tallest of the two so they line up.
  const topOverlayKeys = overlayKeys.filter((k) => OVERLAY_SLOTS[k].anchor === "top");
  const bottomOverlayKeys = overlayKeys.filter(
    (k) => OVERLAY_SLOTS[k].anchor === "bottom",
  );
  if (topOverlayKeys.length > 0) {
    const tallest = topOverlayKeys.reduce((m, k) => Math.max(m, styles[k].fontSize), 0);
    const topY = aboveBandH + Math.round(tallest * 0.85) + 6;
    for (const k of topOverlayKeys) {
      placements.push({
        key: k,
        position: "overlay",
        yOffset: topY,
        align: OVERLAY_SLOTS[k].align,
      });
    }
  }
  for (const k of bottomOverlayKeys) {
    // Baseline a hair above the tile bottom so descenders stay inside.
    const yOffset =
      aboveBandH + tileSize - Math.max(4, Math.round(styles[k].fontSize * 0.25));
    placements.push({
      key: k,
      position: "overlay",
      yOffset,
      align: OVERLAY_SLOTS[k].align,
    });
  }

  return { placements, aboveBandH, belowBandH };
}

/** Lay out subtrees into a grid and return the composition + total size. */
function compose(ontology: Ontology, options: OverviewExportOptions): Composition {
  const tileSize = options.tileSize ?? 320;
  const positions: LabelPositions =
    options.labelPositions ?? DEFAULT_OVERVIEW_LABEL_POSITIONS;
  const labels = options.labels ?? DEFAULT_LABELS;
  const outerPadding = options.outerPadding ?? 24;
  const tileGap = options.tileGap ?? 16;

  const subtrees = [...ontology.subtrees.values()].sort((a, b) =>
    a.rootId < b.rootId ? -1 : a.rootId > b.rootId ? 1 : 0,
  );

  const tiles: Tile[] = subtrees.map((subtree) => {
    const layout = layoutSunburst(
      subtree,
      options.ringWeights ? { ringWeights: options.ringWeights } : {},
    );
    const rootNode = subtree.nodes.get(subtree.rootId);
    const sublabel = labels.count ? `${subtree.nodes.size.toLocaleString()} nodes` : "";
    const title = labels.name ? rootNode?.label?.trim() || subtree.rootId : "";
    return { subtree, layout, title, sublabel };
  });

  const cols =
    options.columns ??
    Math.min(tiles.length, Math.max(1, Math.ceil(Math.sqrt(tiles.length))));
  const rows = Math.max(1, Math.ceil(tiles.length / cols));
  const labelStyles = options.labelStyles ?? DEFAULT_OVERVIEW_LABEL_STYLES;

  const { placements, aboveBandH, belowBandH } = computeLayout(
    labels,
    positions,
    labelStyles,
    tileSize,
  );
  const tileTotalHeight = aboveBandH + tileSize + belowBandH;

  const trimmedTitle = options.title?.trim() ?? "";
  const trimmedCaption = options.caption?.trim() ?? "";
  const titleFontSize = options.titleFontSize ?? DEFAULT_TITLE_FONT;
  const captionFontSize = options.captionFontSize ?? DEFAULT_CAPTION_FONT;
  // Header bands are opt-in via `showHeader`. Interactive HTML exports
  // never get them — the HTML shell draws its own toolbar.
  const wantBands = options.showHeader === true && !options.interactive;
  const topBand = wantBands && trimmedTitle ? titleBandFor(titleFontSize) : 0;
  const bottomBand = wantBands && trimmedCaption ? captionBandFor(captionFontSize) : 0;

  const canvasWidth = outerPadding * 2 + cols * tileSize + (cols - 1) * tileGap;
  const canvasHeight =
    topBand +
    bottomBand +
    outerPadding * 2 +
    rows * tileTotalHeight +
    (rows - 1) * tileGap;

  return {
    tiles,
    cols,
    rows,
    tileSize,
    tileTotalHeight,
    aboveBandH,
    belowBandH,
    placements,
    outerPadding,
    tileGap,
    canvasWidth,
    canvasHeight,
    topBand,
    bottomBand,
    titleFontSize,
    captionFontSize,
    labelStyles,
    labels,
  };
}

/** Inset from the tile edge for left/right alignments. */
const LABEL_EDGE_PADDING = 4;

function alignToAnchor(align: LabelAlign): "start" | "middle" | "end" {
  return align === "center" ? "middle" : align === "right" ? "end" : "start";
}

function alignToCanvasTextAlign(align: LabelAlign): "left" | "center" | "right" {
  return align;
}

/**
 * X coordinate (in user-space px) at which a single label should anchor,
 * given the tile's left edge and the label's alignment. Pairs with
 * `alignToAnchor` for SVG and `alignToCanvasTextAlign` for canvas.
 */
function alignToX(align: LabelAlign, tileLeft: number, tileSize: number): number {
  if (align === "center") return tileLeft + tileSize / 2;
  if (align === "right") return tileLeft + tileSize - LABEL_EDGE_PADDING;
  return tileLeft + LABEL_EDGE_PADDING;
}

function fontWeight(style: OverviewLabelStyle): number {
  return style.bold ? 600 : 400;
}

/** Top-left position (CSS px) of the i-th tile within the composition. */
function tileOrigin(c: Composition, index: number): { x: number; y: number } {
  const col = index % c.cols;
  const row = Math.floor(index / c.cols);
  return {
    x: c.outerPadding + col * (c.tileSize + c.tileGap),
    y: c.topBand + c.outerPadding + row * (c.tileTotalHeight + c.tileGap),
  };
}

/** Source text for a label key, given a tile and the current tile size. */
function labelTextFor(key: LabelKey, tile: Tile, tileSize: number): string {
  if (key === "id") return tile.subtree.rootId;
  if (key === "count") return tile.sublabel;
  return tile.title ? truncate(tile.title, Math.max(8, Math.floor(tileSize / 8))) : "";
}

/* -------------------------------------------------------------------------- */
/* SVG                                                                         */
/* -------------------------------------------------------------------------- */

export function overviewToSvg(
  ontology: Ontology,
  options: OverviewExportOptions = {},
): string {
  const theme = options.theme ?? EXPORT_THEME_DEFAULT;
  const c = compose(ontology, options);
  const bg = options.background === undefined ? theme.background : options.background;
  const tileBorderStroke =
    (options.tileBorder ?? false) ? theme.stroke || "rgba(0, 0, 0, 0.12)" : "";
  const titleText = options.title?.trim() ?? "";
  const captionText = options.caption?.trim() ?? "";

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${c.canvasWidth} ${c.canvasHeight}" width="${c.canvasWidth}" height="${c.canvasHeight}">`,
  );
  if (titleText) parts.push(`<title>${escapeXml(titleText)}</title>`);
  if (bg !== null) {
    if (options.interactive) {
      parts.push(
        `<rect class="ov-canvas-bg" width="${c.canvasWidth}" height="${c.canvasHeight}" />`,
      );
    } else {
      parts.push(
        `<rect width="${c.canvasWidth}" height="${c.canvasHeight}" fill="${bg}" />`,
      );
    }
  }

  if (c.topBand > 0) {
    parts.push(
      `<text x="${c.canvasWidth / 2}" y="${Math.round(c.topBand * 0.62)}" text-anchor="middle" font-family="${escapeAttr(theme.fontFamily)}" font-size="${c.titleFontSize}" font-weight="600" fill="${theme.labelColor}">${escapeXml(titleText)}</text>`,
    );
  }

  c.tiles.forEach((tile, i) => {
    const { x, y } = tileOrigin(c, i);
    const groupOpen = options.interactive
      ? `<g class="ov-tile" data-rootid="${escapeXml(tile.subtree.rootId)}">`
      : "<g>";
    parts.push(groupOpen);

    const headerFill = options.interactive ? "" : ` fill="${theme.labelColor}"`;
    const subFill = options.interactive
      ? ' class="ov-sub"'
      : ` fill="${theme.sublabelColor}"`;
    const fontAttr = ` font-family="${escapeAttr(theme.fontFamily)}"`;

    const sy = y + c.aboveBandH;
    const tileBgFill = options.interactive ? "" : ` fill="${theme.background}"`;
    const tileBgStroke = tileBorderStroke
      ? options.interactive
        ? ""
        : ` stroke="${tileBorderStroke}"`
      : "";
    parts.push(
      `<rect class="ov-tile-bg" x="${x}" y="${sy}" width="${c.tileSize}" height="${c.tileSize}" rx="8"${tileBgFill}${tileBgStroke} stroke-width="1" />`,
    );
    parts.push(
      `<g transform="translate(${x}, ${sy})">${tileToSvgPaths(tile.layout, c.tileSize, theme)}</g>`,
    );

    const emitText = (
      text: string,
      style: OverviewLabelStyle,
      align: LabelAlign,
      tx: number,
      ty: number,
      isPrimary: boolean,
    ): void => {
      const anchor = alignToAnchor(align);
      const fill = isPrimary ? headerFill : subFill;
      parts.push(
        `<text x="${tx}" y="${ty}"${fontAttr} font-size="${style.fontSize}" font-weight="${fontWeight(style)}" text-anchor="${anchor}"${fill}>${escapeXml(text)}</text>`,
      );
    };

    for (const placement of c.placements) {
      const text = labelTextFor(placement.key, tile, c.tileSize);
      if (!text) continue;
      const style = c.labelStyles[placement.key];
      emitText(
        text,
        style,
        placement.align,
        alignToX(placement.align, x, c.tileSize),
        y + placement.yOffset,
        placement.key === "id",
      );
    }

    if (options.interactive) {
      parts.push(
        `<rect class="ov-tile-hit" x="${x}" y="${y}" width="${c.tileSize}" height="${c.tileTotalHeight}"/>`,
      );
    }
    parts.push("</g>");
  });

  if (c.bottomBand > 0) {
    const cy = c.canvasHeight - Math.round(c.bottomBand * 0.42);
    parts.push(
      `<text x="${c.canvasWidth / 2}" y="${cy}" text-anchor="middle" font-family="${escapeAttr(theme.fontFamily)}" font-size="${c.captionFontSize}" fill="${theme.sublabelColor}">${escapeXml(captionText)}</text>`,
    );
  }

  parts.push("</svg>");
  return parts.join("");
}

/** Emit just the slice paths for one tile (no outer <svg>). */
function tileToSvgPaths(
  layout: readonly LayoutNode[],
  size: number,
  theme: ExportTheme,
): string {
  const cx = size / 2;
  const cy = size / 2;
  const radius = Math.min(size, size) / 2 - 6;
  const stroke = theme.stroke;
  const hasStroke = stroke !== "";
  const strokeWidth = Math.max(1, size / 600);
  const out: string[] = [];

  for (const slice of layout) {
    const dAngle = slice.x1 - slice.x0;
    if (dAngle <= 1e-9) continue;
    const r0 = slice.y0 * radius;
    const r1 = slice.y1 * radius;
    if (r1 <= r0) continue;
    const d = arcPath(cx, cy, slice.x0, slice.x1, r0, r1);
    const fill = slice.node.color || "#FFFFFF";
    const strokeAttrs = hasStroke
      ? ` stroke="${stroke}" stroke-width="${strokeWidth}"`
      : "";
    out.push(`<path d="${d}" fill="${fill}"${strokeAttrs}/>`);
  }
  return out.join("");
}

const TWO_PI = 2 * Math.PI;

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

  if (dAngle >= TWO_PI - 1e-9) {
    const midAngle = a0 + Math.PI;
    const midX = cx + r1 * Math.cos(midAngle);
    const midY = cy + r1 * Math.sin(midAngle);
    if (r0 <= 0) {
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

/* -------------------------------------------------------------------------- */
/* PNG                                                                         */
/* -------------------------------------------------------------------------- */

export async function overviewToPngBlob(
  ontology: Ontology,
  options: OverviewPngOptions = {},
): Promise<Blob | null> {
  const theme = options.theme ?? EXPORT_THEME_DEFAULT;
  const c = compose(ontology, options);
  const scale = options.scale ?? 2;
  const wantBorder = options.tileBorder ?? false;
  const titleText = options.title?.trim() ?? "";
  const captionText = options.caption?.trim() ?? "";

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(c.canvasWidth * scale));
  canvas.height = Math.max(1, Math.round(c.canvasHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("overviewToPngBlob: 2D context unavailable");
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  const bg = options.background === undefined ? theme.background : options.background;
  if (bg !== null) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, c.canvasWidth, c.canvasHeight);
  }

  if (c.topBand > 0) {
    ctx.fillStyle = theme.labelColor;
    ctx.font = `600 ${c.titleFontSize}px ${theme.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(titleText, c.canvasWidth / 2, c.topBand * 0.55);
  }

  ctx.textBaseline = "alphabetic";

  c.tiles.forEach((tile, i) => {
    const { x, y } = tileOrigin(c, i);
    const sy = y + c.aboveBandH;

    ctx.fillStyle = theme.background;
    roundRect(ctx, x, sy, c.tileSize, c.tileSize, 8);
    ctx.fill();
    if (wantBorder && theme.stroke) {
      ctx.strokeStyle = theme.stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Sunburst body first; labels paint on top so overlay-mode stays legible.
    ctx.save();
    ctx.translate(x, sy);
    renderSunburst(ctx, tile.layout, {
      width: c.tileSize,
      height: c.tileSize,
      background: null,
      theme,
      strokeWidth: proportionalStrokeWidth(c.tileSize, c.tileSize),
    });
    ctx.restore();

    const drawText = (
      text: string,
      style: OverviewLabelStyle,
      align: LabelAlign,
      tx: number,
      ty: number,
      color: string,
    ): void => {
      ctx.fillStyle = color;
      ctx.font = `${style.bold ? "600 " : ""}${style.fontSize}px ${theme.fontFamily}`;
      ctx.textAlign = alignToCanvasTextAlign(align);
      ctx.fillText(text, tx, ty);
    };

    for (const placement of c.placements) {
      const text = labelTextFor(placement.key, tile, c.tileSize);
      if (!text) continue;
      const style = c.labelStyles[placement.key];
      drawText(
        text,
        style,
        placement.align,
        alignToX(placement.align, x, c.tileSize),
        y + placement.yOffset,
        placement.key === "id" ? theme.labelColor : theme.sublabelColor,
      );
    }
  });

  if (c.bottomBand > 0) {
    ctx.fillStyle = theme.sublabelColor;
    ctx.font = `${c.captionFontSize}px ${theme.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(captionText, c.canvasWidth / 2, c.canvasHeight - c.bottomBand * 0.45);
  }

  return await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/* -------------------------------------------------------------------------- */
/* HTML                                                                        */
/* -------------------------------------------------------------------------- */

export function overviewToHtml(
  ontology: Ontology,
  options: OverviewExportOptions & {
    readonly documentTitle?: string;
    /** Initial color theme of the exported HTML. Defaults to dark. */
    readonly theme?: ExportTheme;
    /** Theme stamped on <html data-theme>; defaults to dark. */
    readonly htmlTheme?: HtmlTheme;
  } = {},
): string {
  const htmlTheme: HtmlTheme = options.htmlTheme ?? "dark";
  const gridSvg = overviewToSvg(ontology, { ...options, interactive: true });
  const docTitle = options.documentTitle ?? options.title ?? "OntoloViz overview";

  const subtreesData: Record<
    string,
    { rootId: string; nodes: ReturnType<typeof toRuntimeSubtree>["nodes"] }
  > = {};
  for (const subtree of ontology.subtrees.values()) {
    subtreesData[subtree.rootId] = toRuntimeSubtree(subtree);
  }
  const dataJson = encodeRuntimeJson({ subtrees: subtreesData });

  // Detail-view SVG dimensions — square viewport scales to whatever the
  // browser window can fit. The runtime never touches the viewBox.
  const detailSize = 800;

  return [
    "<!doctype html>",
    `<html lang="en" data-theme="${htmlTheme}">`,
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${escapeHtml(docTitle)}</title>`,
    `<style>${RUNTIME_CSS}</style>`,
    "</head>",
    "<body>",
    '<div class="ov-app">',
    '<div class="ov-toolbar">',
    '<button class="ov-back" id="ov-back" hidden>&larr; Overview</button>',
    `<div class="ov-title">${escapeHtml(docTitle)}</div>`,
    '<nav class="ov-crumbs" id="ov-crumbs" aria-label="Breadcrumb"></nav>',
    "</div>",
    '<div class="ov-grid" id="ov-grid">',
    gridSvg,
    "</div>",
    '<div class="ov-stage" id="ov-stage" hidden>',
    "<figure>",
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${detailSize} ${detailSize}" width="${detailSize}" height="${detailSize}"></svg>`,
    "</figure>",
    "</div>",
    "</div>",
    '<div id="ov-tip" role="tooltip" aria-hidden="true"></div>',
    `<script>${RUNTIME_JS}</script>`,
    "<script>",
    `(function(){var D=${dataJson};`,
    "var grid = document.getElementById('ov-grid');",
    "var stage = document.getElementById('ov-stage');",
    "var stageFigure = stage.querySelector('figure');",
    "var crumbs = document.getElementById('ov-crumbs');",
    "var back = document.getElementById('ov-back');",
    "var tip = document.getElementById('ov-tip');",
    "function showGrid(){",
    "  stage.hidden = true; grid.hidden = false;",
    "  back.hidden = true; crumbs.innerHTML = '';",
    "  tip.classList.remove('is-visible');",
    "}",
    "function openSubtree(rootId){",
    "  var sub = D.subtrees[rootId]; if (!sub) return;",
    "  grid.hidden = true; stage.hidden = false; back.hidden = false;",
    "  // Fresh SVG each time so the previous mount's listeners are dropped.",
    '  stageFigure.innerHTML = \'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 \' + ' +
      detailSize +
      " + ' ' + " +
      detailSize +
      " + '\" width=\"' + " +
      detailSize +
      " + '\" height=\"' + " +
      detailSize +
      " + '\"></svg>';",
    "  window.OntoloViz.mount({ stage: stageFigure, subtree: sub, crumbHost: crumbs, tooltip: tip });",
    "}",
    "back.addEventListener('click', showGrid);",
    "grid.addEventListener('click', function(e){",
    "  var t = e.target;",
    "  while (t && t !== grid){",
    "    if (t.classList && t.classList.contains('ov-tile')){",
    "      var id = t.getAttribute('data-rootid');",
    "      if (id) openSubtree(id);",
    "      return;",
    "    }",
    "    t = t.parentNode;",
    "  }",
    "});",
    "})();",
    "</script>",
    "</body>",
    "</html>",
  ].join("\n");
}

/* -------------------------------------------------------------------------- */
/* Utility                                                                     */
/* -------------------------------------------------------------------------- */

function truncate(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s;
  return s.slice(0, Math.max(1, maxChars - 1)) + "…";
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
