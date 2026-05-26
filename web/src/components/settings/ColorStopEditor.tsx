import { useRef, useState } from "react";
import type { ColorStop } from "@/lib/ontology/color";

interface ColorStopEditorProps {
  readonly stops: readonly ColorStop[];
  readonly onChange: (stops: readonly ColorStop[]) => void;
}

const MIN_GAP = 0.005;

/**
 * Edit the gradient stops driving color propagation.
 *
 * Drags and number edits stage into local `draft` state so the gradient bar
 * updates instantly; the (expensive) parent `onChange` only fires on release
 * / blur / Enter, avoiding a full color-propagation pass per pointer move.
 */
export function ColorStopEditor({ stops, onChange }: ColorStopEditorProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<readonly ColorStop[] | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  const view = draft ?? stops;

  const commit = (next: readonly ColorStop[]) => {
    setDraft(null);
    onChange(next);
  };

  const stageColor = (i: number, color: string) => {
    commit(view.map((s, j): ColorStop => (i === j ? [s[0], color] : s)));
  };

  const clampedPosition = (
    source: readonly ColorStop[],
    i: number,
    rawPos: number,
  ): number => {
    const lower = (source[i - 1]?.[0] ?? 0) + MIN_GAP;
    const upper = (source[i + 1]?.[0] ?? 1) - MIN_GAP;
    return Math.min(upper, Math.max(lower, rawPos));
  };

  const stagePosition = (i: number, rawPos: number) => {
    if (i === 0 || i === view.length - 1) return;
    const source = view;
    const clamped = clampedPosition(source, i, rawPos);
    setDraft(source.map((s, j): ColorStop => (i === j ? [clamped, s[1]] : s)));
  };

  const commitPosition = (i: number, rawPos: number) => {
    if (i === 0 || i === view.length - 1) return;
    const clamped = clampedPosition(view, i, rawPos);
    commit(view.map((s, j): ColorStop => (i === j ? [clamped, s[1]] : s)));
  };

  const remove = (i: number) => {
    if (view.length <= 2) return;
    if (i === 0 || i === view.length - 1) return;
    commit(view.filter((_, j) => j !== i));
  };

  const addBefore = (i: number) => {
    const prev = view[i - 1];
    const curr = view[i];
    if (!prev || !curr) return;
    const midPos = (prev[0] + curr[0]) / 2;
    const inserted: ColorStop = [midPos, curr[1]];
    commit([...view.slice(0, i), inserted, ...view.slice(i)]);
  };

  const positionFromEvent = (clientX: number): number | null => {
    const track = trackRef.current;
    if (!track) return null;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return null;
    return (clientX - rect.left) / rect.width;
  };

  const startDrag = (i: number, e: React.PointerEvent<HTMLButtonElement>) => {
    if (i === 0 || i === view.length - 1) return;
    e.preventDefault();
    setDraggingIdx(i);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onDragMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (draggingIdx === null) return;
    const ratio = positionFromEvent(e.clientX);
    if (ratio !== null) stagePosition(draggingIdx, ratio);
  };

  const endDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (draggingIdx === null) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const finalDraft = draft;
    setDraggingIdx(null);
    if (finalDraft) commit(finalDraft);
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-canvas p-2">
      <div className="relative pt-3 pb-4">
        <div
          ref={trackRef}
          aria-hidden
          className="h-3 rounded-full"
          style={{
            background: `linear-gradient(to right, ${view
              .map((s) => `${s[1]} ${s[0] * 100}%`)
              .join(", ")})`,
          }}
        />
        {view.map((stop, i) => {
          const locked = i === 0 || i === view.length - 1;
          return (
            <button
              key={`thumb-${i}`}
              type="button"
              onPointerDown={(e) => startDrag(i, e)}
              onPointerMove={onDragMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              disabled={locked}
              className={`absolute top-1/2 h-5 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-canvas shadow ring-1 ring-border ${
                locked ? "cursor-default opacity-70" : "cursor-ew-resize hover:ring-ink"
              } ${draggingIdx === i ? "ring-ink" : ""}`}
              style={{ left: `${stop[0] * 100}%`, background: stop[1] }}
              aria-label={
                locked
                  ? `Stop ${i} anchored at ${stop[0].toFixed(2)}`
                  : `Drag stop ${i} (currently at ${stop[0].toFixed(2)})`
              }
            />
          );
        })}
      </div>
      {view.map((stop, i) => {
        const locked = i === 0 || i === view.length - 1;
        return (
          <div key={`row-${i}`} className="flex items-center gap-2 text-[11px]">
            <PositionInput
              value={stop[0]}
              disabled={locked}
              onStage={(v) => stagePosition(i, v)}
              onCommit={(v) => commitPosition(i, v)}
              ariaLabel={`Stop ${i} position`}
            />
            <input
              type="color"
              value={stop[1]}
              onChange={(e) => stageColor(i, e.currentTarget.value.toUpperCase())}
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
            {!locked && view.length > 2 ? (
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
        );
      })}
    </div>
  );
}

interface PositionInputProps {
  readonly value: number;
  readonly disabled: boolean;
  readonly onStage: (v: number) => void;
  readonly onCommit: (v: number) => void;
  readonly ariaLabel: string;
}

/**
 * Number input that stages keystrokes locally but only commits to the parent
 * on blur or Enter — keeps the bar in sync while typing without re-running
 * propagation per character.
 */
function PositionInput({
  value,
  disabled,
  onStage,
  onCommit,
  ariaLabel,
}: PositionInputProps) {
  const [text, setText] = useState<string | null>(null);
  const display = text ?? value.toFixed(2);

  const tryStage = (raw: string) => {
    setText(raw);
    const v = Number(raw);
    if (Number.isFinite(v)) onStage(v);
  };

  const flush = () => {
    if (text === null) return;
    const v = Number(text);
    setText(null);
    if (Number.isFinite(v)) onCommit(v);
  };

  return (
    <input
      type="number"
      min={0}
      max={1}
      step={0.01}
      value={display}
      disabled={disabled}
      onChange={(e) => tryStage(e.currentTarget.value)}
      onBlur={flush}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
      }}
      className="w-14 rounded border border-border bg-elevated px-1 py-0.5 font-mono text-ink disabled:cursor-not-allowed disabled:opacity-50"
      aria-label={ariaLabel}
    />
  );
}
