import { createFileRoute, Link, Outlet, useRouterState } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Building2,
  ScrollText,
  Sparkles,
  CheckCircle2,
  Clock,
  XCircle,
  ChevronRight,
} from 'lucide-react';
import { useNotify } from '@icore/template-shared';
import {
  useFrameworks,
  useStandardsDocuments,
  useGenerateStandards,
  type StandardsDocument,
  type StandardsStatus,
  type WorkflowStatus,
} from '@/queries/notes';
import { useActiveOrgStore } from '@/stores/active-org';
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

const WORKFLOW_COLOR: Record<WorkflowStatus, string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  in_review: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  approved: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  published: 'bg-green-500/10 text-green-500 border-green-500/20',
};

function WorkflowBadge({ status }: { status: WorkflowStatus }) {
  const { t } = useTranslation();
  return (
    <span
      className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${WORKFLOW_COLOR[status]}`}
    >
      {t(`standards.workflow.${status}`)}
    </span>
  );
}

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
    <div className="group bg-surface border border-border rounded-xl p-4 flex flex-col gap-3 hover:border-muted-foreground/40 transition-colors">
      <div className="flex items-start gap-3 min-w-0">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-green-500/10 border border-green-500/20 shrink-0">
          <ScrollText size={14} className="text-green-500" />
        </div>
        <p className="text-sm font-medium text-foreground truncate flex-1">{fwNames}</p>
        {doc.status === 'completed' && (
          <Link
            to="/standards/$id"
            params={{ id: doc.id }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0"
          >
            {t('standards.viewControls')}
            <ChevronRight size={12} />
          </Link>
        )}
      </div>

      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">
          {t('standards.controls', { count: doc.controls.length })}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('standards.generatedOn')} {new Date(doc.createdAt).toLocaleDateString()}
        </p>
      </div>

      <div className="flex items-center gap-2 mt-auto">
        <div className={`flex items-center gap-1 text-xs font-medium ${colorClass}`}>
          <Icon size={12} />
          <span>{t(`standards.status.${doc.status}`)}</span>
        </div>
        <WorkflowBadge status={doc.workflowStatus ?? 'draft'} />
      </div>
    </div>
  );
}

function StandardsPage() {
  const { t } = useTranslation();
  const notify = useNotify();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { activeOrgId } = useActiveOrgStore();
  const { data: frameworks } = useFrameworks();
  const { data: docs, isPending } = useStandardsDocuments(activeOrgId ?? '');
  const generate = useGenerateStandards();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  if (pathname.startsWith('/standards/')) {
    return <Outlet />;
  }

  if (!activeOrgId) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Building2 size={16} />
        {t('org.noActiveOrg')}
      </div>
    );
  }

  function toggleFramework(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleGenerate() {
    if (!activeOrgId) {
      notify.error('Complete organization profile first');
      return;
    }
    if (selected.size === 0) {
      notify.error(t('standards.selectFrameworks'));
      return;
    }
    try {
      await generate.mutateAsync({ orgId: activeOrgId, frameworkIds: [...selected] });
      notify.success(t('standards.generate'));
      setSelected(new Set());
    } catch {
      notify.error(t('error.unknown'));
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{t('standards.title')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t('standards.subtitle')}</p>
      </div>

      {/* Generate panel */}
      <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">{t('standards.generate')}</h2>

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

        <Button onClick={handleGenerate} disabled={generate.isPending || selected.size === 0}>
          <Sparkles size={14} className="mr-2" />
          {generate.isPending ? t('standards.generating') : t('standards.generateBtn')}
        </Button>
      </div>

      {/* Documents list */}
      <div className="@container">
        {isPending ? (
          <div className="grid grid-cols-1 @[480px]:grid-cols-2 @[750px]:grid-cols-3 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-28 bg-surface border border-border rounded-xl animate-pulse"
              />
            ))}
          </div>
        ) : (docs ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ScrollText size={36} className="text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">{t('standards.noStandards')}</p>
            <p className="text-xs text-muted-foreground/60 mt-1">{t('standards.generateHint')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 @[480px]:grid-cols-2 @[750px]:grid-cols-3 gap-3">
            {(docs ?? []).map((doc) => (
              <DocumentCard key={doc.id} doc={doc} frameworks={frameworks ?? []} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute('/_dashboard/standards')({
  component: StandardsPage,
});
