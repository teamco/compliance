import { useState } from 'react';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { Plus, Trash2 } from 'lucide-react';
import { useNotify } from '@icore/template-shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/combobox';
import { AssessmentItemControls } from '@/components/assessments/AssessmentItemControls';
import { AssessmentItemEvidence } from '@/components/assessments/AssessmentItemEvidence';
import {
  useRiskMethodology,
  useRiskTaxonomy,
  useRisks,
  useRisk,
  useUpdateRisk,
} from '@/queries/risks';
import { useInternalControlsList } from '@/queries/controls';
import {
  useAssessmentItems,
  useCreateAssessmentItem,
  useUpdateAssessmentItem,
  useDeleteAssessmentItem,
  useAssessmentItemControlMappings,
  useCreateRiskFromAssessmentItem,
  useLinkAssessmentItemToRisk,
  useUnlinkAssessmentItemFromRisk,
  type AssessmentItem,
  type AssessmentItemInput,
} from '@/queries/assessments';

interface AssessmentItemsPanelProps {
  orgId: string;
  assessmentId: string;
}

export function AssessmentItemsPanel({ orgId, assessmentId }: AssessmentItemsPanelProps) {
  const { t } = useTranslation();
  const notify = useNotify();

  const { data: items = [] } = useAssessmentItems(assessmentId);
  const { data: methodology } = useRiskMethodology(orgId);
  const { data: controls = [] } = useInternalControlsList(orgId);
  const createItemMut = useCreateAssessmentItem(assessmentId);
  const updateItemMut = useUpdateAssessmentItem(assessmentId);
  const deleteItemMut = useDeleteAssessmentItem(assessmentId);

  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [itemForm, setItemForm] = useState<AssessmentItemInput>({
    subject: '',
    description: '',
    inherentLikelihood: 0,
    inherentImpact: 0,
  });
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [confirmDeleteItemId, setConfirmDeleteItemId] = useState<string | null>(null);
  const [residualDraft, setResidualDraft] = useState<
    Record<string, { likelihood?: number; impact?: number }>
  >({});
  const [createRiskDialogItemId, setCreateRiskDialogItemId] = useState<string | null>(null);
  const [linkRiskDialogItemId, setLinkRiskDialogItemId] = useState<string | null>(null);
  const [taxonomyCategoryId, setTaxonomyCategoryId] = useState('');
  const [selectedRiskId, setSelectedRiskId] = useState('');
  const { data: taxonomy = [] } = useRiskTaxonomy(orgId);
  const { data: allRisks = [] } = useRisks(orgId);
  const createRiskMut = useCreateRiskFromAssessmentItem(createRiskDialogItemId ?? '');
  const linkRiskMut = useLinkAssessmentItemToRisk(linkRiskDialogItemId ?? '');

  const { data: expandedItemMappings = [] } = useAssessmentItemControlMappings(
    expandedItemId ?? '',
  );
  const hasLinkedControls = expandedItemMappings.length > 0;

  function handleCreateItem(e: React.FormEvent) {
    e.preventDefault();
    if (!itemForm.subject || !itemForm.inherentLikelihood || !itemForm.inherentImpact) return;
    createItemMut.mutate(itemForm, {
      onSuccess: () => {
        setItemDialogOpen(false);
        setItemForm({ subject: '', description: '', inherentLikelihood: 0, inherentImpact: 0 });
      },
    });
  }

  function closeCreateRiskDialog() {
    setCreateRiskDialogItemId(null);
    setTaxonomyCategoryId('');
  }

  function closeLinkRiskDialog() {
    setLinkRiskDialogItemId(null);
    setSelectedRiskId('');
  }

  function handleResidualChange(
    item: AssessmentItem,
    field: 'residualLikelihood' | 'residualImpact',
    value: number,
  ) {
    const current = residualDraft[item.id] ?? {
      likelihood: item.residualLikelihood,
      impact: item.residualImpact,
    };
    const next = {
      likelihood: field === 'residualLikelihood' ? value : current.likelihood,
      impact: field === 'residualImpact' ? value : current.impact,
    };
    setResidualDraft((d) => ({ ...d, [item.id]: next }));
    if (!next.likelihood || !next.impact) return;
    updateItemMut.mutate(
      {
        id: item.id,
        patch: { residualLikelihood: next.likelihood, residualImpact: next.impact },
      },
      {
        onSuccess: () =>
          setResidualDraft((d) => {
            const next = { ...d };
            delete next[item.id];
            return next;
          }),
      },
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setItemDialogOpen(true)}>
          <Plus size={14} className="mr-1.5" />
          {t('assessments.addItem')}
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-center text-muted-foreground py-12">
          {t('assessments.noItems')}
        </p>
      ) : (
        items.map((item) => (
          <div key={item.id} className="border border-border rounded-xl overflow-hidden">
            <div
              className="flex items-start gap-3 p-4 cursor-pointer hover:bg-surface"
              onClick={() => setExpandedItemId((cur) => (cur === item.id ? null : item.id))}
            >
              <span className="text-lg font-bold tabular-nums shrink-0">{item.inherentScore}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground">{item.subject}</p>
                {item.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
                )}
                <p className="text-[11px] text-muted-foreground/60 mt-1">
                  {t('assessments.inherent')}: {item.inherentScore} ({item.inherentLabel})
                  {item.residualScore != null &&
                    ` · ${t('assessments.residual')}: ${item.residualScore} (${item.residualLabel})`}
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDeleteItemId(item.id);
                }}
                className="text-muted-foreground hover:text-destructive shrink-0 cursor-pointer"
              >
                <Trash2 size={14} />
              </button>
            </div>
            {expandedItemId === item.id && (
              <div className="border-t border-border p-4 bg-background/40 space-y-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    {t('assessments.linkedControls')}
                  </p>
                  <AssessmentItemControls
                    itemId={item.id}
                    availableControls={controls.map((c) => ({
                      id: c.id,
                      code: c.code,
                      title: c.title,
                    }))}
                  />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    {t('assessments.residualScoring')}
                  </p>
                  {!hasLinkedControls && (
                    <p className="text-[11px] text-muted-foreground/70 mb-2">
                      {t('assessments.residualScoringHint')}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>{t('assessments.residualLikelihood')}</Label>
                      <select
                        value={residualDraft[item.id]?.likelihood ?? item.residualLikelihood ?? ''}
                        disabled={!hasLinkedControls}
                        onChange={(e) =>
                          handleResidualChange(item, 'residualLikelihood', Number(e.target.value))
                        }
                        className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm disabled:opacity-40"
                      >
                        <option value="">{t('risks.selectLikelihood')}</option>
                        {methodology?.likelihoodLabels.map((label, i) => (
                          <option key={i} value={i + 1}>
                            {i + 1} — {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label>{t('assessments.residualImpact')}</Label>
                      <select
                        value={residualDraft[item.id]?.impact ?? item.residualImpact ?? ''}
                        disabled={!hasLinkedControls}
                        onChange={(e) =>
                          handleResidualChange(item, 'residualImpact', Number(e.target.value))
                        }
                        className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm disabled:opacity-40"
                      >
                        <option value="">{t('risks.selectImpact')}</option>
                        {methodology?.impactLabels.map((label, i) => (
                          <option key={i} value={i + 1}>
                            {i + 1} — {label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    {t('assessments.evidence')}
                  </p>
                  <AssessmentItemEvidence orgId={orgId} itemId={item.id} />
                </div>
                {item.linkedRiskId ? (
                  <LinkedRiskSection item={item} />
                ) : (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      {t('assessments.riskRegister')}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setCreateRiskDialogItemId(item.id)}
                      >
                        {t('assessments.createNewRisk')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setLinkRiskDialogItemId(item.id)}
                      >
                        {t('assessments.linkExistingRisk')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))
      )}

      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('assessments.addItem')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateItem} className="space-y-3">
            <div>
              <Label>{t('assessments.subject')}</Label>
              <Input
                value={itemForm.subject}
                onChange={(e) => setItemForm((f) => ({ ...f, subject: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label>{t('assessments.description')}</Label>
              <textarea
                value={itemForm.description}
                onChange={(e) => setItemForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t('assessments.inherentLikelihood')}</Label>
                <select
                  value={itemForm.inherentLikelihood || ''}
                  onChange={(e) =>
                    setItemForm((f) => ({ ...f, inherentLikelihood: Number(e.target.value) }))
                  }
                  required
                  className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm"
                >
                  <option value="">{t('risks.selectLikelihood')}</option>
                  {methodology?.likelihoodLabels.map((label, i) => (
                    <option key={i} value={i + 1}>
                      {i + 1} — {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>{t('assessments.inherentImpact')}</Label>
                <select
                  value={itemForm.inherentImpact || ''}
                  onChange={(e) =>
                    setItemForm((f) => ({ ...f, inherentImpact: Number(e.target.value) }))
                  }
                  required
                  className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm"
                >
                  <option value="">{t('risks.selectImpact')}</option>
                  {methodology?.impactLabels.map((label, i) => (
                    <option key={i} value={i + 1}>
                      {i + 1} — {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setItemDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={createItemMut.isPending}>
                {t('assessments.addItem')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!confirmDeleteItemId}
        onOpenChange={(o) => !o && setConfirmDeleteItemId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('assessments.deleteItemConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('assessments.deleteItemConfirmDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmDeleteItemId(null)}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDeleteItemId) deleteItemMut.mutate(confirmDeleteItemId);
                setConfirmDeleteItemId(null);
              }}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!createRiskDialogItemId} onOpenChange={(o) => !o && closeCreateRiskDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('assessments.createNewRisk')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t('risks.category')}</Label>
              <select
                value={taxonomyCategoryId}
                onChange={(e) => setTaxonomyCategoryId(e.target.value)}
                className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm"
              >
                <option value="">{t('risks.selectCategory')}</option>
                {taxonomy.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeCreateRiskDialog}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={!taxonomyCategoryId || createRiskMut.isPending}
              onClick={() => {
                if (!createRiskDialogItemId) return;
                createRiskMut.mutate(
                  { taxonomyCategoryId },
                  {
                    onSuccess: (created) => {
                      closeCreateRiskDialog();
                      notify.success(t('assessments.riskCreated', { code: created.riskId }));
                    },
                    onError: () => notify.error(t('error.unknown')),
                  },
                );
              }}
            >
              {t('assessments.createNewRisk')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!linkRiskDialogItemId} onOpenChange={(o) => !o && closeLinkRiskDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('assessments.linkExistingRisk')}</DialogTitle>
          </DialogHeader>
          <Combobox
            options={allRisks.map((r) => ({ value: r.id, label: `${r.riskId} — ${r.title}` }))}
            value={selectedRiskId}
            onChange={setSelectedRiskId}
            placeholder={t('assessments.selectRisk')}
          />
          <DialogFooter>
            <Button variant="outline" onClick={closeLinkRiskDialog}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={!selectedRiskId || linkRiskMut.isPending}
              onClick={() => {
                if (!linkRiskDialogItemId) return;
                linkRiskMut.mutate(
                  { riskId: selectedRiskId },
                  {
                    onSuccess: () => closeLinkRiskDialog(),
                    onError: () => notify.error(t('error.unknown')),
                  },
                );
              }}
            >
              {t('assessments.linkExistingRisk')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LinkedRiskSection({ item }: { item: AssessmentItem }) {
  const { t } = useTranslation();
  const notify = useNotify();
  const { data: risk } = useRisk(item.linkedRiskId ?? '');
  const updateRiskMut = useUpdateRisk(item.linkedRiskId ?? '');
  const unlinkMut = useUnlinkAssessmentItemFromRisk(item.id);
  const [reassessOpen, setReassessOpen] = useState(false);
  const [reason, setReason] = useState('');

  const canReassess = item.residualLikelihood != null && item.residualImpact != null;

  function closeReassessDialog() {
    setReassessOpen(false);
    setReason('');
  }

  if (!risk) return null;

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-2">
        {t('assessments.riskRegister')}
      </p>
      <div className="flex items-center gap-2 text-sm">
        <Link
          to="/risks/$id"
          params={{ id: risk.id }}
          className="font-mono text-xs underline text-muted-foreground hover:text-foreground"
        >
          {risk.riskId}
        </Link>
        <span className="text-muted-foreground">{risk.title}</span>
        <button
          type="button"
          onClick={() =>
            unlinkMut.mutate(undefined, { onError: () => notify.error(t('error.unknown')) })
          }
          className="text-muted-foreground hover:text-destructive cursor-pointer text-xs"
        >
          {t('assessments.unlinkRisk')}
        </button>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="mt-2"
        disabled={!canReassess}
        onClick={() => setReassessOpen(true)}
      >
        {t('assessments.submitReassessment')}
      </Button>

      <Dialog open={reassessOpen} onOpenChange={(o) => !o && closeReassessDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('assessments.submitReassessment')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t('assessments.reassessmentCurrent')}: {risk.residualScore ?? '—'} (
            {risk.residualLabel ?? '—'}) → {t('assessments.reassessmentProposed')}:{' '}
            {item.residualScore} ({item.residualLabel})
          </p>
          <div>
            <Label htmlFor="reassess-reason">{t('assessments.reassessmentReason')}</Label>
            <textarea
              id="reassess-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm resize-none"
              required
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeReassessDialog}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={!reason.trim() || updateRiskMut.isPending}
              onClick={() =>
                updateRiskMut.mutate(
                  {
                    residualLikelihood: item.residualLikelihood,
                    residualImpact: item.residualImpact,
                    reason: reason.trim(),
                  },
                  {
                    onSuccess: () => closeReassessDialog(),
                    onError: () => notify.error(t('error.unknown')),
                  },
                )
              }
            >
              {t('assessments.submitReassessment')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
