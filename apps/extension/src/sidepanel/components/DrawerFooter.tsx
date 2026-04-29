import { h } from 'preact';
import { Star, MessageSquare, Share, ExternalLink } from '../icons';

interface DrawerFooterProps {
  onSave?: () => void;
  saved?: boolean;
  saving?: boolean;
  onDashboard?: () => void;
}

export function DrawerFooter({ onSave, saved, saving, onDashboard }: DrawerFooterProps) {
  return (
    <div class="drawer-footer">
      <button
        class="btn btn-icon"
        title={saved ? 'Saved' : 'Save to dashboard'}
        onClick={onSave}
        disabled={saving || saved}
      >
        <Star size={13} style={{
          color: saved ? 'var(--accent)' : 'currentColor',
          fill: saved ? 'var(--accent)' : 'none',
        }} />
      </button>
      <button class="btn btn-icon" title="Add note" disabled>
        <MessageSquare size={13} />
      </button>
      <button class="btn btn-icon" title="Share" disabled>
        <Share size={13} />
      </button>
      <div style={{ flex: 1 }} />
      <button class="btn" onClick={onDashboard}>
        <ExternalLink size={12} /> Dashboard
      </button>
    </div>
  );
}
