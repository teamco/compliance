import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Pencil, Plus, Server, Trash2 } from 'lucide-react';
import { useDraft, useNotify } from '@icore/template-shared';
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
import { EditSheet } from '@/components/EditSheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UnsavedChangesDialog } from '@/components/ui/unsaved-changes-dialog';
import { PageLayout } from '@/components/PageLayout';
import { useActiveOrgStore } from '@/stores/active-org';
import {
  useAssets,
  useCreateAsset,
  useDeleteAsset,
  useUpdateAsset,
  type Asset,
  type AssetInput,
  type AssetPatch,
} from '@/queries/assets';

export const Route = createFileRoute('/_dashboard/assets')({
  component: AssetsPage,
});

const CRITICALITY_COLORS: Record<Asset['criticality'], string> = {
  critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  low: 'bg-green-500/10 text-green-400 border-green-500/20',
};

const ASSET_TYPES: Array<Asset['type']> = [
  'service',
  'application',
  'infrastructure',
  'data',
  'device',
  'other',
];
const CRITICALITY_LEVELS: Array<Asset['criticality']> = ['critical', 'high', 'medium', 'low'];

const EMPTY_FORM: AssetInput = {
  name: '',
  type: 'service',
  criticality: 'medium',
  description: '',
  owner: '',
};

function AssetsPage() {
  const { t } = useTranslation();
  const { activeOrgId } = useActiveOrgStore();
  const orgId = activeOrgId ?? '';

  const { data: assets = [], isPending } = useAssets(orgId);
  const createMut = useCreateAsset(orgId);
  const deleteMut = useDeleteAsset(orgId);
  const updateMut = useUpdateAsset(orgId);
  const notify = useNotify();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSnapshotAsset, setEditSnapshotAsset] = useState<Asset | null>(null);
  const [editForm, setEditForm] = useState<AssetPatch>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<AssetInput>(EMPTY_FORM);
  const isCreateDirty = open && JSON.stringify(form) !== JSON.stringify(EMPTY_FORM);
  const createDraft = useDraft(isCreateDirty);

  const isEditDirty =
    editingId !== null &&
    (editForm.name !== editSnapshotAsset?.name ||
      editForm.type !== editSnapshotAsset?.type ||
      editForm.criticality !== editSnapshotAsset?.criticality ||
      editForm.owner !== editSnapshotAsset?.owner ||
      editForm.description !== editSnapshotAsset?.description);
  const editDraft = useDraft(isEditDirty);

  function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    if (!editForm.name?.trim() || !editForm.owner?.trim()) return;
    updateMut.mutate(
      { id: editingId, patch: editForm },
      {
        onSuccess: () => {
          setEditingId(null);
          notify.success(t('assets.updated'));
        },
        onError: () => notify.error(t('error.unknown')),
      },
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.owner) return;
    createMut.mutate(form, {
      onSuccess: () => {
        setOpen(false);
        setForm(EMPTY_FORM);
        notify.success(t('assets.created'));
      },
      onError: () => notify.error(t('error.unknown')),
    });
  }

  return (
    <PageLayout title={t('nav.assets')}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t('assets.subtitle')}</p>
        <Button size="sm" onClick={() => setOpen(true)} disabled={!orgId}>
          <Plus size={14} className="mr-1.5" />
          {t('assets.addAsset')}
        </Button>
      </div>

      {isPending ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-28 bg-surface border border-border rounded-xl animate-pulse"
            />
          ))}
        </div>
      ) : assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <Server size={32} className="opacity-30" />
          <p className="text-sm">{t('assets.empty')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {assets.map((asset) => (
            <div
              key={asset.id}
              className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-2"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-sm text-foreground truncate">{asset.name}</span>
                <span
                  className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border shrink-0 ${CRITICALITY_COLORS[asset.criticality]}`}
                >
                  {t(`assets.criticality.${asset.criticality}`)}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground/60">
                {t(`assets.type.${asset.type}`)} · {asset.owner}
              </p>
              {asset.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">{asset.description}</p>
              )}
              <div className="flex items-center justify-end gap-2 mt-auto pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setEditSnapshotAsset(asset);
                    setEditForm({
                      name: asset.name,
                      type: asset.type,
                      criticality: asset.criticality,
                      owner: asset.owner,
                      description: asset.description,
                    });
                    setEditingId(asset.id);
                  }}
                  className="text-xs text-muted-foreground/50 hover:text-foreground transition-colors flex items-center gap-1"
                >
                  <Pencil size={11} />
                  {t('common.edit')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(asset.id)}
                  className="text-xs text-muted-foreground/50 hover:text-destructive transition-colors"
                >
                  {t('common.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Server size={18} className="text-primary" />
              {t('assets.addAsset')}
            </DialogTitle>
            <DialogDescription>{t('assets.addDescription')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('assets.name')}</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t('assets.namePlaceholder')}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t('assets.typeLabel')}</Label>
                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, type: e.target.value as Asset['type'] }))
                  }
                  className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40"
                >
                  {ASSET_TYPES.map((tp) => (
                    <option key={tp} value={tp}>
                      {t(`assets.type.${tp}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>{t('assets.criticality.label')}</Label>
                <select
                  value={form.criticality}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, criticality: e.target.value as Asset['criticality'] }))
                  }
                  className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40"
                >
                  {CRITICALITY_LEVELS.map((c) => (
                    <option key={c} value={c}>
                      {t(`assets.criticality.${c}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('assets.owner')}</Label>
              <Input
                value={form.owner}
                onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))}
                placeholder={t('assets.ownerPlaceholder')}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t('assets.description')}</Label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40 resize-none"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={createMut.isPending}>
                {createMut.isPending ? t('common.saving') : t('common.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => !open && setConfirmDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 size={18} className="text-destructive" />
              {t('assets.deleteTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('assets.deleteDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDeleteId) deleteMut.mutate(confirmDeleteId);
                setConfirmDeleteId(null);
              }}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit — Sheet */}
      <EditSheet
        open={editingId !== null}
        onClose={() => setEditingId(null)}
        title={t('assets.editTitle')}
        onSubmit={handleEditSubmit}
        isPending={updateMut.isPending}
        saveDisabled={!editForm.name?.trim() || !editForm.owner?.trim()}
      >
        {editSnapshotAsset && (
          <>
            <div className="flex flex-col gap-3">
              <Label>{t('assets.name')}</Label>
              <Input
                value={editForm.name ?? ''}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t('assets.namePlaceholder')}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-3">
                <Label>{t('assets.typeLabel')}</Label>
                <select
                  value={editForm.type ?? 'service'}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, type: e.target.value as Asset['type'] }))
                  }
                  className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40"
                >
                  {ASSET_TYPES.map((tp) => (
                    <option key={tp} value={tp}>
                      {t(`assets.type.${tp}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-3">
                <Label>{t('assets.criticality.label')}</Label>
                <select
                  value={editForm.criticality ?? 'medium'}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      criticality: e.target.value as Asset['criticality'],
                    }))
                  }
                  className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40"
                >
                  {CRITICALITY_LEVELS.map((c) => (
                    <option key={c} value={c}>
                      {t(`assets.criticality.${c}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <Label>{t('assets.owner')}</Label>
              <Input
                value={editForm.owner ?? ''}
                onChange={(e) => setEditForm((f) => ({ ...f, owner: e.target.value }))}
                placeholder={t('assets.ownerPlaceholder')}
                required
              />
            </div>
            <div className="flex flex-col gap-3">
              <Label>{t('assets.description')}</Label>
              <textarea
                value={editForm.description ?? ''}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40 resize-none"
              />
            </div>
          </>
        )}
      </EditSheet>
      <UnsavedChangesDialog
        open={createDraft.showDialog || editDraft.showDialog}
        onConfirm={createDraft.showDialog ? createDraft.confirmLeave : editDraft.confirmLeave}
        onCancel={createDraft.showDialog ? createDraft.cancelLeave : editDraft.cancelLeave}
      />
    </PageLayout>
  );
}
