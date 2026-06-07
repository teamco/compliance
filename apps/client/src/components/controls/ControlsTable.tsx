import { useTranslation } from 'react-i18next';
import type { Framework, StandardControl, StandardControlPriority } from '../../queries/notes';

const PRIORITY_CLASS: Record<StandardControlPriority, string> = {
  critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  medium: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  low: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
};

interface ControlsTableProps {
  controls: StandardControl[];
  frameworks: Framework[];
  showGapsOnly: boolean;
}

export function ControlsTable({ controls, frameworks, showGapsOnly }: ControlsTableProps) {
  const { t } = useTranslation();
  const visible = showGapsOnly && frameworks.length > 0
    ? controls.filter(
        (c) => !frameworks.every((fw) => c.frameworkMappings.some((m) => m.frameworkId === fw.id)),
      )
    : controls;

  if (visible.length === 0) {
    const message =
      frameworks.length === 0
        ? t('controls.selectFramework')
        : showGapsOnly
          ? t('controls.noGaps')
          : t('controls.noControls');
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        {message}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface">
            <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs">{t('controls.colCode')}</th>
            <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs">{t('controls.colTitle')}</th>
            <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs">{t('controls.colPriority')}</th>
            <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs">{t('controls.colCategory')}</th>
            {frameworks.map((fw) => (
              <th
                key={fw.id}
                className="px-3 py-2.5 text-center font-medium text-muted-foreground text-xs whitespace-nowrap"
              >
                {fw.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((control, i) => (
            <tr
              key={control.code}
              className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${i % 2 === 0 ? '' : 'bg-muted/10'}`}
            >
              <td className="px-3 py-2.5 font-mono text-xs text-foreground whitespace-nowrap">
                {control.code}
              </td>
              <td className="px-3 py-2.5 text-foreground max-w-[260px] truncate">
                {control.title}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${PRIORITY_CLASS[control.priority]}`}
                >
                  {control.priority}
                </span>
              </td>
              <td className="px-3 py-2.5 text-muted-foreground text-xs whitespace-nowrap">
                {control.category}
              </td>
              {frameworks.map((fw) => {
                const mapping = control.frameworkMappings.find((m) => m.frameworkId === fw.id);
                return (
                  <td key={fw.id} className="px-3 py-2.5 text-center">
                    {mapping ? (
                      <span
                        title={mapping.controlCode}
                        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-500/10 border border-green-500/20 text-green-500 text-[10px] font-bold cursor-default"
                      >
                        ✓
                      </span>
                    ) : (
                      <span
                        data-unmapped="true"
                        className="inline-block w-4 h-px bg-muted-foreground/20"
                      />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
