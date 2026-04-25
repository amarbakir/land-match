import { describe, expect, it } from 'vitest';
import { getAlertChannel } from '../notifications';

describe('getAlertChannel', () => {
  it('returns email when prefs is null (existing users with no prefs set)', () => {
    expect(getAlertChannel(null)).toBe('email');
  });

  it('returns email when prefs is undefined', () => {
    expect(getAlertChannel(undefined)).toBe('email');
  });

  it('returns email when prefs is a non-object value', () => {
    expect(getAlertChannel('garbage')).toBe('email');
    expect(getAlertChannel(42)).toBe('email');
    expect(getAlertChannel(true)).toBe('email');
  });

  it('returns email when prefs is empty object (alertChannel defaults)', () => {
    expect(getAlertChannel({})).toBe('email');
  });

  it('returns the channel when a valid alertChannel is set', () => {
    expect(getAlertChannel({ alertChannel: 'sms' })).toBe('sms');
    expect(getAlertChannel({ alertChannel: 'push' })).toBe('push');
    expect(getAlertChannel({ alertChannel: 'email' })).toBe('email');
  });

  it('returns email when alertChannel has an invalid value', () => {
    expect(getAlertChannel({ alertChannel: 'carrier_pigeon' })).toBe('email');
    expect(getAlertChannel({ alertChannel: '' })).toBe('email');
    expect(getAlertChannel({ alertChannel: 123 })).toBe('email');
  });
});
