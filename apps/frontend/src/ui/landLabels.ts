export const SOIL_CLASS_LABELS: Record<number, string> = {
  1: 'Prime farmland',
  2: 'Good, moderate limitations',
  3: 'Severe limitations',
  4: 'Very severe limitations',
  5: 'Not suited without improvement',
  6: 'Too steep or wet for cultivation',
  7: 'Very steep, eroded, or shallow',
  8: 'Not suited for cultivation',
};

export const FLOOD_ZONE_LABELS: Record<string, string> = {
  X: 'Minimal risk',
  A: 'High risk',
  AE: 'High risk (BFE determined)',
  AH: 'High risk (shallow flooding)',
  AO: 'High risk (sheet flow)',
  VE: 'Coastal high risk',
  D: 'Undetermined risk',
};
