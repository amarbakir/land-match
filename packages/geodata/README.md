# @landmatch/geodata

ETL pipeline for loading geospatial data into PostGIS.

## Prerequisites

- PostGIS 3.4+ (`docker compose up` from repo root)
- GDAL tools: `gdalwarp`, `gdal_calc.py`, `gdal_merge.py`, `raster2pgsql`, `ogr2ogr`
- `curl` for downloading source data

## Quickstart

```bash
# 1. Check that upstream data sources are reachable
pnpm --filter @landmatch/geodata check-sources

# 2. Download source data
pnpm --filter @landmatch/geodata download:prism      # 15 ZIPs from Oregon State
pnpm --filter @landmatch/geodata download:wetlands    # 13 state geodatabases from FWS
pnpm --filter @landmatch/geodata download:elevation   # tiled from USGS 3DEP (~42 tiles, ~20 min)

# 3. Load into PostGIS
pnpm --filter @landmatch/geodata load --region=northeast

# 4. Validate loaded tables
pnpm --filter @landmatch/geodata smoke-test
```

## Data sources

| Source | Provider | Resolution | Download |
|--------|----------|------------|----------|
| PRISM climate normals | Oregon State / PRISM Group | 4km (2.5 arcmin) | `download:prism` |
| NWI wetlands | US Fish & Wildlife Service | Vector polygons | `download:wetlands` |
| 3DEP elevation | USGS National Map | ~100m (tiled REST) | `download:elevation` |

## Tables created

| Table | Type | Source |
|-------|------|--------|
| `prism_avg_min_temp` | Raster (°F) | PRISM annual tmin |
| `prism_avg_max_temp` | Raster (°F) | PRISM annual tmax |
| `prism_annual_precip` | Raster (inches) | PRISM annual ppt |
| `prism_tmin_month_01`..`12` | Raster (°F) | PRISM monthly tmin |
| `prism_frost_free_days` | Raster (days) | Derived from monthly tmin > 32°F |
| `prism_growing_season` | Raster (days) | Derived from monthly tmin > 40°F |
| `usgs_3dep_elevation` | Raster (meters) | USGS 3DEP |
| `nwi_wetlands` | Vector (MultiPolygon) | NWI geodatabases |

## Scripts

| Script | Purpose |
|--------|---------|
| `download:prism` | Download PRISM 30-year normals (15 ZIPs) |
| `download:wetlands` | Download NWI state geodatabases (13 ZIPs) |
| `download:elevation` | Download USGS 3DEP via tiled REST API |
| `check-sources` | HEAD-check all upstream endpoints |
| `load` | Run ETL pipeline (`--region`, `--source` flags) |
| `smoke-test` | Validate PostGIS tables with ST_Value queries |
| `test` / `test:run` | Unit tests (vitest) |
