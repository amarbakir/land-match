import { randomUUID } from 'crypto';

/**
 * Generate a request ID, using the provided value or creating a new UUID.
 */
export function generateRequestId(existing?: string | null): string {
  return existing || randomUUID();
}
