import { useMemo, useState, type ReactNode } from "react";

import { useAppStore } from "@/lib/store";
import type { ColorPropagationMode } from "@/lib/ontology/color";
import type { CountPropagationMode } from "@/lib/ontology/propagate";

import { ColorStopEditor } from "./ColorStopEditor";

interface SettingsPanelProps {
  readonly onClose: () => void;
}

/**
 * Settings drawer — plain-language controls over the count and color
 * pipelines.
 *
 * The store keys are unchanged from the ported tkinter model
 * (`count.{enabled,countMode,level}`, `color.{enabled,mode,level,…}`); this
 * component only reshapes how those keys are presented. The two old "Enabled"
 * toggles are folded into their mode pickers — "off" means no propagation —
 * and the fixed 0–12 level slider is now bounded to the loaded ontology's
 * real depth. App.tsx re-derives the view whenever these settings change.
 */
export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const raw = useAppStore((s) => s.raw);
  const count = useAppStore((s) => s.count);
  const color = useAppStore((s) => s.color);
  const setCountSettings = useAppStore((s) => s.setCountSettings);
  const setColorSettings = useAppStore((s) => s.setColorSettings);

  // Deepest level in the loaded data — bounds the depth sliders so they never
  // offer depths the ontology doesn't have.
  const maxDepth = useMemo(() => {
    if (!raw) return 0;
    let m = 0;
    for (const subtree of raw.subtrees.values()) {
      for (const node of subtree.nodes.values()) {
        if (node.level > m) m = node.level;
      }
    }
    return m;
  }, [raw]);

  // "Outermost nodes only" relies on dot-path levels — a MeSH (separator-based)
  // trait. ATC has no such paths, so the option is hidden there to avoid a
  // control that silently does nothing.
  const supportsOutermost = raw?.format === "separator-based";

  // Fold the legacy `enabled` flag into the mode: "off" === not propagating.
  const countChoice: CountPropagationMode =
    count.enabled && count.countMode !== "off" ? count.countMode : "off";
  const colorChoice: ColorPropagationMode =
    color.enabled && color.mode !== "off" ? color.mode : "off";

  const onCountChoice = (choice: CountPropagationMode) =>
    setCountSettings(
      choice === "off"
        ? { enabled: false, countMode: "off" }
        : { enabled: true, countMode: choice },
    );

  const onColorChoice = (choice: ColorPropagationMode) =>
    setColorSettings(
      choice === "off"
        ? { enabled: false, mode: "off" }
        : { enabled: true, mode: choice },
    );

  const countChoices: readonly Choice<CountPropagationMode>[] = [
    {
      value: "off",
      label: "Keep each node's own value",
      hint: "Every node shows only the count loaded from your file.",
    },
    {
      value: "all",
      label: "Roll children into parents",
      hint: "Each parent's value becomes the sum of everything nested beneath it.",
    },
    {
      value: "level",
      label: "Roll up to a chosen depth",
      hint: "Deeper rings pile up at the depth you pick; shallower rings keep their own value.",
      expand: (
        <DepthField
          label="Roll up to depth"
          value={count.level}
          max={maxDepth}
          onChange={(level) => setCountSettings({ level })}
          explain={rollUpExplanation}
        />
      ),
    },
  ];

  const colorChoices: readonly Choice<ColorPropagationMode>[] = [
    {
      value: "specific",
      label: "By count — per subtree",
      hint: "Each subtree's colors scale to its own busiest node.",
      expand: (
        <DepthField
          label="Color from depth"
          value={color.level}
          max={maxDepth}
          onChange={(level) => setColorSettings({ level })}
          explain={colorDepthExplanation}
        />
      ),
    },
    {
      value: "global",
      label: "By count — across the whole file",
      hint: "One shared scale from the global maximum, so colors compare across subtrees.",
      expand: (
        <DepthField
          label="Color from depth"
          value={color.level}
          max={maxDepth}
          onChange={(level) => setColorSettings({ level })}
          explain={colorDepthExplanation}
        />
      ),
    },
    ...(supportsOutermost
      ? [
          {
            value: "phenotype" as const,
            label: "Outermost nodes only",
            hint: "Color just the deepest node in each branch; ancestors stay neutral.",
          },
        ]
      : []),
    {
      value: "off",
      label: "Use the colors from your file",
      hint: "Keep the Color column as imported and ignore counts.",
    },
  ];

  return (
    <aside className="flex h-full flex-col text-sm">
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Display settings</h2>
          <p className="text-[11px] text-muted">How the sunburst reads your data</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close settings"
          className="rounded-md border border-border bg-elevated px-2 py-1 text-xs text-muted hover:bg-border hover:text-ink"
        >
          ✕
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <Section
          title="Counts"
          hint="Choose how a node's value relates to everything nested inside it."
        >
          <OptionList
            name="How counts add up"
            value={countChoice}
            choices={countChoices}
            onChange={onCountChoice}
          />
        </Section>

        <Divider />

        <Section
          title="Color"
          hint="Choose what the fill color of each slice represents."
        >
          <OptionList
            name="How slices are colored"
            value={colorChoice}
            choices={colorChoices}
            onChange={onColorChoice}
          />

          {colorChoice !== "off" ? (
            <Field label="Color scale">
              <ColorStopEditor
                stops={color.colorScale}
                onChange={(stops) => setColorSettings({ colorScale: stops })}
              />
            </Field>
          ) : null}

          <ColorRow
            label="Neutral color"
            hint={
              colorChoice === "off"
                ? "Fills nodes with no color in your file."
                : "Fills nodes below the depth and zero-count nodes."
            }
            value={color.defaultColor}
            onChange={(defaultColor) => setColorSettings({ defaultColor })}
          />
        </Section>
      </div>
    </aside>
  );
}

/** One selectable card in an OptionList. */
interface Choice<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly hint: string;
  /** Extra control revealed below the label while this choice is selected. */
  readonly expand?: ReactNode;
}

/**
 * Vertical radio-card list. Each card carries a one-line explanation so the
 * choice's effect is legible without prior knowledge, and can reveal an inline
 * control (e.g. a depth slider) when selected.
 */
function OptionList<T extends string>({
  name,
  value,
  choices,
  onChange,
}: {
  readonly name: string;
  readonly value: T;
  readonly choices: readonly Choice<T>[];
  readonly onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-col gap-1.5">
      {choices.map((choice) => {
        const selected = choice.value === value;
        return (
          <div
            key={choice.value}
            className={
              selected
                ? "rounded-lg border border-accent/60 bg-accent/[0.06]"
                : "rounded-lg border border-border bg-canvas"
            }
          >
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(choice.value)}
              className="flex w-full items-start gap-2.5 px-3 py-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span
                aria-hidden
                className={
                  selected
                    ? "mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border-2 border-accent"
                    : "mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-border"
                }
              >
                {selected ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                ) : null}
              </span>
              <span className="flex flex-col gap-0.5">
                <span
                  className={
                    selected ? "text-xs font-medium text-ink" : "text-xs text-ink"
                  }
                >
                  {choice.label}
                </span>
                <span className="text-[11px] leading-snug text-muted">
                  {choice.hint}
                </span>
              </span>
            </button>
            {selected && choice.expand ? (
              <div className="border-t border-border/60 px-3 py-2.5">
                {choice.expand}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  readonly title: string;
  readonly hint: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-soft">
          {title}
        </h3>
        <p className="text-[11px] leading-snug text-muted">{hint}</p>
      </div>
      {children}
    </section>
  );
}

function Divider() {
  return <div className="my-6 h-px bg-border" aria-hidden />;
}

function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="mt-3 flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-widest text-muted">{label}</span>
      {children}
    </div>
  );
}

/**
 * Plain-language description of what "roll up to depth `v`" does on a tree of
 * depth `max`, naming the actual levels so the rule isn't left to inference.
 */
function rollUpExplanation(v: number, max: number): string {
  if (v <= 0)
    return `Everything rolls inward: levels 1–${max} pile up at the center (level 0).`;
  if (v >= max) return `Level ${max} is the outermost level, so nothing rolls up.`;
  return `Levels ${v + 1}–${max} pile up at level ${v}. Levels 0–${v - 1} keep their imported values.`;
}

/** Mirror description for color: depth-and-deeper get colored by count. */
function colorDepthExplanation(v: number, max: number): string {
  if (v <= 0) return `Every level is colored by its count.`;
  return `Levels ${v}–${max} are colored by count. Levels 0–${v - 1} use the neutral color.`;
}

/**
 * Depth slider bounded to the loaded ontology's real depth, with an
 * "n / max" readout and an optional live explanation that updates as the
 * thumb moves. Drags stage locally so the (expensive) propagation only
 * re-runs on release.
 */
function DepthField({
  label,
  value,
  max,
  onChange,
  explain,
}: {
  readonly label: string;
  readonly value: number;
  readonly max: number;
  readonly onChange: (n: number) => void;
  readonly explain?: (value: number, max: number) => string;
}) {
  const [draft, setDraft] = useState<number | null>(null);

  if (max <= 0) {
    return (
      <p className="text-[11px] leading-snug text-muted">
        This ontology has a single level, so depth has no effect.
      </p>
    );
  }

  const display = draft ?? Math.min(value, max);
  const commit = () => {
    if (draft === null) return;
    const v = draft;
    setDraft(null);
    if (v !== value) onChange(v);
  };

  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center justify-between text-[11px]">
        <span className="text-muted">{label}</span>
        <span className="font-mono text-ink">
          {display}
          <span className="text-subtle"> / {max}</span>
        </span>
      </span>
      <input
        type="range"
        min={0}
        max={max}
        step={1}
        value={display}
        onChange={(e) => setDraft(Number(e.currentTarget.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
      {explain ? (
        <span className="text-[11px] leading-snug text-subtle">
          {explain(display, max)}
        </span>
      ) : null}
    </label>
  );
}

function ColorRow({
  label,
  hint,
  value,
  onChange,
}: {
  readonly label: string;
  readonly hint: string;
  readonly value: string;
  readonly onChange: (s: string) => void;
}) {
  return (
    <div className="mt-3 flex items-center justify-between gap-3">
      <span className="flex flex-col gap-0.5">
        <span className="text-[11px] uppercase tracking-widest text-muted">
          {label}
        </span>
        <span className="text-[11px] leading-snug text-subtle">{hint}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.currentTarget.value.toUpperCase())}
          className="h-6 w-10"
          aria-label={label}
        />
        <span className="font-mono text-[11px] text-muted">{value}</span>
      </span>
    </div>
  );
}
