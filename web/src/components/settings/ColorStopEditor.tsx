import type { ColorStop } from "@/lib/ontology/color";

interface ColorStopEditorProps {
  readonly stops: readonly ColorStop[];
  readonly onChange: (stops: readonly ColorStop[]) => void;
}

/**
 * Edit the gradient stops driving color propagation.
 *
 * Each row is a position (read-only) and a color picker. Add/remove
 * operations keep positions in [0, 1] and sorted ascending.
 */
export function ColorStopEditor({ stops, onChange }: ColorStopEditorProps) {
  const update = (i: number, color: string) => {
    const next = stops.map((s, j): ColorStop => (i === j ? [s[0], color] : s));
    onChange(next);
  };
  const remove = (i: number) => {
    if (stops.length <= 2) return;
    onChange(stops.filter((_, j) => j !== i));
  };
  const addBefore = (i: number) => {
    const prev = stops[i - 1];
    const curr = stops[i];
    if (!prev || !curr) return;
    const midPos = (prev[0] + curr[0]) / 2;
    const inserted: ColorStop = [midPos, curr[1]];
    const next = [...stops.slice(0, i), inserted, ...stops.slice(i)];
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-canvas p-2">
      <div
        aria-hidden
        className="h-2 rounded-full"
        style={{
          background: `linear-gradient(to right, ${stops
            .map((s) => `${s[1]} ${s[0] * 100}%`)
            .join(", ")})`,
        }}
      />
      {stops.map((stop, i) => (
        <div key={`${i}-${stop[0]}`} className="flex items-center gap-2 text-[11px]">
          <span className="w-8 font-mono text-subtle">{stop[0].toFixed(2)}</span>
          <input
            type="color"
            value={stop[1]}
            onChange={(e) => update(i, e.currentTarget.value.toUpperCase())}
            className="h-5 w-8"
            aria-label={`Stop ${i} color`}
          />
          <span className="flex-1 font-mono text-muted">{stop[1]}</span>
          {i > 0 ? (
            <button
              type="button"
              onClick={() => addBefore(i)}
              className="rounded border border-border bg-elevated px-1.5 py-0.5 text-ink hover:bg-border"
              aria-label={`Insert stop before ${i}`}
            >
              +
            </button>
          ) : (
            <span className="w-[22px]" />
          )}
          {stops.length > 2 ? (
            <button
              type="button"
              onClick={() => remove(i)}
              className="rounded border border-border bg-elevated px-1.5 py-0.5 text-muted hover:bg-border hover:text-err"
              aria-label={`Remove stop ${i}`}
            >
              ×
            </button>
          ) : (
            <span className="w-[22px]" />
          )}
        </div>
      ))}
    </div>
  );
}
