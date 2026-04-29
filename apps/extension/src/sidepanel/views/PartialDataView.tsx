import { h } from 'preact';
import type { EnrichListingResponse } from '@landmatch/api';
import { HOMESTEAD_COMPONENT_LABELS, HOMESTEAD_DISPLAY_ORDER } from '../../shared/scoring';
import { COMPONENT_ICONS } from '../icons';
import { ComponentBar } from '../components/ComponentBar';

interface PartialDataViewProps {
  data: EnrichListingResponse;
}

export function PartialDataView({ data }: PartialDataViewProps) {
  const components = data.homesteadComponents ?? {};
  const available = HOMESTEAD_DISPLAY_ORDER.filter((k) => components[k] != null);
  const awaiting = HOMESTEAD_DISPLAY_ORDER.filter((k) => components[k] == null);

  return (
    <div class="drawer-body">
      <div class="drawer-section">
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            border: '2px dashed var(--border)', display: 'grid', placeItems: 'center',
            fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--text-faint)',
          }}>
            ?
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 16, fontWeight: 600 }}>
              Partial enrichment
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-faint)', marginTop: 3 }}>
              {available.length} of {HOMESTEAD_DISPLAY_ORDER.length} components scored
            </div>
          </div>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-dim)', lineHeight: 1.55 }}>
          Some data sources didn't return results for this parcel. We can't compute a full homestead score yet.
        </div>
      </div>

      {available.length > 0 && (
        <div class="drawer-section">
          <div class="eyebrow" style={{ marginBottom: 10 }}>Available</div>
          {available.map((k) => (
            <ComponentBar
              key={k}
              componentKey={k}
              score={components[k]!.score}
              label={components[k]!.label}
              dense
            />
          ))}
        </div>
      )}

      {awaiting.length > 0 && (
        <div class="drawer-section">
          <div class="eyebrow" style={{ marginBottom: 10 }}>Awaiting</div>
          {awaiting.map((k) => {
            const Icon = COMPONENT_ICONS[k];
            const displayLabel = HOMESTEAD_COMPONENT_LABELS[k as keyof typeof HOMESTEAD_COMPONENT_LABELS] ?? k;
            return (
              <div key={k} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '5px 0', borderTop: '1px dashed var(--border-soft)',
              }}>
                {Icon && <Icon size={12} style={{ color: 'var(--text-faint)' }} />}
                <span style={{ fontSize: 11.5, color: 'var(--text-dim)', flex: 1 }}>{displayLabel}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-faint)', letterSpacing: '0.06em' }}>—</span>
              </div>
            );
          })}
        </div>
      )}

      <div class="drawer-section">
        <button class="btn btn-primary btn-block" disabled>Request manual review</button>
      </div>
    </div>
  );
}
