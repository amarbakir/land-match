import type { EnrichmentData, ScoringResult, SearchCriteria } from './types';

export type LlmClient = (prompt: string) => Promise<string>;

export interface SummaryInput {
  scoringResult: ScoringResult;
  enrichmentData: EnrichmentData;
  criteria: SearchCriteria;
  listingTitle: string;
  listingUrl?: string;
}

export async function generateSummary(input: SummaryInput, llm: LlmClient): Promise<string> {
  const prompt = buildPrompt(input);
  return llm(prompt);
}

export function buildPrompt(input: SummaryInput): string {
  const { scoringResult, enrichmentData, criteria, listingTitle, listingUrl } = input;
  const { overallScore, componentScores, hardFilterFailed, failedFilters } = scoringResult;

  const lines: string[] = [
    'You are a rural land analyst helping a back-to-land buyer evaluate a property listing.',
    '',
    `## Listing: ${listingTitle}`,
  ];

  if (listingUrl) {
    lines.push(`URL: ${listingUrl}`);
  }

  lines.push('');

  if (hardFilterFailed) {
    lines.push(`**This listing FAILED hard filters**: ${failedFilters.join(', ')}`);
    lines.push('Explain why this listing was disqualified and what the buyer should know.');
    lines.push('');
  }

  lines.push(`## Overall Score: ${overallScore}/100`);
  lines.push('');
  lines.push('### Component Scores');
  for (const [key, value] of Object.entries(componentScores)) {
    lines.push(`- ${key}: ${value}/100`);
  }

  lines.push('');
  lines.push('### Enrichment Data');
  const enrichmentFields: Array<[string, string | number | string[] | undefined]> = [
    ['Soil Capability Class', enrichmentData.soilCapabilityClass],
    ['Flood Zone', enrichmentData.floodZone],
    ['Zoning Code', enrichmentData.zoningCode],
    ['Infrastructure', enrichmentData.infrastructure?.join(', ')],
    ['Fire Risk Score', enrichmentData.fireRiskScore],
    ['Flood Risk Score', enrichmentData.floodRiskScore],
  ];

  const gaps: string[] = [];
  for (const [label, value] of enrichmentFields) {
    if (value !== undefined && value !== '') {
      lines.push(`- ${label}: ${value}`);
    } else {
      gaps.push(label);
    }
  }

  if (gaps.length > 0) {
    lines.push('');
    lines.push(`**Data gaps** (not available): ${gaps.join(', ')}`);
  }

  if (criteria.acreage || criteria.price || criteria.soilCapabilityClass || criteria.floodZoneExclude || criteria.zoning) {
    lines.push('');
    lines.push('### Buyer Criteria');
    if (criteria.acreage) {
      lines.push(`- Acreage: ${criteria.acreage.min ?? 'any'}–${criteria.acreage.max ?? 'any'}`);
    }
    if (criteria.price) {
      lines.push(`- Price: $${criteria.price.min ?? 'any'}–$${criteria.price.max ?? 'any'}`);
    }
    if (criteria.soilCapabilityClass) {
      lines.push(`- Max soil class: ${criteria.soilCapabilityClass.max}`);
    }
    if (criteria.floodZoneExclude) {
      lines.push(`- Excluded flood zones: ${criteria.floodZoneExclude.join(', ')}`);
    }
    if (criteria.zoning) {
      lines.push(`- Preferred zoning: ${criteria.zoning.join(', ')}`);
    }
  }

  lines.push('');
  lines.push('## Instructions');
  lines.push('Write a 2-3 sentence verdict on this property for the buyer. Then list concrete action items (e.g., "verify zoning allows livestock", "request perc test"). If there are data gaps, flag them as areas needing further investigation.');

  return lines.join('\n');
}
