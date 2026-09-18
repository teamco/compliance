import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Plus, Trash2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { safeHref } from '@/lib/safe-href';
import { useNotify } from '@icore/template-shared';
import type { RequirementEvidence } from '@icore/shared';
import { useControlEvidence, useCreateControlEvidence } from '@/queries/controls';
import { useFrameworkEvidence, useCreateFrameworkEvidence } from '@/queries/frameworks';
import { useRiskEvidence, useCreateRiskEvidence } from '@/queries/risks';
import { useAssessmentItemEvidence, useCreateAssessmentItemEvidence } from '@/queries/assessments';
import { useAssetEvidence, useCreateAssetEvidence } from '@/queries/assets';
import { useUpdateEvidence, useDeleteEvidence, useReviewEvidence } from '@/queries/evidence';

type OwnerType = 'control' | 'framework' | 'risk' | 'assessmentItem' | 'asset';

interface EvidencePanelProps {
  orgId: string;
  ownerType: OwnerType;
  ownerId: string;
  currentUserId: string;
  /** Framework evidence only: narrow the list to items linked to one requirement. */
  requirementFilter?: string;
}

const EMPTY_FORM = {
  title: '',
  owner: '',
  evidenceType: '',
  source: '',
  collectionDate: '',
  periodCovered: '',
  expirationDate: '',
  url: '',
};

function useOwnerEvidence(props: EvidencePanelProps) {
  const control = useControlEvidence(props.ownerType === 'control' ? props.ownerId : '');
  const framework = useFrameworkEvidence(
    props.ownerType === 'framework' ? props.ownerId : '',
    props.orgId,
  );
  const risk = useRiskEvidence(props.ownerType === 'risk' ? props.ownerId : '');
  const assessmentItem = useAssessmentItemEvidence(
    props.ownerType === 'assessmentItem' ? props.ownerId : '',
  );
  const asset = useAssetEvidence(props.ownerType === 'asset' ? props.ownerId : '');

  switch (props.ownerType) {
    case 'control':
      return control.data ?? [];
    case 'framework':
      return (framework.data ?? []).filter(
        (e) => !props.requirementFilter || e.requirementId === props.requirementFilter,
      );
    case 'risk':
      return risk.data ?? [];
    case 'assessmentItem':
      return assessmentItem.data ?? [];
    case 'asset':
      return asset.data ?? [];
  }
}

function useCreateOwnerEvidence(props: EvidencePanelProps) {
  const control = useCreateControlEvidence(props.orgId, props.ownerId);
  const framework = useCreateFrameworkEvidence(props.orgId, props.ownerId);
  const risk = useCreateRiskEvidence(props.orgId, props.ownerId);
  const assessmentItem = useCreateAssessmentItemEvidence(props.orgId, props.ownerId);
  const asset = useCreateAssetEvidence(props.orgId, props.ownerId);

  switch (props.ownerType) {
    case 'control':
      return control;
    case 'framework':
      return framework;
    case 'risk':
      return risk;
    case 'assessmentItem':
      return assessmentItem;
    case 'asset':
      return asset;
  }
}

export function EvidencePanel(props: EvidencePanelProps) {
  const { t } = useTranslation();
  const notify = useNotify();
  const evidence = useOwnerEvidence(props);
  const createMut = useCreateOwnerEvidence(props);
  const updateMut = useUpdateEvidence();
  const deleteMut = useDeleteEvidence();
  const reviewMut = useReviewEvidence();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');

  function handleCreate() {
    if (!form.title.trim()) return;
    // The gateway forces verificationStatus/verifiedBy/verifiedAt server-side for all 5
    // owner types (createdBy too) — the mutation input types omit them, so the payload
    // built here must not include them.
    const base = {
      title: form.title,
      owner: form.owner,
      evidenceType: form.evidenceType,
      source: form.source,
      collectionDate: form.collectionDate || new Date().toISOString(),
      periodCovered: form.periodCovered,
      expirationDate: form.expirationDate,
      url: form.url || undefined,
    };
    const payload =
      props.ownerType === 'framework'
        ? { ...base, frameworkId: props.ownerId, requirementId: props.requirementFilter }
        : base;
    createMut.mutate(payload as never, {
      onSuccess: () => {
        setForm(EMPTY_FORM);
        setOpen(false);
      },
      onError: () => notify.error(t('error.unknown')),
    });
  }

  function handleSaveEdit(id: string) {
    updateMut.mutate(
      {
        id,
        patch: {
          title: editForm.title,
          owner: editForm.owner,
          evidenceType: editForm.evidenceType,
          source: editForm.source,
          collectionDate: editForm.collectionDate,
          periodCovered: editForm.periodCovered,
          expirationDate: editForm.expirationDate,
          url: editForm.url || undefined,
        },
      },
      {
        onSuccess: () => setEditingId(null),
        onError: () => notify.error(t('error.unknown')),
      },
    );
  }

  function startEdit(e: RequirementEvidence) {
    setEditingId(e.id);
    setEditForm({
      title: e.title,
      owner: e.owner,
      evidenceType: e.evidenceType,
      source: e.source,
      collectionDate: e.collectionDate,
      periodCovered: e.periodCovered,
      expirationDate: e.expirationDate ?? '',
      url: e.url ?? '',
    });
  }

  function handleDelete(id: string) {
    deleteMut.mutate(id, { onError: () => notify.error(t('error.unknown')) });
  }

  function handleReject() {
    if (!rejectId || !rejectNotes.trim()) return;
    reviewMut.mutate(
      { id: rejectId, decision: 'rejected', reviewNotes: rejectNotes.trim() },
      {
        onSuccess: () => {
          setRejectId(null);
          setRejectNotes('');
        },
        onError: () => notify.error(t('error.unknown')),
      },
    );
  }

  return (
    <div className="space-y-3">
      {evidence.length === 0 ? (
        <p className="text-xs text-muted-foreground italic bg-muted/20 p-4 rounded border text-center">
          {t('evidence.empty')}
        </p>
      ) : (
        <div className="space-y-2">
          {evidence.map((e) => {
            const href = safeHref(e.url);
            const isEditing = editingId === e.id;
            const canReview = e.createdBy !== props.currentUserId;
            if (isEditing) {
              return (
                <div key={e.id} className="space-y-1.5 border border-border rounded p-2">
                  <Input
                    value={editForm.title}
                    onChange={(ev) => setEditForm((f) => ({ ...f, title: ev.target.value }))}
                    placeholder={t('evidence.titlePlaceholder')}
                    className="h-8 text-xs"
                  />
                  <Input
                    value={editForm.url}
                    onChange={(ev) => setEditForm((f) => ({ ...f, url: ev.target.value }))}
                    placeholder={t('evidence.urlPlaceholder')}
                    className="h-8 text-xs"
                  />
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" onClick={() => handleSaveEdit(e.id)}>
                      {t('common.save')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      {t('common.cancel')}
                    </Button>
                  </div>
                </div>
              );
            }
            return (
              <div key={e.id} className="text-xs border border-border rounded px-3 py-2 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{e.title}</span>
                  <span className="text-muted-foreground/70">
                    {t(`evidence.status.${e.verificationStatus}`)}
                  </span>
                </div>
                <div className="text-muted-foreground/70">
                  {e.owner} · {e.evidenceType}
                </div>
                {e.url &&
                  (href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground/70 underline cursor-pointer"
                    >
                      {e.url}
                    </a>
                  ) : (
                    <span className="text-muted-foreground/70">{e.url}</span>
                  ))}
                {e.verificationStatus === 'rejected' && e.reviewNotes && (
                  <p className="text-destructive/80">{e.reviewNotes}</p>
                )}
                <div className="flex items-center gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => startEdit(e)}
                    className="text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    {t('common.edit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(e.id)}
                    className="text-muted-foreground hover:text-destructive cursor-pointer"
                  >
                    <Trash2 size={12} className="inline mr-0.5" />
                    {t('common.delete')}
                  </button>
                  {canReview && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          reviewMut.mutate(
                            { id: e.id, decision: 'verified' },
                            { onError: () => notify.error(t('error.unknown')) },
                          )
                        }
                        className="text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        <CheckCircle2 size={12} className="inline mr-0.5" />
                        {t('evidence.verify')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRejectId(e.id);
                          setRejectNotes('');
                        }}
                        className="text-muted-foreground hover:text-destructive cursor-pointer"
                      >
                        <XCircle size={12} className="inline mr-0.5" />
                        {t('evidence.reject')}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {open ? (
        <div className="space-y-1.5 border border-border rounded p-2">
          <Label className="text-xs">{t('evidence.titlePlaceholder')}</Label>
          <Input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder={t('evidence.titlePlaceholder')}
            className="h-8 text-xs"
          />
          <Input
            value={form.owner}
            onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))}
            placeholder={t('evidence.ownerPlaceholder')}
            className="h-8 text-xs"
          />
          <Input
            value={form.evidenceType}
            onChange={(e) => setForm((f) => ({ ...f, evidenceType: e.target.value }))}
            placeholder={t('evidence.typePlaceholder')}
            className="h-8 text-xs"
          />
          <Input
            value={form.source}
            onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
            placeholder={t('evidence.sourcePlaceholder')}
            className="h-8 text-xs"
          />
          <Input
            type="date"
            value={form.collectionDate.slice(0, 10)}
            onChange={(e) => setForm((f) => ({ ...f, collectionDate: e.target.value }))}
            className="h-8 text-xs"
          />
          <Input
            value={form.periodCovered}
            onChange={(e) => setForm((f) => ({ ...f, periodCovered: e.target.value }))}
            placeholder={t('evidence.periodPlaceholder')}
            className="h-8 text-xs"
          />
          <Input
            type="date"
            value={form.expirationDate.slice(0, 10)}
            onChange={(e) => setForm((f) => ({ ...f, expirationDate: e.target.value }))}
            className="h-8 text-xs"
          />
          <Input
            value={form.url}
            onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            placeholder={t('evidence.urlPlaceholder')}
            className="h-8 text-xs"
          />
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={!form.title.trim() || createMut.isPending}
            >
              {t('common.save')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setOpen(false);
                setForm(EMPTY_FORM);
              }}
            >
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setForm(EMPTY_FORM);
            setOpen(true);
          }}
        >
          <Plus size={14} className="mr-1.5" />
          {t('evidence.addEvidence')}
        </Button>
      )}
      <AlertDialog
        open={!!confirmDeleteId}
        onOpenChange={(isOpen) => !isOpen && setConfirmDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('evidence.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('evidence.deleteConfirmDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDeleteId) handleDelete(confirmDeleteId);
                setConfirmDeleteId(null);
              }}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={!!rejectId}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setRejectId(null);
            setRejectNotes('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('evidence.rejectDialogTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('evidence.rejectDialogDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={rejectNotes}
            onChange={(ev) => setRejectNotes(ev.target.value)}
            placeholder={t('evidence.rejectNotesPlaceholder')}
            rows={3}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleReject} disabled={!rejectNotes.trim()}>
              {t('evidence.reject')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
