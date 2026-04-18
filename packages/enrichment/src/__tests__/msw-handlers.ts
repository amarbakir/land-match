import { http, HttpResponse } from 'msw';

export const MOCK_COORDS = { lat: 35.6762, lng: -83.4388 };
export const MOCK_ADDRESS = '123 Mountain Rd, Gatlinburg, TN 37738';

const CENSUS_URL = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const SDM_URL = 'https://sdmdataaccess.sc.egov.usda.gov/tabular/post.rest';
const NFHL_URL = 'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query';

export const handlers = [
  // Census Geocoder — happy path
  http.get(CENSUS_URL, () => {
    return HttpResponse.json({
      result: {
        addressMatches: [
          {
            coordinates: { x: MOCK_COORDS.lng, y: MOCK_COORDS.lat },
            matchedAddress: MOCK_ADDRESS,
          },
        ],
      },
    });
  }),

  // Nominatim — happy path (used as fallback)
  http.get(NOMINATIM_URL, () => {
    return HttpResponse.json([
      {
        lat: String(MOCK_COORDS.lat),
        lon: String(MOCK_COORDS.lng),
        display_name: MOCK_ADDRESS,
      },
    ]);
  }),

  // USDA Soil Data Access — happy path
  // row: [comppct_r, nirrcapcl, drainagecl, texcl]
  // '2e' → parseInt → 2 → CAPABILITY_SUITABILITY[2]
  http.post(SDM_URL, () => {
    return HttpResponse.json({
      Table: [[85, '2e', 'Well drained', 'Silt loam']],
    });
  }),

  // FEMA NFHL — happy path (zone X = minimal risk)
  http.get(NFHL_URL, () => {
    return HttpResponse.json({
      features: [
        {
          attributes: {
            FLD_ZONE: 'X',
            ZONE_SUBTY: null,
          },
        },
      ],
    });
  }),
];

// Override handlers for failure scenarios
export const overrides = {
  censusFail: http.get(CENSUS_URL, () => {
    return new HttpResponse(null, { status: 500 });
  }),

  censusNoMatches: http.get(CENSUS_URL, () => {
    return HttpResponse.json({
      result: { addressMatches: [] },
    });
  }),

  nominatimEmpty: http.get(NOMINATIM_URL, () => {
    return HttpResponse.json([]);
  }),

  soilFail: http.post(SDM_URL, () => {
    return new HttpResponse(null, { status: 500 });
  }),

  soilServiceUnavailable: http.post(SDM_URL, () => {
    return new HttpResponse(null, { status: 503 });
  }),

  floodFail: http.get(NFHL_URL, () => {
    return new HttpResponse(null, { status: 500 });
  }),

  floodServiceUnavailable: http.get(NFHL_URL, () => {
    return new HttpResponse(null, { status: 503 });
  }),
};
