import type { ScoringResult } from '../types';

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
  base: ScoringResult;
  homestead: HomesteadScores;
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
