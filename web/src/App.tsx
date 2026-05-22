import { HealthIndicator } from "./components/HealthIndicator";

export function App() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-line px-8 py-5">
        <div className="flex items-baseline justify-between">
          <h1 className="font-sans text-2xl font-semibold tracking-tight">
            OntoloViz
          </h1>
          <span className="text-xs uppercase tracking-widest text-muted">
            V2 · scaffold
          </span>
        </div>
      </header>
      <main className="flex-1 px-8 py-10">
        <section className="max-w-2xl space-y-4">
          <p className="text-sm text-muted">
            Browser-based ontology visualization. Upload a ranked phenotype or
            drug list, configure propagation, render. Built on D3 + Canvas.
          </p>
          <HealthIndicator />
        </section>
      </main>
      <footer className="border-t border-line px-8 py-4 text-xs text-muted">
        Local dev scaffold — renderer, settings, and exports land in subsequent
        phases.
      </footer>
    </div>
  );
}
