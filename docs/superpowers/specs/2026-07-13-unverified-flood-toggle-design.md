# Per-profile "include unverified flood zones" toggle — Design

**Bead**: land-match-86r
**Date**: 2026-07-13
**Status**: Approved

## Problem

land-match-8zd made `floodZoneExclude` fail closed on null flood zones: any profile
with a flood exclusion never matches a listing whose `femaFloodZone` is null. Null
covers both adapter failures (heal via re-enrichment) and parcels FEMA genuinely
never mapped (null forever). Rural counties — the core market — are where FIRM
coverage is spottiest, so flood-excluding profiles silently lose all matches in
FEMA-unmapped counties.

## Solution

An opt-in per-profile boolean, `includeUnverifiedFloodZone`, that lets one user
accept unverified-flood listings without weakening the fail-closed default for
everyone else. Matches admitted this way carry a visible "Flood zone unverified"
badge so the accepted risk stays visible.

## Design

### API schema (`packages/api/src/searchProfiles.ts`)

Add to `SearchCriteria`:

```ts
includeUnverifiedFloodZone: z.boolean().optional(),
```

Optional, not `.default(false)`: absent means false, and existing stored criteria
JSONB rows remain valid untouched. `@landmatch/scoring` re-exports this type from
`@landmatch/api`, so the scorer and server pick it up with no further type changes.

### Scorer (`packages/scoring/src/scorer.ts`)

In the existing hard-filter branch for a null flood zone, push
`flood_zone_unverified` only when `!criteria.includeUnverifiedFloodZone`.

Scope of the toggle — unverified only:
- Null zone + toggle on → passes the hard filter.
- Zone present and in `floodZoneExclude` → still fails `flood_zone_excluded`,
  toggle or not. The toggle never admits a *known* excluded zone.
- Component scoring unchanged: `scoreFlood` already returns a neutral 50 for a
  missing zone.

### Frontend

**Form state** (`apps/frontend/src/ui/profile/formState.ts`):
- `criteria.includeUnverifiedFloodZone: boolean`, default `false` in
  `DEFAULT_FORM_STATE`.
- `profileToFormState`: `c.includeUnverifiedFloodZone ?? false`.
- `formStateToPayload`: pass through.

**Profile editor** (`apps/frontend/src/ui/profile/ProfileEditorScreen.tsx`):
a switch in the flood section, helper text along the lines of "Include listings
where FEMA flood data is unavailable — common in rural counties".

**Badge** (frontend-only): matches are fetched per-profile, so the match list
screen has the profile's criteria in hand. When the profile has a non-empty
`floodZoneExclude`, the toggle is on, and `match.floodZone` is null, show a
"Flood zone unverified" badge on `MatchRow` and the match detail view.
`MatchItem` already carries `floodZone` — no API change.

## Testing

- Scorer: toggled profile passes the hard filter on a null zone; default profile
  still fails `flood_zone_unverified`; toggled profile still fails
  `flood_zone_excluded` on an explicitly excluded zone.
- Form state: round-trip (`profileToFormState` ↔ `formStateToPayload`) preserves
  the flag; absent flag maps to false.
- Badge predicate: shown only for (exclusions present ∧ toggle on ∧ null zone).

## Out of scope

- No DB migration — criteria live in JSONB.
- No change to re-enrichment/rescore behavior; healed flood data rescores as today.
