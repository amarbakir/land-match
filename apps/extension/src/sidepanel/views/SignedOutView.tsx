import { h } from 'preact';
import { Sprout, Droplet, Layers, Shield } from '../icons';

interface SignedOutViewProps {
  onSignIn: () => void;
}

export function SignedOutView({ onSignIn }: SignedOutViewProps) {
  return (
    <div class="drawer">
      <div class="drawer-header">
        <div class="drawer-bar">
          <div class="brand-mark">L</div>
          <span class="brand"><span>Land<em>Match</em></span></span>
        </div>
      </div>
      <div class="drawer-body">
        <div style={{ padding: '40px 22px 24px' }}>
          <div class="eyebrow" style={{ marginBottom: 12, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 14, height: 1, background: 'var(--accent)' }} />
            Sign in
          </div>
          <div style={{
            fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 600,
            lineHeight: 1.2, marginBottom: 10,
          }}>
            Sign in to see this parcel's homestead fit.
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.55, marginBottom: 22 }}>
            We pull soil capability, FEMA flood zones, and growing-season data, then score every listing you visit against your profile.
          </div>
          <button class="btn btn-primary btn-block" style={{ padding: 10 }} onClick={onSignIn}>
            Sign in
          </button>
          <button class="btn btn-block" style={{ marginTop: 8, fontSize: 12, borderColor: 'transparent' }}>
            Create an account
          </button>
        </div>

        <div class="drawer-section" style={{ background: 'var(--bg-deep)' }}>
          <div class="eyebrow" style={{ marginBottom: 10 }}>What you'll get</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div class="feature-row">
              <Sprout size={13} style={{ color: 'var(--accent)' }} />
              <span>Soil & growing scores</span>
            </div>
            <div class="feature-row">
              <Droplet size={13} style={{ color: 'var(--accent)' }} />
              <span>Water & flood overlays</span>
            </div>
            <div class="feature-row">
              <Shield size={13} style={{ color: 'var(--accent)' }} />
              <span>Flood safety analysis</span>
            </div>
            <div class="feature-row">
              <Layers size={13} style={{ color: 'var(--accent)' }} />
              <span>All 7 homestead components</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
