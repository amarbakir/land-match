# Search Profile & Alert Preference Management UI

**Bead:** land-match-dkw.5
**Date:** 2026-04-20

## Problem

Users can't create or edit search profiles from the UI. The backend CRUD is complete (POST/GET/PUT/DELETE at `/api/v1/search-profiles`), but the frontend has no editor — only a read-only profile list in the sidebar with a no-op "New profile" button.

## Goal

Build a profile editor that lets users create, edit, and delete search profiles with full criteria control (geography, acreage, price, soil, flood zones, zoning, infrastructure, weights) and alert preferences (threshold, frequency, active toggle).

## Layout & Navigation

- Editor replaces the list+detail panes within the AppShell; sidebar stays visible
- Entry points:
  - **New profile**: click "+" button in sidebar → opens editor with defaults
  - **Edit profile**: hover over profile name in sidebar → edit icon appears → click opens editor pre-filled
- `WorkspaceView` type extends to `'profile' | 'new-profile'`
- Cancel returns to previous inbox view

## API Layer Changes

### `apps/frontend/src/api/client.ts`
Add `apiPut<TReq, TRes>` and `apiDelete<TRes>` following the existing `apiPost`/`apiPatch` pattern.

### `apps/frontend/src/api/hooks.ts`
Three new mutation hooks:

| Hook | Method | Path | Invalidates |
|------|--------|------|-------------|
| `useCreateSearchProfile` | POST | `/api/v1/search-profiles` | `searchProfiles`, `profileCounts` |
| `useUpdateSearchProfile` | PUT | `/api/v1/search-profiles/:id` | `searchProfiles`, `profileCounts` |
| `useDeleteSearchProfile` | DELETE | `/api/v1/search-profiles/:id` | `searchProfiles`, `profileCounts` |

## Component Architecture

### Shared Primitives (`apps/frontend/src/ui/profile/`)

**SectionCard** — Wraps each form section. Props: `title`, `hint?`, `children`. Renders title left, hint right (monospace uppercase), children below with divider.

**ToggleButtonRow** — Multi-select or single-select button row. Props: `options: {value, label}[]`, `selected: string[]`, `onToggle: (value) => void`, `variant?: 'default' | 'danger'`. Accent-highlighted when selected; danger variant uses red tones for flood zone exclusions.

**RangeSlider** — Single-value horizontal slider. Props: `min`, `max`, `value: number`, `onChange: (v: number) => void`, `formatLabel?: (v: number) => string`. Click-to-set interaction (click position on track sets value). Used by geography, price, threshold sliders.

**DualRangeSlider** — Dual-handle range slider for min/max ranges. Props: `min`, `max`, `value: [number, number]`, `onChange: ([min, max]) => void`, `formatLabel?`. Used only by acreage section.

### Section Components (`apps/frontend/src/ui/profile/`)

Each section receives its slice of form state + an onChange callback:

| Component | Controls | Notes |
|-----------|----------|-------|
| `GeographySection` | Radius slider (0-200mi), lat/lng text inputs | Counties/driveTime shown as disabled buttons |
| `AcreageSection` | Dual range slider (min-max) | |
| `PriceSection` | Single slider (ceiling, up to $1000K) | |
| `SoilSection` | Class I-VI button row | Click sets max (all up to clicked class highlight) |
| `FloodZoneSection` | X/A/AE/VE/D toggles | `variant="danger"`, multi-select, hard filter |
| `ZoningSection` | 4 zoning category toggles | Multi-select |
| `InfraSection` | 6 infrastructure toggles | Multi-select, boosts not requirements |
| `WeightsSection` | 8 interactive bars (0-2.0) | Click-to-set on bar, shows numeric value |
| `AlertsSection` | Threshold slider (0-100) + frequency toggles | instant/daily/weekly |

### ProfileEditorScreen (`apps/frontend/src/ui/profile/ProfileEditorScreen.tsx`)

Props: `profileId?: string` (undefined = new), `onClose: () => void`

**State**: Single `useState<FormState>` initialized from existing profile data or defaults.

**FormState shape** (maps directly to `CreateSearchProfile`):
```typescript
interface FormState {
  name: string;
  isActive: boolean;
  alertFrequency: 'instant' | 'daily' | 'weekly';
  alertThreshold: number;
  criteria: {
    geography: { type: 'radius'; center: { lat: number; lng: number }; radiusMiles: number };
    acreage: { min: number; max: number };
    price: { max: number };
    soilCapabilityClass: { max: number };
    floodZoneExclude: string[];
    zoning: string[];
    infrastructure: string[];
    weights: Record<string, number>;
  };
}
```

**Header**: Editable name (TextInput), active/inactive Switch, Cancel + Save buttons.

**Body**: ScrollView with all section components.

**Save flow**: Validate name non-empty → construct payload → call create or update mutation → on success, close editor.

### DeleteProfileModal (`apps/frontend/src/ui/profile/DeleteProfileModal.tsx`)

Simple confirmation: "Delete this profile? This cannot be undone." with Cancel + Delete buttons. Uses React Native `Modal`. Delete calls `useDeleteSearchProfile`, then closes.

## Wiring Changes

### `apps/frontend/src/ui/dashboard/types.ts`
```typescript
export type WorkspaceView = 'inbox' | 'shortlist' | 'dismissed' | 'profile' | 'new-profile';
```

### `apps/frontend/src/ui/dashboard/SidebarNav.tsx`
- Add `onEditProfile: (id: string) => void` and `onNewProfile: () => void` props
- Profile items: show edit icon on hover (use `Pressable` `onHoverIn`/`onHoverOut`)
- "New profile" button: wire `onPress` to `onNewProfile`

### `apps/frontend/src/ui/dashboard/AppShell.tsx`
- Pass `onEditProfile` and `onNewProfile` through to SidebarNav
- Accept and forward `editingProfileId` state

### `apps/frontend/src/ui/dashboard/Icon.tsx`
- Add `EditIcon` (pencil) following existing icon pattern

### `apps/frontend/src/ui/dashboard/Topbar.tsx`
- Add `'profile'` and `'new-profile'` to `VIEW_LABELS`

### `apps/frontend/app/(app)/_layout.tsx`
- Add `editingProfileId` state
- Render `ProfileEditorScreen` when view is `'profile'` or `'new-profile'`
- Wire handlers: `handleEditProfile(id)`, `handleNewProfile()`, `handleCloseEditor()`

## Defaults for New Profile

```typescript
const DEFAULT_FORM_STATE: FormState = {
  name: '',
  isActive: true,
  alertFrequency: 'daily',
  alertThreshold: 60,
  criteria: {
    geography: { type: 'radius', center: { lat: 0, lng: 0 }, radiusMiles: 60 },
    acreage: { min: 5, max: 50 },
    price: { max: 500 },
    soilCapabilityClass: { max: 3 },
    floodZoneExclude: [],
    zoning: [],
    infrastructure: [],
    weights: {
      flood: 2.0, soil: 1.5, price: 1.5, acreage: 1.0,
      zoning: 1.0, geography: 1.0, climate: 0.8, infrastructure: 0.5,
    },
  },
};
```

## Visual Design

Follow existing theme from `apps/frontend/src/theme/colors.ts`:
- Dark background, card surfaces for sections
- Accent gold (`colors.accent`) for selected states and slider fills
- Mono font for hints, labels, numeric values
- Danger red for flood zone exclusion toggles
- Consistent spacing with existing dashboard components

## Out of Scope

- Counties and drive-time geography types (shown disabled)
- Climate risk criteria editing
- Map-based center point picker
- Mobile-optimized layout
- Undo/discard-changes confirmation on cancel

## Verification

1. Create a new profile via sidebar "+" → fill form → save → appears in sidebar list
2. Click edit icon on existing profile → form pre-fills → modify → save → changes persist
3. Delete profile → confirm modal → profile removed from sidebar
4. Toggle active/inactive → save → dot color changes in sidebar
5. Alert settings (threshold/frequency) → save → verify via API response
6. Cancel without saving → no changes persisted
7. Run `pnpm --filter @landmatch/frontend build` — no type errors
