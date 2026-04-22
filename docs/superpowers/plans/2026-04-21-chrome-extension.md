# Chrome Extension Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the existing Chrome extension to overlay full homestead scores inline on listing pages and support one-click save to the LandMatch dashboard.

**Architecture:** Content scripts detect listing pages by URL pattern, extract address/price/acreage via site-specific parsers, call the LandMatch API for enrichment + scoring, and render a floating panel with homestead scores. Each supported site has an isolated parser behind a common interface. Auth is handled via stored JWT tokens from the LandMatch dashboard login.

**Tech Stack:** Chrome Extension Manifest V3, TypeScript, Vite (bundler), Chrome Storage API

**Depends on:** Enrichment Expansion + Homestead Scoring plans must be complete.

**Note:** This plan covers the extension enhancement. The existing extension basics (manifest, content script shell, popup) are already in place. This plan should be refined once Epics 2+3 are complete and the exact API response shapes are finalized. The plan below establishes the architecture and site parser pattern; specific DOM selectors will need validation against live sites at implementation time.

---

## File Map

This plan assumes the extension lives in `apps/extension/` (or similar). Exact paths should be confirmed from the existing extension structure before implementing.

### New/Modified Files

| File | Purpose |
|------|---------|
| `src/parsers/types.ts` | `SiteParser` interface |
| `src/parsers/landwatch.ts` | LandWatch DOM parser |
| `src/parsers/zillow.ts` | Zillow DOM parser |
| `src/parsers/landflip.ts` | LandFlip DOM parser |
| `src/parsers/craigslist.ts` | Craigslist DOM parser |
| `src/parsers/registry.ts` | URL pattern → parser routing |
| `src/api/client.ts` | API client for LandMatch backend |
| `src/api/auth.ts` | Token storage and refresh via Chrome Storage |
| `src/content/overlay.ts` | Floating panel UI rendering |
| `src/content/index.ts` | Content script entrypoint |
| `src/background/index.ts` | Service worker for auth state |
| `manifest.json` | URL permissions, content script matches |

---

## Task 1: Site Parser Interface + Registry

**Files:**
- Create: `src/parsers/types.ts`
- Create: `src/parsers/registry.ts`

- [ ] **Step 1: Define parser interface**

Create `src/parsers/types.ts`:

```typescript
export interface ParsedListing {
  address?: string;
  price?: number;
  acreage?: number;
  title?: string;
  url: string;
}

export interface SiteParser {
  name: string;
  /** URL patterns this parser handles (regex) */
  urlPatterns: RegExp[];
  /** Extract listing data from the current page DOM */
  parse(document: Document, url: string): ParsedListing | null;
}
```

- [ ] **Step 2: Create parser registry**

Create `src/parsers/registry.ts`:

```typescript
import type { SiteParser } from './types';
import { landwatchParser } from './landwatch';
import { zillowParser } from './zillow';
import { landflipParser } from './landflip';
import { craigslistParser } from './craigslist';

const parsers: SiteParser[] = [
  landwatchParser,
  zillowParser,
  landflipParser,
  craigslistParser,
];

export function findParser(url: string): SiteParser | null {
  for (const parser of parsers) {
    if (parser.urlPatterns.some((pattern) => pattern.test(url))) {
      return parser;
    }
  }
  return null;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/parsers/
git commit -m "add site parser interface and registry for extension"
```

---

## Task 2: LandWatch Parser

**Files:**
- Create: `src/parsers/landwatch.ts`

- [ ] **Step 1: Implement LandWatch parser**

Create `src/parsers/landwatch.ts`:

```typescript
import type { ParsedListing, SiteParser } from './types';

export const landwatchParser: SiteParser = {
  name: 'landwatch',
  urlPatterns: [
    /landwatch\.com\/.*\/.*\/.*/,  // Property detail pages
  ],

  parse(document: Document, url: string): ParsedListing | null {
    // LandWatch embeds JSON-LD structured data on listing pages
    const jsonLd = document.querySelector('script[type="application/ld+json"]');
    if (jsonLd?.textContent) {
      try {
        const data = JSON.parse(jsonLd.textContent);
        if (data['@type'] === 'RealEstateListing' || data['@type'] === 'Product') {
          return {
            title: data.name ?? undefined,
            address: data.address?.streetAddress
              ?? `${data.address?.addressLocality ?? ''}, ${data.address?.addressRegion ?? ''}`.trim(),
            price: typeof data.offers?.price === 'number' ? data.offers.price : parsePrice(data.offers?.price),
            acreage: parseAcreageFromDescription(data.description),
            url,
          };
        }
      } catch { /* fall through to DOM parsing */ }
    }

    // Fallback: DOM-based extraction
    const title = document.querySelector('h1')?.textContent?.trim();
    const priceEl = document.querySelector('[class*="price"], [data-testid*="price"]');
    const addressEl = document.querySelector('[class*="address"], [class*="location"]');

    if (!title && !addressEl) return null;

    return {
      title: title ?? undefined,
      address: addressEl?.textContent?.trim() ?? undefined,
      price: priceEl ? parsePrice(priceEl.textContent) : undefined,
      acreage: title ? parseAcreageFromDescription(title) : undefined,
      url,
    };
  },
};

function parsePrice(text?: string | null): number | undefined {
  if (!text) return undefined;
  const match = text.replace(/,/g, '').match(/\$?([\d.]+)/);
  return match ? Number(match[1]) : undefined;
}

function parseAcreageFromDescription(text?: string | null): number | undefined {
  if (!text) return undefined;
  const match = text.match(/([\d.]+)\s*(?:acres?|ac)/i);
  return match ? Number(match[1]) : undefined;
}
```

**Note:** DOM selectors will need validation against live LandWatch pages. JSON-LD is the preferred extraction method as it's more stable than CSS selectors.

- [ ] **Step 2: Commit**

```bash
git add src/parsers/landwatch.ts
git commit -m "add LandWatch site parser for extension"
```

---

## Task 3: Additional Site Parsers (Zillow, LandFlip, Craigslist)

**Files:**
- Create: `src/parsers/zillow.ts`
- Create: `src/parsers/landflip.ts`
- Create: `src/parsers/craigslist.ts`

- [ ] **Step 1: Implement Zillow parser**

Create `src/parsers/zillow.ts`:

```typescript
import type { ParsedListing, SiteParser } from './types';

export const zillowParser: SiteParser = {
  name: 'zillow',
  urlPatterns: [
    /zillow\.com\/homedetails\//,
  ],

  parse(document: Document, url: string): ParsedListing | null {
    // Zillow uses Next.js with __NEXT_DATA__ containing structured listing data
    const nextData = document.getElementById('__NEXT_DATA__');
    if (nextData?.textContent) {
      try {
        const data = JSON.parse(nextData.textContent);
        const property = data?.props?.pageProps?.initialReduxState?.gdp?.building
          ?? data?.props?.pageProps?.property;
        if (property) {
          return {
            title: property.streetAddress ?? property.address?.streetAddress,
            address: property.fullAddress ?? `${property.streetAddress ?? ''}, ${property.city ?? ''}, ${property.state ?? ''} ${property.zipcode ?? ''}`.trim(),
            price: property.price ?? property.listPrice,
            acreage: property.lotSize ? property.lotSize / 43560 : undefined, // sqft to acres
            url,
          };
        }
      } catch { /* fall through */ }
    }

    // Fallback DOM parsing
    const address = document.querySelector('[data-testid="bdp-detail-address"]')?.textContent?.trim();
    const price = document.querySelector('[data-testid="price"]')?.textContent;

    if (!address) return null;

    return {
      address,
      price: price ? parsePrice(price) : undefined,
      url,
    };
  },
};

function parsePrice(text?: string | null): number | undefined {
  if (!text) return undefined;
  const match = text.replace(/,/g, '').match(/\$?([\d.]+)/);
  return match ? Number(match[1]) : undefined;
}
```

- [ ] **Step 2: Implement LandFlip parser**

Create `src/parsers/landflip.ts`:

```typescript
import type { ParsedListing, SiteParser } from './types';

export const landflipParser: SiteParser = {
  name: 'landflip',
  urlPatterns: [
    /landflip\.com\/land\//,
  ],

  parse(document: Document, url: string): ParsedListing | null {
    // LandFlip uses JSON-LD
    const jsonLd = document.querySelector('script[type="application/ld+json"]');
    if (jsonLd?.textContent) {
      try {
        const data = JSON.parse(jsonLd.textContent);
        const listing = Array.isArray(data) ? data.find((d: Record<string, unknown>) => d['@type'] === 'RealEstateListing') : data;
        if (listing) {
          return {
            title: listing.name,
            address: typeof listing.address === 'string' ? listing.address
              : `${listing.address?.addressLocality ?? ''}, ${listing.address?.addressRegion ?? ''}`.trim(),
            price: listing.offers?.price ? Number(listing.offers.price) : undefined,
            acreage: parseAcreage(listing.description ?? listing.name),
            url,
          };
        }
      } catch { /* fall through */ }
    }

    return null;
  },
};

function parseAcreage(text?: string | null): number | undefined {
  if (!text) return undefined;
  const match = text.match(/([\d.]+)\s*(?:acres?|ac)/i);
  return match ? Number(match[1]) : undefined;
}
```

- [ ] **Step 3: Implement Craigslist parser**

Create `src/parsers/craigslist.ts`:

```typescript
import type { ParsedListing, SiteParser } from './types';

export const craigslistParser: SiteParser = {
  name: 'craigslist',
  urlPatterns: [
    /craigslist\.org\/.*\/rea\//,   // Real estate
    /craigslist\.org\/.*\/grd\//,   // Farm+Garden
  ],

  parse(document: Document, url: string): ParsedListing | null {
    const title = document.getElementById('titletextonly')?.textContent?.trim();
    const priceEl = document.querySelector('.price');
    const bodyEl = document.getElementById('postingbody');

    // Craigslist posting location
    const mapEl = document.getElementById('map');
    const lat = mapEl?.getAttribute('data-latitude');
    const lng = mapEl?.getAttribute('data-longitude');

    // Try to extract address from posting body
    const bodyText = bodyEl?.textContent ?? '';
    const addressMatch = bodyText.match(/(\d+\s+[\w\s]+(?:Road|Rd|Street|St|Avenue|Ave|Drive|Dr|Lane|Ln|Way|Highway|Hwy)[^,]*,\s*\w+(?:\s+\w+)*,?\s*[A-Z]{2}\s*\d{5}?)/i);

    if (!title) return null;

    return {
      title,
      address: addressMatch?.[1] ?? undefined,
      price: priceEl ? parsePrice(priceEl.textContent) : undefined,
      acreage: parseAcreage(title + ' ' + bodyText),
      url,
    };
  },
};

function parsePrice(text?: string | null): number | undefined {
  if (!text) return undefined;
  const match = text.replace(/,/g, '').match(/\$?([\d.]+)/);
  return match ? Number(match[1]) : undefined;
}

function parseAcreage(text: string): number | undefined {
  const match = text.match(/([\d.]+)\s*(?:acres?|ac)/i);
  return match ? Number(match[1]) : undefined;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/parsers/
git commit -m "add Zillow, LandFlip, Craigslist site parsers"
```

---

## Task 4: API Client + Auth

**Files:**
- Create: `src/api/auth.ts`
- Create: `src/api/client.ts`

- [ ] **Step 1: Implement auth token storage**

Create `src/api/auth.ts`:

```typescript
const TOKEN_KEY = 'landmatch_tokens';

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

export async function getTokens(): Promise<StoredTokens | null> {
  const result = await chrome.storage.local.get(TOKEN_KEY);
  return result[TOKEN_KEY] ?? null;
}

export async function setTokens(tokens: StoredTokens): Promise<void> {
  await chrome.storage.local.set({ [TOKEN_KEY]: tokens });
}

export async function clearTokens(): Promise<void> {
  await chrome.storage.local.remove(TOKEN_KEY);
}
```

- [ ] **Step 2: Implement API client**

Create `src/api/client.ts`:

```typescript
import { getTokens, setTokens } from './auth';

const API_BASE = 'http://localhost:3000'; // TODO: configurable

export async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const tokens = await getTokens();
  if (!tokens) return { ok: false, error: 'Not authenticated. Please log in via the LandMatch dashboard.' };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${tokens.accessToken}`,
  };

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    // Try refresh
    const refreshRes = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });

    if (refreshRes.ok) {
      const refreshData = await refreshRes.json();
      await setTokens(refreshData.data);
      // Retry original request
      headers.Authorization = `Bearer ${refreshData.data.accessToken}`;
      const retryRes = await fetch(`${API_BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
      const retryJson = await retryRes.json();
      return retryJson;
    }

    return { ok: false, error: 'Session expired. Please log in again.' };
  }

  return res.json();
}

export async function enrichListing(input: {
  address: string;
  price?: number;
  acreage?: number;
  url?: string;
  title?: string;
}) {
  return apiRequest<unknown>('POST', '/api/v1/listings/enrich', input);
}

export async function saveListing(listingId: string) {
  return apiRequest<unknown>('POST', `/api/v1/listings/${listingId}/save`);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/api/
git commit -m "add extension API client with auth and token refresh"
```

---

## Task 5: Content Script + Overlay Panel

**Files:**
- Create: `src/content/overlay.ts`
- Modify: `src/content/index.ts`

- [ ] **Step 1: Implement overlay panel renderer**

Create `src/content/overlay.ts`:

```typescript
const PANEL_ID = 'landmatch-overlay';

interface OverlayData {
  homesteadScore: number;
  components: Array<{ name: string; score: number; label: string }>;
  listingId?: string;
}

export function showOverlay(data: OverlayData): void {
  removeOverlay();

  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.style.cssText = `
    position: fixed; top: 80px; right: 20px; z-index: 999999;
    width: 320px; max-height: 80vh; overflow-y: auto;
    background: #0F1410; border: 1px solid #2A3A2C; border-radius: 12px;
    padding: 20px; font-family: -apple-system, sans-serif;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5); color: #E8E4DC;
  `;

  // Header
  const header = document.createElement('div');
  header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;';
  header.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px;">
      <span style="font-family: serif; font-weight: 700; font-size: 16px; color: #D4A843;">L</span>
      <span style="font-family: serif; font-size: 14px; font-weight: 600;">Land<span style="color: #D4A843;">Match</span></span>
    </div>
    <button id="landmatch-close" style="background: none; border: none; color: #6B7B6E; cursor: pointer; font-size: 18px;">×</button>
  `;
  panel.appendChild(header);

  // Score ring
  const scoreSection = document.createElement('div');
  scoreSection.style.cssText = 'text-align: center; margin-bottom: 16px;';
  const scoreColor = data.homesteadScore >= 70 ? '#7DB88A' : data.homesteadScore >= 40 ? '#D4A843' : '#DC2626';
  scoreSection.innerHTML = `
    <div style="font-size: 42px; font-weight: 700; color: ${scoreColor};">${data.homesteadScore}</div>
    <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: #6B7B6E;">Homestead Score</div>
  `;
  panel.appendChild(scoreSection);

  // Components
  for (const comp of data.components) {
    const row = document.createElement('div');
    row.style.cssText = 'margin-bottom: 10px; padding: 8px 0; border-top: 1px solid #1A2A1C;';
    const barColor = comp.score >= 70 ? '#7DB88A' : comp.score >= 40 ? '#D4A843' : '#DC2626';
    row.innerHTML = `
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <span style="font-size: 12px; font-weight: 500;">${comp.name}</span>
        <span style="font-size: 12px; font-weight: 600; color: ${barColor};">${comp.score}</span>
      </div>
      <div style="height: 3px; background: #1A2A1C; border-radius: 2px; overflow: hidden;">
        <div style="height: 100%; width: ${comp.score}%; background: ${barColor}; border-radius: 2px;"></div>
      </div>
      <div style="font-size: 10px; color: #6B7B6E; margin-top: 3px;">${comp.label}</div>
    `;
    panel.appendChild(row);
  }

  // Save button
  if (data.listingId) {
    const saveBtn = document.createElement('button');
    saveBtn.id = 'landmatch-save';
    saveBtn.textContent = 'Save to Dashboard';
    saveBtn.style.cssText = `
      width: 100%; margin-top: 12px; padding: 10px; border: 1px solid #D4A843;
      background: rgba(212,168,67,0.1); color: #D4A843; border-radius: 6px;
      font-size: 13px; font-weight: 600; cursor: pointer;
    `;
    panel.appendChild(saveBtn);
  }

  document.body.appendChild(panel);

  // Event listeners
  document.getElementById('landmatch-close')?.addEventListener('click', removeOverlay);
}

export function showLoading(): void {
  removeOverlay();
  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.style.cssText = `
    position: fixed; top: 80px; right: 20px; z-index: 999999;
    width: 320px; background: #0F1410; border: 1px solid #2A3A2C; border-radius: 12px;
    padding: 20px; text-align: center; color: #6B7B6E; font-size: 13px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  `;
  panel.textContent = 'Enriching listing...';
  document.body.appendChild(panel);
}

export function showError(message: string): void {
  removeOverlay();
  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.style.cssText = `
    position: fixed; top: 80px; right: 20px; z-index: 999999;
    width: 320px; background: #0F1410; border: 1px solid #DC2626; border-radius: 12px;
    padding: 20px; color: #DC2626; font-size: 13px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  `;
  panel.textContent = message;
  document.body.appendChild(panel);
}

export function removeOverlay(): void {
  document.getElementById(PANEL_ID)?.remove();
}
```

- [ ] **Step 2: Implement content script entrypoint**

Create/update `src/content/index.ts`:

```typescript
import { enrichListing, saveListing } from '../api/client';
import { findParser } from '../parsers/registry';
import { showError, showLoading, showOverlay } from './overlay';

async function main() {
  const parser = findParser(window.location.href);
  if (!parser) return; // Not a recognized listing page

  const parsed = parser.parse(document, window.location.href);
  if (!parsed?.address) return; // Couldn't extract enough data

  showLoading();

  const result = await enrichListing({
    address: parsed.address,
    price: parsed.price,
    acreage: parsed.acreage,
    url: parsed.url,
    title: parsed.title,
  });

  if (!result.ok) {
    showError(result.error);
    return;
  }

  const data = result.data as Record<string, unknown>;
  const homestead = data.homestead as Record<string, { score: number; label: string }> | undefined;
  const homesteadScore = (data.homesteadScore as number) ?? 0;
  const listingId = data.listingId as string | undefined;

  const components = homestead
    ? Object.entries(homestead).map(([key, val]) => ({
        name: formatComponentName(key),
        score: val.score,
        label: val.label,
      }))
    : [];

  showOverlay({ homesteadScore, components, listingId });

  // Wire save button
  document.getElementById('landmatch-save')?.addEventListener('click', async () => {
    if (!listingId) return;
    const saveResult = await saveListing(listingId);
    const btn = document.getElementById('landmatch-save') as HTMLButtonElement | null;
    if (btn) {
      btn.textContent = saveResult.ok ? 'Saved!' : 'Error saving';
      btn.disabled = true;
    }
  });
}

function formatComponentName(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim();
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
```

- [ ] **Step 3: Update manifest.json content script matches**

Add the supported sites to the content script matches in `manifest.json`:

```json
{
  "content_scripts": [
    {
      "matches": [
        "*://*.landwatch.com/*",
        "*://*.zillow.com/homedetails/*",
        "*://*.landflip.com/land/*",
        "*://*.craigslist.org/*"
      ],
      "js": ["content/index.js"]
    }
  ],
  "permissions": ["storage"],
  "host_permissions": [
    "http://localhost:3000/*"
  ]
}
```

- [ ] **Step 4: Commit**

```bash
git add src/content/ manifest.json
git commit -m "add content script with overlay panel and site detection"
```

---

## Task 6: API Enhancement — Return Homestead Scores from Enrich Endpoint

**Files:**
- Modify: `apps/server/src/services/listingService.ts`
- Modify: `apps/server/src/routes/listings.ts`

This task modifies the server to return homestead scores in the enrich response so the extension can display them.

- [ ] **Step 1: Update listingService to compute homestead scores**

In `apps/server/src/services/listingService.ts`, after enrichment, compute homestead scores:

```typescript
import { homesteadScore, mapEnrichmentResult } from '@landmatch/scoring';

// In enrichAndPersist(), after enrichment + DB insert:
const enrichmentData = mapEnrichmentResult(enrichResult);
const listingData = { price: input.price, acreage: input.acreage, latitude: geocode.lat, longitude: geocode.lng };
const scoring = homesteadScore(listingData, enrichmentData, {}); // Empty criteria = no hard filters

// Include in response
return ok({
  listing: row,
  enrichment: enrichRow,
  homesteadScore: scoring.homesteadScore,
  homestead: scoring.homestead,
});
```

- [ ] **Step 2: Run server tests**

Run: `pnpm --filter @landmatch/server test:run`
Expected: Tests pass (may need mock updates for new response shape).

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/services/listingService.ts apps/server/src/routes/listings.ts
git commit -m "return homestead scores from enrich endpoint for extension"
```

---

## Task 7: Final Verification

- [ ] **Step 1: Build extension**

Run the extension build command (e.g., `pnpm --filter extension build`).
Expected: Builds without errors.

- [ ] **Step 2: Manual test**

Load the unpacked extension in Chrome, navigate to a LandWatch listing page, verify:
1. Parser detects the page
2. Loading state shows
3. Enrichment data returns
4. Overlay panel renders with homestead scores
5. Save button works

- [ ] **Step 3: Run full lint**

Run: `pnpm lint`
Expected: All packages pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "verify chrome extension enhancement: overlay, parsers, API integration"
```
