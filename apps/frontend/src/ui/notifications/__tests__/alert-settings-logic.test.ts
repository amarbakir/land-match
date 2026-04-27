import { describe, expect, it } from 'vitest';

import { toggleValueMinOne } from '../../profile/ToggleButtonRow';
import type { AlertChannel } from '@landmatch/api';

describe('toggleValueMinOne (alert channel guard)', () => {
  it('prevents deselecting the last remaining channel', () => {
    const result = toggleValueMinOne(['email'], 'email');
    expect(result).toEqual(['email']);
  });

  it('allows deselecting when multiple channels are selected', () => {
    const result = toggleValueMinOne(['email', 'push'], 'email');
    expect(result).toEqual(['push']);
  });

  it('allows adding a channel', () => {
    const result = toggleValueMinOne(['email'], 'sms');
    expect(result).toEqual(['email', 'sms']);
  });

  it('returns the original array reference when toggle is blocked', () => {
    const original: AlertChannel[] = ['push'];
    const result = toggleValueMinOne(original, 'push');
    expect(result).toBe(original);
  });
});
