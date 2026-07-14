# Per-profile "Include Unverified Flood Zones" Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in per-profile boolean `includeUnverifiedFloodZone` that lets a user accept listings with unverified (null) FEMA flood zones without weakening the fail-closed default, with a visible "Flood unverified" badge on admitted matches.

**Architecture:** One optional boolean on the `SearchCriteria` Zod schema (`@landmatch/api`, re-exported by `@landmatch/scoring`), a one-line guard in the scorer's null-flood-zone hard-filter branch, a switch in the profile editor, and a frontend-only badge derived from profile criteria + `match.floodZone == null`.

**Tech Stack:** Zod, Vitest, React Native/Tamagui (Expo), pnpm workspaces.

**Bead:** land-match-86r. **Spec:** `docs/superpowers/specs/2026-07-13-unverified-flood-toggle-design.md`

## Global Constraints

- Use `pnpm`, never npm/yarn. Prefix shell commands with `rtk` (e.g. `rtk vitest`, `rtk git commit`).
- Schema field is `includeUnverifiedFloodZone: z.boolean().optional()` — optional, NOT `.default(false)`; absent means false so stored criteria JSONB rows stay untouched.
- The toggle affects ONLY the `flood_zone_unverified` filter. A listing whose known zone is in `floodZoneExclude` must still fail `flood_zone_excluded` regardless of the toggle.
- No DB migration (criteria live in JSONB). No API response shape changes (`MatchItem` already carries `floodZone`).
- Commit messages: simple, reference the bead id, no Co-Authored-By lines.
- Per user checkpoints: invoke `/writing-meaningful-tests` before each new test block, `/simplify` before each commit, `/verify` + `/code-review` after the final task.

---

### Task 1: SearchCriteria schema field

**Files:**
- Modify: `packages/api/src/searchProfiles.ts:19-43` (the `SearchCriteria` object)
- Test: `packages/api/src/__tests__/searchProfiles.test.ts`

**Interfaces:**
- Produces: `SearchCriteria.includeUnverifiedFloodZone?: boolean` — consumed by Task 2 (scorer) and Task 3 (frontend form state). `@landmatch/scoring` re-exports this type from `@landmatch/api` (`packages/scoring/src/types.ts:1,28`), so no scoring-package type change is needed.

- [ ] **Step 1: Write the failing tests**

Append to the existing describe blocks in `packages/api/src/__tests__/searchProfiles.test.ts` (match the file's existing style — it tests Zod parses):

```ts
describe('SearchCriteria.includeUnverifiedFloodZone', () => {
  it('accepts a boolean and preserves it', () => {
    const parsed = SearchCriteria.parse({
      floodZoneExclude: ['A'],
      includeUnverifiedFloodZone: true,
    });
    expect(parsed.includeUnverifiedFloodZone).toBe(true);
  });

  it('is absent when omitted — existing stored criteria stay valid', () => {
    const parsed = SearchCriteria.parse({ floodZoneExclude: ['A'] });
    expect(parsed.includeUnverifiedFloodZone).toBeUndefined();
  });

  it('rejects non-boolean values', () => {
    const result = SearchCriteria.safeParse({ includeUnverifiedFloodZone: 'yes' });
    expect(result.success).toBe(false);
  });
});
```

If the test file doesn't already import `SearchCriteria`, add it to the existing import from `../searchProfiles`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `rtk pnpm --filter @landmatch/api test`
Expected: FAIL — `includeUnverifiedFloodZone` is stripped by Zod (unknown key), so the first test's `toBe(true)` fails.

- [ ] **Step 3: Add the schema field**

In `packages/api/src/searchProfiles.ts`, inside the `SearchCriteria` object, directly under the `floodZoneExclude` line:

```ts
  floodZoneExclude: filterList.optional(),
  // Opt-in: accept listings whose FEMA zone is unverified (null) despite a
  // flood exclusion. Optional, not default(false), so stored criteria rows
  // are untouched; absent means false (fail closed, land-match-8zd).
  includeUnverifiedFloodZone: z.boolean().optional(),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `rtk pnpm --filter @landmatch/api test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
rtk git add packages/api/src/searchProfiles.ts packages/api/src/__tests__/searchProfiles.test.ts
rtk git commit -m "land-match-86r: add includeUnverifiedFloodZone to SearchCriteria"
```

---

### Task 2: Scorer honors the toggle

**Files:**
- Modify: `packages/scoring/src/scorer.ts:12-23` (null-flood-zone hard-filter branch)
- Test: `packages/scoring/src/__tests__/scorer.test.ts` (existing `describe('floodZoneExclude with unverified flood zone')` block)

**Interfaces:**
- Consumes: `SearchCriteria.includeUnverifiedFloodZone?: boolean` from Task 1 (flows through the `@landmatch/api` re-export automatically).
- Produces: `scoreListing` passes the hard filter for null-zone listings when the toggle is true; everything else unchanged.

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe('floodZoneExclude with unverified flood zone')` block in `packages/scoring/src/__tests__/scorer.test.ts`:

```ts
  it('passes the hard filter on an unknown zone when the profile opts in', () => {
    const result = scoreListing(
      { price: 100_000, acreage: 10 },
      {}, // no floodZone
      { floodZoneExclude: ['A', 'AE', 'VE'], includeUnverifiedFloodZone: true },
    );

    expect(result.hardFilterFailed).toBe(false);
    expect(result.failedFilters).not.toContain('flood_zone_unverified');
    expect(result.componentScores.flood).toBe(50); // neutral component score, as before
  });

  it('opt-in never admits a KNOWN excluded zone', () => {
    const result = scoreListing(
      { price: 100_000 },
      { floodZone: 'AE' },
      { floodZoneExclude: ['AE'], includeUnverifiedFloodZone: true },
    );

    expect(result.hardFilterFailed).toBe(true);
    expect(result.failedFilters).toContain('flood_zone_excluded');
  });

  it('explicit false behaves like the fail-closed default', () => {
    const result = scoreListing(
      { price: 100_000 },
      {},
      { floodZoneExclude: ['A'], includeUnverifiedFloodZone: false },
    );

    expect(result.hardFilterFailed).toBe(true);
    expect(result.failedFilters).toContain('flood_zone_unverified');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `rtk pnpm --filter @landmatch/scoring test`
Expected: FAIL — first new test: `hardFilterFailed` is `true`.

- [ ] **Step 3: Add the guard**

In `packages/scoring/src/scorer.ts`, the null-zone branch currently reads:

```ts
    if (!enrichment.floodZone) {
      // Zone unknown = adapter failed or FEMA never mapped the parcel. The
      // user drew a hard line on flood risk — an unverified listing must not
      // cross it. Adapter failures heal via re-enrichment + rescoring;
      // genuinely FEMA-unmapped parcels stay excluded by design (product
      // call on land-match-8zd: unverifiable = fail closed).
      failedFilters.push('flood_zone_unverified');
    } else if (criteria.floodZoneExclude.includes(enrichment.floodZone)) {
```

Change to:

```ts
    if (!enrichment.floodZone) {
      // Zone unknown = adapter failed or FEMA never mapped the parcel. The
      // user drew a hard line on flood risk — an unverified listing must not
      // cross it unless this profile explicitly opted in (land-match-86r);
      // fail closed remains the default (land-match-8zd). Adapter failures
      // heal via re-enrichment + rescoring.
      if (!criteria.includeUnverifiedFloodZone) {
        failedFilters.push('flood_zone_unverified');
      }
    } else if (criteria.floodZoneExclude.includes(enrichment.floodZone)) {
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `rtk pnpm --filter @landmatch/scoring test`
Expected: PASS (including all pre-existing tests — the default path is unchanged).

- [ ] **Step 5: Commit**

```bash
rtk git add packages/scoring/src/scorer.ts packages/scoring/src/__tests__/scorer.test.ts
rtk git commit -m "land-match-86r: scorer skips flood_zone_unverified when profile opts in"
```

---

### Task 3: Profile editor form state + toggle UI

**Files:**
- Modify: `apps/frontend/src/ui/profile/formState.ts`
- Modify: `apps/frontend/src/ui/profile/FloodZoneSection.tsx`
- Modify: `apps/frontend/src/ui/profile/ProfileEditorScreen.tsx:215-218` (FloodZoneSection usage)
- Test: `apps/frontend/src/ui/profile/__tests__/form-state.test.ts`

**Interfaces:**
- Consumes: `SearchCriteria.includeUnverifiedFloodZone?: boolean` from Task 1.
- Produces: `FormState['criteria'].includeUnverifiedFloodZone: boolean` (non-optional in form state, default `false`); `FloodZoneSection` gains props `includeUnverified: boolean` and `onIncludeUnverifiedChange: (v: boolean) => void`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/frontend/src/ui/profile/__tests__/form-state.test.ts` (uses the file's existing `makeProfile` helper):

```ts
describe('includeUnverifiedFloodZone', () => {
  it('defaults to false when absent from criteria — fail-closed default preserved', () => {
    const state = profileToFormState(makeProfile({ criteria: {} }));
    expect(state.criteria.includeUnverifiedFloodZone).toBe(false);
  });

  it('round-trips true through form state and payload', () => {
    const state = profileToFormState(makeProfile({
      criteria: { floodZoneExclude: ['A'], includeUnverifiedFloodZone: true },
    }));
    expect(state.criteria.includeUnverifiedFloodZone).toBe(true);

    const payload = formStateToPayload(state);
    expect(payload.criteria.includeUnverifiedFloodZone).toBe(true);
  });

  it('DEFAULT_FORM_STATE starts with the toggle off', () => {
    expect(DEFAULT_FORM_STATE.criteria.includeUnverifiedFloodZone).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `rtk pnpm --filter frontend test` (if the filter name differs, check `apps/frontend/package.json` `name` field and use it)
Expected: FAIL — `includeUnverifiedFloodZone` is `undefined` in form state.

- [ ] **Step 3: Extend formState.ts**

In `apps/frontend/src/ui/profile/formState.ts`, three additions:

In the `FormState` interface, after `floodZoneExclude: string[];`:

```ts
    floodZoneExclude: string[];
    includeUnverifiedFloodZone: boolean;
```

In `DEFAULT_FORM_STATE.criteria`, after `floodZoneExclude: [],`:

```ts
    floodZoneExclude: [],
    includeUnverifiedFloodZone: false,
```

In `profileToFormState`, after `floodZoneExclude: c.floodZoneExclude ?? [],`:

```ts
      floodZoneExclude: c.floodZoneExclude ?? [],
      includeUnverifiedFloodZone: c.includeUnverifiedFloodZone ?? false,
```

In `formStateToPayload`'s criteria object, after `floodZoneExclude: state.criteria.floodZoneExclude,`:

```ts
      floodZoneExclude: state.criteria.floodZoneExclude,
      includeUnverifiedFloodZone: state.criteria.includeUnverifiedFloodZone,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `rtk pnpm --filter frontend test`
Expected: PASS

- [ ] **Step 5: Add the switch to FloodZoneSection**

Replace `apps/frontend/src/ui/profile/FloodZoneSection.tsx` with:

```tsx
import { Switch } from 'react-native';

import { Text, XStack, YStack } from 'tamagui';

import { colors } from '@/src/theme/colors';

import { SectionCard } from './SectionCard';
import { ToggleButtonRow, toggleValue } from './ToggleButtonRow';

const FLOOD_OPTIONS = [
  { value: 'X', label: 'Zone X' },
  { value: 'A', label: 'Zone A' },
  { value: 'AE', label: 'Zone AE' },
  { value: 'VE', label: 'Zone VE' },
  { value: 'D', label: 'Zone D' },
];

interface FloodZoneSectionProps {
  excluded: string[];
  includeUnverified: boolean;
  onChange: (excluded: string[]) => void;
  onIncludeUnverifiedChange: (value: boolean) => void;
}

export function FloodZoneSection({
  excluded,
  includeUnverified,
  onChange,
  onIncludeUnverifiedChange,
}: FloodZoneSectionProps) {
  return (
    <SectionCard title="Exclude flood zones" hint="HARD FILTER">
      <ToggleButtonRow
        options={FLOOD_OPTIONS}
        selected={excluded}
        onToggle={(v) => onChange(toggleValue(excluded, v))}
        variant="danger"
      />
      {excluded.length > 0 && (
        <XStack alignItems="center" justifyContent="space-between" gap={12} marginTop={12}>
          <YStack flex={1} gap={2}>
            <Text fontSize={12.5} color={colors.textPrimary}>
              Include unverified flood zones
            </Text>
            <Text fontSize={10.5} color={colors.textSecondary}>
              Show listings where FEMA flood data is unavailable — common in rural counties.
              They appear with a "Flood unverified" badge.
            </Text>
          </YStack>
          <Switch value={includeUnverified} onValueChange={onIncludeUnverifiedChange} />
        </XStack>
      )}
    </SectionCard>
  );
}
```

Note the switch row renders only when exclusions exist — with no flood exclusion the toggle has no effect, so showing it would mislead. Before writing, glance at `ProfileEditorScreen.tsx:142` to see how the existing `Switch` is styled (trackColor etc.) and mirror those props if any are set.

- [ ] **Step 6: Wire it in ProfileEditorScreen**

In `apps/frontend/src/ui/profile/ProfileEditorScreen.tsx`, the usage at line 215 currently reads:

```tsx
      <FloodZoneSection
        excluded={form.criteria.floodZoneExclude}
        onChange={(excluded) => updateCriteria('floodZoneExclude', excluded)}
      />
```

Change to:

```tsx
      <FloodZoneSection
        excluded={form.criteria.floodZoneExclude}
        includeUnverified={form.criteria.includeUnverifiedFloodZone}
        onChange={(excluded) => updateCriteria('floodZoneExclude', excluded)}
        onIncludeUnverifiedChange={(v) => updateCriteria('includeUnverifiedFloodZone', v)}
      />
```

(`updateCriteria` is the screen's existing criteria updater — confirm its exact name/signature at the call sites around line 216 and match it.)

- [ ] **Step 7: Typecheck and lint**

Run: `rtk pnpm --filter frontend exec tsc --noEmit && rtk pnpm lint`
Expected: clean. (If the frontend has no `tsc` script, `rtk pnpm build` from root covers it.)

- [ ] **Step 8: Commit**

```bash
rtk git add apps/frontend/src/ui/profile/
rtk git commit -m "land-match-86r: profile editor toggle for unverified flood zones"
```

---

### Task 4: "Flood unverified" badge on match rows and report

**Files:**
- Modify: `apps/frontend/src/ui/dashboard/MatchRow.tsx` (`deriveTags`, `MatchRowProps`, `MatchRow`)
- Modify: `apps/frontend/src/ui/dashboard/MatchListPane.tsx`
- Modify: `apps/frontend/src/ui/report/Report.tsx`
- Modify: `apps/frontend/app/(app)/index.tsx` (InboxView)
- Test: `apps/frontend/src/ui/dashboard/__tests__/pure-logic.test.ts`

**Interfaces:**
- Consumes: `SearchCriteria.includeUnverifiedFloodZone` (Task 1); `MatchItem.floodZone: string | null` (existing).
- Produces:
  - `profileAcceptsUnverifiedFlood(profile: SearchProfileResponse | null): boolean` exported from `MatchListPane.tsx`.
  - `deriveTags(match: MatchItem, floodUnverified?: boolean)` — second param defaults to `false`.
  - `MatchRow` and `Report` each gain an optional `floodUnverified?: boolean` prop.

- [ ] **Step 1: Write the failing tests**

Append to `apps/frontend/src/ui/dashboard/__tests__/pure-logic.test.ts` (uses the file's existing `makeMatch`/`makeProfile` helpers; add `profileAcceptsUnverifiedFlood` to the existing import from `../MatchListPane`):

```ts
describe('flood-unverified badge', () => {
  it('deriveTags adds the badge first when profile accepts unverified and zone is null', () => {
    const tags = deriveTags(makeMatch({ floodZone: null }), true);
    expect(tags[0]).toEqual({ label: 'Flood unverified', tone: 'clay' });
  });

  it('deriveTags omits the badge when the zone is known, even if the profile opted in', () => {
    const tags = deriveTags(makeMatch({ floodZone: 'X' }), true);
    expect(tags.some((t) => t.label === 'Flood unverified')).toBe(false);
  });

  it('deriveTags omits the badge by default — non-toggled profiles unchanged', () => {
    const tags = deriveTags(makeMatch({ floodZone: null }));
    expect(tags.some((t) => t.label === 'Flood unverified')).toBe(false);
  });

  it('profileAcceptsUnverifiedFlood requires both the toggle AND a flood exclusion', () => {
    expect(profileAcceptsUnverifiedFlood(makeProfile({
      floodZoneExclude: ['A'], includeUnverifiedFloodZone: true,
    }))).toBe(true);
    // Toggle without exclusions: the hard filter never fires, badge is noise
    expect(profileAcceptsUnverifiedFlood(makeProfile({
      floodZoneExclude: [], includeUnverifiedFloodZone: true,
    }))).toBe(false);
    expect(profileAcceptsUnverifiedFlood(makeProfile({
      floodZoneExclude: ['A'],
    }))).toBe(false);
    expect(profileAcceptsUnverifiedFlood(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `rtk pnpm --filter frontend test`
Expected: FAIL — `profileAcceptsUnverifiedFlood` is not exported; `deriveTags` ignores the second argument.

- [ ] **Step 3: Implement**

In `apps/frontend/src/ui/dashboard/MatchRow.tsx`:

```ts
export function deriveTags(match: MatchItem, floodUnverified = false): { label: string; tone: TagTone }[] {
  const tags: { label: string; tone: TagTone }[] = [];
  // First so the risk marker survives the 3-tag cap (land-match-86r)
  if (floodUnverified && match.floodZone == null) tags.push({ label: 'Flood unverified', tone: 'clay' });
  if (match.floodZone === 'X') tags.push({ label: 'Zone X', tone: 'green' });
  else if (match.floodZone) tags.push({ label: `Zone ${match.floodZone}`, tone: match.floodZone === 'A' || match.floodZone === 'AE' ? 'clay' : 'default' });
  if (match.primeFarmland) tags.push({ label: 'Prime Soil', tone: 'gold' });
  else if (match.soilClassLabel) tags.push({ label: match.soilClassLabel, tone: 'default' });
  return tags.slice(0, 3);
}
```

Add the prop to `MatchRowProps` and thread it through:

```ts
interface MatchRowProps {
  match: MatchItem;
  selected: boolean;
  shortlisted: boolean;
  floodUnverified?: boolean;
  onPress: () => void;
}

export function MatchRow({ match, selected, shortlisted, floodUnverified = false, onPress }: MatchRowProps) {
  const isUnread = !match.readAt;
  const tags = deriveTags(match, floodUnverified);
  // ...rest unchanged
```

In `apps/frontend/src/ui/dashboard/MatchListPane.tsx`, export the predicate and pass the prop:

```ts
// Badge predicate: the profile opted into unverified flood zones AND has a
// flood exclusion (without one the hard filter never fires, so the badge
// would be noise on every unmapped parcel).
export function profileAcceptsUnverifiedFlood(profile: SearchProfileResponse | null): boolean {
  return !!profile?.criteria.includeUnverifiedFloodZone
    && (profile.criteria.floodZoneExclude?.length ?? 0) > 0;
}
```

Inside the `MatchListPane` component body, before the return:

```ts
  const floodUnverified = profileAcceptsUnverifiedFlood(profile);
```

And in the match map:

```tsx
            <MatchRow
              key={match.scoreId}
              match={match}
              selected={selectedScoreId === match.scoreId}
              shortlisted={shortlistedIds.has(match.scoreId)}
              floodUnverified={floodUnverified}
              onPress={() => onSelectMatch(match)}
            />
```

In `apps/frontend/src/ui/report/Report.tsx`, accept and render the badge (import `XStack` from tamagui alongside the existing imports, and `Tag` from the dashboard):

```tsx
import { Tag } from '@/src/ui/dashboard/Tag';

interface ReportProps {
  scoreId: string;
  floodUnverified?: boolean;
}

export function Report({ scoreId, floodUnverified = false }: ReportProps) {
```

And directly after `<ReportHero match={match} />`:

```tsx
        <ReportHero match={match} />
        {floodUnverified && match.floodZone == null && (
          <XStack>
            <Tag label="Flood zone unverified — FEMA has no data for this parcel" tone="clay" />
          </XStack>
        )}
```

(Check `Tag.tsx` props before writing — if it doesn't take long labels well, use `label="Flood zone unverified"`.)

In `apps/frontend/app/(app)/index.tsx`, InboxView already has `profile` in scope; import the predicate and pass it to Report:

```tsx
import { MatchListPane, profileAcceptsUnverifiedFlood } from '@/src/ui/dashboard/MatchListPane';
```

```tsx
      {selectedScoreId ? (
        <Report scoreId={selectedScoreId} floodUnverified={profileAcceptsUnverifiedFlood(profile)} />
      ) : (
```

(Keep the existing `MatchListPane` import path style — if it's a named import from the same file, just add the second name.)

- [ ] **Step 4: Run tests + typecheck**

Run: `rtk pnpm --filter frontend test && rtk pnpm --filter frontend exec tsc --noEmit`
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/frontend/src/ui/dashboard/ apps/frontend/src/ui/report/Report.tsx 'apps/frontend/app/(app)/index.tsx'
rtk git commit -m "land-match-86r: flood-unverified badge on match rows and report"
```

---

### Task 5: Full verification

- [ ] **Step 1: Run the full build + all tests**

Run from repo root:
```bash
rtk pnpm build && rtk pnpm lint
rtk pnpm --filter @landmatch/api test
rtk pnpm --filter @landmatch/scoring test
rtk pnpm --filter frontend test
rtk pnpm --filter @landmatch/server test
```
Expected: all green (server tests confirm nothing downstream of the schema change broke).

- [ ] **Step 2: /verify then /code-review**

Invoke the `verify` skill (drive the flow end-to-end: create a profile with a flood exclusion + toggle on, score a null-flood-zone listing, confirm it matches and shows the badge), then `/code-review` on the item's diff. Fix findings, amend/commit.
