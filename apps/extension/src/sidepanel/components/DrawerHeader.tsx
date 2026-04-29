import { h } from 'preact';
import { LogOut } from '../icons';
import { BrandLogo } from './BrandLogo';

interface DrawerHeaderProps {
  email?: string;
  onLogout?: () => void;
}

export function DrawerHeader({ email, onLogout }: DrawerHeaderProps) {
  return (
    <div class="drawer-header">
      <div class="drawer-bar">
        <BrandLogo />
        <div style={{ flex: 1 }} />
        {email && (
          <>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 10.5,
              color: 'var(--text-faint)', letterSpacing: '0.04em',
              maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {email}
            </span>
            <button class="btn btn-icon" title="Sign out" onClick={onLogout}>
              <LogOut size={13} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
