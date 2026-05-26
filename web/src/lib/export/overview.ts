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
  DEFAULT_OVERVIEW_LABEL_STYLES,
  EXPORT_THEME_DEFAULT,
  type ExportLabelFlags,
  type ExportTheme,
  type LabelAlign,
  type LabelPosition,
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
  /** Where to place the per-tile label. */
  readonly labelPosition?: LabelPosition;
  /** Which label fields to include per tile. */
  readonly labels?: ExportLabelFlags;
  /** Per-element styling (font size, weight, alignment) for tile labels. */
  readonly labelStyles?: OverviewLabelStyles;
  /** Outer padding around the grid in CSS px. */
  readonly outerPadding?: number;
  /** Gap between tiles in CSS px. */
  readonly tileGap?: number;
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

interface Composition {
  readonly tiles: readonly Tile[];
  readonly cols: number;
  readonly rows: number;
  readonly tileSize: number;
  readonly tileTotalHeight: number;
  readonly labelHeight: number;
  /** Y offset within the label band where the first text row's baseline sits. */
  readonly labelFirstBaseline: number;
  /** Y offset within the label band where the second text row's baseline sits. */
  readonly labelSecondBaseline: number;
  readonly labelPosition: LabelPosition;
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

/** Lay out subtrees into a grid and return the composition + total size. */
function compose(ontology: Ontology, options: OverviewExportOptions): Composition {
  const tileSize = options.tileSize ?? 320;
  const labelPosition: LabelPosition = options.labelPosition ?? "above";
  const labels = options.labels ?? DEFAULT_LABELS;
  const outerPadding = options.outerPadding ?? 24;
  const tileGap = options.tileGap ?? 16;

  const subtrees = [...ontology.subtrees.values()].sort((a, b) =>
    a.rootId < b.rootId ? -1 : a.rootId > b.rootId ? 1 : 0,
  );

  const tiles: Tile[] = subtrees.map((subtree) => {
    const layout = layoutSunburst(subtree);
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
  // Above/below stack id+count on the first row and name on the second row
  // (when present). Heights scale with the actual font sizes so a 24px id
  // doesn't get clipped. Overlay keeps zero extra height — labels float
  // inside the sunburst area.
  const wantFirstRow = labels.id || labels.count;
  const wantNameLine = labels.name && labelPosition !== "overlay";
  const firstRowFontH = Math.max(
    labels.id ? labelStyles.id.fontSize : 0,
    labels.count ? labelStyles.count.fontSize : 0,
  );
  const firstRowH = wantFirstRow ? firstRowFontH + 8 : 0;
  const secondRowH = wantNameLine ? labelStyles.name.fontSize + 10 : 0;
  const labelHeight = labelPosition === "overlay" ? 0 : firstRowH + secondRowH;
  // Baselines are measured from the top of the label band. SVG `y` on
  // `<text>` is the glyph baseline, so we offset by ~80% of the row's
  // font height to put the top of the glyph near the band's top.
  const labelFirstBaseline = wantFirstRow ? Math.round(firstRowFontH * 0.85) : 0;
  const labelSecondBaseline = wantNameLine
    ? labelFirstBaseline +
      (wantFirstRow ? 6 : 0) +
      Math.round(labelStyles.name.fontSize * 1.2)
    : 0;
  const tileTotalHeight = tileSize + labelHeight;

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
    labelHeight,
    labelPosition,
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
    labelFirstBaseline,
    labelSecondBaseline,
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

/** Y of the sunburst body relative to a tile's top, depending on label pos. */
function sunburstYOffset(c: Composition): number {
  return c.labelPosition === "above" ? c.labelHeight : 0;
}

/** Y where label text should render relative to a tile's top. */
function labelBandY(c: Composition): number {
  return c.labelPosition === "below" ? c.tileSize : 0;
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
  const labels = options.labels ?? DEFAULT_LABELS;
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

    const sy = y + sunburstYOffset(c);
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

    const styles = c.labelStyles;
    const emitText = (
      text: string,
      style: OverviewLabelStyle,
      tx: number,
      ty: number,
      isPrimary: boolean,
    ): void => {
      const anchor = alignToAnchor(style.align);
      const fill = isPrimary ? headerFill : subFill;
      parts.push(
        `<text x="${tx}" y="${ty}"${fontAttr} font-size="${style.fontSize}" font-weight="${fontWeight(style)}" text-anchor="${anchor}"${fill}>${escapeXml(text)}</text>`,
      );
    };

    if (c.labelPosition === "overlay") {
      // Anchor labels inside the tile's top region. Vertical offset scales
      // with the id font size so larger glyphs aren't clipped.
      const idTop = sy + Math.round(styles.id.fontSize * 0.85) + 4;
      const subTop = idTop + Math.round(styles.count.fontSize * 1.2);
      if (labels.id) {
        emitText(
          tile.subtree.rootId,
          styles.id,
          alignToX(styles.id.align, x, c.tileSize),
          idTop,
          true,
        );
      }
      if (tile.sublabel) {
        emitText(
          tile.sublabel,
          styles.count,
          alignToX(styles.count.align, x, c.tileSize),
          subTop,
          false,
        );
      }
    } else {
      const labelY = y + labelBandY(c);
      const idY = labelY + c.labelFirstBaseline + 4;
      const nameY = labelY + c.labelSecondBaseline + 4;
      if (labels.id) {
        emitText(
          tile.subtree.rootId,
          styles.id,
          alignToX(styles.id.align, x, c.tileSize),
          idY,
          true,
        );
      }
      if (tile.sublabel) {
        emitText(
          tile.sublabel,
          styles.count,
          alignToX(styles.count.align, x, c.tileSize),
          idY,
          false,
        );
      }
      if (tile.title) {
        emitText(
          truncate(tile.title, Math.max(8, Math.floor(c.tileSize / 8))),
          styles.name,
          alignToX(styles.name.align, x, c.tileSize),
          nameY,
          false,
        );
      }
    }

    if (options.interactive) {
      const totalH = c.tileSize + c.labelHeight;
      parts.push(
        `<rect class="ov-tile-hit" x="${x}" y="${y}" width="${c.tileSize}" height="${totalH}"/>`,
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
  const labels = options.labels ?? DEFAULT_LABELS;
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
    const sy = y + sunburstYOffset(c);

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

    const styles = c.labelStyles;
    const drawText = (
      text: string,
      style: OverviewLabelStyle,
      tx: number,
      ty: number,
      color: string,
    ): void => {
      ctx.fillStyle = color;
      ctx.font = `${style.bold ? "600 " : ""}${style.fontSize}px ${theme.fontFamily}`;
      ctx.textAlign = alignToCanvasTextAlign(style.align);
      ctx.fillText(text, tx, ty);
    };

    if (c.labelPosition === "overlay") {
      const idTop = sy + Math.round(styles.id.fontSize * 0.85) + 4;
      const subTop = idTop + Math.round(styles.count.fontSize * 1.2);
      if (labels.id) {
        drawText(
          tile.subtree.rootId,
          styles.id,
          alignToX(styles.id.align, x, c.tileSize),
          idTop,
          theme.labelColor,
        );
      }
      if (tile.sublabel) {
        drawText(
          tile.sublabel,
          styles.count,
          alignToX(styles.count.align, x, c.tileSize),
          subTop,
          theme.sublabelColor,
        );
      }
    } else {
      const labelY = y + labelBandY(c);
      const idY = labelY + c.labelFirstBaseline + 4;
      const nameY = labelY + c.labelSecondBaseline + 4;
      if (labels.id) {
        drawText(
          tile.subtree.rootId,
          styles.id,
          alignToX(styles.id.align, x, c.tileSize),
          idY,
          theme.labelColor,
        );
      }
      if (tile.sublabel) {
        drawText(
          tile.sublabel,
          styles.count,
          alignToX(styles.count.align, x, c.tileSize),
          idY,
          theme.sublabelColor,
        );
      }
      if (tile.title) {
        drawText(
          truncate(tile.title, Math.max(8, Math.floor(c.tileSize / 8))),
          styles.name,
          alignToX(styles.name.align, x, c.tileSize),
          nameY,
          theme.sublabelColor,
        );
      }
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
