import { h } from 'preact';
import { AlertTriangle, RefreshCw, ExternalLink } from '../icons';

interface ErrorViewProps {
  error: string;
  onRetry: () => void;
}

export function ErrorView({ error, onRetry }: ErrorViewProps) {
  return (
    <div class="drawer-body">
      <div class="drawer-section" style={{ paddingTop: 28, paddingBottom: 24 }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          background: 'rgba(220,38,38,0.1)', color: 'var(--danger)',
          display: 'grid', placeItems: 'center', marginBottom: 14,
        }}>
          <AlertTriangle size={18} />
        </div>
        <div style={{
          fontFamily: 'var(--font-serif)', fontSize: 17, fontWeight: 600,
          marginBottom: 8,
        }}>
          Enrichment failed
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5, marginBottom: 16 }}>
          We couldn't complete the enrichment for this listing. You can retry, or open the dashboard for a manual lookup.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button class="btn btn-primary" onClick={onRetry}>
            <RefreshCw size={12} /> Retry
          </button>
          <button class="btn">
            <ExternalLink size={12} /> Dashboard
          </button>
        </div>
      </div>

      <div class="drawer-section">
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10,
          color: 'var(--text-faint)', letterSpacing: '0.06em', lineHeight: 1.7,
          wordBreak: 'break-word',
        }}>
          {error}
        </div>
      </div>
    </div>
  );
}
