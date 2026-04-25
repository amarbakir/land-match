import type { EnrichListingResponse, SaveListingResponse } from '@landmatch/api';

import { API_V1 } from './config';
import { getAuth, setAuth, clearAuth, getAccessToken } from './auth';

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  code?: string;
  error?: string;
}

let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const auth = await getAuth();
      if (!auth?.refreshToken) return false;

      const response = await fetch(`${API_V1}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: auth.refreshToken }),
      });

      if (!response.ok) {
        await clearAuth();
        return false;
      }

      const result = (await response.json()) as ApiResponse<{
        accessToken: string;
        refreshToken: string;
      }>;
      if (!result.ok || !result.data) {
        await clearAuth();
        return false;
      }

      await setAuth({
        accessToken: result.data.accessToken,
        refreshToken: result.data.refreshToken,
        email: auth.email,
      });
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function fetchWithAuth(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) ?? {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return fetch(`${API_V1}${path}`, { ...options, headers });
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  let response = await fetchWithAuth(path, options);

  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      response = await fetchWithAuth(path, options);
    }
  }

  if (!response.ok) {
    try {
      return (await response.json()) as ApiResponse<T>;
    } catch {
      return { ok: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }
  }

  return response.json() as Promise<ApiResponse<T>>;
}

export async function enrichListing(payload: {
  address: string;
  price?: number;
  acreage?: number;
  url?: string;
  title?: string;
  source?: string;
  externalId?: string;
}) {
  return request<EnrichListingResponse>('/listings/enrich', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getListingByUrl(url: string) {
  return request<EnrichListingResponse>(`/listings/by-url?url=${encodeURIComponent(url)}`);
}

export async function saveListing(listingId: string) {
  return request<SaveListingResponse>(`/listings/${listingId}/save`, { method: 'POST' });
}

export async function login(email: string, password: string) {
  return request<{ accessToken: string; refreshToken: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}
