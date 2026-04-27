import { describe, expect, it } from 'vitest';
import { getAlertChannels } from '../notifications';

describe('getAlertChannels', () => {
  it('returns [email] when prefs is null (users with no prefs get default alerts)', () => {
    expect(getAlertChannels(null)).toEqual(['email']);
  });

  it('returns [email] when prefs is undefined', () => {
    expect(getAlertChannels(undefined)).toEqual(['email']);
  });

  it('returns [email] when prefs is a non-object value', () => {
    expect(getAlertChannels('garbage')).toEqual(['email']);
    expect(getAlertChannels(42)).toEqual(['email']);
    expect(getAlertChannels(true)).toEqual(['email']);
  });

  it('returns [email] when prefs is empty object (default kicks in)', () => {
    expect(getAlertChannels({})).toEqual(['email']);
  });

  it('returns parsed array for valid multi-channel prefs', () => {
    expect(getAlertChannels({ alertChannels: ['sms', 'push'] })).toEqual(['sms', 'push']);
    expect(getAlertChannels({ alertChannels: ['email'] })).toEqual(['email']);
    expect(getAlertChannels({ alertChannels: ['email', 'sms', 'push'] })).toEqual(['email', 'sms', 'push']);
  });

  it('returns [email] when alertChannels is empty array (min 1 enforcement)', () => {
    // Bug: without min(1), a user could save zero channels and never get alerts
    expect(getAlertChannels({ alertChannels: [] })).toEqual(['email']);
  });

  it('returns [email] when alertChannels contains invalid values', () => {
    expect(getAlertChannels({ alertChannels: ['carrier_pigeon'] })).toEqual(['email']);
    expect(getAlertChannels({ alertChannels: [123] })).toEqual(['email']);
  });
});
