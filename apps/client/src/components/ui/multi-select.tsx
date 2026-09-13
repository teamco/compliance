interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

export function MultiSelect({ options, selected, onChange, placeholder }: MultiSelectProps) {
  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  return (
    <div className="rounded-md border border-border bg-surface max-h-40 overflow-y-auto p-2 space-y-1">
      {options.length === 0 ? (
        <p className="text-xs text-muted-foreground px-1 py-1">{placeholder}</p>
      ) : (
        options.map((opt) => (
          <label
            key={opt.value}
            className="flex items-center gap-2 px-1 py-1 rounded text-sm cursor-pointer hover:bg-background"
          >
            <input
              type="checkbox"
              checked={selected.includes(opt.value)}
              onChange={() => toggle(opt.value)}
              className="accent-green-500"
            />
            <span className="text-foreground truncate">{opt.label}</span>
          </label>
        ))
      )}
    </div>
  );
}
