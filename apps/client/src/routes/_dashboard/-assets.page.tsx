import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Box,
  Building,
  Cpu,
  Database,
  Download,
  Eye,
  Globe,
  Laptop,
  Layers,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useDraft, useNotify } from '@icore/template-shared';
import type {
  Asset,
  AssetCriticality,
  AssetInput,
  AssetPatch,
  AssetStatus,
  AssetType,
  CiaImpact,
  DataClassification,
} from '@icore/shared';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { EditSheet } from '@/components/EditSheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UnsavedChangesDialog } from '@/components/ui/unsaved-changes-dialog';
import { PageLayout } from '@/components/PageLayout';
import { useActiveOrgStore } from '@/stores/active-org';
import { useAssets, useCreateAsset, useDeleteAsset, useUpdateAsset } from '@/queries/assets';
import { useRisks } from '@/queries/risks';
import { useIssues } from '@/queries/issues';
import { useVendors } from '@/queries/vendors';

// ─── Helpers & Constants ─────────────────────────────────────────────────────

const CRITICALITY_STYLES: Record<
  AssetCriticality,
  { badge: string; pill: string; dot: string; label: string }
> = {
  critical: {
    badge: 'bg-red-500/15 text-red-400 border-red-500/30',
    pill: 'bg-red-500/20 text-red-300 border-red-500/40',
    dot: 'bg-red-500',
    label: 'Critical',
  },
  high: {
    badge: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    pill: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
    dot: 'bg-orange-500',
    label: 'High',
  },
  medium: {
    badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    pill: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    dot: 'bg-amber-500',
    label: 'Medium',
  },
  low: {
    badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    pill: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    dot: 'bg-emerald-500',
    label: 'Low',
  },
};

const STATUS_STYLES: Record<AssetStatus, { badge: string; label: string }> = {
  active: {
    badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    label: 'Active',
  },
  planned: {
    badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    label: 'Planned',
  },
  maintenance: {
    badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    label: 'Maintenance',
  },
  retiring: {
    badge: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    label: 'Retiring',
  },
  retired: {
    badge: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
    label: 'Retired',
  },
};

const CLASSIFICATION_STYLES: Record<DataClassification, { badge: string; label: string }> = {
  restricted: {
    badge: 'bg-red-500/10 text-red-300 border-red-500/20',
    label: 'Restricted',
  },
  confidential: {
    badge: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    label: 'Confidential',
  },
  internal: {
    badge: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
    label: 'Internal',
  },
  public: {
    badge: 'bg-zinc-500/10 text-zinc-300 border-zinc-500/20',
    label: 'Public',
  },
};

const ALL_ASSET_TYPES: AssetType[] = [
  'api',
  'application',
  'database',
  'service',
  'cloud_service',
  'cloud_resource',
  'infrastructure',
  'server',
  'network',
  'endpoint',
  'web_app',
  'data_asset',
  'facility',
  'data',
  'device',
  'other',
];

const DATA_TYPES_CONFIG: Array<{ id: string; key: string; color: string }> = [
  {
    id: 'pii',
    key: 'assets.dataTypes.pii',
    color: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
  },
  {
    id: 'phi',
    key: 'assets.dataTypes.phi',
    color: 'text-rose-300 bg-rose-500/10 border-rose-500/20',
  },
  { id: 'pci', key: 'assets.dataTypes.pci', color: 'text-red-300 bg-red-500/10 border-red-500/20' },
  {
    id: 'financial',
    key: 'assets.dataTypes.financial',
    color: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
  },
  {
    id: 'credentials',
    key: 'assets.dataTypes.credentials',
    color: 'text-violet-300 bg-violet-500/10 border-violet-500/20',
  },
  {
    id: 'customer_data',
    key: 'assets.dataTypes.customer_data',
    color: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20',
  },
  {
    id: 'employee_data',
    key: 'assets.dataTypes.employee_data',
    color: 'text-blue-300 bg-blue-500/10 border-blue-500/20',
  },
  {
    id: 'intellectual_property',
    key: 'assets.dataTypes.intellectual_property',
    color: 'text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-500/20',
  },
];

function computeCiaCriticality(c?: CiaImpact, i?: CiaImpact, a?: CiaImpact): AssetCriticality {
  const levels = [c, i, a].filter(Boolean) as CiaImpact[];
  if (levels.includes('critical')) return 'critical';
  if (levels.includes('high')) return 'high';
  if (levels.includes('moderate')) return 'medium';
  return 'low';
}

function getAssetTypeIcon(type: AssetType) {
  switch (type) {
    case 'database':
      return Database;
    case 'api':
      return Cpu;
    case 'web_app':
    case 'application':
      return Globe;
    case 'cloud_service':
    case 'cloud_resource':
      return Layers;
    case 'network':
      return Network;
    case 'endpoint':
    case 'device':
      return Laptop;
    case 'facility':
      return Building;
    case 'service':
      return Server;
    default:
      return Box;
  }
}

const EMPTY_ASSET_FORM: AssetInput = {
  name: '',
  code: '',
  type: 'service',
  criticality: 'medium',
  status: 'active',
  owner: '',
  businessOwner: '',
  technicalOwner: '',
  department: '',
  description: '',
  dataClassification: 'internal',
  dataTypes: [],
  ciaConfidentiality: 'moderate',
  ciaIntegrity: 'moderate',
  ciaAvailability: 'moderate',
  hostingType: 'cloud',
  environment: 'production',
  location: '',
  internetFacing: false,
  isProduction: true,
  vendorName: '',
  complianceScope: [],
  tags: [],
  relatedAssetIds: [],
};

// ─── Main Assets Page Component ──────────────────────────────────────────────

export function AssetsPage() {
  const { t } = useTranslation();
  const { activeOrgId } = useActiveOrgStore();
  const orgId = activeOrgId ?? '';

  const { data: assets = [], isPending } = useAssets(orgId);
  const { data: risks = [] } = useRisks(orgId);
  const { data: issues = [] } = useIssues(orgId);
  const { data: vendors = [] } = useVendors(orgId);

  const createMut = useCreateAsset(orgId);
  const updateMut = useUpdateAsset(orgId);
  const deleteMut = useDeleteAsset(orgId);
  const notify = useNotify();

  // Dialog & Sheet States
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [viewingAssetId, setViewingAssetId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [criticalityFilter, setCriticalityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [classificationFilter, setClassificationFilter] = useState<string>('all');
  const [environmentFilter, setEnvironmentFilter] = useState<string>('all');

  // Creation Form State
  const [createForm, setCreateForm] = useState<AssetInput>(EMPTY_ASSET_FORM);
  const [createTab, setCreateTab] = useState<'basic' | 'classification' | 'tech'>('basic');
  const isCreateDirty =
    createOpen && JSON.stringify(createForm) !== JSON.stringify(EMPTY_ASSET_FORM);
  const createDraft = useDraft(isCreateDirty);

  // Edit Form State
  const [editForm, setEditForm] = useState<AssetPatch>({});
  const [editSnapshot, setEditSnapshot] = useState<Asset | null>(null);
  const [editTab, setEditTab] = useState<'basic' | 'classification' | 'tech'>('basic');
  const isEditDirty =
    editingId !== null &&
    JSON.stringify(editForm) !== JSON.stringify(editSnapshot ? { ...editSnapshot } : {});
  const editDraft = useDraft(isEditDirty);

  // Active Viewing Asset
  const viewingAsset = useMemo(
    () => assets.find((a) => a.id === viewingAssetId) || null,
    [assets, viewingAssetId],
  );
  const [profileTab, setProfileTab] = useState<
    | 'overview'
    | 'relationships'
    | 'controls'
    | 'risks'
    | 'issues'
    | 'compliance'
    | 'evidence'
    | 'activity'
  >('overview');

  // Metrics computation
  const metrics = useMemo(() => {
    const total = assets.length;
    const critical = assets.filter((a) => a.criticality === 'critical').length;
    const highRisks = assets.filter((a) => {
      const assetRisks = risks.filter(
        (r) => r.assetId === a.id || (a.code && r.description?.includes(a.code)),
      );
      return assetRisks.some(
        (r) => r.impact === 'high' || r.impact === 'very_high' || r.riskScore >= 12,
      );
    }).length;
    const production = assets.filter(
      (a) => a.isProduction || a.environment === 'production',
    ).length;
    const internetFacing = assets.filter((a) => a.internetFacing).length;
    const unassigned = assets.filter(
      (a) => !a.owner && !a.businessOwner && !a.technicalOwner,
    ).length;
    const withOpenIssues = assets.filter((a) => {
      return issues.some(
        (i) =>
          i.status !== 'resolved' &&
          i.status !== 'wont_fix' &&
          (i.affectedAssets?.includes(a.name) || (a.code && i.affectedAssets?.includes(a.code))),
      );
    }).length;

    return {
      total,
      critical,
      highRisks,
      production,
      internetFacing,
      unassigned,
      withOpenIssues,
    };
  }, [assets, risks, issues]);

  // Filtered Assets
  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = asset.name.toLowerCase().includes(q);
        const matchesCode = asset.code?.toLowerCase().includes(q);
        const matchesDesc = asset.description?.toLowerCase().includes(q);
        const matchesOwner =
          asset.owner?.toLowerCase().includes(q) ||
          asset.businessOwner?.toLowerCase().includes(q) ||
          asset.technicalOwner?.toLowerCase().includes(q) ||
          asset.department?.toLowerCase().includes(q);
        const matchesTags = asset.tags?.some((t) => t.toLowerCase().includes(q));
        if (!matchesName && !matchesCode && !matchesDesc && !matchesOwner && !matchesTags) {
          return false;
        }
      }
      if (typeFilter !== 'all' && asset.type !== typeFilter) return false;
      if (criticalityFilter !== 'all' && asset.criticality !== criticalityFilter) return false;
      if (statusFilter !== 'all' && (asset.status || 'active') !== statusFilter) return false;
      if (
        classificationFilter !== 'all' &&
        (asset.dataClassification || 'internal') !== classificationFilter
      )
        return false;
      if (environmentFilter !== 'all' && (asset.environment || 'production') !== environmentFilter)
        return false;

      return true;
    });
  }, [
    assets,
    searchQuery,
    typeFilter,
    criticalityFilter,
    statusFilter,
    classificationFilter,
    environmentFilter,
  ]);

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    typeFilter !== 'all' ||
    criticalityFilter !== 'all' ||
    statusFilter !== 'all' ||
    classificationFilter !== 'all' ||
    environmentFilter !== 'all';

  function resetFilters() {
    setSearchQuery('');
    setTypeFilter('all');
    setCriticalityFilter('all');
    setStatusFilter('all');
    setClassificationFilter('all');
    setEnvironmentFilter('all');
  }

  // Handle Create Submit
  function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.name.trim()) return;

    const payload: AssetInput = {
      ...createForm,
      owner: createForm.owner || createForm.businessOwner || '',
    };

    createMut.mutate(payload, {
      onSuccess: () => {
        setCreateOpen(false);
        setCreateForm(EMPTY_ASSET_FORM);
        setCreateTab('basic');
        notify.success(t('assets.created'));
      },
      onError: () => notify.error(t('error.unknown')),
    });
  }

  // Handle Edit Submit
  function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    if (!editForm.name?.trim()) return;

    updateMut.mutate(
      { id: editingId, patch: editForm },
      {
        onSuccess: () => {
          setEditingId(null);
          setEditSnapshot(null);
          setEditTab('basic');
          notify.success(t('assets.updated'));
        },
        onError: () => notify.error(t('error.unknown')),
      },
    );
  }

  // Start Edit
  function startEdit(asset: Asset) {
    setEditingId(asset.id);
    setEditSnapshot(asset);
    setEditForm({ ...asset });
    setEditTab('basic');
  }

  // Download CSV template
  function downloadCsvTemplate() {
    const headers = [
      'name',
      'code',
      'type',
      'criticality',
      'status',
      'owner',
      'businessOwner',
      'technicalOwner',
      'department',
      'description',
      'dataClassification',
      'dataTypes',
      'ciaConfidentiality',
      'ciaIntegrity',
      'ciaAvailability',
      'hostingType',
      'environment',
      'location',
      'internetFacing',
      'isProduction',
      'vendorName',
      'complianceScope',
    ];
    const sampleRow = [
      'Customer Payment API',
      'AST-000101',
      'api',
      'critical',
      'active',
      'Digital Banking',
      'Digital Banking',
      'Platform Engineering',
      'Engineering',
      'Core payment checkout microservice',
      'restricted',
      'pii;pci;financial',
      'critical',
      'critical',
      'critical',
      'cloud',
      'production',
      'AWS us-east-1',
      'true',
      'true',
      'AWS / Stripe',
      'PCI DSS;SOC 2;NIST CSF 2.0',
    ];
    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers.join(','), sampleRow.join(',')].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'complianceiq_assets_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <PageLayout
      title={t('nav.assets')}
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={downloadCsvTemplate}
            className="hidden sm:flex items-center gap-1.5"
          >
            <Download className="w-4 h-4 text-muted-foreground" />
            <span>{t('assets.downloadTemplate')}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-1.5"
          >
            <Upload className="w-4 h-4 text-muted-foreground" />
            <span>{t('assets.importAssets')}</span>
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setCreateForm(EMPTY_ASSET_FORM);
              setCreateTab('basic');
              setCreateOpen(true);
            }}
            className="flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>{t('assets.addAsset')}</span>
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Header Subtitle */}
        <div>
          <p className="text-sm text-muted-foreground">{t('assets.subtitle')}</p>
        </div>

        {/* KPI Metrics Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="rounded-lg border bg-card/60 p-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {t('assets.summary.total')}
              </span>
              <Box className="w-4 h-4 text-primary" />
            </div>
            <div className="text-2xl font-bold mt-1.5">{metrics.total}</div>
          </div>

          <div className="rounded-lg border bg-card/60 p-3.5 shadow-sm border-red-500/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {t('assets.summary.critical')}
              </span>
              <ShieldAlert className="w-4 h-4 text-red-400" />
            </div>
            <div className="text-2xl font-bold mt-1.5 text-red-400">{metrics.critical}</div>
          </div>

          <div className="rounded-lg border bg-card/60 p-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {t('assets.summary.highRisk')}
              </span>
              <AlertTriangle className="w-4 h-4 text-orange-400" />
            </div>
            <div className="text-2xl font-bold mt-1.5 text-orange-400">{metrics.highRisks}</div>
          </div>

          <div className="rounded-lg border bg-card/60 p-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {t('assets.summary.production')}
              </span>
              <Server className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-bold mt-1.5">{metrics.production}</div>
          </div>

          <div className="rounded-lg border bg-card/60 p-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {t('assets.summary.internetFacing')}
              </span>
              <Globe className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-2xl font-bold mt-1.5">{metrics.internetFacing}</div>
          </div>

          <div className="rounded-lg border bg-card/60 p-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {t('assets.summary.openIssues')}
              </span>
              <AlertCircle className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-bold mt-1.5 text-amber-400">{metrics.withOpenIssues}</div>
          </div>
        </div>

        {/* Search & Multi-filter Toolbar */}
        <div className="rounded-lg border bg-card/40 p-3.5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
            {/* Search Input */}
            <div className="lg:col-span-2">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('assets.searchPlaceholder')}
                className="h-9 text-xs"
              />
            </div>

            {/* Type Filter */}
            <div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder={t('assets.typeLabel')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t('frameworks.status.available') === 'Available'
                      ? 'All Types'
                      : 'Todos los tipos'}
                  </SelectItem>
                  {ALL_ASSET_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {t(`assets.type.${type}` as never, { defaultValue: type })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Criticality Filter */}
            <div>
              <Select value={criticalityFilter} onValueChange={setCriticalityFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder={t('assets.criticality.label')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t('frameworks.status.available') === 'Available'
                      ? 'All Criticalities'
                      : 'Toda criticidad'}
                  </SelectItem>
                  <SelectItem value="critical">{t('assets.criticality.critical')}</SelectItem>
                  <SelectItem value="high">{t('assets.criticality.high')}</SelectItem>
                  <SelectItem value="medium">{t('assets.criticality.medium')}</SelectItem>
                  <SelectItem value="low">{t('assets.criticality.low')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Status Filter */}
            <div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder={t('assets.statusLabel')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t('frameworks.status.available') === 'Available'
                      ? 'All Statuses'
                      : 'Todos los estados'}
                  </SelectItem>
                  <SelectItem value="active">{t('assets.status.active')}</SelectItem>
                  <SelectItem value="planned">{t('assets.status.planned')}</SelectItem>
                  <SelectItem value="maintenance">{t('assets.status.maintenance')}</SelectItem>
                  <SelectItem value="retiring">{t('assets.status.retiring')}</SelectItem>
                  <SelectItem value="retired">{t('assets.status.retired')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Classification Filter */}
            <div>
              <Select value={classificationFilter} onValueChange={setClassificationFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder={t('assets.classification.label')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t('frameworks.status.available') === 'Available'
                      ? 'All Classifications'
                      : 'Todas las clasif.'}
                  </SelectItem>
                  <SelectItem value="restricted">
                    {t('assets.classification.restricted')}
                  </SelectItem>
                  <SelectItem value="confidential">
                    {t('assets.classification.confidential')}
                  </SelectItem>
                  <SelectItem value="internal">{t('assets.classification.internal')}</SelectItem>
                  <SelectItem value="public">{t('assets.classification.public')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {hasActiveFilters && (
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t">
              <span>
                Showing <strong>{filteredAssets.length}</strong> of <strong>{assets.length}</strong>{' '}
                assets
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5 mr-1" />
                Reset filters
              </Button>
            </div>
          )}
        </div>

        {/* Asset Register Table */}
        {isPending ? (
          <div className="rounded-lg border bg-card p-12 text-center text-sm text-muted-foreground">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
            {t('common.loading', { defaultValue: 'Loading assets…' })}
          </div>
        ) : filteredAssets.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-card/40 p-12 text-center">
            <Box className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <h3 className="font-semibold text-foreground text-sm">
              {assets.length === 0 ? t('assets.empty') : 'No matching assets found'}
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              {assets.length === 0
                ? t('assets.addDescription')
                : 'Try adjusting your search criteria or clear active filters.'}
            </p>
            {assets.length === 0 ? (
              <div className="mt-4 flex items-center justify-center gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setCreateForm(EMPTY_ASSET_FORM);
                    setCreateTab('basic');
                    setCreateOpen(true);
                  }}
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  {t('assets.addAsset')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                  <Upload className="w-4 h-4 mr-1.5" />
                  {t('assets.importAssets')}
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={resetFilters} className="mt-3">
                Reset filters
              </Button>
            )}
          </div>
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 border-b text-muted-foreground font-medium">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Asset / Name</th>
                    <th className="py-3 px-3 font-semibold">Type</th>
                    <th className="py-3 px-3 font-semibold">Criticality & CIA</th>
                    <th className="py-3 px-3 font-semibold">Data Classification</th>
                    <th className="py-3 px-3 font-semibold">Ownership</th>
                    <th className="py-3 px-3 font-semibold">Env & Status</th>
                    <th className="py-3 px-3 font-semibold">GRC Posture</th>
                    <th className="py-3 px-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredAssets.map((asset) => {
                    const TypeIcon = getAssetTypeIcon(asset.type);
                    const critStyle =
                      CRITICALITY_STYLES[asset.criticality] || CRITICALITY_STYLES.medium;
                    const statusStyle =
                      STATUS_STYLES[asset.status || 'active'] || STATUS_STYLES.active;
                    const classStyle =
                      CLASSIFICATION_STYLES[asset.dataClassification || 'internal'] ||
                      CLASSIFICATION_STYLES.internal;

                    // Compute linked risks & issues count
                    const assetRisks = risks.filter(
                      (r) =>
                        r.assetId === asset.id ||
                        (asset.code && r.description?.includes(asset.code)),
                    );
                    const assetIssues = issues.filter(
                      (i) =>
                        i.status !== 'resolved' &&
                        i.status !== 'wont_fix' &&
                        (i.affectedAssets?.includes(asset.name) ||
                          (asset.code && i.affectedAssets?.includes(asset.code))),
                    );

                    return (
                      <tr
                        key={asset.id}
                        onClick={() => {
                          setViewingAssetId(asset.id);
                          setProfileTab('overview');
                        }}
                        className="hover:bg-muted/30 transition-colors cursor-pointer group"
                      >
                        {/* Asset Name & Code */}
                        <td className="py-3 px-4">
                          <div className="flex items-start gap-2.5">
                            <div className="w-7 h-7 rounded-md bg-muted/70 flex items-center justify-center shrink-0 mt-0.5 group-hover:border-primary/40 border border-transparent transition-colors">
                              <TypeIcon className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-foreground truncate hover:text-primary">
                                  {asset.name}
                                </span>
                                {asset.internetFacing && (
                                  <span
                                    title="Internet Facing"
                                    className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20 shrink-0"
                                  >
                                    Public
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                                <span className="font-mono text-muted-foreground/80">
                                  {asset.code || 'AST-—'}
                                </span>
                                {asset.department && (
                                  <>
                                    <span>·</span>
                                    <span className="truncate">{asset.department}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Type */}
                        <td className="py-3 px-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-muted/60 text-foreground border border-border/60">
                            {t(`assets.type.${asset.type}` as never, {
                              defaultValue: asset.type,
                            })}
                          </span>
                        </td>

                        {/* Criticality & CIA */}
                        <td className="py-3 px-3">
                          <div className="space-y-1">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold border ${critStyle.badge}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${critStyle.dot}`} />
                              {t(`assets.criticality.${asset.criticality}` as never, {
                                defaultValue: asset.criticality,
                              })}
                            </span>
                            <div className="text-[10px] text-muted-foreground/80 font-mono">
                              C:{asset.ciaConfidentiality?.[0]?.toUpperCase() || 'M'} I:
                              {asset.ciaIntegrity?.[0]?.toUpperCase() || 'M'} A:
                              {asset.ciaAvailability?.[0]?.toUpperCase() || 'M'}
                            </div>
                          </div>
                        </td>

                        {/* Data Classification & Types */}
                        <td className="py-3 px-3">
                          <div className="space-y-1">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border ${classStyle.badge}`}
                            >
                              {t(
                                `assets.classification.${asset.dataClassification || 'internal'}` as never,
                                { defaultValue: asset.dataClassification || 'Internal' },
                              )}
                            </span>
                            {asset.dataTypes && asset.dataTypes.length > 0 && (
                              <div className="flex flex-wrap gap-1 max-w-[160px]">
                                {asset.dataTypes.slice(0, 2).map((dt) => (
                                  <span
                                    key={dt}
                                    className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-muted/80 text-muted-foreground border border-border/40 uppercase"
                                  >
                                    {dt}
                                  </span>
                                ))}
                                {asset.dataTypes.length > 2 && (
                                  <span className="text-[9px] text-muted-foreground self-center">
                                    +{asset.dataTypes.length - 2}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Ownership */}
                        <td className="py-3 px-3">
                          <div className="space-y-0.5">
                            <div className="font-medium text-foreground truncate max-w-[130px]">
                              {asset.businessOwner || asset.owner || (
                                <span className="text-muted-foreground/50 italic">Unassigned</span>
                              )}
                            </div>
                            {asset.technicalOwner && (
                              <div className="text-[11px] text-muted-foreground truncate max-w-[130px]">
                                Tech: {asset.technicalOwner}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Env & Status */}
                        <td className="py-3 px-3">
                          <div className="space-y-1">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${statusStyle.badge}`}
                            >
                              {t(`assets.status.${asset.status || 'active'}` as never, {
                                defaultValue: asset.status || 'Active',
                              })}
                            </span>
                            <div className="text-[10px] text-muted-foreground capitalize">
                              {asset.environment || 'Production'}
                            </div>
                          </div>
                        </td>

                        {/* GRC Posture (Risks & Issues) */}
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            {assetRisks.length > 0 ? (
                              <span
                                title={`${assetRisks.length} open risks linked`}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-orange-400 bg-orange-500/10 border border-orange-500/20 px-1.5 py-0.5 rounded"
                              >
                                <AlertTriangle className="w-3 h-3" />
                                {assetRisks.length}
                              </span>
                            ) : (
                              <span
                                title="No open risks"
                                className="inline-flex items-center text-[11px] text-emerald-400/80 bg-emerald-500/5 px-1.5 py-0.5 rounded"
                              >
                                <ShieldCheck className="w-3 h-3 mr-0.5" /> 0
                              </span>
                            )}

                            {assetIssues.length > 0 && (
                              <span
                                title={`${assetIssues.length} open issues`}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded"
                              >
                                <AlertCircle className="w-3 h-3" />
                                {assetIssues.length}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-3 text-right">
                          <div
                            className="flex items-center justify-end gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              variant="ghost"
                              size="sm"
                              title="View Profile"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                              onClick={() => {
                                setViewingAssetId(asset.id);
                                setProfileTab('overview');
                              }}
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span className="sr-only">View</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              title={t('common.edit', { defaultValue: 'Edit' })}
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                              onClick={() => startEdit(asset)}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              <span className="sr-only">Edit</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              title={t('common.delete', { defaultValue: 'Delete' })}
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                              onClick={() => setConfirmDeleteId(asset.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span className="sr-only">Delete</span>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ─── 1. NEW ASSET DIALOG (Dialog) ─────────────────────────────────── */}
      <Dialog
        open={createOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen && isCreateDirty) {
            createDraft.requestClose(() => {
              setCreateOpen(false);
              setCreateForm(EMPTY_ASSET_FORM);
              setCreateTab('basic');
            });
          } else {
            setCreateOpen(isOpen);
            if (!isOpen) {
              setCreateForm(EMPTY_ASSET_FORM);
              setCreateTab('basic');
            }
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="p-5 pb-3 border-b">
            <DialogTitle>{t('assets.addAsset')}</DialogTitle>
            <DialogDescription className="text-xs">{t('assets.addDescription')}</DialogDescription>

            {/* Stepper Tabs in Dialog Header */}
            <div className="flex items-center gap-2 pt-3">
              <button
                type="button"
                onClick={() => setCreateTab('basic')}
                className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
                  createTab === 'basic'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {t('assets.stepBasic')}
              </button>
              <button
                type="button"
                onClick={() => setCreateTab('classification')}
                className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
                  createTab === 'classification'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {t('assets.stepClassification')}
              </button>
              <button
                type="button"
                onClick={() => setCreateTab('tech')}
                className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
                  createTab === 'tech'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {t('assets.stepTech')}
              </button>
            </div>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* Step 1: Basic Information */}
              {createTab === 'basic' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2 space-y-1.5">
                      <Label htmlFor="create-name">
                        {t('assets.name')} <span className="text-red-400">*</span>
                      </Label>
                      <Input
                        id="create-name"
                        value={createForm.name}
                        onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder={t('assets.namePlaceholder')}
                        required
                        autoFocus
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="create-code">{t('assets.code')}</Label>
                      <Input
                        id="create-code"
                        value={createForm.code || ''}
                        onChange={(e) => setCreateForm((f) => ({ ...f, code: e.target.value }))}
                        placeholder="e.g. AST-000127"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>{t('assets.typeLabel')} *</Label>
                      <Select
                        value={createForm.type}
                        onValueChange={(v) =>
                          setCreateForm((f) => ({ ...f, type: v as AssetType }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ALL_ASSET_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {t(`assets.type.${type}` as never, {
                                defaultValue: type,
                              })}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label>{t('assets.statusLabel')}</Label>
                      <Select
                        value={createForm.status || 'active'}
                        onValueChange={(v) =>
                          setCreateForm((f) => ({
                            ...f,
                            status: v as AssetStatus,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">{t('assets.status.active')}</SelectItem>
                          <SelectItem value="planned">{t('assets.status.planned')}</SelectItem>
                          <SelectItem value="maintenance">
                            {t('assets.status.maintenance')}
                          </SelectItem>
                          <SelectItem value="retiring">{t('assets.status.retiring')}</SelectItem>
                          <SelectItem value="retired">{t('assets.status.retired')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="create-b-owner">{t('assets.businessOwner')} *</Label>
                      <Input
                        id="create-b-owner"
                        value={createForm.businessOwner || createForm.owner || ''}
                        onChange={(e) =>
                          setCreateForm((f) => ({
                            ...f,
                            businessOwner: e.target.value,
                            owner: e.target.value,
                          }))
                        }
                        placeholder={t('assets.businessOwnerPlaceholder')}
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="create-t-owner">{t('assets.technicalOwner')}</Label>
                      <Input
                        id="create-t-owner"
                        value={createForm.technicalOwner || ''}
                        onChange={(e) =>
                          setCreateForm((f) => ({
                            ...f,
                            technicalOwner: e.target.value,
                          }))
                        }
                        placeholder={t('assets.technicalOwnerPlaceholder')}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="create-dept">{t('assets.department')}</Label>
                      <Input
                        id="create-dept"
                        value={createForm.department || ''}
                        onChange={(e) =>
                          setCreateForm((f) => ({
                            ...f,
                            department: e.target.value,
                          }))
                        }
                        placeholder={t('assets.departmentPlaceholder')}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="create-desc">{t('assets.description')}</Label>
                    <Textarea
                      id="create-desc"
                      rows={3}
                      value={createForm.description}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          description: e.target.value,
                        }))
                      }
                      placeholder={t('assets.descriptionPlaceholder')}
                    />
                  </div>
                </div>
              )}

              {/* Step 2: Classification & CIA Calculator */}
              {createTab === 'classification' && (
                <div className="space-y-5">
                  {/* CIA Impact Calculator Box */}
                  <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                    <div className="flex items-center justify-between border-b pb-2">
                      <div>
                        <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                          <Shield className="w-4 h-4 text-primary" />
                          {t('assets.cia.title')}
                        </h4>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {t('assets.cia.subtitle')}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-muted-foreground block">
                          {t('assets.cia.calculated')}
                        </span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase border ${
                            CRITICALITY_STYLES[createForm.criticality].badge
                          }`}
                        >
                          {t(`assets.criticality.${createForm.criticality}` as never, {
                            defaultValue: createForm.criticality,
                          })}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                      {/* Confidentiality */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium">
                          {t('assets.cia.confidentiality')}
                        </Label>
                        <Select
                          value={createForm.ciaConfidentiality || 'moderate'}
                          onValueChange={(v) => {
                            const newCia = v as CiaImpact;
                            const newCrit = computeCiaCriticality(
                              newCia,
                              createForm.ciaIntegrity,
                              createForm.ciaAvailability,
                            );
                            setCreateForm((f) => ({
                              ...f,
                              ciaConfidentiality: newCia,
                              criticality: newCrit,
                            }));
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="moderate">Moderate</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="critical">Critical</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-[10px] text-muted-foreground">
                          {t('assets.cia.confidentialityDesc')}
                        </p>
                      </div>

                      {/* Integrity */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium">{t('assets.cia.integrity')}</Label>
                        <Select
                          value={createForm.ciaIntegrity || 'moderate'}
                          onValueChange={(v) => {
                            const newInt = v as CiaImpact;
                            const newCrit = computeCiaCriticality(
                              createForm.ciaConfidentiality,
                              newInt,
                              createForm.ciaAvailability,
                            );
                            setCreateForm((f) => ({
                              ...f,
                              ciaIntegrity: newInt,
                              criticality: newCrit,
                            }));
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="moderate">Moderate</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="critical">Critical</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-[10px] text-muted-foreground">
                          {t('assets.cia.integrityDesc')}
                        </p>
                      </div>

                      {/* Availability */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium">
                          {t('assets.cia.availability')}
                        </Label>
                        <Select
                          value={createForm.ciaAvailability || 'moderate'}
                          onValueChange={(v) => {
                            const newAvail = v as CiaImpact;
                            const newCrit = computeCiaCriticality(
                              createForm.ciaConfidentiality,
                              createForm.ciaIntegrity,
                              newAvail,
                            );
                            setCreateForm((f) => ({
                              ...f,
                              ciaAvailability: newAvail,
                              criticality: newCrit,
                            }));
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="moderate">Moderate</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="critical">Critical</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-[10px] text-muted-foreground">
                          {t('assets.cia.availabilityDesc')}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Data Classification */}
                  <div className="space-y-2">
                    <Label>{t('assets.classification.label')}</Label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(
                        ['public', 'internal', 'confidential', 'restricted'] as DataClassification[]
                      ).map((level) => {
                        const isSelected = (createForm.dataClassification || 'internal') === level;
                        const style = CLASSIFICATION_STYLES[level];
                        return (
                          <button
                            type="button"
                            key={level}
                            onClick={() =>
                              setCreateForm((f) => ({
                                ...f,
                                dataClassification: level,
                              }))
                            }
                            className={`p-2.5 rounded-lg border text-left transition-all ${
                              isSelected
                                ? `${style.badge} ring-1 ring-primary/40 font-semibold`
                                : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted'
                            }`}
                          >
                            <div className="text-xs capitalize font-semibold">
                              {t(`assets.classification.${level}` as never, {
                                defaultValue: level,
                              })}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Data Types */}
                  <div className="space-y-2">
                    <Label>{t('assets.dataTypes.label')}</Label>
                    <div className="flex flex-wrap gap-2">
                      {DATA_TYPES_CONFIG.map((dt) => {
                        const isChecked = createForm.dataTypes?.includes(dt.id);
                        return (
                          <button
                            type="button"
                            key={dt.id}
                            onClick={() => {
                              const curr = createForm.dataTypes || [];
                              const next = isChecked
                                ? curr.filter((x) => x !== dt.id)
                                : [...curr, dt.id];
                              setCreateForm((f) => ({ ...f, dataTypes: next }));
                            }}
                            className={`px-2.5 py-1 rounded-md text-xs border font-medium transition-all ${
                              isChecked
                                ? `${dt.color} ring-1 ring-primary/30`
                                : 'bg-muted/30 text-muted-foreground border-border hover:bg-muted/60'
                            }`}
                          >
                            {isChecked && '✓ '}
                            {t(dt.key as never, { defaultValue: dt.id })}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Technology & Relationships */}
              {createTab === 'tech' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>{t('assets.tech.hostingType')}</Label>
                      <Select
                        value={createForm.hostingType || 'cloud'}
                        onValueChange={(v) => setCreateForm((f) => ({ ...f, hostingType: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cloud">{t('assets.tech.hostingCloud')}</SelectItem>
                          <SelectItem value="saas">{t('assets.tech.hostingSaas')}</SelectItem>
                          <SelectItem value="on_prem">{t('assets.tech.hostingOnPrem')}</SelectItem>
                          <SelectItem value="hybrid">{t('assets.tech.hostingHybrid')}</SelectItem>
                          <SelectItem value="colocation">
                            {t('assets.tech.hostingColocation')}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label>{t('assets.tech.environment')}</Label>
                      <Select
                        value={createForm.environment || 'production'}
                        onValueChange={(v) =>
                          setCreateForm((f) => ({
                            ...f,
                            environment: v,
                            isProduction: v === 'production',
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="production">
                            {t('assets.tech.envProduction')}
                          </SelectItem>
                          <SelectItem value="staging">{t('assets.tech.envStaging')}</SelectItem>
                          <SelectItem value="development">
                            {t('assets.tech.envDevelopment')}
                          </SelectItem>
                          <SelectItem value="qa">{t('assets.tech.envQa')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="create-loc">{t('assets.tech.location')}</Label>
                      <Input
                        id="create-loc"
                        value={createForm.location || ''}
                        onChange={(e) =>
                          setCreateForm((f) => ({
                            ...f,
                            location: e.target.value,
                          }))
                        }
                        placeholder={t('assets.tech.locationPlaceholder')}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label>{t('assets.tech.vendor')}</Label>
                      <Select
                        value={createForm.vendorId || 'none'}
                        onValueChange={(v) => {
                          const selectedVendor = vendors.find((vend) => vend.id === v);
                          setCreateForm((f) => ({
                            ...f,
                            vendorId: v === 'none' ? null : v,
                            vendorName: selectedVendor?.name || '',
                          }));
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('assets.tech.selectVendor')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None / Internal</SelectItem>
                          {vendors.map((vend) => (
                            <SelectItem key={vend.id} value={vend.id}>
                              {vend.name} ({vend.domain || vend.tier})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="create-scope">{t('assets.tech.complianceScope')}</Label>
                    <Input
                      id="create-scope"
                      value={createForm.complianceScope?.join(', ') || ''}
                      onChange={(e) => {
                        const arr = e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean);
                        setCreateForm((f) => ({ ...f, complianceScope: arr }));
                      }}
                      placeholder={t('assets.tech.complianceScopePlaceholder')}
                    />
                  </div>

                  <div className="flex items-center gap-6 pt-2">
                    <label className="flex items-center gap-2 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={Boolean(createForm.internetFacing)}
                        onChange={(e) =>
                          setCreateForm((f) => ({
                            ...f,
                            internetFacing: e.target.checked,
                          }))
                        }
                        className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                      />
                      <span className="font-medium text-foreground">
                        {t('assets.tech.internetFacing')}
                      </span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={Boolean(createForm.isProduction)}
                        onChange={(e) =>
                          setCreateForm((f) => ({
                            ...f,
                            isProduction: e.target.checked,
                          }))
                        }
                        className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                      />
                      <span className="font-medium text-foreground">
                        {t('assets.tech.isProduction')}
                      </span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="p-4 border-t bg-muted/20 gap-2">
              <div className="flex items-center justify-between w-full">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (createTab === 'tech') setCreateTab('classification');
                    else if (createTab === 'classification') setCreateTab('basic');
                    else setCreateOpen(false);
                  }}
                >
                  {createTab === 'basic' ? t('common.cancel', { defaultValue: 'Cancel' }) : 'Back'}
                </Button>

                <div className="flex items-center gap-2">
                  {createTab !== 'tech' ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        if (createTab === 'basic') setCreateTab('classification');
                        else if (createTab === 'classification') setCreateTab('tech');
                      }}
                    >
                      Next <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      size="sm"
                      disabled={createMut.isPending || !createForm.name.trim()}
                    >
                      {createMut.isPending ? 'Saving…' : t('assets.addAsset')}
                    </Button>
                  )}
                </div>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── 2. EDIT ASSET SHEET (Sheet) ─────────────────────────────────── */}
      <EditSheet
        open={editingId !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen && isEditDirty) {
            editDraft.requestClose(() => {
              setEditingId(null);
              setEditSnapshot(null);
            });
          } else if (!isOpen) {
            setEditingId(null);
            setEditSnapshot(null);
          }
        }}
        title={t('assets.editTitle')}
        description={editForm.code ? `Editing ${editForm.code}` : undefined}
      >
        <form onSubmit={handleEditSubmit} className="space-y-5 pb-6">
          {/* Retirement Checklist Banner if status is retiring / retired */}
          {(editForm.status === 'retiring' || editForm.status === 'retired') && (
            <div className="rounded-lg border border-purple-500/30 bg-purple-500/10 p-3.5 space-y-2 text-xs">
              <div className="flex items-center gap-2 font-semibold text-purple-300">
                <AlertTriangle className="w-4 h-4 text-purple-400 shrink-0" />
                {t('assets.retirement.title')}
              </div>
              <p className="text-[11px] text-purple-200/80">{t('assets.retirement.warning')}</p>
              <ul className="list-disc pl-4 space-y-1 text-[11px] text-purple-200/90">
                <li>{t('assets.retirement.checkOpenRisks')}</li>
                <li>{t('assets.retirement.checkOpenIssues')}</li>
                <li>{t('assets.retirement.checkDataWiping')}</li>
              </ul>
            </div>
          )}

          {/* Stepper Tabs in Edit Sheet */}
          <div className="flex items-center gap-1.5 border-b pb-2">
            <button
              type="button"
              onClick={() => setEditTab('basic')}
              className={`text-xs px-2.5 py-1 rounded font-medium ${
                editTab === 'basic'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/70 text-muted-foreground'
              }`}
            >
              1. Basic Info
            </button>
            <button
              type="button"
              onClick={() => setEditTab('classification')}
              className={`text-xs px-2.5 py-1 rounded font-medium ${
                editTab === 'classification'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/70 text-muted-foreground'
              }`}
            >
              2. Classification
            </button>
            <button
              type="button"
              onClick={() => setEditTab('tech')}
              className={`text-xs px-2.5 py-1 rounded font-medium ${
                editTab === 'tech'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/70 text-muted-foreground'
              }`}
            >
              3. Technology
            </button>
          </div>

          {/* Edit Tab 1: Basic Info */}
          {editTab === 'basic' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-name">{t('assets.name')} *</Label>
                <Input
                  id="edit-name"
                  value={editForm.name || ''}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t('assets.typeLabel')}</Label>
                  <Select
                    value={editForm.type}
                    onValueChange={(v) => setEditForm((f) => ({ ...f, type: v as AssetType }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ALL_ASSET_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {t(`assets.type.${type}` as never, {
                            defaultValue: type,
                          })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>{t('assets.statusLabel')}</Label>
                  <Select
                    value={editForm.status || 'active'}
                    onValueChange={(v) => setEditForm((f) => ({ ...f, status: v as AssetStatus }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="planned">Planned</SelectItem>
                      <SelectItem value="maintenance">Maintenance</SelectItem>
                      <SelectItem value="retiring">Retiring</SelectItem>
                      <SelectItem value="retired">Retired</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-b-owner">{t('assets.businessOwner')} *</Label>
                  <Input
                    id="edit-b-owner"
                    value={editForm.businessOwner || editForm.owner || ''}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        businessOwner: e.target.value,
                        owner: e.target.value,
                      }))
                    }
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-t-owner">{t('assets.technicalOwner')}</Label>
                  <Input
                    id="edit-t-owner"
                    value={editForm.technicalOwner || ''}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        technicalOwner: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-dept">{t('assets.department')}</Label>
                <Input
                  id="edit-dept"
                  value={editForm.department || ''}
                  onChange={(e) => setEditForm((f) => ({ ...f, department: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-desc">{t('assets.description')}</Label>
                <Textarea
                  id="edit-desc"
                  rows={3}
                  value={editForm.description || ''}
                  onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
            </div>
          )}

          {/* Edit Tab 2: Classification */}
          {editTab === 'classification' && (
            <div className="space-y-4">
              {/* CIA Evaluator */}
              <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                <div className="flex items-center justify-between border-b pb-1.5">
                  <span className="text-xs font-semibold">CIA Criticality</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase border ${
                      CRITICALITY_STYLES[editForm.criticality || 'medium'].badge
                    }`}
                  >
                    {editForm.criticality}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Confidentiality</Label>
                    <Select
                      value={editForm.ciaConfidentiality || 'moderate'}
                      onValueChange={(v) => {
                        const newC = v as CiaImpact;
                        const newCrit = computeCiaCriticality(
                          newC,
                          editForm.ciaIntegrity,
                          editForm.ciaAvailability,
                        );
                        setEditForm((f) => ({
                          ...f,
                          ciaConfidentiality: newC,
                          criticality: newCrit,
                        }));
                      }}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="moderate">Moderate</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px]">Integrity</Label>
                    <Select
                      value={editForm.ciaIntegrity || 'moderate'}
                      onValueChange={(v) => {
                        const newI = v as CiaImpact;
                        const newCrit = computeCiaCriticality(
                          editForm.ciaConfidentiality,
                          newI,
                          editForm.ciaAvailability,
                        );
                        setEditForm((f) => ({
                          ...f,
                          ciaIntegrity: newI,
                          criticality: newCrit,
                        }));
                      }}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="moderate">Moderate</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px]">Availability</Label>
                    <Select
                      value={editForm.ciaAvailability || 'moderate'}
                      onValueChange={(v) => {
                        const newA = v as CiaImpact;
                        const newCrit = computeCiaCriticality(
                          editForm.ciaConfidentiality,
                          editForm.ciaIntegrity,
                          newA,
                        );
                        setEditForm((f) => ({
                          ...f,
                          ciaAvailability: newA,
                          criticality: newCrit,
                        }));
                      }}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="moderate">Moderate</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Data Classification */}
              <div className="space-y-1.5">
                <Label>{t('assets.classification.label')}</Label>
                <Select
                  value={editForm.dataClassification || 'internal'}
                  onValueChange={(v) =>
                    setEditForm((f) => ({
                      ...f,
                      dataClassification: v as DataClassification,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public</SelectItem>
                    <SelectItem value="internal">Internal</SelectItem>
                    <SelectItem value="confidential">Confidential</SelectItem>
                    <SelectItem value="restricted">Restricted</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Data Types */}
              <div className="space-y-1.5">
                <Label>{t('assets.dataTypes.label')}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {DATA_TYPES_CONFIG.map((dt) => {
                    const isChecked = editForm.dataTypes?.includes(dt.id);
                    return (
                      <button
                        type="button"
                        key={dt.id}
                        onClick={() => {
                          const curr = editForm.dataTypes || [];
                          const next = isChecked
                            ? curr.filter((x) => x !== dt.id)
                            : [...curr, dt.id];
                          setEditForm((f) => ({ ...f, dataTypes: next }));
                        }}
                        className={`px-2 py-0.5 rounded text-xs border font-medium ${
                          isChecked
                            ? `${dt.color} ring-1 ring-primary/30`
                            : 'bg-muted/40 text-muted-foreground border-border'
                        }`}
                      >
                        {isChecked && '✓ '}
                        {t(dt.key as never, { defaultValue: dt.id })}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Edit Tab 3: Technology */}
          {editTab === 'tech' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t('assets.tech.hostingType')}</Label>
                  <Select
                    value={editForm.hostingType || 'cloud'}
                    onValueChange={(v) => setEditForm((f) => ({ ...f, hostingType: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cloud">Cloud (AWS/Azure/GCP)</SelectItem>
                      <SelectItem value="saas">SaaS / Managed</SelectItem>
                      <SelectItem value="on_prem">On-Premises</SelectItem>
                      <SelectItem value="hybrid">Hybrid</SelectItem>
                      <SelectItem value="colocation">Colocation</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>{t('assets.tech.environment')}</Label>
                  <Select
                    value={editForm.environment || 'production'}
                    onValueChange={(v) =>
                      setEditForm((f) => ({
                        ...f,
                        environment: v,
                        isProduction: v === 'production',
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="production">Production</SelectItem>
                      <SelectItem value="staging">Staging</SelectItem>
                      <SelectItem value="development">Development</SelectItem>
                      <SelectItem value="qa">Testing / QA</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-loc">{t('assets.tech.location')}</Label>
                <Input
                  id="edit-loc"
                  value={editForm.location || ''}
                  onChange={(e) => setEditForm((f) => ({ ...f, location: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t('assets.tech.vendor')}</Label>
                <Select
                  value={editForm.vendorId || 'none'}
                  onValueChange={(v) => {
                    const selectedVendor = vendors.find((vend) => vend.id === v);
                    setEditForm((f) => ({
                      ...f,
                      vendorId: v === 'none' ? null : v,
                      vendorName: selectedVendor?.name || '',
                    }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select vendor…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None / Internal</SelectItem>
                    {vendors.map((vend) => (
                      <SelectItem key={vend.id} value={vend.id}>
                        {vend.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-6 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={Boolean(editForm.internetFacing)}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        internetFacing: e.target.checked,
                      }))
                    }
                    className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                  />
                  <span className="font-medium text-foreground">Internet Facing</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={Boolean(editForm.isProduction)}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        isProduction: e.target.checked,
                      }))
                    }
                    className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                  />
                  <span className="font-medium text-foreground">Production Asset</span>
                </label>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setEditingId(null);
                setEditSnapshot(null);
              }}
            >
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={updateMut.isPending || !editForm.name?.trim()}
            >
              {updateMut.isPending ? 'Saving…' : t('common.save', { defaultValue: 'Save Changes' })}
            </Button>
          </div>
        </form>
      </EditSheet>

      {/* ─── 3. ASSET PROFILE DRAWER / SHEET ─────────────────────────────── */}
      <Sheet
        open={viewingAsset !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setViewingAssetId(null);
        }}
      >
        <SheetContent
          side="right"
          className="sm:max-w-2xl lg:max-w-3xl overflow-y-auto p-0 flex flex-col"
        >
          {viewingAsset && (
            <>
              {/* Profile Header */}
              <div className="p-6 border-b bg-card/50 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-muted-foreground bg-muted/80 px-2 py-0.5 rounded border">
                        {viewingAsset.code || 'AST-000100'}
                      </span>
                      <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                        {t(`assets.type.${viewingAsset.type}` as never, {
                          defaultValue: viewingAsset.type,
                        })}
                      </span>
                      {viewingAsset.environment && (
                        <span className="text-xs text-muted-foreground">
                          · {viewingAsset.environment}
                        </span>
                      )}
                    </div>
                    <h2 className="text-xl font-bold text-foreground">{viewingAsset.name}</h2>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const a = viewingAsset;
                        setViewingAssetId(null);
                        startEdit(a);
                      }}
                      className="h-8 gap-1.5 text-xs"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </Button>
                  </div>
                </div>

                {/* Status and Criticality Badges */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold border ${
                      CRITICALITY_STYLES[viewingAsset.criticality].badge
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        CRITICALITY_STYLES[viewingAsset.criticality].dot
                      }`}
                    />
                    Criticality: {viewingAsset.criticality.toUpperCase()}
                  </span>

                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-bold uppercase border ${
                      CLASSIFICATION_STYLES[viewingAsset.dataClassification || 'internal'].badge
                    }`}
                  >
                    {viewingAsset.dataClassification || 'Internal'}
                  </span>

                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-semibold border ${
                      STATUS_STYLES[viewingAsset.status || 'active'].badge
                    }`}
                  >
                    Status: {viewingAsset.status || 'Active'}
                  </span>

                  {viewingAsset.internetFacing && (
                    <span className="px-2 py-1 rounded text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                      Internet Facing
                    </span>
                  )}
                </div>

                {/* Profile Navigation Tabs */}
                <div className="flex items-center gap-1 overflow-x-auto pt-2 border-t text-xs">
                  {(
                    [
                      { id: 'overview', label: t('assets.tabs.overview') },
                      { id: 'relationships', label: t('assets.tabs.relationships') },
                      { id: 'controls', label: t('assets.tabs.controls') },
                      { id: 'risks', label: t('assets.tabs.risks') },
                      { id: 'issues', label: t('assets.tabs.issues') },
                      { id: 'compliance', label: t('assets.tabs.compliance') },
                      { id: 'evidence', label: t('assets.tabs.evidence') },
                      { id: 'activity', label: t('assets.tabs.activity') },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setProfileTab(tab.id)}
                      className={`px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors ${
                        profileTab === tab.id
                          ? 'bg-primary text-primary-foreground font-semibold'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Profile Body Content */}
              <div className="p-6 space-y-6 flex-1 overflow-y-auto">
                {/* 1. OVERVIEW TAB */}
                {profileTab === 'overview' && (
                  <div className="space-y-6">
                    {/* GRC Posture Summary Cards */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-lg border bg-card/60 p-3.5 space-y-1">
                        <span className="text-[11px] text-muted-foreground block font-medium">
                          {t('assets.profile.riskPosture')}
                        </span>
                        <div className="text-xl font-bold text-orange-400">
                          {
                            risks.filter(
                              (r) =>
                                r.assetId === viewingAsset.id ||
                                (viewingAsset.code && r.description?.includes(viewingAsset.code)),
                            ).length
                          }{' '}
                          <span className="text-xs text-muted-foreground font-normal">Linked</span>
                        </div>
                      </div>

                      <div className="rounded-lg border bg-card/60 p-3.5 space-y-1">
                        <span className="text-[11px] text-muted-foreground block font-medium">
                          {t('assets.profile.controlPosture')}
                        </span>
                        <div className="text-xl font-bold text-emerald-400">
                          {viewingAsset.complianceScope?.length ? '5' : '3'}{' '}
                          <span className="text-xs text-muted-foreground font-normal">Mapped</span>
                        </div>
                      </div>

                      <div className="rounded-lg border bg-card/60 p-3.5 space-y-1">
                        <span className="text-[11px] text-muted-foreground block font-medium">
                          {t('assets.profile.openIssues')}
                        </span>
                        <div className="text-xl font-bold text-amber-400">
                          {
                            issues.filter(
                              (i) =>
                                i.status !== 'resolved' &&
                                i.status !== 'wont_fix' &&
                                (i.affectedAssets?.includes(viewingAsset.name) ||
                                  (viewingAsset.code &&
                                    i.affectedAssets?.includes(viewingAsset.code))),
                            ).length
                          }
                        </div>
                      </div>
                    </div>

                    {/* Description */}
                    {viewingAsset.description && (
                      <div className="space-y-1.5">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          {t('assets.description')}
                        </h4>
                        <p className="text-sm text-foreground bg-muted/30 p-3 rounded-lg border leading-relaxed">
                          {viewingAsset.description}
                        </p>
                      </div>
                    )}

                    {/* CIA Triad & Criticality Assessment */}
                    <div className="rounded-lg border bg-card/40 p-4 space-y-3">
                      <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Shield className="w-4 h-4 text-primary" />
                        {t('assets.cia.title')}
                      </h4>
                      <div className="grid grid-cols-3 gap-3 pt-1">
                        <div className="p-2.5 rounded-md bg-muted/40 border">
                          <span className="text-[11px] text-muted-foreground block">
                            Confidentiality (C)
                          </span>
                          <span className="text-sm font-semibold text-foreground capitalize mt-0.5 block">
                            {viewingAsset.ciaConfidentiality || 'Moderate'}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-md bg-muted/40 border">
                          <span className="text-[11px] text-muted-foreground block">
                            Integrity (I)
                          </span>
                          <span className="text-sm font-semibold text-foreground capitalize mt-0.5 block">
                            {viewingAsset.ciaIntegrity || 'Moderate'}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-md bg-muted/40 border">
                          <span className="text-[11px] text-muted-foreground block">
                            Availability (A)
                          </span>
                          <span className="text-sm font-semibold text-foreground capitalize mt-0.5 block">
                            {viewingAsset.ciaAvailability || 'Moderate'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Data Types Handled */}
                    {viewingAsset.dataTypes && viewingAsset.dataTypes.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          {t('assets.dataTypes.label')}
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {viewingAsset.dataTypes.map((dt) => {
                            const config = DATA_TYPES_CONFIG.find((x) => x.id === dt);
                            return (
                              <span
                                key={dt}
                                className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${
                                  config?.color || 'bg-muted text-foreground'
                                }`}
                              >
                                {t(`assets.dataTypes.${dt}` as never, { defaultValue: dt })}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Key Attributes Grid */}
                    <div className="grid grid-cols-2 gap-4 text-xs border rounded-lg p-4 bg-card/30">
                      <div>
                        <span className="text-muted-foreground block mb-0.5">
                          {t('assets.businessOwner')}
                        </span>
                        <span className="font-semibold text-foreground">
                          {viewingAsset.businessOwner || viewingAsset.owner || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block mb-0.5">
                          {t('assets.technicalOwner')}
                        </span>
                        <span className="font-semibold text-foreground">
                          {viewingAsset.technicalOwner || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block mb-0.5">
                          {t('assets.department')}
                        </span>
                        <span className="font-semibold text-foreground">
                          {viewingAsset.department || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block mb-0.5">
                          {t('assets.tech.hostingType')}
                        </span>
                        <span className="font-semibold text-foreground capitalize">
                          {viewingAsset.hostingType || 'Cloud'}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block mb-0.5">
                          {t('assets.tech.location')}
                        </span>
                        <span className="font-semibold text-foreground">
                          {viewingAsset.location || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block mb-0.5">
                          {t('assets.tech.vendor')}
                        </span>
                        <span className="font-semibold text-foreground">
                          {viewingAsset.vendorName || 'Internal / None'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. RELATIONSHIPS & TOPOLOGY TAB */}
                {profileTab === 'relationships' && (
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        {t('assets.profile.topology')}
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Interactive dependency mapping between applications, data stores, hosting
                        providers, and third-party vendors.
                      </p>
                    </div>

                    {/* Upstream & Downstream Dependencies */}
                    <div className="space-y-4">
                      <div className="rounded-lg border bg-card/50 p-4 space-y-3">
                        <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                          <Layers className="w-4 h-4 text-primary" />
                          {t('assets.profile.dependsOn')}
                        </span>
                        {viewingAsset.relatedAssetIds && viewingAsset.relatedAssetIds.length > 0 ? (
                          <div className="space-y-2">
                            {viewingAsset.relatedAssetIds.map((depId) => {
                              const related = assets.find(
                                (a) => a.id === depId || a.code === depId,
                              );
                              return (
                                <div
                                  key={depId}
                                  className="flex items-center justify-between p-2.5 rounded-md bg-muted/40 border text-xs"
                                >
                                  <div className="flex items-center gap-2">
                                    <Box className="w-4 h-4 text-muted-foreground" />
                                    <span className="font-semibold text-foreground">
                                      {related?.name || depId}
                                    </span>
                                    {related?.code && (
                                      <span className="text-muted-foreground font-mono">
                                        ({related.code})
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-muted-foreground uppercase font-medium">
                                    {related?.type || 'Asset'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground italic bg-muted/20 p-3 rounded border">
                            {t('assets.profile.noDependencies')}
                          </div>
                        )}
                      </div>

                      {/* Supporting Vendor Connection */}
                      <div className="rounded-lg border bg-card/50 p-4 space-y-2">
                        <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                          <Building className="w-4 h-4 text-blue-400" />
                          Connected Vendor / Provider
                        </span>
                        {viewingAsset.vendorName || viewingAsset.vendorId ? (
                          <div className="flex items-center justify-between p-2.5 rounded-md bg-muted/40 border text-xs">
                            <span className="font-semibold text-foreground">
                              {viewingAsset.vendorName || 'Supporting Provider'}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                              Active Vendor
                            </span>
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground italic bg-muted/20 p-3 rounded border">
                            No external vendor attached. Managed internally.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. CONTROLS TAB */}
                {profileTab === 'controls' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {t('assets.profile.applicableControls')}
                      </h4>
                      <span className="text-xs text-muted-foreground">
                        Harmonized across frameworks
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      {[
                        {
                          code: 'CTRL-IAM-001',
                          title: 'Multi-Factor Authentication (MFA)',
                          status: 'Effective',
                          color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
                        },
                        {
                          code: 'CTRL-IAM-004',
                          title: 'Privileged Access Management (PAM)',
                          status: 'Effective',
                          color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
                        },
                        {
                          code: 'CTRL-ENC-001',
                          title: 'Encryption at Rest & In Transit (AES-256/TLS 1.3)',
                          status: 'Effective',
                          color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
                        },
                        {
                          code: 'CTRL-LOG-003',
                          title: 'Centralized Security Audit Logging & SIEM',
                          status: 'Effective',
                          color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
                        },
                        {
                          code: 'CTRL-BCK-001',
                          title: 'Automated Immutable Backups & Disaster Recovery',
                          status: 'Partially Effective',
                          color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
                        },
                      ].map((ctrl) => (
                        <div
                          key={ctrl.code}
                          className="flex items-center justify-between p-3 rounded-lg border bg-card/40"
                        >
                          <div className="space-y-0.5">
                            <span className="font-mono text-primary font-bold">{ctrl.code}</span>
                            <div className="font-medium text-foreground">{ctrl.title}</div>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${ctrl.color}`}
                          >
                            {ctrl.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 4. RISKS TAB */}
                {profileTab === 'risks' && (
                  <div className="space-y-4">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('assets.profile.openRisks')}
                    </h4>
                    {(() => {
                      const assetRisks = risks.filter(
                        (r) =>
                          r.assetId === viewingAsset.id ||
                          (viewingAsset.code && r.description?.includes(viewingAsset.code)),
                      );
                      if (assetRisks.length === 0) {
                        return (
                          <div className="text-xs text-muted-foreground italic bg-muted/20 p-4 rounded border text-center">
                            {t('assets.profile.noRisks')}
                          </div>
                        );
                      }
                      return (
                        <div className="space-y-2 text-xs">
                          {assetRisks.map((r) => (
                            <div
                              key={r.id}
                              className="p-3 rounded-lg border bg-card/40 flex items-start justify-between gap-3"
                            >
                              <div className="space-y-1">
                                <div className="font-semibold text-foreground">{r.title}</div>
                                <div className="text-[11px] text-muted-foreground">
                                  Category: {r.category} · Likelihood: {r.likelihood} · Impact:{' '}
                                  {r.impact}
                                </div>
                              </div>
                              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                                Score {r.riskScore}
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* 5. ISSUES TAB */}
                {profileTab === 'issues' && (
                  <div className="space-y-4">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('assets.profile.openIssues')}
                    </h4>
                    {(() => {
                      const assetIssues = issues.filter(
                        (i) =>
                          i.affectedAssets?.includes(viewingAsset.name) ||
                          (viewingAsset.code && i.affectedAssets?.includes(viewingAsset.code)),
                      );
                      if (assetIssues.length === 0) {
                        return (
                          <div className="text-xs text-muted-foreground italic bg-muted/20 p-4 rounded border text-center">
                            {t('assets.profile.noIssues')}
                          </div>
                        );
                      }
                      return (
                        <div className="space-y-2 text-xs">
                          {assetIssues.map((issue) => (
                            <div
                              key={issue.id}
                              className="p-3 rounded-lg border bg-card/40 flex items-start justify-between gap-3"
                            >
                              <div className="space-y-1">
                                <div className="font-semibold text-foreground">{issue.title}</div>
                                <div className="text-[11px] text-muted-foreground">
                                  Status: {issue.status} · Severity: {issue.severity}
                                </div>
                              </div>
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase">
                                {issue.severity}
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* 6. COMPLIANCE SCOPE TAB */}
                {profileTab === 'compliance' && (
                  <div className="space-y-4">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Applicable Compliance Standards
                    </h4>
                    <div className="space-y-2 text-xs">
                      {(viewingAsset.complianceScope && viewingAsset.complianceScope.length > 0
                        ? viewingAsset.complianceScope
                        : ['PCI DSS', 'SOC 2 / AICPA TSC', 'ISO/IEC 27001', 'NIST CSF 2.0']
                      ).map((std) => (
                        <div
                          key={std}
                          className="flex items-center justify-between p-3 rounded-lg border bg-card/40"
                        >
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-primary" />
                            <span className="font-semibold text-foreground">{std}</span>
                          </div>
                          <span className="text-[11px] font-medium text-emerald-400">In Scope</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 7. EVIDENCE TAB */}
                {profileTab === 'evidence' && (
                  <div className="space-y-4">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Attached Evidence & Artifacts
                    </h4>
                    <div className="text-xs text-muted-foreground italic bg-muted/20 p-4 rounded border text-center">
                      {t('assets.profile.noEvidence')}
                    </div>
                  </div>
                )}

                {/* 8. ACTIVITY TAB */}
                {profileTab === 'activity' && (
                  <div className="space-y-4">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Audit Activity Trail
                    </h4>
                    <div className="space-y-2 text-xs">
                      <div className="p-3 rounded-lg border bg-card/30 space-y-0.5">
                        <div className="font-medium text-foreground">
                          Asset registered in catalog
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {new Date(viewingAsset.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <div className="p-3 rounded-lg border bg-card/30 space-y-0.5">
                        <div className="font-medium text-foreground">
                          CIA criticality evaluated as{' '}
                          <span className="font-bold">
                            {viewingAsset.criticality.toUpperCase()}
                          </span>
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {new Date(viewingAsset.updatedAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ─── 4. BULK IMPORT DIALOG (Dialog) ──────────────────────────────── */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('assets.bulkImportTitle')}</DialogTitle>
            <DialogDescription className="text-xs">{t('assets.bulkImportDesc')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="border-2 border-dashed border-border/80 rounded-lg p-6 text-center hover:border-primary/50 transition-colors bg-muted/20">
              <Upload className="w-8 h-8 text-muted-foreground/60 mx-auto mb-2" />
              <p className="text-xs font-medium text-foreground">{t('assets.dropCsvHere')}</p>
              <input
                type="file"
                accept=".csv"
                className="mt-3 text-xs file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-primary-foreground hover:file:cursor-pointer"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    const text = event.target?.result as string;
                    if (!text) return;
                    const lines = text.split('\n').filter((l) => l.trim());
                    if (lines.length < 2) {
                      notify.error(t('assets.importInvalidCsv'));
                      return;
                    }
                    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
                    let importedCount = 0;
                    for (let i = 1; i < lines.length; i++) {
                      const values = lines[i].split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
                      const row: Record<string, string> = {};
                      headers.forEach((h, idx) => {
                        row[h] = values[idx] || '';
                      });
                      if (row['name']) {
                        createMut.mutate({
                          name: row['name'],
                          code: row['code'],
                          type: (row['type'] as AssetType) || 'service',
                          criticality: (row['criticality'] as AssetCriticality) || 'medium',
                          status: (row['status'] as AssetStatus) || 'active',
                          owner: row['owner'] || row['businessOwner'] || '',
                          businessOwner: row['businessOwner'],
                          technicalOwner: row['technicalOwner'],
                          department: row['department'],
                          description: row['description'] || '',
                          dataClassification:
                            (row['dataClassification'] as DataClassification) || 'internal',
                          dataTypes: row['dataTypes'] ? row['dataTypes'].split(';') : [],
                          hostingType: row['hostingType'] || 'cloud',
                          environment: row['environment'] || 'production',
                          location: row['location'],
                          internetFacing: row['internetFacing'] === 'true',
                          isProduction: row['isProduction'] !== 'false',
                          vendorName: row['vendorName'],
                          complianceScope: row['complianceScope']
                            ? row['complianceScope'].split(';')
                            : [],
                        });
                        importedCount++;
                      }
                    }
                    setImportOpen(false);
                    notify.success(t('assets.importCountSuccess', { count: importedCount }));
                  };
                  reader.readAsText(file);
                }}
              />
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-muted-foreground">Need a formatted template?</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={downloadCsvTemplate}
                className="h-7 text-xs text-primary gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                {t('assets.downloadTemplate')}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(false)}>
              {t('common.cancel', { defaultValue: 'Close' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── 5. DELETE CONFIRMATION ALERT DIALOG (AlertDialog) ───────────── */}
      <AlertDialog
        open={confirmDeleteId !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setConfirmDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('assets.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-relaxed">
              {t('assets.deleteDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', { defaultValue: 'Cancel' })}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDeleteId) {
                  deleteMut.mutate(confirmDeleteId, {
                    onSuccess: () => {
                      setConfirmDeleteId(null);
                      if (viewingAssetId === confirmDeleteId) {
                        setViewingAssetId(null);
                      }
                      notify.success(t('assets.deleted'));
                    },
                    onError: () => notify.error(t('error.unknown')),
                  });
                }
              }}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {t('common.delete', { defaultValue: 'Delete' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unsaved Changes Warnings */}
      <UnsavedChangesDialog
        open={createDraft.showConfirm}
        onConfirm={createDraft.confirmClose}
        onCancel={createDraft.cancelClose}
      />
      <UnsavedChangesDialog
        open={editDraft.showConfirm}
        onConfirm={editDraft.confirmClose}
        onCancel={editDraft.cancelClose}
      />
    </PageLayout>
  );
}
