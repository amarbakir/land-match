export interface RegionBounds {
  name: string;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export const REGIONS: Record<string, RegionBounds> = {
  northeast: {
    name: 'Northeast US',
    minLat: 37.0,
    maxLat: 47.5,
    minLng: -80.5,
    maxLng: -66.9,
  },
  conus: {
    name: 'Continental US',
    minLat: 24.5,
    maxLat: 49.5,
    minLng: -125.0,
    maxLng: -66.9,
  },
};

export type SourceName = 'prism' | 'elevation' | 'wetlands';
