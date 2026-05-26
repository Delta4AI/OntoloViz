import type { ReactNode } from "react";

interface LandingPageProps {
  readonly onUpload: () => void;
  readonly onPickObo: () => void;
  readonly version?: string;
}

const NETWORK_PATTERN_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='900' height='900'%3E%3Cg stroke='%23403C53' stroke-width='1' fill='none'%3E%3Cline x1='83' y1='47' x2='230' y2='110'/%3E%3Cline x1='230' y1='110' x2='195' y2='270'/%3E%3Cline x1='590' y1='130' x2='540' y2='290'/%3E%3Cline x1='83' y1='47' x2='50' y2='210'/%3E%3Cline x1='50' y1='210' x2='195' y2='270'/%3E%3Cline x1='370' y1='200' x2='540' y2='290'/%3E%3Cline x1='760' y1='75' x2='710' y2='240'/%3E%3Cline x1='760' y1='75' x2='860' y2='190'/%3E%3Cline x1='50' y1='210' x2='120' y2='400'/%3E%3Cline x1='370' y1='200' x2='440' y2='390'/%3E%3Cline x1='710' y1='240' x2='780' y2='410'/%3E%3Cline x1='120' y1='400' x2='280' y2='430'/%3E%3Cline x1='440' y1='390' x2='470' y2='470'/%3E%3Cline x1='780' y1='410' x2='640' y2='500'/%3E%3Cline x1='830' y1='370' x2='780' y2='410'/%3E%3Cline x1='280' y1='430' x2='210' y2='610'/%3E%3Cline x1='640' y1='500' x2='590' y2='660'/%3E%3Cline x1='70' y1='570' x2='210' y2='610'/%3E%3Cline x1='380' y1='630' x2='590' y2='660'/%3E%3Cline x1='850' y1='580' x2='740' y2='620'/%3E%3Cline x1='210' y1='610' x2='310' y2='790'/%3E%3Cline x1='740' y1='620' x2='670' y2='810'/%3E%3Cline x1='310' y1='790' x2='500' y2='770'/%3E%3Cline x1='670' y1='810' x2='820' y2='770'/%3E%3C/g%3E%3Cg fill='%23C33D35'%3E%3Ccircle cx='83' cy='47' r='4'/%3E%3Ccircle cx='590' cy='130' r='4'/%3E%3Ccircle cx='195' cy='270' r='4'/%3E%3Ccircle cx='540' cy='290' r='4'/%3E%3Ccircle cx='860' cy='190' r='3'/%3E%3Ccircle cx='120' cy='400' r='3'/%3E%3Ccircle cx='440' cy='390' r='3'/%3E%3Ccircle cx='640' cy='500' r='4'/%3E%3Ccircle cx='830' cy='370' r='3'/%3E%3Ccircle cx='210' cy='610' r='3'/%3E%3Ccircle cx='590' cy='660' r='4'/%3E%3Ccircle cx='850' cy='580' r='3'/%3E%3Ccircle cx='310' cy='790' r='4'/%3E%3Ccircle cx='670' cy='810' r='3'/%3E%3C/g%3E%3Cg fill='%23403C53'%3E%3Ccircle cx='230' cy='110' r='3'/%3E%3Ccircle cx='410' cy='58' r='4'/%3E%3Ccircle cx='760' cy='75' r='4'/%3E%3Ccircle cx='50' cy='210' r='3'/%3E%3Ccircle cx='370' cy='200' r='3'/%3E%3Ccircle cx='710' cy='240' r='3'/%3E%3Ccircle cx='280' cy='430' r='4'/%3E%3Ccircle cx='470' cy='470' r='3'/%3E%3Ccircle cx='780' cy='410' r='3'/%3E%3Ccircle cx='70' cy='570' r='4'/%3E%3Ccircle cx='380' cy='630' r='3'/%3E%3Ccircle cx='740' cy='620' r='3'/%3E%3Ccircle cx='130' cy='760' r='3'/%3E%3Ccircle cx='500' cy='770' r='3'/%3E%3Ccircle cx='820' cy='770' r='4'/%3E%3C/g%3E%3C/svg%3E";

/**
 * Plain, professional landing page. Three load options — local file, OBO
 * Foundry fetch, bundled examples — plus a template download. No marketing
 * copy beyond the one-line subtitle.
 */
const EXAMPLES: ReadonlyArray<{
  readonly title: string;
  readonly description: string;
  readonly url: string;
}> = [
  {
    title: "COVID Drugs (Experimental)",
    description: "ATC tree, DrugBank experimental COVID-19 drugs.",
    url: "/templates/atc_example_covid_drugs_experimental.tsv",
  },
  {
    title: "COVID Trials Summary",
    description: "ATC tree, drugs tested in clinical trials.",
    url: "/templates/atc_example_covid_drugs_trial_summary.tsv",
  },
  {
    title: "PubMed MeSH Mapping",
    description: "MeSH tree, disease terms extracted from PubMed.",
    url: "/templates/mesh_example_pubmed_mapped.tsv",
  },
];

export function LandingPage({ onUpload, onPickObo, version }: LandingPageProps) {
  return (
    <div className="relative flex h-full min-h-full items-center justify-center overflow-y-auto px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage: `url("${NETWORK_PATTERN_SVG}")`,
          backgroundRepeat: "repeat",
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
            Interactive ontology sunburst — load a file, fetch an OBO release, or start
            from a template.
          </p>
        </div>

        <div className="mb-3">
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

        <div className="mb-10 grid grid-cols-2 gap-2 sm:grid-cols-2">
          <SecondaryCard
            title="OBO Foundry"
            description="Fetch HPO, GO, MONDO or any .obo URL."
            onClick={onPickObo}
          />
          <SecondaryCard
            title="ATC Template"
            description="Pre-filled TSV with the ATC drug hierarchy."
            href="/templates/atc_template.tsv"
          />
          <SecondaryCard
            title="MeSH Template"
            description="Pre-filled TSV with the MeSH subject hierarchy."
            href="/templates/mesh_template.tsv"
          />
          {EXAMPLES.map((ex) => (
            <SecondaryCard
              key={ex.url}
              title={ex.title}
              description={ex.description}
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
            <span aria-hidden="true" className="text-hairline">
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
  );
}

interface SecondaryCardProps {
  readonly title: string;
  readonly description: string;
  readonly onClick?: () => void;
  readonly href?: string;
  readonly open?: boolean;
  readonly menu?: ReactNode;
}

function SecondaryCard({
  title,
  description,
  onClick,
  href,
  open,
  menu,
}: SecondaryCardProps) {
  const className =
    "flex h-full flex-col items-start gap-1 rounded-md border border-border bg-panel px-3 py-2.5 text-left transition-colors hover:border-accent hover:bg-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";

  const body = (
    <>
      <span className="text-[12px] font-semibold text-ink">{title}</span>
      <span className="text-[11px] leading-snug text-muted">{description}</span>
    </>
  );

  if (href) {
    return (
      <a className={className} href={href} download>
        {body}
      </a>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        aria-expanded={open}
        className={className + " w-full"}
      >
        {body}
      </button>
      {open ? menu : null}
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
