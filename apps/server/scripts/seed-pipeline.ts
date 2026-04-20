/**
 * Seed script: inserts mock listings, enrichment data, and runs matching.
 * Idempotent — uses fixed externalId values with source 'seed'.
 *
 * Usage: pnpm --filter @landmatch/server seed:pipeline
 */
import '../src/config'; // triggers dotenv

import * as listingRepo from '../src/repos/listingRepo';
import { matchListingAgainstProfiles } from '../src/services/matchingService';

const SEED_LISTINGS = [
  {
    externalId: 'seed-001',
    source: 'seed',
    url: 'https://example.com/seed/001',
    title: '40 Acres Homestead - Benton County, OR',
    description: '40 acres with creek, rolling hills. $125,000.',
    price: 125_000,
    acreage: 40,
    address: '123 Rural Rd, Corvallis, OR 97330',
    county: 'Benton',
    state: 'OR',
    rawData: {},
  },
  {
    externalId: 'seed-002',
    source: 'seed',
    url: 'https://example.com/seed/002',
    title: '10 Acres Wooded - Washington County, VT',
    description: '10 wooded acres, southern exposure. $45,000.',
    price: 45_000,
    acreage: 10,
    address: '456 Mountain Ln, Montpelier, VT 05602',
    county: 'Washington',
    state: 'VT',
    rawData: {},
  },
  {
    externalId: 'seed-003',
    source: 'seed',
    url: 'https://example.com/seed/003',
    title: '80 Acres Farmland - Polk County, MO',
    description: '80 acres, 60 tillable, barn, pond. $275,000.',
    price: 275_000,
    acreage: 80,
    address: '789 Farm Rd, Bolivar, MO 65613',
    county: 'Polk',
    state: 'MO',
    rawData: {},
  },
  {
    externalId: 'seed-004',
    source: 'seed',
    url: 'https://example.com/seed/004',
    title: '25 Acres Off-Grid - Taos County, NM',
    description: '25 acres, solar-ready, shared well. $38,000.',
    price: 38_000,
    acreage: 25,
    address: '101 Mesa View, Taos, NM 87571',
    county: 'Taos',
    state: 'NM',
    rawData: {},
  },
  {
    externalId: 'seed-005',
    source: 'seed',
    url: 'https://example.com/seed/005',
    title: '160 Acres Ranch - Elko County, NV',
    description: '160 acres ranch with well and fencing. $89,000.',
    price: 89_000,
    acreage: 160,
    address: '200 Range Rd, Elko, NV 89801',
    county: 'Elko',
    state: 'NV',
    rawData: {},
  },
  {
    externalId: 'seed-006',
    source: 'seed',
    url: 'https://example.com/seed/006',
    title: '120 Acres Mixed - Franklin County, TN',
    description: '120 acres, creek frontage, pasture and woods. $185,000.',
    price: 185_000,
    acreage: 120,
    address: '300 Creek Hollow, Winchester, TN 37398',
    county: 'Franklin',
    state: 'TN',
    rawData: {},
  },
];

const MOCK_ENRICHMENTS = [
  { soilCapabilityClass: 2, femaFloodZone: 'X', zoningCode: 'A-1', fireRiskScore: 15, floodRiskScore: 5 },
  { soilCapabilityClass: 3, femaFloodZone: 'X', zoningCode: 'RR-5', fireRiskScore: 20, floodRiskScore: 10 },
  { soilCapabilityClass: 1, femaFloodZone: 'A', zoningCode: 'AG', fireRiskScore: 5, floodRiskScore: 45 },
  { soilCapabilityClass: 4, femaFloodZone: 'X', zoningCode: 'R-1', fireRiskScore: 35, floodRiskScore: 8 },
  { soilCapabilityClass: 5, femaFloodZone: 'X', zoningCode: 'AG', fireRiskScore: 10, floodRiskScore: 3 },
  { soilCapabilityClass: 2, femaFloodZone: 'AE', zoningCode: 'A-2', fireRiskScore: 12, floodRiskScore: 60 },
];

async function main() {
  console.log('[seed] Starting pipeline seed...');

  const listingIds: string[] = [];

  // Stage 1: Upsert listings
  for (const listing of SEED_LISTINGS) {
    const row = await listingRepo.upsertFromFeed(listing);
    listingIds.push(row.id);
  }
  console.log(`[seed] Upserted ${listingIds.length} listings`);

  // Stage 2: Insert enrichment data + mark complete
  let enriched = 0;
  for (let i = 0; i < listingIds.length; i++) {
    const listingId = listingIds[i];
    const mockData = MOCK_ENRICHMENTS[i];

    try {
      await listingRepo.insertEnrichment(listingId, {
        soil: {
          capabilityClass: mockData.soilCapabilityClass,
          drainageClass: 'well drained',
          texture: 'loam',
          suitabilityRatings: {},
        },
        flood: {
          zone: mockData.femaFloodZone,
          description: mockData.femaFloodZone === 'X' ? 'Minimal flood hazard' : 'Special flood hazard area',
        },
        parcel: {
          zoningCode: mockData.zoningCode,
          zoningDescription: 'Agricultural/Residential',
          verifiedAcreage: 0,
          geometry: {},
        },
        climate: {
          fireRiskScore: mockData.fireRiskScore,
          floodRiskScore: mockData.floodRiskScore,
          heatRiskScore: 20,
          droughtRiskScore: 15,
        },
        sourcesUsed: ['usda', 'fema'],
        errors: [],
      });
      await listingRepo.updateEnrichmentStatus(listingId, 'complete');
      enriched++;
    } catch (e) {
      // Enrichment already exists — just ensure status is complete
      await listingRepo.updateEnrichmentStatus(listingId, 'complete');
      enriched++;
    }
  }
  console.log(`[seed] Enriched ${enriched} listings`);

  // Stage 3: Run matching
  let matched = 0;
  let alertsCreated = 0;
  for (const listingId of listingIds) {
    const result = await matchListingAgainstProfiles(listingId);
    if (result.ok) {
      matched += result.data.scored;
      alertsCreated += result.data.alertsCreated;
    } else {
      console.warn(`[seed] Match failed for ${listingId}: ${result.error}`);
    }
  }

  console.log(`[seed] Complete: ${listingIds.length} listings, ${enriched} enriched, ${matched} scored, ${alertsCreated} alerts`);
  process.exit(0);
}

main().catch((e) => {
  console.error('[seed] Fatal error:', e);
  process.exit(1);
});
