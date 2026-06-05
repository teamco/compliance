import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore, useNotify } from '@icore/template-shared';
import { Loader2 } from 'lucide-react';

type Status = 'restoring' | 'done' | 'error';

function parseJwtPayload(token: string): Record<string, unknown> {
  try {
    const base64 = (token.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function OAuthCallbackPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notify = useNotify();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [status, setStatus] = useState<Status>('restoring');

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '');
    const params = new URLSearchParams(hash);

    // Supabase implicit flow: access_token / refresh_token (snake_case)
    // Gateway server redirect: accessToken / refreshToken (camelCase)
    const accessToken = params.get('access_token') ?? params.get('accessToken');
    const refreshToken = params.get('refresh_token') ?? params.get('refreshToken');

    if (!accessToken || !refreshToken) {
      setStatus('error');
      notify.error(t('auth.oauthCallbackMissingTokens'));
      void navigate({ to: '/login' });
      return;
    }

    const userId = params.get('userId') ?? (parseJwtPayload(accessToken)['sub'] as string) ?? '';
    const email = params.get('email') ?? (parseJwtPayload(accessToken)['email'] as string) ?? '';

    setAuth({ accessToken, refreshToken, user: { id: userId, email } });

    void (async () => {
      // Fetch role — assigns it on first OAuth login (idempotent).
      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.ok) {
          const me = (await res.json()) as { uid?: string; email?: string; role?: string };
          if (me.role) {
            setAuth({ accessToken, refreshToken, user: { id: userId, email, role: me.role } });
          }
        }
      } catch {
        // Non-fatal: role missing but login still succeeds.
      }
      setStatus('done');
      void navigate({ to: '/dashboard' });
    })();
  }, []);

  return (
    <main className="bg-background flex min-h-screen items-center justify-center p-6">
      <div className="flex flex-col items-center gap-3">
        {status === 'restoring' && (
          <>
            <Loader2 className="text-muted-foreground size-8 animate-spin" />
            <p className="text-muted-foreground text-sm">{t('auth.callbackVerifying')}</p>
          </>
        )}
        {status === 'error' && <p className="text-destructive text-sm">{t('auth.oauthFailed')}</p>}
      </div>
    </main>
  );
}

export const Route = createFileRoute('/auth/oauth/callback')({ component: OAuthCallbackPage });
