import type { TokenStorage, Tokens } from '@landmatch/api-client';

interface StoredAuth {
  accessToken: string;
  refreshToken: string;
  email: string;
}

const AUTH_KEY = 'landmatch_auth';

export async function getAuth(): Promise<StoredAuth | null> {
  const result = await chrome.storage.local.get(AUTH_KEY);
  return result[AUTH_KEY] ?? null;
}

export async function setAuth(auth: StoredAuth): Promise<void> {
  await chrome.storage.local.set({ [AUTH_KEY]: auth });
}

export async function clearAuth(): Promise<void> {
  await chrome.storage.local.remove(AUTH_KEY);
}

export const tokenStorage: TokenStorage = {
  async getTokens(): Promise<Tokens | null> {
    const auth = await getAuth();
    if (!auth) return null;
    return { accessToken: auth.accessToken, refreshToken: auth.refreshToken };
  },
  async setTokens(tokens: Tokens): Promise<void> {
    const existing = await getAuth();
    await setAuth({ ...tokens, email: existing?.email ?? '' });
  },
  async clearTokens(): Promise<void> {
    await clearAuth();
  },
};
