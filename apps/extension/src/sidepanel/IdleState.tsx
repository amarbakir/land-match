import { h } from 'preact';

export function IdleState() {
  return (
    <div class="idle-container">
      <div style="font-size: 32px;">🌱</div>
      <p style="font-weight: 500; color: #1a1a1a;">No listing detected</p>
      <p>Browse a LandWatch listing to see soil, flood, and scoring data automatically.</p>
    </div>
  );
}
