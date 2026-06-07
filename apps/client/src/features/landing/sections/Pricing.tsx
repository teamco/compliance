import type { CSSProperties } from 'react';
import { SubscriptionWidget } from '@idevconn/isubscribe-widget-react';
import { useTranslation } from 'react-i18next';
import { SectionHeader } from '../components/SectionHeader';

/* Map widget tokens → sec project CSS vars */
const TOKEN_BRIDGE: CSSProperties & Record<`--${string}`, string> = {
  '--isw-font': 'var(--font-sans)',
  '--isw-surface': 'var(--color-background)',
  '--isw-surface-hover': 'var(--color-surface)',
  '--isw-text': 'var(--color-muted-foreground)',
  '--isw-text-strong': 'var(--color-foreground)',
  '--isw-text-muted': 'var(--color-muted-foreground)',
  '--isw-accent': 'var(--color-primary)',
  '--isw-accent-hover': '#16a34a',
  '--isw-accent-text': 'var(--color-primary-foreground)',
  '--isw-accent-price-text': 'var(--color-primary)',
  '--isw-success': '#10b981',
  '--isw-error': '#ef4444',
  '--isw-sale': '#ef4444',
  '--isw-sale-text': '#ffffff',
  '--isw-trial-bg': 'rgba(34,197,94,0.08)',
  '--isw-trial-text': 'var(--color-primary)',
  '--isw-border': 'var(--color-border)',
  '--isw-radius': 'var(--radius-default)',
  '--isw-radius-pill': '100px',
  '--isw-gap': '20px',
  '--isw-padding': '28px',
  '--isw-shadow-card': '0 1px 4px rgba(0,0,0,0.06)',
  '--isw-shadow-card-hover': '0 8px 24px rgba(0,0,0,0.08)',
  '--isw-button-bg': 'var(--color-background)',
  '--isw-button-color': 'var(--color-foreground)',
  '--isw-button-border': 'var(--color-border)',
  '--isw-button-bg-hover': 'var(--color-surface)',
  '--isw-button-color-hover': 'var(--color-foreground)',
  '--isw-button-border-hover': 'var(--color-muted-foreground)',
};

/* Featured plan override — green highlight matching the landing accent */
const FEATURED_OVERRIDE: CSSProperties & Record<string, string> = {
  '--isw-accent': 'var(--color-primary)',
  '--isw-accent-hover': '#16a34a',
  '--isw-accent-text': 'var(--color-primary-foreground)',
  '--isw-button-bg': 'var(--color-primary)',
  '--isw-button-color': 'var(--color-primary-foreground)',
  '--isw-button-border': 'var(--color-primary)',
  '--isw-button-bg-hover': '#16a34a',
  '--isw-button-border-hover': '#16a34a',
  borderColor: 'rgba(34,197,94,0.4)',
  background: 'radial-gradient(circle at top, rgba(34,197,94,0.08), transparent 60%), var(--color-background)',
  boxShadow: '0 0 0 1px rgba(34,197,94,0.25), 0 8px 32px rgba(34,197,94,0.08)',
};

export function Pricing() {
  const { t } = useTranslation();
  const apiKey = import.meta.env.VITE_PUBLIC_TENANT_KEY as string | undefined;
  const apiBase =
    (import.meta.env.VITE_ISUBSCRIBE_API_URL as string | undefined) ??
    'https://isubscribe.me/api/v1';
  const apiBaseUrl = `${apiBase}/public/subscriptions`;

  return (
    <section className="py-24" id="pricing">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <SectionHeader
          eyebrow="Pricing"
          title="Simple, transparent pricing."
          description="Start free and scale as your compliance program grows. No hidden fees, no long-term contracts."
        />

        <div className="mt-14" style={TOKEN_BRIDGE}>
          {apiKey ? (
            <SubscriptionWidget
              apiKey={apiKey}
              apiBaseUrl={apiBaseUrl}
              style={TOKEN_BRIDGE}
              containerClassName="isw-pricing-grid"
              classNames={{
                loader: 'text-center py-16 text-sm text-muted-foreground',
                error: 'text-center py-16 text-sm text-destructive',
                empty: 'text-center py-16 text-sm text-muted-foreground',
              }}
              subscriptionOverrides={{
                // cspell:disable-next-line
                hhIbUDJnDNklg0kszQ2a: {
                  badge: t('subscription.popular'),
                  style: FEATURED_OVERRIDE,
                },
                // cspell:disable-next-line
                qwUpL0slwC3tA6Z1XORn: {
                  buttonText: t('subscription.price.custom'),
                },
              }}
              onSubscribe={(sub) => console.log('subscribed:', sub)}
            />
          ) : (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Pricing not available.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
