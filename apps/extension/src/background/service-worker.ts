import type { EnrichListingResponse } from '@landmatch/api';

import * as apiClient from '../shared/api-client';
import { getAuth, setAuth, clearAuth } from '../shared/auth';
import { getCached, setCached } from '../shared/cache';
import type { ExtensionMessage, EnrichmentResultMessage, LoginResultMessage, AuthStatusMessage, SaveListingResultMessage } from '../shared/messages';

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true; // keep message channel open for async response
});

async function handleMessage(message: ExtensionMessage) {
  switch (message.type) {
    case 'ENRICH_LISTING':
      return handleEnrich(message.payload);
    case 'SAVE_LISTING':
      return handleSave(message.payload.listingId);
    case 'LOGIN':
      return handleLogin(message.payload.email, message.payload.password);
    case 'LOGOUT':
      return handleLogout();
    case 'GET_AUTH_STATUS':
      return handleGetAuthStatus();
  }
}

async function handleEnrich(payload: {
  address: string;
  price?: number;
  acreage?: number;
  title?: string;
  url: string;
  source: string;
  externalId?: string;
}): Promise<EnrichmentResultMessage> {
  try {
    // Check cache first
    const cached = await getCached<EnrichListingResponse>(payload.address);
    if (cached) {
      updateBadge(cached);
      return { type: 'ENRICHMENT_RESULT', payload: cached };
    }

    // Check if already enriched server-side by URL
    const existing = await apiClient.getListingByUrl(payload.url);
    if (existing.ok && existing.data) {
      const data = existing.data as EnrichListingResponse;
      await setCached(payload.address, data);
      updateBadge(data);
      return { type: 'ENRICHMENT_RESULT', payload: data };
    }

    // Enrich via API
    const result = await apiClient.enrichListing(payload);

    if (!result.ok) {
      return { type: 'ENRICHMENT_RESULT', payload: null, error: result.error ?? 'Enrichment failed' };
    }

    const data = result.data as EnrichListingResponse;
    await setCached(payload.address, data);
    updateBadge(data);
    return { type: 'ENRICHMENT_RESULT', payload: data };
  } catch (error) {
    return { type: 'ENRICHMENT_RESULT', payload: null, error: String(error) };
  }
}

async function handleSave(listingId: string): Promise<SaveListingResultMessage> {
  try {
    const result = await apiClient.saveListing(listingId);
    if (!result.ok) {
      return { type: 'SAVE_LISTING_RESULT', payload: null, error: result.error ?? 'Save failed' };
    }
    return { type: 'SAVE_LISTING_RESULT', payload: result.data as { savedAt: string } };
  } catch (error) {
    return { type: 'SAVE_LISTING_RESULT', payload: null, error: String(error) };
  }
}

async function handleLogin(email: string, password: string): Promise<LoginResultMessage> {
  try {
    const result = await apiClient.login(email, password);
    if (!result.ok || !result.data) {
      return { type: 'LOGIN_RESULT', payload: null, error: result.error ?? 'Login failed' };
    }

    await setAuth({
      accessToken: result.data.accessToken,
      refreshToken: result.data.refreshToken,
      email,
    });

    return { type: 'LOGIN_RESULT', payload: { email } };
  } catch (error) {
    return { type: 'LOGIN_RESULT', payload: null, error: String(error) };
  }
}

async function handleLogout(): Promise<AuthStatusMessage> {
  await clearAuth();
  chrome.action.setBadgeText({ text: '' });
  return { type: 'AUTH_STATUS', payload: { authenticated: false } };
}

async function handleGetAuthStatus(): Promise<AuthStatusMessage> {
  const auth = await getAuth();
  if (!auth) {
    return { type: 'AUTH_STATUS', payload: { authenticated: false } };
  }
  return { type: 'AUTH_STATUS', payload: { authenticated: true, email: auth.email } };
}

function updateBadge(data: EnrichListingResponse) {
  const soil = data.enrichment.soilCapabilityClass;
  if (soil != null) {
    chrome.action.setBadgeText({ text: String(soil) });
    const color = soil <= 3 ? '#22c55e' : soil <= 5 ? '#eab308' : '#ef4444';
    chrome.action.setBadgeBackgroundColor({ color });
  }
}
