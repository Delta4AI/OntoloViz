import { useMemo, useState } from "react";

import { ExportBar } from "./components/export/ExportBar";
import { HealthIndicator } from "./components/HealthIndicator";
import { LoadingOverlay } from "./components/LoadingOverlay";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { SummaryGrid } from "./components/grid/SummaryGrid";
import { Sunburst } from "./components/sunburst/Sunburst";
import { parseTsv } from "./lib/ontology/parse";
import { derivePropagated, useAppStore } from "./lib/store";

interface LoadingState {
  readonly stage: string;
  readonly detail?: string;
  readonly progress?: number;
}

/** Yield to the browser so pending state updates can paint before we block on CPU. */
const yieldToPaint = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

const formatBytes = (n: number): string => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
};

export function App() {
  const raw = useAppStore((s) => s.raw);
  const count = useAppStore((s) => s.count);
  const color = useAppStore((s) => s.color);
  const activeRoot = useAppStore((s) => s.activeRoot);
  const setOntology = useAppStore((s) => s.setOntology);
  const setActiveRoot = useAppStore((s) => s.setActiveRoot);
  const [loading, setLoading] = useState<LoadingState | null>(null);

  const propagated = useMemo(
    () => derivePropagated(raw, count, color),
    [raw, count, color],
  );

  const subtrees = useMemo(
    () => (propagated ? [...propagated.subtrees.values()] : []),
    [propagated],
  );

  const activeSubtree = useMemo(
    () =>
      propagated && activeRoot ? (propagated.subtrees.get(activeRoot) ?? null) : null,
    [propagated, activeRoot],
  );

  const handleFile = async (file: File) => {
    try {
      setLoading({
        stage: "Reading file…",
        detail: `${file.name} · ${formatBytes(file.size)}`,
        progress: 0.1,
      });
      await yieldToPaint();
      const text = await file.text();

      setLoading({
        stage: "Parsing TSV…",
        detail: `${formatBytes(text.length)} of text`,
        progress: 0.45,
      });
      await yieldToPaint();
      const ontology = parseTsv(text);

      setLoading({
        stage: "Propagating counts & colors…",
        detail: `${ontology.nodeCount.toLocaleString()} nodes · ${ontology.subtrees.size} subtree(s)`,
        progress: 0.8,
      });
      await yieldToPaint();
      setOntology(ontology);

      setLoading({ stage: "Rendering sunburst…", progress: 1 });
      await yieldToPaint();
      setLoading(null);
    } catch (e) {
      console.error(e);
      setOntology(null);
      setLoading(null);
    }
  };

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-line px-8 py-5">
        <div className="flex items-baseline justify-between">
          <h1 className="font-sans text-2xl font-semibold tracking-tight">OntoloViz</h1>
          <span className="text-xs uppercase tracking-widest text-muted">
            ontology sunburst
          </span>
        </div>
      </header>

      <main className="flex-1 px-8 py-10">
        <section className="mx-auto flex max-w-6xl flex-col gap-6">
          <div className="flex items-center justify-between gap-4">
            <p className="max-w-2xl text-sm text-muted">
              Upload a phenotype or drug TSV, tweak propagation, and explore the
              sunburst. Settings update the render live.
            </p>
            <HealthIndicator />
          </div>

          <label className="inline-flex w-fit cursor-pointer items-center gap-3 rounded-md border border-line px-4 py-2 text-sm transition hover:bg-white/5">
            <span>Choose TSV</span>
            <input
              type="file"
              accept=".tsv,.txt,.xlsx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
          </label>

          {raw && subtrees.length > 0 ? (
            <div className="flex gap-6">
              <div className="flex flex-1 flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted">Subtree:</span>
                  {subtrees.map((s) => (
                    <button
                      key={s.rootId}
                      type="button"
                      onClick={() => setActiveRoot(s.rootId)}
                      className={
                        s.rootId === activeRoot
                          ? "rounded bg-white/10 px-2 py-0.5 font-mono text-[11px] text-white"
                          : "rounded px-2 py-0.5 font-mono text-[11px] text-muted hover:bg-white/5 hover:text-white"
                      }
                    >
                      {s.rootId}
                    </button>
                  ))}
                </div>
                {activeSubtree ? (
                  <>
                    <Sunburst subtree={activeSubtree} />
                    <ExportBar subtree={activeSubtree} />
                  </>
                ) : null}
                <SummaryGrid ontology={propagated} />
              </div>
              <SettingsPanel />
            </div>
          ) : null}
        </section>
      </main>

      <footer className="border-t border-line px-8 py-4 text-xs text-muted">
        OntoloViz · ontology sunburst with live propagation and exports.
      </footer>

      {loading ? (
        <LoadingOverlay
          stage={loading.stage}
          {...(loading.detail !== undefined ? { detail: loading.detail } : {})}
          {...(loading.progress !== undefined ? { progress: loading.progress } : {})}
        />
      ) : null}
    </div>
  );
}
