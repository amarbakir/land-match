import { ApiErrorEnvelope, ApiSuccessEnvelope, AuthTokenResponse } from '@landmatch/api';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export interface TokenStorage {
  getTokens(): Promise<Tokens | null>;
  setTokens(tokens: Tokens): Promise<void>;
  clearTokens(): Promise<void>;
}

export interface RequestOptions {
  noAuth?: boolean;
}

export interface ApiClientOptions {
  baseUrl: string;
  storage: TokenStorage;
  onAuthFailure?: () => void;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export interface ApiClient {
  get<TRes>(path: string, options?: RequestOptions): Promise<TRes>;
  post<TReq, TRes>(path: string, body: TReq, options?: RequestOptions): Promise<TRes>;
  patch<TReq, TRes>(path: string, body: TReq, options?: RequestOptions): Promise<TRes>;
  put<TReq, TRes>(path: string, body: TReq, options?: RequestOptions): Promise<TRes>;
  delete<TRes>(path: string, options?: RequestOptions): Promise<TRes>;
}

function parseApiError(text: string, status: number): ApiError {
  try {
    const parsed = ApiErrorEnvelope.safeParse(JSON.parse(text));
    if (parsed.success) return new ApiError(parsed.data.error, status, parsed.data.code);
  } catch {
    // non-JSON error body
  }
  return new ApiError(`Request failed (${status})`, status);
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const { storage, onAuthFailure } = options;
  const apiBase = `${options.baseUrl}/api/v1`;

  let refreshPromise: Promise<Tokens | null> | null = null;

  function tryRefresh(): Promise<Tokens | null> {
    // Deduplicate concurrent refresh attempts
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
      try {
        const tokens = await storage.getTokens();
        if (!tokens) return null;

        const response = await fetch(`${apiBase}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: tokens.refreshToken }),
        });
        if (!response.ok) return null;

        const envelope = ApiSuccessEnvelope.safeParse(await response.json());
        if (!envelope.success) return null;
        const parsed = AuthTokenResponse.safeParse(envelope.data.data);
        if (!parsed.success) return null;

        const next = { accessToken: parsed.data.accessToken, refreshToken: parsed.data.refreshToken };
        await storage.setTokens(next);
        return next;
      } catch {
        return null;
      } finally {
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  }

  async function authFetch(path: string, init: RequestInit): Promise<Response> {
    const tokens = await storage.getTokens();
    const headers = new Headers(init.headers);
    if (tokens) {
      headers.set('Authorization', `Bearer ${tokens.accessToken}`);
    }

    let response = await fetch(`${apiBase}${path}`, { ...init, headers });

    if (response.status === 401 && tokens) {
      const newTokens = await tryRefresh();
      if (newTokens) {
        headers.set('Authorization', `Bearer ${newTokens.accessToken}`);
        response = await fetch(`${apiBase}${path}`, { ...init, headers });
      } else {
        await storage.clearTokens();
        onAuthFailure?.();
      }
    }

    return response;
  }

  async function request<TRes>(
    method: string,
    path: string,
    body?: unknown,
    reqOptions?: RequestOptions,
  ): Promise<TRes> {
    const init: RequestInit = { method };
    if (body !== undefined) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(body);
    }

    const response = reqOptions?.noAuth
      ? await fetch(`${apiBase}${path}`, init)
      : await authFetch(path, init);

    if (!response.ok) {
      throw parseApiError(await response.text(), response.status);
    }

    if (response.status === 204) {
      return undefined as TRes;
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new ApiError('Malformed response body', response.status);
    }
    const envelope = ApiSuccessEnvelope.safeParse(json);
    if (!envelope.success) {
      throw new ApiError('Malformed response body', response.status);
    }
    return envelope.data.data as TRes;
  }

  return {
    get: <TRes>(path: string, o?: RequestOptions) => request<TRes>('GET', path, undefined, o),
    post: <TReq, TRes>(path: string, body: TReq, o?: RequestOptions) =>
      request<TRes>('POST', path, body, o),
    patch: <TReq, TRes>(path: string, body: TReq, o?: RequestOptions) =>
      request<TRes>('PATCH', path, body, o),
    put: <TReq, TRes>(path: string, body: TReq, o?: RequestOptions) =>
      request<TRes>('PUT', path, body, o),
    delete: <TRes>(path: string, o?: RequestOptions) => request<TRes>('DELETE', path, undefined, o),
  };
}
