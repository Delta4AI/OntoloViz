/**
 * Export workspace — fills the main area while the user tunes a publication
 * or presentation figure. Replaces the live sunburst/table while open so the
 * interactive UI doesn't distract from the export task and the preview can
 * use the full canvas area instead of a thumbnail.
 *
 * Layout:
 *   left:  large inline SVG preview (full-fidelity, render-equivalent to the
 *          final artifact for PNG and SVG)
 *   right: 380px control rail with preset chips, scope/format, dimensions,
 *          theme overrides, label visibility/position, title + caption (with
 *          their own font sizes), and the download button
 *
 * Scope: PNG + SVG only. HTML and TSV are kept on the dropdown — the
 * workspace is for high-quality images. Title + caption auto-burn when set
 * (no separate "burn" toggle).
 */

import { useDeferredValue, useMemo, type ReactNode } from "react";

import { layoutSunburst } from "@/lib/ontology/layout";
import { useAppStore } from "@/lib/store";
import type { Ontology, Subtree } from "@/lib/ontology/types";
import { useTheme } from "@/lib/theme";
import { overviewToPngBlob, overviewToSvg } from "@/lib/export/overview";
import { downloadBlob, exportLayoutToPngBlob } from "@/lib/export/png";
import { layoutToSvg } from "@/lib/export/svg";
import {
  ASPECT_OPTIONS,
  EXPORT_PRESETS,
  dimensionsFor,
  resolveExportFontFamily,
  useExportConfig,
  type ExportAspect,
  type ExportConfig,
  type ExportFontChoice,
  type ExportFormat,
  type ExportScope,
} from "@/lib/exportConfig";
import type { ExportLabelLine } from "@/lib/export/labelBands";
import {
  getPreset,
  webThemeFor,
  type ExportLabelFlags,
  type ExportTheme,
  type LabelAlign,
  type LabelPosition,
  type OverviewLabelStyle,
  type SubtreeLabelFlags,
} from "@/lib/export/theme";

interface ExportPanelProps {
  readonly subtree: Subtree | null;
  readonly ontology: Ontology | null;
  readonly focusId?: string;
  /**
   * Locked scope derived from the active app view. The panel renders only the
   * controls relevant to this scope — opening export from overview gives you
   * overview-only options, and from detail you get subtree-only options.
   */
  readonly scope: ExportScope;
  readonly onClose: () => void;
}

const FONT_OPTIONS: readonly { value: ExportFontChoice; label: string }[] = [
  { value: "sans", label: "Sans" },
  { value: "serif", label: "Serif" },
];

const LABEL_POSITIONS: readonly { value: LabelPosition; label: string }[] = [
  { value: "above", label: "Above" },
  { value: "below", label: "Below" },
  { value: "overlay", label: "Overlay" },
];

const LABEL_ALIGNS: readonly { value: LabelAlign; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];

const OVERVIEW_LABEL_KEYS: readonly { key: keyof ExportLabelFlags; label: string }[] = [
  { key: "id", label: "Id" },
  { key: "count", label: "Count" },
  { key: "name", label: "Name" },
];

const SUBTREE_LABEL_KEYS: readonly { key: keyof SubtreeLabelFlags; label: string }[] = [
  { key: "id", label: "Id" },
  { key: "header", label: "Header (name)" },
  { key: "description", label: "Description" },
];

export function ExportPanel({
  subtree,
  ontology,
  focusId,
  scope,
  onClose,
}: ExportPanelProps) {
  const config = useExportConfig((s) => s.config);
  const update = useExportConfig((s) => s.update);
  const applyPreset = useExportConfig((s) => s.applyPreset);
  const appTheme = useTheme();
  const ringWeights = useAppStore((s) => s.layout.ringWeights);

  const preset = getPreset(config.presetId);
  // The "web" preset mirrors the running app's data-theme — picking it
  // while the app is in light mode should produce a light figure. Other
  // presets carry a fixed theme by design (publication is always white,
  // presentation is always dark).
  const presetTheme: ExportTheme =
    preset.id === "web" ? webThemeFor(appTheme) : preset.theme;
  const themeForExport: ExportTheme = useMemo(
    () => ({
      ...presetTheme,
      background: config.backgroundOverride || presetTheme.background,
      fontFamily: resolveExportFontFamily(config),
    }),
    [presetTheme, config],
  );

  // Scope is locked by the parent to the current view mode — opening export
  // from the overview gives overview-only controls, and from a subtree gives
  // subtree-only controls. The persisted config.scope is ignored.
  const effectiveScope: ExportScope = scope;

  // Apply the user's subtree-exclusion list to produce the ontology the
  // exporter actually sees. Subtree-scope exports don't use this — they
  // always render the one active subtree.
  const filteredOntology = useMemo<Ontology | null>(() => {
    if (!ontology) return null;
    if (effectiveScope !== "overview") return ontology;
    if (config.excludedRootIds.length === 0) return ontology;
    const excluded = new Set(config.excludedRootIds);
    const next = new Map<string, Subtree>();
    let nodeCount = 0;
    for (const [rootId, sub] of ontology.subtrees) {
      if (excluded.has(rootId)) continue;
      next.set(rootId, sub);
      nodeCount += sub.nodes.size;
    }
    return { ...ontology, subtrees: next, nodeCount };
  }, [ontology, effectiveScope, config.excludedRootIds]);

  // Defer the preview inputs so re-rendering the (often expensive) SVG runs
  // at low priority — the control rail stays responsive while the figure
  // catches up. Mirrors the propagation-deferral pattern in App.tsx.
  // Downloads keep using the live `config` / `themeForExport` /
  // `filteredOntology` so the artifact reflects exactly what the user
  // just clicked.
  const deferredConfig = useDeferredValue(config);
  const deferredAppTheme = useDeferredValue(appTheme);
  const deferredFilteredOntology = useDeferredValue(filteredOntology);
  const previewTheme: ExportTheme = useMemo(() => {
    const p = getPreset(deferredConfig.presetId);
    const pt = p.id === "web" ? webThemeFor(deferredAppTheme) : p.theme;
    return {
      ...pt,
      background: deferredConfig.backgroundOverride || pt.background,
      fontFamily: resolveExportFontFamily(deferredConfig),
    };
  }, [deferredConfig, deferredAppTheme]);
  const isPreviewBusy =
    config !== deferredConfig ||
    appTheme !== deferredAppTheme ||
    filteredOntology !== deferredFilteredOntology;

  const previewSvg = useMemo(
    () =>
      buildPreviewSvg({
        scope: effectiveScope,
        config: deferredConfig,
        theme: previewTheme,
        subtree,
        ontology: deferredFilteredOntology,
        focusId,
        ringWeights,
        busy: isPreviewBusy,
      }),
    [
      effectiveScope,
      deferredConfig,
      previewTheme,
      subtree,
      deferredFilteredOntology,
      focusId,
      ringWeights,
      isPreviewBusy,
    ],
  );

  const handleDownload = async (format: ExportFormat) => {
    const filename = buildFilename(config, effectiveScope, subtree, format);
    if (effectiveScope === "overview") {
      if (!filteredOntology) return;
      await downloadOverview({
        ontology: filteredOntology,
        config,
        theme: themeForExport,
        filename,
        format,
        ringWeights,
      });
    } else {
      if (!subtree) return;
      await downloadSubtree({
        subtree,
        config,
        theme: themeForExport,
        filename,
        focusId,
        format,
        ringWeights,
      });
    }
  };

  const overviewHasTiles =
    filteredOntology !== null && filteredOntology.subtrees.size > 0;
  const downloadDisabled =
    (effectiveScope === "subtree" && !subtree) ||
    (effectiveScope === "overview" && !overviewHasTiles);

  return (
    <div className="grid h-full grid-cols-[1fr_380px] overflow-hidden">
      <PreviewStage theme={previewTheme} busy={isPreviewBusy}>
        {previewSvg}
      </PreviewStage>

      <aside className="flex h-full min-h-0 flex-col border-l border-border bg-panel text-sm">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Export</h2>
            <p className="text-[11px] text-muted">
              Live preview · PNG / SVG with theme + caption
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close export panel"
            className="rounded-md border border-border bg-elevated px-2 py-1 text-xs text-muted hover:bg-border hover:text-ink"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <Section title="Preset">
            <div className="grid grid-cols-1 gap-1.5">
              {EXPORT_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id)}
                  className={
                    config.presetId === p.id
                      ? "rounded-md border border-accent bg-accent/15 px-2.5 py-1.5 text-left text-[11px] text-ink"
                      : "rounded-md border border-border bg-elevated px-2.5 py-1.5 text-left text-[11px] text-muted hover:bg-border hover:text-ink"
                  }
                >
                  <div className="font-medium">{p.label}</div>
                  <div className="mt-0.5 text-[10px] leading-snug opacity-80">
                    {p.description}
                  </div>
                </button>
              ))}
            </div>
          </Section>

          <Divider />

          {effectiveScope === "subtree" ? (
            <Section title="Dimensions">
              <Chips
                options={ASPECT_OPTIONS.map((a) => ({
                  value: a.id,
                  label: a.label,
                }))}
                value={config.aspect}
                onChange={(aspect: ExportAspect) => {
                  const dims = dimensionsFor(aspect, {
                    width: config.width,
                    height: config.height,
                  });
                  update({ aspect, ...dims });
                }}
              />
              <div className="mt-3 grid grid-cols-2 gap-3">
                <NumberField
                  label="Width"
                  value={config.width}
                  min={200}
                  max={6000}
                  disabled={config.aspect !== "custom"}
                  onChange={(width) => update({ width, aspect: "custom" })}
                />
                <NumberField
                  label="Height"
                  value={config.height}
                  min={200}
                  max={6000}
                  disabled={config.aspect !== "custom"}
                  onChange={(height) => update({ height, aspect: "custom" })}
                />
              </div>
            </Section>
          ) : (
            <>
              <Section title="Layout">
                <NumberField
                  label="Columns"
                  value={config.columns}
                  min={1}
                  max={12}
                  onChange={(columns) => update({ columns })}
                />
                <p className="text-[10px] leading-snug text-muted">
                  Overview canvas size is derived from columns × tile count. To change
                  the figure shape, adjust columns.
                </p>
              </Section>

              <Divider />

              <SubtreesSection
                ontology={ontology}
                excluded={config.excludedRootIds}
                onChange={(excludedRootIds) => update({ excludedRootIds })}
              />
            </>
          )}

          <Divider />

          <Section title="Style">
            <ColorRow
              label="Background"
              value={themeForExport.background}
              onChange={(backgroundOverride) => update({ backgroundOverride })}
              {...(config.backgroundOverride
                ? { onReset: () => update({ backgroundOverride: "" }) }
                : {})}
            />
            <RadioRow
              label="Font"
              options={FONT_OPTIONS}
              value={config.fontChoice}
              onChange={(fontChoice) => update({ fontChoice })}
            />
            {effectiveScope === "overview" ? (
              <ToggleRow
                label="Tile borders"
                checked={config.tileBorder}
                onChange={(tileBorder) => update({ tileBorder })}
                hint="1px stroke around each overview tile"
              />
            ) : null}
            <NumberField
              label="Padding"
              value={config.padding}
              min={0}
              max={120}
              onChange={(padding) => update({ padding })}
            />
          </Section>

          <Divider />

          {effectiveScope === "overview" ? (
            <LabelsSection
              keys={OVERVIEW_LABEL_KEYS}
              labels={config.labels}
              labelStyles={config.labelStyles}
              labelPositions={config.labelPositions}
              overlayHint="Overlay snaps each label to a corner (id ↖ · count ↗ · name ↓ center)"
              overlayAutoAligns
              onLabelsChange={(labels) => update({ labels })}
              onStylesChange={(labelStyles) => update({ labelStyles })}
              onPositionsChange={(labelPositions) => update({ labelPositions })}
            />
          ) : (
            <LabelsSection
              keys={SUBTREE_LABEL_KEYS}
              labels={config.subtreeLabels}
              labelStyles={config.subtreeLabelStyles}
              labelPositions={config.subtreeLabelPositions}
              overlayHint="Overlay centers the label inside the sunburst"
              overlayAutoAligns={false}
              onLabelsChange={(subtreeLabels) => update({ subtreeLabels })}
              onStylesChange={(subtreeLabelStyles) => update({ subtreeLabelStyles })}
              onPositionsChange={(subtreeLabelPositions) =>
                update({ subtreeLabelPositions })
              }
            />
          )}

          <Divider />

          <Section title="Title & caption">
            <p className="text-[10px] leading-snug text-muted">
              Both bands burn into the figure when non-empty. Leave blank to omit.
            </p>
            <TextField
              label="Title"
              value={config.title}
              onChange={(title) => update({ title })}
              placeholder="Figure title"
            />
            <NumberField
              label="Title font size (px)"
              value={config.titleFontSize}
              min={8}
              max={64}
              onChange={(titleFontSize) => update({ titleFontSize })}
            />
            <TextField
              label="Caption"
              value={config.caption}
              onChange={(caption) => update({ caption })}
              placeholder="e.g. Subtree A · 1,234 nodes"
            />
            <NumberField
              label="Caption font size (px)"
              value={config.captionFontSize}
              min={6}
              max={48}
              onChange={(captionFontSize) => update({ captionFontSize })}
            />
          </Section>

          <Section title="PNG quality">
            <RadioRow
              label="Scale"
              options={[
                { value: "2", label: "2×" },
                { value: "4", label: "4×" },
                { value: "8", label: "8×" },
              ]}
              value={String(config.pngScale)}
              onChange={(v) => update({ pngScale: Number(v) })}
            />
          </Section>
        </div>

        <footer className="grid grid-cols-2 gap-2 border-t border-border bg-panel px-5 py-3">
          <button
            type="button"
            onClick={() => void handleDownload("svg")}
            className="rounded-md border border-accent bg-transparent px-3 py-2 text-xs font-medium text-accent hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={downloadDisabled}
            title="Vector — scales losslessly, editable in design tools"
          >
            Download SVG
          </button>
          <button
            type="button"
            onClick={() => void handleDownload("png")}
            className="rounded-md bg-accent px-3 py-2 text-xs font-medium text-on-accent hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
            disabled={downloadDisabled}
            title={`Raster at ${config.pngScale}× scale`}
          >
            Download PNG · {config.pngScale}×
          </button>
        </footer>
      </aside>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Preview                                                                     */
/* -------------------------------------------------------------------------- */

interface BuildPreviewSvgArgs {
  readonly scope: ExportScope;
  readonly config: ExportConfig;
  readonly theme: ExportTheme;
  readonly subtree: Subtree | null;
  readonly ontology: Ontology | null;
  readonly focusId: string | undefined;
  readonly ringWeights: readonly number[];
  readonly busy: boolean;
}

/**
 * Resolve the configured subtree labels into renderable caption lines, pulling
 * id / name / description from the focused root node. Skips disabled labels and
 * empty fields (e.g. a node with no description).
 */
function buildSubtreeLabelLines(
  config: ExportConfig,
  subtree: Subtree,
  focusId: string | undefined,
): readonly ExportLabelLine[] {
  const node = subtree.nodes.get(focusId ?? subtree.rootId);
  if (!node) return [];
  const fields: readonly {
    readonly key: keyof SubtreeLabelFlags;
    readonly text: string;
    readonly muted: boolean;
  }[] = [
    { key: "id", text: node.id, muted: true },
    { key: "header", text: node.label, muted: false },
    { key: "description", text: node.description, muted: true },
  ];
  const lines: ExportLabelLine[] = [];
  for (const f of fields) {
    if (!config.subtreeLabels[f.key]) continue;
    if (!f.text.trim()) continue;
    const style = config.subtreeLabelStyles[f.key];
    lines.push({
      text: f.text,
      position: config.subtreeLabelPositions[f.key],
      fontSize: style.fontSize,
      bold: style.bold,
      align: style.align,
      muted: f.muted,
    });
  }
  return lines;
}

function buildPreviewSvg(args: BuildPreviewSvgArgs): ReactNode {
  const { scope, config, theme, subtree, ontology, ringWeights, busy } = args;
  const burnHeader = Boolean(config.title.trim() || config.caption.trim());

  if (scope === "overview") {
    if (!ontology) return <EmptyPreview>No ontology loaded</EmptyPreview>;
    const svg = overviewToSvg(ontology, {
      tileSize: 320,
      columns: config.columns,
      background: theme.background,
      theme,
      tileBorder: config.tileBorder,
      labels: config.labels,
      labelPositions: config.labelPositions,
      labelStyles: config.labelStyles,
      outerPadding: config.padding,
      showHeader: burnHeader,
      titleFontSize: config.titleFontSize,
      captionFontSize: config.captionFontSize,
      ringWeights,
      ...(config.title ? { title: config.title } : {}),
      ...(config.caption ? { caption: config.caption } : {}),
    });
    return <FittedSvg svg={svg} busy={busy} />;
  }

  if (!subtree) return <EmptyPreview>No active subtree</EmptyPreview>;
  const layout = layoutSunburst(subtree, {
    ...(args.focusId !== undefined ? { focusId: args.focusId } : {}),
    ringWeights,
  });
  const svg = layoutToSvg(layout, {
    width: config.width,
    height: config.height,
    background: theme.background,
    // Slice strokes always follow the theme so subtree exports never lose
    // their borders regardless of preset.
    stroke: theme.stroke,
    theme,
    showHeader: burnHeader,
    titleFontSize: config.titleFontSize,
    captionFontSize: config.captionFontSize,
    labels: buildSubtreeLabelLines(config, subtree, args.focusId),
    ...(config.title ? { title: config.title } : {}),
    ...(config.caption ? { caption: config.caption } : {}),
  });
  return <FittedSvg svg={svg} busy={busy} />;
}

/**
 * Render the SVG so the figure visibly matches its configured width/height
 * aspect inside the stage. We keep the SVG's intrinsic width/height
 * attributes — they give the browser the aspect ratio to honor — and use
 * CSS `max-width:100%; max-height:100%; width:auto; height:auto` so the
 * SVG shrinks to fit while preserving aspect. The classic responsive-img
 * pattern; works reliably across browsers without juggling `aspect-ratio`.
 */
function FittedSvg({ svg, busy }: { readonly svg: string; readonly busy: boolean }) {
  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden">
      <div
        className={
          "flex max-h-full max-w-full overflow-hidden rounded-lg shadow-pop [&>svg]:block [&>svg]:h-auto [&>svg]:max-h-full [&>svg]:max-w-full [&>svg]:w-auto" +
          (busy ? " recomputing-ring" : "")
        }
        // Trusted internal source — user-supplied strings (title, caption,
        // node labels) are escaped by the renderer.
        dangerouslySetInnerHTML={{ __html: makeResponsiveSvg(svg) }}
      />
    </div>
  );
}

/**
 * Keep the SVG's width/height attributes (they encode intrinsic aspect) but
 * ensure preserveAspectRatio is set so internal scaling matches the viewBox.
 * Inline style is appended as a belt-and-braces fallback for hosts where
 * the Tailwind arbitrary-variant selector might not bind.
 */
function makeResponsiveSvg(svg: string): string {
  let next = svg;
  if (!/preserveAspectRatio=/.test(next)) {
    next = next.replace(
      /<svg([^>]*)>/,
      (_match, attrs) => `<svg${attrs} preserveAspectRatio="xMidYMid meet">`,
    );
  }
  return next.replace(/<svg([^>]*)>/, (_match, attrs) => {
    const withoutStyle = attrs.replace(/\sstyle="[^"]*"/g, "");
    return `<svg${withoutStyle} style="display:block;max-width:100%;max-height:100%;width:auto;height:auto;">`;
  });
}

function EmptyPreview({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex h-full w-full items-center justify-center text-xs text-muted">
      {children}
    </div>
  );
}

function PreviewStage({
  theme,
  busy,
  children,
}: {
  readonly theme: ExportTheme;
  readonly busy: boolean;
  readonly children: ReactNode;
}) {
  // Outer stage uses a neutral surface so the figure's own background reads
  // distinctly when its aspect doesn't fill the stage — that way changing
  // dimensions visibly resizes the figure box instead of blending in.
  return (
    <div
      role="img"
      aria-label="Export preview"
      aria-busy={busy}
      style={{ fontFamily: theme.fontFamily }}
      className="flex h-full min-h-0 items-center justify-center bg-elevated p-6"
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Download handlers                                                           */
/* -------------------------------------------------------------------------- */

interface SubtreeDownloadArgs {
  readonly subtree: Subtree;
  readonly config: ExportConfig;
  readonly theme: ExportTheme;
  readonly filename: string;
  readonly focusId: string | undefined;
  readonly format: ExportFormat;
  readonly ringWeights: readonly number[];
}

async function downloadSubtree(args: SubtreeDownloadArgs): Promise<void> {
  const { subtree, config, theme, filename, focusId, format, ringWeights } = args;
  const burnHeader = Boolean(config.title.trim() || config.caption.trim());

  const layout = layoutSunburst(subtree, {
    ...(focusId !== undefined ? { focusId } : {}),
    ringWeights,
  });
  const labels = buildSubtreeLabelLines(config, subtree, focusId);

  if (format === "png") {
    const blob = await exportLayoutToPngBlob(layout, {
      width: config.width,
      height: config.height,
      scale: config.pngScale,
      background: theme.background,
      theme,
      showHeader: burnHeader,
      titleFontSize: config.titleFontSize,
      captionFontSize: config.captionFontSize,
      labels,
      ...(config.title ? { title: config.title } : {}),
      ...(config.caption ? { caption: config.caption } : {}),
    });
    if (blob) downloadBlob(blob, filename);
    return;
  }

  // SVG
  const svg = layoutToSvg(layout, {
    width: config.width,
    height: config.height,
    background: theme.background,
    stroke: theme.stroke,
    theme,
    showHeader: burnHeader,
    titleFontSize: config.titleFontSize,
    captionFontSize: config.captionFontSize,
    labels,
    ...(config.title ? { title: config.title } : {}),
    ...(config.caption ? { caption: config.caption } : {}),
  });
  downloadBlob(new Blob([svg], { type: "image/svg+xml" }), filename);
}

interface OverviewDownloadArgs {
  readonly ontology: Ontology;
  readonly config: ExportConfig;
  readonly theme: ExportTheme;
  readonly filename: string;
  readonly format: ExportFormat;
  readonly ringWeights: readonly number[];
}

async function downloadOverview(args: OverviewDownloadArgs): Promise<void> {
  const { ontology, config, theme, filename, format, ringWeights } = args;
  const burnHeader = Boolean(config.title.trim() || config.caption.trim());

  const baseOptions = {
    columns: config.columns,
    background: theme.background,
    theme,
    tileBorder: config.tileBorder,
    labels: config.labels,
    labelPositions: config.labelPositions,
    labelStyles: config.labelStyles,
    outerPadding: config.padding,
    showHeader: burnHeader,
    ringWeights,
    titleFontSize: config.titleFontSize,
    captionFontSize: config.captionFontSize,
    ...(config.title ? { title: config.title } : {}),
    ...(config.caption ? { caption: config.caption } : {}),
  } as const;

  if (format === "png") {
    const blob = await overviewToPngBlob(ontology, {
      ...baseOptions,
      scale: config.pngScale,
    });
    if (blob) downloadBlob(blob, filename);
    return;
  }

  // SVG
  const svg = overviewToSvg(ontology, baseOptions);
  downloadBlob(new Blob([svg], { type: "image/svg+xml" }), filename);
}

function buildFilename(
  config: ExportConfig,
  scope: ExportScope,
  subtree: Subtree | null,
  format: ExportFormat,
): string {
  const slug =
    scope === "overview" ? "overview" : (subtree?.rootId.toLowerCase() ?? "subtree");
  const ext = format === "png" ? `${config.pngScale}x.png` : "svg";
  return `ontoloviz-${slug}-${Date.now()}.${ext}`;
}

/* -------------------------------------------------------------------------- */
/* Layout primitives                                                           */
/* -------------------------------------------------------------------------- */

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="mb-5 flex flex-col gap-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-soft">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Divider() {
  return <div className="my-6 h-px bg-border" aria-hidden />;
}

interface ChipOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly hint?: string;
  readonly disabled?: boolean;
}

function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  readonly options: readonly ChipOption<T>[];
  readonly value: T;
  readonly onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={opt.disabled}
          onClick={() => onChange(opt.value)}
          className={
            value === opt.value
              ? "rounded-md border border-accent bg-accent/15 px-2.5 py-1 text-[11px] text-ink"
              : "rounded-md border border-border bg-elevated px-2.5 py-1 text-[11px] text-muted hover:bg-border hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          }
        >
          {opt.label}
          {opt.hint ? <span className="ml-1 opacity-60">· {opt.hint}</span> : null}
        </button>
      ))}
    </div>
  );
}

function RadioRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  readonly label: string;
  readonly options: readonly { value: T; label: string }[];
  readonly value: T;
  readonly onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-widest text-muted">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={
              value === opt.value
                ? "rounded-md border border-accent bg-accent/15 px-2.5 py-1 text-[11px] text-ink"
                : "rounded-md border border-border bg-elevated px-2.5 py-1 text-[11px] text-muted hover:bg-border hover:text-ink"
            }
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  hint,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (v: boolean) => void;
  readonly hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2">
      <span className="flex flex-col">
        <span className="text-xs text-ink">{label}</span>
        {hint ? <span className="text-[10px] text-muted">{hint}</span> : null}
      </span>
      <span
        className={
          checked
            ? "relative inline-flex h-5 w-9 items-center rounded-full bg-accent transition"
            : "relative inline-flex h-5 w-9 items-center rounded-full bg-border transition"
        }
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.currentTarget.checked)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label={label}
        />
        <span
          className={
            checked
              ? "ml-4 inline-block h-4 w-4 rounded-full bg-canvas transition"
              : "ml-0.5 inline-block h-4 w-4 rounded-full bg-ink transition"
          }
        />
      </span>
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly disabled?: boolean;
  readonly onChange: (v: number) => void;
}) {
  return (
    <label className={`flex flex-col gap-1 text-xs ${disabled ? "opacity-50" : ""}`}>
      <span className="text-[11px] uppercase tracking-widest text-muted">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => {
          const v = Number(e.currentTarget.value);
          if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v)));
        }}
        className="rounded-md border border-border bg-elevated px-2 py-1 font-mono text-[11px] text-ink focus:border-accent focus:outline-none"
      />
    </label>
  );
}

function TextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly placeholder?: string;
  readonly onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-[11px] uppercase tracking-widest text-muted">{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.currentTarget.value)}
        className="rounded-md border border-border bg-elevated px-2 py-1 text-[11px] text-ink focus:border-accent focus:outline-none"
      />
    </label>
  );
}

function ColorRow({
  label,
  value,
  onChange,
  onReset,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (v: string) => void;
  readonly onReset?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="uppercase tracking-widest text-muted">{label}</span>
      <span className="flex items-center gap-2">
        {onReset ? (
          <button
            type="button"
            onClick={onReset}
            className="rounded-md border border-border bg-elevated px-1.5 py-0.5 text-[10px] text-muted hover:text-ink"
            aria-label="Reset to preset background"
            title="Reset to preset background"
          >
            reset
          </button>
        ) : null}
        <span
          aria-hidden
          style={{ background: value }}
          className="h-5 w-7 rounded border border-border"
        />
        <input
          type="color"
          value={normalizeHex(value)}
          onChange={(e) => onChange(e.currentTarget.value.toUpperCase())}
          className="h-6 w-7 cursor-pointer"
          aria-label={label}
        />
      </span>
    </div>
  );
}

/**
 * Single integrated Labels card. Each label row carries its own visibility
 * checkbox; when enabled (and the export is overview-scope, where styling
 * actually applies), an inline strip exposes a size stepper, a bold toggle,
 * a left/center/right alignment toggle, and a per-label position picker
 * (above / below / overlay) — so labels can sit in different bands
 * independently of one another.
 */
interface LabelsSectionProps<K extends string> {
  readonly keys: readonly { readonly key: K; readonly label: string }[];
  readonly labels: Record<K, boolean>;
  readonly labelStyles: Record<K, OverviewLabelStyle>;
  readonly labelPositions: Record<K, LabelPosition>;
  /** Overlay-mode hint, since overlay placement differs by scope. */
  readonly overlayHint: string;
  /** When true, overlay snaps to corners and ignores per-label alignment. */
  readonly overlayAutoAligns: boolean;
  readonly onLabelsChange: (next: Record<K, boolean>) => void;
  readonly onStylesChange: (next: Record<K, OverviewLabelStyle>) => void;
  readonly onPositionsChange: (next: Record<K, LabelPosition>) => void;
}

function LabelsSection<K extends string>({
  keys,
  labels,
  labelStyles,
  labelPositions,
  overlayHint,
  overlayAutoAligns,
  onLabelsChange,
  onStylesChange,
  onPositionsChange,
}: LabelsSectionProps<K>) {
  return (
    <Section title="Labels">
      <div className="overflow-hidden rounded-md border border-border bg-elevated/40">
        {keys.map(({ key, label }, index) => (
          <LabelRow
            key={key}
            label={label}
            checked={labels[key]}
            onToggle={(v) => onLabelsChange({ ...labels, [key]: v })}
            style={labelStyles[key]}
            onStyleChange={(next) => onStylesChange({ ...labelStyles, [key]: next })}
            position={labelPositions[key]}
            onPositionChange={(next) =>
              onPositionsChange({ ...labelPositions, [key]: next })
            }
            overlayHint={overlayHint}
            overlayAutoAligns={overlayAutoAligns}
            divided={index > 0}
          />
        ))}
      </div>
    </Section>
  );
}

interface LabelRowProps {
  readonly label: string;
  readonly checked: boolean;
  readonly onToggle: (v: boolean) => void;
  readonly style: OverviewLabelStyle;
  readonly onStyleChange: (next: OverviewLabelStyle) => void;
  readonly position: LabelPosition;
  readonly onPositionChange: (next: LabelPosition) => void;
  readonly overlayHint: string;
  /** When true, overlay placement snaps to a corner and ignores alignment. */
  readonly overlayAutoAligns: boolean;
  readonly divided: boolean;
}

function LabelRow({
  label,
  checked,
  onToggle,
  style,
  onStyleChange,
  position,
  onPositionChange,
  overlayHint,
  overlayAutoAligns,
  divided,
}: LabelRowProps) {
  const expanded = checked;
  const overlayLocksAlign = position === "overlay" && overlayAutoAligns;
  return (
    <div className={divided ? "border-t border-border" : ""}>
      <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onToggle(e.currentTarget.checked)}
          className="h-4 w-4 cursor-pointer accent-accent"
        />
        <span className="flex-1 text-xs text-ink">{label}</span>
        {expanded ? (
          <span
            aria-hidden
            className="font-mono text-[10px] tabular-nums text-muted"
            style={{
              fontWeight: style.bold ? 700 : 400,
              textAlign: style.align,
            }}
          >
            {style.fontSize}px · {position}
          </span>
        ) : null}
      </label>
      {expanded ? (
        <div className="flex flex-col gap-1.5 px-3 pb-2.5 pl-[2.375rem]">
          <div className="flex items-center gap-1.5">
            <SizeStepper
              value={style.fontSize}
              min={6}
              max={72}
              onChange={(fontSize) => onStyleChange({ ...style, fontSize })}
            />
            <BoldToggle
              value={style.bold}
              onChange={(bold) => onStyleChange({ ...style, bold })}
            />
            {overlayLocksAlign ? (
              <span
                className="rounded-md border border-dashed border-border bg-elevated/60 px-2 py-1 text-[10px] leading-none text-muted"
                title={overlayHint}
              >
                auto-aligned
              </span>
            ) : (
              <AlignToggle
                value={style.align}
                onChange={(align) => onStyleChange({ ...style, align })}
              />
            )}
          </div>
          <SegmentedControl
            options={LABEL_POSITIONS}
            value={position}
            onChange={onPositionChange}
          />
        </div>
      ) : null}
    </div>
  );
}

function SizeStepper({
  value,
  min,
  max,
  onChange,
}: {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly onChange: (v: number) => void;
}) {
  const clamp = (v: number): number => Math.max(min, Math.min(max, v));
  return (
    <div
      className="flex items-stretch overflow-hidden rounded-md border border-border bg-elevated"
      role="group"
      aria-label="Font size"
    >
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= min}
        aria-label="Decrease font size"
        className="px-1.5 text-[12px] leading-none text-muted hover:bg-border hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
      >
        −
      </button>
      <span className="flex w-8 items-center justify-center border-x border-border font-mono text-[10px] tabular-nums text-ink">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        disabled={value >= max}
        aria-label="Increase font size"
        className="px-1.5 text-[12px] leading-none text-muted hover:bg-border hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}

function BoldToggle({
  value,
  onChange,
}: {
  readonly value: boolean;
  readonly onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      aria-pressed={value}
      aria-label="Bold"
      title="Bold"
      className={
        value
          ? "rounded-md border border-accent bg-accent/15 px-2 py-1 font-serif text-[11px] font-bold leading-none text-ink"
          : "rounded-md border border-border bg-elevated px-2 py-1 font-serif text-[11px] font-bold leading-none text-muted hover:bg-border hover:text-ink"
      }
    >
      B
    </button>
  );
}

function AlignToggle({
  value,
  onChange,
}: {
  readonly value: LabelAlign;
  readonly onChange: (v: LabelAlign) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Alignment"
      className="flex items-stretch overflow-hidden rounded-md border border-border bg-elevated"
    >
      {LABEL_ALIGNS.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            aria-label={`Align ${opt.label.toLowerCase()}`}
            title={`Align ${opt.label.toLowerCase()}`}
            className={
              (active
                ? "bg-accent/15 text-ink"
                : "text-muted hover:bg-border hover:text-ink") +
              (i > 0 ? " border-l border-border" : "") +
              " flex items-center justify-center px-1.5 py-1"
            }
          >
            <AlignIcon dir={opt.value} />
          </button>
        );
      })}
    </div>
  );
}

function AlignIcon({ dir }: { readonly dir: LabelAlign }) {
  const rows = [
    { y: 2, len: 10 },
    { y: 5, len: 6 },
    { y: 8, len: 10 },
    { y: 11, len: 6 },
  ];
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 14"
      fill="none"
      aria-hidden
      className="block"
    >
      {rows.map((r, i) => {
        const x = dir === "left" ? 1 : dir === "right" ? 11 - r.len : (12 - r.len) / 2;
        return (
          <rect
            key={i}
            x={x}
            y={r.y - 0.5}
            width={r.len}
            height={1.25}
            rx={0.5}
            fill="currentColor"
          />
        );
      })}
    </svg>
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  readonly options: readonly { value: T; label: string }[];
  readonly value: T;
  readonly onChange: (v: T) => void;
}) {
  return (
    <div
      role="group"
      className="flex items-stretch overflow-hidden rounded-md border border-border bg-elevated"
    >
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={
              (active
                ? "bg-accent/15 text-ink"
                : "text-muted hover:bg-border hover:text-ink") +
              (i > 0 ? " border-l border-border" : "") +
              " px-2 py-1 text-[10px] font-medium leading-none"
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function SubtreesSection({
  ontology,
  excluded,
  onChange,
}: {
  readonly ontology: Ontology | null;
  readonly excluded: readonly string[];
  readonly onChange: (next: readonly string[]) => void;
}) {
  const subtrees = useMemo(() => {
    if (!ontology) return [];
    return [...ontology.subtrees.values()].sort((a, b) =>
      a.rootId < b.rootId ? -1 : a.rootId > b.rootId ? 1 : 0,
    );
  }, [ontology]);

  if (subtrees.length === 0) {
    return (
      <Section title="Subtrees">
        <p className="text-[10px] leading-snug text-muted">No subtrees available.</p>
      </Section>
    );
  }

  const excludedSet = new Set(excluded);
  const includedCount = subtrees.length - excludedSet.size;
  const allRootIds = subtrees.map((s) => s.rootId);

  const toggle = (rootId: string, include: boolean): void => {
    const next = new Set(excludedSet);
    if (include) next.delete(rootId);
    else next.add(rootId);
    onChange([...next]);
  };

  return (
    <Section title="Subtrees">
      <div className="flex items-center justify-between text-[10px] text-muted">
        <span>
          {includedCount} of {subtrees.length} included
        </span>
        <span className="flex gap-1.5">
          <button
            type="button"
            onClick={() => onChange([])}
            className="rounded-md border border-border bg-elevated px-1.5 py-0.5 text-[10px] text-muted hover:text-ink"
          >
            All
          </button>
          <button
            type="button"
            onClick={() => onChange(allRootIds)}
            className="rounded-md border border-border bg-elevated px-1.5 py-0.5 text-[10px] text-muted hover:text-ink"
          >
            None
          </button>
        </span>
      </div>
      <div className="max-h-56 overflow-y-auto rounded-md border border-border bg-elevated/40">
        <ul className="divide-y divide-border">
          {subtrees.map((sub) => {
            const included = !excludedSet.has(sub.rootId);
            const label = sub.nodes.get(sub.rootId)?.label?.trim() ?? "";
            return (
              <li key={sub.rootId}>
                <label className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-[11px] hover:bg-border/40">
                  <input
                    type="checkbox"
                    checked={included}
                    onChange={(e) => toggle(sub.rootId, e.currentTarget.checked)}
                    className="h-3.5 w-3.5 cursor-pointer accent-accent"
                  />
                  <span className="flex min-w-0 flex-1 items-baseline gap-2">
                    <span className="font-mono text-ink">{sub.rootId}</span>
                    {label && label !== sub.rootId ? (
                      <span className="truncate text-muted">{label}</span>
                    ) : null}
                  </span>
                  <span className="font-mono text-[10px] text-muted">
                    {sub.nodes.size.toLocaleString()}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    </Section>
  );
}

function normalizeHex(value: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  // Color picker requires `#RRGGBB`. Common non-hex theme strings (rgba
  // colors, oklch tokens) won't round-trip, so fall back to neutral white.
  return "#FFFFFF";
}
