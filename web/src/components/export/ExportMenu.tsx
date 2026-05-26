import { useEffect, useRef, useState } from "react";

import { layoutSunburst } from "@/lib/ontology/layout";
import type { Subtree } from "@/lib/ontology/types";
import { buildStandaloneHtml } from "@/lib/export/html";
import { downloadBlob, exportLayoutToPngBlob } from "@/lib/export/png";
import { layoutToSvg } from "@/lib/export/svg";

interface ExportMenuProps {
  readonly subtree: Subtree | null;
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

  if (!subtree) return null;

  const filename = (ext: string) =>
    `ontoloviz-${subtree.rootId.toLowerCase()}-${Date.now()}.${ext}`;

  const buildLayout = () =>
    layoutSunburst(subtree, focusId !== undefined ? { focusId } : {});

  const handlePng = async () => {
    setBusy("png");
    try {
      const blob = await exportLayoutToPngBlob(buildLayout(), {
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
      setOpen(false);
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
