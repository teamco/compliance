import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotify } from '@icore/template-shared';
import { useCreateOrgInvite, type OrgInviteRole } from '@/queries/org-members';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface InviteMemberDialogProps {
  orgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EMPTY_FORM = { email: '', role: 'viewer' as OrgInviteRole };

export function InviteMemberDialog({ orgId, open, onOpenChange }: InviteMemberDialogProps) {
  const { t } = useTranslation();
  const notify = useNotify();
  const createInvite = useCreateOrgInvite(orgId);
  const [form, setForm] = useState(EMPTY_FORM);

  function close() {
    onOpenChange(false);
    setForm(EMPTY_FORM);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const email = form.email.trim();
    if (!email) return;
    try {
      await createInvite.mutateAsync({ email, role: form.role });
      notify.success(t('org.members.invited'));
      close();
    } catch {
      notify.error(t('error.unknown'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(next) : close())}>
      <DialogContent
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t('org.members.inviteTitle')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">{t('org.members.emailLabel')}</Label>
            <Input
              id="invite-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="name@company.com"
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('org.members.roleLabel')}</Label>
            <Select
              value={form.role}
              onValueChange={(v) => setForm((f) => ({ ...f, role: v as OrgInviteRole }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">{t('org.members.roleAdmin')}</SelectItem>
                <SelectItem value="viewer">{t('org.members.roleViewer')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={close}
              disabled={createInvite.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={createInvite.isPending || !form.email.trim()}>
              {createInvite.isPending ? t('common.saving') : t('org.members.send')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
