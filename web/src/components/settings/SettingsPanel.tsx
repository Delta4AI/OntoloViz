import type { ReactNode } from "react";

import { useAppStore } from "@/lib/store";
import type { ColorPropagationMode } from "@/lib/ontology/color";
import type { CountPropagationMode } from "@/lib/ontology/propagate";

import { ColorStopEditor } from "./ColorStopEditor";
import { RadioRow } from "./RadioRow";

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
 * Settings sidebar — drives the count and color propagation pipelines.
 *
 * The store is the single source of truth; this component is a thin shell of
 * controls that dispatch partial updates. The renderer re-derives its view
 * automatically because App.tsx subscribes to `raw + count + color` and
 * passes the freshly-propagated subtree to <Sunburst />.
 */
export function SettingsPanel() {
  const count = useAppStore((s) => s.count);
  const color = useAppStore((s) => s.color);
  const setCountSettings = useAppStore((s) => s.setCountSettings);
  const setColorSettings = useAppStore((s) => s.setColorSettings);

  return (
    <aside className="flex w-72 flex-shrink-0 flex-col gap-6 rounded-xl border border-line bg-black/20 p-5 text-sm">
      <Section title="Count propagation">
        <RadioRow
          name="count-mode"
          value={count.countMode}
          options={COUNT_MODES}
          onChange={(value) =>
            setCountSettings({ countMode: value as CountPropagationMode })
          }
        />
        <LevelSlider
          label="Threshold level"
          value={count.level}
          onChange={(level) => setCountSettings({ level })}
          disabled={count.countMode !== "level"}
        />
        <Toggle
          label="Enabled"
          checked={count.enabled}
          onChange={(enabled) => setCountSettings({ enabled })}
        />
      </Section>

      <Section title="Color propagation">
        <RadioRow
          name="color-mode"
          value={color.mode}
          options={COLOR_MODES}
          onChange={(value) =>
            setColorSettings({ mode: value as ColorPropagationMode })
          }
        />
        <LevelSlider
          label="Threshold level"
          value={color.level}
          onChange={(level) => setColorSettings({ level })}
          disabled={color.mode === "off" || color.mode === "phenotype"}
        />
        <Toggle
          label="Enabled"
          checked={color.enabled}
          onChange={(enabled) => setColorSettings({ enabled })}
        />
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-widest text-muted">
            Scale stops
          </div>
          <ColorStopEditor
            stops={color.colorScale}
            onChange={(stops) => setColorSettings({ colorScale: stops })}
          />
        </div>
        <ColorRow
          label="Default color"
          value={color.defaultColor}
          onChange={(defaultColor) => setColorSettings({ defaultColor })}
        />
      </Section>
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
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted">
        {title}
      </h3>
      {children}
    </section>
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
    <label className={`flex flex-col gap-1 ${disabled ? "opacity-40" : ""}`}>
      <span className="flex items-center justify-between text-xs text-muted">
        <span>{label}</span>
        <span className="font-mono text-white">{value}</span>
      </span>
      <input
        type="range"
        min={0}
        max={12}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        className="accent-white"
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
    <label className="flex cursor-pointer items-center justify-between gap-2 text-xs">
      <span className="text-muted">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
        className="h-4 w-4 accent-white"
      />
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
      <span className="text-muted">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.currentTarget.value.toUpperCase())}
        className="h-6 w-10 cursor-pointer rounded border border-line bg-transparent"
      />
    </label>
  );
}
