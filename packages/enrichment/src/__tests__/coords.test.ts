import { describe, expect, it } from 'vitest';

import { isValidLatLng } from '../coords';

// Bug this guards: geocoders return lat/lng as strings — Number('garbage') is
// NaN, which flowed straight into the USDA query as 'POINT(NaN NaN)'.
describe('isValidLatLng', () => {
  it('accepts real coordinates', () => {
    expect(isValidLatLng({ lat: 36.6, lng: -92.1 })).toBe(true);
    expect(isValidLatLng({ lat: -90, lng: 180 })).toBe(true);
  });

  it('rejects NaN and infinite values', () => {
    expect(isValidLatLng({ lat: NaN, lng: -92.1 })).toBe(false);
    expect(isValidLatLng({ lat: 36.6, lng: Infinity })).toBe(false);
  });

  it('rejects out-of-bounds values', () => {
    expect(isValidLatLng({ lat: 91, lng: 0 })).toBe(false);
    expect(isValidLatLng({ lat: -91, lng: 0 })).toBe(false);
    expect(isValidLatLng({ lat: 0, lng: 181 })).toBe(false);
    expect(isValidLatLng({ lat: 0, lng: -181 })).toBe(false);
  });
});
