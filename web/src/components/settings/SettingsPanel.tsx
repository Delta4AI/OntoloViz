import type { ReactNode } from "react";

import { useAppStore } from "@/lib/store";
import type { ColorPropagationMode } from "@/lib/ontology/color";
import type { CountPropagationMode } from "@/lib/ontology/propagate";

import { ColorStopEditor } from "./ColorStopEditor";
import { RadioRow } from "./RadioRow";

interface SettingsPanelProps {
  readonly onClose: () => void;
}

const COUNT_MODES: readonly { value: CountPropagationMode; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "level", label: "Level" },
  { value: "all", label: "All" },
];

const COLOR_MODES: readonly { value: ColorPropagationMode; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "specific", label: "Specific" },
  { value: "global", label: "Global" },
  { value: "phenotype", label: "Phenotype" },
];

/**
 * Settings drawer — drives the count and color propagation pipelines.
 *
 * The store is the single source of truth; this component is a thin shell of
 * controls that dispatch partial updates. The renderer re-derives its view
 * automatically because App.tsx subscribes to `raw + count + color` and
 * passes the freshly-propagated subtree to <Sunburst />.
 */
export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const count = useAppStore((s) => s.count);
  const color = useAppStore((s) => s.color);
  const setCountSettings = useAppStore((s) => s.setCountSettings);
  const setColorSettings = useAppStore((s) => s.setColorSettings);

  return (
    <aside className="flex h-full flex-col text-sm">
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Settings</h2>
          <p className="text-[11px] text-muted">Live propagation controls</p>
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
        <Section title="Count propagation">
          <Toggle
            label="Enabled"
            checked={count.enabled}
            onChange={(enabled) => setCountSettings({ enabled })}
          />
          <Field label="Mode">
            <RadioRow
              name="count-mode"
              value={count.countMode}
              options={COUNT_MODES}
              onChange={(value) =>
                setCountSettings({ countMode: value as CountPropagationMode })
              }
            />
          </Field>
          <LevelSlider
            label="Threshold level"
            value={count.level}
            onChange={(level) => setCountSettings({ level })}
            disabled={count.countMode !== "level"}
          />
        </Section>

        <Divider />

        <Section title="Color propagation">
          <Toggle
            label="Enabled"
            checked={color.enabled}
            onChange={(enabled) => setColorSettings({ enabled })}
          />
          <Field label="Mode">
            <RadioRow
              name="color-mode"
              value={color.mode}
              options={COLOR_MODES}
              onChange={(value) =>
                setColorSettings({ mode: value as ColorPropagationMode })
              }
            />
          </Field>
          <LevelSlider
            label="Threshold level"
            value={color.level}
            onChange={(level) => setColorSettings({ level })}
            disabled={color.mode === "off" || color.mode === "phenotype"}
          />
          <Field label="Scale stops">
            <ColorStopEditor
              stops={color.colorScale}
              onChange={(stops) => setColorSettings({ colorScale: stops })}
            />
          </Field>
          <ColorRow
            label="Default color"
            value={color.defaultColor}
            onChange={(defaultColor) => setColorSettings({ defaultColor })}
          />
        </Section>
      </div>
    </aside>
  );
}

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-soft">
        {title}
      </h3>
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
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-widest text-muted">{label}</span>
      {children}
    </div>
  );
}

function LevelSlider({
  label,
  value,
  onChange,
  disabled,
}: {
  readonly label: string;
  readonly value: number;
  readonly onChange: (n: number) => void;
  readonly disabled?: boolean;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${disabled ? "opacity-40" : ""}`}>
      <span className="flex items-center justify-between text-[11px]">
        <span className="uppercase tracking-widest text-muted">{label}</span>
        <span className="font-mono text-ink">{value}</span>
      </span>
      <input
        type="range"
        min={0}
        max={12}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
      />
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (b: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2">
      <span className="text-xs text-ink">{label}</span>
      <span
        className={
          checked
            ? "relative inline-flex h-5 w-9 items-center rounded-full bg-accent transition"
            : "relative inline-flex h-5 w-9 items-center rounded-full bg-border transition"
        }
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.currentTarget.checked)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label={label}
        />
        <span
          className={
            checked
              ? "ml-4 inline-block h-4 w-4 rounded-full bg-canvas transition"
              : "ml-0.5 inline-block h-4 w-4 rounded-full bg-ink transition"
          }
        />
      </span>
    </label>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (s: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span className="uppercase tracking-widest text-muted">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.currentTarget.value.toUpperCase())}
          className="h-6 w-10"
        />
        <span className="font-mono text-[11px] text-muted">{value}</span>
      </span>
    </label>
  );
}
