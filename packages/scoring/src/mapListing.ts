import type { ListingData, ListingRow } from './types';

export function mapListingRow(row: ListingRow): ListingData {
  return {
    price: row.price ?? undefined,
    acreage: row.acreage ?? undefined,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
  };
}
