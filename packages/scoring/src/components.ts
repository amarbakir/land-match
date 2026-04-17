import type { EnrichmentData, SearchCriteria } from './types';

const SOIL_SCORES: Record<number, number> = { 1: 100, 2: 85, 3: 65, 4: 45, 5: 30, 6: 20, 7: 10, 8: 0 };
const FLOOD_SCORES: Record<string, number> = { X: 100, B: 70, C: 70, A: 30, AE: 30, VE: 0 };
const AGRICULTURAL_ZONES = ['agricultural', 'residential-agricultural', 'farm', 'rural'];

export function scoreSoil(capabilityClass: number | undefined): number {
  if (capabilityClass === undefined) return 50; // neutral if missing
  return SOIL_SCORES[capabilityClass] ?? 0;
}

export function scoreFlood(zone: string | undefined, excluded: string[]): number {
  if (!zone) return 50; // neutral if missing
  if (excluded.includes(zone)) return 0;
  return FLOOD_SCORES[zone] ?? 50;
}

export function scorePrice(price: number | undefined, criteria: SearchCriteria['price']): number {
  if (!price || !criteria) return 50;
  const { min = 0, max } = criteria;
  if (!max) return 50;
  if (price < min) return 100; // under budget = bonus
  if (price <= max) return Math.round(100 - ((price - min) / (max - min)) * 30);
  // Over budget: steep penalty
  const overPercent = (price - max) / max;
  return Math.max(0, Math.round(70 - overPercent * 200));
}

export function scoreAcreage(acreage: number | undefined, criteria: SearchCriteria['acreage']): number {
  if (!acreage || !criteria) return 50;
  const { min = 0, max } = criteria;
  if (!max) return acreage >= min ? 100 : 50;
  if (acreage >= min && acreage <= max) return 100;
  if (acreage < min) return Math.max(0, Math.round(100 - ((min - acreage) / min) * 100));
  return Math.max(0, Math.round(100 - ((acreage - max) / max) * 100));
}

export function scoreZoning(zoningCode: string | undefined, preferred: string[] | undefined): number {
  if (!zoningCode || !preferred || preferred.length === 0) return 50;
  if (preferred.includes(zoningCode)) return 100;
  const lower = zoningCode.toLowerCase();
  if (AGRICULTURAL_ZONES.some((a) => lower.includes(a)) && preferred.some((p) => AGRICULTURAL_ZONES.includes(p))) return 60;
  return 0;
}

export function scoreGeography(
  lat: number | undefined,
  lng: number | undefined,
  criteria: SearchCriteria['geography'],
): number {
  if (!lat || !lng || !criteria || criteria.type !== 'radius' || !criteria.center || !criteria.radiusMiles) return 50;
  const distance = haversineDistance(lat, lng, criteria.center.lat, criteria.center.lng);
  if (distance <= criteria.radiusMiles) return 100;
  if (distance <= criteria.radiusMiles * 1.2) return 70;
  return 0;
}

export function scoreInfrastructure(available: string[] | undefined, preferred: string[] | undefined): number {
  if (!preferred || preferred.length === 0) return 50;
  if (!available || available.length === 0) return 50; // neutral if unknown
  const matches = preferred.filter((p) => available.includes(p)).length;
  return Math.min(100, matches * 20);
}

export function scoreClimate(enrichment: EnrichmentData, criteria: SearchCriteria['climateRisk']): number {
  if (!criteria) return 50;
  let score = 100;
  if (criteria.maxFireRisk && enrichment.fireRiskScore !== undefined) {
    if (enrichment.fireRiskScore > criteria.maxFireRisk) {
      score -= (enrichment.fireRiskScore - criteria.maxFireRisk) * 15;
    }
  }
  if (criteria.maxFloodRisk && enrichment.floodRiskScore !== undefined) {
    if (enrichment.floodRiskScore > criteria.maxFloodRisk) {
      score -= (enrichment.floodRiskScore - criteria.maxFloodRisk) * 15;
    }
  }
  return Math.max(0, score);
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959; // Earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
