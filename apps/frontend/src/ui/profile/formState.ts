import type { SearchProfileResponse } from '@landmatch/api';

export interface FormState {
  name: string;
  isActive: boolean;
  alertFrequency: 'instant' | 'daily' | 'weekly';
  alertThreshold: number;
  criteria: {
    geography: {
      type: 'radius';
      center: { lat: number; lng: number };
      radiusMiles: number;
    };
    acreage: { min: number; max: number };
    price: { max: number };
    soilCapabilityClass: { max: number };
    floodZoneExclude: string[];
    zoning: string[];
    infrastructure: string[];
    weights: Record<string, number>;
  };
}

export const DEFAULT_WEIGHTS: Record<string, number> = {
  flood: 2.0,
  soil: 1.5,
  price: 1.5,
  acreage: 1.0,
  zoning: 1.0,
  geography: 1.0,
  climate: 0.8,
  infrastructure: 0.5,
};

export const DEFAULT_FORM_STATE: FormState = {
  name: '',
  isActive: true,
  alertFrequency: 'daily',
  alertThreshold: 60,
  criteria: {
    geography: { type: 'radius', center: { lat: 0, lng: 0 }, radiusMiles: 60 },
    acreage: { min: 5, max: 50 },
    price: { max: 500 },
    soilCapabilityClass: { max: 3 },
    floodZoneExclude: [],
    zoning: [],
    infrastructure: [],
    weights: { ...DEFAULT_WEIGHTS },
  },
};

export function profileToFormState(profile: SearchProfileResponse): FormState {
  const c = profile.criteria;
  return {
    name: profile.name,
    isActive: profile.isActive,
    alertFrequency: profile.alertFrequency as FormState['alertFrequency'],
    alertThreshold: profile.alertThreshold,
    criteria: {
      geography: {
        type: 'radius',
        center: c.geography?.center ?? { lat: 0, lng: 0 },
        radiusMiles: c.geography?.radiusMiles ?? 60,
      },
      acreage: {
        min: c.acreage?.min ?? 5,
        max: c.acreage?.max ?? 50,
      },
      price: { max: c.price?.max ?? 500 },
      soilCapabilityClass: { max: c.soilCapabilityClass?.max ?? 3 },
      floodZoneExclude: c.floodZoneExclude ?? [],
      zoning: c.zoning ?? [],
      infrastructure: c.infrastructure ?? [],
      weights: c.weights ?? { ...DEFAULT_WEIGHTS },
    },
  };
}

export function formStateToPayload(state: FormState) {
  return {
    name: state.name,
    isActive: state.isActive,
    alertFrequency: state.alertFrequency,
    alertThreshold: state.alertThreshold,
    criteria: {
      geography: state.criteria.geography,
      acreage: state.criteria.acreage,
      price: state.criteria.price,
      soilCapabilityClass: state.criteria.soilCapabilityClass,
      floodZoneExclude: state.criteria.floodZoneExclude,
      zoning: state.criteria.zoning,
      infrastructure: state.criteria.infrastructure,
      weights: state.criteria.weights,
    },
  };
}
