import {
  createApiClient,
  type RequestOptions,
  type TokenStorage,
} from '@landmatch/api-client';

import { clearTokens, getTokens, setTokens } from '../auth/tokenStorage';

const storage: TokenStorage = { getTokens, setTokens, clearTokens };

let onAuthFailure: (() => void) | null = null;

export function setOnAuthFailure(callback: () => void) {
  onAuthFailure = callback;
}

const client = createApiClient({
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000',
  storage,
  onAuthFailure: () => onAuthFailure?.(),
});

export function apiGet<TRes>(path: string, options?: RequestOptions) {
  return client.get<TRes>(path, options);
}

export function apiPost<TReq, TRes>(path: string, body: TReq, options?: RequestOptions) {
  return client.post<TReq, TRes>(path, body, options);
}

export function apiPatch<TReq, TRes>(path: string, body: TReq, options?: RequestOptions) {
  return client.patch<TReq, TRes>(path, body, options);
}

export function apiPut<TReq, TRes>(path: string, body: TReq, options?: RequestOptions) {
  return client.put<TReq, TRes>(path, body, options);
}

export function apiDelete<TRes>(path: string, options?: RequestOptions) {
  return client.delete<TRes>(path, options);
}
