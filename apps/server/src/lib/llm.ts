import Anthropic from '@anthropic-ai/sdk';
import type { LlmClient } from '@landmatch/scoring';
import { llm as llmConfig } from '../config';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    // Bounded: matching awaits this call inline — a hung request must not
    // pin the enrich request/Lambda for the SDK's 10-minute default.
    client = new Anthropic({ apiKey: llmConfig.anthropicApiKey, timeout: 15_000, maxRetries: 1 });
  }
  return client;
}

export const llmClient: LlmClient = async (prompt: string): Promise<string> => {
  const response = await getClient().messages.create({
    model: llmConfig.model,
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });

  for (const block of response.content) {
    if (block.type === 'text') {
      return block.text;
    }
  }

  return '';
};
