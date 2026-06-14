import { useTranslation } from 'react-i18next';
import type { OrganizationInput } from '@/queries/notes';
import { Input } from '@/components/ui/input';
import { INDUSTRIES, SIZES } from './-constants';
import { TagInput } from './-tag-input';

interface OrgFormFieldsProps {
  form: OrganizationInput;
  setForm: React.Dispatch<React.SetStateAction<OrganizationInput>>;
  errors: { name?: string };
  setErrors: React.Dispatch<React.SetStateAction<{ name?: string }>>;
}

export function OrgFormFields({ form, setForm, errors, setErrors }: OrgFormFieldsProps) {
  const { t } = useTranslation();

  return (
    <>
      <div className="flex flex-col gap-3">
        <label
          htmlFor="org-name"
          className="block text-xs font-medium text-muted-foreground uppercase tracking-wider"
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

      <div className="flex flex-col gap-3">
        <label
          htmlFor="org-industry"
          className="block text-xs font-medium text-muted-foreground uppercase tracking-wider"
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

      <div className="flex flex-col gap-3">
        <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
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

      <div className="flex flex-col gap-3">
        <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {t('org.regions')}
        </label>
        <TagInput
          value={form.regions}
          onChange={(regions) => setForm((f) => ({ ...f, regions }))}
          label={t('org.regions')}
          placeholder={t('org.regionsPlaceholder')}
        />
      </div>

      <div className="flex flex-col gap-3">
        <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {t('org.techStack')}
        </label>
        <TagInput
          value={form.techStack}
          onChange={(techStack) => setForm((f) => ({ ...f, techStack }))}
          label={t('org.techStack')}
          placeholder={t('org.techStackPlaceholder')}
        />
      </div>

      <div className="flex flex-col gap-3">
        <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {t('org.regulations')}
        </label>
        <TagInput
          value={form.regulations}
          onChange={(regulations) => setForm((f) => ({ ...f, regulations }))}
          label={t('org.regulations')}
          placeholder={t('org.regulationsPlaceholder')}
        />
      </div>
    </>
  );
}
