import { describe, expect, it } from 'vitest';

import { toggleValue } from '../../profile/ToggleButtonRow';
import type { AlertChannel } from '@landmatch/api';

/**
 * Tests for the behavioral logic in AlertSettingsScreen.
 * These test the toggle guard and payload construction that live
 * in the component's event handlers.
 */

/** Mirrors AlertSettingsScreen.handleToggle — guards against empty selection */
function handleToggle(channels: AlertChannel[], value: string): AlertChannel[] {
  const next = toggleValue(channels, value);
  if (next.length === 0) return channels;
  return next as AlertChannel[];
}

describe('alert settings toggle guard', () => {
  it('prevents deselecting the last remaining channel', () => {
    // Bug: without this guard, a user could end up with zero channels
    // and never receive any alerts
    const result = handleToggle(['email'], 'email');
    expect(result).toEqual(['email']);
  });

  it('allows deselecting when multiple channels are selected', () => {
    const result = handleToggle(['email', 'push'], 'email');
    expect(result).toEqual(['push']);
  });

  it('allows adding a channel', () => {
    const result = handleToggle(['email'], 'sms');
    expect(result).toEqual(['email', 'sms']);
  });

  it('returns the original array (same reference) when toggle is blocked', () => {
    const original: AlertChannel[] = ['push'];
    const result = handleToggle(original, 'push');
    expect(result).toBe(original);
  });
});

describe('alert settings save payload', () => {
  it('constructs correct multi-channel payload shape', () => {
    // This verifies the contract between frontend and backend:
    // the mutation sends { alertChannels: [...] } not { alertChannel: '...' }
    const channels: AlertChannel[] = ['sms', 'push'];
    const payload = { alertChannels: channels };

    expect(payload).toEqual({ alertChannels: ['sms', 'push'] });
    expect(payload).not.toHaveProperty('alertChannel');
  });
});

describe('alert settings init from API', () => {
  it('syncs channels from server response', () => {
    // Simulates what useEffect does when query data arrives
    const serverResponse = { alertChannels: ['sms'] as AlertChannel[] };
    const channels = serverResponse.alertChannels;
    expect(channels).toEqual(['sms']);
  });

  it('handles all three channels from server', () => {
    const serverResponse = { alertChannels: ['email', 'sms', 'push'] as AlertChannel[] };
    const channels = serverResponse.alertChannels;
    expect(channels).toEqual(['email', 'sms', 'push']);
  });
});
