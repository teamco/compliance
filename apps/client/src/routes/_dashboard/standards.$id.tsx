import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { useStandardsDocument, type StandardControlPriority } from '@/queries/notes';

const PRIORITY_COLOR: Record<StandardControlPriority, string> = {
  critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  high: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  medium: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  low: 'bg-muted text-muted-foreground border-border',
};

function StandardsDetailPage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const { data: doc, isPending } = useStandardsDocument(id);

  if (isPending) {
    return (
      <div className="p-6 space-y-4 max-w-[1000px]">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 bg-surface border border-border rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground text-sm">{t('error.unknown')}</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1000px]">
      <div className="flex items-center gap-3">
        <Link
          to="/standards"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ArrowLeft size={13} />
          {t('standards.title')}
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-semibold text-foreground">{t('standards.viewControls')}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t('standards.controls', { count: doc.controls.length })} · {t('standards.generatedOn')}{' '}
          {new Date(doc.createdAt).toLocaleDateString()}
        </p>
      </div>

      <div className="space-y-3">
        {doc.controls.map((ctrl) => (
          <div
            key={ctrl.code}
            className="bg-surface border border-border rounded-xl p-5 space-y-3 hover:border-muted-foreground/30 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex items-center justify-center w-7 h-7 rounded-md bg-green-500/10 border border-green-500/20 shrink-0">
                  <ShieldCheck size={13} className="text-green-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-mono text-muted-foreground">{ctrl.code}</p>
                  <p className="text-sm font-medium text-foreground leading-snug">{ctrl.title}</p>
                </div>
              </div>
              <span
                className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border shrink-0 ${PRIORITY_COLOR[ctrl.priority]}`}
              >
                {t(`standards.priority.${ctrl.priority}`)}
              </span>
            </div>

            {ctrl.description && (
              <p className="text-xs text-muted-foreground leading-relaxed pl-9">
                {ctrl.description}
              </p>
            )}

            {ctrl.implementation && (
              <div className="pl-9 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  Implementation
                </p>
                <p className="text-xs text-foreground/80 leading-relaxed">{ctrl.implementation}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export const Route = createFileRoute('/_dashboard/standards/$id')({
  component: StandardsDetailPage,
});
