import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { type SyntheticEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import {
  useAuthStore,
  useNotify,
  setStoredLocale,
  SUPPORTED_LOCALES,
} from '@icore/template-shared';
import { api } from '@/lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

type Mode = 'password' | 'magicLinkRequest' | 'magicLinkSent';

function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notify = useNotify();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handlePasswordSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const session = await api<{
        accessToken: string;
        refreshToken: string;
        user: { id: string; email: string; role?: string };
      }>('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      setAuth(session);
      notify.success(t('auth.login'));
      await navigate({ to: '/dashboard' });
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t('error.unknown'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMagicLinkSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api('/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setMode('magicLinkSent');
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t('error.unknown'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-[#020617]">
      {/* Left — branding panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-[#0f172a] border-r border-[#1e293b]">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          <span className="font-semibold text-white tracking-tight text-sm">
            Compliance<span className="text-green-500">IQ</span>
          </span>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-green-500/10 border border-green-500/20">
            <ShieldCheck className="w-8 h-8 text-green-500" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white leading-tight">
              Cyber Governance &<br />
              Compliance Intelligence
            </h1>
            <p className="mt-3 text-slate-400 text-base leading-relaxed max-w-sm">
              AI-driven standards generation, gap analysis, and security posture scoring — all in
              one platform.
            </p>
          </div>
          <ul className="space-y-3">
            {[
              'Automated compliance controls via AI',
              'Real-time gap analysis & risk scoring',
              'Multi-framework support (NIST, ISO 27001, SOC 2)',
              'Executive dashboard & audit trail',
            ].map((f) => (
              <li key={f} className="flex items-center gap-3 text-sm text-slate-300">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-slate-600">
          © {new Date().getFullYear()} Cyber Governance & Compliance Intelligence Platform
        </p>
      </div>

      {/* Right — form panel */}
      <div className="flex flex-1 flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between px-8 py-4 lg:justify-end">
          <div className="flex items-center gap-2 lg:hidden">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            <span className="font-semibold text-white text-sm">
              Compliance<span className="text-green-500">IQ</span>
            </span>
          </div>
          <div className="flex items-center gap-1">
            {SUPPORTED_LOCALES.map(({ code, label }) => (
              <button
                key={code}
                type="button"
                onClick={() => {
                  setStoredLocale(code);
                  window.location.reload();
                }}
                className="text-xs px-2 py-1 rounded text-slate-500 hover:text-slate-300 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Form */}
        <div className="flex flex-1 items-center justify-center px-8 pb-12">
          <div className="w-full max-w-sm space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-white">{t('auth.signIn')}</h2>
              <p className="mt-1 text-sm text-slate-400">{t('auth.signInSubtitle')}</p>
            </div>

            {/* OAuth */}
            {mode !== 'magicLinkSent' && (
              <button
                type="button"
                onClick={() => window.location.assign('/api/auth/oauth/google')}
                className="w-full flex items-center justify-center gap-3 rounded-md bg-white px-4 py-2.5 text-sm font-medium text-[#1f1f1f] shadow-sm hover:bg-[#f8f8f8] active:bg-[#efefef] transition-colors cursor-pointer"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden="true">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                {t('auth.continueWithGoogle')}
              </button>
            )}

            {mode !== 'magicLinkSent' && (
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-[#1e293b]" />
                <span className="text-xs text-slate-600">{t('common.or')}</span>
                <div className="flex-1 h-px bg-[#1e293b]" />
              </div>
            )}

            {/* Mode toggle */}
            {mode !== 'magicLinkSent' && (
              <div className="flex rounded-lg border border-[#1e293b] p-1 gap-1">
                <button
                  type="button"
                  onClick={() => setMode('password')}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    mode === 'password'
                      ? 'bg-[#1e293b] text-white'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {t('auth.withPassword')}
                </button>
                <button
                  type="button"
                  onClick={() => setMode('magicLinkRequest')}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    mode === 'magicLinkRequest'
                      ? 'bg-[#1e293b] text-white'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {t('auth.withMagicLink')}
                </button>
              </div>
            )}

            {/* Password form */}
            {mode === 'password' && (
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-slate-300 text-xs font-medium">
                    {t('auth.email')}
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="bg-[#0f172a] border-[#1e293b] text-white placeholder:text-slate-600 focus:border-green-500/50 focus:ring-green-500/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-slate-300 text-xs font-medium">
                    {t('auth.password')}
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="bg-[#0f172a] border-[#1e293b] text-white placeholder:text-slate-600 focus:border-green-500/50 focus:ring-green-500/20"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-green-500 text-[#020617] font-semibold hover:bg-green-400 disabled:opacity-50"
                >
                  {submitting ? t('common.loading') : t('auth.login')}
                </Button>
              </form>
            )}

            {/* Magic link form */}
            {mode === 'magicLinkRequest' && (
              <form onSubmit={handleMagicLinkSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email-ml" className="text-slate-300 text-xs font-medium">
                    {t('auth.email')}
                  </Label>
                  <Input
                    id="email-ml"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="bg-[#0f172a] border-[#1e293b] text-white placeholder:text-slate-600 focus:border-green-500/50 focus:ring-green-500/20"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-green-500 text-[#020617] font-semibold hover:bg-green-400 disabled:opacity-50"
                >
                  {submitting ? t('common.loading') : t('auth.sendMagicLink')}
                </Button>
              </form>
            )}

            {/* Magic link sent */}
            {mode === 'magicLinkSent' && (
              <div className="space-y-4 text-center">
                <div className="flex items-center justify-center w-12 h-12 mx-auto rounded-full bg-green-500/10 border border-green-500/20">
                  <ShieldCheck className="w-6 h-6 text-green-500" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">{t('auth.magicLinkSent')}</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    {t('auth.magicLinkSentDescription', { email })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEmail('');
                    setMode('magicLinkRequest');
                  }}
                  className="text-sm text-slate-400 hover:text-white transition-colors underline underline-offset-4"
                >
                  {t('auth.magicLinkUseDifferentEmail')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute('/login')({
  component: LoginPage,
});
