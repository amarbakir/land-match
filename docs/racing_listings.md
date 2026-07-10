So what happens if 2 users import the same URL for a listing? What about the same listing but under different websites/URLs? How does our enrichment process handle that?

Two different situations, handled very differently:

Same URL, two different users

This is exactly what the dedupe work (land-match-0jx.10 + ckt) was built for:

1. User A enriches first — full pipeline runs (geocode + USDA/FEMA/etc.), producing an A-owned listing row plus its enrichment row.
2. User B enriches the same URL — B's client-side by-url pre-check misses because A's row is invisible to B (owned rows are private per the visibility policy). The request falls through to POST /enrich, where the server does a two-step lookup:
  - First, a visible row for the URL (B's own or an ownerless feed row) — returned as-is if found.
  - Otherwise, findEnrichmentSourceByUrl looks across all owners (deliberately ignoring visibility) for the newest row with enrichment data, preferring complete over newer-but-partial. If it finds A's row and the normalized addresses match, it copies A's vendor-derived enrichment into a fresh B-owned row — reusing A's geocoded coordinates, recomputing the homestead score from B's own price/acreage, and firing matching scoped to B's profiles only.

Net effect: B gets full enrichment instantly with zero vendor or geocoder quota burned, and never sees A's row itself — the rationale being that soil/flood/climate data is public vendor data, not user-private, while the row and its ownership stay separate. Guards on this path: if the addresses don't match (listing sites recycle URLs for different properties), B gets a fresh geocode + full pipeline instead of inheriting the wrong parcel's data; and the split external-id indexes let both users hold rows for the same Zillow/MLS identifier.

Same user submitting the same URL twice is stricter: they get their existing row back, and it's DB-enforced — a partial unique index on (user_id, url) means even two concurrent double-click requests converge on one row (the loser re-fetches the winner and merges its already-paid-for vendor results onto it).

Same property, different websites/URLs

This is not deduplicated at all today. URL is the only dedupe key, so the same physical parcel listed on Zillow and LandWatch produces two independent listing rows, each running its own full vendor fan-out (double the geocode/USDA/FEMA quota), and each scored independently — so a user whose profile matches could get two match entries and two alerts for what is physically one property. External IDs don't help because they're site-scoped (a zpid and a LandWatch ID share nothing).

The true identity for cross-site dedupe would be the parcel itself — normalized address or coordinates (we already have the address-normalization comparison built for the recycled-URL guard, and geocodes land on the same point), or Regrid parcel IDs once that feature-flagged adapter is enabled. But nothing implements that today, and I don't believe there's a bead tracking cross-site dedupe specifically — the nearest neighbors are land-match-0gc (feed-row vs user-submission merge semantics, deferred until feed ingestion exists) and the MLS epic. If cross-site duplicates matter to you before feed ingestion ships, it's worth filing as its own bead.