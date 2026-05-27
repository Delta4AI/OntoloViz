/**
 * Shared label-band geometry for figure exports.
 *
 * A single sunburst (detail/subtree export) can carry caption lines that
 * describe its focused root node — id, header (name), description. Each line
 * sits `above` the figure, `below` it, or `overlay`-centered inside the donut.
 *
 * The SVG and canvas renderers paint differently but must agree on layout, so
 * the math lives here once: given the lines plus the title/caption band
 * heights, it reserves vertical space and resolves each line to an absolute
 * (x, y) baseline with a text anchor. Pure — no DOM, no rendering.
 */

import type { LabelAlign, LabelPosition } from "./theme";

export interface ExportLabelLine {
  readonly text: string;
  readonly position: LabelPosition;
  readonly fontSize: number;
  readonly bold: boolean;
  readonly align: LabelAlign;
  /** Use the muted (sublabel) color instead of the primary label color. */
  readonly muted: boolean;
}

export type TextAnchor = "start" | "middle" | "end";

export interface PlacedLabel {
  readonly text: string;
  readonly x: number;
  /** Vertically-centered baseline (renderers use middle baseline). */
  readonly y: number;
  readonly anchor: TextAnchor;
  readonly fontSize: number;
  readonly bold: boolean;
  readonly muted: boolean;
}

export interface LabelBandsInput {
  readonly width: number;
  readonly height: number;
  readonly lines: readonly ExportLabelLine[];
  /** Height reserved at the very top for the title band (0 if none). */
  readonly titleBand: number;
  /** Height reserved at the very bottom for the caption band (0 if none). */
  readonly captionBand: number;
}

export interface LabelBands {
  /** Total top reservation: title band + stacked `above` lines. */
  readonly topBand: number;
  /** Total bottom reservation: stacked `below` lines + caption band. */
  readonly bottomBand: number;
  readonly placed: readonly PlacedLabel[];
}

/** Horizontal inset for left/right-aligned lines, in CSS px. */
const EDGE_PAD = 16;
/** Line slot height as a multiple of font size. */
const LINE_HEIGHT_RATIO = 1.5;

const lineSlot = (fontSize: number): number => Math.round(fontSize * LINE_HEIGHT_RATIO);

const hasText = (line: ExportLabelLine): boolean => line.text.trim().length > 0;

const sumSlots = (lines: readonly ExportLabelLine[]): number =>
  lines.reduce((acc, l) => acc + lineSlot(l.fontSize), 0);

function anchorFor(
  align: LabelAlign,
  width: number,
): { readonly x: number; readonly anchor: TextAnchor } {
  if (align === "left") return { x: EDGE_PAD, anchor: "start" };
  if (align === "right") return { x: width - EDGE_PAD, anchor: "end" };
  return { x: width / 2, anchor: "middle" };
}

function place(line: ExportLabelLine, width: number, centerY: number): PlacedLabel {
  const { x, anchor } = anchorFor(line.align, width);
  return {
    text: line.text.trim(),
    x,
    y: centerY,
    anchor,
    fontSize: line.fontSize,
    bold: line.bold,
    muted: line.muted,
  };
}

/**
 * Reserve bands for the caption lines and resolve each to an absolute
 * position. `above` lines stack beneath the title band; `below` lines stack
 * above the caption band; `overlay` lines center inside the figure.
 */
export function layoutLabelBands(input: LabelBandsInput): LabelBands {
  const { width, height, titleBand, captionBand } = input;
  const visible = input.lines.filter(hasText);
  const above = visible.filter((l) => l.position === "above");
  const below = visible.filter((l) => l.position === "below");
  const overlay = visible.filter((l) => l.position === "overlay");

  const topBand = titleBand + sumSlots(above);
  const bottomBand = captionBand + sumSlots(below);
  const placed: PlacedLabel[] = [];

  let y = titleBand;
  for (const line of above) {
    const slot = lineSlot(line.fontSize);
    placed.push(place(line, width, y + slot / 2));
    y += slot;
  }

  y = height - bottomBand;
  for (const line of below) {
    const slot = lineSlot(line.fontSize);
    placed.push(place(line, width, y + slot / 2));
    y += slot;
  }

  if (overlay.length > 0) {
    const figureCenterY = topBand + (height - topBand - bottomBand) / 2;
    const overlayTotal = sumSlots(overlay);
    let oy = figureCenterY - overlayTotal / 2;
    for (const line of overlay) {
      const slot = lineSlot(line.fontSize);
      placed.push(place(line, width, oy + slot / 2));
      oy += slot;
    }
  }

  return { topBand, bottomBand, placed };
}
