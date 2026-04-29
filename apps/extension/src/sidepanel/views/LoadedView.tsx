import { h } from 'preact';
import { useState } from 'preact/hooks';
import type { EnrichListingResponse } from '@landmatch/api';
import type { SaveListingResultMessage } from '../../shared/messages';
import { sendMessage } from '../../shared/messages';
import { fmtPrice } from '../../shared/format';
import {
  getSoilLabel,
  getFloodColor,
  getFloodLabel,
  getOverallScore,
  HOMESTEAD_DISPLAY_ORDER,
} from '../../shared/scoring';
import { ScoreRing } from '../components/ScoreRing';
import { ComponentBar } from '../components/ComponentBar';
import { RawValueRow } from '../components/RawValueRow';
import { DrawerFooter } from '../components/DrawerFooter';

interface LoadedViewProps {
  data: EnrichListingResponse;
}

export function LoadedView({ data }: LoadedViewProps) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  const { listing, enrichment } = data;
  const score = getOverallScore(data);
  const hasHomestead = data.homesteadComponents != null;
  const components = data.homesteadComponents ?? {};

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    try {
      const result = await sendMessage<SaveListingResultMessage>({
        type: 'SAVE_LISTING',
        payload: { listingId: listing.id },
      });
      if (result.error || !result.payload) {
        setSaveError(result.error ?? 'Save failed');
      } else {
        setSaved(true);
      }
    } catch {
      setSaveError('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const displayTitle = listing.title || listing.address;
  const location = listing.address.split(',').slice(1).join(',').trim();

  return (
    <>
      <div class="drawer-body">
        {/* Listing info + score */}
        <div class="drawer-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div class="eyebrow" style={{ marginBottom: 6 }}>Scoring this page</div>
              <div style={{
                fontFamily: 'var(--font-serif)', fontSize: 17, fontWeight: 600,
                lineHeight: 1.25, color: 'var(--text)', marginBottom: 5,
              }}>
                {displayTitle}
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 10.5,
                color: 'var(--text-faint)', letterSpacing: '0.04em',
              }}>
                {[
                  listing.price != null ? fmtPrice(listing.price) : null,
                  listing.acreage != null ? `${listing.acreage}ac` : null,
                  location || null,
                ].filter(Boolean).join(' · ')}
              </div>
            </div>
            {score != null && <ScoreRing score={score} size={56} stroke={3.5} label="match" />}
          </div>
        </div>

        {/* Homestead components */}
        {hasHomestead && (
          <div class="drawer-section">
            <div class="drawer-section-head">
              <span class="eyebrow">Homestead fit · {HOMESTEAD_DISPLAY_ORDER.length} components</span>
              <div class="rule" />
            </div>
            {HOMESTEAD_DISPLAY_ORDER.map((key) => {
              const comp = components[key];
              if (!comp) return null;
              return (
                <ComponentBar
                  key={key}
                  componentKey={key}
                  score={comp.score}
                  label={comp.label}
                />
              );
            })}
          </div>
        )}

        {/* Raw enrichment */}
        <div class="drawer-section">
          <div class="drawer-section-head">
            <span class="eyebrow">Raw enrichment</span>
            <div class="rule" />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--text-faint)' }}>
              {(enrichment.sourcesUsed ?? []).join(' · ').toUpperCase() || 'SSURGO · FEMA · PRISM'}
            </span>
          </div>
          <RawValueRow
            label="Soil capability"
            value={enrichment.soilCapabilityClass != null
              ? `${getSoilLabel(enrichment.soilCapabilityClass).split(' — ')[0]} · ${enrichment.soilTexture ?? '—'}`
              : null}
          />
          <RawValueRow label="Drainage" value={enrichment.soilDrainageClass} />
          <RawValueRow
            label="FEMA flood zone"
            value={enrichment.femaFloodZone != null
              ? `${enrichment.femaFloodZone} · ${getFloodLabel(enrichment.femaFloodZone)}`
              : null}
            accent={getFloodColor(enrichment.femaFloodZone)}
          />
          <RawValueRow
            label="Frost-free days"
            value={enrichment.frostFreeDays != null ? `${enrichment.frostFreeDays} d` : null}
          />
          <RawValueRow
            label="Growing season"
            value={enrichment.growingSeasonDays != null ? `${enrichment.growingSeasonDays} d` : null}
          />
          <RawValueRow
            label="Slope"
            value={enrichment.slopePct != null ? `${enrichment.slopePct}%` : null}
          />
          <RawValueRow
            label="Elevation"
            value={enrichment.elevationFt != null ? `${Math.round(enrichment.elevationFt)} ft` : null}
          />
          <RawValueRow
            label="Coordinates"
            value={listing.latitude && listing.longitude
              ? `${listing.latitude.toFixed(4)}°N · ${Math.abs(listing.longitude).toFixed(4)}°W`
              : null}
          />
        </div>

        {saveError && (
          <div class="drawer-section">
            <div class="error-text">{saveError}</div>
          </div>
        )}
      </div>

      <DrawerFooter onSave={handleSave} saved={saved} saving={saving} />
    </>
  );
}
