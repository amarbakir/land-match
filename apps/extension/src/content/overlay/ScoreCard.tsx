import { h } from 'preact';
import { useState } from 'preact/hooks';
import type { EnrichListingResponse } from '@landmatch/api';

import { sendMessage } from '../../shared/messages';
import {
  getSoilLabel,
  getFloodColor,
  getFloodLabel,
  getOverallScore,
  getScoreColor,
  HOMESTEAD_COMPONENT_LABELS,
  HOMESTEAD_DISPLAY_ORDER,
} from '../../shared/scoring';

type ScoreCardProps =
  | { state: 'loading' }
  | { state: 'error'; error: string; onRetry: () => void }
  | { state: 'loaded'; data: EnrichListingResponse };

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
  barRow: `
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  `,
  barLabel: `
    font-size: 12px;
    color: #6b7280;
    width: 120px;
    flex-shrink: 0;
  `,
  barTrack: `
    flex: 1;
    height: 8px;
    background: #e5e7eb;
    border-radius: 4px;
    overflow: hidden;
  `,
  barFill: (color: string, pct: number) => `
    height: 100%;
    width: ${pct}%;
    background: ${color};
    border-radius: 4px;
  `,
  barScore: `
    font-size: 12px;
    font-weight: 600;
    width: 28px;
    text-align: right;
    flex-shrink: 0;
  `,
  barDetail: `
    font-size: 11px;
    color: #9ca3af;
    margin: -4px 0 8px 128px;
  `,
};

const keyframes = `@keyframes lm-spin { to { transform: rotate(360deg); } }`;

export function ScoreCard(props: ScoreCardProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

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
  const score = getOverallScore(data);
  const hasHomestead = data.homesteadComponents != null;

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    try {
      const result = await sendMessage({ type: 'SAVE_LISTING', payload: { listingId: data.listing.id } });
      if (result && typeof result === 'object' && 'error' in result && result.error) {
        setSaveError(String(result.error));
      } else {
        setSaved(true);
      }
    } catch (err) {
      setSaveError('Failed to save. Please sign in and try again.');
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
          {hasHomestead ? (
            <div style="margin-bottom: 8px;">
              {HOMESTEAD_DISPLAY_ORDER.map((key) => {
                const comp = data.homesteadComponents![key];
                if (!comp) return null;
                const color = getScoreColor(comp.score);
                return (
                  <div key={key}>
                    <div style={styles.barRow}>
                      <div style={styles.barLabel}>{HOMESTEAD_COMPONENT_LABELS[key] ?? key}</div>
                      <div style={styles.barTrack}>
                        <div style={styles.barFill(color, comp.score)} />
                      </div>
                      <div style={`${styles.barScore};color:${color}`}>{comp.score}</div>
                    </div>
                    <div style={styles.barDetail} title={comp.label}>{comp.label}</div>
                  </div>
                );
              })}
            </div>
          ) : (
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
            </>
          )}

          <div style="display:flex;gap:8px;margin-top:12px;align-items:center;">
            <button
              style={styles.primaryButton}
              onClick={handleSave}
              disabled={saving || saved}
            >
              {saved ? 'Saved' : saving ? 'Saving...' : 'Save to Dashboard'}
            </button>
            {saveError && <span style="color:#ef4444;font-size:12px;">{saveError}</span>}
          </div>
        </>
      )}
    </div>
  );
}
