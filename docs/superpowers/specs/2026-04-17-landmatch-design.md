# LandMatch — Product & Technical Design

## Overview

LandMatch is an intelligent property search tool for back-to-land buyers (homesteaders, small farmers, off-grid seekers). It enriches rural land listings with agricultural viability data — USDA soil quality, FEMA flood zones, parcel zoning, and climate risk — then scores and alerts users when matching properties appear.

Starts as a personal tool for the founder's own land search, architected for multi-user from day one, with a clear path to commercialization.

## Two Deliverables

1. **Template repo** — reusable monorepo starter extracted from compair patterns
2. **LandMatch** — scaffolded from template, the actual product

---

## Architecture

### Monorepo Layout

```
land-match/
├── apps/
│   ├── frontend/        — Expo + React Native Web (web first, mobile later)
│   └── server/          — Hono API (enrichment, alerts, auth)
├── packages/
│   ├── api/             — Zod schemas + shared types (API contract)
│   ├── db/              — Drizzle schema + migrations (Postgres)
│   ├── enrichment/      — Data source adapters: soil, flood, parcel, climate API clients
│   ├── scoring/         — Deterministic scoring engine + LLM summary generation
│   └── config/          — Shared config, feature flags, deep links
├── infra/               — Deploy scripts
├── sst.config.ts        — SST v4 (Lambda dev / Fargate prod)
├── docker-compose.yml   — Local Postgres 16
└── CLAUDE.md / AGENTS.md
```

### Server Layer Pattern

Routes → Services → Repos → Domain (same as compair). Result<T> pattern throughout. Namespace service imports.

### Data Flow Pipeline

```
Ingest (RSS/manual) → Geocode → Enrich (Soil + Flood + Parcel + Climate) → Score → Match → Alert
```

---

## Data Model

### users
- id, email, name, phone
- auth_provider, password_hash
- subscription_tier (free | pro | premium)
- notification_prefs (jsonb)
- created_at, updated_at

### search_profiles
- id, user_id → users
- name (e.g., "Hudson Valley homestead")
- is_active, alert_frequency (instant | daily | weekly)
- alert_threshold (default: 60)
- criteria (jsonb — see Search Criteria Shape below)
- created_at, updated_at

### listings
- id, external_id, source (landwatch | land.com | manual)
- url, title, description
- price, acreage
- address, city, county, state, zip
- latitude, longitude
- raw_data (jsonb — original listing payload)
- enrichment_status (pending | enriching | complete | failed)
- first_seen_at, last_seen_at, delisted_at

### enrichments
- id, listing_id → listings (1:1)
- **Soil:** soil_capability_class (I-VIII), soil_drainage_class, soil_texture, soil_suitability_ratings (jsonb)
- **Flood:** fema_flood_zone (X | A | AE | VE | ...), flood_zone_description
- **Parcel (feature-flagged):** zoning_code, zoning_description, verified_acreage, parcel_geometry (jsonb)
- **Climate (feature-flagged):** fire_risk_score, flood_risk_score, heat_risk_score, drought_risk_score
- enriched_at, sources_used (text[])

### scores
- id, listing_id → listings, search_profile_id → search_profiles
- overall_score (0-100)
- component_scores (jsonb: { soil: 85, flood: 100, price: 72, ... })
- llm_summary (text — generated verdict)
- scored_at

### alerts
- id, user_id → users, search_profile_id → search_profiles, listing_id → listings, score_id → scores
- channel (email | sms | push)
- status (pending | sent | failed)
- sent_at, created_at

### Search Criteria Shape (jsonb)

```typescript
{
  acreage: { min: 3, max: 20 },
  price: { min: 0, max: 450000 },
  soilCapabilityClass: { max: 3 },           // Class I-III only
  floodZoneExclude: ["A", "AE", "VE"],       // no high-risk zones
  geography: {
    type: "radius",                           // or "counties" or "driveTime"
    center: { lat: 41.7, lng: -74.0 },
    radiusMiles: 60
    // driveTime uses isochrone API (e.g., OpenRouteService free tier) — Phase 5+
  },
  zoning: ["agricultural", "residential-agricultural"],
  infrastructure: ["well", "septic", "electric"],  // preferred, not required
  climateRisk: {                              // feature-flagged
    maxFireRisk: 5,
    maxFloodRisk: 5
  },
  weights: {                                  // optional: customize scoring
    soil: 1.5, flood: 2.0, price: 1.5,
    acreage: 1.0, zoning: 1.0, geography: 1.0,
    infrastructure: 0.5, climate: 0.8
  }
}
```

### Design Notes

- Enrichments are 1:1 with listings — enrichment data is universal, scored per-user
- Scores are per listing × search profile — same listing scored differently per user's criteria
- Criteria stored as jsonb, validated by Zod at the API layer — evolves without migrations
- Listings track lifecycle (first_seen_at / last_seen_at / delisted_at)

---

## Enrichment Pipeline

### Stages

| # | Stage | API | Cost | Feature Flag |
|---|-------|-----|------|-------------|
| 1 | Geocode | Census Geocoder (free, no key) / Nominatim fallback | Free | Always on |
| 2 | Soil | USDA Soil Data Access (SDM) — SOAP/REST, no key | Free | Always on |
| 3 | Flood | FEMA NFHL — ArcGIS REST service | Free | Always on |
| 4 | Parcel | Regrid (Loveland) — REST API, free tier ~1K/mo | Freemium | `ENABLE_PARCEL_DATA` |
| 5 | Climate | First Street Foundation — REST API, subscription | Paid | `ENABLE_CLIMATE_RISK` |

### Adapter Architecture (packages/enrichment/)

Each data source is an isolated adapter with a uniform interface. Adapters encapsulate HTTP I/O to external APIs — the scoring package downstream is pure/deterministic.

```typescript
interface EnrichmentAdapter<T> {
  name: string;
  enrich(coords: LatLng): Promise<Result<T>>;
  isAvailable(): boolean;  // feature flag check
}
```

Pipeline orchestrator runs available adapters in parallel via `Promise.allSettled`. Partial success is acceptable — failed sources retry later.

### Resilience

- **Partial success**: Save what we have, score with available data, retry failed sources
- **Caching**: Soil/flood/parcel cached 30-90 days. Climate risk annually.
- **Rate limiting**: Queue-based processing with configurable concurrency per adapter
- **Zoning normalization**: County codes are wildly inconsistent — need a mapping layer (AG-1, A-R, RA → "agricultural")
- **Third-party data tools**: Services like Apify (e.g., soil/climate enrichment actors) and webscraper.io (e.g., Realtor.com scrapers) exist as commodity plumbing. Not needed for MVP — we call the same free public APIs directly and use RSS for ingestion. However, the adapter architecture supports swapping in these tools as implementations if our own adapters hit scaling issues or API pain points (e.g., USDA SOAP quirks). Revisit in Phase 6 when expanding feed sources and scaling enrichment volume.

---

## Scoring Engine

### Step 1: Component Scores (0-100 each)

- **Soil**: Class I = 100, II = 85, III = 65, IV+ penalized
- **Flood**: Zone X = 100, B/C = 70, A/AE = 0 if excluded else 30
- **Price**: Linear scale within range, under-budget bonus, over-budget steep penalty
- **Acreage**: Within range = 100, tapering penalty outside
- **Zoning**: Matches preferred = 100, compatible = 60, incompatible = 0
- **Geography**: Within bounds = 100, edge = 70, outside = 0
- **Infrastructure**: Each match = +20 (additive, capped at 100)
- **Climate**: Below thresholds = 100, proportional penalty per exceeded threshold

### Step 2: Weighted Overall

Weighted average using user-customizable weights. Default weights: flood: 2.0, soil: 1.5, price: 1.5, acreage: 1.0, zoning: 1.0, geography: 1.0, climate: 0.8, infrastructure: 0.5.

**Hard filters** (binary pass/fail): Flood zone exclusions, max price, geography bounds. If failed, overall = 0.

### Step 3: LLM Summary

Only generated for listings scoring above alert threshold. Uses Claude Haiku for cost efficiency. Prompt includes all enrichment data, component scores, and user criteria. Output: 2-3 sentence verdict + action items.

Missing enrichment data scored as neutral (not penalizing), flagged in LLM summary as a data gap.

---

## Alert System

### Trigger Logic

After scoring completes, for each active search profile: if score >= threshold and not already alerted for this listing, generate LLM summary and queue alert.

### Delivery Channels

1. **Email (MVP)**: Resend or AWS SES. Rich HTML with enrichment summary, score breakdown, map link, listing link.
2. **SMS (Phase 2)**: Twilio. Short summary + link. High-score matches only.
3. **Push (Phase 3)**: Expo push notifications when mobile ships.

### Frequency Controls

- Instant: fires as scoring completes
- Daily digest: batch matches, send once/day
- Weekly digest: weekly roundup of top matches

Per search profile. Deduplication via alerts table — never alert same user for same listing per profile.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Expo + React Native Web, Expo Router, Tamagui, TanStack React Query v5 |
| Server | Hono v4 on Node.js, JWT auth (jose + bcryptjs), node-cron |
| Database | PostgreSQL 16 (Docker local, Supabase prod), Drizzle ORM |
| API Contract | Zod schemas in shared @landmatch/api package |
| Infrastructure | SST v4 (Lambda dev, Fargate prod), Resend (email), Anthropic API (Haiku) |
| Monorepo | pnpm workspaces |
| AI Config | CLAUDE.md hierarchy, AGENTS.md, beads integration |

---

## Template Repo (Deliverable 1)

Extracted from compair patterns. Includes:

- pnpm monorepo with apps/ + packages/ scaffold
- Hono server boilerplate with layered architecture (routes/services/repos), Result<T>, error codes
- Drizzle + docker-compose Postgres + migration scripts
- @template/api package with Zod schemas
- Expo + React Native Web + Tamagui + React Query frontend shell
- SST v4 config (Lambda + Fargate), deploy scripts
- CLAUDE.md hierarchy, AGENTS.md, .claude/ setup
- ESLint flat config, Prettier + import sorting, Vitest configs
- Beads integration (.beads/ directory, workflow docs)
- .nvmrc (Node 20), .npmrc (node-linker=hoisted)

---

## MVP Phases (Deliverable 2: LandMatch)

### Phase 1: Scaffold from Template
Create template repo → scaffold LandMatch. Set up monorepo, DB, auth, basic Hono server, Expo web shell. Beads project initialized. CLAUDE.md + AGENTS.md tailored to LandMatch domain.

**Outcome**: Running monorepo with auth, empty dashboard, health endpoint.

### Phase 2: Single-Listing Enrichment
Manual input: paste address or URL → geocode → USDA soil → FEMA flood → score → LLM summary → display report. Thin vertical slice proving every API integration.

**Outcome**: Paste an address, get an enriched property report with suitability score.

### Phase 3: Search Profiles + Feed Monitoring
Create search profiles with criteria. RSS feed ingestion from LandWatch/Land.com (start with one source). Cron job polls feeds, ingests new listings, runs enrichment pipeline. Criteria matching against search profiles.

**Outcome**: System automatically finds and enriches listings matching your criteria.

### Phase 4: Email Alerts
Wire up Resend for email delivery. Rich HTML email with enrichment summary, score breakdown, map link, listing link. Deduplication, frequency controls (instant/daily/weekly digest).

**Outcome**: Get an email when a matching property appears — full value prop realized.

### Phase 5: Dashboard & Browse Experience
Web dashboard: view enriched matches, browse/filter by agricultural criteria, view full property reports, manage search profiles and alert preferences.

**Outcome**: Full web app — the product someone would pay for.

### Phase 6: Expand & Commercialize
Feature-flagged paid APIs (Regrid, First Street). More feed sources. SMS alerts (Twilio). Subscription billing. On-demand property reports. Mobile app via Expo. B2B white-label exploration.

**Outcome**: Revenue-generating product with multiple monetization paths.
