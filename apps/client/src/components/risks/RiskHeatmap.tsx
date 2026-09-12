import { useTranslation } from 'react-i18next';
import type { Risk, RiskMethodology, RiskScoreLabel } from '@icore/shared';

const LABEL_COLOR: Record<RiskScoreLabel, string> = {
  low: 'bg-green-500/20 text-green-400',
  medium: 'bg-amber-500/20 text-amber-400',
  high: 'bg-orange-500/20 text-orange-400',
  critical: 'bg-red-500/20 text-red-400',
};

interface RiskHeatmapProps {
  risks: Risk[];
  methodology: RiskMethodology;
  mode: 'inherent' | 'residual';
  onCellClick: (likelihood: number, impact: number) => void;
}

export function RiskHeatmap({ risks, methodology, mode, onCellClick }: RiskHeatmapProps) {
  const { t } = useTranslation();
  const size = methodology.scaleSize;

  function labelForScore(score: number): RiskScoreLabel {
    const band = methodology.thresholds.find((band) => score <= band.maxScore);
    return band?.label ?? 'critical';
  }

  function countAt(likelihood: number, impact: number): number {
    return risks.filter((r) =>
      mode === 'inherent'
        ? r.inherentLikelihood === likelihood && r.inherentImpact === impact
        : r.residualLikelihood === likelihood && r.residualImpact === impact,
    ).length;
  }

  return (
    <div className="inline-block">
      <div className="flex flex-col-reverse gap-1">
        {Array.from({ length: size }, (_, i) => i + 1).map((impact) => (
          <div key={impact} className="flex gap-1">
            {Array.from({ length: size }, (_, i) => i + 1).map((likelihood) => {
              const count = countAt(likelihood, impact);
              const label = labelForScore(likelihood * impact);
              return (
                <button
                  key={likelihood}
                  type="button"
                  onClick={() => onCellClick(likelihood, impact)}
                  className={`w-14 h-14 rounded flex items-center justify-center text-sm font-semibold cursor-pointer transition-transform hover:scale-105 ${LABEL_COLOR[label]}`}
                  title={`${t('risks.heatmap.likelihood')}: ${methodology.likelihoodLabels[likelihood - 1]}, ${t('risks.heatmap.impact')}: ${methodology.impactLabels[impact - 1]}`}
                >
                  {count > 0 ? count : ''}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-2">{t('risks.heatmap.axisLabel')}</p>
    </div>
  );
}
