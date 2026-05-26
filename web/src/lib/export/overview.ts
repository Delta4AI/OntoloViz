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
 */

import { layoutSunburst, type LayoutNode } from "../ontology/layout";
import { renderSunburst } from "../ontology/render";
import type { Ontology, Subtree } from "../ontology/types";
import {
  RUNTIME_CSS,
  RUNTIME_JS,
  encodeRuntimeJson,
  toRuntimeSubtree,
  type ExportTheme,
} from "./runtime";

export interface OverviewExportOptions {
  /** Tile size in CSS pixels (sunburst area only — label sits above it). */
  readonly tileSize?: number;
  /** Number of columns. Falls back to a sqrt-based default. */
  readonly columns?: number;
  /** Outer background; pass `null` for transparent. */
  readonly background?: string | null;
  /** Document title — used for the SVG/HTML title tag. */
  readonly title?: string;
  /**
   * When true, each tile is wrapped in a clickable `<g class="ov-tile"
   * data-rootid="...">` with a transparent hit rect on top. Used by the
   * interactive HTML export to drill from overview into a single subtree.
   */
  readonly interactive?: boolean;
}

export interface OverviewPngOptions extends OverviewExportOptions {
  /** Retina multiplier. */
  readonly scale?: number;
}

const TILE_LABEL_HEIGHT = 40;
const TILE_GAP = 16;
const OUTER_PADDING = 24;
const LABEL_COLOR = "rgba(229, 231, 235, 0.92)";
const SUBLABEL_COLOR = "rgba(229, 231, 235, 0.55)";
const TILE_BG = "#0B0B10";
const TILE_BORDER = "rgba(255, 255, 255, 0.08)";

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
  readonly canvasWidth: number;
  readonly canvasHeight: number;
}

/** Lay out subtrees into a grid and return the composition + total size. */
function compose(ontology: Ontology, options: OverviewExportOptions): Composition {
  const tileSize = options.tileSize ?? 320;
  const subtrees = [...ontology.subtrees.values()].sort((a, b) =>
    a.rootId < b.rootId ? -1 : a.rootId > b.rootId ? 1 : 0,
  );

  const tiles: Tile[] = subtrees.map((subtree) => {
    const layout = layoutSunburst(subtree);
    const rootNode = subtree.nodes.get(subtree.rootId);
    const sublabel = `${subtree.nodes.size.toLocaleString()} nodes`;
    const title = rootNode?.label?.trim() || subtree.rootId;
    return { subtree, layout, title, sublabel };
  });

  const cols =
    options.columns ??
    Math.min(tiles.length, Math.max(1, Math.ceil(Math.sqrt(tiles.length))));
  const rows = Math.max(1, Math.ceil(tiles.length / cols));
  const tileTotalHeight = tileSize + TILE_LABEL_HEIGHT;

  const canvasWidth = OUTER_PADDING * 2 + cols * tileSize + (cols - 1) * TILE_GAP;
  const canvasHeight =
    OUTER_PADDING * 2 + rows * tileTotalHeight + (rows - 1) * TILE_GAP;

  return {
    tiles,
    cols,
    rows,
    tileSize,
    tileTotalHeight,
    canvasWidth,
    canvasHeight,
  };
}

/** Top-left position (CSS px) of the i-th tile within the composition. */
function tileOrigin(c: Composition, index: number): { x: number; y: number } {
  const col = index % c.cols;
  const row = Math.floor(index / c.cols);
  return {
    x: OUTER_PADDING + col * (c.tileSize + TILE_GAP),
    y: OUTER_PADDING + row * (c.tileTotalHeight + TILE_GAP),
  };
}

/* -------------------------------------------------------------------------- */
/* SVG                                                                         */
/* -------------------------------------------------------------------------- */

export function overviewToSvg(
  ontology: Ontology,
  options: OverviewExportOptions = {},
): string {
  const c = compose(ontology, options);
  const bg = options.background ?? "#06060A";

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${c.canvasWidth} ${c.canvasHeight}" width="${c.canvasWidth}" height="${c.canvasHeight}">`,
  );
  if (options.title) parts.push(`<title>${escapeXml(options.title)}</title>`);
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

  c.tiles.forEach((tile, i) => {
    const { x, y } = tileOrigin(c, i);
    const groupOpen = options.interactive
      ? `<g class="ov-tile" data-rootid="${escapeXml(tile.subtree.rootId)}">`
      : "<g>";
    parts.push(groupOpen);
    // Header band. In interactive mode the fill comes from CSS so the
    // text follows the document theme; static SVG export keeps explicit
    // colors so the artifact is portable on its own.
    const headerFill = options.interactive ? "" : ` fill="${LABEL_COLOR}"`;
    const subFill = options.interactive
      ? ' class="ov-sub"'
      : ` fill="${SUBLABEL_COLOR}"`;
    parts.push(
      `<text x="${x + 4}" y="${y + 18}"${headerFill} font-family="ui-sans-serif, system-ui, sans-serif" font-size="14" font-weight="600">${escapeXml(tile.subtree.rootId)}</text>`,
    );
    parts.push(
      `<text x="${x + c.tileSize - 4}" y="${y + 18}"${subFill} font-family="ui-sans-serif, system-ui, sans-serif" font-size="11" text-anchor="end">${escapeXml(tile.sublabel)}</text>`,
    );
    parts.push(
      `<text x="${x + 4}" y="${y + 34}"${subFill} font-family="ui-sans-serif, system-ui, sans-serif" font-size="11">${escapeXml(truncate(tile.title, Math.max(8, Math.floor(c.tileSize / 8))))}</text>`,
    );
    // Sunburst tile body
    const sx = x;
    const sy = y + TILE_LABEL_HEIGHT;
    const tileBgAttrs = options.interactive
      ? ""
      : ` fill="${TILE_BG}" stroke="${TILE_BORDER}"`;
    parts.push(
      `<rect class="ov-tile-bg" x="${sx}" y="${sy}" width="${c.tileSize}" height="${c.tileSize}" rx="8"${tileBgAttrs} stroke-width="1" />`,
    );
    parts.push(
      `<g transform="translate(${sx}, ${sy})">${tileToSvgPaths(tile.layout, c.tileSize)}</g>`,
    );
    if (options.interactive) {
      // Transparent hit target spanning header + body so the whole tile is
      // clickable regardless of where the cursor lands.
      const totalH = c.tileSize + TILE_LABEL_HEIGHT;
      parts.push(
        `<rect class="ov-tile-hit" x="${x}" y="${y}" width="${c.tileSize}" height="${totalH}"/>`,
      );
    }
    parts.push("</g>");
  });

  parts.push("</svg>");
  return parts.join("");
}

/** Emit just the slice paths for one tile (no outer <svg>). */
function tileToSvgPaths(layout: readonly LayoutNode[], size: number): string {
  const cx = size / 2;
  const cy = size / 2;
  const radius = Math.min(size, size) / 2 - 6;
  const stroke = "rgba(0, 0, 0, 0.35)";
  const strokeWidth = 0.4;
  const out: string[] = [];

  for (const slice of layout) {
    const dAngle = slice.x1 - slice.x0;
    if (dAngle <= 1e-9) continue;
    const r0 = slice.y0 * radius;
    const r1 = slice.y1 * radius;
    if (r1 <= r0) continue;
    const d = arcPath(cx, cy, slice.x0, slice.x1, r0, r1);
    const fill = slice.node.color || "#FFFFFF";
    out.push(
      `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`,
    );
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
  const c = compose(ontology, options);
  const scale = options.scale ?? 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(c.canvasWidth * scale));
  canvas.height = Math.max(1, Math.round(c.canvasHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("overviewToPngBlob: 2D context unavailable");
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  // Backdrop
  const bg = options.background ?? "#06060A";
  if (bg !== null) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, c.canvasWidth, c.canvasHeight);
  }

  ctx.font = "14px ui-sans-serif, system-ui, sans-serif";
  ctx.textBaseline = "alphabetic";

  c.tiles.forEach((tile, i) => {
    const { x, y } = tileOrigin(c, i);

    // Tile background
    ctx.fillStyle = TILE_BG;
    roundRect(ctx, x, y + TILE_LABEL_HEIGHT, c.tileSize, c.tileSize, 8);
    ctx.fill();
    ctx.strokeStyle = TILE_BORDER;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Header
    ctx.fillStyle = LABEL_COLOR;
    ctx.font = "600 14px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(tile.subtree.rootId, x + 4, y + 18);

    ctx.fillStyle = SUBLABEL_COLOR;
    ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(tile.sublabel, x + c.tileSize - 4, y + 18);

    ctx.textAlign = "left";
    ctx.fillText(
      truncate(tile.title, Math.max(8, Math.floor(c.tileSize / 8))),
      x + 4,
      y + 34,
    );

    // Sunburst
    ctx.save();
    ctx.translate(x, y + TILE_LABEL_HEIGHT);
    renderSunburst(ctx, tile.layout, {
      width: c.tileSize,
      height: c.tileSize,
      background: null,
    });
    ctx.restore();
  });

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
  } = {},
): string {
  const theme: ExportTheme = options.theme ?? "dark";
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
    `<html lang="en" data-theme="${theme}">`,
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
