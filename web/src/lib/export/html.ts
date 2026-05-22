/**
 * Self-contained interactive HTML export.
 *
 * Wraps the generated SVG in a minimal HTML document. The SVG already carries
 * `<title>` children per slice, so the browser provides native hover tooltips
 * — interactivity without shipping a JS bundle. Suitable for sharing as a
 * single artifact that opens in any modern browser.
 */

import type { LayoutNode } from "../ontology/layout";
import { layoutToSvg, type SvgOptions } from "./svg";

export interface HtmlExportOptions extends SvgOptions {
  /** Document <title> shown in the browser tab. */
  readonly documentTitle?: string;
  /** Optional caption rendered below the figure. */
  readonly caption?: string;
}

export function buildStandaloneHtml(
  layout: readonly LayoutNode[],
  options: HtmlExportOptions,
): string {
  const svg = layoutToSvg(layout, options);
  const title = options.documentTitle ?? "OntoloViz export";
  const caption = options.caption ?? "";
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${escapeHtml(title)}</title>`,
    "<style>",
    "  :root { color-scheme: dark; }",
    "  body { margin: 0; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; background: #0B0B10; color: #E5E7EB; font-family: ui-sans-serif, system-ui, sans-serif; }",
    "  figure { margin: 0; max-width: 95vw; }",
    "  figcaption { margin-top: 0.75rem; font-size: 0.875rem; opacity: 0.7; text-align: center; }",
    "  svg { max-width: 100%; height: auto; }",
    "</style>",
    "</head>",
    "<body>",
    "<figure>",
    svg,
    caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : "",
    "</figure>",
    "</body>",
    "</html>",
  ].join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
