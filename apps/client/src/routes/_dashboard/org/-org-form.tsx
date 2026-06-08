import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Save } from 'lucide-react';
import type { OrganizationInput } from '@/queries/notes';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { INDUSTRIES, SIZES } from './-constants';
import { TagInput } from './-tag-input';

interface OrgFormProps {
  initial: OrganizationInput;
  onSave: (data: OrganizationInput) => void;
  isPending: boolean;
  submitLabel: string;
}

export function OrgForm({ initial, onSave, isPending, submitLabel }: OrgFormProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<OrganizationInput>(initial);
  const [errors, setErrors] = useState<{ name?: string }>({});

  useEffect(() => {
    setForm(initial);
    setErrors({});
  }, [initial]);

  function validate(data: OrganizationInput) {
    const nextErrors: { name?: string } = {};
    if (!data.name.trim()) {
      nextErrors.name = t('org.validation.nameRequired');
    } else if (data.name.trim().length < 2) {
      nextErrors.name = t('org.validation.nameMin');
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = { ...form, name: form.name.trim() };
        if (!validate(data)) return;
        onSave(data);
      }}
      className="space-y-5"
      noValidate
    >
      <div className="space-y-1.5">
        <label
          htmlFor="org-name"
          className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
        >
          {t('org.name')}
        </label>
        <Input
          id="org-name"
          value={form.name}
          onChange={(e) => {
            setForm((f) => ({ ...f, name: e.target.value }));
            setErrors((current) => ({ ...current, name: undefined }));
          }}
          placeholder={t('org.namePlaceholder')}
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? 'org-name-error' : undefined}
          required
        />
        {errors.name && (
          <p id="org-name-error" className="text-xs text-destructive">
            {errors.name}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="org-industry"
          className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
        >
          {t('org.industry')}
        </label>
        <select
          id="org-industry"
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

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {t('org.regions')}
        </label>
        <TagInput
          value={form.regions}
          onChange={(regions) => setForm((f) => ({ ...f, regions }))}
          label={t('org.regions')}
          placeholder={t('org.regionsPlaceholder')}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {t('org.techStack')}
        </label>
        <TagInput
          value={form.techStack}
          onChange={(techStack) => setForm((f) => ({ ...f, techStack }))}
          label={t('org.techStack')}
          placeholder={t('org.techStackPlaceholder')}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {t('org.regulations')}
        </label>
        <TagInput
          value={form.regulations}
          onChange={(regulations) => setForm((f) => ({ ...f, regulations }))}
          label={t('org.regulations')}
          placeholder={t('org.regulationsPlaceholder')}
        />
      </div>

      <div className="pt-2">
        <Button type="submit" disabled={isPending || !form.name.trim()}>
          <Save size={14} className="mr-2" />
          {isPending ? t('org.saving') : submitLabel}
        </Button>
      </div>
    </form>
  );
}
