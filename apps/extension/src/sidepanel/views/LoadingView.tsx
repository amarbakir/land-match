import { h } from 'preact';
import { fmtPrice } from '../../shared/format';
import { HOMESTEAD_COMPONENT_LABELS, HOMESTEAD_DISPLAY_ORDER } from '../../shared/scoring';

interface LoadingViewProps {
  title?: string;
  price?: number;
  acreage?: number;
  address?: string;
}

export function LoadingView({ title, price, acreage, address }: LoadingViewProps) {
  return (
    <div class="drawer-body">
      <div class="drawer-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
          <div class="spinner" />
          <div>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
              Reading the land
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10.5,
              color: 'var(--text-faint)', letterSpacing: '0.04em',
            }}>
              fetching soil, flood, climate…
            </div>
          </div>
        </div>

        {(title || price != null || acreage != null) && (
          <div style={{ marginBottom: 14 }}>
            {title && (
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 14, fontWeight: 600, marginBottom: 3 }}>
                {title}
              </div>
            )}
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-faint)', letterSpacing: '0.04em' }}>
              {[
                price != null ? fmtPrice(price) : null,
                acreage != null ? `${acreage}ac` : null,
                address ? address.split(',').slice(1).join(',').trim() : null,
              ].filter(Boolean).join(' · ')}
            </div>
          </div>
        )}

        {HOMESTEAD_DISPLAY_ORDER.map((key, i) => (
          <div key={key} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>
                {HOMESTEAD_COMPONENT_LABELS[key]}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-faint)' }}>
                ···
              </span>
            </div>
            <div class="shimmer-bar" style={{ animationDelay: `${i * 0.1}s` }} />
          </div>
        ))}
      </div>

      <div class="drawer-section">
        <div class="eyebrow" style={{ marginBottom: 8 }}>Sources</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span class="tag green">SSURGO ✓</span>
          <span class="tag green">FEMA ✓</span>
          <span class="tag" style={{ opacity: 0.5 }}>PRISM …</span>
          <span class="tag" style={{ opacity: 0.5 }}>3DEP …</span>
        </div>
      </div>
    </div>
  );
}
