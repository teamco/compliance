import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
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
        <Button
          type="button"
          variant="outline"
          onClick={add}
          disabled={!input.trim()}
          aria-label={`Add ${label}`}
        >
          <Plus size={14} aria-hidden="true" />
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <span
              key={tag}
              className="inline-flex min-h-6 items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs leading-none text-foreground"
            >
              {tag}
              <button
                type="button"
                onClick={() => onChange(value.filter((t) => t !== tag))}
                aria-label={`Remove ${tag}`}
                className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:bg-muted-foreground/15 hover:text-foreground transition-colors cursor-pointer"
              >
                <X size={10} aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
