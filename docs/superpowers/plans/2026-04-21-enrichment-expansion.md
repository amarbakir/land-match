# Enrichment Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PostGIS infrastructure and self-hosted spatial datasets (PRISM climate normals, USGS 3DEP elevation, NWI wetlands), replacing external API enrichment with local spatial queries.

**Architecture:** Create a `packages/geodata/` package with a CLI-driven ETL pipeline that downloads, clips, and loads national datasets into PostGIS. New enrichment adapters in `packages/enrichment/` use factory functions that accept a `pg.Pool` to query PostGIS, keeping the same `EnrichmentAdapter<T>` interface. The server injects the db connection at startup.

**Tech Stack:** PostGIS, GDAL (raster2pgsql, ogr2ogr), pg (raw SQL for spatial queries), Drizzle (schema migrations), Vitest

---

## File Map

### New Files

| File | Purpose |
|------|---------|
| `packages/geodata/package.json` | Package config with gdal/pg dependencies |
| `packages/geodata/tsconfig.json` | TypeScript config extending root |
| `packages/geodata/src/cli.ts` | CLI entrypoint — `load --region=northeast --source=prism` |
| `packages/geodata/src/types.ts` | Region bounds, source configs |
| `packages/geodata/src/sources/prism.ts` | PRISM download + clip + load |
| `packages/geodata/src/sources/elevation.ts` | USGS 3DEP download + clip + load |
| `packages/geodata/src/sources/wetlands.ts` | NWI download + clip + load |
| `packages/geodata/src/lib/postgis.ts` | Shared PostGIS helpers (connection, raster2pgsql, ogr2ogr wrappers) |
| `packages/enrichment/src/climateNormals.ts` | PRISM adapter (PostGIS ST_Value query) |
| `packages/enrichment/src/elevation.ts` | 3DEP adapter (PostGIS ST_Value query) |
| `packages/enrichment/src/wetlands.ts` | NWI adapter (PostGIS ST_Intersects query) |
| `packages/enrichment/src/__tests__/climateNormals.test.ts` | Unit tests for climate normals adapter |
| `packages/enrichment/src/__tests__/elevation.test.ts` | Unit tests for elevation adapter |
| `packages/enrichment/src/__tests__/wetlands.test.ts` | Unit tests for wetlands adapter |

### Modified Files

| File | Change |
|------|--------|
| `packages/enrichment/src/types.ts` | Add `ClimateNormalsData`, `ElevationData`, `WetlandsData` types + extend `EnrichmentResult` + `EnrichmentKey` |
| `packages/enrichment/src/pipeline.ts` | Accept additional adapters via `registerAdapter()`, add new keys to `assignResult()` |
| `packages/enrichment/src/enrichListing.ts` | Pass PostGIS adapters to pipeline |
| `packages/enrichment/src/index.ts` | Export new adapter factories + types |
| `packages/db/src/schema.ts` | Add new enrichment columns (climate normals, elevation, wetlands) |
| `apps/server/src/repos/listingRepo.ts` | Persist new enrichment fields in `insertEnrichment()` |
| `apps/server/src/config.ts` | Add `GEODATA_ENABLED` feature flag + `DATABASE_URL` for PostGIS pool |
| `packages/scoring/src/types.ts` | Extend `EnrichmentData` with new fields |
| `packages/scoring/src/mapEnrichment.ts` | Map new enrichment fields |

---

## Task 1: PostGIS Migration + Feature Flag

**Files:**
- Modify: `packages/db/src/schema.ts:64-88`
- Modify: `apps/server/src/config.ts`
- Create: migration via `pnpm --filter @landmatch/db db:generate`

- [ ] **Step 1: Add new columns to enrichments schema**

In `packages/db/src/schema.ts`, add columns to the `enrichments` table after the climate section:

```typescript
  // Climate normals (PRISM)
  frostFreeDays: integer('frost_free_days'),
  annualPrecipIn: real('annual_precip_in'),
  avgMinTempF: real('avg_min_temp_f'),
  avgMaxTempF: real('avg_max_temp_f'),
  growingSeasonDays: integer('growing_season_days'),
  // Elevation (3DEP)
  elevationFt: real('elevation_ft'),
  slopePct: real('slope_pct'),
  // Wetlands (NWI)
  wetlandType: text('wetland_type'),
  wetlandDescription: text('wetland_description'),
  wetlandWithinBufferFt: integer('wetland_within_buffer_ft'),
```

- [ ] **Step 2: Add geodata feature flag to config**

In `apps/server/src/config.ts`, add to the `features` section:

```typescript
enableGeodataEnrichment: process.env.ENABLE_GEODATA_ENRICHMENT === 'true',
```

- [ ] **Step 3: Generate migration**

Run: `pnpm --filter @landmatch/db db:generate`
Expected: New migration file in `packages/db/drizzle/` adding the new columns.

- [ ] **Step 4: Verify migration SQL**

Read the generated migration file. Confirm it adds the expected columns with correct types (integer, real, text). No data loss.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema.ts packages/db/drizzle/ apps/server/src/config.ts
git commit -m "add enrichment columns for climate normals, elevation, wetlands"
```

---

## Task 2: Extend Enrichment Types

**Files:**
- Modify: `packages/enrichment/src/types.ts`

- [ ] **Step 1: Add new data types**

Add after the existing `ClimateData` interface in `packages/enrichment/src/types.ts`:

```typescript
export interface ClimateNormalsData {
  frostFreeDays: number;
  annualPrecipIn: number;
  avgMinTempF: number;
  avgMaxTempF: number;
  growingSeasonDays: number;
}

export interface ElevationData {
  elevationFt: number;
  slopePct: number;
}

export interface WetlandsData {
  wetlandType: string | null; // NWI code e.g. "PFO1A", null if none nearby
  wetlandDescription: string | null;
  distanceFt: number; // 0 if on-parcel, buffer distance if nearby, Infinity if none
}
```

- [ ] **Step 2: Extend EnrichmentResult**

Update the `EnrichmentResult` interface:

```typescript
export interface EnrichmentResult {
  soil?: SoilData;
  flood?: FloodData;
  parcel?: ParcelData;
  climate?: ClimateData;
  climateNormals?: ClimateNormalsData;
  elevation?: ElevationData;
  wetlands?: WetlandsData;
  sourcesUsed: string[];
  errors: Array<{ source: string; error: string }>;
}
```

- [ ] **Step 3: Update EnrichmentKey**

The `EnrichmentKey` type derives automatically from `EnrichmentResult`:

```typescript
export type EnrichmentKey = keyof Omit<EnrichmentResult, 'sourcesUsed' | 'errors'>;
// Now includes: 'soil' | 'flood' | 'parcel' | 'climate' | 'climateNormals' | 'elevation' | 'wetlands'
```

No change needed — it's already derived.

- [ ] **Step 4: Export new types**

In `packages/enrichment/src/index.ts`, add to the type exports:

```typescript
export type { ClimateData, ClimateNormalsData, ElevationData, EnrichmentAdapter, EnrichmentKey, EnrichmentResult, FloodData, LatLng, ParcelData, Result, SoilData, WetlandsData } from './types';
```

- [ ] **Step 5: Verify types compile**

Run: `pnpm --filter @landmatch/enrichment lint`
Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add packages/enrichment/src/types.ts packages/enrichment/src/index.ts
git commit -m "add climate normals, elevation, wetlands types to enrichment"
```

---

## Task 3: Make Pipeline Accept Additional Adapters

**Files:**
- Modify: `packages/enrichment/src/pipeline.ts`
- Modify: `packages/enrichment/src/enrichListing.ts`

- [ ] **Step 1: Add adapter registration to pipeline**

Update `packages/enrichment/src/pipeline.ts`:

```typescript
import { climateAdapter } from './climate';
import { floodAdapter } from './flood';
import { parcelAdapter } from './parcel';
import { soilAdapter } from './soil';
import type { EnrichmentAdapter, EnrichmentKey, EnrichmentResult, LatLng } from './types';

interface RegisteredAdapter {
  key: EnrichmentKey;
  adapter: EnrichmentAdapter<unknown>;
}

const defaultAdapters: RegisteredAdapter[] = [
  { key: 'soil', adapter: soilAdapter },
  { key: 'flood', adapter: floodAdapter },
  { key: 'parcel', adapter: parcelAdapter },
  { key: 'climate', adapter: climateAdapter },
];

const additionalAdapters: RegisteredAdapter[] = [];

export function registerAdapter(key: EnrichmentKey, adapter: EnrichmentAdapter<unknown>): void {
  additionalAdapters.push({ key, adapter });
}

export function clearAdditionalAdapters(): void {
  additionalAdapters.length = 0;
}

export async function runEnrichmentPipeline(coords: LatLng): Promise<EnrichmentResult> {
  const allAdapters = [...defaultAdapters, ...additionalAdapters];
  const available = allAdapters.filter((r) => r.adapter.isAvailable());

  const results = await Promise.allSettled(
    available.map((r) => r.adapter.enrich(coords).then((result) => ({ key: r.key, name: r.adapter.name, result }))),
  );

  const enrichment: EnrichmentResult = {
    sourcesUsed: [],
    errors: [],
  };

  for (const settled of results) {
    if (settled.status === 'rejected') {
      enrichment.errors.push({ source: 'unknown', error: String(settled.reason) });
      continue;
    }

    const { key, name, result } = settled.value;

    if (!result.ok) {
      enrichment.errors.push({ source: name, error: result.error });
      continue;
    }

    enrichment.sourcesUsed.push(name);
    assignResult(enrichment, key, result.data);
  }

  return enrichment;
}

function assignResult(enrichment: EnrichmentResult, key: EnrichmentKey, data: unknown): void {
  switch (key) {
    case 'soil':
      enrichment.soil = data as EnrichmentResult['soil'];
      break;
    case 'flood':
      enrichment.flood = data as EnrichmentResult['flood'];
      break;
    case 'parcel':
      enrichment.parcel = data as EnrichmentResult['parcel'];
      break;
    case 'climate':
      enrichment.climate = data as EnrichmentResult['climate'];
      break;
    case 'climateNormals':
      enrichment.climateNormals = data as EnrichmentResult['climateNormals'];
      break;
    case 'elevation':
      enrichment.elevation = data as EnrichmentResult['elevation'];
      break;
    case 'wetlands':
      enrichment.wetlands = data as EnrichmentResult['wetlands'];
      break;
  }
}
```

- [ ] **Step 2: Export registerAdapter from index**

In `packages/enrichment/src/index.ts`, add:

```typescript
export { registerAdapter, clearAdditionalAdapters } from './pipeline';
```

- [ ] **Step 3: Verify existing tests still pass**

Run: `pnpm --filter @landmatch/enrichment test:run`
Expected: All existing tests pass (no behavior change for default adapters).

- [ ] **Step 4: Commit**

```bash
git add packages/enrichment/src/pipeline.ts packages/enrichment/src/index.ts
git commit -m "make enrichment pipeline accept additional adapters via registerAdapter"
```

---

## Task 4: Climate Normals Adapter (PRISM via PostGIS)

**Files:**
- Create: `packages/enrichment/src/climateNormals.ts`
- Create: `packages/enrichment/src/__tests__/climateNormals.test.ts`

- [ ] **Step 1: Write failing test for climate normals adapter**

Create `packages/enrichment/src/__tests__/climateNormals.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClimateNormalsAdapter } from '../climateNormals';
import type { Pool } from 'pg';

function mockPool(rows: Record<string, unknown>[]): Pool {
  return { query: vi.fn().mockResolvedValue({ rows }) } as unknown as Pool;
}

describe('createClimateNormalsAdapter', () => {
  it('returns climate normals from PostGIS query', async () => {
    const pool = mockPool([{
      frost_free_days: 158,
      annual_precip_in: 42.3,
      avg_min_temp_f: 28.1,
      avg_max_temp_f: 72.5,
      growing_season_days: 165,
    }]);

    const adapter = createClimateNormalsAdapter(pool);
    const result = await adapter.enrich({ lat: 43.1, lng: -72.78 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        frostFreeDays: 158,
        annualPrecipIn: 42.3,
        avgMinTempF: 28.1,
        avgMaxTempF: 72.5,
        growingSeasonDays: 165,
      });
    }

    expect(pool.query).toHaveBeenCalledOnce();
    const sql = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sql).toContain('ST_Value');
  });

  it('returns error when PostGIS query returns no rows', async () => {
    const pool = mockPool([]);
    const adapter = createClimateNormalsAdapter(pool);
    const result = await adapter.enrich({ lat: 0, lng: 0 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('No climate normals data');
    }
  });

  it('returns error on query failure', async () => {
    const pool = { query: vi.fn().mockRejectedValue(new Error('connection refused')) } as unknown as Pool;
    const adapter = createClimateNormalsAdapter(pool);
    const result = await adapter.enrich({ lat: 43.1, lng: -72.78 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('connection refused');
    }
  });

  it('reports isAvailable as true', () => {
    const pool = mockPool([]);
    const adapter = createClimateNormalsAdapter(pool);
    expect(adapter.isAvailable()).toBe(true);
  });

  it('has correct name', () => {
    const pool = mockPool([]);
    const adapter = createClimateNormalsAdapter(pool);
    expect(adapter.name).toBe('prism-climate-normals');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @landmatch/enrichment vitest run src/__tests__/climateNormals.test.ts`
Expected: FAIL — `createClimateNormalsAdapter` not found.

- [ ] **Step 3: Implement climate normals adapter**

Create `packages/enrichment/src/climateNormals.ts`:

```typescript
import type { Pool } from 'pg';
import type { ClimateNormalsData, EnrichmentAdapter, LatLng, Result } from './types';

export function createClimateNormalsAdapter(pool: Pool): EnrichmentAdapter<ClimateNormalsData> {
  return {
    name: 'prism-climate-normals',

    isAvailable(): boolean {
      return true;
    },

    async enrich(coords: LatLng): Promise<Result<ClimateNormalsData>> {
      try {
        const sql = `
          SELECT
            ST_Value(ffd.rast, pt.geom) AS frost_free_days,
            ST_Value(precip.rast, pt.geom) AS annual_precip_in,
            ST_Value(tmin.rast, pt.geom) AS avg_min_temp_f,
            ST_Value(tmax.rast, pt.geom) AS avg_max_temp_f,
            ST_Value(gs.rast, pt.geom) AS growing_season_days
          FROM (SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326) AS geom) pt
          LEFT JOIN prism_frost_free_days ffd ON ST_Intersects(ffd.rast, pt.geom)
          LEFT JOIN prism_annual_precip precip ON ST_Intersects(precip.rast, pt.geom)
          LEFT JOIN prism_avg_min_temp tmin ON ST_Intersects(tmin.rast, pt.geom)
          LEFT JOIN prism_avg_max_temp tmax ON ST_Intersects(tmax.rast, pt.geom)
          LEFT JOIN prism_growing_season gs ON ST_Intersects(gs.rast, pt.geom)
          LIMIT 1
        `;

        const { rows } = await pool.query(sql, [coords.lng, coords.lat]);

        if (rows.length === 0 || rows[0].frost_free_days === null) {
          return { ok: false, error: 'No climate normals data found for this location' };
        }

        const row = rows[0];
        return {
          ok: true,
          data: {
            frostFreeDays: Math.round(Number(row.frost_free_days)),
            annualPrecipIn: Math.round(Number(row.annual_precip_in) * 10) / 10,
            avgMinTempF: Math.round(Number(row.avg_min_temp_f) * 10) / 10,
            avgMaxTempF: Math.round(Number(row.avg_max_temp_f) * 10) / 10,
            growingSeasonDays: Math.round(Number(row.growing_season_days)),
          },
        };
      } catch (err) {
        return { ok: false, error: `Climate normals query failed: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @landmatch/enrichment vitest run src/__tests__/climateNormals.test.ts`
Expected: All 5 tests pass.

- [ ] **Step 5: Add pg as a dependency**

In `packages/enrichment/package.json`, add `pg` to dependencies and `@types/pg` to devDependencies:

```bash
cd /Users/amarbakir/dev/land-match && pnpm --filter @landmatch/enrichment add pg && pnpm --filter @landmatch/enrichment add -D @types/pg
```

- [ ] **Step 6: Commit**

```bash
git add packages/enrichment/src/climateNormals.ts packages/enrichment/src/__tests__/climateNormals.test.ts packages/enrichment/package.json pnpm-lock.yaml
git commit -m "add PRISM climate normals adapter with PostGIS queries"
```

---

## Task 5: Elevation Adapter (3DEP via PostGIS)

**Files:**
- Create: `packages/enrichment/src/elevation.ts`
- Create: `packages/enrichment/src/__tests__/elevation.test.ts`

- [ ] **Step 1: Write failing test for elevation adapter**

Create `packages/enrichment/src/__tests__/elevation.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { createElevationAdapter } from '../elevation';
import type { Pool } from 'pg';

function mockPool(rows: Record<string, unknown>[]): Pool {
  return { query: vi.fn().mockResolvedValue({ rows }) } as unknown as Pool;
}

describe('createElevationAdapter', () => {
  it('returns elevation and slope from PostGIS query', async () => {
    const pool = mockPool([{ elevation_ft: 1247.3, slope_pct: 8.2 }]);
    const adapter = createElevationAdapter(pool);
    const result = await adapter.enrich({ lat: 43.1, lng: -72.78 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ elevationFt: 1247.3, slopePct: 8.2 });
    }
  });

  it('derives slope from neighboring elevation values', async () => {
    // Slope is computed from center + 4 neighbor elevation samples
    const pool = mockPool([{
      elevation_ft: 1200,
      slope_pct: 12.5,
    }]);
    const adapter = createElevationAdapter(pool);
    const result = await adapter.enrich({ lat: 43.1, lng: -72.78 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.slopePct).toBe(12.5);
    }
  });

  it('returns error when no raster data found', async () => {
    const pool = mockPool([{ elevation_ft: null, slope_pct: null }]);
    const adapter = createElevationAdapter(pool);
    const result = await adapter.enrich({ lat: 0, lng: 0 });

    expect(result.ok).toBe(false);
  });

  it('returns error on query failure', async () => {
    const pool = { query: vi.fn().mockRejectedValue(new Error('timeout')) } as unknown as Pool;
    const adapter = createElevationAdapter(pool);
    const result = await adapter.enrich({ lat: 43.1, lng: -72.78 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('timeout');
    }
  });

  it('has correct name and is available', () => {
    const pool = mockPool([]);
    const adapter = createElevationAdapter(pool);
    expect(adapter.name).toBe('usgs-3dep-elevation');
    expect(adapter.isAvailable()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @landmatch/enrichment vitest run src/__tests__/elevation.test.ts`
Expected: FAIL — `createElevationAdapter` not found.

- [ ] **Step 3: Implement elevation adapter**

Create `packages/enrichment/src/elevation.ts`:

```typescript
import type { Pool } from 'pg';
import type { ElevationData, EnrichmentAdapter, LatLng, Result } from './types';

export function createElevationAdapter(pool: Pool): EnrichmentAdapter<ElevationData> {
  return {
    name: 'usgs-3dep-elevation',

    isAvailable(): boolean {
      return true;
    },

    async enrich(coords: LatLng): Promise<Result<ElevationData>> {
      try {
        // Query center elevation + compute slope from 4 neighboring points (~30m apart)
        const sql = `
          WITH center AS (
            SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326) AS geom
          ),
          elev AS (
            SELECT
              ST_Value(r.rast, c.geom) * 3.28084 AS center_ft,
              ST_Value(r.rast, ST_Translate(c.geom, 0, 0.0003)) * 3.28084 AS north_ft,
              ST_Value(r.rast, ST_Translate(c.geom, 0, -0.0003)) * 3.28084 AS south_ft,
              ST_Value(r.rast, ST_Translate(c.geom, 0.0003, 0)) * 3.28084 AS east_ft,
              ST_Value(r.rast, ST_Translate(c.geom, -0.0003, 0)) * 3.28084 AS west_ft
            FROM usgs_3dep_elevation r, center c
            WHERE ST_Intersects(r.rast, c.geom)
            LIMIT 1
          )
          SELECT
            ROUND(center_ft::numeric, 1) AS elevation_ft,
            ROUND((DEGREES(ATAN(
              SQRT(
                POW((east_ft - west_ft) / 65.6, 2) +
                POW((north_ft - south_ft) / 65.6, 2)
              )
            )))::numeric, 1) AS slope_pct
          FROM elev
        `;

        const { rows } = await pool.query(sql, [coords.lng, coords.lat]);

        if (rows.length === 0 || rows[0].elevation_ft === null) {
          return { ok: false, error: 'No elevation data found for this location' };
        }

        return {
          ok: true,
          data: {
            elevationFt: Number(rows[0].elevation_ft),
            slopePct: Number(rows[0].slope_pct),
          },
        };
      } catch (err) {
        return { ok: false, error: `Elevation query failed: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @landmatch/enrichment vitest run src/__tests__/elevation.test.ts`
Expected: All 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/enrichment/src/elevation.ts packages/enrichment/src/__tests__/elevation.test.ts
git commit -m "add USGS 3DEP elevation adapter with slope derivation"
```

---

## Task 6: Wetlands Adapter (NWI via PostGIS)

**Files:**
- Create: `packages/enrichment/src/wetlands.ts`
- Create: `packages/enrichment/src/__tests__/wetlands.test.ts`

- [ ] **Step 1: Write failing test for wetlands adapter**

Create `packages/enrichment/src/__tests__/wetlands.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { createWetlandsAdapter } from '../wetlands';
import type { Pool } from 'pg';

function mockPool(rows: Record<string, unknown>[]): Pool {
  return { query: vi.fn().mockResolvedValue({ rows }) } as unknown as Pool;
}

describe('createWetlandsAdapter', () => {
  it('returns wetland data when wetland found within buffer', async () => {
    const pool = mockPool([{
      wetland_type: 'PFO1A',
      attribute: 'Freshwater Forested/Shrub Wetland',
      distance_ft: 150,
    }]);
    const adapter = createWetlandsAdapter(pool);
    const result = await adapter.enrich({ lat: 43.1, lng: -72.78 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        wetlandType: 'PFO1A',
        wetlandDescription: 'Freshwater Forested/Shrub Wetland',
        distanceFt: 150,
      });
    }
  });

  it('returns null wetland type when none found within buffer', async () => {
    const pool = mockPool([]);
    const adapter = createWetlandsAdapter(pool);
    const result = await adapter.enrich({ lat: 43.1, lng: -72.78 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        wetlandType: null,
        wetlandDescription: null,
        distanceFt: Infinity,
      });
    }
  });

  it('returns closest wetland when multiple found', async () => {
    const pool = mockPool([{
      wetland_type: 'PEM1C',
      attribute: 'Freshwater Emergent Wetland',
      distance_ft: 50,
    }]);
    const adapter = createWetlandsAdapter(pool);
    const result = await adapter.enrich({ lat: 43.1, lng: -72.78 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.distanceFt).toBe(50);
    }
  });

  it('returns error on query failure', async () => {
    const pool = { query: vi.fn().mockRejectedValue(new Error('timeout')) } as unknown as Pool;
    const adapter = createWetlandsAdapter(pool);
    const result = await adapter.enrich({ lat: 43.1, lng: -72.78 });

    expect(result.ok).toBe(false);
  });

  it('has correct name and is available', () => {
    const pool = mockPool([]);
    const adapter = createWetlandsAdapter(pool);
    expect(adapter.name).toBe('usfws-nwi-wetlands');
    expect(adapter.isAvailable()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @landmatch/enrichment vitest run src/__tests__/wetlands.test.ts`
Expected: FAIL — `createWetlandsAdapter` not found.

- [ ] **Step 3: Implement wetlands adapter**

Create `packages/enrichment/src/wetlands.ts`:

```typescript
import type { Pool } from 'pg';
import type { EnrichmentAdapter, LatLng, Result, WetlandsData } from './types';

const BUFFER_FT = 1000; // Search radius in feet

export function createWetlandsAdapter(pool: Pool): EnrichmentAdapter<WetlandsData> {
  return {
    name: 'usfws-nwi-wetlands',

    isAvailable(): boolean {
      return true;
    },

    async enrich(coords: LatLng): Promise<Result<WetlandsData>> {
      try {
        // Find nearest wetland within buffer, ordered by distance
        const sql = `
          SELECT
            w.wetland_type,
            w.attribute,
            ROUND(ST_Distance(
              w.geom::geography,
              ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
            ) * 3.28084)::integer AS distance_ft
          FROM nwi_wetlands w
          WHERE ST_DWithin(
            w.geom::geography,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
            $3 * 0.3048
          )
          ORDER BY ST_Distance(
            w.geom::geography,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
          )
          LIMIT 1
        `;

        const { rows } = await pool.query(sql, [coords.lng, coords.lat, BUFFER_FT]);

        if (rows.length === 0) {
          return {
            ok: true,
            data: {
              wetlandType: null,
              wetlandDescription: null,
              distanceFt: Infinity,
            },
          };
        }

        return {
          ok: true,
          data: {
            wetlandType: rows[0].wetland_type,
            wetlandDescription: rows[0].attribute,
            distanceFt: Number(rows[0].distance_ft),
          },
        };
      } catch (err) {
        return { ok: false, error: `Wetlands query failed: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @landmatch/enrichment vitest run src/__tests__/wetlands.test.ts`
Expected: All 5 tests pass.

- [ ] **Step 5: Export new adapter factories from index**

In `packages/enrichment/src/index.ts`, add:

```typescript
export { createClimateNormalsAdapter } from './climateNormals';
export { createElevationAdapter } from './elevation';
export { createWetlandsAdapter } from './wetlands';
```

- [ ] **Step 6: Commit**

```bash
git add packages/enrichment/src/wetlands.ts packages/enrichment/src/__tests__/wetlands.test.ts packages/enrichment/src/index.ts
git commit -m "add NWI wetlands adapter with proximity buffer search"
```

---

## Task 7: Update Scoring Types and MapEnrichment

**Files:**
- Modify: `packages/scoring/src/types.ts`
- Modify: `packages/scoring/src/mapEnrichment.ts`

- [ ] **Step 1: Extend EnrichmentData in scoring types**

In `packages/scoring/src/types.ts`, extend `EnrichmentData`:

```typescript
export interface EnrichmentData {
  soilCapabilityClass?: number;
  soilDrainageClass?: string;
  soilTexture?: string;
  floodZone?: string;
  zoningCode?: string;
  infrastructure?: string[];
  fireRiskScore?: number;
  floodRiskScore?: number;
  // Climate normals (PRISM)
  frostFreeDays?: number;
  annualPrecipIn?: number;
  avgMinTempF?: number;
  avgMaxTempF?: number;
  growingSeasonDays?: number;
  // Elevation (3DEP)
  elevationFt?: number;
  slopePct?: number;
  // Wetlands (NWI)
  wetlandType?: string | null;
  wetlandDistanceFt?: number;
}
```

- [ ] **Step 2: Update mapEnrichmentResult**

In `packages/scoring/src/mapEnrichment.ts`:

```typescript
import type { EnrichmentResult } from '@landmatch/enrichment';
import type { EnrichmentData } from './types';

export function mapEnrichmentResult(result: EnrichmentResult): EnrichmentData {
  return {
    soilCapabilityClass: result.soil?.capabilityClass,
    soilDrainageClass: result.soil?.drainageClass,
    soilTexture: result.soil?.texture,
    floodZone: result.flood?.zone,
    zoningCode: result.parcel?.zoningCode,
    fireRiskScore: result.climate?.fireRiskScore,
    floodRiskScore: result.climate?.floodRiskScore,
    // Climate normals
    frostFreeDays: result.climateNormals?.frostFreeDays,
    annualPrecipIn: result.climateNormals?.annualPrecipIn,
    avgMinTempF: result.climateNormals?.avgMinTempF,
    avgMaxTempF: result.climateNormals?.avgMaxTempF,
    growingSeasonDays: result.climateNormals?.growingSeasonDays,
    // Elevation
    elevationFt: result.elevation?.elevationFt,
    slopePct: result.elevation?.slopePct,
    // Wetlands
    wetlandType: result.wetlands?.wetlandType,
    wetlandDistanceFt: result.wetlands?.distanceFt,
  };
}
```

- [ ] **Step 3: Update mapEnrichment tests**

In `packages/scoring/src/__tests__/mapEnrichment.test.ts`, add test cases for the new fields. Add a test:

```typescript
it('maps climate normals, elevation, and wetlands data', () => {
  const result: EnrichmentResult = {
    soil: { capabilityClass: 2, drainageClass: 'Well drained', texture: 'Silt loam', suitabilityRatings: {} },
    flood: { zone: 'X', description: 'Minimal risk' },
    climateNormals: { frostFreeDays: 158, annualPrecipIn: 42.3, avgMinTempF: 28.1, avgMaxTempF: 72.5, growingSeasonDays: 165 },
    elevation: { elevationFt: 1200, slopePct: 8.2 },
    wetlands: { wetlandType: null, wetlandDescription: null, distanceFt: Infinity },
    sourcesUsed: ['usda-soil', 'fema-nfhl', 'prism-climate-normals', 'usgs-3dep-elevation', 'usfws-nwi-wetlands'],
    errors: [],
  };

  const mapped = mapEnrichmentResult(result);

  expect(mapped.frostFreeDays).toBe(158);
  expect(mapped.annualPrecipIn).toBe(42.3);
  expect(mapped.avgMinTempF).toBe(28.1);
  expect(mapped.avgMaxTempF).toBe(72.5);
  expect(mapped.growingSeasonDays).toBe(165);
  expect(mapped.elevationFt).toBe(1200);
  expect(mapped.slopePct).toBe(8.2);
  expect(mapped.wetlandType).toBeNull();
  expect(mapped.wetlandDistanceFt).toBe(Infinity);
});

it('handles missing new enrichment sources gracefully', () => {
  const result: EnrichmentResult = {
    soil: { capabilityClass: 2, drainageClass: 'Well drained', texture: 'Silt loam', suitabilityRatings: {} },
    sourcesUsed: ['usda-soil'],
    errors: [],
  };

  const mapped = mapEnrichmentResult(result);

  expect(mapped.frostFreeDays).toBeUndefined();
  expect(mapped.elevationFt).toBeUndefined();
  expect(mapped.wetlandType).toBeUndefined();
});
```

- [ ] **Step 4: Run scoring tests**

Run: `pnpm --filter @landmatch/scoring test:run`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/scoring/src/types.ts packages/scoring/src/mapEnrichment.ts packages/scoring/src/__tests__/mapEnrichment.test.ts
git commit -m "extend scoring types and mapEnrichment for new enrichment sources"
```

---

## Task 8: Update Listing Repo to Persist New Enrichment Fields

**Files:**
- Modify: `apps/server/src/repos/listingRepo.ts:72-104`

- [ ] **Step 1: Update insertEnrichment to include new fields**

In `apps/server/src/repos/listingRepo.ts`, update the `insertEnrichment` function:

```typescript
export async function insertEnrichment(
  listingId: string,
  result: EnrichmentResult,
  tx?: Tx,
) {
  const id = generateId();

  const [row] = await (tx ?? db)
    .insert(enrichments)
    .values({
      id,
      listingId,
      // Soil
      soilCapabilityClass: result.soil?.capabilityClass ?? null,
      soilDrainageClass: result.soil?.drainageClass ?? null,
      soilTexture: result.soil?.texture ?? null,
      soilSuitabilityRatings: result.soil?.suitabilityRatings ?? null,
      // Flood
      femaFloodZone: result.flood?.zone ?? null,
      floodZoneDescription: result.flood?.description ?? null,
      // Parcel
      zoningCode: result.parcel?.zoningCode ?? null,
      zoningDescription: result.parcel?.zoningDescription ?? null,
      verifiedAcreage: result.parcel?.verifiedAcreage ?? null,
      parcelGeometry: result.parcel?.geometry ?? null,
      // Climate risk
      fireRiskScore: result.climate?.fireRiskScore ?? null,
      floodRiskScore: result.climate?.floodRiskScore ?? null,
      heatRiskScore: result.climate?.heatRiskScore ?? null,
      droughtRiskScore: result.climate?.droughtRiskScore ?? null,
      // Climate normals (PRISM)
      frostFreeDays: result.climateNormals?.frostFreeDays ?? null,
      annualPrecipIn: result.climateNormals?.annualPrecipIn ?? null,
      avgMinTempF: result.climateNormals?.avgMinTempF ?? null,
      avgMaxTempF: result.climateNormals?.avgMaxTempF ?? null,
      growingSeasonDays: result.climateNormals?.growingSeasonDays ?? null,
      // Elevation (3DEP)
      elevationFt: result.elevation?.elevationFt ?? null,
      slopePct: result.elevation?.slopePct ?? null,
      // Wetlands (NWI)
      wetlandType: result.wetlands?.wetlandType ?? null,
      wetlandDescription: result.wetlands?.wetlandDescription ?? null,
      wetlandWithinBufferFt: result.wetlands?.distanceFt === Infinity ? null : (result.wetlands?.distanceFt ?? null),
      // Meta
      enrichedAt: new Date(),
      sourcesUsed: result.sourcesUsed,
    })
    .returning();

  return row;
}
```

- [ ] **Step 2: Run server tests**

Run: `pnpm --filter @landmatch/server test:run`
Expected: Existing tests pass (they mock `insertEnrichment` so the new fields don't affect them).

- [ ] **Step 3: Run type check**

Run: `pnpm --filter @landmatch/server lint`
Expected: No type errors — the new columns from Task 1's schema change match the new fields.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/repos/listingRepo.ts
git commit -m "persist climate normals, elevation, wetlands in enrichment repo"
```

---

## Task 9: Register PostGIS Adapters in Server Startup

**Files:**
- Modify: `apps/server/src/app.ts` or create `apps/server/src/lib/geodataAdapters.ts`

- [ ] **Step 1: Create geodata adapter registration module**

Create `apps/server/src/lib/geodataAdapters.ts`:

```typescript
import {
  createClimateNormalsAdapter,
  createElevationAdapter,
  createWetlandsAdapter,
  registerAdapter,
} from '@landmatch/enrichment';

import { pool } from '../db/client';
import { features } from '../config';

export function registerGeodataAdapters(): void {
  if (!features.enableGeodataEnrichment) return;

  registerAdapter('climateNormals', createClimateNormalsAdapter(pool));
  registerAdapter('elevation', createElevationAdapter(pool));
  registerAdapter('wetlands', createWetlandsAdapter(pool));

  console.log('[geodata] Registered PostGIS enrichment adapters: climateNormals, elevation, wetlands');
}
```

- [ ] **Step 2: Call registration during server startup**

In `apps/server/src/app.ts`, import and call `registerGeodataAdapters()` after the db client is initialized (near the top of the file, after imports):

```typescript
import { registerGeodataAdapters } from './lib/geodataAdapters';

// ... existing app setup ...
registerGeodataAdapters();
```

- [ ] **Step 3: Run server lint**

Run: `pnpm --filter @landmatch/server lint`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/lib/geodataAdapters.ts apps/server/src/app.ts
git commit -m "register PostGIS enrichment adapters on server startup"
```

---

## Task 10: Geodata ETL Package Scaffold

**Files:**
- Create: `packages/geodata/package.json`
- Create: `packages/geodata/tsconfig.json`
- Create: `packages/geodata/src/types.ts`
- Create: `packages/geodata/src/cli.ts`
- Create: `packages/geodata/src/lib/postgis.ts`

- [ ] **Step 1: Create package.json**

Create `packages/geodata/package.json`:

```json
{
  "name": "@landmatch/geodata",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "load": "tsx src/cli.ts",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "pg": "^8.16.0",
    "dotenv": "^17.2.3"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/pg": "^8.15.4",
    "tsx": "^4.19.4",
    "typescript": "~5.9.3"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Create `packages/geodata/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create types**

Create `packages/geodata/src/types.ts`:

```typescript
export interface RegionBounds {
  name: string;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export const REGIONS: Record<string, RegionBounds> = {
  northeast: {
    name: 'Northeast US',
    minLat: 37.0,
    maxLat: 47.5,
    minLng: -80.5,
    maxLng: -66.9,
  },
  conus: {
    name: 'Continental US',
    minLat: 24.5,
    maxLat: 49.5,
    minLng: -125.0,
    maxLng: -66.9,
  },
};

export type SourceName = 'prism' | 'elevation' | 'wetlands';
```

- [ ] **Step 4: Create PostGIS helpers**

Create `packages/geodata/src/lib/postgis.ts`:

```typescript
import { execSync } from 'node:child_process';
import { Pool } from 'pg';

export function getPool(): Pool {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/landmatch';
  return new Pool({ connectionString: url });
}

export async function ensurePostGIS(pool: Pool): Promise<void> {
  await pool.query('CREATE EXTENSION IF NOT EXISTS postgis');
  await pool.query('CREATE EXTENSION IF NOT EXISTS postgis_raster');
  console.log('[geodata] PostGIS extensions enabled');
}

export function raster2pgsql(inputFile: string, tableName: string, srid: number = 4326): string {
  return `raster2pgsql -s ${srid} -I -C -M -t 100x100 "${inputFile}" ${tableName}`;
}

export function ogr2ogr(inputFile: string, tableName: string, dbUrl: string, srid: number = 4326): string {
  return `ogr2ogr -f "PostgreSQL" "PG:${dbUrl}" "${inputFile}" -nln ${tableName} -nlt PROMOTE_TO_MULTI -lco GEOMETRY_NAME=geom -s_srs EPSG:${srid} -t_srs EPSG:4326 -overwrite`;
}

export function runShell(cmd: string): void {
  console.log(`[geodata] $ ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}
```

- [ ] **Step 5: Create CLI entrypoint**

Create `packages/geodata/src/cli.ts`:

```typescript
import dotenv from 'dotenv';
dotenv.config({ path: '../../apps/server/.env' });

import { REGIONS, type SourceName } from './types';
import { ensurePostGIS, getPool } from './lib/postgis';
import { loadPrism } from './sources/prism';
import { loadElevation } from './sources/elevation';
import { loadWetlands } from './sources/wetlands';

const LOADERS: Record<SourceName, (regionName: string) => Promise<void>> = {
  prism: loadPrism,
  elevation: loadElevation,
  wetlands: loadWetlands,
};

async function main() {
  const args = process.argv.slice(2);
  const regionIdx = args.indexOf('--region');
  const sourceIdx = args.indexOf('--source');

  const regionName = regionIdx >= 0 ? args[regionIdx + 1] : 'northeast';
  const sourceName = sourceIdx >= 0 ? args[sourceIdx + 1] : undefined;

  if (!REGIONS[regionName]) {
    console.error(`Unknown region: ${regionName}. Available: ${Object.keys(REGIONS).join(', ')}`);
    process.exit(1);
  }

  const pool = getPool();
  await ensurePostGIS(pool);
  await pool.end();

  if (sourceName) {
    if (!(sourceName in LOADERS)) {
      console.error(`Unknown source: ${sourceName}. Available: ${Object.keys(LOADERS).join(', ')}`);
      process.exit(1);
    }
    await LOADERS[sourceName as SourceName](regionName);
  } else {
    for (const [name, loader] of Object.entries(LOADERS)) {
      console.log(`\n=== Loading ${name} ===`);
      await loader(regionName);
    }
  }

  console.log('\n[geodata] Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 6: Install dependencies**

```bash
cd /Users/amarbakir/dev/land-match && pnpm install
```

- [ ] **Step 7: Commit**

```bash
git add packages/geodata/
git commit -m "scaffold geodata ETL package with CLI, types, PostGIS helpers"
```

---

## Task 11: PRISM Climate Normals ETL

**Files:**
- Create: `packages/geodata/src/sources/prism.ts`

PRISM 30-yr normals are available as BIL (Band Interleaved by Line) raster files from the PRISM Climate Group. They need to be downloaded, clipped to region, and loaded into PostGIS as raster tables.

- [ ] **Step 1: Implement PRISM loader**

Create `packages/geodata/src/sources/prism.ts`:

```typescript
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REGIONS } from '../types';
import { getPool, raster2pgsql, runShell } from '../lib/postgis';

const DATA_DIR = join(import.meta.dirname, '../../data/prism');

// PRISM 30-year normals (1991-2020) download URLs
const PRISM_VARS: Record<string, { url: string; table: string; description: string }> = {
  tmin: {
    url: 'https://ftp.prism.oregonstate.edu/normals_4km/tmin/PRISM_tmin_30yr_normal_4kmM4_annual_bil.zip',
    table: 'prism_avg_min_temp',
    description: 'Average annual minimum temperature (°C)',
  },
  tmax: {
    url: 'https://ftp.prism.oregonstate.edu/normals_4km/tmax/PRISM_tmax_30yr_normal_4kmM4_annual_bil.zip',
    table: 'prism_avg_max_temp',
    description: 'Average annual maximum temperature (°C)',
  },
  ppt: {
    url: 'https://ftp.prism.oregonstate.edu/normals_4km/ppt/PRISM_ppt_30yr_normal_4kmM4_annual_bil.zip',
    table: 'prism_annual_precip',
    description: 'Average annual precipitation (mm)',
  },
};

// Note: frost_free_days and growing_season_days are derived from monthly tmin normals
// in a post-processing step, not directly available as PRISM variables.
// For MVP we compute them at query time from monthly data, or load a pre-computed raster.

export async function loadPrism(regionName: string): Promise<void> {
  const region = REGIONS[regionName];
  if (!region) throw new Error(`Unknown region: ${regionName}`);

  mkdirSync(DATA_DIR, { recursive: true });

  const pool = getPool();
  const dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/landmatch';

  for (const [varName, config] of Object.entries(PRISM_VARS)) {
    console.log(`[prism] Processing ${varName}: ${config.description}`);

    const zipPath = join(DATA_DIR, `${varName}.zip`);
    const bilDir = join(DATA_DIR, varName);
    const clippedPath = join(DATA_DIR, `${varName}_clipped.tif`);

    // Download
    if (!existsSync(zipPath)) {
      console.log(`[prism] Downloading ${varName}...`);
      runShell(`curl -L -o "${zipPath}" "${config.url}"`);
    }

    // Extract
    mkdirSync(bilDir, { recursive: true });
    runShell(`unzip -o "${zipPath}" -d "${bilDir}"`);

    // Find .bil file
    const bilFile = join(bilDir, `PRISM_${varName}_30yr_normal_4kmM4_annual_bil.bil`);

    // Clip to region bounding box using gdalwarp
    console.log(`[prism] Clipping ${varName} to ${region.name}...`);
    runShell(`gdalwarp -te ${region.minLng} ${region.minLat} ${region.maxLng} ${region.maxLat} -t_srs EPSG:4326 "${bilFile}" "${clippedPath}" -overwrite`);

    // Convert units if needed (PRISM temps are in °C, we want °F; precip is in mm, we want inches)
    const convertedPath = join(DATA_DIR, `${varName}_converted.tif`);
    if (varName === 'tmin' || varName === 'tmax') {
      // °C to °F: (C * 9/5) + 32
      runShell(`gdal_calc.py -A "${clippedPath}" --outfile="${convertedPath}" --calc="A*1.8+32" --NoDataValue=-9999 --overwrite`);
    } else if (varName === 'ppt') {
      // mm to inches: mm / 25.4
      runShell(`gdal_calc.py -A "${clippedPath}" --outfile="${convertedPath}" --calc="A/25.4" --NoDataValue=-9999 --overwrite`);
    }
    const loadPath = existsSync(convertedPath) ? convertedPath : clippedPath;

    // Load into PostGIS
    console.log(`[prism] Loading ${varName} into ${config.table}...`);
    await pool.query(`DROP TABLE IF EXISTS ${config.table} CASCADE`);
    const rasterCmd = raster2pgsql(loadPath, config.table);
    runShell(`${rasterCmd} | psql "${dbUrl}"`);

    console.log(`[prism] ${varName} loaded successfully.`);
  }

  // Create frost-free-days and growing-season tables as derived views
  // For MVP: approximate from tmin monthly data or use annual tmin as proxy
  console.log('[prism] Creating frost_free_days and growing_season derived tables...');
  await pool.query(`
    DROP TABLE IF EXISTS prism_frost_free_days CASCADE;
    CREATE TABLE prism_frost_free_days AS
    SELECT rid, rast FROM prism_avg_min_temp;
    COMMENT ON TABLE prism_frost_free_days IS 'Placeholder — replace with monthly tmin-derived computation';
  `);

  await pool.query(`
    DROP TABLE IF EXISTS prism_growing_season CASCADE;
    CREATE TABLE prism_growing_season AS
    SELECT rid, rast FROM prism_avg_min_temp;
    COMMENT ON TABLE prism_growing_season IS 'Placeholder — replace with monthly tmin-derived computation';
  `);

  await pool.end();
  console.log('[prism] All PRISM variables loaded.');
}
```

- [ ] **Step 2: Verify lint passes**

Run: `pnpm --filter @landmatch/geodata lint`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add packages/geodata/src/sources/prism.ts
git commit -m "add PRISM climate normals ETL with download, clip, unit conversion, PostGIS load"
```

---

## Task 12: USGS 3DEP Elevation ETL

**Files:**
- Create: `packages/geodata/src/sources/elevation.ts`

- [ ] **Step 1: Implement elevation loader**

Create `packages/geodata/src/sources/elevation.ts`:

```typescript
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REGIONS } from '../types';
import { getPool, raster2pgsql, runShell } from '../lib/postgis';

const DATA_DIR = join(import.meta.dirname, '../../data/elevation');

// USGS 3DEP 1/3 arc-second (~10m) DEM
// National map download links are per-tile; for bulk we use the USGS TNM API
// For a region clip, it's easier to use the pre-built CONUS VRT or individual state tiles

export async function loadElevation(regionName: string): Promise<void> {
  const region = REGIONS[regionName];
  if (!region) throw new Error(`Unknown region: ${regionName}`);

  mkdirSync(DATA_DIR, { recursive: true });

  const pool = getPool();
  const dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/landmatch';

  const outputPath = join(DATA_DIR, `elevation_${regionName}.tif`);

  // Use USGS 3DEP WCS (Web Coverage Service) to fetch elevation for the region
  // This avoids downloading individual tiles
  console.log(`[elevation] Fetching 3DEP elevation for ${region.name} via WCS...`);

  if (!existsSync(outputPath)) {
    // USGS 3DEP WCS endpoint for 1/3 arc-second DEM
    const wcsUrl = 'https://elevation.nationalmap.gov/arcgis/services/3DEPElevation/ImageServer/WCSServer';

    runShell(`gdalwarp \
      "WCS:${wcsUrl}?service=WCS&version=1.1.1&request=GetCoverage&identifier=DEP3Elevation&format=GeoTIFF" \
      "${outputPath}" \
      -te ${region.minLng} ${region.minLat} ${region.maxLng} ${region.maxLat} \
      -t_srs EPSG:4326 \
      -tr 0.0003 0.0003 \
      -overwrite`);
  }

  // Load into PostGIS
  console.log('[elevation] Loading into PostGIS...');
  await pool.query('DROP TABLE IF EXISTS usgs_3dep_elevation CASCADE');
  const rasterCmd = raster2pgsql(outputPath, 'usgs_3dep_elevation');
  runShell(`${rasterCmd} | psql "${dbUrl}"`);

  // Add spatial index
  await pool.query('SELECT AddRasterConstraints(\'usgs_3dep_elevation\'::name, \'rast\'::name)');

  await pool.end();
  console.log('[elevation] 3DEP elevation loaded successfully.');
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/geodata/src/sources/elevation.ts
git commit -m "add USGS 3DEP elevation ETL via WCS"
```

---

## Task 13: NWI Wetlands ETL

**Files:**
- Create: `packages/geodata/src/sources/wetlands.ts`

- [ ] **Step 1: Implement wetlands loader**

Create `packages/geodata/src/sources/wetlands.ts`:

```typescript
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REGIONS } from '../types';
import { getPool, ogr2ogr, runShell } from '../lib/postgis';

const DATA_DIR = join(import.meta.dirname, '../../data/wetlands');

// NWI state-level geodatabase downloads
// Northeast states: CT, DE, MA, MD, ME, NH, NJ, NY, PA, RI, VT, VA, WV
const NE_STATES = ['CT', 'DE', 'MA', 'MD', 'ME', 'NH', 'NJ', 'NY', 'PA', 'RI', 'VT', 'VA', 'WV'];

function nwiDownloadUrl(state: string): string {
  return `https://www.fws.gov/wetlands/Data/State-Downloads/${state}_shapefile_wetlands.zip`;
}

export async function loadWetlands(regionName: string): Promise<void> {
  const region = REGIONS[regionName];
  if (!region) throw new Error(`Unknown region: ${regionName}`);

  mkdirSync(DATA_DIR, { recursive: true });

  const pool = getPool();
  const dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/landmatch';

  const states = regionName === 'northeast' ? NE_STATES : NE_STATES; // Expand for other regions

  // Drop existing table (we'll append state by state)
  await pool.query('DROP TABLE IF EXISTS nwi_wetlands CASCADE');

  for (const state of states) {
    console.log(`[wetlands] Processing ${state}...`);

    const zipPath = join(DATA_DIR, `${state}_wetlands.zip`);
    const extractDir = join(DATA_DIR, state);

    // Download
    if (!existsSync(zipPath)) {
      console.log(`[wetlands] Downloading ${state}...`);
      runShell(`curl -L -o "${zipPath}" "${nwiDownloadUrl(state)}"`);
    }

    // Extract
    mkdirSync(extractDir, { recursive: true });
    runShell(`unzip -o "${zipPath}" -d "${extractDir}"`);

    // Find shapefile
    const shpFile = join(extractDir, `${state}_Wetlands.shp`);

    // Load into PostGIS (append mode after first state)
    const isFirst = state === states[0];
    const appendFlag = isFirst ? '-overwrite' : '-append';

    console.log(`[wetlands] Loading ${state} into PostGIS...`);
    runShell(`ogr2ogr -f "PostgreSQL" "PG:${dbUrl}" "${shpFile}" \
      -nln nwi_wetlands \
      -nlt PROMOTE_TO_MULTI \
      -lco GEOMETRY_NAME=geom \
      -s_srs EPSG:4326 -t_srs EPSG:4326 \
      ${appendFlag} \
      -select "WETLAND_TYPE,ATTRIBUTE"`);
  }

  // Create spatial index
  console.log('[wetlands] Creating spatial index...');
  await pool.query('CREATE INDEX IF NOT EXISTS nwi_wetlands_geom_idx ON nwi_wetlands USING GIST (geom)');
  // Create geography index for distance queries
  await pool.query('CREATE INDEX IF NOT EXISTS nwi_wetlands_geog_idx ON nwi_wetlands USING GIST ((geom::geography))');

  await pool.end();
  console.log('[wetlands] NWI wetlands loaded successfully.');
}
```

- [ ] **Step 2: Verify lint passes**

Run: `pnpm --filter @landmatch/geodata lint`
Expected: No type errors.

- [ ] **Step 3: Add .gitignore for data directory**

Create `packages/geodata/data/.gitignore`:

```
*
!.gitignore
```

- [ ] **Step 4: Commit**

```bash
git add packages/geodata/src/sources/wetlands.ts packages/geodata/data/.gitignore
git commit -m "add NWI wetlands ETL with state-level download and PostGIS load"
```

---

## Task 14: Run Full Lint + Test Verification

- [ ] **Step 1: Run enrichment package tests**

Run: `pnpm --filter @landmatch/enrichment test:run`
Expected: All tests pass.

- [ ] **Step 2: Run scoring package tests**

Run: `pnpm --filter @landmatch/scoring test:run`
Expected: All tests pass.

- [ ] **Step 3: Run server tests**

Run: `pnpm --filter @landmatch/server test:run`
Expected: All tests pass.

- [ ] **Step 4: Run full lint**

Run: `pnpm lint`
Expected: All packages pass type checking.

- [ ] **Step 5: Fix any failures**

Address any type errors or test failures. The most likely issue is import paths or missing type re-exports.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "verify enrichment expansion: all tests and lint pass"
```
