import { useEffect, useRef, useState } from "react";

import { layoutSunburst } from "@/lib/ontology/layout";
import { useAppStore } from "@/lib/store";
import type { Ontology, Subtree } from "@/lib/ontology/types";
import { useTheme } from "@/lib/theme";
import { buildStandaloneHtml } from "@/lib/export/html";
import {
  overviewToHtml,
  overviewToPngBlob,
  overviewToSvg,
} from "@/lib/export/overview";
import { downloadBlob, exportLayoutToPngBlob } from "@/lib/export/png";
import { layoutToSvg } from "@/lib/export/svg";
import { ontologyToTsv } from "@/lib/export/tsv";

interface ExportMenuProps {
  readonly subtree: Subtree | null;
  /** Full ontology — required for the OntoloViz-compatible TSV export. */
  readonly ontology?: Ontology | null;
  readonly focusId?: string;
  /** Base canvas size; PNG outputs are this × scale. */
  readonly width?: number;
  readonly height?: number;
  /**
   * Active view mode — gates which image sections appear: overview view
   * shows overview options only, detail view shows subtree options only.
   * TSV (data) stays available in both since it's whole-ontology.
   */
  readonly viewMode?: "overview" | "detail";
  /**
   * Opens the configurable export panel. The dropdown's quick exports stay
   * for one-click defaults; "Export…" routes to the panel for fine-grained
   * control (presets, theme, dimensions, captions, live preview).
   */
  readonly onOpenPanel?: () => void;
}

const PNG_SCALES = [2, 4, 8] as const;
type PngScale = (typeof PNG_SCALES)[number];

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
  viewMode,
  onOpenPanel,
}: ExportMenuProps) {
  const showSubtreeSection = viewMode !== "overview" && Boolean(subtree);
  const showOverviewSection = viewMode !== "detail" && Boolean(ontology);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Snapshot the app's current theme so the interactive HTML exports match
  // the surface the user just clicked the export from.
  const theme = useTheme();
  const ringWeights = useAppStore((s) => s.layout.ringWeights);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Image exports render one sunburst, so they need an active subtree. TSV is
  // whole-ontology, so it stays available on overview too.
  if (!subtree && !ontology) return null;

  const filename = (ext: string) => {
    const slug = subtree?.rootId.toLowerCase() ?? "ontology";
    return `ontoloviz-${slug}-${Date.now()}.${ext}`;
  };

  const buildLayout = () =>
    subtree
      ? layoutSunburst(subtree, {
          ...(focusId !== undefined ? { focusId } : {}),
          ringWeights,
        })
      : null;

  const handlePng = async (scale: PngScale) => {
    const layout = buildLayout();
    if (!layout) return;
    const tag = `png${scale}`;
    setBusy(tag);
    try {
      const blob = await exportLayoutToPngBlob(layout, {
        width,
        height,
        scale,
        background: "#0B0B10",
      });
      if (blob) downloadBlob(blob, filename(`${scale}x.png`));
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

  const handleHtml = () => {
    if (!subtree) return;
    setBusy("html");
    try {
      const html = buildStandaloneHtml(subtree, {
        width,
        height,
        background: "#0B0B10",
        title: `OntoloViz · ${subtree.rootId}`,
        documentTitle: `OntoloViz · ${subtree.rootId}`,
        caption: `Subtree ${subtree.rootId} — ${subtree.nodes.size.toLocaleString()} nodes`,
        theme,
        ringWeights,
        ...(focusId !== undefined ? { initialFocus: focusId } : {}),
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

  const handleOverviewPng = async (scale: PngScale) => {
    if (!ontology) return;
    const tag = `opng${scale}`;
    setBusy(tag);
    try {
      const blob = await overviewToPngBlob(ontology, {
        scale,
        title: "OntoloViz · overview",
        ringWeights,
      });
      if (blob) downloadBlob(blob, filename(`overview-${scale}x.png`));
    } finally {
      setBusy(null);
      setOpen(false);
    }
  };

  const handleOverviewSvg = () => {
    if (!ontology) return;
    setBusy("osvg");
    try {
      const svg = overviewToSvg(ontology, {
        title: "OntoloViz · overview",
        ringWeights,
      });
      downloadBlob(
        new Blob([svg], { type: "image/svg+xml" }),
        filename("overview.svg"),
      );
    } finally {
      setBusy(null);
      setOpen(false);
    }
  };

  const handleOverviewHtml = () => {
    if (!ontology) return;
    setBusy("ohtml");
    try {
      const html = overviewToHtml(ontology, {
        title: "OntoloViz · overview",
        documentTitle: "OntoloViz · overview",
        htmlTheme: theme,
        ringWeights,
      });
      downloadBlob(
        new Blob([html], { type: "text/html;charset=utf-8" }),
        filename("overview.html"),
      );
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
          className="fade-in absolute right-0 top-full z-40 mt-2 w-72 overflow-hidden rounded-lg border border-border bg-panel py-1.5 shadow-pop"
        >
          {showSubtreeSection ? (
            <>
              <SectionLabel>Subtree image</SectionLabel>
              {PNG_SCALES.map((scale) => (
                <ExportRow
                  key={scale}
                  label={`PNG · ${scale}×`}
                  hint={`${(width * scale).toLocaleString()} × ${(height * scale).toLocaleString()} px`}
                  onClick={() => handlePng(scale)}
                  busy={busy === `png${scale}`}
                />
              ))}
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
          {showOverviewSection ? (
            <>
              {showSubtreeSection ? <Divider /> : null}
              <SectionLabel>Overview image</SectionLabel>
              {PNG_SCALES.map((scale) => (
                <ExportRow
                  key={`o${scale}`}
                  label={`PNG · ${scale}×`}
                  hint="all subtrees · grid"
                  onClick={() => handleOverviewPng(scale)}
                  busy={busy === `opng${scale}`}
                />
              ))}
              <ExportRow
                label="SVG"
                hint="all subtrees · vector"
                onClick={handleOverviewSvg}
                busy={busy === "osvg"}
              />
              <ExportRow
                label="HTML"
                hint="all subtrees · standalone"
                onClick={handleOverviewHtml}
                busy={busy === "ohtml"}
              />
            </>
          ) : null}
          {ontology ? (
            <>
              {showSubtreeSection || showOverviewSection ? <Divider /> : null}
              <SectionLabel>Data</SectionLabel>
              <ExportRow
                label="TSV"
                hint="OntoloViz format · full ontology"
                onClick={handleTsv}
                busy={busy === "tsv"}
              />
            </>
          ) : null}
          {onOpenPanel ? (
            <>
              <Divider />
              <ExportRow
                label="Customize export…"
                hint="presets, dimensions, …"
                onClick={() => {
                  setOpen(false);
                  onOpenPanel();
                }}
                busy={false}
              />
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SectionLabel({ children }: { readonly children: string }) {
  return (
    <div className="px-3 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-subtle">
      {children}
    </div>
  );
}

function Divider() {
  return <div className="my-1 h-px bg-border/60" aria-hidden />;
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
      className="flex w-full items-baseline justify-between gap-4 whitespace-nowrap px-3 py-1.5 text-left text-xs hover:bg-elevated disabled:opacity-50"
    >
      <span className="font-medium text-ink">{label}</span>
      <span className="text-[11px] text-muted">{busy ? "exporting…" : hint}</span>
    </button>
  );
}
