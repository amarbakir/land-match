import { API_V1 } from './config';
import { getAccessToken } from './auth';

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  code?: string;
  error?: string;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) ?? {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_V1}${path}`, {
    ...options,
    headers,
  });

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
  return request('/listings/enrich', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getListingByUrl(url: string) {
  return request(`/listings/by-url?url=${encodeURIComponent(url)}`);
}

export async function saveListing(listingId: string) {
  return request(`/listings/${listingId}/save`, { method: 'POST' });
}

export async function login(email: string, password: string) {
  return request<{ accessToken: string; refreshToken: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}
