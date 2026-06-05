import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@icore/template-shared';
import { useProfile } from '@/queries/profile';
import { useFrameworks, useStandardsDocuments } from '@/queries/notes';
import {
  Shield,
  CheckCircle2,
  AlertTriangle,
  Activity,
  TrendingUp,
  Clock,
  ArrowRight,
} from 'lucide-react';

const FRAMEWORK_COLORS = [
  'bg-green-500',
  'bg-blue-500',
  'bg-amber-500',
  'bg-purple-500',
  'bg-cyan-500',
];

const ACTIVITY = [
  { time: '2m ago', text: 'Gap analysis completed for NIST CSF', type: 'success' },
  { time: '1h ago', text: '12 new controls generated via AI', type: 'info' },
  { time: '3h ago', text: 'ISO 27001 framework updated to 2022', type: 'info' },
  { time: '1d ago', text: '5 critical gaps require remediation', type: 'warning' },
  { time: '2d ago', text: 'SOC 2 evidence collection started', type: 'info' },
];

const typeIndicator: Record<string, string> = {
  success: 'bg-green-500',
  info: 'bg-blue-500',
  warning: 'bg-amber-500',
};

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  accent: string;
  trend?: string;
}

function StatCard({ label, value, sub, icon: Icon, accent, trend }: StatCardProps) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5 flex flex-col gap-3 hover:border-muted-foreground/30 transition-colors">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </p>
        <div className={`flex items-center justify-center w-8 h-8 rounded-lg ${accent}`}>
          <Icon size={16} className="text-white" />
        </div>
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      {trend && (
        <div className="flex items-center gap-1 text-xs text-green-500">
          <TrendingUp size={12} />
          <span>{trend}</span>
        </div>
      )}
    </div>
  );
}

function DashboardHome() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const { data: profile } = useProfile();
  const { data: frameworks } = useFrameworks();
  const { data: docs } = useStandardsDocuments();
  const hour = new Date().getHours();

  const totalControls = (docs ?? [])
    .filter((d) => d.status === 'completed')
    .reduce((sum, d) => sum + d.controls.length, 0);
  const frameworkCount = (frameworks ?? []).length;
  const greeting =
    hour < 12
      ? t('dashboard.greetingMorning')
      : hour < 18
        ? t('dashboard.greetingAfternoon')
        : t('dashboard.greetingEvening');

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      {/* Page heading */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            {greeting},{' '}
            <span className="text-muted-foreground">
              {profile?.displayName ?? user?.email?.split('@')[0] ?? 'user'}
            </span>
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t('dashboard.subtitle')}</p>
        </div>
        <div className="flex items-center gap-1.5 bg-surface border border-border rounded-lg px-3 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-muted-foreground">{t('common.live')}</span>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label={t('dashboard.totalControls')}
          value={totalControls || '—'}
          sub={t('dashboard.totalControlsSub', { count: frameworkCount })}
          icon={Shield}
          accent="bg-blue-600"
        />
        <StatCard
          label={t('dashboard.compliant')}
          value="189"
          sub={t('dashboard.compliantSub', { pct: 76.5 })}
          icon={CheckCircle2}
          accent="bg-green-600"
          trend="+3.2% vs last month"
        />
        <StatCard
          label={t('dashboard.gapsIdentified')}
          value="58"
          sub={t('dashboard.gapsSub', { critical: 12, medium: 46 })}
          icon={AlertTriangle}
          accent="bg-amber-600"
        />
        <StatCard
          label={t('dashboard.riskScore')}
          value="76 / 100"
          sub={t('dashboard.riskScoreSub')}
          icon={Activity}
          accent="bg-purple-600"
          trend="+4 pts this week"
        />
      </div>

      {/* Lower grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Framework compliance */}
        <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              {t('dashboard.frameworkCompliance')}
            </h2>
            <Link
              to="/frameworks"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {t('dashboard.viewAll')} <ArrowRight size={12} />
            </Link>
          </div>
          <div className="space-y-4">
            {(frameworks ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground/60 py-4 text-center">
                {t('frameworks.loading')}
              </p>
            ) : (
              (frameworks ?? []).map((fw, i) => {
                const docsForFw = (docs ?? []).filter(
                  (d) => d.status === 'completed' && d.frameworkIds.includes(fw.id),
                );
                const hasStandards = docsForFw.length > 0;
                const pct = hasStandards ? 100 : 0;
                const color = FRAMEWORK_COLORS[i % FRAMEWORK_COLORS.length];
                return (
                  <div key={fw.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-foreground font-medium">{fw.name}</span>
                      <span
                        className={hasStandards ? 'text-green-500' : 'text-muted-foreground/40'}
                      >
                        {hasStandards ? t('standards.status.completed') : t('common.soon')}
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${hasStandards ? color : ''}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Recent activity */}
        <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              {t('dashboard.recentActivity')}
            </h2>
            <Clock size={14} className="text-muted-foreground" />
          </div>
          <div className="space-y-3">
            {ACTIVITY.map((a, i) => (
              <div key={i} className="flex items-start gap-3">
                <div
                  className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${typeIndicator[a.type]}`}
                />
                <p className="flex-1 min-w-0 text-xs text-foreground/80 leading-relaxed">
                  {a.text}
                </p>
                <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                  {a.time}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute('/_dashboard/dashboard')({
  component: DashboardHome,
});
