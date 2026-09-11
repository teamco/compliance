import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Shield,
  FileCheck,
  Layers,
  FileText,
  AlertTriangle,
  Building,
  Server,
  MapPin,
  Scale,
  Plus,
  ExternalLink,
  Info,
} from 'lucide-react';
import { useNotify } from '@icore/template-shared';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useUpdateRequirement,
  useCreateFrameworkEvidence,
  useCreateAssessmentFinding,
  type Framework,
  type FrameworkRequirement,
  type FrameworkApplicabilityStatus,
  type ImplementationStatus,
  type InternalControl,
  type RequirementEvidence,
  type RequirementAssessment,
} from '@/queries/frameworks';

type DrawerSection =
  'requirement' | 'applicability' | 'implementation' | 'mapping' | 'evidence' | 'assessments';

interface RequirementDrawerProps {
  framework: Framework;
  requirement: FrameworkRequirement | null;
  internalControls: InternalControl[];
  evidenceList: RequirementEvidence[];
  assessmentsList: RequirementAssessment[];
  orgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const APPLICABILITY_COLORS: Record<FrameworkApplicabilityStatus, string> = {
  applicable: 'bg-green-500/10 text-green-500 border-green-500/20',
  not_applicable: 'bg-red-500/10 text-red-400 border-red-500/20',
  not_determined: 'bg-muted text-muted-foreground border-border',
};

const IMPLEMENTATION_COLORS: Record<ImplementationStatus, string> = {
  implemented: 'bg-green-500/10 text-green-500 border-green-500/20',
  partially_implemented: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  planned: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  not_implemented: 'bg-red-500/10 text-red-400 border-red-500/20',
  not_applicable: 'bg-muted text-muted-foreground border-border',
};

export function RequirementDrawer({
  framework,
  requirement,
  internalControls,
  evidenceList,
  assessmentsList,
  orgId,
  open,
  onOpenChange,
}: RequirementDrawerProps) {
  const { t } = useTranslation();
  const notify = useNotify();

  const [activeSection, setActiveSection] = useState<DrawerSection>('requirement');

  // Form state for Applicability & Implementation
  const [applicability, setApplicability] = useState<FrameworkApplicabilityStatus>('applicable');
  const [applicabilityRationale, setApplicabilityRationale] = useState('');
  const [notApplicableReason, setNotApplicableReason] = useState('');
  const [scopeBusinessUnits, setScopeBusinessUnits] = useState<string[]>([]);
  const [scopeSystems, setScopeSystems] = useState<string[]>([]);
  const [scopeLocations, setScopeLocations] = useState<string[]>([]);
  const [scopeLegalEntities, setScopeLegalEntities] = useState<string[]>([]);
  const [implementationStatus, setImplementationStatus] =
    useState<ImplementationStatus>('not_implemented');
  const [implementationDescription, setImplementationDescription] = useState('');
  const [controlOwner, setControlOwner] = useState('');
  const [controlOperator, setControlOperator] = useState('');
  const [reviewFrequency, setReviewFrequency] = useState('Annual');
  const [lastAssessed, setLastAssessed] = useState('');
  const [nextAssessment, setNextAssessment] = useState('');

  // Add Evidence Dialog state inside Drawer
  const [showAddEvidence, setShowAddEvidence] = useState(false);
  const [evidenceTitle, setEvidenceTitle] = useState('');
  const [evidenceOwner, setEvidenceOwner] = useState('SecOps');
  const [evidenceType, setEvidenceType] = useState('Policy Document');
  const [evidenceSource, setEvidenceSource] = useState('Manual Upload');
  const [evidenceUrl, setEvidenceUrl] = useState('');

  // Log Finding state inside Drawer
  const [showAddFinding, setShowAddFinding] = useState(false);
  const [findingTitle, setFindingTitle] = useState('');
  const [findingSeverity, setFindingSeverity] = useState<'critical' | 'high' | 'medium' | 'low'>(
    'high',
  );
  const [findingDescription, setFindingDescription] = useState('');

  const updateMut = useUpdateRequirement(orgId, framework.id, requirement?.id ?? '');
  const addEvidenceMut = useCreateFrameworkEvidence(orgId, framework.id);
  const addFindingMut = useCreateAssessmentFinding(orgId, framework.id);

  useEffect(() => {
    if (requirement) {
      setApplicability(requirement.applicability || 'applicable');
      setApplicabilityRationale(requirement.applicabilityRationale || '');
      setNotApplicableReason(requirement.notApplicableReason || '');
      setScopeBusinessUnits(
        requirement.scopeBusinessUnits || ['Enterprise IT', 'Corporate Security'],
      );
      setScopeSystems(requirement.scopeSystems || ['AWS Production', 'Entra ID']);
      setScopeLocations(requirement.scopeLocations || ['US-East', 'EU-Central']);
      setScopeLegalEntities(requirement.scopeLegalEntities || ['Acme Global Inc.']);
      setImplementationStatus(requirement.implementationStatus || 'not_implemented');
      setImplementationDescription(requirement.implementationDescription || '');
      setControlOwner(requirement.controlOwner || 'Security Governance');
      setControlOperator(requirement.controlOperator || 'SecOps Team');
      setReviewFrequency(requirement.reviewFrequency || 'Annual');
      setLastAssessed(requirement.lastAssessed || '');
      setNextAssessment(requirement.nextAssessment || '');
    }
  }, [requirement]);

  if (!requirement) return null;

  const currentReq = requirement;

  const linkedInternalControls = internalControls.filter((c) =>
    c.frameworkMappings.some(
      (m) =>
        m.frameworkId === framework.id &&
        (m.requirementCode === currentReq.code || m.requirementCode.includes(currentReq.code)),
    ),
  );

  const linkedEvidence = evidenceList.filter(
    (e) =>
      e.requirementId === currentReq.id ||
      e.linkedRequirements?.includes(currentReq.code) ||
      linkedInternalControls.some((c) => e.linkedControls?.includes(c.code)),
  );

  const linkedAssessments = assessmentsList.filter(
    (a) => a.requirementId === currentReq.id || a.frameworkId === framework.id,
  );

  function handleSave() {
    if (applicability === 'not_applicable' && !notApplicableReason.trim()) {
      notify.error(
        t(
          'frameworks.drawer.naReasonRequired',
          'Justification is required when marking a requirement as Not Applicable',
        ),
      );
      return;
    }

    updateMut.mutate(
      {
        applicability,
        applicabilityRationale,
        notApplicableReason: applicability === 'not_applicable' ? notApplicableReason : undefined,
        scopeBusinessUnits,
        scopeSystems,
        scopeLocations,
        scopeLegalEntities,
        implementationStatus,
        implementationDescription,
        controlOwner,
        controlOperator,
        reviewFrequency,
        lastAssessed,
        nextAssessment,
      },
      {
        onSuccess: () => {
          notify.success(t('frameworks.drawer.saved', 'Requirement updated successfully'));
        },
      },
    );
  }

  function handleCreateEvidence() {
    if (!evidenceTitle.trim()) return;
    addEvidenceMut.mutate(
      {
        requirementId: currentReq.id,
        frameworkId: framework.id,
        title: evidenceTitle,
        owner: evidenceOwner || 'SecOps',
        evidenceType,
        source: evidenceSource,
        collectionDate: new Date().toISOString().split('T')[0],
        periodCovered: '2026-Q3',
        expirationDate: '2026-12-31',
        verificationStatus: 'verified',
        url: evidenceUrl,
        linkedRequirements: [currentReq.code],
      },
      {
        onSuccess: () => {
          notify.success(t('frameworks.drawer.evidenceAdded', 'Evidence item linked'));
          setShowAddEvidence(false);
          setEvidenceTitle('');
          setEvidenceUrl('');
        },
      },
    );
  }

  function handleCreateFinding() {
    if (!findingTitle.trim()) return;
    const targetAssessment = linkedAssessments[0] || { id: 'asm-default' };
    addFindingMut.mutate(
      {
        assessmentId: targetAssessment.id,
        data: {
          title: findingTitle,
          severity: findingSeverity,
          description: findingDescription,
        },
      },
      {
        onSuccess: () => {
          notify.success(
            t('frameworks.drawer.findingLogged', 'Finding logged into Issues repository'),
          );
          setShowAddFinding(false);
          setFindingTitle('');
          setFindingDescription('');
        },
      },
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-3xl overflow-y-auto p-0 flex flex-col bg-background border-l border-border"
      >
        {/* Drawer Header */}
        <SheetHeader className="p-6 border-b border-border bg-surface sticky top-0 z-10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-foreground text-background">
                  {currentReq.code}
                </span>
                <span className="text-xs text-muted-foreground font-medium">
                  {framework.name} · v{framework.version}
                </span>
                {currentReq.functionName && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    {currentReq.functionName}
                  </span>
                )}
                {currentReq.categoryName && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                    {currentReq.categoryName}
                  </span>
                )}
              </div>
              <SheetTitle className="text-lg font-semibold text-foreground text-left leading-snug">
                {currentReq.title}
              </SheetTitle>
            </div>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={updateMut.isPending}
              className="bg-green-600 hover:bg-green-500 text-white shrink-0"
            >
              {updateMut.isPending
                ? t('common.saving', 'Saving…')
                : t('common.save', 'Save Changes')}
            </Button>
          </div>

          {/* 6 Core Areas Navigation Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pt-4 border-t border-border mt-3 scrollbar-none">
            {[
              {
                id: 'requirement' as const,
                label: t('frameworks.drawer.tabRequirement', '1. Requirement'),
                icon: Shield,
              },
              {
                id: 'applicability' as const,
                label: t('frameworks.drawer.tabApplicability', '2. Applicability'),
                icon: FileCheck,
              },
              {
                id: 'implementation' as const,
                label: t('frameworks.drawer.tabImplementation', '3. Implementation'),
                icon: Layers,
              },
              {
                id: 'mapping' as const,
                label: t('frameworks.drawer.tabMapping', '4. Mapped Controls'),
                icon: Scale,
              },
              {
                id: 'evidence' as const,
                label: `${t('frameworks.drawer.tabEvidence', '5. Evidence')} (${linkedEvidence.length})`,
                icon: FileText,
              },
              {
                id: 'assessments' as const,
                label: t('frameworks.drawer.tabAssessments', '6. Assessments & Findings'),
                icon: AlertTriangle,
              },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeSection === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveSection(tab.id)}
                  className={[
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer',
                    isActive
                      ? 'bg-green-500/10 text-green-500 border border-green-500/20'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
                  ].join(' ')}
                >
                  <Icon size={13} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </SheetHeader>

        {/* Drawer Body */}
        <div className="p-6 flex-1 space-y-6">
          {/* AREA 1: REQUIREMENT (IMMUTABLE SOURCE CONTENT) */}
          {activeSection === 'requirement' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 flex items-start gap-3">
                <Info size={18} className="text-blue-400 shrink-0 mt-0.5" />
                <div className="text-xs text-blue-300 leading-relaxed">
                  <span className="font-semibold block text-blue-200">
                    {t('frameworks.drawer.immutableNotice', 'Immutable Source Content')}
                  </span>
                  {t(
                    'frameworks.drawer.immutableDesc',
                    'Standard text and official definitions are immutable baseline content provided by the framework authority.',
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  {t('frameworks.drawer.officialStatement', 'Official Requirement Statement')}
                </Label>
                <div className="p-4 rounded-xl bg-surface border border-border text-sm text-foreground leading-relaxed">
                  {currentReq.description}
                </div>
              </div>

              {currentReq.guidance && (
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                    {t('frameworks.drawer.guidance', 'Implementation Guidance & Examples')}
                  </Label>
                  <div className="p-4 rounded-xl bg-surface border border-border text-xs text-muted-foreground leading-relaxed">
                    {currentReq.guidance}
                  </div>
                </div>
              )}

              {currentReq.references && currentReq.references.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                    {t(
                      'frameworks.drawer.references',
                      'Cross-Standard References & Informative References',
                    )}
                  </Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {currentReq.references.map((ref, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-lg bg-surface border border-border text-xs text-foreground font-mono flex items-center justify-between"
                      >
                        <span>{ref}</span>
                        <ExternalLink size={12} className="text-muted-foreground/60" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {currentReq.crossFrameworkMappings &&
                currentReq.crossFrameworkMappings.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                      <Layers size={13} className="text-purple-400" />
                      Mapped External Requirements
                    </Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {currentReq.crossFrameworkMappings.map((m, i) => (
                        <div
                          key={i}
                          className="p-3 rounded-lg bg-surface border border-border flex flex-col gap-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-semibold text-purple-400 uppercase">
                              {m.targetFrameworkName}
                            </span>
                            <span className="text-[9px] font-mono bg-muted px-1.5 py-0.2 rounded text-muted-foreground capitalize">
                              {m.mappingType || 'equivalent'}
                            </span>
                          </div>
                          <div className="text-xs font-semibold text-foreground font-mono">
                            {m.targetRequirementCode}
                            {m.targetRequirementTitle ? ` — ${m.targetRequirementTitle}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="p-3 rounded-lg bg-surface border border-border">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                    Framework
                  </span>
                  <span className="text-xs font-medium text-foreground">{framework.name}</span>
                </div>
                <div className="p-3 rounded-lg bg-surface border border-border">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                    Version
                  </span>
                  <span className="text-xs font-medium text-foreground">{framework.version}</span>
                </div>
                <div className="p-3 rounded-lg bg-surface border border-border">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                    Function
                  </span>
                  <span className="text-xs font-medium text-foreground">
                    {currentReq.functionName || 'GOVERN'}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-surface border border-border">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                    Category
                  </span>
                  <span className="text-xs font-medium text-foreground">
                    {currentReq.categoryName || 'General'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* AREA 2: APPLICABILITY (ORG-SPECIFIC) */}
          {activeSection === 'applicability' && (
            <div className="space-y-6">
              <div className="space-y-3">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  {t('frameworks.drawer.applicabilityStatus', 'Applicability Status')}
                </Label>
                <div className="grid grid-cols-3 gap-3">
                  {(
                    [
                      'applicable',
                      'not_applicable',
                      'not_determined',
                    ] as FrameworkApplicabilityStatus[]
                  ).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setApplicability(status)}
                      className={[
                        'p-3 rounded-xl border text-xs font-medium flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer',
                        applicability === status
                          ? APPLICABILITY_COLORS[status] + ' border-current ring-1 ring-current'
                          : 'bg-surface border-border text-muted-foreground hover:text-foreground',
                      ].join(' ')}
                    >
                      <span className="capitalize">{status.replace('_', ' ')}</span>
                    </button>
                  ))}
                </div>
              </div>

              {applicability === 'not_applicable' && (
                <div className="space-y-2 p-4 rounded-xl bg-red-500/5 border border-red-500/20">
                  <Label className="text-xs font-semibold text-red-400 flex items-center gap-1.5">
                    <AlertTriangle size={13} />
                    {t('frameworks.drawer.naReason', 'Not Applicable Justification (Mandatory)')}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'frameworks.drawer.naReasonDesc',
                      'GRC standards require documented justification when excluding a framework requirement from scope.',
                    )}
                  </p>
                  <textarea
                    rows={3}
                    value={notApplicableReason}
                    onChange={(e) => setNotApplicableReason(e.target.value)}
                    placeholder={t(
                      'frameworks.drawer.naReasonPlaceholder',
                      'e.g. Our organization does not handle physical credit card data or operate retail hardware point-of-sale terminals.',
                    )}
                    className="w-full text-xs rounded-lg border border-border bg-background p-3 text-foreground focus:outline-none focus:ring-1 focus:ring-red-400"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  {t(
                    'frameworks.drawer.applicabilityRationale',
                    'Applicability Rationale & Context',
                  )}
                </Label>
                <textarea
                  rows={3}
                  value={applicabilityRationale}
                  onChange={(e) => setApplicabilityRationale(e.target.value)}
                  placeholder="Explain why this requirement applies and which regulatory driver governs it…"
                  className="w-full text-xs rounded-lg border border-border bg-surface p-3 text-foreground focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>

              {/* Scope Breakdown */}
              <div className="space-y-4 pt-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  {t('frameworks.drawer.scopeBreakdown', 'Organizational Scope Dimensions')}
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-3.5 rounded-xl bg-surface border border-border space-y-2">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Building size={13} className="text-green-500" />
                      Business Units
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {scopeBusinessUnits.map((bu, i) => (
                        <span
                          key={i}
                          className="text-[11px] bg-muted px-2 py-0.5 rounded text-foreground"
                        >
                          {bu}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-surface border border-border space-y-2">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Server size={13} className="text-blue-500" />
                      Systems & Infrastructure
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {scopeSystems.map((sys, i) => (
                        <span
                          key={i}
                          className="text-[11px] bg-muted px-2 py-0.5 rounded text-foreground"
                        >
                          {sys}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-surface border border-border space-y-2">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <MapPin size={13} className="text-amber-500" />
                      Locations & Cloud Regions
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {scopeLocations.map((loc, i) => (
                        <span
                          key={i}
                          className="text-[11px] bg-muted px-2 py-0.5 rounded text-foreground"
                        >
                          {loc}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-surface border border-border space-y-2">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Scale size={13} className="text-purple-500" />
                      Legal Entities
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {scopeLegalEntities.map((ent, i) => (
                        <span
                          key={i}
                          className="text-[11px] bg-muted px-2 py-0.5 rounded text-foreground"
                        >
                          {ent}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* AREA 3: IMPLEMENTATION */}
          {activeSection === 'implementation' && (
            <div className="space-y-6">
              <div className="space-y-3">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  {t('frameworks.drawer.implementationStatus', 'Implementation Status')}
                </Label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {(
                    [
                      'not_implemented',
                      'planned',
                      'partially_implemented',
                      'implemented',
                      'not_applicable',
                    ] as ImplementationStatus[]
                  ).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setImplementationStatus(st)}
                      className={[
                        'p-2.5 rounded-xl border text-[11px] font-medium flex items-center justify-center text-center transition-colors cursor-pointer',
                        implementationStatus === st
                          ? IMPLEMENTATION_COLORS[st] + ' border-current ring-1 ring-current'
                          : 'bg-surface border-border text-muted-foreground hover:text-foreground',
                      ].join(' ')}
                    >
                      <span className="capitalize">{st.replace('_', ' ')}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  {t(
                    'frameworks.drawer.howSatisfied',
                    'How does our organization satisfy this requirement?',
                  )}
                </Label>
                <textarea
                  rows={4}
                  value={implementationDescription}
                  onChange={(e) => setImplementationDescription(e.target.value)}
                  placeholder="Describe internal technical architecture, automated checks, policies, and operational procedures used to fulfill this requirement…"
                  className="w-full text-xs rounded-lg border border-border bg-surface p-3 text-foreground focus:outline-none focus:ring-1 focus:ring-green-500 leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Control Owner</Label>
                  <Input
                    value={controlOwner}
                    onChange={(e) => setControlOwner(e.target.value)}
                    placeholder="e.g. Security Governance"
                    className="h-8 text-xs bg-surface"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Control Operator</Label>
                  <Input
                    value={controlOperator}
                    onChange={(e) => setControlOperator(e.target.value)}
                    placeholder="e.g. SecOps Team"
                    className="h-8 text-xs bg-surface"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Review Frequency</Label>
                  <select
                    value={reviewFrequency}
                    onChange={(e) => setReviewFrequency(e.target.value)}
                    className="w-full h-8 rounded-lg border border-border bg-surface px-3 text-xs text-foreground focus:outline-none"
                  >
                    <option value="Continuous">Continuous / Real-time</option>
                    <option value="Monthly">Monthly</option>
                    <option value="Quarterly">Quarterly</option>
                    <option value="Semi-Annual">Semi-Annual</option>
                    <option value="Annual">Annual</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Last Assessed Date</Label>
                  <Input
                    type="date"
                    value={lastAssessed}
                    onChange={(e) => setLastAssessed(e.target.value)}
                    className="h-8 text-xs bg-surface"
                  />
                </div>
              </div>
            </div>
          )}

          {/* AREA 4: MAPPED INTERNAL CONTROLS (COMMON CONTROL FRAMEWORK) */}
          {activeSection === 'mapping' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-purple-500/5 border border-purple-500/20 flex items-start gap-3">
                <Scale size={18} className="text-purple-400 shrink-0 mt-0.5" />
                <div className="text-xs text-purple-300 leading-relaxed">
                  <span className="font-semibold block text-purple-200">
                    {t('frameworks.drawer.commonControlHeader', 'Common Control Framework')}
                  </span>
                  {t(
                    'frameworks.drawer.commonControlDesc',
                    'Internal controls satisfy requirements across multiple frameworks simultaneously (e.g. NIST, ISO, SOC 2), preventing duplicate control testing.',
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                    {t('frameworks.drawer.linkedInternalControls', 'Linked Internal Controls')}
                  </Label>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                    <Plus size={12} />
                    Map Control
                  </Button>
                </div>

                {linkedInternalControls.length === 0 ? (
                  <div className="p-6 rounded-xl border border-dashed border-border text-center space-y-2">
                    <Scale size={24} className="text-muted-foreground/40 mx-auto" />
                    <p className="text-xs text-muted-foreground">
                      No common internal controls mapped yet.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {linkedInternalControls.map((ctrl) => (
                      <div
                        key={ctrl.id}
                        className="p-4 rounded-xl bg-surface border border-border space-y-2 hover:border-muted-foreground/40 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                              {ctrl.code}
                            </span>
                            <h4 className="text-xs font-semibold text-foreground">{ctrl.title}</h4>
                          </div>
                          <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded">
                            {ctrl.category}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {ctrl.description}
                        </p>
                        {ctrl.coverageBenefit && (
                          <div className="text-[11px] font-semibold text-purple-400 bg-purple-500/10 px-2.5 py-1 rounded-md border border-purple-500/20">
                            {ctrl.coverageBenefit}
                          </div>
                        )}
                        <div className="pt-2 border-t border-border flex items-center justify-between flex-wrap gap-2 text-[11px] text-muted-foreground">
                          <span>
                            Owner: <strong className="text-foreground">{ctrl.owner}</strong>
                          </span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-muted-foreground/80">Satisfies:</span>
                            {ctrl.frameworkMappings.map((m, idx) => (
                              <span
                                key={idx}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-muted font-mono text-foreground"
                              >
                                {m.frameworkName.split(' ')[0]}: {m.requirementCode}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* AREA 5: EVIDENCE */}
          {activeSection === 'evidence' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                    {t('frameworks.drawer.attachedEvidence', 'Attached Evidence & Artifacts')}
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Manual and automated evidence records demonstrating requirement compliance.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => setShowAddEvidence(!showAddEvidence)}
                  className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-500 text-white"
                >
                  <Plus size={12} />
                  Add Evidence
                </Button>
              </div>

              {showAddEvidence && (
                <div className="p-4 rounded-xl bg-surface border border-green-500/30 space-y-3">
                  <h5 className="text-xs font-semibold text-foreground">Add Evidence Artifact</h5>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Evidence Name / Title</Label>
                    <Input
                      value={evidenceTitle}
                      onChange={(e) => setEvidenceTitle(e.target.value)}
                      placeholder="e.g. Entra ID Conditional Access Screenshot"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Type</Label>
                      <select
                        value={evidenceType}
                        onChange={(e) => setEvidenceType(e.target.value)}
                        className="w-full h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground"
                      >
                        <option value="Policy Document">Policy Document</option>
                        <option value="Config Export">Config Export</option>
                        <option value="Screenshot">Screenshot</option>
                        <option value="Spreadsheet">Spreadsheet</option>
                        <option value="Ticket">Service Ticket</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Source</Label>
                      <Input
                        value={evidenceSource}
                        onChange={(e) => setEvidenceSource(e.target.value)}
                        placeholder="e.g. Entra ID / AWS"
                        className="h-8 text-xs bg-background"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Owner</Label>
                      <Input
                        value={evidenceOwner}
                        onChange={(e) => setEvidenceOwner(e.target.value)}
                        placeholder="SecOps"
                        className="h-8 text-xs bg-background"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">URL / Reference Link</Label>
                    <Input
                      value={evidenceUrl}
                      onChange={(e) => setEvidenceUrl(e.target.value)}
                      placeholder="https://…"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowAddEvidence(false)}
                      className="h-7 text-xs"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleCreateEvidence}
                      disabled={addEvidenceMut.isPending}
                      className="h-7 text-xs bg-green-600 text-white"
                    >
                      Save Evidence
                    </Button>
                  </div>
                </div>
              )}

              {linkedEvidence.length === 0 ? (
                <div className="p-8 rounded-xl border border-dashed border-border text-center space-y-2">
                  <FileText size={24} className="text-muted-foreground/40 mx-auto" />
                  <p className="text-xs text-muted-foreground">
                    No evidence linked to this requirement yet.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {linkedEvidence.map((ev) => (
                    <div
                      key={ev.id}
                      className="p-4 rounded-xl bg-surface border border-border space-y-2.5 hover:border-muted-foreground/40 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <FileText size={16} className="text-green-500 shrink-0" />
                          <h4 className="text-xs font-semibold text-foreground">{ev.title}</h4>
                        </div>
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-green-500/10 text-green-500 border border-green-500/20">
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
                      {ev.url && (
                        <div className="pt-1">
                          <a
                            href={ev.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-green-500 hover:underline inline-flex items-center gap-1"
                          >
                            View Evidence Artifact <ExternalLink size={11} />
                          </a>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* AREA 6: ASSESSMENTS & FINDINGS */}
          {activeSection === 'assessments' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                    {t('frameworks.drawer.assessmentHistory', 'Assessment History & Observations')}
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Linkage: Framework Requirement → Internal Control → Assessment → Finding.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => setShowAddFinding(!showAddFinding)}
                  className="h-7 text-xs gap-1 bg-amber-600 hover:bg-amber-500 text-white"
                >
                  <AlertTriangle size={12} />
                  Log Finding
                </Button>
              </div>

              {showAddFinding && (
                <div className="p-4 rounded-xl bg-surface border border-amber-500/30 space-y-3">
                  <h5 className="text-xs font-semibold text-foreground">Log Assessment Finding</h5>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Finding Title</Label>
                    <Input
                      value={findingTitle}
                      onChange={(e) => setFindingTitle(e.target.value)}
                      placeholder="e.g. Missing Q2 Access Review Evidence"
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Severity</Label>
                    <select
                      value={findingSeverity}
                      onChange={(e) =>
                        setFindingSeverity(e.target.value as 'critical' | 'high' | 'medium' | 'low')
                      }
                      className="w-full h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground"
                    >
                      <option value="critical">Critical</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">
                      Observation & Gap Description
                    </Label>
                    <textarea
                      rows={3}
                      value={findingDescription}
                      onChange={(e) => setFindingDescription(e.target.value)}
                      placeholder="Describe the deficiency identified during audit testing…"
                      className="w-full text-xs rounded-lg border border-border bg-background p-2.5 text-foreground"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowAddFinding(false)}
                      className="h-7 text-xs"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleCreateFinding}
                      disabled={addFindingMut.isPending}
                      className="h-7 text-xs bg-amber-600 text-white"
                    >
                      Create Finding
                    </Button>
                  </div>
                </div>
              )}

              {linkedAssessments.length === 0 ? (
                <div className="p-8 rounded-xl border border-dashed border-border text-center space-y-2">
                  <AlertTriangle size={24} className="text-muted-foreground/40 mx-auto" />
                  <p className="text-xs text-muted-foreground">
                    No assessment logs for this requirement yet.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {linkedAssessments.map((asm) => (
                    <div
                      key={asm.id}
                      className="p-4 rounded-xl bg-surface border border-border space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="text-xs font-semibold text-foreground">{asm.cycleName}</h4>
                          <span className="text-[11px] text-muted-foreground">
                            Assessed by {asm.assessor} on {asm.assessmentDate}
                          </span>
                        </div>
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-green-500/10 text-green-500 border border-green-500/20">
                          {asm.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                        <div className="p-2.5 rounded-lg bg-background border border-border">
                          <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                            Design
                          </span>
                          <span className="text-xs font-medium text-foreground capitalize">
                            {asm.designEffectiveness}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-lg bg-background border border-border">
                          <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                            Operating
                          </span>
                          <span className="text-xs font-medium text-foreground capitalize">
                            {asm.operatingEffectiveness}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-lg bg-background border border-border">
                          <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                            Implementation
                          </span>
                          <span className="text-xs font-medium text-foreground capitalize">
                            {asm.implementationStatus.replace('_', ' ')}
                          </span>
                        </div>
                      </div>

                      {asm.observation && (
                        <div className="p-3 rounded-lg bg-background border border-border text-xs text-muted-foreground">
                          <strong className="text-foreground block mb-1">Observation:</strong>
                          {asm.observation}
                        </div>
                      )}

                      {asm.findingId && (
                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-red-400">
                              {asm.findingId}
                            </span>
                            <span className="text-xs text-foreground font-medium">
                              {asm.findingTitle}
                            </span>
                          </div>
                          <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-red-500/20 text-red-400">
                            {asm.findingSeverity}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
