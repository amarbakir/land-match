# LandMatch Launch Epics — Design Spec

**Date:** 2026-04-21

---

## Context

LandMatch pivots from RSS-based feed ingestion to a Chrome extension + self-hosted spatial data model. The extension meets users where they browse (LandWatch, Zillow, Craigslist, etc.) and overlays homestead-specific enrichment data inline. The backend shifts from external API calls to PostGIS-backed spatial queries against self-hosted national datasets, clipped to NE US initially with a region-parameterized pipeline that can expand to full US.

RSS feed adapters (`packages/feeds/`) are dead code and will be cleaned up.

---

## Epic 1: Profile Editor UI (P1 — Independent)

**Spec:** `docs/superpowers/specs/2026-04-20-profile-editor-design.md`

Already fully designed. Frontend components wiring into existing backend CRUD (`POST/GET/PUT/DELETE /api/v1/search-profiles`).

**Scope:**
- `ProfileEditorScreen` with section components (Geography, Acreage, Price, Soil, Flood, Zoning, Infra, Weights, Alerts)
- Shared primitives: `SectionCard`, `ToggleButtonRow`, `RangeSlider`, `DualRangeSlider`
- Sidebar wiring (edit icon, new profile button)
- `DeleteProfileModal`
- API hooks: `apiPut`, `apiDelete`, `useCreateSearchProfile`, `useUpdateSearchProfile`, `useDeleteSearchProfile`

**Dependency:** None — pure frontend work.

---

## Epic 2: Enrichment Expansion (P1 — Sequential with Epic 3)

**Goal:** Add PostGIS infrastructure and self-hosted spatial datasets. Replace external API enrichment with local spatial queries.

### Infrastructure

- Add PostGIS extension to Postgres (Docker + hosted)
- New package: `packages/geodata/` — ETL pipeline for downloading, clipping, and loading national datasets

### ETL Pipeline Design

Region-parameterized, idempotent, re-runnable for data refreshes:

```
pnpm --filter @landmatch/geodata load --region=northeast --source=prism
```

Three distinct steps per source:
1. **Download** — fetch raw national dataset (GeoTIFF, shapefile, etc.)
2. **Clip** — extract by bounding box or state list (start NE US, later `--region=conus`)
3. **Load** — import into PostGIS tables with spatial indexes

Expanding to full US = same scripts, wider bounding box. Data refreshes = re-run with new vintage.

### Self-Hosted Datasets

| Dataset | Format | NE US Size (est.) | Query Method |
|---------|--------|-------------------|--------------|
| PRISM 30-yr normals (precip, temp, frost-free) | GeoTIFF rasters | ~500MB | `ST_Value(raster, point)` |
| USGS 3DEP elevation | GeoTIFF raster | ~1-2GB at 1/3 arc-sec | `ST_Value(raster, point)` |
| USFWS NWI wetlands | Shapefile/GeoJSON | ~200-500MB | `ST_Intersects(geom, point buffer)` |
| USDA SSURGO soils | Shapefile + tabular | ~1-2GB | `ST_Intersects(geom, point)` |
| FEMA NFHL flood zones | Shapefile | ~500MB-1GB | `ST_Intersects(geom, point)` |

**Note:** SSURGO and FEMA are currently queried via external APIs. Migrating them to self-hosted is a natural follow-up once PostGIS infra exists — same pipeline, same query pattern, eliminates last external enrichment dependencies.

### Adapter Changes

New adapters implement the existing `EnrichmentAdapter<T>` interface but query PostGIS instead of external APIs:

```
enrich(coords) → PostGIS spatial query → return result
```

Same interface, local implementation. Much faster, no rate limits, no API downtime.

### Data Model Changes

Extend `EnrichmentResult` type in `packages/enrichment/`:
- `climate?: ClimateData` — frost-free days, avg annual precip, avg min/max temp, growing season length
- `wetlands?: WetlandsData` — wetland type codes + descriptions within parcel buffer
- `elevation?: ElevationData` — elevation (ft), derived slope (%)

Extend `enrichments` table to store the new data types alongside existing soil + flood.

---

## Epic 3: Homestead Scoring Model (P1 — Depends on Epic 2)

**Goal:** Add homestead-specific translated scores that answer the questions buyers actually ask. Wraps the existing generic scorer as a superset.

### Score Components

Each component produces a 0-100 score with a plain-language template label:

| Component | Inputs (from enrichment) | What It Answers |
|-----------|-------------------------|-----------------|
| **Garden Viability** | Soil capability class, drainage class, soil texture | "Can I grow food here?" |
| **Growing Season** | PRISM frost-free days, avg min temp | "How long can I grow?" |
| **Water Availability** | PRISM annual precip, wetlands presence, drainage | "Will I have enough water?" |
| **Flood Safety** | FEMA flood zone, elevation, slope | "Will it flood?" |
| **Septic Feasibility** | Soil texture, drainage class, slope, wetlands | "Will septic pass a perc test?" |
| **Building Suitability** | Slope, elevation, flood zone | "Can I build on this?" |
| **Firewood Potential** | PRISM precip + temp (forest growth proxy), acreage | "Can I heat with wood?" |

### Example Output

```
Garden Viability: 82 — "Class II loam, well-drained — excellent garden soil"
Growing Season: 71 — "158 frost-free days, zone 6a"
Flood Safety: 90 — "Zone X, 1200ft elevation, 8% slope"
Septic Feasibility: 55 — "Moderate — clay loam may need engineered system"
```

### Composite Score

Overall **Homestead Score** = weighted average of components:
- Default weights tuned for homesteader use case
- Users adjust weights via profile editor (Epic 1)
- Hard filters remain (e.g., exclude flood zone A/AE = score 0)

### Architecture

Extend `packages/scoring/`:
- Individual pure score functions per component (easily testable)
- `homesteadScore()` orchestrator that calls all components + computes weighted composite
- Wraps existing generic `scoreListing()` — generic scorer remains available
- Plain-language labels via deterministic template strings (not LLM — fast and predictable)

---

## Epic 4: Chrome Extension Enhancement (P2 — Depends on Epics 2 + 3)

**Goal:** Enhance the existing Chrome extension to overlay full homestead scores inline on listing pages and support one-click save to dashboard.

### Capabilities

1. **Listing page detection** — recognize listing pages on major land sites (LandWatch, Zillow, Land.com, LandFlip, Craigslist, Facebook Marketplace)
2. **Address extraction + geocoding** — parse address from page DOM, send to backend
3. **Inline enrichment overlay** — display homestead score + component breakdown on the listing page
4. **One-click save** — import listing metadata + enrichment to user's dashboard
5. **Auth** — user must be logged in to save (extension talks to same API)

### Architecture

- Content scripts detect listing pages via URL pattern + DOM selectors
- Calls existing `POST /api/v1/listings/enrich` endpoint
- Renders floating panel or sidebar with scores
- Site-specific parsers (one per supported site) extract address, price, acreage, title from DOM
- Parsers isolated behind common interface — adding new sites = new parser

### Deferred

- Offline/cached enrichment
- Extension popup with saved listings list
- Notifications from extension

---

## Follow-Up Research Ticket (P3 — Async/Ongoing)

Items that need research but are out of scope for launch:

- **Regrid parcel data** — evaluate county-level self-serve purchases vs. API licensing for parcel boundaries + ownership
- **MLS feed access** — Spark Platform API at ~$50/mo per MLS, broker sponsorship path, NJ license path
- **Migrating soil + flood to self-hosted** — replace external USDA/FEMA API calls with local SSURGO + NFHL data once PostGIS infra exists
- **Distance-to-amenities scoring** — POI data source for ag supply stores, hospitals, etc.
- **Well water feasibility** — USGS groundwater data availability
- **Re-enriching existing listings** — backfill older listings with new enrichment sources

---

## Execution Plan

| Epic | Parallelism | Dependency |
|------|-------------|------------|
| 1: Profile Editor | Independent — can run alongside anything | None |
| 2: Enrichment Expansion | Sequential with Epic 3 | None |
| 3: Homestead Scoring | Sequential after Epic 2 | Epic 2 |
| 4: Chrome Extension | After Epics 2 + 3 complete | Epics 2 + 3 |
| Follow-up Research | Async/ongoing | None |

Epic 1 (profile editor) runs in parallel with Epics 2 + 3 since it's pure frontend touching different parts of the codebase.
