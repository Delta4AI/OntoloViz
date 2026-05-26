import { useEffect, useMemo, useRef, useState } from "react";

import { filterRows, flattenRows, useAppStore, type GridRow } from "@/lib/store";
import type { Node, Ontology } from "@/lib/ontology/types";

type NodePatch = Partial<Pick<Node, "count" | "color" | "label">>;

interface SummaryGridProps {
  readonly ontology: Ontology | null;
  readonly open: boolean;
  readonly onToggle: () => void;
  /**
   * Edit handler — the parent wraps the underlying store mutation so it can
   * show the global loading overlay while propagation runs. When omitted,
   * the store mutation is invoked directly (used by tests / Storybook).
   */
  readonly onEdit?: (rootId: string, nodeId: string, patch: NodePatch) => void;
  /** Pixel height of the scrollable area when open. Defaults to 420. */
  readonly height?: number;
}

const ROW_HEIGHT = 32;
const OVERSCAN = 6;

/**
 * Collapsible, virtualized, inline-editable table of nodes across all subtrees.
 *
 * - Virtualized by hand: render only rows whose y-range intersects the viewport.
 * - Linked hover/search: row hover writes `hoveredId` to the store so the
 *   sunburst highlights the matching slice. Row click sets the active subtree.
 * - Inline editing: click on `label`, `count`, or `color` cells to edit. The
 *   patch flows through the store, which re-derives the propagated view.
 */
export function SummaryGrid({
  ontology,
  open,
  onToggle,
  onEdit,
  height = 420,
}: SummaryGridProps) {
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const hoveredId = useAppStore((s) => s.hoveredId);
  const setHoveredId = useAppStore((s) => s.setHoveredId);
  const activeRoot = useAppStore((s) => s.activeRoot);
  const setActiveRoot = useAppStore((s) => s.setActiveRoot);
  const updateNode = useAppStore((s) => s.updateNode);

  // Default to showing only the active subtree's rows; toggling on "All
  // subtrees" expands the view back to the full ontology.
  const [showAll, setShowAll] = useState(false);

  const allRows = useMemo(() => flattenRows(ontology), [ontology]);
  const scoped = useMemo(() => {
    if (showAll || !activeRoot) return allRows;
    return allRows.filter((r) => r.rootId === activeRoot);
  }, [allRows, showAll, activeRoot]);
  const filtered = useMemo(
    () => filterRows(scoped, searchQuery),
    [scoped, searchQuery],
  );

  const handlePatch = (rootId: string, nodeId: string, patch: NodePatch) => {
    if (onEdit) onEdit(rootId, nodeId, patch);
    else updateNode(rootId, nodeId, patch);
  };

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);

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
    <div className="flex flex-col">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex items-center justify-between gap-3 px-5 py-3 text-left hover:bg-elevated"
      >
        <span className="flex items-center gap-3">
          <Chevron open={open} />
          <span className="text-sm font-medium text-ink">Data table</span>
          <span className="font-mono text-[11px] text-muted">
            {showAll || !activeRoot
              ? `${allRows.length.toLocaleString()} nodes`
              : `${scoped.length.toLocaleString()} of ${allRows.length.toLocaleString()} nodes · ${activeRoot}`}
          </span>
        </span>
        <span className="text-[11px] uppercase tracking-widest text-subtle">
          {open ? "click to collapse" : "click to expand & edit"}
        </span>
      </button>

      {open ? (
        <div className="border-t border-border px-5 pb-5 pt-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="relative flex-1">
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.currentTarget.value)}
                placeholder="Filter by id or label…"
                className="w-full rounded-md border border-border bg-elevated px-3 py-2 text-sm text-ink placeholder:text-subtle focus:border-accent focus:outline-none"
                aria-label="Filter nodes"
              />
            </div>
            <label className="inline-flex cursor-pointer select-none items-center gap-2 whitespace-nowrap text-[11px] text-muted">
              <input
                type="checkbox"
                checked={showAll}
                onChange={(e) => setShowAll(e.currentTarget.checked)}
                className="h-3.5 w-3.5 cursor-pointer accent-accent"
              />
              <span className="uppercase tracking-widest text-subtle">
                all subtrees
              </span>
            </label>
            <span className="whitespace-nowrap font-mono text-[11px] text-muted">
              {filtered.length.toLocaleString()} / {scoped.length.toLocaleString()}
            </span>
          </div>

          <div className="overflow-hidden rounded-lg border border-border">
            <div className="grid grid-cols-[80px_180px_1fr_120px_60px] gap-2 border-b border-border bg-elevated px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
              <span>Subtree</span>
              <span>ID</span>
              <span>Label</span>
              <span className="text-right">Count</span>
              <span className="text-center">Color</span>
            </div>
            <div
              ref={scrollerRef}
              onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
              className="bg-canvas"
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
                      onJumpToSubtree={() => setActiveRoot(row.rootId)}
                      onPatch={(patch) => handlePatch(row.rootId, row.node.id, patch)}
                    />
                  );
                })}
              </div>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-subtle">
            Click a cell to edit · click the subtree tag to jump.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Chevron({ open }: { readonly open: boolean }) {
  return (
    <span
      aria-hidden
      className="inline-block text-muted transition-transform"
      style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
    >
      ▶
    </span>
  );
}

interface RowProps {
  readonly row: GridRow;
  readonly top: number;
  readonly isHovered: boolean;
  readonly onHover: () => void;
  readonly onLeave: () => void;
  readonly onJumpToSubtree: () => void;
  readonly onPatch: (
    patch: Partial<
      Pick<import("@/lib/ontology/types").Node, "count" | "color" | "label">
    >,
  ) => void;
}

function Row({
  row,
  top,
  isHovered,
  onHover,
  onLeave,
  onJumpToSubtree,
  onPatch,
}: RowProps) {
  return (
    <div
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      style={{
        position: "absolute",
        top,
        left: 0,
        right: 0,
        height: ROW_HEIGHT,
      }}
      className={
        isHovered
          ? "grid grid-cols-[80px_180px_1fr_120px_60px] items-center gap-2 bg-elevated px-3 text-xs text-ink"
          : "grid grid-cols-[80px_180px_1fr_120px_60px] items-center gap-2 px-3 text-xs text-ink/85 hover:bg-elevated/60"
      }
    >
      <button
        type="button"
        onClick={onJumpToSubtree}
        className="truncate rounded bg-border/60 px-1.5 py-0.5 text-left font-mono text-[10px] uppercase text-muted hover:bg-accent hover:text-on-accent"
        title={`Jump to subtree ${row.rootId}`}
      >
        {row.rootId}
      </button>

      <span className="truncate font-mono text-[11px] text-muted">{row.node.id}</span>

      <EditableText
        value={row.node.label}
        onCommit={(label) => onPatch({ label })}
        className="truncate text-ink"
      />

      <EditableNumber
        value={row.node.count}
        onCommit={(count) => onPatch({ count })}
        className="text-right font-mono text-ink"
      />

      <ColorCell value={row.node.color} onCommit={(color) => onPatch({ color })} />
    </div>
  );
}

function EditableText({
  value,
  onCommit,
  className,
}: {
  readonly value: string;
  readonly onCommit: (next: string) => void;
  readonly className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== value) onCommit(draft);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className="w-full rounded border border-accent bg-canvas px-1 py-0.5 text-xs text-ink focus:outline-none"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={`${className ?? ""} text-left hover:bg-border/40`}
    >
      {value || <span className="text-subtle">—</span>}
    </button>
  );
}

function EditableNumber({
  value,
  onCommit,
  className,
}: {
  readonly value: number;
  readonly onCommit: (next: number) => void;
  readonly className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    const n = Number(draft);
    if (Number.isFinite(n) && n !== value) onCommit(n);
    else setDraft(String(value));
  };

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(String(value));
            setEditing(false);
          }
        }}
        className="w-full rounded border border-accent bg-canvas px-1 py-0.5 text-right font-mono text-xs text-ink focus:outline-none"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={`${className ?? ""} hover:bg-border/40`}
    >
      {value.toLocaleString()}
    </button>
  );
}

function ColorCell({
  value,
  onCommit,
}: {
  readonly value: string;
  readonly onCommit: (next: string) => void;
}) {
  // The browser color input requires a 7-char #RRGGBB; pass white as fallback.
  const safe = /^#[0-9A-Fa-f]{6}$/.test(value) ? value : "#FFFFFF";
  return (
    <label className="mx-auto flex h-5 w-5 cursor-pointer items-center justify-center rounded-sm border border-border hover:border-accent">
      <span
        aria-hidden
        className="block h-full w-full rounded-sm"
        style={{ background: value || "#FFFFFF" }}
      />
      <input
        type="color"
        value={safe}
        onChange={(e) => onCommit(e.currentTarget.value.toUpperCase())}
        className="sr-only"
        aria-label="Edit node color"
      />
    </label>
  );
}
