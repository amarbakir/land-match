import { describe, expect, it } from 'vitest';

import type { SearchProfileResponse } from '@landmatch/api';

import {
  DEFAULT_FORM_STATE,
  DEFAULT_WEIGHTS,
  formStateToPayload,
  profileToFormState,
} from '../formState';

function makeProfile(overrides: Partial<SearchProfileResponse> = {}): SearchProfileResponse {
  return {
    id: 'p1',
    userId: 'u1',
    name: 'Test',
    isActive: true,
    alertFrequency: 'daily',
    alertThreshold: 60,
    criteria: {},
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// profileToFormState
// ---------------------------------------------------------------------------

describe('profileToFormState', () => {
  it('fills defaults for empty criteria — catches undefined crashes when API returns {}', () => {
    // Bug: if criteria.acreage is undefined and we access .min, we get TypeError
    const state = profileToFormState(makeProfile({ criteria: {} }));
    expect(state.criteria.geography.radiusMiles).toBe(60);
    expect(state.criteria.geography.center).toEqual({ lat: 0, lng: 0 });
    expect(state.criteria.acreage).toEqual({ min: 5, max: 50 });
    expect(state.criteria.price.max).toBe(500);
    expect(state.criteria.soilCapabilityClass.max).toBe(3);
    expect(state.criteria.floodZoneExclude).toEqual([]);
    expect(state.criteria.zoning).toEqual([]);
    expect(state.criteria.infrastructure).toEqual([]);
    expect(state.criteria.weights).toEqual(DEFAULT_WEIGHTS);
  });

  it('handles partial acreage (only min set) — catches destructuring bugs on sparse objects', () => {
    // Bug: if we do { min, max } = criteria.acreage and max is undefined,
    // the form renders NaN or undefined in the slider
    const state = profileToFormState(makeProfile({
      criteria: { acreage: { min: 10 } },
    }));
    expect(state.criteria.acreage.min).toBe(10);
    expect(state.criteria.acreage.max).toBe(50); // falls back to default
  });

  it('handles partial acreage (only max set)', () => {
    const state = profileToFormState(makeProfile({
      criteria: { acreage: { max: 100 } },
    }));
    expect(state.criteria.acreage.min).toBe(5); // falls back to default
    expect(state.criteria.acreage.max).toBe(100);
  });

  it('preserves falsy-but-valid values like 0 — catches if (value) guards that drop zeroes', () => {
    // Bug: if conversion uses `c.acreage?.min || 5`, a min of 0 gets replaced by 5
    const state = profileToFormState(makeProfile({
      criteria: {
        acreage: { min: 0, max: 10 },
        price: { max: 0 },
      },
    }));
    expect(state.criteria.acreage.min).toBe(0);
    expect(state.criteria.price.max).toBe(0);
  });

  it('casts alertFrequency string to the union type — catches if API returns a broader string', () => {
    const profile = makeProfile({ alertFrequency: 'weekly' });
    const state = profileToFormState(profile);
    expect(state.alertFrequency).toBe('weekly');
  });

  it('maps geography center and radius from full criteria', () => {
    const state = profileToFormState(makeProfile({
      criteria: {
        geography: { type: 'radius', center: { lat: 41.9, lng: -74.0 }, radiusMiles: 80 },
      },
    }));
    expect(state.criteria.geography.center).toEqual({ lat: 41.9, lng: -74.0 });
    expect(state.criteria.geography.radiusMiles).toBe(80);
    expect(state.criteria.geography.type).toBe('radius');
  });
});

// ---------------------------------------------------------------------------
// formStateToPayload
// ---------------------------------------------------------------------------

describe('formStateToPayload', () => {
  it('round-trips without data loss — catches if conversion drops or transforms fields', () => {
    // Bug: if formStateToPayload omits a criteria field, the PUT request
    // silently clears that setting on the server
    const profile = makeProfile({
      name: 'Hudson Valley',
      alertFrequency: 'instant',
      alertThreshold: 85,
      criteria: {
        geography: { type: 'radius', center: { lat: 41.9, lng: -74.0 }, radiusMiles: 80 },
        acreage: { min: 10, max: 40 },
        price: { max: 600 },
        soilCapabilityClass: { max: 2 },
        floodZoneExclude: ['A', 'AE'],
        zoning: ['agricultural'],
        infrastructure: ['well', 'septic'],
        weights: { flood: 2.0, soil: 1.0, price: 0.5 },
      },
    });
    const state = profileToFormState(profile);
    const payload = formStateToPayload(state);

    expect(payload.name).toBe('Hudson Valley');
    expect(payload.alertFrequency).toBe('instant');
    expect(payload.alertThreshold).toBe(85);
    expect(payload.criteria.geography.radiusMiles).toBe(80);
    expect(payload.criteria.acreage).toEqual({ min: 10, max: 40 });
    expect(payload.criteria.price).toEqual({ max: 600 });
    expect(payload.criteria.soilCapabilityClass).toEqual({ max: 2 });
    expect(payload.criteria.floodZoneExclude).toEqual(['A', 'AE']);
    expect(payload.criteria.zoning).toEqual(['agricultural']);
    expect(payload.criteria.infrastructure).toEqual(['well', 'septic']);
    expect(payload.criteria.weights).toEqual({ flood: 2.0, soil: 1.0, price: 0.5 });
  });

  it('includes isActive in payload — catches if the toggle state is dropped on save', () => {
    const state = { ...structuredClone(DEFAULT_FORM_STATE), name: 'Test', isActive: false };
    const payload = formStateToPayload(state);
    expect(payload.isActive).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_FORM_STATE isolation
// ---------------------------------------------------------------------------

describe('DEFAULT_FORM_STATE', () => {
  it('is not corrupted when a new form state is modified — catches shared reference bugs', () => {
    // Bug: if DEFAULT_FORM_STATE.criteria.weights is shared by reference,
    // modifying one form's weights corrupts the defaults for the next new profile
    const state = structuredClone(DEFAULT_FORM_STATE);
    state.criteria.weights.flood = 0;
    state.criteria.floodZoneExclude.push('A');

    expect(DEFAULT_FORM_STATE.criteria.weights.flood).toBe(2.0);
    expect(DEFAULT_FORM_STATE.criteria.floodZoneExclude).toEqual([]);
  });
});
