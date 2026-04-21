import { h } from 'preact';
import { useState } from 'preact/hooks';
import type { EnrichListingResponse } from '@landmatch/api';

import { sendMessage } from '../../shared/messages';

type ScoreCardProps =
  | { state: 'loading' }
  | { state: 'error'; error: string; onRetry: () => void }
  | { state: 'loaded'; data: EnrichListingResponse };

const SOIL_LABELS: Record<number, string> = {
  1: 'Class I — Few limitations',
  2: 'Class II — Moderate limitations',
  3: 'Class III — Severe limitations',
  4: 'Class IV — Very severe limitations',
  5: 'Class V — Unsuitable for cultivation',
  6: 'Class VI — Severe limitations, pasture only',
  7: 'Class VII — Very severe, woodland only',
  8: 'Class VIII — Recreation/wildlife only',
};

function getSoilLabel(cls: number | null): string {
  if (cls == null) return 'Unknown';
  return SOIL_LABELS[cls] ?? `Class ${cls}`;
}

function getFloodColor(zone: string | null): string {
  if (!zone) return '#6b7280';
  const upper = zone.toUpperCase();
  if (upper === 'X' || upper === 'C' || upper === 'B') return '#22c55e';
  if (upper.startsWith('A') || upper.startsWith('V')) return '#ef4444';
  return '#eab308';
}

function getFloodLabel(zone: string | null): string {
  if (!zone) return 'Unknown';
  const upper = zone.toUpperCase();
  if (upper === 'X') return 'Minimal risk';
  if (upper === 'A' || upper === 'AE') return 'High risk (100-yr floodplain)';
  if (upper === 'V' || upper === 'VE') return 'High risk (coastal flood)';
  return zone;
}

function computeSimplifiedScore(data: EnrichListingResponse['enrichment']): number | null {
  const components: number[] = [];

  // Soil component (0-100): lower capability class = better
  if (data.soilCapabilityClass != null) {
    components.push(Math.max(0, 100 - (data.soilCapabilityClass - 1) * 14));
  }

  // Flood component (0-100)
  if (data.femaFloodZone) {
    const upper = data.femaFloodZone.toUpperCase();
    if (upper === 'X' || upper === 'C' || upper === 'B') components.push(95);
    else if (upper.startsWith('A') || upper.startsWith('V')) components.push(20);
    else components.push(50);
  }

  if (components.length === 0) return null;
  return Math.round(components.reduce((a, b) => a + b, 0) / components.length);
}

function getScoreColor(score: number): string {
  if (score >= 70) return '#22c55e';
  if (score >= 40) return '#eab308';
  return '#ef4444';
}

const styles = {
  card: `
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 16px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    max-width: 480px;
    color: #1a1a1a;
    font-size: 14px;
    line-height: 1.5;
  `,
  header: `
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  `,
  badge: (color: string) => `
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: ${color};
    color: white;
    font-size: 18px;
    font-weight: 700;
  `,
  label: `
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #6b7280;
    margin-bottom: 2px;
  `,
  value: `
    font-size: 14px;
    font-weight: 500;
  `,
  row: `
    display: flex;
    gap: 24px;
    margin-bottom: 8px;
  `,
  col: `
    flex: 1;
  `,
  button: `
    display: inline-block;
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid #e5e7eb;
    background: #fff;
    color: #1a1a1a;
    cursor: pointer;
    font-size: 13px;
  `,
  primaryButton: `
    display: inline-block;
    padding: 6px 12px;
    border-radius: 6px;
    border: none;
    background: #2563eb;
    color: #fff;
    cursor: pointer;
    font-size: 13px;
  `,
  toggle: `
    background: none;
    border: none;
    color: #6b7280;
    cursor: pointer;
    font-size: 13px;
    padding: 4px;
  `,
  spinner: `
    display: inline-block;
    width: 20px;
    height: 20px;
    border: 2px solid #e5e7eb;
    border-top-color: #2563eb;
    border-radius: 50%;
    animation: lm-spin 0.6s linear infinite;
  `,
  title: `
    font-size: 16px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
  `,
  dot: (color: string) => `
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${color};
  `,
};

const keyframes = `@keyframes lm-spin { to { transform: rotate(360deg); } }`;

export function ScoreCard(props: ScoreCardProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (props.state === 'loading') {
    return (
      <div style={styles.card}>
        <style>{keyframes}</style>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style={styles.spinner} />
          <span>Enriching listing with LandMatch...</span>
        </div>
      </div>
    );
  }

  if (props.state === 'error') {
    return (
      <div style={styles.card}>
        <div style={styles.title}>LandMatch</div>
        <p style="color:#ef4444;margin:8px 0;">{props.error}</p>
        <button style={styles.button} onClick={props.onRetry}>
          Retry
        </button>
      </div>
    );
  }

  const { data } = props;
  const { enrichment } = data;
  const score = computeSimplifiedScore(enrichment);

  async function handleSave() {
    setSaving(true);
    try {
      await sendMessage({ type: 'SAVE_LISTING', payload: { listingId: data.listing.id } });
      setSaved(true);
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.card}>
      <style>{keyframes}</style>
      <div style={styles.header}>
        <div style={styles.title}>
          LandMatch
          {score != null && (
            <span style={styles.badge(getScoreColor(score))}>{score}</span>
          )}
        </div>
        <button style={styles.toggle} onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? 'Expand' : 'Collapse'}
        </button>
      </div>

      {!collapsed && (
        <>
          <div style={styles.row}>
            <div style={styles.col}>
              <div style={styles.label}>Soil</div>
              <div style={styles.value}>
                {getSoilLabel(enrichment.soilCapabilityClass)}
              </div>
            </div>
            <div style={styles.col}>
              <div style={styles.label}>Flood Zone</div>
              <div style={`${styles.value};color:${getFloodColor(enrichment.femaFloodZone)}`}>
                {enrichment.femaFloodZone ?? 'Unknown'}
                {' — '}
                {getFloodLabel(enrichment.femaFloodZone)}
              </div>
            </div>
          </div>

          <div style={styles.row}>
            <div style={styles.col}>
              <div style={styles.label}>Drainage</div>
              <div style={styles.value}>{enrichment.soilDrainageClass ?? 'Unknown'}</div>
            </div>
            <div style={styles.col}>
              <div style={styles.label}>Soil Texture</div>
              <div style={styles.value}>{enrichment.soilTexture ?? 'Unknown'}</div>
            </div>
          </div>

          <div style="display:flex;gap:8px;margin-top:12px;">
            <button
              style={styles.primaryButton}
              onClick={handleSave}
              disabled={saving || saved}
            >
              {saved ? 'Saved' : saving ? 'Saving...' : 'Save to Dashboard'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
