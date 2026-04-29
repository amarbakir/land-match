import { h } from 'preact';
import { getScoreColor } from '../../shared/scoring';

interface ScoreRingProps {
  score: number | null;
  size?: number;
  stroke?: number;
  label?: string;
}

export function ScoreRing({ score, size = 56, stroke = 3.5, label }: ScoreRingProps) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (Math.max(0, Math.min(100, score ?? 0)) / 100) * c;
  const color = score != null ? getScoreColor(score) : 'var(--text-faint)';

  return (
    <div style={{ width: size, height: size, position: 'relative', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
      <svg width={size} height={size} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--border-soft)" stroke-width={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} stroke-width={stroke} fill="none"
          stroke-dasharray={c} stroke-dashoffset={off} stroke-linecap="round" />
      </svg>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: size > 60 ? 18 : 13, fontWeight: 600, color }}>
        {score ?? '—'}
      </div>
      {label && (
        <div style={{
          position: 'absolute', bottom: -16, fontSize: 9,
          fontFamily: 'var(--font-mono)', color: 'var(--text-faint)',
          letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>
          {label}
        </div>
      )}
    </div>
  );
}
