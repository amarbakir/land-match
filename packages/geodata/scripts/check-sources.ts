/**
 * Check whether all upstream data endpoints are reachable.
 * Sends HEAD requests to every download URL without fetching the full file.
 *
 * Usage: pnpm --filter @landmatch/geodata check-sources
 */

import { STATES_BY_REGION } from '../src/sources/wetlands';

const PRISM_BASE = 'https://data.prism.oregonstate.edu/normals/us/4km';
const NWI_BASE = 'https://documentst.ecosphere.fws.gov/wetlands/data/State-Downloads';
const ELEVATION_REST = 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer';

interface Endpoint {
  name: string;
  url: string;
  method?: 'HEAD' | 'GET';
}

const PRISM_ANNUAL: Endpoint[] = [
  { name: 'PRISM tmin annual', url: `${PRISM_BASE}/tmin/monthly/prism_tmin_us_25m_2020_avg_30y.zip` },
  { name: 'PRISM tmax annual', url: `${PRISM_BASE}/tmax/monthly/prism_tmax_us_25m_2020_avg_30y.zip` },
  { name: 'PRISM ppt annual', url: `${PRISM_BASE}/ppt/monthly/prism_ppt_us_25m_2020_avg_30y.zip` },
];

const PRISM_MONTHLY: Endpoint[] = Array.from({ length: 12 }, (_, i) => {
  const month = String(i + 1).padStart(2, '0');
  return {
    name: `PRISM tmin month ${month}`,
    url: `${PRISM_BASE}/tmin/monthly/prism_tmin_us_25m_2020${month}_avg_30y.zip`,
  };
});

const NWI: Endpoint[] = (STATES_BY_REGION.northeast ?? []).map((state) => ({
  name: `NWI ${state}`,
  url: `${NWI_BASE}/${state}_geodatabase_wetlands.zip`,
}));

const ELEVATION: Endpoint[] = [
  {
    name: 'USGS 3DEP Image Server',
    url: `${ELEVATION_REST}?f=json`,
    method: 'GET',
  },
];

const ALL_ENDPOINTS = [...PRISM_ANNUAL, ...PRISM_MONTHLY, ...NWI, ...ELEVATION];

async function check(endpoint: Endpoint): Promise<{ name: string; ok: boolean; status: number | string }> {
  try {
    const resp = await fetch(endpoint.url, {
      method: endpoint.method ?? 'HEAD',
      signal: AbortSignal.timeout(15_000),
    });
    return { name: endpoint.name, ok: resp.ok, status: resp.status };
  } catch (err) {
    return { name: endpoint.name, ok: false, status: (err as Error).message };
  }
}

async function main() {
  console.log(`Checking ${ALL_ENDPOINTS.length} data source endpoints...\n`);

  // Check in batches of 5 to avoid overwhelming servers
  const results: Awaited<ReturnType<typeof check>>[] = [];
  for (let i = 0; i < ALL_ENDPOINTS.length; i += 5) {
    const batch = ALL_ENDPOINTS.slice(i, i + 5);
    const batchResults = await Promise.all(batch.map(check));
    results.push(...batchResults);
  }

  let failures = 0;
  for (const r of results) {
    if (r.ok) {
      console.log(`  \u2713 ${r.name}`);
    } else {
      failures++;
      console.log(`  \u2717 ${r.name} \u2014 ${r.status}`);
    }
  }

  console.log(`\n${results.length - failures}/${results.length} reachable`);
  if (failures > 0) process.exit(1);
}

main();
