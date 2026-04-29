import { h } from 'preact';
import { Layers } from '../icons';

export function IdleView() {
  return (
    <div class="center-container">
      <Layers size={32} style={{ color: 'var(--text-faint)' }} />
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 16, fontWeight: 500, color: 'var(--text)' }}>
        No listing detected
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5, maxWidth: 260 }}>
        Browse a LandWatch listing to see soil, flood, and scoring data automatically.
      </div>
    </div>
  );
}
