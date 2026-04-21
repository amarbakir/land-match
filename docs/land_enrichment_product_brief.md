# Land Enrichment SaaS — Product Research Brief
*Research summary from discovery conversation, April 2026*

---

## Concept
A browser extension + web platform that hydrates farm/land listings across the web (LandWatch, Zillow, Craigslist, Facebook Marketplace, etc.) with agricultural enrichment data — soil capability, flood risk, frost-free days, drainage, climate normals — surfaced inline on the listing page. Users can save/import listings to a personal dashboard. The extension solves cold-start by crowdsourcing listing data through user browsing behavior rather than requiring a proprietary listing feed.

**Target user:** Individual homestead buyers and small-scale farmers researching land in the NE US — not agents or institutional buyers.

---

## Data Stack (all free/public)

| Layer | Source | Access |
|---|---|---|
| Soil capability, drainage, series | USDA SSURGO | Free — USDA Web Soil Survey API / Soil Data Access |
| Frost-free days, precip, temp normals | PRISM (Oregon State) | Free — 30-yr gridded normals, no use restriction |
| Flood zone designation | FEMA NFHL | Free — ArcGIS REST API |
| Wetlands | USFWS NWI | Free — GeoJSON download |
| Elevation / slope | USGS 3DEP | Free |
| Parcel boundaries + ownership | Regrid (licensed) | Self-serve by county via app.regrid.com/store; nationwide API starts ~$80K/yr |
| Live MLS listings | Spark Platform API | ~$50/month per MLS; requires broker sponsor or MLS approval |

**Key validation:** loam.land is a working reference implementation of the SSURGO + PRISM stack — same data, no listing integration. Their UX confirmed the full data pipeline and shows consumer appetite for plain-language soil interpretation.

---

## Competitive Landscape

- **CoStar / LandWatch / Land.com** — dominant listing network, no meaningful enrichment layer on listings themselves
- **Land id (formerly MapRight)** — pro GIS tool with soil/flood overlays; aimed at brokers, not buyers; no browser extension distribution
- **loam.land** — standalone soil lookup (SSURGO + PRISM); no listing integration, no homestead-specific scoring
- **Regrid** — parcel intelligence layer; no listings, no enrichment scores

**Gap:** Nobody has built homestead-specific scoring (growing season length, water availability, septic feasibility, firewood potential, distance to agricultural supply) for the individual buyer, delivered where they already browse.

---

## MLS / Listing Access Path

1. **Short-term:** Extension enriches listings on existing sites without needing a listing feed. Users import listings one-click into dashboard.
2. **MLS access:** Spark Platform API at ~$50/month per MLS. Requires a licensed broker to sponsor the API key, or MLS direct approval as a tech vendor.
3. **Broker license path:** NJ salesperson license (~$1,500–$2,000, ~3 months) + license parking arrangement under a broker (~$50–$150/month) = MLS member access without a 3-year wait for broker's license.
4. **Long-term:** Build direct county parcel ingestion pipeline for NE US (~200–300 counties), replacing Regrid licensing as product scales.

---

## Differentiation Strategy

The wedge is **homestead-specific scoring**, not raw data. SSURGO gives you soil capability class (designed for commodity ag). What homesteaders need is a translated score: "Can this parcel support a market garden? Is the growing season long enough? Will septic pass a perc test? Is there firewood potential?" No existing product computes this translation.

The extension distribution model is also differentiated — Land id requires the user to go to Land id. The extension meets the user on LandWatch at 11pm.

---

## MVP Build Order

1. Chrome extension that detects land listing pages and overlays SSURGO + FEMA + PRISM data by geocoding the listing address
2. One-click "Save to Dashboard" that imports listing metadata + enrichment scores
3. Dashboard with saved listings, sortable/filterable by homestead score
4. Homestead scoring model (weighted composite of soil capability, frost-free days, flood risk, drainage class, slope)
5. MLS feed integration via Spark API (requires broker relationship first)
6. Direct county parcel ingestion to replace Regrid as volume grows

---

## Open Questions for Development

- ToS exposure: does extension DOM-parsing of CoStar/LandWatch pages constitute circumvention even with user-initiated import? Needs legal review before public launch.
- PRISM API access: confirm whether 30-yr normals are available via a queryable REST endpoint or require bulk download + self-hosting
- Regrid county file format: confirm GeoJSON vs Shapefile delivery and spatial join approach for parcel-level SSURGO intersection
- Broker relationship: identify a land broker in NJ/NY/CT willing to sponsor API access in exchange for platform exposure
