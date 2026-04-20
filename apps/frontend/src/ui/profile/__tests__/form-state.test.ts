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

describe('profileToFormState', () => {
  it('maps profile with full criteria', () => {
    const profile = makeProfile({
      name: 'Hudson Valley',
      criteria: {
        geography: { type: 'radius', center: { lat: 41.9, lng: -74.0 }, radiusMiles: 80 },
        acreage: { min: 10, max: 40 },
        price: { max: 600 },
        soilCapabilityClass: { max: 2 },
        floodZoneExclude: ['A', 'AE'],
        zoning: ['agricultural'],
        infrastructure: ['well'],
        weights: { flood: 2.0, soil: 1.0 },
      },
    });
    const state = profileToFormState(profile);
    expect(state.name).toBe('Hudson Valley');
    expect(state.criteria.geography.radiusMiles).toBe(80);
    expect(state.criteria.acreage).toEqual({ min: 10, max: 40 });
    expect(state.criteria.floodZoneExclude).toEqual(['A', 'AE']);
    expect(state.criteria.weights).toEqual({ flood: 2.0, soil: 1.0 });
  });

  it('fills defaults for empty criteria', () => {
    const state = profileToFormState(makeProfile({ criteria: {} }));
    expect(state.criteria.geography.radiusMiles).toBe(60);
    expect(state.criteria.acreage).toEqual({ min: 5, max: 50 });
    expect(state.criteria.soilCapabilityClass.max).toBe(3);
    expect(state.criteria.floodZoneExclude).toEqual([]);
    expect(state.criteria.weights).toEqual(DEFAULT_WEIGHTS);
  });
});

describe('formStateToPayload', () => {
  it('maps form state to API payload shape', () => {
    const payload = formStateToPayload(DEFAULT_FORM_STATE);
    expect(payload.name).toBe('');
    expect(payload.alertFrequency).toBe('daily');
    expect(payload.criteria.geography.type).toBe('radius');
    expect(payload.criteria.weights).toEqual(DEFAULT_WEIGHTS);
  });

  it('preserves all criteria fields', () => {
    const state = { ...DEFAULT_FORM_STATE, name: 'Test' };
    state.criteria = {
      ...state.criteria,
      floodZoneExclude: ['A', 'VE'],
      zoning: ['agricultural'],
    };
    const payload = formStateToPayload(state);
    expect(payload.criteria.floodZoneExclude).toEqual(['A', 'VE']);
    expect(payload.criteria.zoning).toEqual(['agricultural']);
  });
});
