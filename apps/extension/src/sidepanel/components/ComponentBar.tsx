import { h } from 'preact';
import { getScoreColor, getScoreTier, HOMESTEAD_COMPONENT_LABELS } from '../../shared/scoring';
import { COMPONENT_ICONS } from '../icons';

interface ComponentBarProps {
  componentKey: string;
  score: number;
  label: string;
  dense?: boolean;
}

export function ComponentBar({ componentKey, score, label, dense }: ComponentBarProps) {
  const Icon = COMPONENT_ICONS[componentKey];
  const color = getScoreColor(score);
  const tier = getScoreTier(score);
  const displayLabel = HOMESTEAD_COMPONENT_LABELS[componentKey as keyof typeof HOMESTEAD_COMPONENT_LABELS] ?? componentKey;

  return (
    <div style={{ marginBottom: dense ? 6 : 10 }}>
      <div class="bar-grid">
        <div class="bar-label">
          {Icon && <Icon size={12} style={{ color, flexShrink: 0 }} />}
          <span style={{ fontSize: dense ? 11.5 : 12 }}>{displayLabel}</span>
        </div>
        <span class="bar-score" style={{ color }}>{score}</span>
      </div>
      <div class="bar-track">
        <div class={`bar-fill bg-${tier}`} style={{ width: `${score}%` }} />
      </div>
      {!dense && <div class="bar-detail">{label}</div>}
    </div>
  );
}
