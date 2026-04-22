# Homestead Scoring Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add homestead-specific translated scores (garden viability, growing season, water availability, flood safety, septic feasibility, building suitability, firewood potential) that wrap the existing generic scorer as a superset.

**Architecture:** New pure functions in `packages/scoring/` compute 7 homestead component scores (0-100) from enrichment data. A `homesteadScore()` orchestrator calls the generic `scoreListing()` for base scores, then adds homestead components and computes a composite. Each component also produces a plain-language template label. The generic scorer is preserved unchanged.

**Tech Stack:** TypeScript, Vitest

**Depends on:** Enrichment Expansion plan (new `EnrichmentData` fields must be available).

---

## File Map

### New Files

| File | Purpose |
|------|---------|
| `packages/scoring/src/homestead/types.ts` | Homestead score types, component enum, labels |
| `packages/scoring/src/homestead/gardenViability.ts` | Garden viability score (soil + drainage + texture) |
| `packages/scoring/src/homestead/growingSeason.ts` | Growing season score (frost-free days, min temp) |
| `packages/scoring/src/homestead/waterAvailability.ts` | Water availability score (precip, wetlands, drainage) |
| `packages/scoring/src/homestead/floodSafety.ts` | Flood safety score (zone, elevation, slope) |
| `packages/scoring/src/homestead/septicFeasibility.ts` | Septic feasibility score (texture, drainage, slope, wetlands) |
| `packages/scoring/src/homestead/buildingSuitability.ts` | Building suitability score (slope, elevation, flood) |
| `packages/scoring/src/homestead/firewoodPotential.ts` | Firewood potential score (precip, temp, acreage) |
| `packages/scoring/src/homestead/scorer.ts` | Homestead score orchestrator wrapping generic scorer |
| `packages/scoring/src/homestead/index.ts` | Barrel export |
| `packages/scoring/src/__tests__/homestead.test.ts` | Tests for all homestead components + orchestrator |

### Modified Files

| File | Change |
|------|--------|
| `packages/scoring/src/index.ts` | Re-export homestead module |

---

## Task 1: Homestead Types

**Files:**
- Create: `packages/scoring/src/homestead/types.ts`

- [ ] **Step 1: Define homestead score types**

Create `packages/scoring/src/homestead/types.ts`:

```typescript
import type { EnrichmentData, ListingData, ScoringResult } from '../types';

export interface HomesteadComponentScore {
  score: number; // 0-100
  label: string; // Plain-language description
}

export interface HomesteadScores {
  gardenViability: HomesteadComponentScore;
  growingSeason: HomesteadComponentScore;
  waterAvailability: HomesteadComponentScore;
  floodSafety: HomesteadComponentScore;
  septicFeasibility: HomesteadComponentScore;
  buildingSuitability: HomesteadComponentScore;
  firewoodPotential: HomesteadComponentScore;
}

export interface HomesteadScoringResult {
  /** Generic scoring result (preserved) */
  base: ScoringResult;
  /** Homestead-specific component scores */
  homestead: HomesteadScores;
  /** Weighted composite of homestead scores (0-100) */
  homesteadScore: number;
}

export const DEFAULT_HOMESTEAD_WEIGHTS: Record<keyof HomesteadScores, number> = {
  gardenViability: 2.0,
  growingSeason: 1.5,
  waterAvailability: 1.5,
  floodSafety: 2.0,
  septicFeasibility: 1.5,
  buildingSuitability: 1.0,
  firewoodPotential: 0.5,
};

export type HomesteadInput = {
  listing: ListingData;
  enrichment: EnrichmentData;
};
```

- [ ] **Step 2: Commit**

```bash
git add packages/scoring/src/homestead/types.ts
git commit -m "add homestead scoring types"
```

---

## Task 2: Garden Viability Score

**Files:**
- Create: `packages/scoring/src/homestead/gardenViability.ts`
- Create: `packages/scoring/src/__tests__/homestead.test.ts` (start test file)

- [ ] **Step 1: Write failing tests**

Create `packages/scoring/src/__tests__/homestead.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { scoreGardenViability } from '../homestead/gardenViability';
import type { EnrichmentData } from '../types';

describe('scoreGardenViability', () => {
  it('scores excellent garden soil (Class I-II, well-drained, loam)', () => {
    const enrichment: EnrichmentData = {
      soilCapabilityClass: 1,
      soilDrainageClass: 'Well drained',
      soilTexture: 'Silt loam',
    };
    const result = scoreGardenViability(enrichment);
    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.label).toContain('excellent');
  });

  it('scores poor garden soil (Class VII, poorly drained, clay)', () => {
    const enrichment: EnrichmentData = {
      soilCapabilityClass: 7,
      soilDrainageClass: 'Poorly drained',
      soilTexture: 'Clay',
    };
    const result = scoreGardenViability(enrichment);
    expect(result.score).toBeLessThanOrEqual(25);
    expect(result.label).toContain('poor');
  });

  it('scores moderate garden soil (Class III, moderately drained)', () => {
    const enrichment: EnrichmentData = {
      soilCapabilityClass: 3,
      soilDrainageClass: 'Moderately well drained',
      soilTexture: 'Sandy loam',
    };
    const result = scoreGardenViability(enrichment);
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.score).toBeLessThanOrEqual(80);
  });

  it('returns neutral score when data is missing', () => {
    const result = scoreGardenViability({});
    expect(result.score).toBe(50);
    expect(result.label).toContain('Unknown');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @landmatch/scoring vitest run src/__tests__/homestead.test.ts`
Expected: FAIL — `scoreGardenViability` not found.

- [ ] **Step 3: Implement garden viability scorer**

Create `packages/scoring/src/homestead/gardenViability.ts`:

```typescript
import type { EnrichmentData } from '../types';
import type { HomesteadComponentScore } from './types';

const SOIL_CLASS_SCORES: Record<number, number> = {
  1: 100, 2: 85, 3: 65, 4: 45, 5: 25, 6: 15, 7: 5, 8: 0,
};

const DRAINAGE_SCORES: Record<string, number> = {
  'Excessively drained': 60,
  'Somewhat excessively drained': 75,
  'Well drained': 100,
  'Moderately well drained': 80,
  'Somewhat poorly drained': 40,
  'Poorly drained': 15,
  'Very poorly drained': 0,
};

const GOOD_TEXTURES = ['loam', 'silt loam', 'sandy loam', 'silty clay loam', 'clay loam'];
const POOR_TEXTURES = ['sand', 'clay', 'heavy clay', 'gravel'];

export function scoreGardenViability(enrichment: EnrichmentData): HomesteadComponentScore {
  const soilClass = enrichment.soilCapabilityClass;
  const drainage = enrichment.soilDrainageClass;
  const texture = enrichment.soilTexture;

  if (soilClass === undefined && !drainage && !texture) {
    return { score: 50, label: 'Unknown — no soil data available' };
  }

  // Weighted sub-scores
  const classScore = soilClass !== undefined ? (SOIL_CLASS_SCORES[soilClass] ?? 30) : 50;
  const drainageScore = drainage ? (DRAINAGE_SCORES[drainage] ?? 50) : 50;

  let textureScore = 50;
  if (texture) {
    const lower = texture.toLowerCase();
    if (GOOD_TEXTURES.some((t) => lower.includes(t))) textureScore = 90;
    else if (POOR_TEXTURES.some((t) => lower.includes(t))) textureScore = 20;
    else textureScore = 60;
  }

  // Class: 50%, Drainage: 30%, Texture: 20%
  const score = Math.round(classScore * 0.5 + drainageScore * 0.3 + textureScore * 0.2);

  const label = buildLabel(score, soilClass, drainage, texture);
  return { score, label };
}

function buildLabel(score: number, soilClass?: number, drainage?: string, texture?: string): string {
  const classStr = soilClass !== undefined ? `Class ${toRoman(soilClass)}` : 'unknown class';
  const textureStr = texture ?? 'unknown texture';
  const drainStr = drainage?.toLowerCase() ?? 'unknown drainage';

  if (score >= 80) return `${classStr} ${textureStr}, ${drainStr} — excellent garden soil`;
  if (score >= 60) return `${classStr} ${textureStr}, ${drainStr} — good garden soil`;
  if (score >= 40) return `${classStr} ${textureStr}, ${drainStr} — moderate garden soil, amendments likely needed`;
  if (score >= 20) return `${classStr} ${textureStr}, ${drainStr} — poor garden soil, significant work required`;
  return `${classStr} ${textureStr}, ${drainStr} — unsuitable for garden use`;
}

function toRoman(n: number): string {
  const map: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII' };
  return map[n] ?? String(n);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @landmatch/scoring vitest run src/__tests__/homestead.test.ts`
Expected: All 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/scoring/src/homestead/gardenViability.ts packages/scoring/src/__tests__/homestead.test.ts
git commit -m "add garden viability homestead scorer"
```

---

## Task 3: Growing Season Score

**Files:**
- Create: `packages/scoring/src/homestead/growingSeason.ts`
- Modify: `packages/scoring/src/__tests__/homestead.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `packages/scoring/src/__tests__/homestead.test.ts`:

```typescript
import { scoreGrowingSeason } from '../homestead/growingSeason';

describe('scoreGrowingSeason', () => {
  it('scores long growing season (180+ frost-free days)', () => {
    const result = scoreGrowingSeason({ frostFreeDays: 200, avgMinTempF: 35 });
    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.label).toContain('frost-free days');
  });

  it('scores short growing season (90 frost-free days)', () => {
    const result = scoreGrowingSeason({ frostFreeDays: 90, avgMinTempF: 10 });
    expect(result.score).toBeLessThanOrEqual(40);
  });

  it('scores moderate growing season (140 frost-free days)', () => {
    const result = scoreGrowingSeason({ frostFreeDays: 140, avgMinTempF: 25 });
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.score).toBeLessThanOrEqual(80);
  });

  it('returns neutral when data missing', () => {
    const result = scoreGrowingSeason({});
    expect(result.score).toBe(50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @landmatch/scoring vitest run src/__tests__/homestead.test.ts`
Expected: FAIL — `scoreGrowingSeason` not found.

- [ ] **Step 3: Implement growing season scorer**

Create `packages/scoring/src/homestead/growingSeason.ts`:

```typescript
import type { EnrichmentData } from '../types';
import type { HomesteadComponentScore } from './types';

// USDA hardiness zone approximation from avg min temp
function hardinessZone(avgMinTempF: number): string {
  if (avgMinTempF <= -50) return '1';
  if (avgMinTempF <= -40) return '2';
  if (avgMinTempF <= -30) return '3';
  if (avgMinTempF <= -20) return '4';
  if (avgMinTempF <= -10) return '5';
  if (avgMinTempF <= 0) return '6a';
  if (avgMinTempF <= 10) return '6b';
  if (avgMinTempF <= 20) return '7a';
  if (avgMinTempF <= 30) return '7b';
  if (avgMinTempF <= 40) return '8';
  return '9+';
}

export function scoreGrowingSeason(enrichment: EnrichmentData): HomesteadComponentScore {
  const ffd = enrichment.frostFreeDays;
  const minTemp = enrichment.avgMinTempF;

  if (ffd === undefined) {
    return { score: 50, label: 'Unknown — no growing season data available' };
  }

  // Score frost-free days: 200+ = 100, 60 = 0, linear scale
  const ffdScore = Math.max(0, Math.min(100, Math.round(((ffd - 60) / 140) * 100)));

  // Bonus/penalty for extreme temps (minor adjustment)
  let tempAdjust = 0;
  if (minTemp !== undefined) {
    if (minTemp < 0) tempAdjust = -10; // Very cold winters
    else if (minTemp > 30) tempAdjust = 10; // Mild winters
  }

  const score = Math.max(0, Math.min(100, ffdScore + tempAdjust));
  const zone = minTemp !== undefined ? `, zone ${hardinessZone(minTemp)}` : '';
  const label = buildLabel(score, ffd, zone);

  return { score, label };
}

function buildLabel(score: number, ffd: number, zone: string): string {
  if (score >= 80) return `${ffd} frost-free days${zone} — excellent growing season`;
  if (score >= 60) return `${ffd} frost-free days${zone} — good growing season`;
  if (score >= 40) return `${ffd} frost-free days${zone} — moderate growing season, focus on cold-hardy crops`;
  if (score >= 20) return `${ffd} frost-free days${zone} — short growing season, season extension recommended`;
  return `${ffd} frost-free days${zone} — very short growing season`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @landmatch/scoring vitest run src/__tests__/homestead.test.ts`
Expected: All 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/scoring/src/homestead/growingSeason.ts packages/scoring/src/__tests__/homestead.test.ts
git commit -m "add growing season homestead scorer"
```

---

## Task 4: Water Availability Score

**Files:**
- Create: `packages/scoring/src/homestead/waterAvailability.ts`
- Modify: `packages/scoring/src/__tests__/homestead.test.ts`

- [ ] **Step 1: Write failing tests**

Append to test file:

```typescript
import { scoreWaterAvailability } from '../homestead/waterAvailability';

describe('scoreWaterAvailability', () => {
  it('scores high precip with good drainage as excellent', () => {
    const result = scoreWaterAvailability({ annualPrecipIn: 48, soilDrainageClass: 'Well drained', wetlandType: null });
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it('scores low precip as poor', () => {
    const result = scoreWaterAvailability({ annualPrecipIn: 15, soilDrainageClass: 'Well drained', wetlandType: null });
    expect(result.score).toBeLessThanOrEqual(40);
  });

  it('gives bonus for nearby wetland (water source)', () => {
    const withWetland = scoreWaterAvailability({ annualPrecipIn: 35, wetlandType: 'PFO1A', wetlandDistanceFt: 200 });
    const without = scoreWaterAvailability({ annualPrecipIn: 35, wetlandType: null });
    expect(withWetland.score).toBeGreaterThan(without.score);
  });

  it('returns neutral when data missing', () => {
    const result = scoreWaterAvailability({});
    expect(result.score).toBe(50);
  });
});
```

- [ ] **Step 2: Implement water availability scorer**

Create `packages/scoring/src/homestead/waterAvailability.ts`:

```typescript
import type { EnrichmentData } from '../types';
import type { HomesteadComponentScore } from './types';

export function scoreWaterAvailability(enrichment: EnrichmentData): HomesteadComponentScore {
  const precip = enrichment.annualPrecipIn;
  const drainage = enrichment.soilDrainageClass;
  const wetlandType = enrichment.wetlandType;
  const wetlandDist = enrichment.wetlandDistanceFt;

  if (precip === undefined) {
    return { score: 50, label: 'Unknown — no precipitation data available' };
  }

  // Precip score: 50+ inches = 100, 10 inches = 0, linear
  const precipScore = Math.max(0, Math.min(100, Math.round(((precip - 10) / 40) * 100)));

  // Drainage adjustment: well-drained means water percolates (good for wells, bad for surface retention)
  // For homesteading, moderate drainage is ideal
  let drainageAdjust = 0;
  if (drainage) {
    if (drainage.includes('Well drained')) drainageAdjust = 5;
    else if (drainage.includes('Moderately well')) drainageAdjust = 10;
    else if (drainage.includes('Poorly')) drainageAdjust = -5;
    else if (drainage.includes('Excessively')) drainageAdjust = -10;
  }

  // Wetland proximity bonus: nearby wetlands suggest water availability
  let wetlandBonus = 0;
  if (wetlandType !== null && wetlandType !== undefined && wetlandDist !== undefined && wetlandDist !== Infinity) {
    if (wetlandDist <= 500) wetlandBonus = 15;
    else if (wetlandDist <= 1000) wetlandBonus = 10;
  }

  const score = Math.max(0, Math.min(100, precipScore + drainageAdjust + wetlandBonus));
  const label = buildLabel(score, precip, wetlandType);

  return { score, label };
}

function buildLabel(score: number, precip: number, wetlandType?: string | null): string {
  const wetlandStr = wetlandType ? ', nearby wetland' : '';
  if (score >= 80) return `${precip}in annual precip${wetlandStr} — excellent water availability`;
  if (score >= 60) return `${precip}in annual precip${wetlandStr} — good water availability`;
  if (score >= 40) return `${precip}in annual precip${wetlandStr} — moderate, may need supplemental water`;
  if (score >= 20) return `${precip}in annual precip${wetlandStr} — limited water, irrigation recommended`;
  return `${precip}in annual precip${wetlandStr} — arid, significant water infrastructure needed`;
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @landmatch/scoring vitest run src/__tests__/homestead.test.ts`
Expected: All 12 tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/scoring/src/homestead/waterAvailability.ts packages/scoring/src/__tests__/homestead.test.ts
git commit -m "add water availability homestead scorer"
```

---

## Task 5: Flood Safety, Septic, Building, Firewood Scores

**Files:**
- Create: `packages/scoring/src/homestead/floodSafety.ts`
- Create: `packages/scoring/src/homestead/septicFeasibility.ts`
- Create: `packages/scoring/src/homestead/buildingSuitability.ts`
- Create: `packages/scoring/src/homestead/firewoodPotential.ts`
- Modify: `packages/scoring/src/__tests__/homestead.test.ts`

- [ ] **Step 1: Write failing tests for all four scorers**

Append to test file:

```typescript
import { scoreFloodSafety } from '../homestead/floodSafety';
import { scoreSepticFeasibility } from '../homestead/septicFeasibility';
import { scoreBuildingSuitability } from '../homestead/buildingSuitability';
import { scoreFirewoodPotential } from '../homestead/firewoodPotential';

describe('scoreFloodSafety', () => {
  it('scores Zone X with high elevation as excellent', () => {
    const result = scoreFloodSafety({ floodZone: 'X', elevationFt: 1200, slopePct: 5 });
    expect(result.score).toBeGreaterThanOrEqual(85);
  });

  it('scores Zone AE as poor', () => {
    const result = scoreFloodSafety({ floodZone: 'AE', elevationFt: 200, slopePct: 1 });
    expect(result.score).toBeLessThanOrEqual(30);
  });

  it('returns neutral when data missing', () => {
    const result = scoreFloodSafety({});
    expect(result.score).toBe(50);
  });
});

describe('scoreSepticFeasibility', () => {
  it('scores well-drained loam with gentle slope as excellent', () => {
    const result = scoreSepticFeasibility({
      soilTexture: 'Sandy loam', soilDrainageClass: 'Well drained', slopePct: 5, wetlandType: null,
    });
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it('scores clay with poor drainage as poor', () => {
    const result = scoreSepticFeasibility({
      soilTexture: 'Clay', soilDrainageClass: 'Poorly drained', slopePct: 2, wetlandType: 'PFO1A',
    });
    expect(result.score).toBeLessThanOrEqual(30);
  });

  it('penalizes steep slopes', () => {
    const gentle = scoreSepticFeasibility({ soilTexture: 'Loam', soilDrainageClass: 'Well drained', slopePct: 5 });
    const steep = scoreSepticFeasibility({ soilTexture: 'Loam', soilDrainageClass: 'Well drained', slopePct: 30 });
    expect(gentle.score).toBeGreaterThan(steep.score);
  });
});

describe('scoreBuildingSuitability', () => {
  it('scores gentle slope in Zone X as excellent', () => {
    const result = scoreBuildingSuitability({ slopePct: 3, elevationFt: 800, floodZone: 'X' });
    expect(result.score).toBeGreaterThanOrEqual(85);
  });

  it('penalizes very steep slope', () => {
    const result = scoreBuildingSuitability({ slopePct: 35, elevationFt: 800, floodZone: 'X' });
    expect(result.score).toBeLessThanOrEqual(50);
  });
});

describe('scoreFirewoodPotential', () => {
  it('scores adequate precip with large acreage as good', () => {
    const enrichment: EnrichmentData = { annualPrecipIn: 45, avgMaxTempF: 75 };
    const result = scoreFirewoodPotential(enrichment, { acreage: 20 });
    expect(result.score).toBeGreaterThanOrEqual(65);
  });

  it('scores low precip as poor for firewood', () => {
    const result = scoreFirewoodPotential({ annualPrecipIn: 12, avgMaxTempF: 80 }, { acreage: 20 });
    expect(result.score).toBeLessThanOrEqual(40);
  });

  it('penalizes small acreage', () => {
    const large = scoreFirewoodPotential({ annualPrecipIn: 40, avgMaxTempF: 70 }, { acreage: 30 });
    const small = scoreFirewoodPotential({ annualPrecipIn: 40, avgMaxTempF: 70 }, { acreage: 2 });
    expect(large.score).toBeGreaterThan(small.score);
  });
});
```

- [ ] **Step 2: Implement flood safety scorer**

Create `packages/scoring/src/homestead/floodSafety.ts`:

```typescript
import type { EnrichmentData } from '../types';
import type { HomesteadComponentScore } from './types';

const ZONE_SCORES: Record<string, number> = {
  X: 100, B: 80, C: 80, D: 60, A: 20, AE: 15, AH: 15, AO: 15, VE: 0, V: 0,
};

export function scoreFloodSafety(enrichment: EnrichmentData): HomesteadComponentScore {
  const zone = enrichment.floodZone;
  const elevation = enrichment.elevationFt;
  const slope = enrichment.slopePct;

  if (!zone && elevation === undefined) {
    return { score: 50, label: 'Unknown — no flood or elevation data' };
  }

  let zoneScore = zone ? (ZONE_SCORES[zone] ?? 50) : 50;

  // Elevation bonus: higher = safer
  let elevationAdjust = 0;
  if (elevation !== undefined) {
    if (elevation > 1000) elevationAdjust = 10;
    else if (elevation > 500) elevationAdjust = 5;
    else if (elevation < 100) elevationAdjust = -10;
  }

  // Slope bonus: some slope means water drains away
  let slopeAdjust = 0;
  if (slope !== undefined) {
    if (slope >= 2 && slope <= 15) slopeAdjust = 5;
    else if (slope < 1) slopeAdjust = -5; // flat = pooling risk
  }

  const score = Math.max(0, Math.min(100, zoneScore + elevationAdjust + slopeAdjust));

  const parts: string[] = [];
  if (zone) parts.push(`Zone ${zone}`);
  if (elevation !== undefined) parts.push(`${Math.round(elevation)}ft elevation`);
  if (slope !== undefined) parts.push(`${slope}% slope`);

  const detail = parts.join(', ');
  const quality = score >= 80 ? 'excellent flood safety' : score >= 60 ? 'moderate flood risk' : score >= 30 ? 'elevated flood risk' : 'high flood risk';

  return { score, label: `${detail} — ${quality}` };
}
```

- [ ] **Step 3: Implement septic feasibility scorer**

Create `packages/scoring/src/homestead/septicFeasibility.ts`:

```typescript
import type { EnrichmentData } from '../types';
import type { HomesteadComponentScore } from './types';

const GOOD_SEPTIC_TEXTURES = ['sandy loam', 'loam', 'loamy sand', 'silt loam'];
const MODERATE_SEPTIC_TEXTURES = ['sandy clay loam', 'clay loam', 'silty clay loam'];
const POOR_SEPTIC_TEXTURES = ['clay', 'silty clay', 'sandy clay', 'heavy clay', 'muck', 'peat'];

const DRAINAGE_SCORES: Record<string, number> = {
  'Well drained': 100,
  'Moderately well drained': 80,
  'Somewhat excessively drained': 70,
  'Excessively drained': 50, // too fast = contamination risk
  'Somewhat poorly drained': 30,
  'Poorly drained': 10,
  'Very poorly drained': 0,
};

export function scoreSepticFeasibility(enrichment: EnrichmentData): HomesteadComponentScore {
  const texture = enrichment.soilTexture;
  const drainage = enrichment.soilDrainageClass;
  const slope = enrichment.slopePct;
  const wetland = enrichment.wetlandType;
  const wetlandDist = enrichment.wetlandDistanceFt;

  if (!texture && !drainage) {
    return { score: 50, label: 'Unknown — no soil data for septic assessment' };
  }

  // Texture score
  let textureScore = 50;
  if (texture) {
    const lower = texture.toLowerCase();
    if (GOOD_SEPTIC_TEXTURES.some((t) => lower.includes(t))) textureScore = 95;
    else if (MODERATE_SEPTIC_TEXTURES.some((t) => lower.includes(t))) textureScore = 55;
    else if (POOR_SEPTIC_TEXTURES.some((t) => lower.includes(t))) textureScore = 15;
  }

  // Drainage score
  const drainageScore = drainage ? (DRAINAGE_SCORES[drainage] ?? 50) : 50;

  // Slope penalty: too flat (pooling) or too steep (runoff)
  let slopeAdjust = 0;
  if (slope !== undefined) {
    if (slope < 1) slopeAdjust = -10; // too flat
    else if (slope >= 1 && slope <= 15) slopeAdjust = 5; // ideal
    else if (slope > 15 && slope <= 25) slopeAdjust = -10;
    else if (slope > 25) slopeAdjust = -25; // too steep
  }

  // Wetland proximity penalty (setback requirements)
  let wetlandPenalty = 0;
  if (wetland !== null && wetland !== undefined && wetlandDist !== undefined && wetlandDist !== Infinity) {
    if (wetlandDist < 100) wetlandPenalty = -30; // likely within required setback
    else if (wetlandDist < 300) wetlandPenalty = -15;
  }

  // Texture: 40%, Drainage: 40%, adjustments
  const baseScore = Math.round(textureScore * 0.4 + drainageScore * 0.4) + 10; // +10 baseline
  const score = Math.max(0, Math.min(100, baseScore + slopeAdjust + wetlandPenalty));

  const quality = score >= 80 ? 'likely to pass perc test'
    : score >= 55 ? 'moderate — may need engineered system'
    : score >= 30 ? 'challenging — engineered system likely required'
    : 'poor — significant septic challenges';

  const textureStr = texture ?? 'unknown soil';
  return { score, label: `${textureStr} — ${quality}` };
}
```

- [ ] **Step 4: Implement building suitability scorer**

Create `packages/scoring/src/homestead/buildingSuitability.ts`:

```typescript
import type { EnrichmentData } from '../types';
import type { HomesteadComponentScore } from './types';

export function scoreBuildingSuitability(enrichment: EnrichmentData): HomesteadComponentScore {
  const slope = enrichment.slopePct;
  const elevation = enrichment.elevationFt;
  const floodZone = enrichment.floodZone;

  if (slope === undefined && elevation === undefined && !floodZone) {
    return { score: 50, label: 'Unknown — no terrain data available' };
  }

  // Slope: 0-8% ideal, 8-15% moderate, 15-25% difficult, 25%+ very difficult
  let slopeScore = 50;
  if (slope !== undefined) {
    if (slope <= 8) slopeScore = 100;
    else if (slope <= 15) slopeScore = 70;
    else if (slope <= 25) slopeScore = 40;
    else slopeScore = 15;
  }

  // Flood zone penalty
  let floodPenalty = 0;
  if (floodZone) {
    if (['A', 'AE', 'AH', 'AO', 'V', 'VE'].includes(floodZone)) floodPenalty = -40;
    else if (floodZone === 'D') floodPenalty = -15;
  }

  // Elevation: very low elevation is risky
  let elevAdjust = 0;
  if (elevation !== undefined) {
    if (elevation < 50) elevAdjust = -15;
    else if (elevation < 200) elevAdjust = -5;
  }

  const score = Math.max(0, Math.min(100, slopeScore + floodPenalty + elevAdjust));

  const parts: string[] = [];
  if (slope !== undefined) parts.push(slope <= 8 ? 'gentle slope' : slope <= 15 ? 'moderate slope' : 'steep slope');
  if (floodZone) parts.push(`Zone ${floodZone}`);

  const quality = score >= 80 ? 'excellent building site' : score >= 60 ? 'suitable for building' : score >= 40 ? 'challenging build site' : 'difficult to build on';

  return { score, label: `${parts.join(', ')} — ${quality}` };
}
```

- [ ] **Step 5: Implement firewood potential scorer**

Create `packages/scoring/src/homestead/firewoodPotential.ts`:

```typescript
import type { EnrichmentData, ListingData } from '../types';
import type { HomesteadComponentScore } from './types';

export function scoreFirewoodPotential(enrichment: EnrichmentData, listing: ListingData): HomesteadComponentScore {
  const precip = enrichment.annualPrecipIn;
  const maxTemp = enrichment.avgMaxTempF;
  const acreage = listing.acreage;

  if (precip === undefined) {
    return { score: 50, label: 'Unknown — no climate data for firewood assessment' };
  }

  // Precip score: 30+ inches supports hardwood growth. 50+ is excellent.
  const precipScore = Math.max(0, Math.min(100, Math.round(((precip - 15) / 35) * 100)));

  // Temperature: moderate temps (50-80°F max avg) are ideal for hardwood
  let tempAdjust = 0;
  if (maxTemp !== undefined) {
    if (maxTemp >= 60 && maxTemp <= 80) tempAdjust = 10;
    else if (maxTemp > 85) tempAdjust = -5; // heat stress
    else if (maxTemp < 50) tempAdjust = -5; // slow growth
  }

  // Acreage: need at least 5 acres for sustainable harvest
  let acreageAdjust = 0;
  if (acreage !== undefined) {
    if (acreage >= 20) acreageAdjust = 15;
    else if (acreage >= 10) acreageAdjust = 10;
    else if (acreage >= 5) acreageAdjust = 5;
    else if (acreage < 3) acreageAdjust = -15; // too small for sustainable harvest
  }

  const score = Math.max(0, Math.min(100, precipScore + tempAdjust + acreageAdjust));

  const acreStr = acreage !== undefined ? `, ${acreage} acres` : '';
  const quality = score >= 70 ? 'good firewood potential' : score >= 45 ? 'moderate firewood potential' : 'limited firewood potential';

  return { score, label: `${precip}in precip${acreStr} — ${quality}` };
}
```

- [ ] **Step 6: Run all tests**

Run: `pnpm --filter @landmatch/scoring vitest run src/__tests__/homestead.test.ts`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/scoring/src/homestead/floodSafety.ts packages/scoring/src/homestead/septicFeasibility.ts packages/scoring/src/homestead/buildingSuitability.ts packages/scoring/src/homestead/firewoodPotential.ts packages/scoring/src/__tests__/homestead.test.ts
git commit -m "add flood safety, septic, building, firewood homestead scorers"
```

---

## Task 6: Homestead Score Orchestrator

**Files:**
- Create: `packages/scoring/src/homestead/scorer.ts`
- Create: `packages/scoring/src/homestead/index.ts`
- Modify: `packages/scoring/src/index.ts`
- Modify: `packages/scoring/src/__tests__/homestead.test.ts`

- [ ] **Step 1: Write failing tests for orchestrator**

Append to test file:

```typescript
import { homesteadScore } from '../homestead/scorer';
import type { EnrichmentData, ListingData, SearchCriteria } from '../types';

describe('homesteadScore', () => {
  const listing: ListingData = { price: 150000, acreage: 20, latitude: 43.1, longitude: -72.78 };

  const enrichment: EnrichmentData = {
    soilCapabilityClass: 2,
    soilDrainageClass: 'Well drained',
    soilTexture: 'Silt loam',
    floodZone: 'X',
    frostFreeDays: 158,
    annualPrecipIn: 42,
    avgMinTempF: 28,
    avgMaxTempF: 72,
    growingSeasonDays: 165,
    elevationFt: 1200,
    slopePct: 5,
    wetlandType: null,
    wetlandDistanceFt: Infinity,
  };

  const criteria: SearchCriteria = {
    acreage: { min: 5, max: 50 },
    price: { max: 200000 },
    geography: { type: 'radius', center: { lat: 43.0, lng: -72.8 }, radiusMiles: 50 },
  };

  it('returns base scoring result', () => {
    const result = homesteadScore(listing, enrichment, criteria);
    expect(result.base.overallScore).toBeGreaterThan(0);
    expect(result.base.componentScores).toBeDefined();
  });

  it('returns all 7 homestead component scores', () => {
    const result = homesteadScore(listing, enrichment, criteria);
    expect(result.homestead.gardenViability.score).toBeGreaterThan(0);
    expect(result.homestead.growingSeason.score).toBeGreaterThan(0);
    expect(result.homestead.waterAvailability.score).toBeGreaterThan(0);
    expect(result.homestead.floodSafety.score).toBeGreaterThan(0);
    expect(result.homestead.septicFeasibility.score).toBeGreaterThan(0);
    expect(result.homestead.buildingSuitability.score).toBeGreaterThan(0);
    expect(result.homestead.firewoodPotential.score).toBeGreaterThan(0);
  });

  it('returns composite homestead score (0-100)', () => {
    const result = homesteadScore(listing, enrichment, criteria);
    expect(result.homesteadScore).toBeGreaterThanOrEqual(0);
    expect(result.homesteadScore).toBeLessThanOrEqual(100);
  });

  it('each component includes a label string', () => {
    const result = homesteadScore(listing, enrichment, criteria);
    for (const component of Object.values(result.homestead)) {
      expect(typeof component.label).toBe('string');
      expect(component.label.length).toBeGreaterThan(0);
    }
  });

  it('respects custom homestead weights', () => {
    const result1 = homesteadScore(listing, enrichment, criteria);
    const result2 = homesteadScore(listing, enrichment, criteria, { gardenViability: 10, firewoodPotential: 0 });
    // Heavy garden weight should shift score toward garden component
    expect(result1.homesteadScore).not.toBe(result2.homesteadScore);
  });

  it('returns zero homestead score when base hard filter fails', () => {
    const badCriteria: SearchCriteria = {
      floodZoneExclude: ['X'], // Exclude Zone X — this listing is in Zone X
    };
    const result = homesteadScore(listing, enrichment, badCriteria);
    expect(result.base.hardFilterFailed).toBe(true);
    expect(result.homesteadScore).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @landmatch/scoring vitest run src/__tests__/homestead.test.ts`
Expected: FAIL — `homesteadScore` not found.

- [ ] **Step 3: Implement orchestrator**

Create `packages/scoring/src/homestead/scorer.ts`:

```typescript
import { scoreListing } from '../scorer';
import type { EnrichmentData, ListingData, SearchCriteria } from '../types';
import { scoreBuildingSuitability } from './buildingSuitability';
import { scoreFirewoodPotential } from './firewoodPotential';
import { scoreFloodSafety } from './floodSafety';
import { scoreGardenViability } from './gardenViability';
import { scoreGrowingSeason } from './growingSeason';
import { scoreSepticFeasibility } from './septicFeasibility';
import type { HomesteadScores, HomesteadScoringResult } from './types';
import { DEFAULT_HOMESTEAD_WEIGHTS } from './types';
import { scoreWaterAvailability } from './waterAvailability';

export function homesteadScore(
  listing: ListingData,
  enrichment: EnrichmentData,
  criteria: SearchCriteria,
  weightOverrides?: Partial<Record<keyof HomesteadScores, number>>,
): HomesteadScoringResult {
  // Run generic scorer first
  const base = scoreListing(listing, enrichment, criteria);

  // If hard filter failed, return zero homestead score
  if (base.hardFilterFailed) {
    return {
      base,
      homestead: emptyHomesteadScores(),
      homesteadScore: 0,
    };
  }

  // Compute all homestead components
  const homestead: HomesteadScores = {
    gardenViability: scoreGardenViability(enrichment),
    growingSeason: scoreGrowingSeason(enrichment),
    waterAvailability: scoreWaterAvailability(enrichment),
    floodSafety: scoreFloodSafety(enrichment),
    septicFeasibility: scoreSepticFeasibility(enrichment),
    buildingSuitability: scoreBuildingSuitability(enrichment),
    firewoodPotential: scoreFirewoodPotential(enrichment, listing),
  };

  // Weighted average of homestead components
  const weights = { ...DEFAULT_HOMESTEAD_WEIGHTS, ...weightOverrides };
  let totalWeight = 0;
  let totalScore = 0;

  for (const key of Object.keys(homestead) as Array<keyof HomesteadScores>) {
    const w = weights[key] ?? 1;
    totalWeight += w;
    totalScore += homestead[key].score * w;
  }

  const compositeScore = totalWeight === 0 ? 0 : Math.round(totalScore / totalWeight);

  return {
    base,
    homestead,
    homesteadScore: compositeScore,
  };
}

function emptyHomesteadScores(): HomesteadScores {
  const empty = { score: 0, label: 'N/A — listing filtered out' };
  return {
    gardenViability: empty,
    growingSeason: empty,
    waterAvailability: empty,
    floodSafety: empty,
    septicFeasibility: empty,
    buildingSuitability: empty,
    firewoodPotential: empty,
  };
}
```

- [ ] **Step 4: Create barrel export**

Create `packages/scoring/src/homestead/index.ts`:

```typescript
export { scoreGardenViability } from './gardenViability';
export { scoreGrowingSeason } from './growingSeason';
export { scoreWaterAvailability } from './waterAvailability';
export { scoreFloodSafety } from './floodSafety';
export { scoreSepticFeasibility } from './septicFeasibility';
export { scoreBuildingSuitability } from './buildingSuitability';
export { scoreFirewoodPotential } from './firewoodPotential';
export { homesteadScore } from './scorer';
export type { HomesteadComponentScore, HomesteadScores, HomesteadScoringResult } from './types';
export { DEFAULT_HOMESTEAD_WEIGHTS } from './types';
```

- [ ] **Step 5: Export from package index**

In `packages/scoring/src/index.ts`, add:

```typescript
export {
  homesteadScore,
  DEFAULT_HOMESTEAD_WEIGHTS,
  type HomesteadComponentScore,
  type HomesteadScores,
  type HomesteadScoringResult,
} from './homestead';
```

- [ ] **Step 6: Run all tests**

Run: `pnpm --filter @landmatch/scoring vitest run`
Expected: All tests pass.

- [ ] **Step 7: Run full lint**

Run: `pnpm --filter @landmatch/scoring lint`
Expected: No type errors.

- [ ] **Step 8: Commit**

```bash
git add packages/scoring/src/homestead/ packages/scoring/src/index.ts packages/scoring/src/__tests__/homestead.test.ts
git commit -m "add homestead scoring orchestrator wrapping generic scorer"
```

---

## Task 7: Final Verification

- [ ] **Step 1: Run all scoring tests**

Run: `pnpm --filter @landmatch/scoring test:run`
Expected: All tests pass.

- [ ] **Step 2: Run full lint**

Run: `pnpm lint`
Expected: All packages pass.

- [ ] **Step 3: Commit if any fixes were needed**

```bash
git add -A
git commit -m "verify homestead scoring: all tests and lint pass"
```
