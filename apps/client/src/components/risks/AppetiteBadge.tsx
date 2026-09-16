import { useTranslation } from 'react-i18next';

interface AppetiteBadgeProps {
  aboveAppetite: boolean | null | undefined;
}

export function AppetiteBadge({ aboveAppetite }: AppetiteBadgeProps) {
  const { t } = useTranslation();

  if (aboveAppetite == null) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${
        aboveAppetite
          ? 'bg-red-500/10 text-red-400 border-red-500/20'
          : 'bg-green-500/10 text-green-400 border-green-500/20'
      }`}
    >
      {aboveAppetite ? t('risks.aboveAppetite') : t('risks.withinAppetite')}
    </span>
  );
}
