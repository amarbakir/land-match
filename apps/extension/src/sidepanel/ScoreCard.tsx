import { h } from 'preact';
import { useState } from 'preact/hooks';
import type { EnrichListingResponse } from '@landmatch/api';
import type { SaveListingResultMessage } from '../shared/messages';
import { sendMessage } from '../shared/messages';
import {
  getSoilLabel,
  getFloodColor,
  getFloodLabel,
  getOverallScore,
  getScoreColor,
  HOMESTEAD_COMPONENT_LABELS,
  HOMESTEAD_DISPLAY_ORDER,
} from '../shared/scoring';

interface ScoreCardProps {
  data: EnrichListingResponse;
}

export function ScoreCard({ data }: ScoreCardProps) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  const { enrichment } = data;
  const score = getOverallScore(data);
  const hasHomestead = data.homesteadComponents != null;

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    try {
      const result = await sendMessage<SaveListingResultMessage>({
        type: 'SAVE_LISTING',
        payload: { listingId: data.listing.id },
      });
      if (result.error || !result.payload) {
        setSaveError(result.error ?? 'Save failed');
      } else {
        setSaved(true);
      }
    } catch (err) {
      setSaveError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div class="panel">
      <div class="header">
        <div class="title">
          LandMatch
          {score != null && (
            <span class="score-badge" style={`background:${getScoreColor(score)}`}>
              {score}
            </span>
          )}
        </div>
      </div>

      {hasHomestead ? (
        <div style="margin-bottom: 8px;">
          {HOMESTEAD_DISPLAY_ORDER.map((key) => {
            const comp = data.homesteadComponents![key];
            if (!comp) return null;
            const color = getScoreColor(comp.score);
            return (
              <div key={key}>
                <div class="bar-row">
                  <div class="bar-label">{HOMESTEAD_COMPONENT_LABELS[key] ?? key}</div>
                  <div class="bar-track">
                    <div class="bar-fill" style={`width:${comp.score}%;background:${color}`} />
                  </div>
                  <div class="bar-score" style={`color:${color}`}>{comp.score}</div>
                </div>
                <div class="bar-detail">{comp.label}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <div class="data-row">
            <div class="data-col">
              <div class="data-label">Soil</div>
              <div class="data-value">{getSoilLabel(enrichment.soilCapabilityClass)}</div>
            </div>
            <div class="data-col">
              <div class="data-label">Flood Zone</div>
              <div class="data-value" style={`color:${getFloodColor(enrichment.femaFloodZone)}`}>
                {enrichment.femaFloodZone ?? 'Unknown'} — {getFloodLabel(enrichment.femaFloodZone)}
              </div>
            </div>
          </div>
          <div class="data-row">
            <div class="data-col">
              <div class="data-label">Drainage</div>
              <div class="data-value">{enrichment.soilDrainageClass ?? 'Unknown'}</div>
            </div>
            <div class="data-col">
              <div class="data-label">Soil Texture</div>
              <div class="data-value">{enrichment.soilTexture ?? 'Unknown'}</div>
            </div>
          </div>
        </>
      )}

      <div class="actions">
        <button
          class="btn"
          onClick={handleSave}
          disabled={saving || saved}
          style="width: auto;"
        >
          {saved ? '✓ Saved' : saving ? 'Saving...' : 'Save to Dashboard'}
        </button>
        {saveError && <span class="error">{saveError}</span>}
      </div>
    </div>
  );
}
