import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";

import { layoutSunburst } from "@/lib/ontology/layout";
import { hitTest, renderSunburst } from "@/lib/ontology/render";
import { useAppStore } from "@/lib/store";
import type { Subtree } from "@/lib/ontology/types";
import { readThemeColor, useTheme } from "@/lib/theme";

import { Breadcrumbs } from "./Breadcrumbs";

interface SunburstProps {
  readonly subtree: Subtree;
  /** Optional CSS height; width fills the parent. Defaults to 560px. */
  readonly height?: number;
}

/**
 * Sunburst viewport: owns the canvas, DPR-aware sizing, hover/click state,
 * and the breadcrumb trail. Layout + drawing are delegated to pure helpers.
 *
 * Zoom semantics: clicking a slice sets it as the new focus. Clicking the
 * focused slice (or any breadcrumb crumb) restores that level.
 */
export function Sunburst({ subtree, height = 560 }: SunburstProps) {
  const canvasWrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [focusId, setFocusId] = useState<string>(subtree.rootId);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [size, setSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  // Cross-surface hover (from the summary grid). Local hover wins because
  // it also drives the tooltip; the store value only contributes the stroke
  // highlight when nothing local is hovered.
  const externalHoverId = useAppStore((s) => s.hoveredId);
  const setExternalHoverId = useAppStore((s) => s.setHoveredId);

  // Repaint when the user toggles dark/light so the canvas background matches
  // the surrounding panel instead of staying stuck on the dark-mode value.
  const theme = useTheme();

  // Reset focus when the underlying subtree changes (e.g. new upload).
  useEffect(() => {
    setFocusId(subtree.rootId);
    setHoverId(null);
  }, [subtree]);

  // Observe the canvas wrapper's content rect. The canvas itself is
  // absolutely positioned inside the wrapper so it never contributes to its
  // ancestors' min-content — otherwise the explicit pixel width we set on it
  // would feed back through the wrapper's border and inflate the parent flex
  // column by ~2px on every ResizeObserver tick.
  useEffect(() => {
    const el = canvasWrapperRef.current;
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
    () => layoutSunburst(subtree, { focusId }),
    [subtree, focusId],
  );

  // Paint on every layout / size / hover change.
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

    const highlight = hoverId ?? externalHoverId ?? undefined;
    renderSunburst(ctx, layout, {
      width,
      height: h,
      ...(highlight !== undefined ? { highlightId: highlight } : {}),
      background: readThemeColor("--c-canvas", "#0B0B10"),
    });
  }, [layout, size, hoverId, externalHoverId, theme]);

  const handleMove = (event: MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const id = hitTest(layout, { width: size.width, height: size.height }, px, py);
    setHoverId(id);
    setExternalHoverId(id);
  };

  const handleLeave = () => {
    setHoverId(null);
    setExternalHoverId(null);
  };

  const handleClick = (event: MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const id = hitTest(
      layout,
      { width: size.width, height: size.height },
      event.clientX - rect.left,
      event.clientY - rect.top,
    );
    if (!id) return;
    setFocusId((current) => (id === current ? subtree.rootId : id));
  };

  const hoverNode = hoverId ? (subtree.nodes.get(hoverId) ?? null) : null;

  return (
    <div className="flex flex-col gap-3">
      <Breadcrumbs
        subtree={subtree}
        focusId={focusId}
        onSelect={(id) => setFocusId(id)}
      />
      <div
        ref={canvasWrapperRef}
        className="relative overflow-hidden rounded-xl border border-border bg-canvas"
        style={{ height }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 block cursor-pointer"
          onMouseMove={handleMove}
          onMouseLeave={handleLeave}
          onClick={handleClick}
          aria-label="Ontology sunburst"
          role="img"
        />
        {hoverNode ? (
          <div className="pointer-events-none absolute bottom-3 left-3 max-w-xs rounded-md bg-black/70 px-3 py-2 text-xs text-white shadow-lg backdrop-blur">
            <div className="font-mono text-[10px] uppercase tracking-widest opacity-60">
              {hoverNode.id}
            </div>
            <div className="font-medium">{hoverNode.label || hoverNode.id}</div>
            <div className="mt-1 text-[11px] opacity-80">
              count: {hoverNode.count.toLocaleString()}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
