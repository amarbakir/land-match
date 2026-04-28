import type { EnrichListingResponse } from '@landmatch/api';

// Content → Background
export interface EnrichListingMessage {
  type: 'ENRICH_LISTING';
  payload: {
    address: string;
    price?: number;
    acreage?: number;
    title?: string;
    url: string;
    source: string;
    externalId?: string;
  };
}

// Background → Content
export interface EnrichmentResultMessage {
  type: 'ENRICHMENT_RESULT';
  payload: EnrichListingResponse | null;
  error?: string;
}

// Popup/Content → Background
export interface SaveListingMessage {
  type: 'SAVE_LISTING';
  payload: { listingId: string };
}

export interface SaveListingResultMessage {
  type: 'SAVE_LISTING_RESULT';
  payload: { savedAt: string } | null;
  error?: string;
}

// Content → Background (navigation)
export interface PageChangedMessage {
  type: 'PAGE_CHANGED';
  payload: { isListing: boolean; url: string };
}

// Side Panel → Background
export interface RetryEnrichMessage {
  type: 'RETRY_ENRICH';
}

export interface GetCurrentStateMessage {
  type: 'GET_CURRENT_STATE';
}

// Background → Side Panel
export interface CurrentStateMessage {
  type: 'CURRENT_STATE';
  payload:
    | { state: 'idle' }
    | { state: 'loading'; url: string }
    | { state: 'loaded'; data: EnrichListingResponse }
    | { state: 'error'; error: string; url: string };
}

// Auth
export interface LoginMessage {
  type: 'LOGIN';
  payload: { email: string; password: string };
}

export interface LoginResultMessage {
  type: 'LOGIN_RESULT';
  payload: { email: string } | null;
  error?: string;
}

export interface LogoutMessage {
  type: 'LOGOUT';
}

export interface GetAuthStatusMessage {
  type: 'GET_AUTH_STATUS';
}

export interface AuthStatusMessage {
  type: 'AUTH_STATUS';
  payload: { authenticated: boolean; email?: string };
}

export type ExtensionMessage =
  | EnrichListingMessage
  | SaveListingMessage
  | LoginMessage
  | LogoutMessage
  | GetAuthStatusMessage
  | PageChangedMessage
  | RetryEnrichMessage
  | GetCurrentStateMessage;

export type ExtensionResponse =
  | EnrichmentResultMessage
  | SaveListingResultMessage
  | LoginResultMessage
  | AuthStatusMessage
  | CurrentStateMessage;

export function sendMessage<T = ExtensionResponse>(message: ExtensionMessage): Promise<T> {
  return chrome.runtime.sendMessage(message);
}
