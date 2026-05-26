interface LandingPageProps {
  readonly onUpload: () => void;
  readonly onPickObo: () => void;
  readonly version?: string;
}

type Ontology = "atc" | "mesh";

interface ExampleEntry {
  readonly title: string;
  readonly description: string;
  readonly url: string;
  readonly ontology: Ontology;
}

// Single-color SVG — colored at runtime via CSS mask + theme-aware background-color
// so the pattern adapts to both light and dark canvases.
const NETWORK_PATTERN_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='900' height='900'%3E%3Cg stroke='%23000' stroke-width='1' fill='none'%3E%3Cline x1='83' y1='47' x2='230' y2='110'/%3E%3Cline x1='230' y1='110' x2='195' y2='270'/%3E%3Cline x1='590' y1='130' x2='540' y2='290'/%3E%3Cline x1='83' y1='47' x2='50' y2='210'/%3E%3Cline x1='50' y1='210' x2='195' y2='270'/%3E%3Cline x1='370' y1='200' x2='540' y2='290'/%3E%3Cline x1='760' y1='75' x2='710' y2='240'/%3E%3Cline x1='760' y1='75' x2='860' y2='190'/%3E%3Cline x1='50' y1='210' x2='120' y2='400'/%3E%3Cline x1='370' y1='200' x2='440' y2='390'/%3E%3Cline x1='710' y1='240' x2='780' y2='410'/%3E%3Cline x1='120' y1='400' x2='280' y2='430'/%3E%3Cline x1='440' y1='390' x2='470' y2='470'/%3E%3Cline x1='780' y1='410' x2='640' y2='500'/%3E%3Cline x1='830' y1='370' x2='780' y2='410'/%3E%3Cline x1='280' y1='430' x2='210' y2='610'/%3E%3Cline x1='640' y1='500' x2='590' y2='660'/%3E%3Cline x1='70' y1='570' x2='210' y2='610'/%3E%3Cline x1='380' y1='630' x2='590' y2='660'/%3E%3Cline x1='850' y1='580' x2='740' y2='620'/%3E%3Cline x1='210' y1='610' x2='310' y2='790'/%3E%3Cline x1='740' y1='620' x2='670' y2='810'/%3E%3Cline x1='310' y1='790' x2='500' y2='770'/%3E%3Cline x1='670' y1='810' x2='820' y2='770'/%3E%3C/g%3E%3Cg fill='%23000'%3E%3Ccircle cx='83' cy='47' r='4'/%3E%3Ccircle cx='230' cy='110' r='3'/%3E%3Ccircle cx='410' cy='58' r='4'/%3E%3Ccircle cx='590' cy='130' r='4'/%3E%3Ccircle cx='760' cy='75' r='4'/%3E%3Ccircle cx='50' cy='210' r='3'/%3E%3Ccircle cx='195' cy='270' r='4'/%3E%3Ccircle cx='370' cy='200' r='3'/%3E%3Ccircle cx='540' cy='290' r='4'/%3E%3Ccircle cx='710' cy='240' r='3'/%3E%3Ccircle cx='860' cy='190' r='3'/%3E%3Ccircle cx='120' cy='400' r='3'/%3E%3Ccircle cx='280' cy='430' r='4'/%3E%3Ccircle cx='440' cy='390' r='3'/%3E%3Ccircle cx='470' cy='470' r='3'/%3E%3Ccircle cx='640' cy='500' r='4'/%3E%3Ccircle cx='780' cy='410' r='3'/%3E%3Ccircle cx='830' cy='370' r='3'/%3E%3Ccircle cx='70' cy='570' r='4'/%3E%3Ccircle cx='210' cy='610' r='3'/%3E%3Ccircle cx='380' cy='630' r='3'/%3E%3Ccircle cx='590' cy='660' r='4'/%3E%3Ccircle cx='740' cy='620' r='3'/%3E%3Ccircle cx='850' cy='580' r='3'/%3E%3Ccircle cx='130' cy='760' r='3'/%3E%3Ccircle cx='310' cy='790' r='4'/%3E%3Ccircle cx='500' cy='770' r='3'/%3E%3Ccircle cx='670' cy='810' r='3'/%3E%3Ccircle cx='820' cy='770' r='4'/%3E%3C/g%3E%3C/svg%3E";

// Accent-only dots — layered on top for a hint of brand color.
const NETWORK_ACCENT_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='900' height='900'%3E%3Cg fill='%23000'%3E%3Ccircle cx='83' cy='47' r='4'/%3E%3Ccircle cx='590' cy='130' r='4'/%3E%3Ccircle cx='195' cy='270' r='4'/%3E%3Ccircle cx='540' cy='290' r='4'/%3E%3Ccircle cx='860' cy='190' r='3'/%3E%3Ccircle cx='440' cy='390' r='3'/%3E%3Ccircle cx='640' cy='500' r='4'/%3E%3Ccircle cx='210' cy='610' r='3'/%3E%3Ccircle cx='590' cy='660' r='4'/%3E%3Ccircle cx='310' cy='790' r='4'/%3E%3C/g%3E%3C/svg%3E";

const TEMPLATE_ATC_URL = "/templates/atc_template.tsv";
const TEMPLATE_MESH_URL = "/templates/mesh_template.tsv";

const EXAMPLES: ReadonlyArray<ExampleEntry> = [
  {
    title: "COVID Drugs (Experimental)",
    description: "DrugBank experimental COVID-19 drugs.",
    url: "/templates/atc_example_covid_drugs_experimental.tsv",
    ontology: "atc",
  },
  {
    title: "COVID Trials Summary",
    description: "Drugs tested in clinical trials.",
    url: "/templates/atc_example_covid_drugs_trial_summary.tsv",
    ontology: "atc",
  },
  {
    title: "PubMed MeSH Mapping",
    description: "Disease terms extracted from PubMed.",
    url: "/templates/mesh_example_pubmed_mapped.tsv",
    ontology: "mesh",
  },
];

const MESH_HUE = "rgb(120 160 210)";

export function LandingPage({ onUpload, onPickObo, version }: LandingPageProps) {
  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="relative flex min-h-full items-center justify-center px-4 py-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundColor: "rgb(var(--c-ink))",
            opacity: 0.09,
            WebkitMaskImage: `url("${NETWORK_PATTERN_SVG}")`,
            maskImage: `url("${NETWORK_PATTERN_SVG}")`,
            WebkitMaskRepeat: "repeat",
            maskRepeat: "repeat",
            WebkitMaskSize: "560px 560px",
            maskSize: "560px 560px",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundColor: "rgb(var(--c-accent))",
            opacity: 0.35,
            WebkitMaskImage: `url("${NETWORK_ACCENT_SVG}")`,
            maskImage: `url("${NETWORK_ACCENT_SVG}")`,
            WebkitMaskRepeat: "repeat",
            maskRepeat: "repeat",
            WebkitMaskSize: "560px 560px",
            maskSize: "560px 560px",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 50% at 30% 0%, rgb(var(--c-accent-soft) / 0.07), transparent 70%), radial-gradient(50% 40% at 80% 100%, rgb(var(--c-accent) / 0.05), transparent 70%)",
          }}
        />

        <div className="relative z-10 w-full max-w-2xl text-center">
          <div className="mb-10">
            <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-panel">
              <svg
                viewBox="0 0 24 24"
                width="22"
                height="22"
                aria-hidden
                className="text-ink"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <circle
                  cx="12"
                  cy="12"
                  r="7.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                  opacity="0.55"
                />
                <circle
                  cx="12"
                  cy="12"
                  r="11"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="0.75"
                  opacity="0.3"
                />
                <line
                  x1="12"
                  y1="1"
                  x2="12"
                  y2="23"
                  stroke="currentColor"
                  strokeWidth="0.5"
                  opacity="0.3"
                />
                <line
                  x1="1"
                  y1="12"
                  x2="23"
                  y2="12"
                  stroke="currentColor"
                  strokeWidth="0.5"
                  opacity="0.3"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">
              OntoloViz
            </h1>
            {version ? (
              <div className="mt-0.5 font-mono text-[11px] text-subtle">v{version}</div>
            ) : null}
            <p className="mx-auto mt-3 max-w-md text-sm text-muted">
              Interactive ontology sunburst — load a file, fetch an OBO release, or
              start from a template.
            </p>
          </div>

          <div className="mb-2">
            <button
              type="button"
              onClick={onUpload}
              className="group flex w-full flex-col items-center gap-1 rounded-lg border border-transparent bg-ink px-6 py-4 text-on-accent transition-colors hover:bg-ink/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              style={{
                color: "rgb(var(--c-canvas))",
              }}
            >
              <span className="text-[15px] font-semibold">Open Ontology File</span>
              <span className="text-[11px] opacity-70">
                TSV, TXT, or XLSX · parsed locally in the browser
              </span>
            </button>
          </div>

          <p className="mb-6 text-center text-[11px] text-subtle">
            Or start with{" "}
            <a
              href={TEMPLATE_ATC_URL}
              download
              className="font-mono text-[11.5px] text-accent underline decoration-accent/40 underline-offset-[3px] hover:decoration-accent"
            >
              atc_template.tsv
            </a>
            <span aria-hidden className="px-2 text-subtle">
              ·
            </span>
            <a
              href={TEMPLATE_MESH_URL}
              download
              className="font-mono text-[11.5px] text-accent underline decoration-accent/40 underline-offset-[3px] hover:decoration-accent"
            >
              mesh_template.tsv
            </a>
          </p>

          <div className="mb-6 text-left">
            <OboFoundryCard onClick={onPickObo} />
          </div>

          <div className="mb-10 grid grid-cols-1 gap-2 text-left sm:grid-cols-3">
            {EXAMPLES.map((ex) => (
              <ExampleCard
                key={ex.url}
                entry={ex}
                onClick={() => void loadExample(ex.url, onUpload)}
              />
            ))}
          </div>

          <footer className="flex flex-col items-center gap-2 border-t border-hairline pt-5 text-[11px] text-subtle">
            <p className="mx-auto max-w-md leading-relaxed">
              Files stay on your machine unless you fetch a remote ontology.
            </p>
            <p className="flex items-center gap-3">
              <a
                href="https://github.com/Delta4AI/OntoloViz"
                className="text-muted underline-offset-2 hover:text-ink hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                GitHub
              </a>
              <span aria-hidden="true" className="text-subtle">
                ·
              </span>
              <a
                href="https://delta4.ai/"
                className="text-muted underline-offset-2 hover:text-ink hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                Delta4
              </a>
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}

function OboFoundryCard({ onClick }: { readonly onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex w-full items-center gap-3 overflow-hidden rounded-md border border-border bg-panel py-3 pl-4 pr-3 transition-colors hover:border-accent hover:bg-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-accent" />
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-hairline bg-elevated text-ink"
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <path d="M4 12a8 8 0 0 1 14-5.3" strokeLinecap="round" />
          <path d="M20 12a8 8 0 0 1-14 5.3" strokeLinecap="round" />
          <path d="M18 3v4h-4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6 21v-4h4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start text-left">
        <span className="text-[13px] font-semibold text-ink">OBO Foundry</span>
        <span className="text-[11px] leading-snug text-muted">
          Pull HPO, GO, MONDO or any{" "}
          <code className="font-mono text-[10.5px]">.obo</code> URL.
        </span>
      </span>
      <span
        aria-hidden
        className="text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-ink"
      >
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <path
            d="M5 12h14M13 6l6 6-6 6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </button>
  );
}

function ExampleCard({
  entry,
  onClick,
}: {
  readonly entry: ExampleEntry;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex h-full flex-col items-start gap-2 rounded-md border border-border bg-panel p-3 text-left transition-colors hover:border-accent hover:bg-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <SunburstThumb ontology={entry.ontology} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[12px] font-semibold leading-tight text-ink">
          {entry.title}
        </span>
        <span className="text-[10.5px] leading-snug text-muted">
          {entry.description}
        </span>
      </span>
    </button>
  );
}

function SunburstThumb({ ontology }: { readonly ontology: Ontology }) {
  const color = ontology === "atc" ? "rgb(var(--c-accent))" : MESH_HUE;
  const label = ontology === "atc" ? "ATC" : "MeSH";
  return (
    <div className="flex w-full items-center justify-between">
      <svg viewBox="0 0 40 40" width="36" height="36" aria-hidden>
        <circle cx="20" cy="20" r="4" fill={color} opacity="0.95" />
        <circle
          cx="20"
          cy="20"
          r="8.5"
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          opacity="0.55"
        />
        <circle
          cx="20"
          cy="20"
          r="13.5"
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          opacity="0.35"
          strokeDasharray="3 2.2"
        />
        <circle
          cx="20"
          cy="20"
          r="18"
          fill="none"
          stroke={color}
          strokeWidth="1"
          opacity="0.2"
          strokeDasharray="2 3"
        />
      </svg>
      <span
        className="rounded-sm border border-hairline px-1.5 py-px font-mono text-[9px] uppercase tracking-wider"
        style={{ color }}
      >
        {label}
      </span>
    </div>
  );
}

async function loadExample(url: string, _onUpload: () => void): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const name = url.split("/").pop() || "example.tsv";
    const file = new File([blob], name, { type: "text/tab-separated-values" });
    window.dispatchEvent(new CustomEvent("ontoloviz:load-file", { detail: file }));
  } catch (err) {
    console.error("Failed to load example", err);
  }
}
