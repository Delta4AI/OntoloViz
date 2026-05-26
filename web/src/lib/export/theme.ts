/**
 * Export-side theming primitives.
 *
 * `ExportTheme` is the small, deliberate slice of styling that the SVG/PNG
 * renderers consume directly. Presets bundle a theme together with the layout
 * choices (label visibility, tile borders, padding) the export panel uses as
 * starting points. Users override individual knobs from there.
 *
 * The defaults match the in-app dark look so legacy callers — the dropdown's
 * one-shot exports — get the same artifact they did before this module
 * existed.
 */

export interface ExportTheme {
  /** Canvas / page background fill. */
  readonly background: string;
  /** Slice stroke; empty string = no stroke. */
  readonly stroke: string;
  /** Primary label / tile-title color. */
  readonly labelColor: string;
  /** Secondary label (counts, sublabels, caption) color. */
  readonly sublabelColor: string;
  /** Font stack used for text rendering. */
  readonly fontFamily: string;
}

export type LabelPosition = "above" | "below" | "overlay";

export interface ExportLabelFlags {
  /** Show the subtree / node id. */
  readonly id: boolean;
  /** Show the propagated count next to the title. */
  readonly count: boolean;
  /** Show the full human-readable name. */
  readonly name: boolean;
}

export type LabelAlign = "left" | "center" | "right";

/** Per-element label styling for overview tiles. */
export interface OverviewLabelStyle {
  readonly fontSize: number;
  readonly bold: boolean;
  readonly align: LabelAlign;
}

export interface OverviewLabelStyles {
  readonly id: OverviewLabelStyle;
  readonly count: OverviewLabelStyle;
  readonly name: OverviewLabelStyle;
}

/**
 * Defaults match the legacy app overview: id is left-aligned + bold, count
 * is right-aligned thin, name is left-aligned thin. Callers can override
 * any subset.
 */
export const DEFAULT_OVERVIEW_LABEL_STYLES: OverviewLabelStyles = Object.freeze({
  id: { fontSize: 14, bold: true, align: "left" as LabelAlign },
  count: { fontSize: 11, bold: false, align: "right" as LabelAlign },
  name: { fontSize: 11, bold: false, align: "left" as LabelAlign },
});

export type ExportPresetId = "pub-light" | "presentation" | "web";

export interface ExportPreset {
  readonly id: ExportPresetId;
  readonly label: string;
  readonly description: string;
  readonly theme: ExportTheme;
  /** Whether overview tiles get a 1px border. */
  readonly tileBorder: boolean;
  readonly labels: ExportLabelFlags;
  /** Outer padding inside each tile / around the single sunburst, in CSS px. */
  readonly padding: number;
  /** Default overview label position for this preset. */
  readonly labelPosition: LabelPosition;
}

const SANS = "ui-sans-serif, system-ui, sans-serif";
const SERIF =
  "ui-serif, Iowan Old Style, 'Iowan Old Style', Georgia, Cambria, 'Times New Roman', Times, serif";

/**
 * Default theme — matches the in-app dark surface so existing callers that
 * don't yet pass a theme keep producing the same artifact.
 */
export const EXPORT_THEME_DEFAULT: ExportTheme = Object.freeze({
  background: "#0B0B10",
  stroke: "rgba(0, 0, 0, 0.35)",
  labelColor: "rgba(229, 231, 235, 0.92)",
  sublabelColor: "rgba(229, 231, 235, 0.55)",
  fontFamily: SANS,
});

/** Publication light — white background, serif type, faint slice strokes. */
export const PUBLICATION_LIGHT_THEME: ExportTheme = Object.freeze({
  background: "#FFFFFF",
  stroke: "rgba(0, 0, 0, 0.18)",
  labelColor: "#111418",
  sublabelColor: "rgba(17, 20, 24, 0.6)",
  fontFamily: SERIF,
});

/** Presentation — slide deck friendly, sans, subtle slice strokes. */
export const PRESENTATION_THEME: ExportTheme = Object.freeze({
  background: "#0B0D12",
  stroke: "rgba(255, 255, 255, 0.12)",
  labelColor: "#FFFFFF",
  sublabelColor: "rgba(255, 255, 255, 0.7)",
  fontFamily: SANS,
});

/** Web — current in-app look, dark variant. */
export const WEB_THEME_DARK: ExportTheme = EXPORT_THEME_DEFAULT;

/**
 * Web — current in-app look, light variant. Mirrors `:root[data-theme="light"]`
 * tokens in `src/index.css` so exporting from a light-mode app produces a
 * matching figure. Slice stroke is intentionally the same `rgba(0,0,0,0.35)`
 * that the on-screen sunburst paints in both themes (see `Sunburst.tsx`),
 * because the user expects the export to mirror what they see live.
 */
export const WEB_THEME_LIGHT: ExportTheme = Object.freeze({
  background: "#FFFFFF",
  stroke: "rgba(0, 0, 0, 0.35)",
  labelColor: "rgb(15, 15, 20)",
  sublabelColor: "rgb(90, 90, 102)",
  fontFamily: SANS,
});

/** Back-compat: legacy callers reference WEB_THEME for the dark variant. */
export const WEB_THEME: ExportTheme = WEB_THEME_DARK;

/** Resolve the Web preset's theme against the running app's data-theme. */
export function webThemeFor(appTheme: "dark" | "light"): ExportTheme {
  return appTheme === "light" ? WEB_THEME_LIGHT : WEB_THEME_DARK;
}

export const EXPORT_PRESETS: readonly ExportPreset[] = Object.freeze([
  {
    id: "pub-light",
    label: "Publication",
    description: "White background, serif type, captions below tiles.",
    theme: PUBLICATION_LIGHT_THEME,
    tileBorder: false,
    labels: { id: true, count: false, name: true },
    padding: 32,
    labelPosition: "below",
  },
  {
    id: "presentation",
    label: "Presentation",
    description: "High-contrast dark for slide decks; counts on.",
    theme: PRESENTATION_THEME,
    tileBorder: true,
    labels: { id: true, count: true, name: false },
    padding: 40,
    labelPosition: "above",
  },
  {
    id: "web",
    label: "Web (current)",
    description: "Matches the in-app dark look — tile borders on, full labels.",
    theme: WEB_THEME,
    tileBorder: true,
    labels: { id: true, count: true, name: true },
    padding: 24,
    labelPosition: "above",
  },
] as const);

export function getPreset(id: ExportPresetId): ExportPreset {
  const found = EXPORT_PRESETS.find((p) => p.id === id);
  if (!found) {
    throw new Error(`Unknown export preset: ${id}`);
  }
  return found;
}
