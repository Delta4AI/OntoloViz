import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { ExportMenu } from "./components/export/ExportMenu";
import { ExportPanel } from "./components/export/ExportPanel";
import { HealthIndicator } from "./components/HealthIndicator";
import { LandingPage } from "./components/landing/LandingPage";
import {
  OboFoundryPicker,
  type OboFetchRequest,
} from "./components/landing/OboFoundryPicker";
import { LoadingOverlay } from "./components/LoadingOverlay";
import { OverviewGrid } from "./components/overview/OverviewGrid";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { SummaryGrid } from "./components/grid/SummaryGrid";
import { Sunburst } from "./components/sunburst/Sunburst";
import { ThemeToggle } from "./components/ThemeToggle";
import { fetchObo } from "./lib/ontology/obo";
import { parseTsv } from "./lib/ontology/parse";
import { derivePropagated, useAppStore, type ViewMode } from "./lib/store";

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
  const viewMode = useAppStore((s) => s.viewMode);
  const setOntology = useAppStore((s) => s.setOntology);
  const setActiveRoot = useAppStore((s) => s.setActiveRoot);
  const setViewMode = useAppStore((s) => s.setViewMode);
  const updateNode = useAppStore((s) => s.updateNode);
  const reset = useAppStore((s) => s.reset);

  const [loading, setLoading] = useState<LoadingState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [oboPickerOpen, setOboPickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Defer the heavy propagation so settings edits keep the UI responsive:
  // React renders immediately with the stale `propagated` and schedules the
  // recompute as low-priority. `isRecomputing` drives a top-of-main progress
  // bar so users get feedback that work is in flight.
  const deferredCount = useDeferredValue(count);
  const deferredColor = useDeferredValue(color);
  const propagated = useMemo(
    () => derivePropagated(raw, deferredCount, deferredColor),
    [raw, deferredCount, deferredColor],
  );
  const isRecomputing = count !== deferredCount || color !== deferredColor;

  const subtrees = useMemo(
    () =>
      propagated
        ? [...propagated.subtrees.values()].sort((a, b) =>
            a.rootId < b.rootId ? -1 : a.rootId > b.rootId ? 1 : 0,
          )
        : [],
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

  const handleOboFetch = async (req: OboFetchRequest) => {
    setOboPickerOpen(false);
    setFileName(req.label);
    setLoading({ stage: "Fetching OBO file…", detail: req.url, progress: 0.2 });
    await yieldToPaint();
    try {
      const ontology = await fetchObo(req.url, {
        ...(req.rootId ? { rootId: req.rootId } : {}),
        ...(typeof req.minNodeSize === "number"
          ? { minNodeSize: req.minNodeSize }
          : {}),
      });
      setLoading({
        stage: "Propagating counts & colors…",
        detail: `${ontology.nodeCount.toLocaleString()} nodes · ${ontology.subtrees.size} subtree(s)`,
        progress: 0.85,
      });
      await yieldToPaint();
      setOntology(ontology);
      setLoading({ stage: "Rendering sunburst…", progress: 1 });
      await yieldToPaint();
      setLoading(null);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "fetch failed";
      setLoading({
        stage: "OBO fetch failed",
        detail: message,
        progress: 1,
      });
      setTimeout(() => setLoading(null), 1800);
    }
  };

  // LandingPage's "Try Example" path fetches a bundled TSV and re-dispatches
  // it through the standard upload pipeline via a custom event.
  useEffect(() => {
    const onLoadFile = (e: Event) => {
      const file = (e as CustomEvent<File>).detail;
      if (file instanceof File) void handleFile(file);
    };
    window.addEventListener("ontoloviz:load-file", onLoadFile);
    return () => window.removeEventListener("ontoloviz:load-file", onLoadFile);
    // handleFile closes over state setters that are stable from useState —
    // re-registering on every render would be a wasteful no-op.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEdit = async (
    rootId: string,
    nodeId: string,
    patch: Partial<
      Pick<import("./lib/ontology/types").Node, "count" | "color" | "label">
    >,
  ) => {
    // Show the blocking overlay around the edit so large trees don't appear
    // frozen while count/color propagation recomputes. Two RAF yields wrap
    // the synchronous re-derive triggered by updateNode → render → useMemo.
    setLoading({ stage: "Applying edit…", detail: `${rootId} · ${nodeId}` });
    await yieldToPaint();
    updateNode(rootId, nodeId, patch);
    await yieldToPaint();
    setLoading(null);
  };

  const triggerUpload = () => fileInputRef.current?.click();

  const handleReset = () => {
    reset();
    setFileName(null);
    setSettingsOpen(false);
    setTableOpen(false);
    setConfirmReset(false);
  };

  const requestReset = () => setConfirmReset(true);

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
        onPickSubtree={(id) => {
          if (id === null) {
            setViewMode("overview");
          } else {
            setActiveRoot(id);
            setViewMode("detail");
          }
        }}
        onRequestReset={requestReset}
        onToggleSettings={() => setSettingsOpen((v) => !v)}
        settingsOpen={settingsOpen}
        exportSubtree={activeSubtree}
        exportOntology={propagated}
        onOpenExportPanel={() => {
          setSettingsOpen(false);
          setExportOpen(true);
        }}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        canShowOverview={subtrees.length > 1}
      />

      <main className="relative flex-1" aria-busy={isRecomputing}>
        {exportOpen && hasData && propagated ? (
          <ExportPanel
            subtree={activeSubtree}
            ontology={propagated}
            {...(activeRoot !== null ? { focusId: activeRoot } : {})}
            onClose={() => setExportOpen(false)}
          />
        ) : hasData && propagated ? (
          <LoadedView
            isRecomputing={isRecomputing}
            viewKey={
              viewMode === "overview" ? "__overview__" : (activeSubtree?.rootId ?? "")
            }
            sunburst={
              viewMode === "overview" || !activeSubtree ? (
                <OverviewGrid
                  ontology={propagated}
                  onPick={(id) => {
                    setActiveRoot(id);
                    setViewMode("detail");
                  }}
                />
              ) : (
                <Sunburst subtree={activeSubtree} />
              )
            }
            table={
              <SummaryGrid
                ontology={propagated}
                open={tableOpen}
                onToggle={() => setTableOpen((v) => !v)}
                onEdit={handleEdit}
              />
            }
          />
        ) : (
          <LandingPage
            onUpload={triggerUpload}
            onPickObo={() => setOboPickerOpen(true)}
          />
        )}

        {settingsOpen && !exportOpen ? (
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

      {oboPickerOpen ? (
        <OboFoundryPicker
          onClose={() => setOboPickerOpen(false)}
          onFetch={(req) => void handleOboFetch(req)}
        />
      ) : null}

      {confirmReset ? (
        <ConfirmDialog
          title="Clear loaded ontology?"
          body={
            fileName
              ? `“${fileName}” and any inline edits will be discarded. This cannot be undone.`
              : "The current ontology and any inline edits will be discarded. This cannot be undone."
          }
          confirmLabel="Reset"
          onConfirm={handleReset}
          onCancel={() => setConfirmReset(false)}
        />
      ) : null}
    </div>
  );
}

interface ConfirmDialogProps {
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Escape always cancels; backdrop click cancels via the outer onClick while
  // clicks inside the panel stop propagation so the panel stays open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      onClick={onCancel}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[min(92vw,420px)] rounded-xl border border-border bg-panel px-6 py-5 shadow-pop"
      >
        <h2
          id="confirm-title"
          className="text-sm font-semibold tracking-tight text-ink"
        >
          {title}
        </h2>
        <p className="mt-2 text-xs text-muted">{body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border bg-elevated px-3 py-1.5 text-xs text-ink hover:bg-border"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-on-accent hover:bg-accent-soft"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

interface HeaderProps {
  readonly hasData: boolean;
  readonly fileName: string | null;
  readonly subtrees: readonly { id: string; count: number }[];
  readonly activeRoot: string | null;
  readonly onPickSubtree: (id: string | null) => void;
  readonly onRequestReset: () => void;
  readonly onToggleSettings: () => void;
  readonly settingsOpen: boolean;
  readonly exportSubtree: import("./lib/ontology/types").Subtree | null;
  readonly exportOntology: import("./lib/ontology/types").Ontology | null;
  readonly onOpenExportPanel: () => void;
  readonly viewMode: ViewMode;
  readonly onViewModeChange: (mode: ViewMode) => void;
  /** Overview toggle is hidden for single-subtree ontologies (one tile == sunburst). */
  readonly canShowOverview: boolean;
}

function Header({
  hasData,
  fileName,
  subtrees,
  activeRoot,
  onPickSubtree,
  onRequestReset,
  onToggleSettings,
  settingsOpen,
  exportSubtree,
  exportOntology,
  onOpenExportPanel,
  viewMode,
  onViewModeChange,
  canShowOverview,
}: HeaderProps) {
  // When an ontology is loaded the logo doubles as the reset affordance —
  // clicking opens a confirmation dialog. Otherwise it's a static brand mark.
  const brand = (
    <>
      <span aria-hidden className="inline-block h-2 w-2 rounded-sm bg-ink" />
      <span className="text-[14px] font-semibold tracking-tight">OntoloViz</span>
    </>
  );

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur">
      <div className="flex h-14 items-center gap-4 px-6">
        {hasData ? (
          <button
            type="button"
            onClick={onRequestReset}
            title="Clear loaded ontology and return to start"
            className="group flex items-center gap-2 rounded-md px-1 py-1 -mx-1 transition-colors hover:bg-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {brand}
            <span className="hidden text-[10px] uppercase tracking-widest text-subtle group-hover:text-muted md:inline">
              · reset
            </span>
          </button>
        ) : (
          <div className="flex items-center gap-2">{brand}</div>
        )}

        {hasData ? (
          <>
            <span className="h-5 w-px bg-border" aria-hidden />
            {canShowOverview ? (
              <ViewModeToggle value={viewMode} onChange={onViewModeChange} />
            ) : null}
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
              <ExportMenu
                subtree={exportSubtree}
                ontology={exportOntology}
                onOpenPanel={onOpenExportPanel}
              />
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
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}

interface ViewModeToggleProps {
  readonly value: ViewMode;
  readonly onChange: (mode: ViewMode) => void;
}

function ViewModeToggle({ value, onChange }: ViewModeToggleProps) {
  const baseClass =
    "px-2.5 py-1 text-[11px] font-medium uppercase tracking-widest transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";
  const activeClass = "bg-accent text-on-accent";
  const idleClass = "text-muted hover:text-ink";

  return (
    <div
      role="tablist"
      aria-label="View mode"
      className="inline-flex overflow-hidden rounded-md border border-border bg-elevated"
    >
      <button
        type="button"
        role="tab"
        aria-selected={value === "overview"}
        onClick={() => onChange("overview")}
        className={`${baseClass} ${value === "overview" ? activeClass : idleClass}`}
      >
        Overview
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === "detail"}
        onClick={() => onChange("detail")}
        className={`${baseClass} ${value === "detail" ? activeClass : idleClass}`}
      >
        Detail
      </button>
    </div>
  );
}

function SubtreePicker({
  subtrees,
  activeRoot,
  onPick,
}: {
  readonly subtrees: readonly { id: string; count: number }[];
  readonly activeRoot: string | null;
  readonly onPick: (id: string | null) => void;
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
        onChange={(e) => {
          const v = e.currentTarget.value;
          onPick(v === "" ? null : v);
        }}
        className="rounded-md border border-border bg-elevated px-2 py-1 font-mono text-[11px] text-ink focus:border-accent focus:outline-none"
      >
        <option value="" className="bg-elevated">
          — all subtrees —
        </option>
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
  viewKey,
  sunburst,
  table,
  isRecomputing,
}: {
  readonly viewKey: string;
  readonly sunburst: ReactNode;
  readonly table: ReactNode;
  readonly isRecomputing: boolean;
}) {
  return (
    <div className="mx-auto flex h-full max-w-[1400px] flex-col gap-6 px-6 py-6">
      <div
        key={viewKey}
        className={`fade-in relative z-20 rounded-2xl border border-border bg-panel p-4 shadow-panel ${
          isRecomputing ? "recomputing-ring" : ""
        }`}
      >
        {sunburst}
      </div>
      <div className="rounded-2xl border border-border bg-panel shadow-panel">
        {table}
      </div>
    </div>
  );
}
