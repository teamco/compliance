import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  BookOpen,
  Shield,
  Layers,
  Scale,
  FileText,
  AlertTriangle,
  Activity,
  Search,
  ChevronDown,
  ChevronRight,
  Download,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { useNotify } from '@icore/template-shared';
import {
  useFramework,
  useFrameworkRequirements,
  useUpdateFramework,
  useInternalControls,
  useFrameworkEvidence,
  useFrameworkAssessments,
  useFrameworkActivities,
  type FrameworkStatus,
  type FrameworkApplicabilityStatus,
  type ImplementationStatus,
  type FrameworkRequirement,
} from '@/queries/frameworks';
import { useActiveOrgStore } from '@/stores/active-org';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RequirementDrawer } from '@/components/frameworks/RequirementDrawer';

export const Route = createFileRoute('/_dashboard/frameworks_/$id')({
  component: FrameworkWorkspacePage,
});

const STATUS_COLORS: Record<FrameworkStatus, string> = {
  available: 'bg-muted text-muted-foreground border-border',
  enabled: 'bg-green-500/10 text-green-500 border-green-500/20',
  configured: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  in_assessment: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
};

const APPLICABILITY_BADGES: Record<FrameworkApplicabilityStatus, string> = {
  applicable: 'bg-green-500/10 text-green-500 border-green-500/20',
  not_applicable: 'bg-red-500/10 text-red-400 border-red-500/20',
  not_determined: 'bg-muted text-muted-foreground border-border',
};

const IMPLEMENTATION_BADGES: Record<ImplementationStatus, string> = {
  implemented: 'bg-green-500/10 text-green-500 border-green-500/20',
  partially_implemented: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  planned: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  not_implemented: 'bg-red-500/10 text-red-400 border-red-500/20',
  not_applicable: 'bg-muted text-muted-foreground border-border',
};

function PostureGauge({ score }: { score: number }) {
  const color = score >= 75 ? 'text-green-500' : score >= 50 ? 'text-amber-400' : 'text-red-400';
  const ringColor =
    score >= 75 ? 'stroke-green-500' : score >= 50 ? 'stroke-amber-400' : 'stroke-red-400';
  const circumference = 2 * Math.PI * 38;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center w-28 h-28 shrink-0">
      <svg className="w-28 h-28 -rotate-90" viewBox="0 0 90 90">
        <circle
          cx="45"
          cy="45"
          r="38"
          fill="none"
          stroke="currentColor"
          strokeWidth="7"
          className="text-border"
        />
        <circle
          cx="45"
          cy="45"
          r="38"
          fill="none"
          strokeWidth="7"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={ringColor}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={`text-2xl font-bold ${color}`}>{score}%</span>
        <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
          Compliance
        </span>
      </div>
    </div>
  );
}

function FrameworkWorkspacePage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const { activeOrgId } = useActiveOrgStore();
  const orgId = activeOrgId ?? '';

  const { data: framework, isPending } = useFramework(id, orgId);
  const { data: requirements = [] } = useFrameworkRequirements(id, orgId);
  const { data: internalControls = [] } = useInternalControls(orgId, id);
  const { data: evidenceList = [] } = useFrameworkEvidence(id, orgId);
  const { data: assessmentsList = [] } = useFrameworkAssessments(id, orgId);
  const { data: activities = [] } = useFrameworkActivities(id, orgId);

  const updateFwMut = useUpdateFramework(orgId, id);

  // Active Workspace Tab
  const [activeTab, setActiveTab] = useState<
    'overview' | 'requirements' | 'mapping' | 'assessments' | 'evidence' | 'documents' | 'activity'
  >('requirements');

  // Selected Requirement for Drawer (Edit/Detail Sheet Pattern)
  const [selectedReqId, setSelectedReqId] = useState<string | null>(null);

  // Requirements Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [functionFilter, setFunctionFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [applicabilityFilter, setApplicabilityFilter] = useState('all');
  const [implementationFilter, setImplementationFilter] = useState('all');

  // Collapsed functions/categories state
  const [collapsedFunctions, setCollapsedFunctions] = useState<Record<string, boolean>>({});

  const selectedRequirement = useMemo(() => {
    if (!selectedReqId) return null;
    return requirements.find((r) => r.id === selectedReqId || r.code === selectedReqId) ?? null;
  }, [requirements, selectedReqId]);

  // Derived counts
  const totalReqs = framework?.requirementsCount || requirements.length || 0;
  const applicableCount =
    requirements.filter((r) => r.applicability === 'applicable').length ||
    framework?.applicableCount ||
    0;
  const notApplicableCount =
    requirements.filter((r) => r.applicability === 'not_applicable').length ||
    framework?.notApplicableCount ||
    0;
  const notReviewedCount = Math.max(0, totalReqs - applicableCount - notApplicableCount);

  const implementedCount = requirements.filter(
    (r) => r.implementationStatus === 'implemented',
  ).length;
  const partialCount = requirements.filter(
    (r) => r.implementationStatus === 'partially_implemented',
  ).length;
  const complianceScore =
    totalReqs > 0
      ? Math.round(((implementedCount + partialCount * 0.5) / Math.max(1, totalReqs)) * 100)
      : 75;

  // Group requirements hierarchically by Function -> Category
  const groupedHierarchy = useMemo(() => {
    const map = new Map<
      string,
      {
        functionCode: string;
        functionName: string;
        categories: Map<
          string,
          {
            categoryCode: string;
            categoryName: string;
            items: FrameworkRequirement[];
          }
        >;
      }
    >();

    for (const req of requirements) {
      // Filter matching
      const matchesSearch =
        !searchQuery.trim() ||
        req.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        req.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        req.description.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesFunc = functionFilter === 'all' || req.functionCode === functionFilter;
      const matchesCat = categoryFilter === 'all' || req.categoryCode === categoryFilter;
      const matchesApp = applicabilityFilter === 'all' || req.applicability === applicabilityFilter;
      const matchesImp =
        implementationFilter === 'all' || req.implementationStatus === implementationFilter;

      if (!matchesSearch || !matchesFunc || !matchesCat || !matchesApp || !matchesImp) {
        continue;
      }

      const fCode = req.functionCode || 'GEN';
      const fName = req.functionName || 'General';
      const cCode = req.categoryCode || req.code.split('-')[0] || 'GEN';
      const cName = req.categoryName || 'Controls';

      let funcObj = map.get(fCode);
      if (!funcObj) {
        funcObj = {
          functionCode: fCode,
          functionName: fName,
          categories: new Map(),
        };
        map.set(fCode, funcObj);
      }

      let catObj = funcObj.categories.get(cCode);
      if (!catObj) {
        catObj = {
          categoryCode: cCode,
          categoryName: cName,
          items: [],
        };
        funcObj.categories.set(cCode, catObj);
      }

      catObj.items.push(req);
    }

    return Array.from(map.values()).map((f) => ({
      ...f,
      categories: Array.from(f.categories.values()),
    }));
  }, [
    requirements,
    searchQuery,
    functionFilter,
    categoryFilter,
    applicabilityFilter,
    implementationFilter,
  ]);

  if (isPending) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-6 w-48 bg-muted rounded animate-pulse" />
        <div className="h-32 bg-surface border border-border rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!framework) {
    return (
      <div className="p-6 space-y-4">
        <button
          type="button"
          onClick={() => void navigate({ to: '/frameworks' })}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ArrowLeft size={13} />
          {t('frameworks.backToLibrary', 'Back to Frameworks Library')}
        </button>
        <p className="text-sm text-muted-foreground">Framework not found.</p>
      </div>
    );
  }

  const fwStatus = framework.status || 'enabled';

  function handleStatusChange(newStatus: FrameworkStatus) {
    updateFwMut.mutate(
      { status: newStatus },
      {
        onSuccess: () => {
          notify.success(t('frameworks.statusUpdated', 'Framework status updated'));
        },
      },
    );
  }

  function toggleFunction(fCode: string) {
    setCollapsedFunctions((prev) => ({
      ...prev,
      [fCode]: !prev[fCode],
    }));
  }

  return (
    <div className="p-6 space-y-6">
      {/* Top Breadcrumb & Status */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Link
          to="/frameworks"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={13} />
          {t('frameworks.backToLibrary', 'Frameworks Library')}
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Status:</span>
          <select
            value={fwStatus}
            onChange={(e) => handleStatusChange(e.target.value as FrameworkStatus)}
            className={`text-xs h-7 rounded border px-2.5 font-semibold uppercase tracking-wider cursor-pointer focus:outline-none ${STATUS_COLORS[fwStatus]}`}
          >
            <option value="available">Available</option>
            <option value="enabled">Enabled</option>
            <option value="configured">Configured</option>
            <option value="in_assessment">In Assessment</option>
          </select>
        </div>
      </div>

      {/* Workspace Main Header Card */}
      <div className="p-6 rounded-2xl bg-surface border border-border space-y-4 shadow-xs">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2 max-w-3xl">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-bold text-foreground leading-snug">{framework.name}</h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 capitalize">
                {framework.category}
              </span>
              <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-muted text-muted-foreground">
                v{framework.version}
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{framework.description}</p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() => notify.info('Exporting framework compliance matrix…')}
              className="text-xs gap-1.5 h-8"
            >
              <Download size={13} />
              Export
            </Button>
            <Button
              size="sm"
              onClick={() => setSelectedReqId(requirements[0]?.id || 'nist-gv-po-01')}
              className="bg-green-600 hover:bg-green-500 text-white text-xs gap-1.5 h-8"
            >
              <Sparkles size={13} />
              Open Requirements
            </Button>
          </div>
        </div>

        {/* Workspace Summary Metric Bar */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-border">
          <div className="flex items-center gap-3 text-xs text-foreground font-medium flex-wrap">
            <span className="text-muted-foreground">Hierarchy:</span>
            <span>
              <strong>{framework.functionsCount || 6}</strong> Functions
            </span>
            <span className="text-muted-foreground">·</span>
            <span>
              <strong>{framework.categoriesCount || 22}</strong> Categories
            </span>
            <span className="text-muted-foreground">·</span>
            <span>
              <strong>{totalReqs}</strong> Subcategories
            </span>
          </div>

          <div className="flex items-center md:justify-end gap-3 text-xs flex-wrap">
            <span className="text-muted-foreground">Applicability:</span>
            <span className="text-green-500 font-semibold">{applicableCount} Applicable</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-red-400 font-semibold">{notApplicableCount} Not Applicable</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground font-semibold">
              {notReviewedCount} Not Reviewed
            </span>
          </div>
        </div>
      </div>

      {/* 7 Workspace Tabs */}
      <div className="flex border-b border-border gap-1 overflow-x-auto scrollbar-none">
        {[
          {
            id: 'overview' as const,
            label: t('frameworks.tabOverview', 'Overview'),
            icon: BookOpen,
          },
          {
            id: 'requirements' as const,
            label: t('frameworks.tabRequirements', 'Requirements'),
            icon: Shield,
          },
          { id: 'mapping' as const, label: t('frameworks.tabMapping', 'Mapping'), icon: Scale },
          {
            id: 'assessments' as const,
            label: t('frameworks.tabAssessments', 'Assessments'),
            icon: AlertTriangle,
          },
          {
            id: 'evidence' as const,
            label: t('frameworks.tabEvidence', 'Evidence'),
            icon: FileText,
          },
          {
            id: 'documents' as const,
            label: t('frameworks.tabDocuments', 'Documents'),
            icon: Layers,
          },
          {
            id: 'activity' as const,
            label: t('frameworks.tabActivity', 'Activity'),
            icon: Activity,
          },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={[
                'flex items-center gap-2 px-4 py-2.5 border-b-2 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer',
                isActive
                  ? 'border-green-500 text-green-500'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Compliance Posture Gauge */}
            <div className="p-5 rounded-xl bg-surface border border-border flex items-center gap-5">
              <PostureGauge score={complianceScore} />
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">Compliance Posture</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Calculated based on verified implementations across applicable controls.
                </p>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="p-5 rounded-xl bg-surface border border-border flex flex-col justify-between">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                Control Implementation
              </span>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <span className="text-2xl font-bold text-green-500">{implementedCount}</span>
                  <span className="text-xs text-muted-foreground block">Implemented</span>
                </div>
                <div>
                  <span className="text-2xl font-bold text-amber-400">{partialCount}</span>
                  <span className="text-xs text-muted-foreground block">Partially Implemented</span>
                </div>
              </div>
            </div>

            <div className="p-5 rounded-xl bg-surface border border-border flex flex-col justify-between">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                GRC Cross-Linkage
              </span>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <span className="text-2xl font-bold text-purple-400">
                    {internalControls.length}
                  </span>
                  <span className="text-xs text-muted-foreground block">Internal Controls</span>
                </div>
                <div>
                  <span className="text-2xl font-bold text-red-400">1</span>
                  <span className="text-xs text-muted-foreground block">Open Findings</span>
                </div>
              </div>
            </div>
          </div>

          {/* Function Progress Cards */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Function Coverage Breakdown</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { code: 'GV', name: 'GOVERN', count: 22, color: 'bg-blue-500' },
                { code: 'ID', name: 'IDENTIFY', count: 18, color: 'bg-purple-500' },
                { code: 'PR', name: 'PROTECT', count: 28, color: 'bg-green-500' },
                { code: 'DE', name: 'DETECT', count: 14, color: 'bg-amber-500' },
                { code: 'RS', name: 'RESPOND', count: 12, color: 'bg-red-500' },
                { code: 'RC', name: 'RECOVER', count: 12, color: 'bg-cyan-500' },
              ].map((func) => (
                <div
                  key={func.code}
                  className="p-4 rounded-xl bg-surface border border-border space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-foreground">
                      {func.code} — {func.name}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {func.count} requirements
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full ${func.color}`} style={{ width: '80%' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: REQUIREMENTS (THE CORE GRC TAB) */}
      {activeTab === 'requirements' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="p-4 rounded-xl bg-surface border border-border space-y-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter by requirement code (e.g. GV.PO-01) or title…"
                  className="h-8 pl-8 text-xs bg-background"
                />
              </div>

              {/* Function Filter */}
              <select
                value={functionFilter}
                onChange={(e) => setFunctionFilter(e.target.value)}
                className="h-8 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground focus:outline-none"
              >
                <option value="all">All Functions</option>
                <option value="GV">GOVERN (GV)</option>
                <option value="ID">IDENTIFY (ID)</option>
                <option value="PR">PROTECT (PR)</option>
                <option value="DE">DETECT (DE)</option>
                <option value="RS">RESPOND (RS)</option>
                <option value="RC">RECOVER (RC)</option>
              </select>

              {/* Category Filter */}
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="h-8 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground focus:outline-none"
              >
                <option value="all">All Categories</option>
                <option value="GV.OC">GV.OC — Organizational Context</option>
                <option value="GV.RM">GV.RM — Risk Management</option>
                <option value="GV.RR">GV.RR — Roles & Responsibilities</option>
                <option value="GV.PO">GV.PO — Policy</option>
                <option value="GV.OV">GV.OV — Oversight</option>
                <option value="GV.SC">GV.SC — Supply Chain</option>
                <option value="ID.AM">ID.AM — Asset Management</option>
                <option value="ID.RA">ID.RA — Risk Assessment</option>
                <option value="PR.AA">PR.AA — Identity & Access</option>
                <option value="PR.DS">PR.DS — Data Security</option>
                <option value="DE.AE">DE.AE — Adverse Events</option>
                <option value="DE.CM">DE.CM — Continuous Monitoring</option>
                <option value="RS.MA">RS.MA — Incident Management</option>
                <option value="RC.RP">RC.RP — Recovery</option>
              </select>

              {/* Applicability Filter */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-muted-foreground font-semibold uppercase">
                  Applicability:
                </span>
                {['all', 'applicable', 'not_applicable', 'not_determined'].map((app) => (
                  <button
                    key={app}
                    type="button"
                    onClick={() => setApplicabilityFilter(app)}
                    className={[
                      'px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer',
                      applicabilityFilter === app
                        ? 'bg-foreground text-background font-semibold'
                        : 'bg-muted text-muted-foreground hover:text-foreground',
                    ].join(' ')}
                  >
                    <span className="capitalize">{app.replace('_', ' ')}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Implementation Status Filter */}
            <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-border">
              <span className="text-[11px] text-muted-foreground font-semibold uppercase">
                Implementation:
              </span>
              {['all', 'implemented', 'partially_implemented', 'planned', 'not_implemented'].map(
                (imp) => (
                  <button
                    key={imp}
                    type="button"
                    onClick={() => setImplementationFilter(imp)}
                    className={[
                      'px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer',
                      implementationFilter === imp
                        ? 'bg-green-600 text-white font-semibold'
                        : 'bg-muted text-muted-foreground hover:text-foreground',
                    ].join(' ')}
                  >
                    <span className="capitalize">{imp.replace('_', ' ')}</span>
                  </button>
                ),
              )}
            </div>
          </div>

          {/* Hierarchical Tree of Functions -> Categories -> Subcategories */}
          {groupedHierarchy.length === 0 ? (
            <div className="p-12 rounded-xl bg-surface border border-dashed border-border text-center space-y-2">
              <Shield size={32} className="text-muted-foreground/30 mx-auto" />
              <p className="text-sm text-muted-foreground">
                No requirements found matching active filters.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {groupedHierarchy.map((func) => {
                const isCollapsed = collapsedFunctions[func.functionCode];
                return (
                  <div
                    key={func.functionCode}
                    className="rounded-xl border border-border bg-surface overflow-hidden shadow-xs"
                  >
                    {/* Function Header Banner */}
                    <button
                      type="button"
                      onClick={() => toggleFunction(func.functionCode)}
                      className="w-full px-5 py-3.5 bg-muted/40 hover:bg-muted/70 flex items-center justify-between transition-colors cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs font-bold px-2.5 py-1 rounded bg-foreground text-background">
                          {func.functionCode}
                        </span>
                        <div>
                          <h3 className="text-sm font-bold text-foreground tracking-wide">
                            {func.functionName}
                          </h3>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground font-medium">
                          {func.categories.reduce((sum, c) => sum + c.items.length, 0)} requirements
                        </span>
                        {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </button>

                    {/* Function Body (Categories & Requirements) */}
                    {!isCollapsed && (
                      <div className="p-4 space-y-4">
                        {func.categories.map((cat) => (
                          <div key={cat.categoryCode} className="space-y-2">
                            {/* Category Banner */}
                            <div className="flex items-center gap-2 text-xs font-semibold text-foreground px-2">
                              <span className="font-mono text-blue-400">→ {cat.categoryCode}</span>
                              <span>—</span>
                              <span>{cat.categoryName}</span>
                              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.2 rounded ml-auto">
                                {cat.items.length} subcategories
                              </span>
                            </div>

                            {/* Requirement Rows */}
                            <div className="space-y-2">
                              {cat.items.map((req) => (
                                <div
                                  key={req.id}
                                  onClick={() => setSelectedReqId(req.id)}
                                  className="group p-4 rounded-xl bg-background border border-border hover:border-green-500/50 hover:bg-surface/80 transition-all cursor-pointer space-y-2.5"
                                >
                                  {/* Row Top Header */}
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-muted text-foreground group-hover:bg-green-500/20 group-hover:text-green-400 transition-colors">
                                          {req.code}
                                        </span>
                                        <h4 className="text-xs font-semibold text-foreground">
                                          {req.title}
                                        </h4>
                                      </div>
                                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                                        {req.description}
                                      </p>
                                    </div>

                                    <ChevronRight
                                      size={15}
                                      className="text-muted-foreground/40 group-hover:text-green-500 transition-colors shrink-0 mt-1"
                                    />
                                  </div>

                                  {/* Row Metrics & Badges */}
                                  <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-border/60 text-[11px]">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span
                                        className={`px-2 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-wider ${APPLICABILITY_BADGES[req.applicability]}`}
                                      >
                                        {req.applicability.replace('_', ' ')}
                                      </span>
                                      <span
                                        className={`px-2 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-wider ${IMPLEMENTATION_BADGES[req.implementationStatus]}`}
                                      >
                                        {req.implementationStatus.replace('_', ' ')}
                                      </span>
                                      {req.controlOwner && (
                                        <span className="text-muted-foreground bg-muted/60 px-2 py-0.5 rounded">
                                          Owner:{' '}
                                          <strong className="text-foreground">
                                            {req.controlOwner}
                                          </strong>
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-3 text-muted-foreground">
                                      <span>
                                        Evidence: <strong>{req.evidenceCount ?? 3}</strong>
                                      </span>
                                      <span>·</span>
                                      <span>
                                        Mapped controls:{' '}
                                        <strong>{req.mappedControlsCount ?? 4}</strong>
                                      </span>
                                      <span>·</span>
                                      <span
                                        className={
                                          req.openFindingsCount ? 'text-red-400 font-semibold' : ''
                                        }
                                      >
                                        Open findings: {req.openFindingsCount ?? 0}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: MAPPING (COMMON CONTROL FRAMEWORK) */}
      {activeTab === 'mapping' && (
        <div className="space-y-6">
          <div className="p-4 rounded-xl bg-purple-500/5 border border-purple-500/20 space-y-1">
            <h3 className="text-sm font-semibold text-purple-300">
              Common Control Framework Matrix
            </h3>
            <p className="text-xs text-purple-200 leading-relaxed">
              Internal controls satisfy requirements across multiple regulatory frameworks
              simultaneously, eliminating redundant auditing.
            </p>
          </div>

          <div className="space-y-3">
            {internalControls.map((ctrl) => (
              <div
                key={ctrl.id}
                className="p-5 rounded-xl bg-surface border border-border space-y-3 shadow-xs"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                      {ctrl.code}
                    </span>
                    <h4 className="text-sm font-semibold text-foreground">{ctrl.title}</h4>
                  </div>
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded">
                    {ctrl.category}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{ctrl.description}</p>
                <div className="pt-2 border-t border-border flex items-center justify-between flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>
                    Owner: <strong className="text-foreground">{ctrl.owner}</strong>
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-muted-foreground">Framework Mappings:</span>
                    {ctrl.frameworkMappings.map((m, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] px-2 py-0.5 rounded bg-background border border-border font-mono text-foreground"
                      >
                        {m.frameworkName.split(' ')[0]}: {m.requirementCode}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: ASSESSMENTS */}
      {activeTab === 'assessments' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Assessment Cycles</h3>
              <p className="text-xs text-muted-foreground">
                History of audits and operational effectiveness assessments for this framework.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => notify.info('Assessment cycle creation scheduled')}
              className="h-8 text-xs bg-green-600 text-white gap-1"
            >
              <Plus size={13} />
              New Assessment Cycle
            </Button>
          </div>

          <div className="space-y-4">
            {assessmentsList.map((asm) => (
              <div
                key={asm.id}
                className="p-5 rounded-xl bg-surface border border-border space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">{asm.cycleName}</h4>
                    <span className="text-xs text-muted-foreground">
                      Assessor: <strong className="text-foreground">{asm.assessor}</strong> ·
                      Completed on {asm.assessmentDate}
                    </span>
                  </div>
                  <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-green-500/10 text-green-500 border border-green-500/20">
                    {asm.status}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-background border border-border">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                      Design
                    </span>
                    <span className="text-xs font-semibold text-foreground capitalize">
                      {asm.designEffectiveness}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-background border border-border">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                      Operating
                    </span>
                    <span className="text-xs font-semibold text-foreground capitalize">
                      {asm.operatingEffectiveness}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-background border border-border">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                      Implementation
                    </span>
                    <span className="text-xs font-semibold text-foreground capitalize">
                      {asm.implementationStatus.replace('_', ' ')}
                    </span>
                  </div>
                </div>

                {asm.observation && (
                  <div className="p-3.5 rounded-lg bg-background border border-border text-xs text-muted-foreground">
                    <strong className="text-foreground block mb-1">Observation:</strong>
                    {asm.observation}
                  </div>
                )}

                {asm.findingId && (
                  <div className="p-3.5 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-red-400">
                        {asm.findingId}
                      </span>
                      <span className="text-xs font-medium text-foreground">
                        {asm.findingTitle}
                      </span>
                    </div>
                    <Link
                      to="/issues"
                      className="text-xs text-red-400 hover:underline inline-flex items-center gap-1"
                    >
                      View in Issues <ArrowRight size={11} />
                    </Link>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: EVIDENCE */}
      {activeTab === 'evidence' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Evidence Repository</h3>
              <p className="text-xs text-muted-foreground">
                All evidence artifacts and compliance proofs linked to {framework.name}.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {evidenceList.map((ev) => (
              <div key={ev.id} className="p-4 rounded-xl bg-surface border border-border space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <FileText size={16} className="text-green-500" />
                    <h4 className="text-xs font-semibold text-foreground">{ev.title}</h4>
                  </div>
                  <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-green-500/10 text-green-500 border border-green-500/20">
                    {ev.verificationStatus}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-muted-foreground">
                  <div>
                    Type: <strong className="text-foreground">{ev.evidenceType}</strong>
                  </div>
                  <div>
                    Source: <strong className="text-foreground">{ev.source}</strong>
                  </div>
                  <div>
                    Period: <strong className="text-foreground">{ev.periodCovered}</strong>
                  </div>
                  <div>
                    Expires: <strong className="text-foreground">{ev.expirationDate}</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 6: DOCUMENTS */}
      {activeTab === 'documents' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Policies & Procedures</h3>
              <p className="text-xs text-muted-foreground">
                Governance policies governing compliance with {framework.name}.
              </p>
            </div>
            <Link to="/policies">
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1">
                Open Policy Center <ArrowRight size={12} />
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-surface border border-border space-y-2">
              <h4 className="text-xs font-semibold text-foreground">
                Information Security Policy v2.1
              </h4>
              <p className="text-xs text-muted-foreground">
                Master security governance policy governing executive oversight and RACI.
              </p>
              <div className="pt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>
                  Status: <strong className="text-green-500">Approved</strong>
                </span>
                <Link to="/policies" className="text-green-500 hover:underline">
                  View Policy
                </Link>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-surface border border-border space-y-2">
              <h4 className="text-xs font-semibold text-foreground">
                Access Control & MFA Procedure v1.4
              </h4>
              <p className="text-xs text-muted-foreground">
                Operational SOP defining Entra ID conditional access and quarterly reviews.
              </p>
              <div className="pt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>
                  Status: <strong className="text-green-500">Approved</strong>
                </span>
                <Link to="/policies" className="text-green-500 hover:underline">
                  View Policy
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: ACTIVITY */}
      {activeTab === 'activity' && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Audit & Activity Trail</h3>
          <div className="space-y-3">
            {activities.map((act) => (
              <div
                key={act.id}
                className="p-4 rounded-xl bg-surface border border-border flex items-start gap-3"
              >
                <Activity size={16} className="text-green-500 shrink-0 mt-0.5" />
                <div className="space-y-0.5 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">{act.action}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(act.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{act.details}</p>
                  <span className="text-[10px] text-muted-foreground/80 block">By {act.actor}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Requirement Detail Sheet / Drawer */}
      <RequirementDrawer
        framework={framework}
        requirement={selectedRequirement}
        internalControls={internalControls}
        evidenceList={evidenceList}
        assessmentsList={assessmentsList}
        orgId={orgId}
        open={!!selectedReqId}
        onOpenChange={(open) => !open && setSelectedReqId(null)}
      />
    </div>
  );
}
