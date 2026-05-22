import { breadcrumbTrail } from "@/lib/ontology/layout";
import type { Subtree } from "@/lib/ontology/types";

interface BreadcrumbsProps {
  readonly subtree: Subtree;
  readonly focusId: string;
  readonly onSelect: (id: string) => void;
}

/**
 * Breadcrumb trail: root → focus. Each crumb is a button that jumps the
 * sunburst focus back to that level.
 */
export function Breadcrumbs({ subtree, focusId, onSelect }: BreadcrumbsProps) {
  const trail = breadcrumbTrail(subtree, focusId);
  if (trail.length === 0) return null;

  return (
    <nav
      aria-label="Sunburst zoom trail"
      className="flex flex-wrap items-center gap-1 text-xs"
    >
      {trail.map((node, i) => {
        const isLast = i === trail.length - 1;
        return (
          <span key={node.id} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onSelect(node.id)}
              className={
                isLast
                  ? "rounded bg-accent/15 px-2 py-0.5 font-mono text-[11px] text-accent-soft"
                  : "rounded px-2 py-0.5 font-mono text-[11px] text-muted hover:bg-elevated hover:text-ink"
              }
              aria-current={isLast ? "true" : undefined}
            >
              {node.label || node.id}
            </button>
            {isLast ? null : <span className="text-subtle">/</span>}
          </span>
        );
      })}
    </nav>
  );
}
