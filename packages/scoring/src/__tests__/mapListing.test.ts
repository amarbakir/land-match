import { describe, expect, it } from 'vitest';
import { mapListingRow } from '../mapListing';

describe('mapListingRow', () => {
  it('maps all fields from a populated row', () => {
    const mapped = mapListingRow({
      price: 150000,
      acreage: 40,
      latitude: 35.6,
      longitude: -82.5,
    });

    expect(mapped).toEqual({
      price: 150000,
      acreage: 40,
      latitude: 35.6,
      longitude: -82.5,
    });
  });

  it('converts null fields to undefined', () => {
    const mapped = mapListingRow({
      price: 150000,
      acreage: null,
      latitude: null,
      longitude: null,
    });

    expect(mapped.price).toBe(150000);
    expect(mapped.acreage).toBeUndefined();
    expect(mapped.latitude).toBeUndefined();
    expect(mapped.longitude).toBeUndefined();
  });

  it('does not coerce zero to undefined', () => {
    // price=0 and acreage=0 are unlikely but latitude/longitude=0 is valid (Gulf of Guinea)
    const mapped = mapListingRow({
      price: 0,
      acreage: 0,
      latitude: 0,
      longitude: 0,
    });

    expect(mapped.price).toBe(0);
    expect(mapped.acreage).toBe(0);
    expect(mapped.latitude).toBe(0);
    expect(mapped.longitude).toBe(0);
  });
});
