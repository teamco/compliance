import { useState } from 'react';
import { Building2, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNotify } from '@icore/template-shared';
import {
  useCreateOrganization,
  useDeleteOrganization,
  useOrganizations,
  type Organization,
  type OrganizationInput,
} from '@/queries/notes';
import { useActiveOrgStore } from '@/stores/active-org';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSnapshotOrg, setEditSnapshotOrg] = useState<Organization | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const orgList = orgs ?? [];
  const filteredOrgs = orgList.filter((org) =>
    org.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  async function handleCreate(data: OrganizationInput) {
    try {
      const org = await create.mutateAsync(data);
      setActiveOrgId(org.id);
      setCreateOpen(false);
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
      <div className="w-full space-y-4 p-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 bg-surface border border-border rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-green-500/10 border border-green-500/20">
          <Building2 size={18} className="text-green-500" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">{t('org.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('org.subtitle')}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={t('org.search')}
          placeholder={t('org.searchPlaceholder')}
          className="w-full sm:max-w-sm"
        />
        <Button variant="outline" onClick={() => setCreateOpen(true)} className="gap-2 sm:ms-auto">
          <Plus size={14} />
          {t('org.createNew')}
        </Button>
      </div>

      {/* Create — Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{t('org.createTitle')}</DialogTitle>
          </DialogHeader>
          <OrgForm
            initial={EMPTY_FORM}
            onSave={(data) => void handleCreate(data)}
            isPending={create.isPending}
            submitLabel={t('org.createOrganization')}
          />
        </DialogContent>
      </Dialog>

      {/* Edit — Sheet */}
      <Sheet open={editingId !== null} onOpenChange={(open) => !open && setEditingId(null)}>
        <SheetContent
          className="w-full max-w-110"
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <SheetHeader>
            <SheetTitle>{t('org.editTitle')}</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1">
            {editSnapshotOrg && (
              <EditOrgForm
                org={editSnapshotOrg}
                onSaved={() => setEditingId(null)}
                onCancel={() => setEditingId(null)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      <OrgList
        orgs={filteredOrgs}
        activeOrgId={activeOrgId}
        onEdit={(orgId) => {
          const org = orgList.find((o) => o.id === orgId) ?? null;
          setEditSnapshotOrg(org);
          setEditingId(orgId);
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
