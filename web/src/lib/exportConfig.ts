/**
 * Export panel configuration store.
 *
 * Holds the user's last-used export choices so the panel re-opens to the
 * same state across reloads. Persists to localStorage via zustand's
 * `persist` middleware.
 *
 * Shape decisions:
 *  - A preset id is the "current style direction" pointer. Individual fields
 *    can drift away from the preset; switching preset overwrites them.
 *  - Width/height are raw pixels. Aspect ratio chips compute them from a
 *    base size; 'custom' lets the user type any width/height.
 *  - Font is a simple sans/serif radio. Custom font stacks aren't a v1
 *    control — the presets cover both common publication needs.
 *  - Title + caption auto-burn whenever they're non-empty; there is no
 *    separate enable toggle. Their font sizes live next to the inputs.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  DEFAULT_OVERVIEW_LABEL_STYLES,
  EXPORT_PRESETS,
  getPreset,
  type ExportLabelFlags,
  type ExportPreset,
  type ExportPresetId,
  type LabelPositions,
  type OverviewLabelStyles,
} from "./export/theme";

export type ExportScope = "subtree" | "overview";
export type ExportFormat = "png" | "svg";
export type ExportAspect =
  | "1:1"
  | "4:3"
  | "16:9"
  | "a4-portrait"
  | "a4-landscape"
  | "custom";
export type ExportFontChoice = "sans" | "serif";

export interface ExportConfig {
  readonly presetId: ExportPresetId;
  readonly scope: ExportScope;

  readonly aspect: ExportAspect;
  readonly width: number;
  readonly height: number;

  /** Overview tile rectangle borders (does not affect slice strokes). */
  readonly tileBorder: boolean;
  readonly labels: ExportLabelFlags;
  /** Per-element position (above/below/overlay) for overview labels. */
  readonly labelPositions: LabelPositions;
  /** Per-element styling (font size, weight, alignment) for overview labels. */
  readonly labelStyles: OverviewLabelStyles;
  readonly padding: number;

  readonly fontChoice: ExportFontChoice;

  readonly columns: number;
  readonly title: string;
  readonly caption: string;
  readonly titleFontSize: number;
  readonly captionFontSize: number;

  readonly pngScale: number;
  /**
   * Optional background override on top of the preset theme. Empty string =
   * follow the preset. Switching preset resets it so a new direction's
   * default background takes effect.
   */
  readonly backgroundOverride: string;
  /**
   * Root ids of subtrees to omit from the overview export. Empty means all
   * subtrees are included. Subtree-scope exports ignore this field.
   */
  readonly excludedRootIds: readonly string[];
}

const SANS = "ui-sans-serif, system-ui, sans-serif";
const SERIF =
  "ui-serif, Iowan Old Style, 'Iowan Old Style', Georgia, Cambria, 'Times New Roman', Times, serif";

const DEFAULT_PRESET_ID: ExportPresetId = "web";
const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 1200;

function fontChoiceFor(preset: ExportPreset): ExportFontChoice {
  if (preset.theme.fontFamily.startsWith("ui-serif")) return "serif";
  return "sans";
}

function configFromPreset(presetId: ExportPresetId): ExportConfig {
  const preset = getPreset(presetId);
  return {
    presetId,
    scope: "subtree",
    aspect: "1:1",
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    tileBorder: preset.tileBorder,
    labels: preset.labels,
    labelPositions: preset.labelPositions,
    labelStyles: DEFAULT_OVERVIEW_LABEL_STYLES,
    padding: preset.padding,
    fontChoice: fontChoiceFor(preset),
    columns: 3,
    title: "",
    caption: "",
    titleFontSize: 18,
    captionFontSize: 12,
    pngScale: 2,
    backgroundOverride: "",
    excludedRootIds: [],
  };
}

export const DEFAULT_EXPORT_CONFIG: ExportConfig = configFromPreset(DEFAULT_PRESET_ID);

interface ExportConfigStore {
  readonly config: ExportConfig;
  /** Patch arbitrary fields. */
  update(partial: Partial<ExportConfig>): void;
  /**
   * Replace style-related fields with a preset's defaults; preserve user
   * choices that aren't style-driven (scope, dimensions, title, caption, etc.).
   */
  applyPreset(id: ExportPresetId): void;
  reset(): void;
}

export const useExportConfig = create<ExportConfigStore>()(
  persist(
    (set) => ({
      config: DEFAULT_EXPORT_CONFIG,
      update: (partial) =>
        set((state) => ({ config: { ...state.config, ...partial } })),
      applyPreset: (id) =>
        set((state) => {
          const next = configFromPreset(id);
          return {
            config: {
              ...next,
              scope: state.config.scope,
              aspect: state.config.aspect,
              width: state.config.width,
              height: state.config.height,
              columns: state.config.columns,
              title: state.config.title,
              caption: state.config.caption,
              titleFontSize: state.config.titleFontSize,
              captionFontSize: state.config.captionFontSize,
              pngScale: state.config.pngScale,
            },
          };
        }),
      reset: () => set(() => ({ config: DEFAULT_EXPORT_CONFIG })),
    }),
    {
      name: "ontoloviz-export-config",
      // Bumped after dropping `format` (download buttons now choose format).
      version: 6,
    },
  ),
);

/** Resolve the configured font choice into a concrete CSS font-family value. */
export function resolveExportFontFamily(config: ExportConfig): string {
  return config.fontChoice === "serif" ? SERIF : SANS;
}

/** Centralized list of aspect chips for the panel UI. */
export const ASPECT_OPTIONS: readonly {
  readonly id: ExportAspect;
  readonly label: string;
}[] = [
  { id: "1:1", label: "1 : 1" },
  { id: "4:3", label: "4 : 3" },
  { id: "16:9", label: "16 : 9" },
  { id: "a4-portrait", label: "A4 ↕" },
  { id: "a4-landscape", label: "A4 ↔" },
  { id: "custom", label: "Custom" },
];

const BASE_LONG_EDGE = 1200;
const A4_RATIO = 297 / 210;

/**
 * Derive width/height from an aspect chip. Returns the current width/height
 * unchanged for 'custom'.
 */
export function dimensionsFor(
  aspect: ExportAspect,
  current: { width: number; height: number },
): { width: number; height: number } {
  switch (aspect) {
    case "1:1":
      return { width: BASE_LONG_EDGE, height: BASE_LONG_EDGE };
    case "4:3":
      return { width: BASE_LONG_EDGE, height: Math.round(BASE_LONG_EDGE * 0.75) };
    case "16:9":
      return { width: BASE_LONG_EDGE, height: Math.round((BASE_LONG_EDGE * 9) / 16) };
    case "a4-portrait":
      return {
        width: Math.round(BASE_LONG_EDGE / A4_RATIO),
        height: BASE_LONG_EDGE,
      };
    case "a4-landscape":
      return {
        width: BASE_LONG_EDGE,
        height: Math.round(BASE_LONG_EDGE / A4_RATIO),
      };
    case "custom":
      return current;
  }
}

export { EXPORT_PRESETS };
