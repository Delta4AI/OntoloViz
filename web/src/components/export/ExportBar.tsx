import { useState } from "react";

import { layoutSunburst } from "@/lib/ontology/layout";
import type { Subtree } from "@/lib/ontology/types";
import { buildStandaloneHtml } from "@/lib/export/html";
import { downloadBlob, exportLayoutToPngBlob } from "@/lib/export/png";
import { layoutToSvg } from "@/lib/export/svg";

interface ExportBarProps {
  readonly subtree: Subtree;
  readonly focusId?: string;
  /** Export resolution in CSS pixels (will be DPR-multiplied for PNG). */
  readonly width?: number;
  readonly height?: number;
}

/**
 * Three-button export strip — PNG (high-DPI), SVG (vector), HTML (standalone).
 *
 * Each button rebuilds the layout fresh so the export reflects the current
 * focus and propagated state without coupling to the canvas's internal state.
 */
export function ExportBar({
  subtree,
  focusId,
  width = 1200,
  height = 1200,
}: ExportBarProps) {
  const [busy, setBusy] = useState<string | null>(null);

  const filename = (ext: string) =>
    `ontoloviz-${subtree.rootId.toLowerCase()}-${Date.now()}.${ext}`;

  const buildLayout = () =>
    layoutSunburst(subtree, focusId !== undefined ? { focusId } : {});

  const handlePng = async () => {
    setBusy("png");
    try {
      const layout = buildLayout();
      const blob = await exportLayoutToPngBlob(layout, {
        width,
        height,
        scale: 2,
        background: "#0B0B10",
      });
      if (blob) downloadBlob(blob, filename("png"));
    } finally {
      setBusy(null);
    }
  };

  const handleSvg = () => {
    setBusy("svg");
    try {
      const svg = layoutToSvg(buildLayout(), {
        width,
        height,
        background: "#0B0B10",
        title: `OntoloViz · ${subtree.rootId}`,
      });
      downloadBlob(new Blob([svg], { type: "image/svg+xml" }), filename("svg"));
    } finally {
      setBusy(null);
    }
  };

  const handleHtml = () => {
    setBusy("html");
    try {
      const html = buildStandaloneHtml(buildLayout(), {
        width,
        height,
        background: "#0B0B10",
        title: `OntoloViz · ${subtree.rootId}`,
        documentTitle: `OntoloViz · ${subtree.rootId}`,
        caption: `Subtree ${subtree.rootId} — ${subtree.nodes.size.toLocaleString()} nodes`,
      });
      downloadBlob(
        new Blob([html], { type: "text/html;charset=utf-8" }),
        filename("html"),
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-wrap gap-2 text-xs">
      <ExportButton onClick={handlePng} busy={busy === "png"} label="PNG (2x)" />
      <ExportButton onClick={handleSvg} busy={busy === "svg"} label="SVG" />
      <ExportButton onClick={handleHtml} busy={busy === "html"} label="HTML" />
    </div>
  );
}

function ExportButton({
  onClick,
  busy,
  label,
}: {
  readonly onClick: () => void;
  readonly busy: boolean;
  readonly label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="rounded border border-line bg-white/5 px-3 py-1.5 font-mono uppercase tracking-widest text-white/80 transition hover:bg-white/10 disabled:opacity-50"
    >
      {busy ? "…" : label}
    </button>
  );
}
