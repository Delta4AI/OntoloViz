import { useMemo, useRef, useState, type ReactNode } from "react";

import { ExportMenu } from "./components/export/ExportMenu";
import { HealthIndicator } from "./components/HealthIndicator";
import { LoadingOverlay } from "./components/LoadingOverlay";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { SummaryGrid } from "./components/grid/SummaryGrid";
import { Sunburst } from "./components/sunburst/Sunburst";
import { ThemeToggle } from "./components/ThemeToggle";
import { parseTsv } from "./lib/ontology/parse";
import { derivePropagated, useAppStore } from "./lib/store";

interface LoadingState {
  readonly stage: string;
  readonly detail?: string;
  readonly progress?: number;
}

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
  const reset = useAppStore((s) => s.reset);

  const [loading, setLoading] = useState<LoadingState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
      setFileName(file.name);
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

  const triggerUpload = () => fileInputRef.current?.click();

  const handleReset = () => {
    reset();
    setFileName(null);
    setSettingsOpen(false);
    setTableOpen(false);
  };

  const hasData = raw !== null && subtrees.length > 0;

  return (
    <div className="flex min-h-full flex-col">
      <input
        ref={fileInputRef}
        type="file"
        accept=".tsv,.txt,.xlsx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.currentTarget.value = "";
        }}
      />

      <Header
        hasData={hasData}
        fileName={fileName}
        subtrees={subtrees.map((s) => ({ id: s.rootId, count: s.nodes.size }))}
        activeRoot={activeRoot}
        onPickSubtree={setActiveRoot}
        onUpload={triggerUpload}
        onReset={handleReset}
        onToggleSettings={() => setSettingsOpen((v) => !v)}
        settingsOpen={settingsOpen}
        exportSubtree={activeSubtree}
      />

      <main className="relative flex-1">
        {hasData && activeSubtree ? (
          <LoadedView
            activeSubtreeKey={activeSubtree.rootId}
            sunburst={<Sunburst subtree={activeSubtree} />}
            table={
              <SummaryGrid
                ontology={propagated}
                open={tableOpen}
                onToggle={() => setTableOpen((v) => !v)}
              />
            }
          />
        ) : (
          <EmptyState onUpload={triggerUpload} />
        )}

        {settingsOpen ? (
          <>
            <button
              type="button"
              aria-label="Close settings"
              onClick={() => setSettingsOpen(false)}
              className="fade-in absolute inset-0 z-10 bg-black/40 backdrop-blur-[2px]"
            />
            <div className="drawer-in absolute right-0 top-0 z-20 h-full w-[340px] border-l border-border bg-panel shadow-pop">
              <SettingsPanel onClose={() => setSettingsOpen(false)} />
            </div>
          </>
        ) : null}
      </main>

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

interface HeaderProps {
  readonly hasData: boolean;
  readonly fileName: string | null;
  readonly subtrees: readonly { id: string; count: number }[];
  readonly activeRoot: string | null;
  readonly onPickSubtree: (id: string) => void;
  readonly onUpload: () => void;
  readonly onReset: () => void;
  readonly onToggleSettings: () => void;
  readonly settingsOpen: boolean;
  readonly exportSubtree: import("./lib/ontology/types").Subtree | null;
}

function Header({
  hasData,
  fileName,
  subtrees,
  activeRoot,
  onPickSubtree,
  onUpload,
  onReset,
  onToggleSettings,
  settingsOpen,
  exportSubtree,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur">
      <div className="flex h-14 items-center gap-4 px-6">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block h-5 w-5 rounded-full bg-gradient-to-br from-accent to-accent-soft shadow-[0_0_20px_-2px_rgba(231,111,81,0.6)]"
          />
          <span className="text-[15px] font-semibold tracking-tight">OntoloViz</span>
        </div>

        {hasData ? (
          <>
            <span className="h-5 w-px bg-border" aria-hidden />
            <SubtreePicker
              subtrees={subtrees}
              activeRoot={activeRoot}
              onPick={onPickSubtree}
            />
            {fileName ? (
              <span className="hidden truncate font-mono text-[11px] text-muted md:inline">
                {fileName}
              </span>
            ) : null}
          </>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <HealthIndicator />
          <ThemeToggle />
          {hasData ? (
            <>
              <ExportMenu subtree={exportSubtree} />
              <button
                type="button"
                onClick={onToggleSettings}
                aria-pressed={settingsOpen}
                className={
                  settingsOpen
                    ? "rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-on-accent"
                    : "rounded-md border border-border bg-elevated px-3 py-1.5 text-xs text-ink hover:bg-border"
                }
              >
                Settings
              </button>
              <button
                type="button"
                onClick={onReset}
                className="rounded-md border border-border bg-transparent px-3 py-1.5 text-xs text-muted hover:bg-elevated hover:text-ink"
                title="Clear loaded ontology"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={onUpload}
                className="rounded-md border border-border bg-elevated px-3 py-1.5 text-xs text-ink hover:bg-border"
              >
                Load new…
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onUpload}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-on-accent hover:bg-accent-soft"
            >
              Choose TSV
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function SubtreePicker({
  subtrees,
  activeRoot,
  onPick,
}: {
  readonly subtrees: readonly { id: string; count: number }[];
  readonly activeRoot: string | null;
  readonly onPick: (id: string) => void;
}) {
  if (subtrees.length === 0) return null;
  if (subtrees.length === 1) {
    const only = subtrees[0]!;
    return (
      <span className="rounded bg-elevated px-2 py-1 font-mono text-[11px] text-ink">
        {only.id}
        <span className="ml-2 text-muted">{only.count.toLocaleString()} nodes</span>
      </span>
    );
  }
  return (
    <label className="inline-flex items-center gap-2 text-xs text-muted">
      <span className="uppercase tracking-widest text-subtle">subtree</span>
      <select
        value={activeRoot ?? ""}
        onChange={(e) => onPick(e.currentTarget.value)}
        className="rounded-md border border-border bg-elevated px-2 py-1 font-mono text-[11px] text-ink focus:border-accent focus:outline-none"
      >
        {subtrees.map((s) => (
          <option key={s.id} value={s.id} className="bg-elevated">
            {s.id} ({s.count.toLocaleString()})
          </option>
        ))}
      </select>
    </label>
  );
}

function LoadedView({
  activeSubtreeKey,
  sunburst,
  table,
}: {
  readonly activeSubtreeKey: string;
  readonly sunburst: ReactNode;
  readonly table: ReactNode;
}) {
  return (
    <div className="mx-auto flex h-full max-w-[1400px] flex-col gap-6 px-6 py-6">
      <div
        key={activeSubtreeKey}
        className="fade-in rounded-2xl border border-border bg-panel p-4 shadow-panel"
      >
        {sunburst}
      </div>
      <div className="rounded-2xl border border-border bg-panel shadow-panel">
        {table}
      </div>
    </div>
  );
}

function EmptyState({ onUpload }: { readonly onUpload: () => void }) {
  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-panel px-3 py-1 text-[11px] uppercase tracking-widest text-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        ontology sunburst
      </div>
      <h1 className="bg-gradient-to-b from-ink to-muted bg-clip-text text-4xl font-semibold leading-tight tracking-tight text-transparent sm:text-5xl">
        Explore your ontology
        <br />
        as a living sunburst.
      </h1>
      <p className="mt-4 max-w-xl text-sm text-muted">
        Upload a phenotype, drug, or MeSH TSV. Counts and colors propagate live across
        the tree. Tweak the scale, edit values inline, export anywhere.
      </p>

      <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onUpload}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-on-accent shadow-[0_8px_24px_-8px_rgba(231,111,81,0.6)] hover:bg-accent-soft"
        >
          Choose TSV file
        </button>
        <span className="text-xs text-subtle">
          .tsv / .txt / .xlsx · parsed locally
        </span>
      </div>

      <ul className="mt-12 grid w-full grid-cols-1 gap-3 text-left sm:grid-cols-3">
        <FeatureCard
          title="Live propagation"
          body="Count + color rules cascade through every depth. No reload required."
        />
        <FeatureCard
          title="Inline editing"
          body="Adjust a node's count, label, or color from the data table — viz updates instantly."
        />
        <FeatureCard
          title="Sharp exports"
          body="2× PNG, vector SVG, or a standalone interactive HTML you can email."
        />
      </ul>
    </div>
  );
}

function FeatureCard({
  title,
  body,
}: {
  readonly title: string;
  readonly body: string;
}) {
  return (
    <li className="rounded-xl border border-border bg-panel p-4">
      <div className="text-xs font-semibold uppercase tracking-widest text-accent-soft">
        {title}
      </div>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </li>
  );
}
