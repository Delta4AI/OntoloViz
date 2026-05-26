import { useEffect, useRef, useState } from "react";

import { layoutSunburst } from "@/lib/ontology/layout";
import type { Ontology, Subtree } from "@/lib/ontology/types";
import { buildStandaloneHtml } from "@/lib/export/html";
import { downloadBlob, exportLayoutToPngBlob } from "@/lib/export/png";
import { layoutToSvg } from "@/lib/export/svg";
import { ontologyToTsv } from "@/lib/export/tsv";

interface ExportMenuProps {
  readonly subtree: Subtree | null;
  /** Full ontology — required for the OntoloViz-compatible TSV export. */
  readonly ontology?: Ontology | null;
  readonly focusId?: string;
  readonly width?: number;
  readonly height?: number;
}

/**
 * Header export dropdown. Builds the layout fresh on each export so the
 * output reflects the current focus and propagated state.
 */
export function ExportMenu({
  subtree,
  ontology,
  focusId,
  width = 1200,
  height = 1200,
}: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // The image exports (PNG/SVG/HTML) render one sunburst, so they require an
  // active subtree. The TSV export is whole-ontology, so it works on overview
  // too. Hide the menu entirely only when neither is available.
  if (!subtree && !ontology) return null;

  const filename = (ext: string) => {
    const slug = subtree?.rootId.toLowerCase() ?? "ontology";
    return `ontoloviz-${slug}-${Date.now()}.${ext}`;
  };

  const buildLayout = () =>
    subtree ? layoutSunburst(subtree, focusId !== undefined ? { focusId } : {}) : null;

  const handlePng = async () => {
    const layout = buildLayout();
    if (!layout) return;
    setBusy("png");
    try {
      const blob = await exportLayoutToPngBlob(layout, {
        width,
        height,
        scale: 2,
        background: "#0B0B10",
      });
      if (blob) downloadBlob(blob, filename("png"));
    } finally {
      setBusy(null);
      setOpen(false);
    }
  };

  const handleSvg = () => {
    const layout = buildLayout();
    if (!layout || !subtree) return;
    setBusy("svg");
    try {
      const svg = layoutToSvg(layout, {
        width,
        height,
        background: "#0B0B10",
        title: `OntoloViz · ${subtree.rootId}`,
      });
      downloadBlob(new Blob([svg], { type: "image/svg+xml" }), filename("svg"));
    } finally {
      setBusy(null);
      setOpen(false);
    }
  };

  const handleTsv = () => {
    if (!ontology) return;
    setBusy("tsv");
    try {
      const tsv = ontologyToTsv(ontology);
      downloadBlob(
        new Blob([tsv], { type: "text/tab-separated-values;charset=utf-8" }),
        filename("tsv"),
      );
    } finally {
      setBusy(null);
      setOpen(false);
    }
  };

  const handleHtml = () => {
    const layout = buildLayout();
    if (!layout || !subtree) return;
    setBusy("html");
    try {
      const html = buildStandaloneHtml(layout, {
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
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-md border border-border bg-elevated px-3 py-1.5 text-xs text-ink hover:bg-border"
      >
        Export ▾
      </button>
      {open ? (
        <div
          role="menu"
          className="fade-in absolute right-0 top-full z-40 mt-2 w-44 overflow-hidden rounded-lg border border-border bg-panel shadow-pop"
        >
          {subtree ? (
            <>
              <ExportRow
                label="PNG (2×)"
                hint="raster · 2400px"
                onClick={handlePng}
                busy={busy === "png"}
              />
              <ExportRow
                label="SVG"
                hint="vector · editable"
                onClick={handleSvg}
                busy={busy === "svg"}
              />
              <ExportRow
                label="HTML"
                hint="standalone · interactive"
                onClick={handleHtml}
                busy={busy === "html"}
              />
            </>
          ) : null}
          {ontology ? (
            <ExportRow
              label="TSV"
              hint="data · OntoloViz format"
              onClick={handleTsv}
              busy={busy === "tsv"}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ExportRow({
  label,
  hint,
  onClick,
  busy,
}: {
  readonly label: string;
  readonly hint: string;
  readonly onClick: () => void;
  readonly busy: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={busy}
      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-elevated disabled:opacity-50"
    >
      <span className="font-medium text-ink">{label}</span>
      <span className="font-mono text-[10px] text-muted">{busy ? "…" : hint}</span>
    </button>
  );
}
