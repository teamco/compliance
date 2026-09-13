import { useState } from 'react';
import type React from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@icore/template-shared';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { PageLayout } from '@/components/PageLayout';
import { useActiveOrgStore } from '@/stores/active-org';
import { useAssessmentTypes } from '@/queries/assessment-types';
import { AssessmentItemControls } from '@/components/assessments/AssessmentItemControls';
import { useRiskMethodology } from '@/queries/risks';
import { useInternalControlsList } from '@/queries/controls';
import {
  useAssessment,
  useAssessmentItems,
  useCreateAssessmentItem,
  useDeleteAssessmentItem,
  useStartAssessment,
  useSubmitForReview,
  useApproveAssessment,
  useRequestChanges,
  useCompleteAssessment,
  useArchiveAssessment,
  type AssessmentItemInput,
} from '@/queries/assessments';

export function AssessmentDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/_dashboard/assessments_/$id' });
  const navigate = useNavigate();
  const { activeOrgId } = useActiveOrgStore();
  const orgId = activeOrgId ?? '';
  const currentUserId = useAuthStore((s) => s.user?.id);

  const { data: assessment, isPending } = useAssessment(id);
  const { data: types = [] } = useAssessmentTypes(orgId);
  const startMut = useStartAssessment(orgId, id);
  const submitMut = useSubmitForReview(orgId, id);
  const approveMut = useApproveAssessment(orgId, id);
  const requestChangesMut = useRequestChanges(orgId, id);
  const completeMut = useCompleteAssessment(orgId, id);
  const archiveMut = useArchiveAssessment(orgId, id);

  const { data: items = [] } = useAssessmentItems(id);
  const { data: methodology } = useRiskMethodology(orgId);
  const { data: controls = [] } = useInternalControlsList(orgId);
  const createItemMut = useCreateAssessmentItem(id);
  const deleteItemMut = useDeleteAssessmentItem(id);

  const [tab, setTab] = useState<'overview' | 'items'>('overview');
  const [changesNote, setChangesNote] = useState('');
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [itemForm, setItemForm] = useState<AssessmentItemInput>({
    subject: '',
    description: '',
    inherentLikelihood: 0,
    inherentImpact: 0,
  });
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

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

  if (isPending || !assessment) {
    return (
      <PageLayout title={t('assessments.detailTitle')}>
        <div className="h-64 bg-surface border border-border rounded-lg animate-pulse" />
      </PageLayout>
    );
  }

  const typeName = types.find((ty) => ty.id === assessment.assessmentTypeId)?.name ?? '—';
  const isOwner = currentUserId === assessment.ownerId;
  const isApprover = currentUserId === assessment.approverId;

  return (
    <PageLayout title={`${assessment.assessmentCode} — ${assessment.title}`}>
      <button
        type="button"
        onClick={() => void navigate({ to: '/assessments' })}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
      >
        <ArrowLeft size={14} />
        {t('assessments.backToList')}
      </button>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1">
          {(['overview', 'items'] as const).map((tKey) => (
            <button
              key={tKey}
              type="button"
              onClick={() => setTab(tKey)}
              className={`px-3 py-2 text-sm border-b-2 -mb-px cursor-pointer ${
                tab === tKey
                  ? 'border-green-500 text-foreground font-medium'
                  : 'border-transparent text-muted-foreground'
              }`}
            >
              {t(`assessments.tab.${tKey}`)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {assessment.status === 'draft' && isOwner && (
            <Button size="sm" onClick={() => startMut.mutate()}>
              {t('assessments.start')}
            </Button>
          )}
          {(assessment.status === 'in_progress' || assessment.status === 'changes_requested') &&
            isOwner && (
              <Button size="sm" onClick={() => submitMut.mutate()}>
                {t('assessments.submitForReview')}
              </Button>
            )}
          {assessment.status === 'pending_review' && isApprover && (
            <>
              <Button size="sm" onClick={() => approveMut.mutate()}>
                {t('assessments.approve')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!changesNote.trim()) return;
                  requestChangesMut.mutate(
                    { note: changesNote.trim() },
                    {
                      onSuccess: () => setChangesNote(''),
                    },
                  );
                }}
              >
                {t('assessments.requestChanges')}
              </Button>
            </>
          )}
          {assessment.status === 'approved' && isOwner && (
            <Button size="sm" onClick={() => completeMut.mutate()}>
              {t('assessments.complete')}
            </Button>
          )}
          {(assessment.status === 'draft' || assessment.status === 'completed') && isOwner && (
            <Button size="sm" variant="outline" onClick={() => archiveMut.mutate()}>
              {t('assessments.archive')}
            </Button>
          )}
        </div>
      </div>

      {assessment.status === 'pending_review' && isApprover && (
        <div className="mb-4">
          <Input
            value={changesNote}
            onChange={(e) => setChangesNote(e.target.value)}
            placeholder={t('assessments.changesNotePlaceholder')}
          />
        </div>
      )}

      {tab === 'overview' && (
        <div className="grid grid-cols-2 gap-4 text-sm">
          <Field label={t('assessments.colCode')} value={assessment.assessmentCode} />
          <Field label={t('assessments.title')} value={assessment.title} />
          <Field label={t('assessments.type')} value={typeName} />
          <Field label={t('assessments.owner')} value={assessment.ownerId} />
          <Field label={t('assessments.businessUnit')} value={assessment.businessUnit ?? ''} />
          <Field label={t('assessments.approver')} value={assessment.approverId ?? ''} />
          <Field label={t('assessments.dueDate')} value={assessment.dueDate?.slice(0, 10) ?? ''} />
          <Field
            label={t('assessments.colStatus')}
            value={t(`assessments.status.${assessment.status}`)}
          />
          <Field
            label={t('assessments.colInherent')}
            value={
              assessment.highestInherentScore != null
                ? String(assessment.highestInherentScore)
                : '—'
            }
          />
          <Field
            label={t('assessments.colResidual')}
            value={
              assessment.highestResidualScore != null
                ? String(assessment.highestResidualScore)
                : '—'
            }
          />
          {assessment.lastReviewNote && (
            <div className="col-span-2">
              <Field label={t('assessments.lastReviewNote')} value={assessment.lastReviewNote} />
            </div>
          )}
        </div>
      )}

      {tab === 'items' && (
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
                  <span className="text-lg font-bold tabular-nums shrink-0">
                    {item.inherentScore}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground">{item.subject}</p>
                    {item.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {item.description}
                      </p>
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
                      deleteItemMut.mutate(item.id);
                    }}
                    className="text-muted-foreground hover:text-destructive shrink-0 cursor-pointer"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {expandedItemId === item.id && (
                  <div className="border-t border-border p-4 bg-background/40">
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
                )}
              </div>
            ))
          )}
        </div>
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
              <Button type="submit" disabled={createItemMut.isPending}>
                {t('assessments.addItem')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-foreground">{value || '—'}</div>
    </div>
  );
}
