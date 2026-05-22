import { useMemo } from "react";

import { ExportBar } from "./components/export/ExportBar";
import { HealthIndicator } from "./components/HealthIndicator";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { SummaryGrid } from "./components/grid/SummaryGrid";
import { Sunburst } from "./components/sunburst/Sunburst";
import { parseTsv } from "./lib/ontology/parse";
import { derivePropagated, useAppStore } from "./lib/store";

export function App() {
  const raw = useAppStore((s) => s.raw);
  const count = useAppStore((s) => s.count);
  const color = useAppStore((s) => s.color);
  const activeRoot = useAppStore((s) => s.activeRoot);
  const setOntology = useAppStore((s) => s.setOntology);
  const setActiveRoot = useAppStore((s) => s.setActiveRoot);

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
      const text = await file.text();
      setOntology(parseTsv(text));
    } catch (e) {
      console.error(e);
      setOntology(null);
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
    </div>
  );
}
