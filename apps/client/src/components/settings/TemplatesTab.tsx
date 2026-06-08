import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Pencil, FileText } from 'lucide-react';
import {
  useReportTemplates,
  useCreateReportTemplate,
  useUpdateReportTemplate,
  useDeleteReportTemplate,
  type ReportTemplate,
  type ReportTemplateInput,
} from '@/queries/report-templates';
import { useOrganizations } from '@/queries/notes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const SCOPES: ReportTemplateInput['scope'][] = ['all', 'gap', 'standards'];

const EMPTY: ReportTemplateInput = {
  name: '',
  scope: 'all',
  brandName: '',
  accentColor: '#16a34a',
  includeSummary: true,
  includeDetails: true,
  includeRecommendations: true,
  footerNote: 'Confidential',
  favoriteOrgIds: [],
};

export function TemplatesTab() {
  const { t } = useTranslation();
  const { data: templates, isPending } = useReportTemplates();
  const { data: orgs } = useOrganizations();
  const { mutate: create, isPending: creating } = useCreateReportTemplate();
  const { mutate: update, isPending: updating } = useUpdateReportTemplate();
  const { mutate: remove } = useDeleteReportTemplate();

  const [form, setForm] = useState<ReportTemplateInput | null>(null);
  const [editId, setEditId] = useState<string | null>(null);

  function startCreate() {
    setEditId(null);
    setForm({ ...EMPTY });
  }

  function startEdit(tpl: ReportTemplate) {
    setEditId(tpl.id);
    setForm({
      name: tpl.name,
      scope: tpl.scope,
      brandName: tpl.brandName,
      accentColor: tpl.accentColor,
      includeSummary: tpl.includeSummary,
      includeDetails: tpl.includeDetails,
      includeRecommendations: tpl.includeRecommendations,
      footerNote: tpl.footerNote,
      favoriteOrgIds: tpl.favoriteOrgIds,
    });
  }

  function toggleFavoriteOrg(orgId: string) {
    setForm((f) =>
      f
        ? {
            ...f,
            favoriteOrgIds: f.favoriteOrgIds.includes(orgId)
              ? f.favoriteOrgIds.filter((o) => o !== orgId)
              : [...f.favoriteOrgIds, orgId],
          }
        : f,
    );
  }

  function close() {
    setForm(null);
    setEditId(null);
  }

  function save() {
    if (!form || !form.name.trim()) return;
    if (editId) {
      update({ id: editId, patch: form }, { onSuccess: close });
    } else {
      create(form, { onSuccess: close });
    }
  }

  function set<K extends keyof ReportTemplateInput>(key: K, value: ReportTemplateInput[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  if (isPending) return <div className="text-sm text-muted-foreground">{t('common.loading')}</div>;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t('settings.templates.title')}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t('settings.templates.subtitle')}</p>
        </div>
        <Button size="sm" onClick={startCreate} className="gap-1.5">
          <Plus size={13} />
          {t('settings.templates.add')}
        </Button>
      </div>

      {form && (
        <div className="rounded-md border border-border p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                {t('settings.templates.name')}
              </label>
              <Input
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                className="text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                {t('settings.templates.scope')}
              </label>
              <select
                value={form.scope}
                onChange={(e) => set('scope', e.target.value as ReportTemplateInput['scope'])}
                className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground cursor-pointer"
              >
                {SCOPES.map((s) => (
                  <option key={s} value={s}>
                    {t(`settings.templates.scopes.${s}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                {t('settings.templates.brandName')}
              </label>
              <Input
                value={form.brandName}
                onChange={(e) => set('brandName', e.target.value)}
                placeholder={t('settings.templates.brandNamePlaceholder')}
                className="text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                {t('settings.templates.accentColor')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.accentColor}
                  onChange={(e) => set('accentColor', e.target.value)}
                  className="h-8 w-10 rounded border border-border bg-surface cursor-pointer"
                />
                <Input
                  value={form.accentColor}
                  onChange={(e) => set('accentColor', e.target.value)}
                  className="text-xs font-mono"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">
              {t('settings.templates.footerNote')}
            </label>
            <Input
              value={form.footerNote}
              onChange={(e) => set('footerNote', e.target.value)}
              className="text-xs"
            />
          </div>

          {(orgs?.length ?? 0) > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                {t('settings.templates.favoriteOrgs')}
              </label>
              <div className="flex flex-wrap gap-2">
                {orgs?.map((org) => {
                  const on = form.favoriteOrgIds.includes(org.id);
                  return (
                    <button
                      key={org.id}
                      type="button"
                      onClick={() => toggleFavoriteOrg(org.id)}
                      className={[
                        'rounded-lg border px-2.5 py-1 text-xs transition-colors cursor-pointer',
                        on
                          ? 'border-green-500/20 bg-green-500/10 text-green-500'
                          : 'border-border bg-surface text-muted-foreground hover:text-foreground',
                      ].join(' ')}
                    >
                      {org.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-4">
            {(['includeSummary', 'includeDetails', 'includeRecommendations'] as const).map(
              (key) => (
                <label
                  key={key}
                  className="flex items-center gap-2 text-xs text-foreground cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={form[key]}
                    onChange={(e) => set(key, e.target.checked)}
                    className="h-3.5 w-3.5 accent-green-500"
                  />
                  {t(`settings.templates.${key}`)}
                </label>
              ),
            )}
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={!form.name.trim() || creating || updating}>
              {creating || updating ? t('common.saving') : t('common.save')}
            </Button>
            <Button size="sm" variant="outline" onClick={close}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}

      {templates?.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('settings.templates.empty')}</p>
      ) : (
        <div className="space-y-2">
          {templates?.map((tpl) => (
            <div key={tpl.id} className="rounded-md border border-border px-4 py-3">
              <div className="flex items-start gap-3">
                <span
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded"
                  style={{ backgroundColor: `${tpl.accentColor}1a` }}
                >
                  <FileText size={13} style={{ color: tpl.accentColor }} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{tpl.name}</p>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                      {t(`settings.templates.scopes.${tpl.scope}`)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {[
                      tpl.includeSummary && t('settings.templates.includeSummary'),
                      tpl.includeDetails && t('settings.templates.includeDetails'),
                      tpl.includeRecommendations && t('settings.templates.includeRecommendations'),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => startEdit(tpl)}
                    className="rounded-md p-1 text-muted-foreground/50 hover:text-foreground transition-colors cursor-pointer"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(tpl.id)}
                    className="rounded-md p-1 text-muted-foreground/50 hover:text-red-400 transition-colors cursor-pointer"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
