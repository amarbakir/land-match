import type {
  CreateSearchProfile,
  EnrichListingRequest,
  EnrichListingResponse,
  MatchDetail,
  MatchItem,
  NotificationPrefs,
  PaginatedMatches,
  PaginatedSavedListings,
  ProfileCounts,
  SearchProfileResponse,
  UpdateMatchStatus,
  UpdateSearchProfile,
} from '@landmatch/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from './client';

export function useEnrichListing() {
  return useMutation<EnrichListingResponse, Error, EnrichListingRequest>({
    mutationFn: (body) =>
      apiPost<EnrichListingRequest, EnrichListingResponse>(
        '/api/v1/listings/enrich',
        body,
      ),
  });
}

export function useSearchProfiles() {
  return useQuery<SearchProfileResponse[], Error>({
    queryKey: ['searchProfiles'],
    queryFn: () => apiGet<SearchProfileResponse[]>('/api/v1/search-profiles'),
  });
}

export function useProfileCounts() {
  return useQuery<ProfileCounts, Error>({
    queryKey: ['profileCounts'],
    queryFn: () => apiGet<ProfileCounts>('/api/v1/search-profiles/counts'),
    refetchInterval: 60_000,
  });
}

interface MatchQueryParams {
  status?: string;
  minScore?: number;
  sort?: string;
  sortDir?: string;
  limit?: number;
  offset?: number;
}

export function useProfileMatches(profileId: string | null, params: MatchQueryParams = {}) {
  const searchParams = new URLSearchParams();
  if (params.status) searchParams.set('status', params.status);
  if (params.minScore !== undefined) searchParams.set('minScore', String(params.minScore));
  if (params.sort) searchParams.set('sort', params.sort);
  if (params.sortDir) searchParams.set('sortDir', params.sortDir);
  if (params.limit !== undefined) searchParams.set('limit', String(params.limit));
  if (params.offset !== undefined) searchParams.set('offset', String(params.offset));

  const qs = searchParams.toString();
  const path = `/api/v1/search-profiles/${profileId}/matches${qs ? `?${qs}` : ''}`;

  return useQuery<PaginatedMatches, Error>({
    queryKey: ['profileMatches', profileId, params],
    queryFn: () => apiGet<PaginatedMatches>(path),
    enabled: !!profileId,
  });
}

export function useMatchDetail(scoreId: string | null) {
  return useQuery<MatchDetail, Error>({
    queryKey: ['matchDetail', scoreId],
    queryFn: () => apiGet<MatchDetail>(`/api/v1/scores/${scoreId}`),
    enabled: !!scoreId,
  });
}

export function useCreateSearchProfile() {
  const queryClient = useQueryClient();

  return useMutation<SearchProfileResponse, Error, CreateSearchProfile>({
    mutationFn: (body) =>
      apiPost<CreateSearchProfile, SearchProfileResponse>(
        '/api/v1/search-profiles',
        body,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['searchProfiles'] });
      queryClient.invalidateQueries({ queryKey: ['profileCounts'] });
    },
  });
}

export function useUpdateSearchProfile() {
  const queryClient = useQueryClient();

  return useMutation<
    SearchProfileResponse,
    Error,
    { id: string; data: UpdateSearchProfile }
  >({
    mutationFn: ({ id, data }) =>
      apiPut<UpdateSearchProfile, SearchProfileResponse>(
        `/api/v1/search-profiles/${id}`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['searchProfiles'] });
      queryClient.invalidateQueries({ queryKey: ['profileCounts'] });
    },
  });
}

export function useDeleteSearchProfile() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) =>
      apiDelete<void>(`/api/v1/search-profiles/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['searchProfiles'] });
      queryClient.invalidateQueries({ queryKey: ['profileCounts'] });
    },
  });
}

export function useUpdateMatchStatus() {
  const queryClient = useQueryClient();

  return useMutation<
    { scoreId: string; status: string; readAt: string | null },
    Error,
    { scoreId: string; data: UpdateMatchStatus }
  >({
    mutationFn: ({ scoreId, data }) =>
      apiPatch<UpdateMatchStatus, { scoreId: string; status: string; readAt: string | null }>(
        `/api/v1/scores/${scoreId}`,
        data,
      ),
    onSuccess: (_data, { scoreId }) => {
      queryClient.invalidateQueries({ queryKey: ['profileMatches'] });
      queryClient.invalidateQueries({ queryKey: ['profileCounts'] });
      queryClient.invalidateQueries({ queryKey: ['matchDetail', scoreId] });
    },
  });
}

export function useNotificationPrefs() {
  return useQuery<NotificationPrefs, Error>({
    queryKey: ['notificationPrefs'],
    queryFn: () => apiGet<NotificationPrefs>('/api/v1/users/me/notification-preferences'),
  });
}

export function useUpdateNotificationPrefs() {
  const queryClient = useQueryClient();

  return useMutation<NotificationPrefs, Error, NotificationPrefs>({
    mutationFn: (body) =>
      apiPut<NotificationPrefs, NotificationPrefs>(
        '/api/v1/users/me/notification-preferences',
        body,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificationPrefs'] });
    },
  });
}

// Saved Listings

interface SavedListingsParams {
  sort?: string;
  sortDir?: string;
  limit?: number;
  offset?: number;
}

export function useSavedListings(params: SavedListingsParams = {}) {
  const searchParams = new URLSearchParams();
  if (params.sort) searchParams.set('sort', params.sort);
  if (params.sortDir) searchParams.set('sortDir', params.sortDir);
  if (params.limit !== undefined) searchParams.set('limit', String(params.limit));
  if (params.offset !== undefined) searchParams.set('offset', String(params.offset));

  const qs = searchParams.toString();
  const path = `/api/v1/listings/saved${qs ? `?${qs}` : ''}`;

  return useQuery<PaginatedSavedListings, Error>({
    queryKey: ['savedListings', params],
    queryFn: () => apiGet<PaginatedSavedListings>(path),
  });
}

export function useUnsaveListing() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (listingId) =>
      apiDelete<void>(`/api/v1/listings/${listingId}/save`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['savedListings'] });
    },
  });
}
