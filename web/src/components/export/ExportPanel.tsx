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

import { useMemo, type ReactNode } from "react";

import { layoutSunburst } from "@/lib/ontology/layout";
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
import {
  getPreset,
  webThemeFor,
  type ExportTheme,
  type LabelAlign,
  type LabelPosition,
  type OverviewLabelStyle,
  type OverviewLabelStyles,
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

const FORMATS: readonly { value: ExportFormat; label: string; hint: string }[] = [
  { value: "png", label: "PNG", hint: "raster" },
  { value: "svg", label: "SVG", hint: "vector" },
];

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

const LABEL_KEYS: readonly { key: keyof OverviewLabelStyles; label: string }[] = [
  { key: "id", label: "Id" },
  { key: "count", label: "Count" },
  { key: "name", label: "Name" },
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

  const previewSvg = useMemo(
    () =>
      buildPreviewSvg({
        scope: effectiveScope,
        config,
        theme: themeForExport,
        subtree,
        ontology,
        focusId,
      }),
    [effectiveScope, config, themeForExport, subtree, ontology, focusId],
  );

  const handleDownload = async () => {
    const filename = buildFilename(config, effectiveScope, subtree);
    if (effectiveScope === "overview") {
      if (!ontology) return;
      await downloadOverview({ ontology, config, theme: themeForExport, filename });
    } else {
      if (!subtree) return;
      await downloadSubtree({
        subtree,
        config,
        theme: themeForExport,
        filename,
        focusId,
      });
    }
  };

  const downloadDisabled =
    (effectiveScope === "subtree" && !subtree) ||
    (effectiveScope === "overview" && !ontology);

  return (
    <div className="grid h-full grid-cols-[1fr_380px] overflow-hidden">
      <PreviewStage theme={themeForExport}>{previewSvg}</PreviewStage>

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

          <Section title="Format">
            <Chips
              options={FORMATS.map((f) => ({
                value: f.value,
                label: f.label,
                hint: f.hint,
              }))}
              value={config.format}
              onChange={(format) => update({ format })}
            />
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
            <Section title="Layout">
              <NumberField
                label="Columns"
                value={config.columns}
                min={1}
                max={12}
                onChange={(columns) => update({ columns })}
              />
              <p className="text-[10px] leading-snug text-muted">
                Overview canvas size is derived from columns × tile count. To change the
                figure shape, adjust columns.
              </p>
            </Section>
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

          <Section title="Labels">
            <CheckRow
              label="Show id"
              checked={config.labels.id}
              onChange={(v) => update({ labels: { ...config.labels, id: v } })}
            />
            <CheckRow
              label="Show count"
              checked={config.labels.count}
              onChange={(v) => update({ labels: { ...config.labels, count: v } })}
            />
            <CheckRow
              label="Show full name"
              checked={config.labels.name}
              onChange={(v) => update({ labels: { ...config.labels, name: v } })}
            />
            {effectiveScope === "overview" ? (
              <RadioRow
                label="Position (overview)"
                options={LABEL_POSITIONS}
                value={config.labelPosition}
                onChange={(labelPosition) => update({ labelPosition })}
              />
            ) : null}
          </Section>

          {effectiveScope === "overview" ? (
            <>
              <Divider />
              <Section title="Label styles">
                {LABEL_KEYS.map(({ key, label }) => (
                  <LabelStyleGroup
                    key={key}
                    label={label}
                    style={config.labelStyles[key]}
                    onChange={(next) =>
                      update({
                        labelStyles: { ...config.labelStyles, [key]: next },
                      })
                    }
                  />
                ))}
              </Section>
            </>
          ) : null}

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

          {config.format === "png" ? (
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
          ) : null}
        </div>

        <footer className="border-t border-border bg-panel px-5 py-3">
          <button
            type="button"
            onClick={() => void handleDownload()}
            className="w-full rounded-md bg-accent px-3 py-2 text-xs font-medium text-on-accent hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
            disabled={downloadDisabled}
          >
            Download · {config.format.toUpperCase()}
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
}

function buildPreviewSvg(args: BuildPreviewSvgArgs): ReactNode {
  const { scope, config, theme, subtree, ontology } = args;
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
      labelPosition: config.labelPosition,
      labelStyles: config.labelStyles,
      outerPadding: config.padding,
      showHeader: burnHeader,
      titleFontSize: config.titleFontSize,
      captionFontSize: config.captionFontSize,
      ...(config.title ? { title: config.title } : {}),
      ...(config.caption ? { caption: config.caption } : {}),
    });
    return <FittedSvg svg={svg} />;
  }

  if (!subtree) return <EmptyPreview>No active subtree</EmptyPreview>;
  const layout = layoutSunburst(
    subtree,
    args.focusId !== undefined ? { focusId: args.focusId } : {},
  );
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
    ...(config.title ? { title: config.title } : {}),
    ...(config.caption ? { caption: config.caption } : {}),
  });
  return <FittedSvg svg={svg} />;
}

/**
 * Render the SVG so the figure visibly matches its configured width/height
 * aspect inside the stage. We keep the SVG's intrinsic width/height
 * attributes — they give the browser the aspect ratio to honor — and use
 * CSS `max-width:100%; max-height:100%; width:auto; height:auto` so the
 * SVG shrinks to fit while preserving aspect. The classic responsive-img
 * pattern; works reliably across browsers without juggling `aspect-ratio`.
 */
function FittedSvg({ svg }: { readonly svg: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden">
      <div
        className="flex max-h-full max-w-full overflow-hidden rounded-lg shadow-pop [&>svg]:block [&>svg]:h-auto [&>svg]:max-h-full [&>svg]:max-w-full [&>svg]:w-auto"
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
  children,
}: {
  readonly theme: ExportTheme;
  readonly children: ReactNode;
}) {
  // Outer stage uses a neutral surface so the figure's own background reads
  // distinctly when its aspect doesn't fill the stage — that way changing
  // dimensions visibly resizes the figure box instead of blending in.
  return (
    <div
      role="img"
      aria-label="Export preview"
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
}

async function downloadSubtree(args: SubtreeDownloadArgs): Promise<void> {
  const { subtree, config, theme, filename, focusId } = args;
  const burnHeader = Boolean(config.title.trim() || config.caption.trim());

  const layout = layoutSunburst(subtree, focusId !== undefined ? { focusId } : {});

  if (config.format === "png") {
    const blob = await exportLayoutToPngBlob(layout, {
      width: config.width,
      height: config.height,
      scale: config.pngScale,
      background: theme.background,
      theme,
      showHeader: burnHeader,
      titleFontSize: config.titleFontSize,
      captionFontSize: config.captionFontSize,
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
}

async function downloadOverview(args: OverviewDownloadArgs): Promise<void> {
  const { ontology, config, theme, filename } = args;
  const burnHeader = Boolean(config.title.trim() || config.caption.trim());

  const baseOptions = {
    columns: config.columns,
    background: theme.background,
    theme,
    tileBorder: config.tileBorder,
    labels: config.labels,
    labelPosition: config.labelPosition,
    labelStyles: config.labelStyles,
    outerPadding: config.padding,
    showHeader: burnHeader,
    titleFontSize: config.titleFontSize,
    captionFontSize: config.captionFontSize,
    ...(config.title ? { title: config.title } : {}),
    ...(config.caption ? { caption: config.caption } : {}),
  } as const;

  if (config.format === "png") {
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
): string {
  const slug =
    scope === "overview" ? "overview" : (subtree?.rootId.toLowerCase() ?? "subtree");
  const ext = config.format === "png" ? `${config.pngScale}x.png` : "svg";
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

function CheckRow({
  label,
  checked,
  onChange,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 text-xs">
      <span className="text-ink">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
        className="h-4 w-4 cursor-pointer accent-accent"
      />
    </label>
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

function LabelStyleGroup({
  label,
  style,
  onChange,
}: {
  readonly label: string;
  readonly style: OverviewLabelStyle;
  readonly onChange: (next: OverviewLabelStyle) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-elevated/40 p-2.5">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-muted">
        {label}
      </span>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <NumberField
          label="Size (px)"
          value={style.fontSize}
          min={6}
          max={72}
          onChange={(fontSize) => onChange({ ...style, fontSize })}
        />
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-[11px] uppercase tracking-widest text-muted">Bold</span>
          <button
            type="button"
            onClick={() => onChange({ ...style, bold: !style.bold })}
            aria-pressed={style.bold}
            className={
              style.bold
                ? "rounded-md border border-accent bg-accent/15 px-2.5 py-1 text-[11px] text-ink"
                : "rounded-md border border-border bg-elevated px-2.5 py-1 text-[11px] text-muted hover:bg-border hover:text-ink"
            }
          >
            {style.bold ? "On" : "Off"}
          </button>
        </label>
      </div>
      <RadioRow
        label="Align"
        options={LABEL_ALIGNS}
        value={style.align}
        onChange={(align) => onChange({ ...style, align })}
      />
    </div>
  );
}

function normalizeHex(value: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  // Color picker requires `#RRGGBB`. Common non-hex theme strings (rgba
  // colors, oklch tokens) won't round-trip, so fall back to neutral white.
  return "#FFFFFF";
}
