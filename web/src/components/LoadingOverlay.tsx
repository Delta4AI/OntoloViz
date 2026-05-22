interface LoadingOverlayProps {
  readonly stage: string;
  readonly detail?: string;
  /** 0..1 — omit for an indeterminate animation. */
  readonly progress?: number;
}

/**
 * Full-viewport blocking overlay shown while the app is busy with work the
 * user should wait for (file read + parse + propagation). Renders a stage
 * label, an optional detail line, and a progress bar.
 */
export function LoadingOverlay({ stage, detail, progress }: LoadingOverlayProps) {
  const clamped =
    progress === undefined
      ? undefined
      : Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const pct = clamped === undefined ? null : Math.round(clamped * 100);
  const indeterminate = pct === null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-label={stage}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
    >
      <div className="w-[min(92vw,420px)] rounded-xl border border-border bg-panel px-6 py-5 shadow-pop">
        <div className="flex items-center gap-3">
          <span className="relative inline-flex h-2.5 w-2.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-accent/50" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
          </span>
          <h2 className="text-sm font-semibold tracking-tight text-ink">{stage}</h2>
        </div>
        {detail ? (
          <p className="ml-[22px] mt-1 font-mono text-[11px] text-muted">{detail}</p>
        ) : null}
        <div
          className="mt-4 h-1.5 overflow-hidden rounded-full bg-border"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          {...(pct !== null
            ? { "aria-valuenow": pct }
            : { "aria-valuetext": "in progress" })}
        >
          {indeterminate ? (
            <div className="h-full w-1/3 animate-[loading-slide_1.2s_ease-in-out_infinite] rounded-full bg-accent" />
          ) : (
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-200 ease-out"
              style={{ width: `${pct}%` }}
            />
          )}
        </div>
        <div className="mt-2 flex h-3 items-center justify-end font-mono text-[10px] tabular-nums text-muted">
          {pct !== null ? `${pct}%` : null}
        </div>
      </div>
    </div>
  );
}
