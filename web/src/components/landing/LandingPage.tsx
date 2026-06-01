import { withBase } from "../../lib/basePath";

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

// Single centered sunburst — 6 concentric rings with 6/12/18/24/30 radial
// subdivisions, mirroring how a real sunburst plot fans out from a root.
// Strokes 0.8 so lines stay quiet at scale. Colored at runtime via CSS mask.
const SUNBURST_PATTERN_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='900' height='900'%3E%3Cg stroke='%23000' stroke-width='0.8' fill='none'%3E%3Ccircle cx='450' cy='450' r='70'/%3E%3Ccircle cx='450' cy='450' r='140'/%3E%3Ccircle cx='450' cy='450' r='210'/%3E%3Ccircle cx='450' cy='450' r='280'/%3E%3Ccircle cx='450' cy='450' r='350'/%3E%3Ccircle cx='450' cy='450' r='420'/%3E%3Cline x1='520' y1='450' x2='590' y2='450'/%3E%3Cline x1='485' y1='511' x2='520' y2='571'/%3E%3Cline x1='415' y1='511' x2='380' y2='571'/%3E%3Cline x1='380' y1='450' x2='310' y2='450'/%3E%3Cline x1='415' y1='389' x2='380' y2='329'/%3E%3Cline x1='485' y1='389' x2='520' y2='329'/%3E%3Cline x1='590' y1='450' x2='660' y2='450'/%3E%3Cline x1='571' y1='520' x2='632' y2='555'/%3E%3Cline x1='520' y1='571' x2='555' y2='632'/%3E%3Cline x1='450' y1='590' x2='450' y2='660'/%3E%3Cline x1='380' y1='571' x2='345' y2='632'/%3E%3Cline x1='329' y1='520' x2='268' y2='555'/%3E%3Cline x1='310' y1='450' x2='240' y2='450'/%3E%3Cline x1='329' y1='380' x2='268' y2='345'/%3E%3Cline x1='380' y1='329' x2='345' y2='268'/%3E%3Cline x1='450' y1='310' x2='450' y2='240'/%3E%3Cline x1='520' y1='329' x2='555' y2='268'/%3E%3Cline x1='571' y1='380' x2='632' y2='345'/%3E%3Cline x1='660' y1='450' x2='730' y2='450'/%3E%3Cline x1='647' y1='522' x2='713' y2='546'/%3E%3Cline x1='611' y1='585' x2='664' y2='630'/%3E%3Cline x1='555' y1='632' x2='590' y2='692'/%3E%3Cline x1='487' y1='657' x2='499' y2='726'/%3E%3Cline x1='413' y1='657' x2='401' y2='726'/%3E%3Cline x1='345' y1='632' x2='310' y2='692'/%3E%3Cline x1='289' y1='585' x2='236' y2='630'/%3E%3Cline x1='253' y1='522' x2='187' y2='546'/%3E%3Cline x1='240' y1='450' x2='170' y2='450'/%3E%3Cline x1='253' y1='378' x2='187' y2='354'/%3E%3Cline x1='289' y1='315' x2='236' y2='270'/%3E%3Cline x1='345' y1='268' x2='310' y2='208'/%3E%3Cline x1='413' y1='243' x2='401' y2='174'/%3E%3Cline x1='487' y1='243' x2='499' y2='174'/%3E%3Cline x1='555' y1='268' x2='590' y2='208'/%3E%3Cline x1='611' y1='315' x2='664' y2='270'/%3E%3Cline x1='647' y1='378' x2='713' y2='354'/%3E%3Cline x1='730' y1='450' x2='800' y2='450'/%3E%3Cline x1='720' y1='522' x2='788' y2='541'/%3E%3Cline x1='692' y1='590' x2='753' y2='625'/%3E%3Cline x1='648' y1='648' x2='697' y2='697'/%3E%3Cline x1='590' y1='692' x2='625' y2='753'/%3E%3Cline x1='522' y1='720' x2='541' y2='788'/%3E%3Cline x1='450' y1='730' x2='450' y2='800'/%3E%3Cline x1='378' y1='720' x2='359' y2='788'/%3E%3Cline x1='310' y1='692' x2='275' y2='753'/%3E%3Cline x1='252' y1='648' x2='203' y2='697'/%3E%3Cline x1='208' y1='590' x2='147' y2='625'/%3E%3Cline x1='180' y1='522' x2='112' y2='541'/%3E%3Cline x1='170' y1='450' x2='100' y2='450'/%3E%3Cline x1='180' y1='378' x2='112' y2='359'/%3E%3Cline x1='208' y1='310' x2='147' y2='275'/%3E%3Cline x1='252' y1='252' x2='203' y2='203'/%3E%3Cline x1='310' y1='208' x2='275' y2='147'/%3E%3Cline x1='378' y1='180' x2='359' y2='112'/%3E%3Cline x1='450' y1='170' x2='450' y2='100'/%3E%3Cline x1='522' y1='180' x2='541' y2='112'/%3E%3Cline x1='590' y1='208' x2='625' y2='147'/%3E%3Cline x1='648' y1='252' x2='697' y2='203'/%3E%3Cline x1='692' y1='310' x2='753' y2='275'/%3E%3Cline x1='720' y1='378' x2='788' y2='359'/%3E%3Cline x1='800' y1='450' x2='870' y2='450'/%3E%3Cline x1='792' y1='523' x2='861' y2='537'/%3E%3Cline x1='770' y1='592' x2='834' y2='621'/%3E%3Cline x1='733' y1='656' x2='790' y2='697'/%3E%3Cline x1='684' y1='710' x2='731' y2='762'/%3E%3Cline x1='625' y1='753' x2='660' y2='814'/%3E%3Cline x1='558' y1='783' x2='580' y2='849'/%3E%3Cline x1='487' y1='798' x2='494' y2='868'/%3E%3Cline x1='413' y1='798' x2='406' y2='868'/%3E%3Cline x1='342' y1='783' x2='320' y2='849'/%3E%3Cline x1='275' y1='753' x2='240' y2='814'/%3E%3Cline x1='216' y1='710' x2='169' y2='762'/%3E%3Cline x1='167' y1='656' x2='110' y2='697'/%3E%3Cline x1='130' y1='592' x2='66' y2='621'/%3E%3Cline x1='108' y1='523' x2='39' y2='537'/%3E%3Cline x1='100' y1='450' x2='30' y2='450'/%3E%3Cline x1='108' y1='377' x2='39' y2='363'/%3E%3Cline x1='130' y1='308' x2='66' y2='279'/%3E%3Cline x1='167' y1='244' x2='110' y2='203'/%3E%3Cline x1='216' y1='190' x2='169' y2='138'/%3E%3Cline x1='275' y1='147' x2='240' y2='86'/%3E%3Cline x1='342' y1='117' x2='320' y2='51'/%3E%3Cline x1='413' y1='102' x2='406' y2='32'/%3E%3Cline x1='487' y1='102' x2='494' y2='32'/%3E%3Cline x1='558' y1='117' x2='580' y2='51'/%3E%3Cline x1='625' y1='147' x2='660' y2='86'/%3E%3Cline x1='684' y1='190' x2='731' y2='138'/%3E%3Cline x1='733' y1='244' x2='790' y2='203'/%3E%3Cline x1='770' y1='308' x2='834' y2='279'/%3E%3Cline x1='792' y1='377' x2='861' y2='363'/%3E%3C/g%3E%3Ccircle cx='450' cy='450' r='3' fill='%23000'/%3E%3C/svg%3E";

// Accent dots — sparse brand-color highlights scattered across the rings.
const SUNBURST_ACCENT_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='900' height='900'%3E%3Cg fill='%23000'%3E%3Ccircle cx='450' cy='520' r='3'/%3E%3Ccircle cx='389' cy='415' r='3'/%3E%3Ccircle cx='520' cy='571' r='3'/%3E%3Ccircle cx='380' cy='329' r='3'/%3E%3Ccircle cx='632' cy='555' r='3'/%3E%3Ccircle cx='268' cy='555' r='3'/%3E%3Ccircle cx='450' cy='240' r='3'/%3E%3Ccircle cx='713' cy='546' r='3'/%3E%3Ccircle cx='401' cy='726' r='3'/%3E%3Ccircle cx='187' cy='354' r='3'/%3E%3Ccircle cx='664' cy='270' r='3'/%3E%3Ccircle cx='697' cy='697' r='3'/%3E%3Ccircle cx='541' cy='788' r='3'/%3E%3Ccircle cx='112' cy='541' r='3'/%3E%3Ccircle cx='203' cy='203' r='3'/%3E%3Ccircle cx='541' cy='112' r='3'/%3E%3Ccircle cx='834' cy='621' r='3'/%3E%3Ccircle cx='320' cy='849' r='3'/%3E%3Ccircle cx='39' cy='363' r='3'/%3E%3Ccircle cx='406' cy='32' r='3'/%3E%3Ccircle cx='790' cy='203' r='3'/%3E%3C/g%3E%3C/svg%3E";

const SUNBURST_SIZE = "min(900px, 90vmin)";

export function LandingPage({ onUpload, onPickObo, version }: LandingPageProps) {
  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="relative flex min-h-full items-center justify-center px-4 py-12">
        {/* Single oversized sunburst — rings + radial dividers in ink. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundColor: "rgb(var(--c-ink))",
            opacity: 0.05,
            WebkitMaskImage: `url("${SUNBURST_PATTERN_SVG}")`,
            maskImage: `url("${SUNBURST_PATTERN_SVG}")`,
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
            WebkitMaskPosition: "center",
            maskPosition: "center",
            WebkitMaskSize: `${SUNBURST_SIZE} ${SUNBURST_SIZE}`,
            maskSize: `${SUNBURST_SIZE} ${SUNBURST_SIZE}`,
          }}
        />
        {/* Accent highlights on the rings. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundColor: "rgb(var(--c-accent))",
            opacity: 0.18,
            WebkitMaskImage: `url("${SUNBURST_ACCENT_SVG}")`,
            maskImage: `url("${SUNBURST_ACCENT_SVG}")`,
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
            WebkitMaskPosition: "center",
            maskPosition: "center",
            WebkitMaskSize: `${SUNBURST_SIZE} ${SUNBURST_SIZE}`,
            maskSize: `${SUNBURST_SIZE} ${SUNBURST_SIZE}`,
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
              <img
                src={withBase("/logo.svg")}
                width="32"
                height="32"
                alt=""
                aria-hidden
              />
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
    const res = await fetch(withBase(url));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const name = url.split("/").pop() || "example.tsv";
    const file = new File([blob], name, { type: "text/tab-separated-values" });
    window.dispatchEvent(new CustomEvent("ontoloviz:load-file", { detail: file }));
  } catch (err) {
    console.error("Failed to load example", err);
  }
}
