# Phase 5: Dashboard & Browse Experience — Design Spec

**Bead:** land-match-dkw.3 — Build dashboard and browse/filter screens
**Date:** 2026-04-19

## Context

Phases 1–4 built the backend: auth, enrichment pipeline, scoring engine, search profiles, and email alerts. The frontend has auth screens, route guards, and a basic search/report prototype. This bead builds the primary user-facing dashboard — a 3-panel app shell where users browse scored property matches, filter by criteria, and shortlist or dismiss listings.

## Scope

Build the full app shell (sidebar nav + topbar + content area) with the match inbox as the default view. The detail pane and profile editor are stubs — later beads (dkw.4 and dkw.5) fill them in.

### In scope
- 3-panel desktop layout matching the design prototype in `designs/lm/`
- Sidebar nav: workspace views (Matches/Shortlist/Dismissed), profile list with match counts, account links, user footer
- Topbar: breadcrumbs, coordinate chip, search + bell icon buttons
- Match list pane: profile picker dropdown, filter chips (All/Unread/≥80/★), scrollable match rows
- Match rows: score ring, title, meta, AI summary, tags, read/unread/selected states
- Shortlist and dismiss actions with backend persistence
- Read tracking (mark as read on selection) with backend persistence
- Shortlist and Dismissed views (card grid layout)
- Empty states with topographic SVG illustration
- New backend endpoint: `GET /search-profiles/:id/matches` with pagination and filters
- New backend endpoint: `PATCH /scores/:id` for status/read updates
- New backend endpoint: `GET /search-profiles/counts` for sidebar badge counts
- DB migration: add `status` and `read_at` columns to scores table

### Out of scope
- Tweaks panel (density, score visualization, visual tone, accent color)
- Property detail report (dkw.4)
- Profile editor (dkw.5)
- Mobile native layout (responsive breakpoints for web only)
- Topo visual tone mode

## Data Model

### DB Changes — `scores` table

Add two columns:

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `status` | `TEXT NOT NULL` | `'inbox'` | One of: `inbox`, `shortlisted`, `dismissed` |
| `read_at` | `TIMESTAMP` | `NULL` | Null = unread; set when user first views the match |

These columns live on `scores` because each score represents one listing-profile match — the natural entity for user interaction state.

### New Zod Schemas (`@landmatch/api`)

**`MatchItem`** — A scored listing with enrichment summary:
```
{
  scoreId: string          // scores.id
  listingId: string        // listings.id
  overallScore: number     // 0-100
  componentScores: {       // jsonb from scores
    soil, flood, price, acreage, zoning, geography, infrastructure, climate
  }
  llmSummary: string | null
  status: 'inbox' | 'shortlisted' | 'dismissed'
  readAt: string | null    // ISO timestamp
  scoredAt: string         // ISO timestamp

  // Listing fields
  title: string | null
  address: string
  price: number | null
  acreage: number | null
  source: string | null
  url: string | null
  lat: number | null
  lng: number | null

  // Enrichment summary (flattened for list display)
  soilClass: number | null
  soilClassLabel: string | null
  primeFarmland: boolean | null
  floodZone: string | null
  zoning: string | null
}
```

**`MatchFilters`** — Query parameters:
```
{
  status?: 'inbox' | 'shortlisted' | 'dismissed'
  minScore?: number        // default 0
  sort?: 'score' | 'date' | 'price' | 'acreage'  // default 'score'
  sortDir?: 'asc' | 'desc' // default 'desc'
  limit?: number           // default 20, max 100
  offset?: number          // default 0
}
```

**`PaginatedMatches`**:
```
{
  items: MatchItem[]
  total: number
  limit: number
  offset: number
}
```

**`UpdateMatchStatus`** — Body for PATCH /scores/:id:
```
{
  status?: 'inbox' | 'shortlisted' | 'dismissed'
  markAsRead?: boolean     // if true, server sets read_at = now()
}
```

**`ProfileCounts`** — Response for badge counts:
```
{
  profileId: string
  total: number
  unread: number
  shortlisted: number
}[]
```

## API Endpoints

### `GET /api/v1/search-profiles/:id/matches`

Returns paginated matches for a search profile. Requires auth. Validates profile ownership.

- Query params: `status`, `minScore`, `sort`, `sortDir`, `limit`, `offset`
- Response: `Result<PaginatedMatches>`
- The repo query joins scores → listings → enrichments in one query

### `PATCH /api/v1/scores/:id`

Updates a score's status or read_at. Requires auth. Validates that the score belongs to the user (via score → search_profile → user ownership).

- Body: `UpdateMatchStatus`
- Response: `Result<{ scoreId: string; status: string; readAt: string | null }>`

### `GET /api/v1/search-profiles/counts`

Returns badge counts (total, unread, shortlisted) for all of the authenticated user's active profiles. Used by the sidebar.

- Response: `Result<ProfileCounts>`

## Frontend Architecture

### Route Structure

The app shell replaces the existing `(app)/search/index.tsx` screen. All dashboard state lives in URL search params.

```
app/(app)/
  _layout.tsx        → AppShell (sidebar + topbar + content area)
  index.tsx          → Inbox view (MatchListPane + detail stub)
  shortlist.tsx      → Shortlist card grid view
  dismissed.tsx      → Dismissed card grid view
  report/index.tsx   → (existing) single enrichment form — kept for now
```

URL params on index: `?profile=<id>&match=<scoreId>`

### Components

All new components live in `src/ui/dashboard/`.

| Component | File | Purpose |
|-----------|------|---------|
| `AppShell` | `AppShell.tsx` | 3-panel layout. Reads profile/match from URL params. Responsive breakpoints. |
| `SidebarNav` | `SidebarNav.tsx` | Workspace views + profile list + account links + user footer. |
| `Topbar` | `Topbar.tsx` | Breadcrumbs + coord chip + icon buttons. |
| `MatchListPane` | `MatchListPane.tsx` | Profile picker + filter chips + scrollable match list. |
| `MatchRow` | `MatchRow.tsx` | Single match in the list. Score ring + meta + summary + tags. |
| `ScoreRing` | `ScoreRing.tsx` | SVG circular progress with color tiers. |
| `FilterChips` | `FilterChips.tsx` | Toggle filter bar with counts. |
| `Tag` | `Tag.tsx` | Monospace badge with tone variants. |
| `ShortlistView` | `ShortlistView.tsx` | Card grid for shortlisted/dismissed properties. |
| `EmptyState` | `EmptyState.tsx` | Topographic SVG + title + subtitle. |
| `Icon` | `Icon.tsx` | SVG icon components matching the design prototype set. |

### React Query Hooks (`src/api/hooks.ts`)

| Hook | Endpoint | Notes |
|------|----------|-------|
| `useSearchProfiles()` | `GET /search-profiles` | List user's profiles for sidebar |
| `useProfileCounts()` | `GET /search-profiles/counts` | Badge counts, polls every 60s |
| `useProfileMatches(profileId, filters)` | `GET /search-profiles/:id/matches` | Paginated matches, refetches on filter change |
| `useUpdateMatchStatus()` | `PATCH /scores/:id` | Mutation with optimistic update for shortlist/dismiss/read |

### Data Flow

1. **App loads** → `useSearchProfiles()` fetches profiles, `useProfileCounts()` fetches badge counts
2. **User selects profile** → URL param updates → `useProfileMatches(profileId)` fires
3. **User clicks match** → URL param updates → `useUpdateMatchStatus()` marks as read (optimistic) → detail pane shows stub
4. **User clicks ★ shortlist** → `useUpdateMatchStatus({ status: 'shortlisted' })` → optimistic update removes from inbox, adds to shortlist count
5. **User clicks ✕ dismiss** → `useUpdateMatchStatus({ status: 'dismissed' })` → optimistic update removes from inbox
6. **Filter chip change** → local filter state updates → `useProfileMatches` refetches with new params

### Visual Design

Follow the design prototype exactly. Key visual tokens:

- **Colors**: bg `#0F1410`, card `#1A2118`, border `#2C3E2D`, text `#E8DDD3`, dim `#9BA393`, accent `#D4A843`, success `#7DB88A`, clay `#C4956A`
- **Typography**: Inter (sans), IBM Plex Mono (mono), Fraunces (serif)
- **Score tiers**: ≥80 success, ≥60 clay, ≥40 gold, <40 danger
- **Brand mark**: gradient "L" logo (accent → success) + "Land*Match*" wordmark
- **Icons**: 24x24 viewBox, 1.6px stroke, currentColor, rounded caps/joins
- **Nav items**: 6px border-radius, accent left-border when active, mono count badges
- **Profile dots**: 6px green circles with pulse animation
- **Unread dots**: 8px accent circles on score rings
- **Match rows**: selected = gold left border + card bg; read = 0.65 opacity
- **Filter chips**: mono font, 10px, active = accent bg + dark text
- **Tags**: mono 9px, uppercase, tone-colored (green/gold/clay/default)

## Testing

- **Backend unit tests**: scoreRepo query returns correct joins and filters; PATCH validates ownership
- **Frontend**: manual testing against dev server with seeded data
- Verification: `pnpm dev`, navigate to dashboard, confirm profiles load, matches appear, filters work, shortlist/dismiss persists across refresh

## Migration Path

This bead sets up the shell. Subsequent beads plug in:
- **dkw.4**: Replace detail stub with full property report component
- **dkw.5**: Wire profile editor and alert settings into sidebar nav routes
