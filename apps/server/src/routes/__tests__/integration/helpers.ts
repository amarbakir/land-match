import type { createApp } from '../../../app';

// Registers a user through the real endpoint and returns their access token.
// For tests that need the registration response itself, hit the endpoint
// directly (see auth.integration.test.ts).
export async function registerUser(app: ReturnType<typeof createApp>, email: string): Promise<string> {
  const res = await app.request('/api/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123' }),
  });
  const body = (await res.json()) as { data: { accessToken: string } };
  return body.data.accessToken;
}

export function authHeaders(token?: string): Record<string, string> {
  return token ? { authorization: `Bearer ${token}` } : {};
}
