/**
 * Self-contained interactive HTML export for a single subtree.
 *
 * Ships the subtree's full node graph + an inline JS runtime (partition,
 * arc rendering, tooltip, click-to-focus, breadcrumb). Clicking a slice
 * re-partitions with it as the new root — mirroring the live app's
 * focus-zoom — clicking the focused slice or a breadcrumb navigates up.
 *
 * Without JavaScript the page still shows an initial server-rendered SVG
 * of the root layout (read-only fallback). The runtime takes over on load.
 */

import { layoutSunburst } from "../ontology/layout";
import type { Subtree } from "../ontology/types";
import {
  RUNTIME_CSS,
  RUNTIME_JS,
  encodeRuntimeJson,
  toRuntimeSubtree,
  type HtmlTheme,
} from "./runtime";
import { layoutToSvg, type SvgOptions } from "./svg";

export interface HtmlExportOptions extends Omit<SvgOptions, "theme"> {
  /** Document <title> shown in the browser tab. */
  readonly documentTitle?: string;
  /** Optional caption rendered below the figure. */
  readonly caption?: string;
  /** Initial focus node id; defaults to the subtree root. */
  readonly initialFocus?: string;
  /**
   * Theme stamped on `<html data-theme>` so the runtime's CSS picks the
   * matching palette. Distinct from the `ExportTheme` used by static SVG/PNG.
   */
  readonly theme?: HtmlTheme;
}

export function buildStandaloneHtml(
  subtree: Subtree,
  options: HtmlExportOptions,
): string {
  const initialFocus = options.initialFocus ?? subtree.rootId;
  const layout = layoutSunburst(subtree, { focusId: initialFocus });
  // Strip the HtmlTheme-typed `theme` field before forwarding — it conflicts
  // with the static SVG renderer's `ExportTheme` slot. The HTML output drives
  // theme via the `data-theme` attribute on `<html>` instead.
  const { theme: _htmlTheme, ...svgForward } = options;
  void _htmlTheme;
  const svg = layoutToSvg(layout, { ...svgForward, interactive: true });
  const title = options.documentTitle ?? "OntoloViz export";
  const caption = options.caption ?? "";
  const runtimeSubtree = toRuntimeSubtree(subtree);
  const dataJson = encodeRuntimeJson({
    subtree: runtimeSubtree,
    initialFocus,
  });

  const theme: HtmlTheme = options.theme ?? "dark";
  return [
    "<!doctype html>",
    `<html lang="en" data-theme="${theme}">`,
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${escapeHtml(title)}</title>`,
    `<style>${RUNTIME_CSS}</style>`,
    "</head>",
    "<body>",
    '<div class="ov-app">',
    '<div class="ov-toolbar">',
    `<div class="ov-title">${escapeHtml(title)}</div>`,
    '<nav class="ov-crumbs" id="ov-crumbs" aria-label="Breadcrumb"></nav>',
    "</div>",
    '<div class="ov-stage" id="ov-stage">',
    "<figure>",
    svg,
    caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : "",
    "</figure>",
    "</div>",
    "</div>",
    '<div id="ov-tip" role="tooltip" aria-hidden="true"></div>',
    `<script>${RUNTIME_JS}</script>`,
    "<script>",
    `(function(){var D=${dataJson};`,
    "var stage = document.querySelector('#ov-stage figure');",
    "var crumbs = document.getElementById('ov-crumbs');",
    "var tip = document.getElementById('ov-tip');",
    "window.OntoloViz.mount({ stage: stage, subtree: D.subtree, initialFocus: D.initialFocus, crumbHost: crumbs, tooltip: tip });",
    "})();",
    "</script>",
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
