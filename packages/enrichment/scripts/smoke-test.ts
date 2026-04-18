/**
 * Smoke test — hits real vendor APIs with a known coordinate to verify
 * endpoints are reachable and returning the expected shape.
 *
 * Usage: pnpm --filter @landmatch/enrichment smoke-test
 */

const TEST_COORD = { lat: 43.1, lng: -72.78 }; // Jamaica, VT
const TEST_ADDRESS = '98 Gleason Farm Lane, Jamaica, VT 05343';

interface Check {
  name: string;
  run: () => Promise<void>;
}

const checks: Check[] = [
  {
    name: 'Census Geocoder',
    async run() {
      const url = new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress');
      url.searchParams.set('address', TEST_ADDRESS);
      url.searchParams.set('benchmark', 'Public_AR_Current');
      url.searchParams.set('format', 'json');

      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      assertStatus(res, 'Census Geocoder');

      const json = await res.json();
      assert(json?.result?.addressMatches, 'Missing result.addressMatches');
    },
  },
  {
    name: 'Nominatim Geocoder',
    async run() {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.set('q', TEST_ADDRESS);
      url.searchParams.set('format', 'json');
      url.searchParams.set('limit', '1');
      url.searchParams.set('countrycodes', 'us');

      const res = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
        headers: { 'User-Agent': 'LandMatch/1.0' },
      });
      assertStatus(res, 'Nominatim');

      const json = await res.json();
      assert(Array.isArray(json), 'Expected array response');
    },
  },
  {
    name: 'USDA Soil Data Access',
    async run() {
      const query = `
        SELECT TOP 1 c.comppct_r, c.nirrcapcl, c.drainagecl, cht.texcl
        FROM sacatalog AS sc
        INNER JOIN legend AS l ON sc.areasymbol = l.areasymbol
        INNER JOIN mapunit AS mu ON l.lkey = mu.lkey
        INNER JOIN component AS c ON mu.mukey = c.mukey
        LEFT JOIN chorizon AS ch ON c.cokey = ch.cokey
        LEFT JOIN chtexturegrp AS chtg ON ch.chkey = chtg.chkey
        LEFT JOIN chtexture AS cht ON chtg.chtgkey = cht.chtgkey
        WHERE mu.mukey IN (
          SELECT * FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('POINT(${TEST_COORD.lng} ${TEST_COORD.lat})')
        )
        AND c.comppct_r IS NOT NULL
        ORDER BY c.comppct_r DESC
      `.trim();

      const res = await fetch('https://sdmdataaccess.sc.egov.usda.gov/tabular/post.rest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `query=${encodeURIComponent(query)}&format=JSON`,
        signal: AbortSignal.timeout(15_000),
      });
      assertStatus(res, 'USDA SDM');

      const json = await res.json();
      assert(Array.isArray(json?.Table), 'Missing Table array in response');
      assert(json.Table.length > 0, 'Table array is empty — no soil data for test coordinate');
    },
  },
  {
    name: 'FEMA NFHL',
    async run() {
      const url = new URL('https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query');
      url.searchParams.set('geometry', JSON.stringify({ x: TEST_COORD.lng, y: TEST_COORD.lat }));
      url.searchParams.set('geometryType', 'esriGeometryPoint');
      url.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
      url.searchParams.set('outFields', 'FLD_ZONE,ZONE_SUBTY');
      url.searchParams.set('f', 'json');
      url.searchParams.set('inSR', '4326');

      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      assertStatus(res, 'FEMA NFHL');

      const json = await res.json();
      assert(Array.isArray(json?.features), 'Missing features array in response');
    },
  },
];

function assertStatus(res: Response, label: string): void {
  if (!res.ok) throw new Error(`${label} returned HTTP ${res.status}`);
}

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log(`Smoke-testing vendor APIs with coord (${TEST_COORD.lat}, ${TEST_COORD.lng})\n`);

  let failures = 0;

  for (const check of checks) {
    try {
      await check.run();
      console.log(`  ✓ ${check.name}`);
    } catch (e) {
      failures++;
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  ✗ ${check.name} — ${msg}`);
    }
  }

  console.log(`\n${checks.length - failures}/${checks.length} passed`);

  if (failures > 0) process.exit(1);
}

main();
