import { useTranslation } from 'react-i18next';
import { useThemeStore } from '@icore/template-shared';
import { useUserPrefs, useUpdatePrefs } from '../../queries/settings';
import type { Theme, Language } from '../../queries/settings';

const THEMES: { value: Theme; labelKey: string }[] = [
  { value: 'light', labelKey: 'settings.theme.light' },
  { value: 'dark', labelKey: 'settings.theme.dark' },
  { value: 'system', labelKey: 'settings.theme.system' },
];

const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Русский' },
  { value: 'he', label: 'עברית' },
  { value: 'es', label: 'Español' },
];

export function AppearanceTab() {
  const { t, i18n } = useTranslation();
  const { data: prefs, isPending } = useUserPrefs();
  const { mutate: updatePrefs } = useUpdatePrefs();

  const storeMode = useThemeStore((s) => s.mode);
  const currentTheme: Theme = prefs?.theme ?? (storeMode as Theme) ?? 'system';
  const currentLang: Language = prefs?.language ?? (i18n.language as Language) ?? 'en';

  function handleThemeChange(theme: Theme) {
    const resolvedMode =
      theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : theme;
    useThemeStore.getState?.().setMode(resolvedMode);
    updatePrefs({ theme });
  }

  function handleLanguageChange(lang: Language) {
    i18n.changeLanguage(lang);
    updatePrefs({ language: lang });
  }

  if (isPending) {
    return <div className="text-sm text-muted-foreground">{t('common.loading')}</div>;
  }

  return (
    <div className="max-w-xl space-y-8">
      <section>
        <h2 className="mb-1 text-sm font-semibold text-foreground">{t('settings.theme.title')}</h2>
        <p className="mb-3 text-xs text-muted-foreground">{t('settings.theme.subtitle')}</p>
        <div className="flex gap-2">
          {THEMES.map(({ value, labelKey }) => (
            <button
              key={value}
              type="button"
              onClick={() => handleThemeChange(value)}
              className={[
                'rounded-md border px-4 py-2 text-sm font-medium transition-colors',
                currentTheme === value
                  ? 'border-green-500/40 bg-green-500/10 text-green-500'
                  : 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold text-foreground">
          {t('settings.language.title')}
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">{t('settings.language.subtitle')}</p>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => handleLanguageChange(value)}
              className={[
                'rounded-md border px-4 py-2 text-sm font-medium transition-colors',
                currentLang === value
                  ? 'border-green-500/40 bg-green-500/10 text-green-500'
                  : 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
