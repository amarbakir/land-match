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
  const base = scoreListing(listing, enrichment, criteria);

  if (base.hardFilterFailed) {
    return {
      base,
      homestead: emptyHomesteadScores(),
      homesteadScore: 0,
    };
  }

  const homestead: HomesteadScores = {
    gardenViability: scoreGardenViability(enrichment),
    growingSeason: scoreGrowingSeason(enrichment),
    waterAvailability: scoreWaterAvailability(enrichment),
    floodSafety: scoreFloodSafety(enrichment),
    septicFeasibility: scoreSepticFeasibility(enrichment),
    buildingSuitability: scoreBuildingSuitability(enrichment),
    firewoodPotential: scoreFirewoodPotential(enrichment, listing),
  };

  const weights = { ...DEFAULT_HOMESTEAD_WEIGHTS, ...weightOverrides };
  let totalWeight = 0;
  let totalScore = 0;

  for (const key of Object.keys(homestead) as Array<keyof HomesteadScores>) {
    const w = weights[key] ?? 1;
    totalWeight += w;
    totalScore += homestead[key].score * w;
  }

  const compositeScore = totalWeight === 0 ? 0 : Math.round(totalScore / totalWeight);

  return { base, homestead, homesteadScore: compositeScore };
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
