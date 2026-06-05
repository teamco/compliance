import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Minus,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { useStandardsDocuments } from '@/queries/notes';
import {
  useAnalyzeGap,
  type ControlFinding,
  type FindingStatus,
  type GapAnalysisResult,
  type GapSeverity,
  type RecommendationEffort,
} from '@/queries/gap';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const STATUS_CONFIG: Record<
  FindingStatus,
  { label: string; icon: typeof CheckCircle2; color: string; bg: string }
> = {
  compliant: {
    label: 'compliant',
    icon: CheckCircle2,
    color: 'text-green-500',
    bg: 'bg-green-500/10 border-green-500/20',
  },
  partial: {
    label: 'partial',
    icon: Minus,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/20',
  },
  'non-compliant': {
    label: 'non-compliant',
    icon: ShieldAlert,
    color: 'text-red-400',
    bg: 'bg-red-500/10 border-red-500/20',
  },
};

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

function GapAnalysisPage() {
  const { t } = useTranslation();
  const { data: docs, isPending: docsLoading } = useStandardsDocuments();
  const analyzeGap = useAnalyzeGap();

  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [findings, setFindings] = useState<
    Record<string, { status: FindingStatus; evidence: string; expanded: boolean }>
  >({});
  const [result, setResult] = useState<GapAnalysisResult | null>(null);

  const completedDocs = (docs ?? []).filter((d) => d.status === 'completed');
  const selectedDoc = completedDocs.find((d) => d.id === selectedDocId);

  function setStatus(code: string, status: FindingStatus) {
    setFindings((prev) => ({
      ...prev,
      [code]: {
        status,
        evidence: prev[code]?.evidence ?? '',
        expanded: prev[code]?.expanded ?? false,
      },
    }));
  }

  function setEvidence(code: string, evidence: string) {
    setFindings((prev) => ({
      ...prev,
      [code]: { ...prev[code], evidence },
    }));
  }

  function toggleExpanded(code: string) {
    setFindings((prev) => ({
      ...prev,
      [code]: { ...prev[code], expanded: !prev[code]?.expanded },
    }));
  }

  function handleDocChange(id: string) {
    setSelectedDocId(id);
    setFindings({});
    setResult(null);
  }

  async function handleAnalyze() {
    if (!selectedDoc) return;
    const controls = selectedDoc.controls.map((c) => ({
      id: c.code,
      title: c.title,
      description: c.description,
      implementationGuidance: c.implementation,
    }));
    const findingsList: ControlFinding[] = selectedDoc.controls.map((c) => ({
      controlId: c.code,
      status: findings[c.code]?.status ?? 'non-compliant',
      evidence: findings[c.code]?.evidence || undefined,
    }));
    analyzeGap.mutate(
      { controls, findings: findingsList },
      { onSuccess: (data) => setResult(data) },
    );
  }

  const allAssessed = selectedDoc
    ? selectedDoc.controls.every((c) => !!findings[c.code]?.status)
    : false;

  return (
    <div className="p-6 space-y-6 max-w-[1200px]">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">{t('gapAnalysis.title')}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">{t('gapAnalysis.subtitle')}</p>
      </div>

      {/* Document selector */}
      <div className="bg-surface border border-border rounded-xl p-4">
        {docsLoading ? (
          <div className="h-8 w-64 bg-muted rounded animate-pulse" />
        ) : completedDocs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('gapAnalysis.generateFirst')}</p>
        ) : (
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-muted-foreground shrink-0">
              {t('gapAnalysis.selectDocument')}
            </label>
            <select
              value={selectedDocId}
              onChange={(e) => handleDocChange(e.target.value)}
              className="flex-1 max-w-xs h-8 rounded-md border border-border bg-transparent px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
            >
              <option value="">—</option>
              {completedDocs.map((d) => (
                <option key={d.id} value={d.id}>
                  {t('standards.controls', { count: d.controls.length })} ·{' '}
                  {new Date(d.createdAt).toLocaleDateString()}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {selectedDoc && (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6 items-start">
          {/* Controls assessment */}
          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {t('gapAnalysis.controlsTitle')}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('gapAnalysis.controlsSubtitle')}
              </p>
            </div>

            {selectedDoc.controls.map((ctrl) => {
              const finding = findings[ctrl.code];
              const status = finding?.status;
              const statusCfg = status ? STATUS_CONFIG[status] : null;
              const StatusIcon = statusCfg?.icon;

              return (
                <div
                  key={ctrl.code}
                  className="bg-surface border border-border rounded-xl p-4 space-y-3 transition-colors hover:border-muted-foreground/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {ctrl.code}
                        </span>
                        {statusCfg && StatusIcon && (
                          <StatusIcon size={12} className={statusCfg.color} />
                        )}
                      </div>
                      <p className="text-sm font-medium text-foreground leading-snug mt-0.5">
                        {ctrl.title}
                      </p>
                    </div>

                    {/* Status pills */}
                    <div className="flex gap-1 shrink-0 flex-wrap justify-end">
                      {(['compliant', 'partial', 'non-compliant'] as FindingStatus[]).map((s) => {
                        const cfg = STATUS_CONFIG[s];
                        const Icon = cfg.icon;
                        const active = status === s;
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setStatus(ctrl.code, s)}
                            className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border cursor-pointer transition-all ${
                              active
                                ? `${cfg.bg} ${cfg.color}`
                                : 'bg-transparent border-border text-muted-foreground hover:border-muted-foreground/50'
                            }`}
                          >
                            <Icon size={10} />
                            {t(`gapAnalysis.status.${s}`)}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Evidence toggle */}
                  <div>
                    <button
                      type="button"
                      onClick={() => toggleExpanded(ctrl.code)}
                      className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors cursor-pointer"
                    >
                      {finding?.expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                      {t('gapAnalysis.evidence')}
                    </button>
                    {finding?.expanded && (
                      <Textarea
                        rows={2}
                        value={finding.evidence}
                        onChange={(e) => setEvidence(ctrl.code, e.target.value)}
                        placeholder={t('gapAnalysis.evidencePlaceholder')}
                        className="mt-2 text-xs resize-none"
                      />
                    )}
                  </div>
                </div>
              );
            })}

            <Button
              onClick={() => void handleAnalyze()}
              disabled={analyzeGap.isPending || !allAssessed}
              className="w-full gap-2"
            >
              <Zap size={14} />
              {analyzeGap.isPending ? t('gapAnalysis.analyzing') : t('gapAnalysis.analyze')}
            </Button>
            {!allAssessed && (
              <p className="text-[10px] text-muted-foreground text-center">
                {t('gapAnalysis.selectStatus')} —{' '}
                {selectedDoc.controls.filter((c) => !findings[c.code]?.status).length} remaining
              </p>
            )}
          </div>

          {/* Results panel */}
          <div className="space-y-4 xl:sticky xl:top-6">
            {analyzeGap.isPending && (
              <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
                {[80, 60, 100, 72, 88].map((w, i) => (
                  <div key={i} className={`h-3 w-[${w}%] bg-muted rounded animate-pulse`} />
                ))}
              </div>
            )}

            {result && (
              <>
                {/* Risk score */}
                <div className="bg-surface border border-border rounded-xl p-5 flex items-center gap-5">
                  <RiskGauge score={result.riskScore} />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t('gapAnalysis.riskScore')}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-[200px]">
                      {result.summary}
                    </p>
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
                          <p className="text-xs text-foreground/80 leading-relaxed">
                            {gap.description}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Recommendations */}
                <div className="bg-surface border border-border rounded-xl p-5 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('gapAnalysis.recommendations')}
                  </p>
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
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute('/_dashboard/gap-analysis')({
  component: GapAnalysisPage,
});
