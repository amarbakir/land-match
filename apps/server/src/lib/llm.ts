import Anthropic from '@anthropic-ai/sdk';
import type { LlmClient } from '@landmatch/scoring';
import { llm as llmConfig } from '../config';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: llmConfig.anthropicApiKey });
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
