import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface TagInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  label: string;
  placeholder?: string;
}

export function TagInput({ value, onChange, label, placeholder }: TagInputProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  function add(): boolean {
    const trimmed = input.trim();
    if (!trimmed) {
      setError(t('org.validation.emptyTag'));
      return false;
    }
    if (value.some((tag) => tag.toLowerCase() === trimmed.toLowerCase())) {
      setError(t('org.validation.duplicateTag'));
      return false;
    }
    onChange([...value, trimmed]);
    setInput('');
    setError(null);
    return true;
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          aria-label={label}
          aria-invalid={!!error}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
          }}
          onBlur={() => {
            if (input.trim()) add();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="flex-1"
        />
        <Button type="button" variant="outline" onClick={add} disabled={!input.trim()}>
          +
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 text-xs bg-muted border border-border text-foreground px-2 py-0.5 rounded-full"
            >
              {tag}
              <button
                type="button"
                onClick={() => onChange(value.filter((t) => t !== tag))}
                className="text-muted-foreground hover:text-foreground leading-none cursor-pointer"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
