import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  Shield,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useVendor,
  useVendorScans,
  useTriggerScan,
  type CategoryResult,
  type ScanCategory,
  type ScanFinding,
  type VendorScan,
} from '@/queries/vendors';

const GRADE_COLOR: Record<string, string> = {
  A: 'text-green-400',
  B: 'text-blue-400',
  C: 'text-amber-400',
  D: 'text-orange-400',
  F: 'text-red-400',
};

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  low: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  info: 'bg-muted text-muted-foreground border-border',
};

const CATEGORIES: ScanCategory[] = [
  'dns',
  'email',
  'tls',
  'web',
  'network',
  'breach',
  'reputation',
];

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

function ScoreGauge({ score, grade }: { score: number; grade: string }) {
  const color = GRADE_COLOR[grade] ?? 'text-muted-foreground';
  return (
    <div className="flex flex-col items-center justify-center bg-surface border border-border rounded-xl p-6 gap-1 min-w-[120px]">
      <span className={`text-6xl font-black ${color}`}>{grade}</span>
      <span className="text-2xl font-bold text-foreground">{score}</span>
      <span className="text-xs text-muted-foreground">/ 100</span>
    </div>
  );
}

function BreakdownTable({ breakdown }: { breakdown: Record<ScanCategory, CategoryResult> }) {
  const { t } = useTranslation();
  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden flex-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">
              {t('vendors.category')}
            </th>
            <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">
              {t('vendors.score')}
            </th>
            <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">
              {t('vendors.grade')}
            </th>
            <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">
              {t('vendors.findings')}
            </th>
          </tr>
        </thead>
        <tbody>
          {CATEGORIES.map((cat) => {
            const r = breakdown[cat];
            if (!r) return null;
            const color = GRADE_COLOR[r.grade] ?? 'text-muted-foreground';
            return (
              <tr key={cat} className="border-b border-border/50 last:border-0">
                <td className="px-4 py-2 font-medium capitalize">{cat}</td>
                <td className="px-4 py-2 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500/60 rounded-full"
                        style={{ width: `${r.score}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-6 text-right">{r.score}</span>
                  </div>
                </td>
                <td className={`px-4 py-2 text-right font-bold ${color}`}>{r.grade}</td>
                <td className="px-4 py-2 text-right text-muted-foreground">{r.findingCount}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FindingItem({ f }: { f: ScanFinding }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        <span
          className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border shrink-0 ${SEVERITY_COLOR[f.severity] ?? ''}`}
        >
          {f.severity}
        </span>
        <span className="flex-1 text-sm font-medium text-foreground truncate">{f.title}</span>
        <span className="text-[10px] text-muted-foreground/50 capitalize shrink-0">
          {f.category}
        </span>
        {open ? (
          <ChevronDown size={14} className="shrink-0" />
        ) : (
          <ChevronRight size={14} className="shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-2 border-t border-border/50">
          <p className="text-xs text-muted-foreground">{f.detail}</p>
          <div className="flex items-start gap-1.5 text-xs text-green-400">
            <CheckCircle2 size={12} className="mt-0.5 shrink-0" />
            <span>{f.remediation}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ScanHistoryRow({ scan }: { scan: VendorScan }) {
  const [open, setOpen] = useState(false);
  const color = GRADE_COLOR[scan.grade] ?? 'text-muted-foreground';
  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-4 px-4 py-2.5 hover:bg-muted/20 text-left"
      >
        <span className={`font-bold text-sm w-6 ${color}`}>{scan.grade}</span>
        <span className="text-sm text-foreground">{scan.score}</span>
        <span className="text-xs text-muted-foreground flex-1">
          {new Date(scan.scannedAt).toLocaleString()}
        </span>
        <span className="text-[10px] text-muted-foreground/60 capitalize">{scan.triggeredBy}</span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && (scan.findings?.length ?? 0) > 0 && (
        <div className="px-4 pb-3 space-y-2">
          {(scan.findings ?? []).map((f, i) => (
            <FindingItem key={i} f={f} />
          ))}
        </div>
      )}
    </div>
  );
}

function VendorDetailPage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const { data: vendor, isPending: vendorLoading } = useVendor(id);
  const { data: scans = [] } = useVendorScans(id);
  const triggerScan = useTriggerScan(id);

  const latestScan = scans[0];

  if (vendorLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!vendor) {
    return <div className="p-6 text-sm text-muted-foreground">{t('common.notFound')}</div>;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link
          to="/vendors"
          className="mt-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-foreground">{vendor.name}</h1>
          <p className="text-sm text-muted-foreground">{vendor.domain}</p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => triggerScan.mutate('baseline')}
            disabled={triggerScan.isPending}
          >
            {triggerScan.isPending ? (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            ) : (
              <RefreshCw size={14} className="mr-1.5" />
            )}
            {t('vendors.runScan')}
          </Button>
          <Button
            size="sm"
            onClick={() => triggerScan.mutate('deep')}
            disabled={triggerScan.isPending}
          >
            <Zap size={14} className="mr-1.5" />
            {t('vendors.deepScan')}
          </Button>
        </div>
      </div>

      {latestScan ? (
        <>
          {/* Score + breakdown side by side */}
          <div className="flex gap-4 items-start flex-wrap">
            <ScoreGauge score={latestScan.score} grade={latestScan.grade} />
            <BreakdownTable breakdown={latestScan.breakdown} />
          </div>

          {/* Findings */}
          {(latestScan.findings?.length ?? 0) > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-400" />
                {t('vendors.findings')} ({latestScan.findings?.length ?? 0})
              </h2>
              <div className="space-y-2">
                {[...latestScan.findings]
                  .sort(
                    (a, b) => (SEVERITY_ORDER[a.severity] ?? 5) - (SEVERITY_ORDER[b.severity] ?? 5),
                  )
                  .map((f, i) => (
                    <FindingItem key={i} f={f} />
                  ))}
              </div>
            </section>
          )}

          {/* Scan history */}
          {scans.length > 1 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground">{t('vendors.scanHistory')}</h2>
              <div className="bg-surface border border-border rounded-xl overflow-hidden">
                {scans.map((s) => (
                  <ScanHistoryRow key={s.id} scan={s} />
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Shield size={32} className="text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">{t('vendors.noScansYet')}</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-4"
            onClick={() => triggerScan.mutate('baseline')}
            disabled={triggerScan.isPending}
          >
            {t('vendors.runFirstScan')}
          </Button>
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute('/_dashboard/vendors_/$id')({
  component: VendorDetailPage,
});
