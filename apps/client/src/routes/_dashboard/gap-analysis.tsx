import { useState } from 'react';
import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  Brain,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Minus,
  ShieldAlert,
  Zap,
} from 'lucide-react';
import { useStandardsDocuments } from '@/queries/notes';
import {
  useAnalyzeGap,
  useGapAnalyses,
  useSaveGapAnalysis,
  type ControlFinding,
  type FindingStatus,
} from '@/queries/gap';
import { useActiveOrgStore } from '@/stores/active-org';
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

function GapAnalysisPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { activeOrgId } = useActiveOrgStore();
  const { data: docs, isPending: docsLoading } = useStandardsDocuments(activeOrgId ?? '');
  const { data: pastRuns } = useGapAnalyses(activeOrgId ?? '');
  const analyzeGap = useAnalyzeGap();
  const saveGap = useSaveGapAnalysis();

  const [activeTab, setActiveTab] = useState<'new' | 'history'>(() => {
    const hash = window.location.hash.slice(1);
    return hash === 'history' ? 'history' : 'new';
  });
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [findings, setFindings] = useState<
    Record<string, { status: FindingStatus; evidence: string; expanded: boolean }>
  >({});
  const [dateRange, setDateRange] = useState<'all' | '1d' | '7d' | '30d' | '90d' | '90+'>('all');

  if (pathname.startsWith('/gap-analysis/')) {
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
      [code]: {
        status: prev[code]?.status ?? 'non-compliant',
        expanded: prev[code]?.expanded ?? false,
        ...prev[code],
        evidence,
      },
    }));
  }

  function toggleExpanded(code: string) {
    setFindings((prev) => ({
      ...prev,
      [code]: {
        status: prev[code]?.status ?? 'non-compliant',
        evidence: prev[code]?.evidence ?? '',
        ...prev[code],
        expanded: !prev[code]?.expanded,
      },
    }));
  }

  function handleDocChange(id: string) {
    setSelectedDocId(id);
    setFindings({});
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
    const findingsDetail = selectedDoc.controls.map((c) => ({
      controlId: c.code,
      title: c.title,
      status: findings[c.code]?.status ?? ('non-compliant' as const),
      evidence: findings[c.code]?.evidence || undefined,
    }));
    analyzeGap.mutate(
      { controls, findings: findingsList },
      {
        onSuccess: (data) => {
          if (activeOrgId) {
            const result = { ...data, findings: findingsDetail };
            saveGap.mutate(
              { orgId: activeOrgId, docId: selectedDocId || undefined, result },
              {
                onSuccess: (saved) => {
                  void navigate({ to: '/gap-analysis/$id', params: { id: saved.id } });
                },
              },
            );
          }
        },
      },
    );
  }

  const allAssessed = selectedDoc
    ? selectedDoc.controls.every((c) => !!findings[c.code]?.status)
    : false;

  const tabs = [
    { id: 'new' as const, label: t('gapAnalysis.tabNew') },
    { id: 'history' as const, label: t('gapAnalysis.tabHistory'), count: pastRuns?.length },
  ];

  return (
    <div className="relative p-6 space-y-5">
      {/* Thinking overlay */}
      {analyzeGap.isPending && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 rounded-xl bg-background/80 backdrop-blur-sm">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-surface border border-border">
            <Brain size={24} className="text-green-500 animate-pulse" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-foreground">{t('gapAnalysis.analyzing')}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t('gapAnalysis.analyzingHint')}</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">{t('gapAnalysis.title')}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">{t('gapAnalysis.subtitle')}</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setActiveTab(tab.id);
              history.replaceState(null, '', `/gap-analysis#${tab.id}`);
            }}
            className={[
              '-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors cursor-pointer flex items-center gap-1.5',
              activeTab === tab.id
                ? 'border-green-500 text-green-500'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {tab.label}
            {tab.count != null && tab.count > 0 && (
              <span className="text-[10px] font-semibold px-1.5 py-0 rounded-full bg-muted text-muted-foreground">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab: New Analysis */}
      {activeTab === 'new' && (
        <>
          {/* Document selector + Analyze button */}
          <div className="bg-surface border border-border rounded-xl p-4">
            {docsLoading ? (
              <div className="h-8 w-64 bg-muted rounded animate-pulse" />
            ) : completedDocs.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('gapAnalysis.generateFirst')}</p>
            ) : (
              <div className="flex items-center gap-3 flex-wrap">
                <label className="text-xs font-medium text-muted-foreground shrink-0">
                  {t('gapAnalysis.selectDocument')}
                </label>
                <select
                  value={selectedDocId}
                  onChange={(e) => handleDocChange(e.target.value)}
                  className="flex-1 min-w-0 max-w-xs h-8 rounded-md border border-border bg-surface px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
                >
                  <option value="" className="bg-surface text-foreground">
                    —
                  </option>
                  {completedDocs.map((d) => (
                    <option key={d.id} value={d.id} className="bg-surface text-foreground">
                      {t('standards.controls', { count: d.controls?.length ?? 0 })} ·{' '}
                      {new Date(d.createdAt).toLocaleDateString()}
                    </option>
                  ))}
                </select>
                <Button
                  onClick={() => void handleAnalyze()}
                  disabled={analyzeGap.isPending || !allAssessed || !selectedDoc}
                  className="ms-auto gap-2 shrink-0"
                  size="sm"
                >
                  <Zap size={13} />
                  {t('gapAnalysis.analyze')}
                </Button>
              </div>
            )}
            {selectedDoc && !allAssessed && (
              <p className="text-[10px] text-muted-foreground mt-2">
                {t('gapAnalysis.selectStatus')} —{' '}
                {selectedDoc.controls.filter((c) => !findings[c.code]?.status).length} remaining
              </p>
            )}
          </div>

          {/* Controls assessment */}
          {selectedDoc && (
            <div className="space-y-3 @container">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {t('gapAnalysis.controlsTitle')}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('gapAnalysis.controlsSubtitle')}
                </p>
              </div>

              <div className="grid grid-cols-1 @[600px]:grid-cols-2 gap-3">
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

                        <div className="flex gap-1 shrink-0 flex-wrap justify-end">
                          {(['compliant', 'partial', 'non-compliant'] as FindingStatus[]).map(
                            (s) => {
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
                            },
                          )}
                        </div>
                      </div>

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
              </div>
            </div>
          )}
        </>
      )}

      {/* Tab: History */}
      {activeTab === 'history' && (
        <div className="space-y-4 @container">
          {/* Date filter */}
          <div className="flex items-center gap-2">
            {(['all', '1d', '7d', '30d', '90d', '90+'] as const).map((range) => {
              const label =
                range === 'all'
                  ? t('gapAnalysis.filterAll')
                  : range === '1d'
                    ? t('gapAnalysis.filter1d')
                    : range === '7d'
                      ? t('gapAnalysis.filter7d')
                      : range === '30d'
                        ? t('gapAnalysis.filter30d')
                        : range === '90d'
                          ? t('gapAnalysis.filter90d')
                          : t('gapAnalysis.filter90plus');
              return (
                <button
                  key={range}
                  type="button"
                  onClick={() => setDateRange(range)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                    dateRange === range
                      ? 'bg-green-500/10 text-green-500 border border-green-500/20'
                      : 'text-muted-foreground hover:text-foreground border border-transparent hover:border-border'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Grid */}
          {(() => {
            const now = Date.now();
            const boundary90 = now - 90 * 86_400_000;
            const filtered = (pastRuns ?? []).filter((e) => {
              const t = new Date(e.createdAt).getTime();
              if (dateRange === 'all') return true;
              if (dateRange === '90+') return t < boundary90;
              const cutoff: Record<string, number> = {
                '1d': now - 86_400_000,
                '7d': now - 7 * 86_400_000,
                '30d': now - 30 * 86_400_000,
                '90d': boundary90,
              };
              return t >= (cutoff[dateRange] ?? 0);
            });
            if (filtered.length === 0) {
              return (
                <p className="text-sm text-muted-foreground py-4">{t('gapAnalysis.noHistory')}</p>
              );
            }
            return (
              <div className="grid grid-cols-1 @[480px]:grid-cols-2 @[750px]:grid-cols-3 gap-3">
                {filtered.map((entry) => {
                  const score = entry.riskScore;
                  const scoreColor =
                    score >= 70
                      ? 'text-red-400'
                      : score >= 40
                        ? 'text-amber-400'
                        : 'text-green-500';
                  const ringColor =
                    score >= 70
                      ? 'stroke-red-400'
                      : score >= 40
                        ? 'stroke-amber-400'
                        : 'stroke-green-500';
                  const circumference = 2 * Math.PI * 16;
                  const offset = circumference - (score / 100) * circumference;
                  return (
                    <Link
                      key={entry.id}
                      to="/gap-analysis/$id"
                      params={{ id: entry.id }}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface border border-border hover:border-muted-foreground/30 transition-colors cursor-pointer"
                    >
                      <div className="relative flex items-center justify-center w-16 h-16 shrink-0">
                        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 40 40">
                          <circle
                            cx="20"
                            cy="20"
                            r="16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            className="text-border"
                          />
                          <circle
                            cx="20"
                            cy="20"
                            r="16"
                            fill="none"
                            strokeWidth="3"
                            strokeDasharray={circumference}
                            strokeDashoffset={offset}
                            strokeLinecap="round"
                            className={ringColor}
                          />
                        </svg>
                        <div className="absolute flex flex-col items-center leading-none">
                          <span className={`text-sm font-bold tabular-nums ${scoreColor}`}>
                            {score}
                          </span>
                          <span className="text-[8px] text-muted-foreground">/100</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-0.5 min-w-0 ml-auto text-right">
                        <span className="text-sm text-foreground font-semibold">
                          {new Date(entry.createdAt).toLocaleDateString()}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(entry.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute('/_dashboard/gap-analysis')({
  component: GapAnalysisPage,
});
