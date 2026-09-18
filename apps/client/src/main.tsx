import './globals.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import {
  AbilityProvider,
  createIcoreI18n,
  ICORE_LOCALES,
  useThemeStore,
} from '@icore/template-shared';
import { I18nextProvider } from 'react-i18next';
import { Toaster } from 'sonner';
import { AuthBootstrap } from './app/auth-bootstrap';
import { routeTree } from './routeTree.gen';
import { setApiUnauthorizedHandler } from './lib/api';
import { wireShadcnNotifier } from './lib/notify';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

const router = createRouter({ routeTree, context: { queryClient } });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const i18n = createIcoreI18n({ resources: ICORE_LOCALES });

setApiUnauthorizedHandler(() => {
  // Guard against re-nesting returnTo when several protected requests 401 in a
  // burst (e.g. after token expiry) and this handler fires more than once.
  if (router.state.location.pathname === '/login') return;
  void router.navigate({ to: '/login', search: { returnTo: router.state.location.href } });
});

wireShadcnNotifier();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {
    // SW registration failure is non-fatal
  });
}

// Apply the theme class before React mounts so the first paint is correct
const applyTheme = (mode: 'light' | 'dark') => {
  document.documentElement.classList.toggle('dark', mode === 'dark');
};
applyTheme(useThemeStore.getState().mode);
useThemeStore.subscribe((s) => applyTheme(s.mode));

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <AbilityProvider>
          <AuthBootstrap>
            <RouterProvider router={router} />
            <Toaster richColors />
          </AuthBootstrap>
        </AbilityProvider>
      </QueryClientProvider>
    </I18nextProvider>
  </StrictMode>,
);
