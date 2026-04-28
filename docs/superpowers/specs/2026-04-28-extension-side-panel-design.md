# Extension Side Panel Design

## Context

The current extension injects a Preact overlay into LandWatch pages via shadow DOM. While shadow DOM provides isolation, this approach is inherently fragile: anchor elements change across site redesigns, SPA re-renders can destroy the injected host, layout conflicts arise with varying page structures, and any DOM manipulation is a maintenance burden. Moving all UI to the Chrome Side Panel eliminates these issues entirely.

## Design

### Architecture Overview

Three components with clean separation:

1. **Content Script** (thin extractor) — detects listing pages, extracts data from LD+JSON/DOM, sends to background. Zero DOM modification.
2. **Service Worker** (orchestrator) — receives extracted data, checks cache, calls API, routes results to the side panel.
3. **Side Panel** (full UI) — Preact app that receives enrichment results and renders the score card, save action, and auth UI.

### Content Script Changes

**Remove:**
- `src/content/overlay/inject.ts` (DOM injection, shadow DOM)
- `src/content/overlay/ScoreCard.tsx` (Preact component rendered in page)
- All references to `injectOverlay`, `showLoading`, `updateOverlay`, `showError`

**Keep:**
- `src/content/extractors/` (LandWatch LD+JSON extractor, registry)
- URL change detection (Navigation API + polling fallback)
- `enrichCurrentPage()` logic, but simplified: extract data → send `ENRICH_LISTING` to background → done

**New behavior:**
- On listing page detection: extract listing data, send message to background
- On non-listing page (e.g., LandWatch search results): send `PAGE_CHANGED` message with `{ isListing: false }` so panel can show idle state
- No DOM injection of any kind

### Manifest Changes

```json
{
  "side_panel": {
    "default_path": "sidepanel/index.html"
  },
  "action": {
    "default_title": "LandMatch"
  }
}
```

- Remove `action.default_popup` (no more popup)
- Add `side_panel` declaration
- Add `"sidePanel"` to permissions
- Service worker opens side panel on action click via `chrome.sidePanel.open()`

### Side Panel

**Location:** `src/sidepanel/`

**Files:**
- `index.html` — minimal shell with `<div id="app">`
- `main.tsx` — Preact render entry
- `SidePanel.tsx` — root component managing state
- `ScoreCard.tsx` — moved from overlay, adapted for panel context (no inline styles needed, can use a small CSS file)
- `LoginForm.tsx` — moved from popup
- `IdleState.tsx` — shown when not on a listing page

**State machine:**

```
┌─────────────┐   auth success    ┌─────────────┐
│  logged_out │ ────────────────→ │    idle      │
│ (LoginForm) │                   │ (IdleState)  │
└─────────────┘                   └──────┬───────┘
                                         │ listing detected
                                         ↓
                                  ┌─────────────┐
                                  │   loading   │
                                  │  (spinner)  │
                                  └──────┬───────┘
                                         │ enrichment result
                                         ↓
                                  ┌─────────────┐
                                  │   loaded    │
                                  │ (ScoreCard) │
                                  └──────┬───────┘
                                         │ navigation away
                                         ↓
                                       idle
```

**Communication:** Panel listens for messages from background:
- `ENRICHMENT_RESULT` — renders score card with data
- `ENRICHMENT_LOADING` — shows loading spinner
- `ENRICHMENT_ERROR` — shows error with retry
- `PAGE_CHANGED` — resets to idle if not a listing page
- `AUTH_STATUS` — updates auth state

Panel sends messages to background:
- `SAVE_LISTING` — save button clicked
- `LOGIN` / `LOGOUT` — auth actions
- `RETRY_ENRICH` — retry button clicked

### Service Worker Changes

**Current flow:**
1. Content script sends `ENRICH_LISTING`
2. Background enriches, returns result to content script sender

**New flow:**
1. Content script sends `ENRICH_LISTING`
2. Background enriches
3. Background sends result to side panel (via `chrome.runtime.sendMessage` or port)
4. Background still updates badge icon

**New responsibilities:**
- On action click: `chrome.sidePanel.open({ windowId })` (toggles panel)
- On `ENRICH_LISTING`: process enrichment, then broadcast `ENRICHMENT_RESULT` or `ENRICHMENT_ERROR` to panel
- Send `ENRICHMENT_LOADING` to panel immediately when enrichment starts
- Handle `RETRY_ENRICH` from panel (re-run enrichment for current URL)

**Panel lifecycle:**
- When panel opens: send current state (if there's a cached result for the active tab's URL, re-send it)
- Track active tab URL to detect when panel opens on an already-enriched page

### Popup Removal

- Delete `src/popup/` entirely (index.html, main.tsx, Popup.tsx)
- Auth UI (LoginForm) moves into the side panel as the logged-out state
- Remove `action.default_popup` from manifest

### What Stays Unchanged

- `src/shared/api-client.ts` — API wrapper
- `src/shared/auth.ts` — auth storage
- `src/shared/cache.ts` — enrichment cache
- `src/shared/config.ts` — API config
- `src/shared/scoring.ts` — score utilities
- `src/content/extractors/` — data extraction logic
- Badge score display on toolbar icon
- Background enrichment logic (cache check, API call, caching result)

### Build Changes

Vite config needs a new entry point for the side panel:
- `sidepanel/index.html` as an additional HTML entry (alongside content script and background)
- Side panel builds as a standard Preact app (not IIFE like content script)

## Verification

1. Load unpacked extension in Chrome
2. Click extension icon → side panel opens showing login form
3. Log in → panel shows idle state ("Browse a LandWatch listing to see enrichment data")
4. Navigate to a LandWatch listing → panel shows loading spinner → renders score card with homestead components
5. Click "Save to Dashboard" → listing appears in dashboard Saved view
6. Navigate away from listing → panel returns to idle
7. Navigate to another listing → panel shows new enrichment
8. Confirm: no elements injected into LandWatch page DOM (inspect Elements panel)
