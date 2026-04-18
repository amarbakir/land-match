import { describe, expect, it, vi } from 'vitest';
import type { LlmClient, SummaryInput } from '../summary';
import { buildPrompt, generateSummary } from '../summary';

function makeSummaryInput(overrides: Partial<SummaryInput> = {}): SummaryInput {
  return {
    scoringResult: {
      overallScore: 72,
      componentScores: {
        soil: 85,
        flood: 90,
        price: 60,
        acreage: 70,
        zoning: 65,
        geography: 80,
        infrastructure: 40,
        climate: 75,
      },
      hardFilterFailed: false,
      failedFilters: [],
    },
    enrichmentData: {
      soilCapabilityClass: 3,
      floodZone: 'X',
      zoningCode: 'AG-1',
      fireRiskScore: 15,
      floodRiskScore: 22,
    },
    criteria: {
      acreage: { min: 10, max: 100 },
      price: { max: 200000 },
      soilCapabilityClass: { max: 4 },
      floodZoneExclude: ['VE', 'AE'],
    },
    listingTitle: '40 Acres in Ozark County, MO',
    listingUrl: 'https://example.com/listing/123',
    ...overrides,
  };
}

describe('generateSummary', () => {
  it('passes the built prompt to the LLM client and returns its response', async () => {
    const llm: LlmClient = vi.fn().mockResolvedValue('This is a great property for homesteading.');
    const input = makeSummaryInput();

    const result = await generateSummary(input, llm);

    expect(llm).toHaveBeenCalledOnce();
    expect(result).toBe('This is a great property for homesteading.');

    // Verify the prompt passed to the LLM contains key information
    const promptArg = (llm as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(promptArg).toContain('40 Acres in Ozark County, MO');
    expect(promptArg).toContain('72/100');
  });

  it('propagates LLM client errors', async () => {
    const llm: LlmClient = vi.fn().mockRejectedValue(new Error('API rate limit'));
    const input = makeSummaryInput();

    await expect(generateSummary(input, llm)).rejects.toThrow('API rate limit');
  });
});

describe('buildPrompt', () => {
  it('includes all component scores and enrichment values', () => {
    const input = makeSummaryInput();
    const prompt = buildPrompt(input);

    // Component scores
    expect(prompt).toContain('soil: 85/100');
    expect(prompt).toContain('flood: 90/100');
    expect(prompt).toContain('climate: 75/100');

    // Enrichment data
    expect(prompt).toContain('Soil Capability Class: 3');
    expect(prompt).toContain('Flood Zone: X');
    expect(prompt).toContain('Zoning Code: AG-1');
    expect(prompt).toContain('Fire Risk Score: 15');

    // Criteria
    expect(prompt).toContain('Acreage: 10–100');
    expect(prompt).toContain('Max soil class: 4');
    expect(prompt).toContain('VE, AE');
  });

  it('includes listing URL when provided', () => {
    const prompt = buildPrompt(makeSummaryInput());
    expect(prompt).toContain('https://example.com/listing/123');
  });

  it('omits URL line when not provided', () => {
    const prompt = buildPrompt(makeSummaryInput({ listingUrl: undefined }));
    expect(prompt).not.toContain('URL:');
  });

  it('flags data gaps when enrichment fields are missing', () => {
    const input = makeSummaryInput({
      enrichmentData: {
        soilCapabilityClass: 3,
        // flood, zoning, infrastructure, fire, floodRisk all missing
      },
    });
    const prompt = buildPrompt(input);

    expect(prompt).toContain('Data gaps');
    expect(prompt).toContain('Flood Zone');
    expect(prompt).toContain('Zoning Code');
    expect(prompt).toContain('Infrastructure');
    expect(prompt).toContain('Fire Risk Score');
    expect(prompt).toContain('Flood Risk Score');
    // Soil is present, should not be in gaps
    expect(prompt).toContain('Soil Capability Class: 3');
  });

  it('includes hard filter context for disqualified listings', () => {
    const input = makeSummaryInput({
      scoringResult: {
        overallScore: 0,
        componentScores: {
          soil: 0, flood: 0, price: 0, acreage: 0,
          zoning: 0, geography: 0, infrastructure: 0, climate: 0,
        },
        hardFilterFailed: true,
        failedFilters: ['flood_zone_excluded', 'price_over_hard_limit'],
      },
    });
    const prompt = buildPrompt(input);

    expect(prompt).toContain('FAILED hard filters');
    expect(prompt).toContain('flood_zone_excluded');
    expect(prompt).toContain('price_over_hard_limit');
    expect(prompt).toContain('disqualified');
  });

  it('includes instruction for verdict format', () => {
    const prompt = buildPrompt(makeSummaryInput());
    expect(prompt).toContain('2-3 sentence verdict');
    expect(prompt).toContain('action items');
  });
});
