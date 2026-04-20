import type { AuthTokenResponseType } from '@landmatch/api';

import { type Tokens, clearTokens, getTokens, setTokens } from '../auth/tokenStorage';

const API_BASE_URL = 'http://localhost:3000';

let onAuthFailure: (() => void) | null = null;

export function setOnAuthFailure(callback: () => void) {
  onAuthFailure = callback;
}

let refreshPromise: Promise<Tokens | null> | null = null;

async function tryRefresh(): Promise<Tokens | null> {
  // Deduplicate concurrent refresh attempts
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const tokens = await getTokens();
      if (!tokens) return null;

      const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });

      if (!response.ok) return null;

      const json = await response.json();
      const data = json.data as AuthTokenResponseType;
      await setTokens(data.accessToken, data.refreshToken);
      return { accessToken: data.accessToken, refreshToken: data.refreshToken };
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const tokens = await getTokens();
  const headers = new Headers(init.headers);
  if (tokens) {
    headers.set('Authorization', `Bearer ${tokens.accessToken}`);
  }

  let response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });

  if (response.status === 401 && tokens) {
    const newTokens = await tryRefresh();
    if (newTokens) {
      headers.set('Authorization', `Bearer ${newTokens.accessToken}`);
      response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
    } else {
      await clearTokens();
      onAuthFailure?.();
    }
  }

  return response;
}

function parseErrorResponse(text: string, status: number): string {
  try {
    const parsed = JSON.parse(text);
    if (parsed.error) return parsed.error;
  } catch {
    // non-JSON error body
  }
  return `Request failed (${status})`;
}

interface RequestOptions {
  noAuth?: boolean;
}

export async function apiPost<TReq, TRes>(
  path: string,
  body: TReq,
  options?: RequestOptions,
): Promise<TRes> {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };

  const response = options?.noAuth
    ? await fetch(`${API_BASE_URL}${path}`, init)
    : await authFetch(path, init);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(parseErrorResponse(text, response.status));
  }

  const json = await response.json();
  return json.data as TRes;
}

export async function apiPatch<TReq, TRes>(
  path: string,
  body: TReq,
  options?: RequestOptions,
): Promise<TRes> {
  const init: RequestInit = {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };

  const response = options?.noAuth
    ? await fetch(`${API_BASE_URL}${path}`, init)
    : await authFetch(path, init);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(parseErrorResponse(text, response.status));
  }

  const json = await response.json();
  return json.data as TRes;
}

export async function apiPut<TReq, TRes>(
  path: string,
  body: TReq,
  options?: RequestOptions,
): Promise<TRes> {
  const init: RequestInit = {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };

  const response = options?.noAuth
    ? await fetch(`${API_BASE_URL}${path}`, init)
    : await authFetch(path, init);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(parseErrorResponse(text, response.status));
  }

  const json = await response.json();
  return json.data as TRes;
}

export async function apiDelete<TRes>(
  path: string,
  options?: RequestOptions,
): Promise<TRes> {
  const response = options?.noAuth
    ? await fetch(`${API_BASE_URL}${path}`, { method: 'DELETE' })
    : await authFetch(path, { method: 'DELETE' });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(parseErrorResponse(text, response.status));
  }

  const json = await response.json();
  return json.data as TRes;
}

export async function apiGet<TRes>(path: string, options?: RequestOptions): Promise<TRes> {
  const response = options?.noAuth
    ? await fetch(`${API_BASE_URL}${path}`)
    : await authFetch(path);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(parseErrorResponse(text, response.status));
  }

  const json = await response.json();
  return json.data as TRes;
}
