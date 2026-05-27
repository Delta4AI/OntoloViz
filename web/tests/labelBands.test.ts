import { describe, expect, it } from "vitest";

import { layoutLabelBands, type ExportLabelLine } from "@/lib/export/labelBands";

const line = (over: Partial<ExportLabelLine> = {}): ExportLabelLine => ({
  text: "Hello",
  position: "above",
  fontSize: 20,
  bold: false,
  align: "center",
  muted: false,
  ...over,
});

// lineSlot(fontSize) === round(fontSize * 1.5)
const slot = (fontSize: number): number => Math.round(fontSize * 1.5);
const W = 400;
const H = 400;

describe("layoutLabelBands", () => {
  it("returns only the title/caption bands when there are no lines", () => {
    const bands = layoutLabelBands({
      width: W,
      height: H,
      lines: [],
      titleBand: 30,
      captionBand: 20,
    });
    expect(bands.topBand).toBe(30);
    expect(bands.bottomBand).toBe(20);
    expect(bands.placed).toEqual([]);
  });

  it("reserves space above the figure and stacks below the title band", () => {
    const bands = layoutLabelBands({
      width: W,
      height: H,
      lines: [line({ position: "above", fontSize: 20 })],
      titleBand: 30,
      captionBand: 0,
    });
    expect(bands.topBand).toBe(30 + slot(20));
    expect(bands.bottomBand).toBe(0);
    expect(bands.placed).toHaveLength(1);
    // First above line is vertically centered in its slot, beneath the title.
    expect(bands.placed[0]?.y).toBe(30 + slot(20) / 2);
  });

  it("reserves space below the figure, above the caption band", () => {
    const bands = layoutLabelBands({
      width: W,
      height: H,
      lines: [line({ position: "below", fontSize: 18 })],
      titleBand: 0,
      captionBand: 25,
    });
    expect(bands.bottomBand).toBe(25 + slot(18));
    // The below line sits between the figure and the caption band.
    const top = H - bands.bottomBand;
    expect(bands.placed[0]?.y).toBe(top + slot(18) / 2);
  });

  it("centers overlay lines inside the figure without reserving bands", () => {
    const bands = layoutLabelBands({
      width: W,
      height: H,
      lines: [line({ position: "overlay", fontSize: 16 })],
      titleBand: 10,
      captionBand: 10,
    });
    expect(bands.topBand).toBe(10);
    expect(bands.bottomBand).toBe(10);
    const figureCenter = 10 + (H - 10 - 10) / 2;
    // A single overlay line lands on the figure's vertical center.
    expect(bands.placed[0]?.y).toBe(figureCenter);
  });

  it("stacks multiple same-position lines and accumulates their reservation", () => {
    const bands = layoutLabelBands({
      width: W,
      height: H,
      lines: [
        line({ text: "one", position: "above", fontSize: 20 }),
        line({ text: "two", position: "above", fontSize: 12 }),
      ],
      titleBand: 0,
      captionBand: 0,
    });
    expect(bands.topBand).toBe(slot(20) + slot(12));
    expect(bands.placed[0]?.y).toBe(slot(20) / 2);
    expect(bands.placed[1]?.y).toBe(slot(20) + slot(12) / 2);
  });

  it("skips lines whose text is empty or whitespace", () => {
    const bands = layoutLabelBands({
      width: W,
      height: H,
      lines: [
        line({ text: "  ", position: "above" }),
        line({ text: "", position: "below" }),
      ],
      titleBand: 0,
      captionBand: 0,
    });
    expect(bands.topBand).toBe(0);
    expect(bands.bottomBand).toBe(0);
    expect(bands.placed).toEqual([]);
  });

  it("trims rendered text", () => {
    const bands = layoutLabelBands({
      width: W,
      height: H,
      lines: [line({ text: "  spaced  " })],
      titleBand: 0,
      captionBand: 0,
    });
    expect(bands.placed[0]?.text).toBe("spaced");
  });

  it("maps alignment to an x position and text anchor", () => {
    const make = (align: ExportLabelLine["align"]) =>
      layoutLabelBands({
        width: W,
        height: H,
        lines: [line({ align })],
        titleBand: 0,
        captionBand: 0,
      }).placed[0];

    const left = make("left");
    expect(left?.anchor).toBe("start");
    expect(left?.x).toBe(16);

    const center = make("center");
    expect(center?.anchor).toBe("middle");
    expect(center?.x).toBe(W / 2);

    const right = make("right");
    expect(right?.anchor).toBe("end");
    expect(right?.x).toBe(W - 16);
  });

  it("passes through styling fields verbatim", () => {
    const bands = layoutLabelBands({
      width: W,
      height: H,
      lines: [line({ fontSize: 22, bold: true, muted: true })],
      titleBand: 0,
      captionBand: 0,
    });
    expect(bands.placed[0]).toMatchObject({ fontSize: 22, bold: true, muted: true });
  });
});
