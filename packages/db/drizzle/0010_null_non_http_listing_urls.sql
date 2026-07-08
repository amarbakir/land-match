-- Null out listing URLs with non-web schemes (javascript:, data:, file:, ...)
-- stored before EnrichListingRequest validated schemes. Clients render these
-- as link targets, so any surviving row is a stored-XSS payload.
UPDATE listings SET url = NULL WHERE url IS NOT NULL AND url !~* '^https?://';
