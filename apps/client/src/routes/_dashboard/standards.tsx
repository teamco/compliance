import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollText, Sparkles, CheckCircle2, Clock, XCircle, ChevronRight } from 'lucide-react';
import { useNotify } from '@icore/template-shared';
import {
  useFrameworks,
  useOrganization,
  useStandardsDocuments,
  useGenerateStandards,
  type StandardsDocument,
  type StandardsStatus,
} from '@/queries/notes';
import { Button } from '@/components/ui/button';

const STATUS_ICON: Record<StandardsStatus, React.ElementType> = {
  completed: CheckCircle2,
  pending: Clock,
  failed: XCircle,
};

const STATUS_COLOR: Record<StandardsStatus, string> = {
  completed: 'text-green-500',
  pending: 'text-amber-500',
  failed: 'text-red-500',
};

function DocumentCard({
  doc,
  frameworks,
}: {
  doc: StandardsDocument;
  frameworks: { id: string; name: string }[];
}) {
  const { t } = useTranslation();
  const Icon = STATUS_ICON[doc.status];
  const colorClass = STATUS_COLOR[doc.status];
  const fwNames = doc.frameworkIds
    .map((id) => frameworks.find((f) => f.id === id)?.name ?? id)
    .join(', ');

  return (
    <div className="group bg-surface border border-border rounded-xl p-5 flex items-start justify-between gap-4 hover:border-muted-foreground/40 transition-colors">
      <div className="flex items-start gap-4 min-w-0">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-green-500/10 border border-green-500/20 shrink-0">
          <ScrollText size={16} className="text-green-500" />
        </div>
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-foreground truncate">{fwNames}</p>
          <p className="text-xs text-muted-foreground">
            {t('standards.controls', { count: doc.controls.length })} · {t('standards.generatedOn')}{' '}
            {new Date(doc.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className={`flex items-center gap-1.5 text-xs font-medium ${colorClass}`}>
          <Icon size={13} />
          <span>{t(`standards.status.${doc.status}`)}</span>
        </div>
        {doc.status === 'completed' && (
          <Link
            to="/standards/$id"
            params={{ id: doc.id }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            {t('standards.viewControls')}
            <ChevronRight size={12} />
          </Link>
        )}
      </div>
    </div>
  );
}

function StandardsPage() {
  const { t } = useTranslation();
  const notify = useNotify();
  const { data: frameworks } = useFrameworks();
  const { data: org } = useOrganization();
  const { data: docs, isPending } = useStandardsDocuments();
  const generate = useGenerateStandards();

  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggleFramework(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleGenerate() {
    if (!org?.id) {
      notify.error('Complete organization profile first');
      return;
    }
    if (selected.size === 0) {
      notify.error(t('standards.selectFrameworks'));
      return;
    }
    try {
      await generate.mutateAsync({ orgId: org.id, frameworkIds: [...selected] });
      notify.success(t('standards.generate'));
      setSelected(new Set());
    } catch {
      notify.error(t('error.unknown'));
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-[1000px]">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{t('standards.title')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t('standards.subtitle')}</p>
      </div>

      {/* Generate panel */}
      <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">{t('standards.generate')}</h2>

        {!org && (
          <p className="text-xs text-amber-500">
            Complete your{' '}
            <Link to="/org" className="underline hover:text-amber-400">
              organization profile
            </Link>{' '}
            first.
          </p>
        )}

        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
            {t('standards.selectFrameworks')}
          </p>
          <div className="flex flex-wrap gap-2">
            {(frameworks ?? []).map((fw) => (
              <button
                key={fw.id}
                type="button"
                onClick={() => toggleFramework(fw.id)}
                className={[
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer',
                  selected.has(fw.id)
                    ? 'bg-green-500/10 text-green-500 border border-green-500/20'
                    : 'bg-surface border border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/40',
                ].join(' ')}
              >
                {fw.name}
              </button>
            ))}
          </div>
        </div>

        <Button
          onClick={handleGenerate}
          disabled={generate.isPending || selected.size === 0 || !org}
        >
          <Sparkles size={14} className="mr-2" />
          {generate.isPending ? t('standards.generating') : t('standards.generateBtn')}
        </Button>
      </div>

      {/* Documents list */}
      <div className="space-y-3">
        {isPending ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-20 bg-surface border border-border rounded-xl animate-pulse"
            />
          ))
        ) : (docs ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ScrollText size={36} className="text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">{t('standards.noStandards')}</p>
            <p className="text-xs text-muted-foreground/60 mt-1">{t('standards.generateHint')}</p>
          </div>
        ) : (
          (docs ?? []).map((doc) => (
            <DocumentCard key={doc.id} doc={doc} frameworks={frameworks ?? []} />
          ))
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute('/_dashboard/standards')({
  component: StandardsPage,
});
