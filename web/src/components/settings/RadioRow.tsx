interface Option<T extends string> {
  readonly value: T;
  readonly label: string;
}

interface RadioRowProps<T extends string> {
  readonly name: string;
  readonly value: T;
  readonly options: readonly Option<T>[];
  readonly onChange: (value: T) => void;
}

/**
 * Segmented radio control — visually a row of pill-shaped buttons that share
 * one selection. Used for count/color mode pickers.
 */
export function RadioRow<T extends string>({
  name,
  value,
  options,
  onChange,
}: RadioRowProps<T>) {
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-1">
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            className={
              selected
                ? "rounded bg-white text-black px-2 py-1 text-[11px] font-medium"
                : "rounded bg-white/5 text-white/70 px-2 py-1 text-[11px] hover:bg-white/10"
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
