import { useEffect, useRef, useState } from "react";

import { OBO_PRESETS, type OboPreset } from "../../lib/ontology/obo";

interface OboFoundryPickerProps {
  readonly onClose: () => void;
  readonly onFetch: (url: string, label: string) => void;
}

/**
 * Modal for picking an OBO Foundry ontology. Two ways in: pick a preset
 * (HPO, GO, MONDO, …) or paste a custom .obo URL. The actual fetch is
 * delegated up so the App can drive the loading overlay.
 */
export function OboFoundryPicker({ onClose, onFetch }: OboFoundryPickerProps) {
  const [customUrl, setCustomUrl] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const firstButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    firstButtonRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submitPreset = (preset: OboPreset) => {
    setSelected(preset.id);
    onFetch(preset.url, preset.name);
  };

  const submitCustom = () => {
    const trimmed = customUrl.trim();
    if (!trimmed) return;
    const label = trimmed.split("/").pop() || trimmed;
    onFetch(trimmed, label);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="obo-picker-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[min(96vw,640px)] max-h-[92vh] overflow-hidden rounded-xl border border-border bg-panel shadow-pop"
      >
        <header className="flex items-center justify-between border-b border-hairline px-5 py-3">
          <h2 id="obo-picker-title" className="text-sm font-semibold text-ink">
            Fetch from OBO Foundry
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-muted hover:bg-elevated hover:text-ink"
          >
            ×
          </button>
        </header>

        <div className="max-h-[68vh] overflow-y-auto px-5 py-4">
          <p className="text-xs text-muted">
            Pick a curated ontology or paste a direct <code>.obo</code> URL. Files
            are proxied through the local backend and parsed server-side.
          </p>

          <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {OBO_PRESETS.map((preset, idx) => (
              <li key={preset.id}>
                <button
                  ref={idx === 0 ? firstButtonRef : undefined}
                  type="button"
                  onClick={() => submitPreset(preset)}
                  disabled={selected !== null}
                  className="group flex w-full flex-col items-start gap-1 rounded-md border border-border bg-elevated px-3 py-2.5 text-left transition-colors hover:border-accent hover:bg-panel disabled:opacity-50"
                >
                  <span className="text-[13px] font-medium text-ink">
                    {preset.name}
                  </span>
                  <span className="text-[11px] leading-snug text-muted">
                    {preset.description}
                  </span>
                  <span className="font-mono text-[10px] text-subtle">
                    {preset.url}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-5 border-t border-hairline pt-4">
            <label
              htmlFor="obo-custom-url"
              className="block text-[11px] uppercase tracking-widest text-subtle"
            >
              Custom URL
            </label>
            <div className="mt-1.5 flex gap-2">
              <input
                id="obo-custom-url"
                type="url"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitCustom();
                }}
                placeholder="https://purl.obolibrary.org/obo/…"
                className="flex-1 rounded-md border border-border bg-elevated px-2.5 py-1.5 font-mono text-[12px] text-ink placeholder:text-subtle focus:border-accent focus:outline-none"
              />
              <button
                type="button"
                onClick={submitCustom}
                disabled={!customUrl.trim() || selected !== null}
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-on-accent hover:bg-accent-soft disabled:opacity-50"
              >
                Fetch
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
