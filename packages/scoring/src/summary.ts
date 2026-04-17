import type { ComponentScores, SearchCriteria, ScoringResult } from './types';

export interface SummaryInput {
  scoringResult: ScoringResult;
  criteria: SearchCriteria;
  listingTitle: string;
  listingUrl?: string;
}

export async function generateSummary(_input: SummaryInput): Promise<string> {
  // TODO: Implement Claude Haiku LLM summary generation
  // Only called for listings scoring above alert threshold
  // Prompt includes: enrichment data, component scores, user criteria
  // Output: 2-3 sentence verdict + action items
  return 'LLM summary generation not yet implemented';
}
