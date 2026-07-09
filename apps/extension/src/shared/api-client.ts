import type { EnrichListingResponse, SaveListingResponse } from '@landmatch/api';
import { ApiError, createApiClient } from '@landmatch/api-client';

import { tokenStorage } from './auth';
import { API_BASE_URL } from './config';

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  code?: string;
  error?: string;
}

const client = createApiClient({ baseUrl: API_BASE_URL, storage: tokenStorage });

// The service worker forwards results over chrome messaging, where thrown
// errors do not serialize — so wrap the shared client's throw-based contract
// back into the {ok, data, code, error} envelope at this boundary.
async function toEnvelope<T>(promise: Promise<T>): Promise<ApiResponse<T>> {
  try {
    return { ok: true, data: await promise };
  } catch (error) {
    if (error instanceof ApiError) {
      return { ok: false, error: error.message, code: error.code };
    }
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function enrichListing(payload: {
  address: string;
  price?: number;
  acreage?: number;
  url?: string;
  title?: string;
  source?: string;
  externalId?: string;
}) {
  return toEnvelope(
    client.post<typeof payload, EnrichListingResponse>('/listings/enrich', payload),
  );
}

export function getListingByUrl(url: string) {
  return toEnvelope(
    client.get<EnrichListingResponse>(`/listings/by-url?url=${encodeURIComponent(url)}`),
  );
}

export function saveListing(listingId: string) {
  return toEnvelope(
    client.post<undefined, SaveListingResponse>(`/listings/${listingId}/save`, undefined),
  );
}

/**
 * Best-effort server-side refresh-token revoke, then clears stored auth
 * (tokenStorage.clearTokens maps to clearAuth). Never throws.
 */
export function logout() {
  return client.logout();
}

export function login(email: string, password: string) {
  return toEnvelope(
    client.post<
      { email: string; password: string },
      { accessToken: string; refreshToken: string }
    >('/auth/login', { email, password }, { noAuth: true }),
  );
}
