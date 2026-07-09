// Digest frequency windows — the single source for both encodings of the
// policy: the SQL eligibility filter in alertRepo.claimPending and the
// service-side race backstop alertDeliveryService.isWindowElapsed. 'instant'
// (and any unknown frequency) is deliberately absent: no window, always due.
export const FREQUENCY_WINDOW_HOURS: Partial<Record<string, number>> = {
  daily: 24,
  weekly: 168,
};
