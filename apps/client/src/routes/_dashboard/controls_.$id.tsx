import { useState } from 'react';
import { createFileRoute, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useInternalControl, useUpdateControl } from '@/queries/controls';
import { PageLayout } from '@/components/PageLayout';

export const Route = createFileRoute('/_dashboard/controls_/$id')({
  component: ControlDetailPage,
});

type Tab =
  'overview' | 'implementation' | 'mapping' | 'evidence' | 'assessments' | 'findings' | 'history';

function ControlDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/_dashboard/controls_/$id' });
  const { data: control, isPending } = useInternalControl(id);
  const updateControl = useUpdateControl(id);
  const [tab, setTab] = useState<Tab>('overview');

  if (isPending || !control) {
    return (
      <PageLayout title={t('controls.detailTitle')}>
        <div className="h-64 bg-surface border border-border rounded-lg animate-pulse" />
      </PageLayout>
    );
  }

  const tabs: Tab[] = [
    'overview',
    'implementation',
    'mapping',
    'evidence',
    'assessments',
    'findings',
    'history',
  ];

  return (
    <PageLayout title={`${control.code} — ${control.title}`}>
      <div className="flex items-center gap-1 border-b border-border mb-4">
        {tabs.map((tKey) => (
          <button
            key={tKey}
            type="button"
            onClick={() => setTab(tKey)}
            className={`px-3 py-2 text-sm border-b-2 -mb-px cursor-pointer ${
              tab === tKey
                ? 'border-green-500 text-foreground font-medium'
                : 'border-transparent text-muted-foreground'
            }`}
          >
            {t(`controls.tab.${tKey}`)}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-2 gap-4 text-sm">
          <Field label={t('controls.colCode')} value={control.code} />
          <Field label={t('controls.colTitle')} value={control.title} />
          <Field label={t('controls.fieldDescription')} value={control.description} />
          <Field label={t('controls.colDomain')} value={control.domain} />
          <Field label={t('controls.colOwner')} value={control.owner} />
          <Field label={t('controls.fieldOperator')} value={control.operator ?? ''} />
          <Field label={t('controls.fieldCriticality')} value={control.criticality} />
          <Field label={t('controls.fieldControlType')} value={control.controlType} />
          <Field label={t('controls.fieldExecution')} value={control.execution} />
          <Field label={t('controls.fieldFrequency')} value={control.frequency} />
          <Field label={t('controls.fieldNature')} value={control.nature} />
          <Field
            label={t('controls.fieldKeyControl')}
            value={control.keyControl ? t('common.yes') : t('common.no')}
          />
        </div>
      )}

      {tab === 'implementation' && (
        <div className="space-y-3 text-sm max-w-2xl">
          <label className="block">
            <span className="text-xs text-muted-foreground">
              {t('controls.fieldImplementationStatus')}
            </span>
            <select
              value={control.implementationStatus}
              onChange={(e) =>
                updateControl.mutate({
                  implementationStatus: e.target.value as typeof control.implementationStatus,
                })
              }
              className="mt-1 w-full h-9 rounded-md border border-border bg-surface px-2 text-sm"
            >
              {[
                'not_implemented',
                'planned',
                'partially_implemented',
                'implemented',
                'not_applicable',
              ].map((s) => (
                <option key={s} value={s}>
                  {s.replace('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">
              {t('controls.fieldImplementationDescription')}
            </span>
            <textarea
              defaultValue={control.implementationDescription}
              onBlur={(e) => updateControl.mutate({ implementationDescription: e.target.value })}
              className="mt-1 w-full min-h-24 rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
            />
          </label>
        </div>
      )}

      {tab === 'mapping' && (
        <div className="space-y-2 text-sm">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="py-2 px-3">{t('controls.mappingFramework')}</th>
                <th className="py-2 px-3">{t('controls.mappingRequirement')}</th>
                <th className="py-2 px-3">{t('controls.mappingType')}</th>
                <th className="py-2 px-3">{t('controls.mappingValidation')}</th>
              </tr>
            </thead>
            <tbody>
              {(control.frameworkMappings ?? []).map((m) => (
                <tr key={m.id} className="border-b border-border">
                  <td className="py-2 px-3">{m.frameworkName}</td>
                  <td className="py-2 px-3">
                    {m.requirementCode}
                    {m.requirementTitle ? ` — ${m.requirementTitle}` : ''}
                  </td>
                  <td className="py-2 px-3">{m.mappingType}</td>
                  <td className="py-2 px-3">
                    {m.validation === 'ai_suggested'
                      ? t('controls.aiSuggested')
                      : t('controls.humanValidated')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(control.frameworkMappings ?? []).length === 0 && (
            <div className="py-8 text-center text-muted-foreground">{t('controls.noMappings')}</div>
          )}
        </div>
      )}
    </PageLayout>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-foreground">{value || '—'}</div>
    </div>
  );
}
