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
    const parsed = JSON.parse(text);
    if (parsed.error) return new ApiError(parsed.error, status, parsed.code);
  } catch {
    // non-JSON error body
  }
  return new ApiError(`Request failed (${status})`, status);
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const { storage } = options;
  const apiBase = `${options.baseUrl}/api/v1`;

  async function authFetch(path: string, init: RequestInit): Promise<Response> {
    const tokens = await storage.getTokens();
    const headers = new Headers(init.headers);
    if (tokens) {
      headers.set('Authorization', `Bearer ${tokens.accessToken}`);
    }

    return fetch(`${apiBase}${path}`, { ...init, headers });
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

    const json = (await response.json()) as { data: TRes };
    return json.data;
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
