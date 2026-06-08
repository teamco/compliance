import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Minus,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { useGapAnalysis } from '@/queries/gap';
import type { GapSeverity, RecommendationEffort } from '@/queries/gap';

const SEVERITY_COLOR: Record<GapSeverity, string> = {
  critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  high: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  medium: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  low: 'bg-muted text-muted-foreground border-border',
};

const EFFORT_COLOR: Record<RecommendationEffort, string> = {
  low: 'text-green-500',
  medium: 'text-amber-400',
  high: 'text-red-400',
};

function RiskGauge({ score }: { score: number }) {
  const color = score >= 70 ? 'text-red-400' : score >= 40 ? 'text-amber-400' : 'text-green-500';
  const ringColor =
    score >= 70 ? 'stroke-red-400' : score >= 40 ? 'stroke-amber-400' : 'stroke-green-500';
  const circumference = 2 * Math.PI * 36;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center w-24 h-24">
      <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80">
        <circle
          cx="40"
          cy="40"
          r="36"
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          className="text-border"
        />
        <circle
          cx="40"
          cy="40"
          r="36"
          fill="none"
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={ringColor}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={`text-2xl font-bold ${color}`}>{score}</span>
        <span className="text-[9px] text-muted-foreground uppercase tracking-wider">/ 100</span>
      </div>
    </div>
  );
}

function GapAnalysisDetailPage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const { data: gap, isPending, isError } = useGapAnalysis(id);

  if (isPending) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-6 w-48 bg-muted rounded animate-pulse" />
        <div className="h-32 bg-muted rounded-xl animate-pulse" />
      </div>
    );
  }

  if (isError || !gap) {
    return (
      <div className="p-6 space-y-4">
        <Link
          to="/gap-analysis"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={13} />
          {t('gapAnalysis.backToNew')}
        </Link>
        <p className="text-sm text-muted-foreground">Analysis not found.</p>
      </div>
    );
  }

  const result = gap.result;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            to="/gap-analysis"
            hash="history"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ArrowLeft size={13} />
            {t('gapAnalysis.history')}
          </Link>
          <h1 className="text-xl font-semibold text-foreground">{t('gapAnalysis.title')}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('gapAnalysis.runOn')} {new Date(gap.createdAt).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Results grid */}
      <div className="grid grid-cols-1 wide:grid-cols-2 gap-4">
        {/* Risk score */}
        <div className="bg-surface border border-border rounded-xl p-5 flex items-center gap-5">
          <RiskGauge score={result.riskScore} />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('gapAnalysis.riskScore')}
            </p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{result.summary}</p>
          </div>
        </div>

        {/* Critical gaps */}
        <div className="bg-surface border border-border rounded-xl p-5 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('gapAnalysis.criticalGaps')}
          </p>
          {result.criticalGaps.length === 0 ? (
            <div className="flex items-center gap-2 text-green-500">
              <ShieldCheck size={14} />
              <p className="text-xs">{t('gapAnalysis.noGaps')}</p>
            </div>
          ) : (
            result.criticalGaps.map((gap, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <AlertTriangle
                  size={12}
                  className={`mt-0.5 shrink-0 ${SEVERITY_COLOR[gap.severity].split(' ')[1]}`}
                />
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-mono text-muted-foreground">
                      {gap.controlId}
                    </span>
                    <span
                      className={`text-[9px] font-semibold uppercase px-1.5 py-0 rounded border ${SEVERITY_COLOR[gap.severity]}`}
                    >
                      {t(`gapAnalysis.severity.${gap.severity}`)}
                    </span>
                  </div>
                  <p className="text-xs text-foreground/80 leading-relaxed">{gap.description}</p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Recommendations */}
        <div className="bg-surface border border-border rounded-xl p-5 space-y-3 wide:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('gapAnalysis.recommendations')}
          </p>
          <div className="grid grid-cols-1 wide:grid-cols-2 gap-3">
            {result.recommendations.map((rec, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className="flex items-center justify-center w-4 h-4 rounded-full bg-green-500/10 border border-green-500/20 text-[9px] font-bold text-green-500 shrink-0 mt-0.5">
                  {rec.priority}
                </span>
                <div className="min-w-0 space-y-0.5">
                  <p className="text-xs text-foreground/80 leading-relaxed">{rec.action}</p>
                  <span className={`text-[9px] font-medium ${EFFORT_COLOR[rec.effort]}`}>
                    {t(`gapAnalysis.effort.${rec.effort}`)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Findings breakdown */}
      {gap.result.findings && gap.result.findings.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-5 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('gapAnalysis.controlsTitle')}
          </p>
          <div className="grid grid-cols-1 wide:grid-cols-2 gap-2">
            {gap.result.findings.map((f) => {
              const icon =
                f.status === 'compliant' ? (
                  <CheckCircle2 size={12} className="text-green-500 shrink-0" />
                ) : f.status === 'partial' ? (
                  <Minus size={12} className="text-amber-400 shrink-0" />
                ) : (
                  <ShieldAlert size={12} className="text-red-400 shrink-0" />
                );
              return (
                <div key={f.controlId} className="flex items-center gap-2 text-xs">
                  {icon}
                  <span className="font-mono text-[10px] text-muted-foreground">{f.controlId}</span>
                  <span className="text-foreground/70 truncate">{f.title}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute('/_dashboard/gap-analysis/$id')({
  component: GapAnalysisDetailPage,
});
