import { useState } from 'react';
import { Users, UserPlus, RotateCw, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNotify } from '@icore/template-shared';
import {
  useOrgMembers,
  useOrgInvites,
  useRevokeOrgInvite,
  useResendOrgInvite,
  type OrgMemberRole,
} from '@/queries/org-members';
import { Button } from '@/components/ui/button';
import { InviteMemberDialog } from './-invite-member-dialog';

const ROLE_STYLES: Record<OrgMemberRole, string> = {
  owner: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  admin: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  viewer: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
};

interface MembersSectionProps {
  orgId: string;
}

export function MembersSection({ orgId }: MembersSectionProps) {
  const { t } = useTranslation();
  const notify = useNotify();
  const { data: members, isPending: membersPending } = useOrgMembers(orgId);
  const { data: invites, isPending: invitesPending } = useOrgInvites(orgId);
  const revokeInvite = useRevokeOrgInvite(orgId);
  const resendInvite = useResendOrgInvite(orgId);
  const [inviteOpen, setInviteOpen] = useState(false);

  const memberList = members ?? [];
  const inviteList = invites ?? [];

  async function handleRevoke(inviteId: string) {
    try {
      await revokeInvite.mutateAsync(inviteId);
      notify.success(t('org.members.revoked'));
    } catch {
      notify.error(t('error.unknown'));
    }
  }

  async function handleResend(inviteId: string) {
    try {
      await resendInvite.mutateAsync(inviteId);
      notify.success(t('org.members.resent'));
    } catch {
      notify.error(t('error.unknown'));
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">{t('org.members.title')}</h2>
        </div>
        <Button size="sm" variant="outline" onClick={() => setInviteOpen(true)} className="gap-1.5">
          <UserPlus size={14} />
          {t('org.members.inviteButton')}
        </Button>
      </div>

      <div className="space-y-2">
        {membersPending ? (
          <div className="h-10 bg-muted/40 rounded-lg animate-pulse" />
        ) : memberList.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('org.members.noMembers')}</p>
        ) : (
          memberList.map((member) => (
            <div
              key={member.userId}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/40 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-foreground">
                  {member.displayName || member.email || member.userId}
                </p>
                {member.email && member.displayName && (
                  <p className="truncate text-[11px] text-muted-foreground">{member.email}</p>
                )}
              </div>
              <span
                className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${
                  ROLE_STYLES[member.role] || ROLE_STYLES.viewer
                }`}
              >
                {t(`org.members.role${capitalize(member.role)}` as never, {
                  defaultValue: member.role,
                })}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-muted-foreground">
          {t('org.members.pendingInvites')}
        </h3>
        {invitesPending ? (
          <div className="h-10 bg-muted/40 rounded-lg animate-pulse" />
        ) : inviteList.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('org.members.noInvites')}</p>
        ) : (
          inviteList.map((invite) => (
            <div
              key={invite.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/40 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-foreground">{invite.email}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {t(`org.members.role${capitalize(invite.role)}` as never, {
                    defaultValue: invite.role,
                  })}{' '}
                  · {new Date(invite.expiresAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  title={t('org.members.resend')}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                  disabled={resendInvite.isPending}
                  onClick={() => void handleResend(invite.id)}
                >
                  <RotateCw size={13} />
                  <span className="sr-only">{t('org.members.resend')}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  title={t('org.members.revoke')}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  disabled={revokeInvite.isPending}
                  onClick={() => void handleRevoke(invite.id)}
                >
                  <XCircle size={13} />
                  <span className="sr-only">{t('org.members.revoke')}</span>
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <InviteMemberDialog orgId={orgId} open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}

function capitalize(value: string): string {
  return value.length ? value[0].toUpperCase() + value.slice(1) : value;
}
