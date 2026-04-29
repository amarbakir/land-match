import type { EnrichListingResponse } from '@landmatch/api';

import * as apiClient from '../shared/api-client';
import { getAuth, setAuth, clearAuth } from '../shared/auth';
import { getCached, setCached } from '../shared/cache';
import { getOverallScore, getScoreColor } from '../shared/scoring';
import type {
  ExtensionMessage,
  EnrichmentResultMessage,
  LoginResultMessage,
  AuthStatusMessage,
  SaveListingResultMessage,
  CurrentStateMessage,
} from '../shared/messages';

// Track current enrichment state for the active tab
let currentState: CurrentStateMessage['payload'] = { state: 'idle' };
let lastEnrichPayload: { address: string; price?: number; acreage?: number; title?: string; url: string; source: string; externalId?: string } | null = null;

// Open side panel when extension icon is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  console.log('[LandMatch SW] Received message:', message.type);
  handleMessage(message).then((response) => {
    console.log('[LandMatch SW] Sending response for:', message.type);
    sendResponse(response);
  }).catch((err) => {
    console.error('[LandMatch SW] Handler error:', message.type, err);
    sendResponse({ error: String(err) });
  });
  return true;
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
    case 'PAGE_CHANGED':
      return handlePageChanged(message.payload);
    case 'RETRY_ENRICH':
      return handleRetryEnrich();
    case 'GET_CURRENT_STATE':
      return handleGetCurrentState();
  }
}

function broadcastToPanel(message: object) {
  chrome.runtime.sendMessage(message).catch(() => {
    // Panel not open — ignore
  });
}

function setAndBroadcastState(state: CurrentStateMessage['payload']) {
  currentState = state;
  broadcastToPanel({ type: 'CURRENT_STATE', payload: state });
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
  lastEnrichPayload = payload;
  setAndBroadcastState({ state: 'loading', url: payload.url, title: payload.title, price: payload.price, acreage: payload.acreage, address: payload.address });

  try {
    const cached = await getCached<EnrichListingResponse>(payload.address);
    if (cached) {
      console.log('[LandMatch SW] Cache hit for:', payload.address);
      updateBadge(cached);
      setAndBroadcastState({ state: 'loaded', data: cached });
      return { type: 'ENRICHMENT_RESULT', payload: cached };
    }

    const existing = await apiClient.getListingByUrl(payload.url);
    if (existing.ok && existing.data) {
      console.log('[LandMatch SW] Server had existing enrichment');
      await setCached(payload.address, existing.data);
      updateBadge(existing.data);
      setAndBroadcastState({ state: 'loaded', data: existing.data });
      return { type: 'ENRICHMENT_RESULT', payload: existing.data };
    }

    console.log('[LandMatch SW] Calling enrich API for:', payload.address);
    const result = await apiClient.enrichListing(payload);

    if (!result.ok || !result.data) {
      const error = result.error ?? 'Enrichment failed';
      setAndBroadcastState({ state: 'error', error, url: payload.url });
      return { type: 'ENRICHMENT_RESULT', payload: null, error };
    }

    await setCached(payload.address, result.data);
    updateBadge(result.data);
    setAndBroadcastState({ state: 'loaded', data: result.data });
    return { type: 'ENRICHMENT_RESULT', payload: result.data };
  } catch (error) {
    const errorMsg = String(error);
    setAndBroadcastState({ state: 'error', error: errorMsg, url: payload.url });
    return { type: 'ENRICHMENT_RESULT', payload: null, error: errorMsg };
  }
}

function handlePageChanged(payload: { isListing: boolean; url: string }) {
  if (!payload.isListing) {
    setAndBroadcastState({ state: 'idle' });
    chrome.action.setBadgeText({ text: '' });
    lastEnrichPayload = null;
  }
  return { ok: true };
}

async function handleRetryEnrich(): Promise<EnrichmentResultMessage> {
  if (!lastEnrichPayload) {
    return { type: 'ENRICHMENT_RESULT', payload: null, error: 'No listing to retry' };
  }
  return handleEnrich(lastEnrichPayload);
}

function handleGetCurrentState(): CurrentStateMessage {
  return { type: 'CURRENT_STATE', payload: currentState };
}

async function handleSave(listingId: string): Promise<SaveListingResultMessage> {
  try {
    const result = await apiClient.saveListing(listingId);
    if (!result.ok || !result.data) {
      return { type: 'SAVE_LISTING_RESULT', payload: null, error: result.error ?? 'Save failed' };
    }
    return { type: 'SAVE_LISTING_RESULT', payload: result.data };
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
  const score = getOverallScore(data);
  if (score != null) {
    chrome.action.setBadgeText({ text: String(score) });
    chrome.action.setBadgeBackgroundColor({ color: getScoreColor(score) });
  }
}
