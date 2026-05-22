import { useEffect, useMemo, useRef, useState } from "react";

import { filterRows, flattenRows, useAppStore, type GridRow } from "@/lib/store";
import type { Ontology } from "@/lib/ontology/types";

interface SummaryGridProps {
  readonly ontology: Ontology | null;
  /** Pixel height of the scrollable area. Defaults to 480. */
  readonly height?: number;
}

const ROW_HEIGHT = 28;
const OVERSCAN = 6;

/**
 * Virtualized table of nodes across all subtrees.
 *
 * Scroll-windowed by hand: we render only rows whose y-range intersects the
 * viewport (plus an overscan band). No external windowing dep — keeps the
 * bundle lean.
 *
 * Linked hover/search: row hover writes `hoveredId` to the store so the
 * sunburst highlights the matching slice. Row click sets the active subtree
 * to the node's root, so multi-tree datasets jump to the right ring.
 */
export function SummaryGrid({ ontology, height = 480 }: SummaryGridProps) {
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const hoveredId = useAppStore((s) => s.hoveredId);
  const setHoveredId = useAppStore((s) => s.setHoveredId);
  const setActiveRoot = useAppStore((s) => s.setActiveRoot);

  const allRows = useMemo(() => flattenRows(ontology), [ontology]);
  const filtered = useMemo(
    () => filterRows(allRows, searchQuery),
    [allRows, searchQuery],
  );

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);

  // Reset scroll when the result set shrinks below the current position.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (el.scrollTop > filtered.length * ROW_HEIGHT) {
      el.scrollTop = 0;
      setScrollTop(0);
    }
  }, [filtered.length]);

  const totalHeight = filtered.length * ROW_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(height / ROW_HEIGHT) + OVERSCAN * 2;
  const endIndex = Math.min(filtered.length, startIndex + visibleCount);
  const visible = filtered.slice(startIndex, endIndex);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.currentTarget.value)}
          placeholder="Filter by id or label…"
          className="w-full rounded border border-line bg-black/30 px-3 py-1.5 text-sm placeholder:text-muted focus:border-white/40 focus:outline-none"
          aria-label="Filter nodes"
        />
        <span className="whitespace-nowrap text-xs text-muted">
          {filtered.length.toLocaleString()} / {allRows.length.toLocaleString()}
        </span>
      </div>

      <div
        ref={scrollerRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        className="rounded-xl border border-line bg-black/20"
        style={{ height, overflow: "auto" }}
      >
        <div style={{ height: totalHeight, position: "relative" }}>
          {visible.map((row, i) => {
            const index = startIndex + i;
            const top = index * ROW_HEIGHT;
            const isHovered = row.node.id === hoveredId;
            return (
              <Row
                key={`${row.rootId}::${row.node.id}`}
                row={row}
                top={top}
                isHovered={isHovered}
                onHover={() => setHoveredId(row.node.id)}
                onLeave={() => setHoveredId(null)}
                onClick={() => setActiveRoot(row.rootId)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface RowProps {
  readonly row: GridRow;
  readonly top: number;
  readonly isHovered: boolean;
  readonly onHover: () => void;
  readonly onLeave: () => void;
  readonly onClick: () => void;
}

function Row({ row, top, isHovered, onHover, onLeave, onClick }: RowProps) {
  return (
    <button
      type="button"
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onFocus={onHover}
      onBlur={onLeave}
      onClick={onClick}
      style={{
        position: "absolute",
        top,
        left: 0,
        right: 0,
        height: ROW_HEIGHT,
      }}
      className={
        isHovered
          ? "flex items-center gap-2 bg-white/10 px-3 text-left text-xs text-white"
          : "flex items-center gap-2 px-3 text-left text-xs text-white/70 hover:bg-white/5"
      }
    >
      <span
        className="h-3 w-3 flex-shrink-0 rounded-sm border border-white/20"
        style={{ background: row.node.color || "#FFFFFF" }}
        aria-hidden
      />
      <span className="w-16 flex-shrink-0 font-mono text-[10px] uppercase text-muted">
        {row.rootId}
      </span>
      <span className="w-32 flex-shrink-0 truncate font-mono text-[11px]">
        {row.node.id}
      </span>
      <span className="flex-1 truncate">{row.node.label}</span>
      <span className="w-16 flex-shrink-0 text-right font-mono">
        {row.node.count.toLocaleString()}
      </span>
    </button>
  );
}
