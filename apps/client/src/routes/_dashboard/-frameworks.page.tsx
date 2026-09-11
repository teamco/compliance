import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  Shield,
  Lock,
  Cloud,
  AlertTriangle,
  Plus,
  Search,
  ArrowRight,
  X,
} from 'lucide-react';
import { useNotify } from '@icore/template-shared';
import {
  useFrameworks,
  useCreateFramework,
  useUpdateFramework,
  type Framework,
  type FrameworkStatus,
} from '@/queries/frameworks';
import { useActiveOrgStore } from '@/stores/active-org';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

const CATEGORY_COLORS: Record<string, string> = {
  security: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  privacy: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  cloud: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  risk: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
};

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  security: Shield,
  privacy: Lock,
  cloud: Cloud,
  risk: AlertTriangle,
};

const STATUS_COLORS: Record<FrameworkStatus, string> = {
  available: 'bg-muted text-muted-foreground border-border',
  enabled: 'bg-green-500/10 text-green-500 border-green-500/20',
  configured: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  in_assessment: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
};

const PREDEFINED_CATALOGUE = [
  {
    slug: 'nist-csf',
    name: 'NIST CSF 2.0',
    version: '2.0',
    category: 'security' as const,
    description:
      'NIST Cybersecurity Framework 2.0 — Govern, Identify, Protect, Detect, Respond, Recover',
    requirementsCount: 106,
    functionsCount: 6,
    categoriesCount: 22,
  },
  {
    slug: 'iso27001',
    name: 'ISO/IEC 27001:2022',
    version: '2022',
    category: 'security' as const,
    description: 'International standard for information security management systems (ISMS)',
    requirementsCount: 93,
    functionsCount: 4,
    categoriesCount: 14,
  },
  {
    slug: 'soc2',
    name: 'SOC 2 Type II',
    version: '2017',
    category: 'security' as const,
    description:
      'AICPA Trust Services Criteria for security, availability, processing integrity, confidentiality, and privacy',
    requirementsCount: 64,
    functionsCount: 5,
    categoriesCount: 9,
  },
  {
    slug: 'gdpr',
    name: 'GDPR',
    version: '2018',
    category: 'privacy' as const,
    description: 'General Data Protection Regulation — EU data protection and privacy law',
    requirementsCount: 99,
    functionsCount: 7,
    categoriesCount: 11,
  },
  {
    slug: 'pci-dss',
    name: 'PCI DSS v4.0',
    version: '4.0',
    category: 'security' as const,
    description: 'Payment Card Industry Data Security Standard for protecting cardholder data',
    requirementsCount: 250,
    functionsCount: 6,
    categoriesCount: 12,
  },
  {
    slug: 'cis-v8',
    name: 'CIS Controls v8',
    version: '8.0',
    category: 'security' as const,
    description:
      'Center for Internet Security Critical Security Controls for Effective Cyber Defense',
    requirementsCount: 153,
    functionsCount: 3,
    categoriesCount: 18,
  },
  {
    slug: 'hipaa-security',
    name: 'HIPAA Security Rule',
    version: '2013',
    category: 'privacy' as const,
    description:
      'Health Insurance Portability and Accountability Act standards for protecting ePHI',
    requirementsCount: 74,
    functionsCount: 3,
    categoriesCount: 18,
  },
];

function FrameworkCard({
  fw,
  onStatusChange,
}: {
  fw: Framework;
  onStatusChange: (id: string, newStatus: FrameworkStatus) => void;
}) {
  const { t } = useTranslation();
  const Icon = CATEGORY_ICONS[fw.category] ?? BookOpen;
  const colorClass = CATEGORY_COLORS[fw.category] ?? 'bg-muted text-muted-foreground border-border';
  const status = fw.status || 'available';
  const statusClass = STATUS_COLORS[status];

  const totalReqs = fw.requirementsCount || fw.controlCount || 0;
  const applicable = fw.applicableCount || 0;
  const notApplicable = fw.notApplicableCount || 0;
  const notReviewed = fw.notReviewedCount ?? Math.max(0, totalReqs - applicable - notApplicable);

  return (
    <div className="group relative bg-surface border border-border rounded-xl p-5 flex flex-col justify-between gap-4 hover:border-muted-foreground/40 transition-colors shadow-xs">
      {/* Top Header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-green-500/10 border border-green-500/20 shrink-0">
            <Icon size={18} className="text-green-500" />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <span
              className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${colorClass}`}
            >
              {t(`frameworks.category.${fw.category}`, fw.category)}
            </span>
            <select
              value={status}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onStatusChange(fw.id, e.target.value as FrameworkStatus)}
              className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border cursor-pointer focus:outline-none ${statusClass}`}
            >
              <option value="available">Available</option>
              <option value="enabled">Enabled</option>
              <option value="configured">Configured</option>
              <option value="in_assessment">In Assessment</option>
            </select>
          </div>
        </div>

        {/* Title & Description */}
        <div className="space-y-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-foreground leading-snug">{fw.name}</h3>
            <span className="text-[10px] font-medium text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded">
              v{fw.version}
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
            {fw.description}
          </p>
        </div>
      </div>

      {/* Metrics & Footer */}
      <div className="space-y-3 pt-3 border-t border-border">
        {/* Organization Applicability Stats */}
        {status !== 'available' ? (
          <div className="flex items-center justify-between text-[11px] text-muted-foreground flex-wrap gap-2">
            <span className="font-semibold text-foreground">{totalReqs} requirements</span>
            <div className="flex items-center gap-2">
              <span className="text-green-500">{applicable} applicable</span>
              <span>·</span>
              <span className="text-red-400">{notApplicable} N/A</span>
              {notReviewed > 0 && (
                <>
                  <span>·</span>
                  <span className="text-muted-foreground">{notReviewed} not reviewed</span>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{totalReqs} requirements in catalogue</span>
            <span className="text-[10px] bg-muted px-2 py-0.5 rounded">Not enabled</span>
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <span className="text-[10px] text-muted-foreground">
            Last updated: {fw.lastUpdated || '2024'}
          </span>
          <Link
            to="/frameworks/$id"
            params={{ id: fw.id }}
            className="inline-flex items-center gap-1 text-xs font-medium text-green-500 hover:text-green-400 transition-colors"
          >
            {t('frameworks.viewFramework', 'View Framework')}
            <ArrowRight size={12} />
          </Link>
        </div>
      </div>
    </div>
  );
}

export function FrameworksPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notify = useNotify();
  const { activeOrgId } = useActiveOrgStore();
  const orgId = activeOrgId ?? '';

  const { data: frameworks = [], isPending } = useFrameworks(orgId);
  const createMut = useCreateFramework(orgId);
  const updateMut = useUpdateFramework(orgId, '');

  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [activeStatus, setActiveStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'catalogue' | 'custom'>('catalogue');

  // Custom framework form state
  const [customName, setCustomName] = useState('');
  const [customSlug, setCustomSlug] = useState('');
  const [customVersion, setCustomVersion] = useState('1.0');
  const [customCategory, setCustomCategory] = useState<'security' | 'privacy' | 'cloud' | 'risk'>(
    'security',
  );
  const [customDescription, setCustomDescription] = useState('');
  const [customReqsText, setCustomReqsText] = useState('');

  const categories = ['all', 'security', 'privacy', 'cloud', 'risk'] as const;
  const statuses = ['all', 'enabled', 'configured', 'in_assessment', 'available'] as const;

  const filtered = frameworks.filter((f) => {
    const matchesCat = activeCategory === 'all' || f.category === activeCategory;
    const matchesStatus = activeStatus === 'all' || (f.status || 'available') === activeStatus;
    const matchesSearch =
      !searchQuery.trim() ||
      f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.slug.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesStatus && matchesSearch;
  });

  function handleStatusChange(id: string, newStatus: FrameworkStatus) {
    updateMut.mutate(
      { status: newStatus },
      {
        onSuccess: () => {
          notify.success(t('frameworks.statusUpdated', 'Framework status updated'));
        },
      },
    );
  }

  function handleImportPredefined(item: (typeof PREDEFINED_CATALOGUE)[number]) {
    const existing = frameworks.find((f) => f.slug === item.slug);
    if (existing) {
      handleStatusChange(existing.id, 'enabled');
      setCreateOpen(false);
      void navigate({ to: '/frameworks/$id', params: { id: existing.id } });
      return;
    }

    createMut.mutate(
      {
        slug: item.slug,
        name: item.name,
        description: item.description,
        version: item.version,
        category: item.category,
        status: 'enabled',
      },
      {
        onSuccess: (created) => {
          notify.success(t('frameworks.imported', `${item.name} imported into library`));
          setCreateOpen(false);
          void navigate({ to: '/frameworks/$id', params: { id: created.id } });
        },
      },
    );
  }

  function handleCreateCustom() {
    if (!customName.trim()) return;
    const slug = customSlug.trim() || customName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    // Parse optional requirements line by line (Code: Title - Description)
    const reqLines = customReqsText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const requirements = reqLines.map((line, idx) => {
      const parts = line.split(/[:-]/);
      const code = parts[0]?.trim() || `REQ-${idx + 1}`;
      const title = parts[1]?.trim() || `Requirement ${code}`;
      const description = parts.slice(2).join(' ').trim() || title;
      return { code, title, description };
    });

    createMut.mutate(
      {
        slug,
        name: customName,
        description: customDescription,
        version: customVersion,
        category: customCategory,
        status: 'enabled',
        requirements: requirements.length > 0 ? requirements : undefined,
      },
      {
        onSuccess: (created) => {
          notify.success(t('frameworks.customCreated', 'Custom framework created successfully'));
          setCreateOpen(false);
          setCustomName('');
          setCustomSlug('');
          setCustomDescription('');
          setCustomReqsText('');
          void navigate({ to: '/frameworks/$id', params: { id: created.id } });
        },
      },
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Top Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            {t('frameworks.title', 'Compliance Frameworks')}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t(
              'frameworks.subtitle',
              'Authoritative library of regulatory standards and governance control frameworks',
            )}
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="bg-green-600 hover:bg-green-500 text-white gap-1.5 shadow-xs"
        >
          <Plus size={15} />
          {t('frameworks.addFramework', 'Add Framework')}
        </Button>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Categories */}
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={[
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer',
                activeCategory === cat
                  ? 'bg-green-500/10 text-green-500 border border-green-500/20'
                  : 'bg-surface border border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/40',
              ].join(' ')}
            >
              {cat === 'all'
                ? t('frameworks.all', 'All Categories')
                : t(`frameworks.category.${cat}`, cat)}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative min-w-[240px]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('frameworks.searchPlaceholder', 'Search frameworks…')}
            className="h-8 pl-8 text-xs bg-surface"
          />
        </div>
      </div>

      {/* Status Filter Sub-bar */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Status:
        </span>
        {statuses.map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setActiveStatus(st)}
            className={[
              'px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors cursor-pointer',
              activeStatus === st
                ? 'bg-foreground text-background'
                : 'bg-muted/50 text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            <span className="capitalize">{st.replace('_', ' ')}</span>
          </button>
        ))}
      </div>

      {/* Framework Cards Grid */}
      {isPending ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-surface border border-border rounded-xl p-5 h-52 animate-pulse"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-surface border border-dashed border-border rounded-xl space-y-3">
          <BookOpen size={36} className="text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            {t('frameworks.empty', 'No frameworks found matching your filters')}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCreateOpen(true)}
            className="gap-1 text-xs"
          >
            <Plus size={13} />
            Add a Framework
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((fw) => (
            <FrameworkCard
              key={fw.id}
              fw={fw}
              onStatusChange={(id, st) => handleStatusChange(id, st)}
            />
          ))}
        </div>
      )}

      {/* Add / Import Framework Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-2xl bg-surface border-border p-6 space-y-4">
          <DialogHeader className="relative pr-8">
            <DialogTitle className="text-lg font-semibold text-foreground">
              {t('frameworks.addDialogTitle', 'Add Framework to Organization')}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {t(
                'frameworks.addDialogDescription',
                'Select an authoritative framework from the built-in catalogue or import a custom internal standard.',
              )}
            </DialogDescription>
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              aria-label={t('common.closeDialog', 'Close dialog')}
              className="absolute right-0 top-0 rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-green-500/40 cursor-pointer"
            >
              <X size={16} />
              <span className="sr-only">{t('common.closeDialog', 'Close dialog')}</span>
            </button>
          </DialogHeader>

          {/* Dialog Mode Tabs */}
          <div className="flex border-b border-border gap-4 text-xs font-medium">
            <button
              type="button"
              onClick={() => setDialogMode('catalogue')}
              className={[
                'pb-2 border-b-2 transition-colors cursor-pointer',
                dialogMode === 'catalogue'
                  ? 'border-green-500 text-green-500 font-semibold'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {t('frameworks.tabCatalogue', 'Built-in Framework Catalogue')}
            </button>
            <button
              type="button"
              onClick={() => setDialogMode('custom')}
              className={[
                'pb-2 border-b-2 transition-colors cursor-pointer',
                dialogMode === 'custom'
                  ? 'border-green-500 text-green-500 font-semibold'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {t('frameworks.tabCustom', 'Custom / Internal Framework')}
            </button>
          </div>

          {dialogMode === 'catalogue' ? (
            <div className="space-y-4">
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                <div className="grid grid-cols-1 gap-2.5">
                  {PREDEFINED_CATALOGUE.map((item) => {
                    const isAlreadyAdded = frameworks.some((f) => f.slug === item.slug);
                    return (
                      <div
                        key={item.slug}
                        className="p-3.5 rounded-xl border border-border bg-background hover:border-muted-foreground/40 transition-colors flex items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-foreground">
                              {item.name}
                            </span>
                            <span className="text-[10px] bg-muted px-1.5 py-0.2 rounded text-muted-foreground">
                              v{item.version}
                            </span>
                            <span className="text-[10px] uppercase font-semibold text-blue-400 bg-blue-500/10 px-1.5 py-0.2 rounded">
                              {item.category}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-1">
                            {item.description}
                          </p>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span>
                              <strong>{item.requirementsCount}</strong> requirements
                            </span>
                            <span>·</span>
                            <span>
                              <strong>{item.functionsCount}</strong> functions
                            </span>
                            <span>·</span>
                            <span>
                              <strong>{item.categoriesCount}</strong> categories
                            </span>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleImportPredefined(item)}
                          className={[
                            'h-8 text-xs shrink-0 cursor-pointer',
                            isAlreadyAdded
                              ? 'bg-muted text-muted-foreground hover:bg-muted/80'
                              : 'bg-green-600 hover:bg-green-500 text-white',
                          ].join(' ')}
                        >
                          {isAlreadyAdded
                            ? t('frameworks.enableAndOpen', 'Enable & Open')
                            : t('frameworks.importAndEnable', 'Import & Enable')}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
              <DialogFooter className="pt-2 border-t border-border mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCreateOpen(false)}
                  className="h-8 text-xs cursor-pointer"
                >
                  {t('common.close', 'Close')}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      {t('frameworks.formName', 'Framework Name')}
                    </Label>
                    <Input
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder="e.g. Acme Internal Security Baseline"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      {t('frameworks.formVersion', 'Version / Year')}
                    </Label>
                    <Input
                      value={customVersion}
                      onChange={(e) => setCustomVersion(e.target.value)}
                      placeholder="e.g. 1.0 or 2026"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      {t('frameworks.formCategory', 'Category')}
                    </Label>
                    <select
                      value={customCategory}
                      onChange={(e) =>
                        setCustomCategory(
                          e.target.value as 'security' | 'privacy' | 'cloud' | 'risk',
                        )
                      }
                      className="w-full h-8 rounded-lg border border-border bg-background px-3 text-xs text-foreground focus:outline-none"
                    >
                      <option value="security">
                        {t('frameworks.category.security', 'Security')}
                      </option>
                      <option value="privacy">{t('frameworks.category.privacy', 'Privacy')}</option>
                      <option value="cloud">{t('frameworks.category.cloud', 'Cloud')}</option>
                      <option value="risk">{t('frameworks.category.risk', 'Risk')}</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      {t('frameworks.formSlug', 'Identifier Slug (optional)')}
                    </Label>
                    <Input
                      value={customSlug}
                      onChange={(e) => setCustomSlug(e.target.value)}
                      placeholder="acme-isb"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    {t('frameworks.formDescription', 'Description')}
                  </Label>
                  <textarea
                    rows={2}
                    value={customDescription}
                    onChange={(e) => setCustomDescription(e.target.value)}
                    placeholder="Describe the scope, objectives, and authority for this custom framework…"
                    className="w-full text-xs rounded-lg border border-border bg-background p-2.5 text-foreground focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    {t(
                      'frameworks.formRequirements',
                      'Initial Requirements (Optional — 1 per line: CODE: Title - Description)',
                    )}
                  </Label>
                  <textarea
                    rows={4}
                    value={customReqsText}
                    onChange={(e) => setCustomReqsText(e.target.value)}
                    placeholder={`AC-01: Multi-Factor Authentication - Enforce MFA across all employee accounts\nLOG-01: Log Retention - Retain security logs for 365 days`}
                    className="w-full font-mono text-xs rounded-lg border border-border bg-background p-2.5 text-foreground focus:outline-none"
                  />
                </div>
              </div>

              <DialogFooter className="pt-2 border-t border-border mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCreateOpen(false)}
                  className="h-8 text-xs cursor-pointer"
                >
                  {t('common.cancel', 'Cancel')}
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreateCustom}
                  disabled={!customName.trim() || createMut.isPending}
                  className="h-8 text-xs bg-green-600 hover:bg-green-500 text-white cursor-pointer"
                >
                  {createMut.isPending
                    ? t('frameworks.creating', 'Creating…')
                    : t('frameworks.createCustom', 'Create Framework')}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
