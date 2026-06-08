import { useState } from 'react';
import { Building2, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNotify } from '@icore/template-shared';
import {
  useCreateOrganization,
  useDeleteOrganization,
  useOrganizations,
  type OrganizationInput,
} from '@/queries/notes';
import { useActiveOrgStore } from '@/stores/active-org';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { EMPTY_FORM } from './-constants';
import { OrgForm } from './-org-form';
import { EditOrgForm } from './-edit-org-form';
import { OrgList } from './-org-list';
import { DeleteOrgDialog } from './-delete-org-dialog';

export function OrgPage() {
  const { t } = useTranslation();
  const notify = useNotify();
  const { data: orgs, isPending } = useOrganizations();
  const create = useCreateOrganization();
  const deleteOrg = useDeleteOrganization();
  const { activeOrgId, setActiveOrgId } = useActiveOrgStore();
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const orgList = orgs ?? [];
  const editingOrg = orgList.find((org) => org.id === editingId);

  function closeModal() {
    setModalMode(null);
    setEditingId(null);
  }

  async function handleCreate(data: OrganizationInput) {
    try {
      const org = await create.mutateAsync(data);
      setActiveOrgId(org.id);
      closeModal();
      notify.success(t('org.created'));
    } catch {
      notify.error(t('error.unknown'));
    }
  }

  async function handleDelete(orgId: string) {
    try {
      await deleteOrg.mutateAsync(orgId);
      if (activeOrgId === orgId) setActiveOrgId(null);
      notify.success(t('org.deleted'));
    } catch {
      notify.error(t('error.unknown'));
    } finally {
      setConfirmDeleteId(null);
    }
  }

  if (isPending) {
    return (
      <div className="p-6 space-y-4 max-w-2xl">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 bg-surface border border-border rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-green-500/10 border border-green-500/20">
          <Building2 size={18} className="text-green-500" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">{t('org.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('org.subtitle')}</p>
        </div>
      </div>

      <Button variant="outline" onClick={() => setModalMode('create')} className="gap-2">
        <Plus size={14} />
        {t('org.createNew')}
      </Button>

      <Sheet open={modalMode !== null} onOpenChange={(open) => !open && closeModal()}>
        <SheetContent className="w-full max-w-[440px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {modalMode === 'edit' ? t('org.editTitle') : t('org.createTitle')}
            </SheetTitle>
          </SheetHeader>
          <div className="p-4">
            {modalMode === 'create' && (
              <OrgForm
                initial={EMPTY_FORM}
                onSave={(data) => void handleCreate(data)}
                isPending={create.isPending}
                submitLabel={t('org.save')}
              />
            )}
            {modalMode === 'edit' && editingOrg && (
              <EditOrgForm org={editingOrg} onSaved={closeModal} />
            )}
          </div>
        </SheetContent>
      </Sheet>

      <OrgList
        orgs={orgList}
        activeOrgId={activeOrgId}
        onEdit={(orgId) => {
          setEditingId(orgId);
          setModalMode('edit');
        }}
        onDelete={setConfirmDeleteId}
      />

      <DeleteOrgDialog
        open={confirmDeleteId !== null}
        isPending={deleteOrg.isPending}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteId(null);
        }}
        onConfirm={() => {
          if (confirmDeleteId) void handleDelete(confirmDeleteId);
        }}
      />
    </div>
  );
}
