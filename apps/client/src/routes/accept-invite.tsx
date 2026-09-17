import { useEffect, useState } from 'react';
import { createFileRoute, useSearch, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@icore/template-shared';
import { useNotify } from '@icore/template-shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';

interface InvitePreview {
  orgName: string;
  role: string;
  email: string;
  expiresAt: string;
}

export const Route = createFileRoute('/accept-invite')({
  validateSearch: (search: Record<string, unknown>) => ({ token: String(search['token'] ?? '') }),
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const { t } = useTranslation();
  const notify = useNotify();
  const { token } = useSearch({ from: '/accept-invite' });
  const accessToken = useAuthStore((s) => s.accessToken);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!token) return;
    api<InvitePreview>(`/auth/org-invites/${token}`)
      .then(setPreview)
      .catch(() => setError(t('acceptInvite.notFound')));
  }, [token, t]);

  async function handleAccept() {
    setAccepting(true);
    try {
      await api(`/auth/org-invites/${token}/accept`, { method: 'POST' });
      setAccepted(true);
      notify.success(t('acceptInvite.success'));
    } catch {
      notify.error(t('acceptInvite.failed'));
    } finally {
      setAccepting(false);
    }
  }

  if (error) return <div className="p-6">{error}</div>;
  if (!preview) return <div className="p-6">{t('common.loading')}</div>;

  if (!accessToken) {
    return (
      <div className="p-6 space-y-4">
        <p>{t('acceptInvite.preview', { orgName: preview.orgName, role: preview.role })}</p>
        <p className="text-sm text-muted-foreground">{t('acceptInvite.loginPrompt')}</p>
        <Button asChild>
          <Link to="/login">{t('auth.signIn')}</Link>
        </Button>
      </div>
    );
  }

  if (accepted) return <div className="p-6">{t('acceptInvite.doneRedirect')}</div>;

  return (
    <div className="p-6 space-y-4">
      <p>{t('acceptInvite.preview', { orgName: preview.orgName, role: preview.role })}</p>
      <Button onClick={() => void handleAccept()} disabled={accepting}>
        {t('acceptInvite.acceptButton')}
      </Button>
    </div>
  );
}
