# Extension Side Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all extension UI from in-page DOM overlay to Chrome Side Panel, making the content script a thin data extractor with zero DOM manipulation.

**Architecture:** Content script extracts listing data and sends it to the service worker. Service worker enriches and broadcasts results to the side panel. Side panel renders score card, auth, and save actions. No DOM injection into host pages.

**Tech Stack:** Preact, Chrome Side Panel API, Chrome Extension Manifest V3, Vite multi-entry build

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/sidepanel/index.html` | Side panel HTML shell |
| Create | `src/sidepanel/main.tsx` | Preact entry point for side panel |
| Create | `src/sidepanel/SidePanel.tsx` | Root component (state machine: logged_out → idle → loading → loaded → error) |
| Create | `src/sidepanel/ScoreCard.tsx` | Score display (moved from overlay, adapted) |
| Create | `src/sidepanel/LoginForm.tsx` | Auth form (moved from popup) |
| Create | `src/sidepanel/IdleState.tsx` | Shown when not on a listing page |
| Create | `src/sidepanel/styles.css` | Shared styles (no longer need inline for shadow DOM) |
| Modify | `src/shared/messages.ts` | Add `PAGE_CHANGED`, `ENRICHMENT_LOADING`, `RETRY_ENRICH`, `GET_CURRENT_STATE` messages |
| Modify | `src/background/service-worker.ts` | Route enrichment results to side panel, handle panel lifecycle, open panel on action click |
| Modify | `src/content/main.ts` | Remove overlay code, send `PAGE_CHANGED` for non-listing pages |
| Modify | `src/content/extractors/types.ts` | Remove `getOverlayAnchor` from interface |
| Modify | `src/content/extractors/landwatch.ts` | Remove `getOverlayAnchor` implementation |
| Modify | `manifest.json` | Add `side_panel`, `sidePanel` permission, remove `default_popup` |
| Modify | `vite.config.ts` | Replace popup entry with sidepanel entry |
| Delete | `src/content/overlay/inject.ts` | No longer needed |
| Delete | `src/content/overlay/ScoreCard.tsx` | Moved to sidepanel/ |
| Delete | `src/popup/index.html` | Replaced by side panel |
| Delete | `src/popup/main.tsx` | Replaced by side panel |
| Delete | `src/popup/Popup.tsx` | Logic split into SidePanel + LoginForm |

---

### Task 1: Update Messages

**Files:**
- Modify: `src/shared/messages.ts`

- [ ] **Step 1: Add new message types to messages.ts**

```typescript
// Add after SaveListingResultMessage (line 34):

// Content → Background (page navigation status)
export interface PageChangedMessage {
  type: 'PAGE_CHANGED';
  payload: { isListing: boolean; url: string };
}

// SidePanel → Background (retry enrichment)
export interface RetryEnrichMessage {
  type: 'RETRY_ENRICH';
}

// SidePanel → Background (get current state on panel open)
export interface GetCurrentStateMessage {
  type: 'GET_CURRENT_STATE';
}

// Background → SidePanel (current state response)
export interface CurrentStateMessage {
  type: 'CURRENT_STATE';
  payload:
    | { state: 'idle' }
    | { state: 'loading'; url: string }
    | { state: 'loaded'; data: EnrichListingResponse }
    | { state: 'error'; error: string; url: string };
}
```

- [ ] **Step 2: Update ExtensionMessage union**

Replace the `ExtensionMessage` type:

```typescript
export type ExtensionMessage =
  | EnrichListingMessage
  | SaveListingMessage
  | LoginMessage
  | LogoutMessage
  | GetAuthStatusMessage
  | PageChangedMessage
  | RetryEnrichMessage
  | GetCurrentStateMessage;
```

- [ ] **Step 3: Update ExtensionResponse union**

```typescript
export type ExtensionResponse =
  | EnrichmentResultMessage
  | SaveListingResultMessage
  | LoginResultMessage
  | AuthStatusMessage
  | CurrentStateMessage;
```

- [ ] **Step 4: Verify types compile**

Run: `cd apps/extension && pnpm lint`
Expected: PASS (no emit errors)

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/shared/messages.ts
git commit -m "Add side panel message types to extension"
```

---

### Task 2: Update Service Worker

**Files:**
- Modify: `src/background/service-worker.ts`

- [ ] **Step 1: Add state tracking and panel messaging**

Replace the full `service-worker.ts` with:

```typescript
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
  setAndBroadcastState({ state: 'loading', url: payload.url });

  try {
    // Check cache first
    const cached = await getCached<EnrichListingResponse>(payload.address);
    if (cached) {
      console.log('[LandMatch SW] Cache hit for:', payload.address);
      updateBadge(cached);
      setAndBroadcastState({ state: 'loaded', data: cached });
      return { type: 'ENRICHMENT_RESULT', payload: cached };
    }

    // Check if already enriched server-side by URL
    const existing = await apiClient.getListingByUrl(payload.url);
    if (existing.ok && existing.data) {
      console.log('[LandMatch SW] Server had existing enrichment');
      await setCached(payload.address, existing.data);
      updateBadge(existing.data);
      setAndBroadcastState({ state: 'loaded', data: existing.data });
      return { type: 'ENRICHMENT_RESULT', payload: existing.data };
    }

    // Enrich via API
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
```

- [ ] **Step 2: Verify types compile**

Run: `cd apps/extension && pnpm lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/background/service-worker.ts
git commit -m "Update service worker to broadcast state to side panel"
```

---

### Task 3: Slim Down Content Script

**Files:**
- Modify: `src/content/main.ts`
- Modify: `src/content/extractors/types.ts`
- Modify: `src/content/extractors/landwatch.ts`
- Delete: `src/content/overlay/inject.ts`
- Delete: `src/content/overlay/ScoreCard.tsx`

- [ ] **Step 1: Replace content/main.ts**

```typescript
import { sendMessage } from '../shared/messages';
import { findExtractor } from './extractors';

let currentUrl = window.location.href;
let enrichingUrl: string | null = null;

function processCurrentPage() {
  const url = window.location.href;

  if (enrichingUrl === url) return;

  const extractor = findExtractor(url);
  if (!extractor) {
    // Not a listing page — notify background
    sendMessage({ type: 'PAGE_CHANGED', payload: { isListing: false, url } });
    return;
  }

  const listing = extractor.extract(document);
  if (!listing) {
    sendMessage({ type: 'PAGE_CHANGED', payload: { isListing: false, url } });
    return;
  }

  console.log('[LandMatch] Enriching:', listing.address);
  enrichingUrl = url;

  sendMessage({ type: 'ENRICH_LISTING', payload: listing })
    .finally(() => { enrichingUrl = null; });
}

// Run on page load
console.log('[LandMatch] Content script loaded on:', window.location.href);
processCurrentPage();

// Detect SPA navigation
if ('navigation' in window) {
  (window as any).navigation.addEventListener('navigatesuccess', () => {
    if (window.location.href !== currentUrl) {
      currentUrl = window.location.href;
      processCurrentPage();
    }
  });
} else {
  setInterval(() => {
    if (window.location.href !== currentUrl) {
      currentUrl = window.location.href;
      processCurrentPage();
    }
  }, 500);
}
```

- [ ] **Step 2: Remove getOverlayAnchor from extractor interface**

Replace `src/content/extractors/types.ts`:

```typescript
export interface ExtractedListing {
  address: string;
  price?: number;
  acreage?: number;
  title?: string;
  url: string;
  source: string;
  externalId?: string;
}

export interface ListingExtractor {
  name: string;
  matches(url: string): boolean;
  extract(document: Document): ExtractedListing | null;
}
```

- [ ] **Step 3: Remove getOverlayAnchor from landwatch extractor**

Open `src/content/extractors/landwatch.ts` and remove the `getOverlayAnchor` method from the exported extractor object. Keep `name`, `matches`, and `extract` only.

- [ ] **Step 4: Delete overlay files**

```bash
rm apps/extension/src/content/overlay/inject.ts
rm apps/extension/src/content/overlay/ScoreCard.tsx
rmdir apps/extension/src/content/overlay
```

- [ ] **Step 5: Verify types compile**

Run: `cd apps/extension && pnpm lint`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A apps/extension/src/content/
git commit -m "Strip content script to thin extractor, remove DOM overlay"
```

---

### Task 4: Create Side Panel UI

**Files:**
- Create: `src/sidepanel/index.html`
- Create: `src/sidepanel/main.tsx`
- Create: `src/sidepanel/styles.css`
- Create: `src/sidepanel/SidePanel.tsx`
- Create: `src/sidepanel/LoginForm.tsx`
- Create: `src/sidepanel/IdleState.tsx`
- Create: `src/sidepanel/ScoreCard.tsx`

- [ ] **Step 1: Create sidepanel/index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=360" />
    <title>LandMatch</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create sidepanel/styles.css**

```css
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  color: #1a1a1a;
  background: #fff;
  min-height: 100vh;
}

.panel {
  padding: 16px;
}

.logo {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 16px;
}

.input {
  display: block;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  margin-bottom: 8px;
}

.btn {
  display: block;
  width: 100%;
  padding: 8px 12px;
  border-radius: 6px;
  border: none;
  background: #2563eb;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-outline {
  background: #fff;
  color: #1a1a1a;
  border: 1px solid #d1d5db;
}

.btn-danger {
  background: #fff;
  color: #ef4444;
  border: 1px solid #fecaca;
}

.error {
  color: #ef4444;
  font-size: 13px;
  margin-bottom: 8px;
}

.info {
  color: #6b7280;
  font-size: 13px;
  margin-bottom: 12px;
}

.user-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.score-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  color: white;
  font-size: 18px;
  font-weight: 700;
}

.bar-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.bar-label {
  font-size: 12px;
  color: #6b7280;
  width: 120px;
  flex-shrink: 0;
}

.bar-track {
  flex: 1;
  height: 8px;
  background: #e5e7eb;
  border-radius: 4px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 4px;
}

.bar-score {
  font-size: 12px;
  font-weight: 600;
  width: 28px;
  text-align: right;
  flex-shrink: 0;
}

.bar-detail {
  font-size: 11px;
  color: #9ca3af;
  margin: -4px 0 8px 128px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.title {
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.data-row {
  display: flex;
  gap: 24px;
  margin-bottom: 8px;
}

.data-col {
  flex: 1;
}

.data-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #6b7280;
  margin-bottom: 2px;
}

.data-value {
  font-size: 14px;
  font-weight: 500;
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  align-items: center;
}

.spinner {
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 2px solid #e5e7eb;
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  gap: 12px;
  color: #6b7280;
}

.idle-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  gap: 12px;
  text-align: center;
  color: #6b7280;
  padding: 24px;
}
```

- [ ] **Step 3: Create sidepanel/main.tsx**

```tsx
import { render, h } from 'preact';
import { SidePanel } from './SidePanel';

render(h(SidePanel, null), document.getElementById('app')!);
```

- [ ] **Step 4: Create sidepanel/LoginForm.tsx**

```tsx
import { h } from 'preact';
import { useState } from 'preact/hooks';
import type { LoginResultMessage } from '../shared/messages';
import { sendMessage } from '../shared/messages';

interface LoginFormProps {
  onLogin: (email: string) => void;
}

export function LoginForm({ onLogin }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const result = await sendMessage<LoginResultMessage>({
        type: 'LOGIN',
        payload: { email, password },
      });

      if (result.error || !result.payload) {
        setError(result.error ?? 'Login failed');
      } else {
        onLogin(result.payload.email);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div class="panel">
      <div class="logo">LandMatch</div>
      <p class="info">Sign in to enrich and save listings.</p>
      {error && <div class="error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <input
          class="input"
          type="email"
          placeholder="Email"
          value={email}
          onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
          required
        />
        <input
          class="input"
          type="password"
          placeholder="Password"
          value={password}
          onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
          required
        />
        <button class="btn" type="submit" disabled={submitting}>
          {submitting ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Create sidepanel/IdleState.tsx**

```tsx
import { h } from 'preact';

export function IdleState() {
  return (
    <div class="idle-container">
      <div style="font-size: 32px;">🌱</div>
      <p style="font-weight: 500; color: #1a1a1a;">No listing detected</p>
      <p>Browse a LandWatch listing to see soil, flood, and scoring data automatically.</p>
    </div>
  );
}
```

- [ ] **Step 6: Create sidepanel/ScoreCard.tsx**

```tsx
import { h } from 'preact';
import { useState } from 'preact/hooks';
import type { EnrichListingResponse } from '@landmatch/api';
import type { SaveListingResultMessage } from '../shared/messages';
import { sendMessage } from '../shared/messages';
import {
  getSoilLabel,
  getFloodColor,
  getFloodLabel,
  getOverallScore,
  getScoreColor,
  HOMESTEAD_COMPONENT_LABELS,
  HOMESTEAD_DISPLAY_ORDER,
} from '../shared/scoring';

interface ScoreCardProps {
  data: EnrichListingResponse;
}

export function ScoreCard({ data }: ScoreCardProps) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  const { enrichment } = data;
  const score = getOverallScore(data);
  const hasHomestead = data.homesteadComponents != null;

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    try {
      const result = await sendMessage<SaveListingResultMessage>({
        type: 'SAVE_LISTING',
        payload: { listingId: data.listing.id },
      });
      if (result.error || !result.payload) {
        setSaveError(result.error ?? 'Save failed');
      } else {
        setSaved(true);
      }
    } catch (err) {
      setSaveError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div class="panel">
      <div class="header">
        <div class="title">
          LandMatch
          {score != null && (
            <span class="score-badge" style={`background:${getScoreColor(score)}`}>
              {score}
            </span>
          )}
        </div>
      </div>

      {hasHomestead ? (
        <div style="margin-bottom: 8px;">
          {HOMESTEAD_DISPLAY_ORDER.map((key) => {
            const comp = data.homesteadComponents![key];
            if (!comp) return null;
            const color = getScoreColor(comp.score);
            return (
              <div key={key}>
                <div class="bar-row">
                  <div class="bar-label">{HOMESTEAD_COMPONENT_LABELS[key] ?? key}</div>
                  <div class="bar-track">
                    <div class="bar-fill" style={`width:${comp.score}%;background:${color}`} />
                  </div>
                  <div class="bar-score" style={`color:${color}`}>{comp.score}</div>
                </div>
                <div class="bar-detail">{comp.label}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <div class="data-row">
            <div class="data-col">
              <div class="data-label">Soil</div>
              <div class="data-value">{getSoilLabel(enrichment.soilCapabilityClass)}</div>
            </div>
            <div class="data-col">
              <div class="data-label">Flood Zone</div>
              <div class="data-value" style={`color:${getFloodColor(enrichment.femaFloodZone)}`}>
                {enrichment.femaFloodZone ?? 'Unknown'} — {getFloodLabel(enrichment.femaFloodZone)}
              </div>
            </div>
          </div>
          <div class="data-row">
            <div class="data-col">
              <div class="data-label">Drainage</div>
              <div class="data-value">{enrichment.soilDrainageClass ?? 'Unknown'}</div>
            </div>
            <div class="data-col">
              <div class="data-label">Soil Texture</div>
              <div class="data-value">{enrichment.soilTexture ?? 'Unknown'}</div>
            </div>
          </div>
        </>
      )}

      <div class="actions">
        <button
          class="btn"
          onClick={handleSave}
          disabled={saving || saved}
          style="width: auto;"
        >
          {saved ? '✓ Saved' : saving ? 'Saving...' : 'Save to Dashboard'}
        </button>
        {saveError && <span class="error">{saveError}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Create sidepanel/SidePanel.tsx**

```tsx
import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { EnrichListingResponse } from '@landmatch/api';
import type { AuthStatusMessage, CurrentStateMessage } from '../shared/messages';
import { sendMessage } from '../shared/messages';
import { LoginForm } from './LoginForm';
import { IdleState } from './IdleState';
import { ScoreCard } from './ScoreCard';

type PanelState =
  | { view: 'loading_auth' }
  | { view: 'logged_out' }
  | { view: 'idle'; email: string }
  | { view: 'loading'; email: string }
  | { view: 'loaded'; email: string; data: EnrichListingResponse }
  | { view: 'error'; email: string; error: string };

export function SidePanel() {
  const [state, setState] = useState<PanelState>({ view: 'loading_auth' });

  useEffect(() => {
    // Check auth status on mount
    sendMessage<AuthStatusMessage>({ type: 'GET_AUTH_STATUS' }).then((res) => {
      if (!res.payload.authenticated) {
        setState({ view: 'logged_out' });
        return;
      }
      const email = res.payload.email ?? '';
      // Get current enrichment state
      sendMessage<CurrentStateMessage>({ type: 'GET_CURRENT_STATE' }).then((stateMsg) => {
        const s = stateMsg.payload;
        if (s.state === 'loaded') {
          setState({ view: 'loaded', email, data: s.data });
        } else if (s.state === 'loading') {
          setState({ view: 'loading', email });
        } else if (s.state === 'error') {
          setState({ view: 'error', email, error: s.error });
        } else {
          setState({ view: 'idle', email });
        }
      });
    });

    // Listen for state broadcasts from background
    function onMessage(message: any) {
      if (message.type === 'CURRENT_STATE') {
        const s = message.payload as CurrentStateMessage['payload'];
        setState((prev) => {
          const email = 'email' in prev ? prev.email : '';
          if (s.state === 'loaded') return { view: 'loaded', email, data: s.data };
          if (s.state === 'loading') return { view: 'loading', email };
          if (s.state === 'error') return { view: 'error', email, error: s.error };
          return { view: 'idle', email };
        });
      }
    }

    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

  function handleLogin(email: string) {
    setState({ view: 'idle', email });
    // Request current state in case we landed on a listing
    sendMessage<CurrentStateMessage>({ type: 'GET_CURRENT_STATE' }).then((stateMsg) => {
      const s = stateMsg.payload;
      if (s.state === 'loaded') setState({ view: 'loaded', email, data: s.data });
      else if (s.state === 'loading') setState({ view: 'loading', email });
      else if (s.state === 'error') setState({ view: 'error', email, error: s.error });
    });
  }

  function handleLogout() {
    sendMessage({ type: 'LOGOUT' });
    setState({ view: 'logged_out' });
  }

  function handleRetry() {
    sendMessage({ type: 'RETRY_ENRICH' });
  }

  if (state.view === 'loading_auth') {
    return (
      <div class="loading-container">
        <div class="spinner" />
      </div>
    );
  }

  if (state.view === 'logged_out') {
    return <LoginForm onLogin={handleLogin} />;
  }

  return (
    <div>
      {/* User header */}
      <div class="panel" style="border-bottom: 1px solid #e5e7eb; padding-bottom: 12px;">
        <div class="user-row">
          <span style="font-weight: 500;">{state.email}</span>
          <button
            onClick={handleLogout}
            style="background:none;border:none;color:#6b7280;cursor:pointer;text-decoration:underline;font-size:13px;"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Content area */}
      {state.view === 'idle' && <IdleState />}
      {state.view === 'loading' && (
        <div class="loading-container">
          <div class="spinner" />
          <span>Enriching listing...</span>
        </div>
      )}
      {state.view === 'loaded' && <ScoreCard data={state.data} />}
      {state.view === 'error' && (
        <div class="panel">
          <div class="logo">LandMatch</div>
          <p class="error">{state.error}</p>
          <button class="btn-outline btn" onClick={handleRetry}>Retry</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Verify types compile**

Run: `cd apps/extension && pnpm lint`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/extension/src/sidepanel/
git commit -m "Add side panel UI with score card, auth, and idle states"
```

---

### Task 5: Update Manifest and Build Config

**Files:**
- Modify: `manifest.json`
- Modify: `vite.config.ts`
- Delete: `src/popup/index.html`
- Delete: `src/popup/main.tsx`
- Delete: `src/popup/Popup.tsx`

- [ ] **Step 1: Update manifest.json**

```json
{
  "manifest_version": 3,
  "name": "LandMatch",
  "version": "1.0.0",
  "description": "Instantly enrich land listings with soil, flood, and scoring data from LandMatch.",
  "permissions": ["storage", "sidePanel"],
  "host_permissions": [
    "https://www.landwatch.com/*"
  ],
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["https://www.landwatch.com/*"],
      "js": ["content/main.js"],
      "run_at": "document_idle"
    }
  ],
  "side_panel": {
    "default_path": "sidepanel/index.html"
  },
  "action": {
    "default_title": "LandMatch"
  },
  "web_accessible_resources": [
    {
      "resources": ["chunks/*"],
      "matches": ["https://www.landwatch.com/*"]
    }
  ],
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
```

- [ ] **Step 2: Update vite.config.ts**

Replace the non-content build's `rollupOptions.input`:

```typescript
rollupOptions: {
  input: {
    'background/service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
    'sidepanel/index': resolve(__dirname, 'src/sidepanel/index.html'),
  },
  output: {
    format: 'es',
    entryFileNames: '[name].js',
    chunkFileNames: 'chunks/[name].js',
    assetFileNames: 'assets/[name]-[hash][extname]',
  },
},
```

(Replace `'popup/index'` with `'sidepanel/index'`)

- [ ] **Step 3: Delete popup files**

```bash
rm apps/extension/src/popup/index.html
rm apps/extension/src/popup/main.tsx
rm apps/extension/src/popup/Popup.tsx
rmdir apps/extension/src/popup
```

- [ ] **Step 4: Build the extension**

Run: `cd apps/extension && pnpm build`
Expected: Build succeeds, `dist/` contains `sidepanel/index.html`, `background/service-worker.js`, `content/main.js`, no `popup/`

- [ ] **Step 5: Commit**

```bash
git add -A apps/extension/
git commit -m "Switch manifest to side panel, remove popup, update build config"
```

---

### Task 6: Manual Integration Test

- [ ] **Step 1: Load extension in Chrome**

1. Open `chrome://extensions`
2. Enable Developer Mode
3. Click "Load unpacked" → select `apps/extension/dist/`
4. Verify no errors in extension card

- [ ] **Step 2: Test side panel opens**

1. Click the LandMatch extension icon in toolbar
2. Side panel should open on the right side of the browser
3. If not logged in: LoginForm should be visible
4. Log in with test credentials
5. Panel should show idle state with "No listing detected" message

- [ ] **Step 3: Test enrichment flow**

1. Navigate to a LandWatch listing page (e.g., `https://www.landwatch.com/...`)
2. Side panel should show loading spinner
3. After enrichment completes: ScoreCard should render with homestead components
4. Badge on toolbar icon should show the score number

- [ ] **Step 4: Test save flow**

1. Click "Save to Dashboard" in the side panel ScoreCard
2. Button should change to "✓ Saved"
3. Open the LandMatch dashboard → Saved view should contain the listing

- [ ] **Step 5: Test navigation**

1. Navigate away from the listing (e.g., back to search results)
2. Side panel should return to idle state
3. Navigate to a different listing
4. Side panel should show loading → new ScoreCard

- [ ] **Step 6: Verify no DOM injection**

1. On a LandWatch listing page, open Chrome DevTools → Elements
2. Search for "landmatch-overlay" — should NOT exist
3. Confirm no shadow DOM hosts injected by the extension

- [ ] **Step 7: Commit any fixes from testing**

```bash
git add -A apps/extension/
git commit -m "Fix issues found during side panel integration testing"
```

(Skip this step if no fixes needed.)
