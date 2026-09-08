import { Activity, AlertTriangle, CheckCircle2, FileText, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { heroMetrics, frameworkRows } from '../data/landing-data';
import { MetricCard } from './MetricCard';

export function DashboardPreview() {
  return (
    <Card className="relative overflow-hidden border-green-500/20 bg-surface/80 shadow-2xl shadow-green-950/30 backdrop-blur">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-green-400/70 to-transparent" />
      <CardContent className="p-4 md:p-6">
        <div className="mb-5 flex items-center justify-between border-b border-border pb-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.3em] text-green-400">
              Command Center
            </p>
            <h3 className="mt-1 text-lg font-semibold text-foreground">Security Posture</h3>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1 text-xs text-green-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
            AI monitoring
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-2xl border border-border bg-background/60 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Enterprise risk score</p>
                <div className="mt-2 flex items-end gap-2">
                  <span className="text-6xl font-bold tracking-tight text-foreground">91</span>
                  <span className="pb-2 text-sm text-green-400">+4 pts</span>
                </div>
              </div>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-green-500/20 bg-green-500/10">
                <Activity className="text-green-400" size={24} />
              </div>
            </div>
            <div className="mt-6 space-y-3">
              {frameworkRows.map((row) => (
                <div key={row.name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">{row.name}</span>
                    <span className="text-muted-foreground">{row.coverage}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-green-500"
                      style={{ width: `${row.coverage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {heroMetrics.map((metric) => (
                <MetricCard
                  key={metric.label}
                  label={metric.label}
                  value={metric.value}
                  tone={metric.tone as 'green' | 'amber' | 'blue' | 'purple'}
                />
              ))}
            </div>

            <div className="rounded-2xl border border-border bg-background/60 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Sparkles size={15} className="text-green-400" />
                  AI gap analysis
                </div>
                <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                  12 critical
                </span>
              </div>
              <div className="space-y-2">
                {[
                  {
                    icon: AlertTriangle,
                    text: 'MFA exception process missing evidence owner',
                    tone: 'text-amber-400',
                  },
                  {
                    icon: FileText,
                    text: 'Vendor risk policy generated for review',
                    tone: 'text-blue-400',
                  },
                  {
                    icon: CheckCircle2,
                    text: 'Access control mapped to ISO A.5.15',
                    tone: 'text-green-400',
                  },
                ].map((item) => (
                  <div
                    key={item.text}
                    className="flex items-center gap-3 rounded-lg border border-border bg-surface/70 px-3 py-2 text-xs text-muted-foreground"
                  >
                    <item.icon className={item.tone} size={14} />
                    <span>{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
