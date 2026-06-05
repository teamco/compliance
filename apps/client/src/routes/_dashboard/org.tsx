import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, Save } from 'lucide-react';
import { useNotify } from '@icore/template-shared';
import {
  useOrganization,
  useUpsertOrganization,
  type OrganizationInput,
  type OrgSize,
} from '@/queries/notes';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const INDUSTRIES = [
  'technology',
  'finance',
  'healthcare',
  'retail',
  'manufacturing',
  'education',
  'government',
  'other',
] as const;

const SIZES: OrgSize[] = ['startup', 'smb', 'enterprise'];

function TagInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');

  function add() {
    const trimmed = input.trim();
    if (trimmed && !value.includes(trimmed)) onChange([...value, trimmed]);
    setInput('');
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
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

function OrgPage() {
  const { t } = useTranslation();
  const notify = useNotify();
  const { data: org, isPending } = useOrganization();
  const upsert = useUpsertOrganization();

  const [form, setForm] = useState<OrganizationInput>({
    name: '',
    industry: 'technology',
    size: 'startup',
    regions: [],
    techStack: [],
    regulations: [],
  });

  useEffect(() => {
    if (org) {
      setForm({
        name: org.name,
        industry: org.industry,
        size: org.size,
        regions: org.regions,
        techStack: org.techStack,
        regulations: org.regulations,
      });
    }
  }, [org]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await upsert.mutateAsync(form);
      notify.success(t('org.saved'));
    } catch {
      notify.error(t('error.unknown'));
    }
  }

  if (isPending) {
    return (
      <div className="p-6 space-y-6 max-w-2xl">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 bg-surface border border-border rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-green-500/10 border border-green-500/20">
          <Building2 size={18} className="text-green-500" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">{t('org.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('org.subtitle')}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Name */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {t('org.name')}
          </label>
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder={t('org.namePlaceholder')}
            required
          />
        </div>

        {/* Industry */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {t('org.industry')}
          </label>
          <select
            value={form.industry}
            onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
            className="flex h-10 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {INDUSTRIES.map((ind) => (
              <option key={ind} value={ind} className="bg-surface text-foreground">
                {t(`org.industries.${ind}`)}
              </option>
            ))}
          </select>
        </div>

        {/* Size */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {t('org.size')}
          </label>
          <div className="flex gap-2 flex-wrap">
            {SIZES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setForm((f) => ({ ...f, size: s }))}
                className={[
                  'px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer',
                  form.size === s
                    ? 'bg-green-500/10 text-green-500 border border-green-500/20'
                    : 'bg-surface border border-border text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                {t(`org.sizes.${s}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Regions */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {t('org.regions')}
          </label>
          <TagInput
            value={form.regions}
            onChange={(regions) => setForm((f) => ({ ...f, regions }))}
            placeholder={t('org.regionsPlaceholder')}
          />
        </div>

        {/* Tech Stack */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {t('org.techStack')}
          </label>
          <TagInput
            value={form.techStack}
            onChange={(techStack) => setForm((f) => ({ ...f, techStack }))}
            placeholder={t('org.techStackPlaceholder')}
          />
        </div>

        {/* Regulations */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {t('org.regulations')}
          </label>
          <TagInput
            value={form.regulations}
            onChange={(regulations) => setForm((f) => ({ ...f, regulations }))}
            placeholder={t('org.regulationsPlaceholder')}
          />
        </div>

        <div className="pt-2">
          <Button type="submit" disabled={upsert.isPending || !form.name.trim()}>
            <Save size={14} className="mr-2" />
            {upsert.isPending ? t('org.saving') : t('org.save')}
          </Button>
        </div>
      </form>
    </div>
  );
}

export const Route = createFileRoute('/_dashboard/org')({
  component: OrgPage,
});
