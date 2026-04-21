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

export async function getAccessToken(): Promise<string | null> {
  const auth = await getAuth();
  return auth?.accessToken ?? null;
}
