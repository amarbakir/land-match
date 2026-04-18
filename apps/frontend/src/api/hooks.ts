import type { EnrichListingRequest, EnrichListingResponse } from '@landmatch/api';
import { useMutation } from '@tanstack/react-query';

import { apiPost } from './client';

export function useEnrichListing() {
  return useMutation<EnrichListingResponse, Error, EnrichListingRequest>({
    mutationFn: (body) =>
      apiPost<EnrichListingRequest, EnrichListingResponse>(
        '/api/v1/listings/enrich',
        body,
      ),
  });
}
