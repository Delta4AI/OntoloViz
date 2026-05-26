import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { layoutSunburst } from "@/lib/ontology/layout";
import { renderSunburst } from "@/lib/ontology/render";
import type { Subtree } from "@/lib/ontology/types";

interface SunburstTileProps {
  readonly subtree: Subtree;
  /**
   * Click handler. Fires with the subtree's root id regardless of which slice
   * was actually clicked — overview tiles are previews, not drill-targets.
   */
  readonly onActivate: (rootId: string) => void;
  /**
   * Inclusive depth cap measured from the subtree root. Defaults to 3, which
   * keeps tiles legible without cramming arc text. Set higher for richer
   * previews when the grid has few tiles.
   */
  readonly maxDepth?: number;
  /** Tile height in CSS pixels. Width fills the parent grid cell. */
  readonly height?: number;
}

/**
 * Small-multiples preview tile. Reuses the same pure `layoutSunburst` +
 * `renderSunburst` as the full sunburst, with three deliberate trims:
 *
 *  - depth cap so inner rings stay readable at small sizes
 *  - local hover only (no store wiring — N tiles writing to a shared
 *    `hoveredId` would create a hover-storm with no benefit)
 *  - no breadcrumbs / no tooltip — interaction surface is "click to drill in"
 *
 * Swap this component for `<Sunburst>` inside the grid to upgrade every tile
 * to full interactivity; the public prop surface (`subtree`, `onActivate`)
 * is intentionally compatible.
 */
export function SunburstTile({
  subtree,
  onActivate,
  maxDepth = 3,
  height = 220,
}: SunburstTileProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [size, setSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  // Match the full Sunburst's wrapper-observed sizing pattern: absolute-position
  // the canvas so its explicit pixel dimensions never feed back through the
  // grid cell's intrinsic size.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = Math.max(0, Math.floor(entry.contentRect.width));
      const h = Math.max(0, Math.floor(entry.contentRect.height));
      setSize((prev) =>
        prev.width === w && prev.height === h ? prev : { width: w, height: h },
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(
    () => layoutSunburst(subtree, { maxDepth }),
    [subtree, maxDepth],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height: h } = size;
    if (width <= 0 || h <= 0) return;

    const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    renderSunburst(ctx, layout, {
      width,
      height: h,
      background: "#0B0B10",
    });
  }, [layout, size]);

  const handleClick = () => onActivate(subtree.rootId);

  const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onActivate(subtree.rootId);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKey}
      aria-label={`Open ${subtree.rootId} in detail view`}
      className="group relative flex cursor-pointer flex-col gap-2 rounded-xl border border-border bg-panel p-3 shadow-panel transition-colors hover:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-mono text-[11px] text-ink">
          {subtree.rootId}
        </span>
        <span className="shrink-0 text-[10px] uppercase tracking-widest text-subtle">
          {subtree.nodes.size.toLocaleString()} nodes
        </span>
      </div>
      <div
        ref={wrapperRef}
        className="relative overflow-hidden rounded-md border border-border bg-canvas"
        style={{ height }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 block" aria-hidden />
      </div>
    </div>
  );
}
