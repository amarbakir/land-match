# Profile Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a search profile management UI — create, edit, delete profiles with full criteria control and alert preferences.

**Architecture:** Section-component pattern with lifted form state. `ProfileEditorScreen` owns a single `useState<FormState>`, passes slices to 9 section components via props. Three shared primitives (`SectionCard`, `ToggleButtonRow`, `RangeSlider`) are reused across sections. API mutations use React Query's `useMutation` with cache invalidation.

**Tech Stack:** React Native + Tamagui, React Query, Zod (via `@landmatch/api`), Expo Router

**Spec:** `docs/superpowers/specs/2026-04-20-profile-editor-design.md`

---

### Task 1: API Client — Add `apiPut` and `apiDelete`

**Files:**
- Modify: `apps/frontend/src/api/client.ts`
- Test: `apps/frontend/src/api/__tests__/client.test.ts`

- [ ] **Step 1: Add `apiPut` to the API client**

Add after the existing `apiPatch` function in `apps/frontend/src/api/client.ts`:

```typescript
export async function apiPut<TReq, TRes>(
  path: string,
  body: TReq,
  options?: RequestOptions,
): Promise<TRes> {
  const init: RequestInit = {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };

  const response = options?.noAuth
    ? await fetch(`${API_BASE_URL}${path}`, init)
    : await authFetch(path, init);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(parseErrorResponse(text, response.status));
  }

  const json = await response.json();
  return json.data as TRes;
}
```

- [ ] **Step 2: Add `apiDelete` to the API client**

Add after `apiPut` in the same file:

```typescript
export async function apiDelete<TRes>(
  path: string,
  options?: RequestOptions,
): Promise<TRes> {
  const response = options?.noAuth
    ? await fetch(`${API_BASE_URL}${path}`, { method: 'DELETE' })
    : await authFetch(path, { method: 'DELETE' });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(parseErrorResponse(text, response.status));
  }

  const json = await response.json();
  return json.data as TRes;
}
```

- [ ] **Step 3: Verify build**

Run: `rtk pnpm --filter @landmatch/frontend build`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
rtk git add apps/frontend/src/api/client.ts && rtk git commit -m "feat: add apiPut and apiDelete to frontend API client"
```

---

### Task 2: Mutation Hooks — Profile CRUD

**Files:**
- Modify: `apps/frontend/src/api/hooks.ts`

- [ ] **Step 1: Add imports for apiPut, apiDelete, and mutation types**

Add `apiPut` and `apiDelete` to the import from `./client`, and add the missing types to the `@landmatch/api` import:

```typescript
import type {
  CreateSearchProfile,
  UpdateSearchProfile,
  // ... existing imports
} from '@landmatch/api';

import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from './client';
```

- [ ] **Step 2: Add `useCreateSearchProfile` hook**

Add at the end of `hooks.ts`:

```typescript
export function useCreateSearchProfile() {
  const queryClient = useQueryClient();

  return useMutation<SearchProfileResponse, Error, CreateSearchProfile>({
    mutationFn: (body) =>
      apiPost<CreateSearchProfile, SearchProfileResponse>(
        '/api/v1/search-profiles',
        body,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['searchProfiles'] });
      queryClient.invalidateQueries({ queryKey: ['profileCounts'] });
    },
  });
}
```

- [ ] **Step 3: Add `useUpdateSearchProfile` hook**

```typescript
export function useUpdateSearchProfile() {
  const queryClient = useQueryClient();

  return useMutation<
    SearchProfileResponse,
    Error,
    { id: string; data: UpdateSearchProfile }
  >({
    mutationFn: ({ id, data }) =>
      apiPut<UpdateSearchProfile, SearchProfileResponse>(
        `/api/v1/search-profiles/${id}`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['searchProfiles'] });
      queryClient.invalidateQueries({ queryKey: ['profileCounts'] });
    },
  });
}
```

- [ ] **Step 4: Add `useDeleteSearchProfile` hook**

```typescript
export function useDeleteSearchProfile() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) =>
      apiDelete<void>(`/api/v1/search-profiles/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['searchProfiles'] });
      queryClient.invalidateQueries({ queryKey: ['profileCounts'] });
    },
  });
}
```

- [ ] **Step 5: Verify build**

Run: `rtk pnpm --filter @landmatch/frontend build`
Expected: No type errors

- [ ] **Step 6: Commit**

```bash
rtk git add apps/frontend/src/api/hooks.ts && rtk git commit -m "feat: add profile create/update/delete mutation hooks"
```

---

### Task 3: Extend WorkspaceView and Topbar

**Files:**
- Modify: `apps/frontend/src/ui/dashboard/types.ts`
- Modify: `apps/frontend/src/ui/dashboard/Topbar.tsx`
- Modify: `apps/frontend/src/ui/dashboard/Icon.tsx`

- [ ] **Step 1: Add profile views to WorkspaceView type**

In `apps/frontend/src/ui/dashboard/types.ts`, replace the type:

```typescript
export type WorkspaceView = 'inbox' | 'shortlist' | 'dismissed' | 'profile' | 'new-profile';
```

- [ ] **Step 2: Add VIEW_LABELS entries in Topbar.tsx**

Update the `VIEW_LABELS` record in `apps/frontend/src/ui/dashboard/Topbar.tsx`:

```typescript
const VIEW_LABELS: Record<WorkspaceView, string> = {
  inbox: 'Matches',
  shortlist: 'Shortlist',
  dismissed: 'Dismissed',
  profile: 'Edit profile',
  'new-profile': 'New profile',
};
```

- [ ] **Step 3: Add EditIcon to Icon.tsx**

Add to `apps/frontend/src/ui/dashboard/Icon.tsx`:

```typescript
export function EditIcon({ size = 16, color = 'currentColor' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...defaultProps}>
      <Path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <Path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </Svg>
  );
}
```

- [ ] **Step 4: Fix any TypeScript errors from the type widening**

Run: `rtk pnpm --filter @landmatch/frontend build`
Expected: No type errors (the `VIEW_LABELS` record now covers all variants)

- [ ] **Step 5: Commit**

```bash
rtk git add apps/frontend/src/ui/dashboard/types.ts apps/frontend/src/ui/dashboard/Topbar.tsx apps/frontend/src/ui/dashboard/Icon.tsx && rtk git commit -m "feat: add profile/new-profile to WorkspaceView, add EditIcon"
```

---

### Task 4: Shared Primitives — SectionCard, ToggleButtonRow, RangeSlider

**Files:**
- Create: `apps/frontend/src/ui/profile/SectionCard.tsx`
- Create: `apps/frontend/src/ui/profile/ToggleButtonRow.tsx`
- Create: `apps/frontend/src/ui/profile/RangeSlider.tsx`
- Create: `apps/frontend/src/ui/profile/DualRangeSlider.tsx`

- [ ] **Step 1: Create SectionCard**

Create `apps/frontend/src/ui/profile/SectionCard.tsx`:

```typescript
import { Text, XStack, YStack } from 'tamagui';

import { colors } from '@/src/theme/colors';

interface SectionCardProps {
  title: string;
  hint?: string;
  children: React.ReactNode;
}

export function SectionCard({ title, hint, children }: SectionCardProps) {
  return (
    <YStack
      backgroundColor={colors.cardBackground}
      borderWidth={1}
      borderColor={colors.borderSoft}
      borderRadius={8}
      padding={16}
      marginBottom={10}
    >
      <XStack justifyContent="space-between" alignItems="baseline" gap={12} marginBottom={8}>
        <Text fontSize={13} fontWeight="600" color={colors.textPrimary}>
          {title}
        </Text>
        {hint && (
          <Text
            fontFamily="$mono"
            fontSize={10.5}
            color={colors.textFaint}
            letterSpacing={0.4}
            textTransform="uppercase"
          >
            {hint}
          </Text>
        )}
      </XStack>
      {children}
    </YStack>
  );
}
```

- [ ] **Step 2: Create ToggleButtonRow**

Create `apps/frontend/src/ui/profile/ToggleButtonRow.tsx`:

```typescript
import { Pressable } from 'react-native';

import { Text, XStack } from 'tamagui';

import { colors } from '@/src/theme/colors';

interface ToggleOption {
  value: string;
  label: string;
}

interface ToggleButtonRowProps {
  options: ToggleOption[];
  selected: string[];
  onToggle: (value: string) => void;
  variant?: 'default' | 'danger';
  disabled?: boolean;
}

export function ToggleButtonRow({
  options,
  selected,
  onToggle,
  variant = 'default',
  disabled = false,
}: ToggleButtonRowProps) {
  const activeBackground = variant === 'danger'
    ? 'rgba(220,38,38,0.1)'
    : 'rgba(212,168,67,0.1)';
  const activeBorder = variant === 'danger'
    ? 'rgba(220,38,38,0.3)'
    : 'rgba(212,168,67,0.3)';
  const activeText = variant === 'danger' ? colors.danger : colors.accent;

  return (
    <XStack flexWrap="wrap" gap={6}>
      {options.map((opt) => {
        const isSelected = selected.includes(opt.value);
        return (
          <Pressable
            key={opt.value}
            onPress={() => !disabled && onToggle(opt.value)}
            style={{ opacity: disabled ? 0.4 : 1 }}
          >
            <Text
              fontFamily="$mono"
              fontSize={12}
              letterSpacing={0.2}
              paddingVertical={5}
              paddingHorizontal={11}
              borderRadius={99}
              borderWidth={1}
              overflow="hidden"
              backgroundColor={isSelected ? activeBackground : 'transparent'}
              borderColor={isSelected ? activeBorder : colors.borderSoft}
              color={isSelected ? activeText : colors.textSecondary}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </XStack>
  );
}

/** Helper: toggle a value in/out of a string array */
export function toggleValue(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}
```

- [ ] **Step 3: Write tests for toggleValue**

Create `apps/frontend/src/ui/profile/__tests__/toggle-value.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { toggleValue } from '../ToggleButtonRow';

describe('toggleValue', () => {
  it('adds a value not in the array', () => {
    expect(toggleValue(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
  });

  it('removes a value already in the array', () => {
    expect(toggleValue(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });

  it('returns new array reference on add', () => {
    const original = ['a'];
    const result = toggleValue(original, 'b');
    expect(result).not.toBe(original);
  });

  it('returns new array reference on remove', () => {
    const original = ['a', 'b'];
    const result = toggleValue(original, 'a');
    expect(result).not.toBe(original);
  });

  it('handles empty array', () => {
    expect(toggleValue([], 'x')).toEqual(['x']);
  });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk pnpm --filter @landmatch/frontend test -- src/ui/profile/__tests__/toggle-value.test.ts`
Expected: 5 tests PASS

- [ ] **Step 5: Create RangeSlider**

Create `apps/frontend/src/ui/profile/RangeSlider.tsx`:

```typescript
import { Pressable, View } from 'react-native';

import { Text, XStack } from 'tamagui';

import { colors } from '@/src/theme/colors';

interface RangeSliderProps {
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  formatLabel?: (value: number) => string;
  step?: number;
}

export function RangeSlider({
  min,
  max,
  value,
  onChange,
  formatLabel,
  step = 1,
}: RangeSliderProps) {
  const fraction = max > min ? (value - min) / (max - min) : 0;
  const label = formatLabel ? formatLabel(value) : String(value);

  const handlePress = (e: { nativeEvent: { locationX: number } }, width: number) => {
    if (width <= 0) return;
    const raw = (e.nativeEvent.locationX / width) * (max - min) + min;
    const stepped = Math.round(raw / step) * step;
    const clamped = Math.max(min, Math.min(max, stepped));
    onChange(clamped);
  };

  return (
    <View
      style={{ paddingVertical: 8, marginVertical: 4 }}
      onLayout={() => {}}
    >
      <Pressable
        onPress={(e) => {
          const target = e.currentTarget as unknown as { offsetWidth?: number };
          const width = target.offsetWidth ?? 0;
          handlePress(e, width);
        }}
        style={{ height: 42, justifyContent: 'center' }}
      >
        {/* Track */}
        <View
          style={{
            height: 6,
            backgroundColor: colors.borderSoft,
            borderRadius: 99,
          }}
        >
          {/* Fill */}
          <View
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: `${fraction * 100}%` as unknown as number,
              backgroundColor: colors.accent,
              borderRadius: 99,
            }}
          />
        </View>
        {/* Handle */}
        <View
          style={{
            position: 'absolute',
            left: `${fraction * 100}%` as unknown as number,
            top: 14,
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: colors.accent,
            borderWidth: 2,
            borderColor: colors.background,
            transform: [{ translateX: -7 }],
          }}
        />
      </Pressable>
      {/* Label */}
      <XStack justifyContent="center" marginTop={4}>
        <Text fontFamily="$mono" fontSize={10.5} color={colors.textSecondary}>
          {label}
        </Text>
      </XStack>
    </View>
  );
}

/** Clamp a number between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Snap a value to the nearest step */
export function snapToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}
```

- [ ] **Step 6: Create DualRangeSlider**

Create `apps/frontend/src/ui/profile/DualRangeSlider.tsx`:

```typescript
import { Pressable, View } from 'react-native';

import { Text, XStack } from 'tamagui';

import { colors } from '@/src/theme/colors';

interface DualRangeSliderProps {
  min: number;
  max: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  formatLabel?: (low: number, high: number) => string;
  step?: number;
}

export function DualRangeSlider({
  min,
  max,
  value,
  onChange,
  formatLabel,
  step = 1,
}: DualRangeSliderProps) {
  const range = max - min || 1;
  const lowFrac = (value[0] - min) / range;
  const highFrac = (value[1] - min) / range;
  const label = formatLabel
    ? formatLabel(value[0], value[1])
    : `${value[0]} – ${value[1]}`;

  const handlePress = (e: { nativeEvent: { locationX: number } }, width: number) => {
    if (width <= 0) return;
    const raw = (e.nativeEvent.locationX / width) * range + min;
    const stepped = Math.round(raw / step) * step;
    const clamped = Math.max(min, Math.min(max, stepped));

    // Move whichever handle is closer
    const distToLow = Math.abs(clamped - value[0]);
    const distToHigh = Math.abs(clamped - value[1]);

    if (distToLow <= distToHigh) {
      onChange([Math.min(clamped, value[1]), value[1]]);
    } else {
      onChange([value[0], Math.max(clamped, value[0])]);
    }
  };

  return (
    <View style={{ paddingVertical: 8, marginVertical: 4 }}>
      <Pressable
        onPress={(e) => {
          const target = e.currentTarget as unknown as { offsetWidth?: number };
          const width = target.offsetWidth ?? 0;
          handlePress(e, width);
        }}
        style={{ height: 42, justifyContent: 'center' }}
      >
        {/* Track */}
        <View
          style={{
            height: 6,
            backgroundColor: colors.borderSoft,
            borderRadius: 99,
          }}
        >
          {/* Fill between handles */}
          <View
            style={{
              position: 'absolute',
              left: `${lowFrac * 100}%` as unknown as number,
              top: 0,
              bottom: 0,
              width: `${(highFrac - lowFrac) * 100}%` as unknown as number,
              backgroundColor: colors.accent,
              borderRadius: 99,
            }}
          />
        </View>
        {/* Low handle */}
        <View
          style={{
            position: 'absolute',
            left: `${lowFrac * 100}%` as unknown as number,
            top: 14,
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: colors.accent,
            borderWidth: 2,
            borderColor: colors.background,
            transform: [{ translateX: -7 }],
          }}
        />
        {/* High handle */}
        <View
          style={{
            position: 'absolute',
            left: `${highFrac * 100}%` as unknown as number,
            top: 14,
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: colors.accent,
            borderWidth: 2,
            borderColor: colors.background,
            transform: [{ translateX: -7 }],
          }}
        />
      </Pressable>
      <XStack justifyContent="center" marginTop={4}>
        <Text fontFamily="$mono" fontSize={10.5} color={colors.textSecondary}>
          {label}
        </Text>
      </XStack>
    </View>
  );
}
```

- [ ] **Step 7: Write tests for clamp and snapToStep**

Create `apps/frontend/src/ui/profile/__tests__/range-helpers.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { clamp, snapToStep } from '../RangeSlider';

describe('clamp', () => {
  it('returns value when within range', () => {
    expect(clamp(50, 0, 100)).toBe(50);
  });

  it('clamps to min when below', () => {
    expect(clamp(-5, 0, 100)).toBe(0);
  });

  it('clamps to max when above', () => {
    expect(clamp(150, 0, 100)).toBe(100);
  });

  it('handles min equals max', () => {
    expect(clamp(5, 10, 10)).toBe(10);
  });
});

describe('snapToStep', () => {
  it('snaps to nearest step', () => {
    expect(snapToStep(7, 5)).toBe(5);
    expect(snapToStep(8, 5)).toBe(10);
  });

  it('returns exact value when already on step', () => {
    expect(snapToStep(10, 5)).toBe(10);
  });

  it('works with decimal steps', () => {
    expect(snapToStep(0.7, 0.5)).toBe(0.5);
    expect(snapToStep(0.8, 0.5)).toBe(1.0);
  });
});
```

- [ ] **Step 8: Run tests**

Run: `rtk pnpm --filter @landmatch/frontend test -- src/ui/profile/__tests__/`
Expected: All tests PASS

- [ ] **Step 9: Verify build**

Run: `rtk pnpm --filter @landmatch/frontend build`
Expected: No type errors

- [ ] **Step 10: Commit**

```bash
rtk git add apps/frontend/src/ui/profile/ && rtk git commit -m "feat: add SectionCard, ToggleButtonRow, RangeSlider, DualRangeSlider primitives"
```

---

### Task 5: Section Components — Geography, Acreage, Price

**Files:**
- Create: `apps/frontend/src/ui/profile/GeographySection.tsx`
- Create: `apps/frontend/src/ui/profile/AcreageSection.tsx`
- Create: `apps/frontend/src/ui/profile/PriceSection.tsx`

- [ ] **Step 1: Create GeographySection**

Create `apps/frontend/src/ui/profile/GeographySection.tsx`:

```typescript
import { TextInput, View } from 'react-native';

import { Text, XStack, YStack } from 'tamagui';

import { colors } from '@/src/theme/colors';

import { RangeSlider } from './RangeSlider';
import { SectionCard } from './SectionCard';
import { ToggleButtonRow } from './ToggleButtonRow';

interface GeographySectionProps {
  type: 'radius' | 'counties' | 'driveTime';
  center: { lat: number; lng: number };
  radiusMiles: number;
  onChangeRadius: (radius: number) => void;
  onChangeCenter: (center: { lat: number; lng: number }) => void;
}

const GEO_TYPE_OPTIONS = [
  { value: 'radius', label: 'radius' },
  { value: 'counties', label: 'counties' },
  { value: 'driveTime', label: 'drive time' },
];

export function GeographySection({
  center,
  radiusMiles,
  onChangeRadius,
  onChangeCenter,
}: GeographySectionProps) {
  const coordHint = center.lat !== 0
    ? `RADIUS · ${center.lat.toFixed(2)}°N ${Math.abs(center.lng).toFixed(2)}°W`
    : 'RADIUS';

  return (
    <SectionCard title="Geography" hint={coordHint}>
      <RangeSlider
        min={5}
        max={200}
        value={radiusMiles}
        onChange={onChangeRadius}
        step={5}
        formatLabel={(v) => `${v}mi`}
      />
      <XStack gap={10} marginTop={12}>
        <YStack flex={1}>
          <Text fontFamily="$mono" fontSize={10} color={colors.textFaint} marginBottom={4}>
            LAT
          </Text>
          <TextInput
            value={String(center.lat)}
            onChangeText={(t) => {
              const n = parseFloat(t);
              if (!isNaN(n)) onChangeCenter({ ...center, lat: n });
            }}
            keyboardType="numeric"
            style={{
              fontFamily: 'IBM Plex Mono',
              fontSize: 12,
              color: colors.textPrimary,
              backgroundColor: colors.cardAlt,
              borderWidth: 1,
              borderColor: colors.borderSoft,
              borderRadius: 6,
              paddingHorizontal: 10,
              paddingVertical: 6,
            }}
          />
        </YStack>
        <YStack flex={1}>
          <Text fontFamily="$mono" fontSize={10} color={colors.textFaint} marginBottom={4}>
            LNG
          </Text>
          <TextInput
            value={String(center.lng)}
            onChangeText={(t) => {
              const n = parseFloat(t);
              if (!isNaN(n)) onChangeCenter({ ...center, lng: n });
            }}
            keyboardType="numeric"
            style={{
              fontFamily: 'IBM Plex Mono',
              fontSize: 12,
              color: colors.textPrimary,
              backgroundColor: colors.cardAlt,
              borderWidth: 1,
              borderColor: colors.borderSoft,
              borderRadius: 6,
              paddingHorizontal: 10,
              paddingVertical: 6,
            }}
          />
        </YStack>
      </XStack>
      <View style={{ marginTop: 16 }}>
        <ToggleButtonRow
          options={GEO_TYPE_OPTIONS}
          selected={['radius']}
          onToggle={() => {}}
          disabled
        />
      </View>
    </SectionCard>
  );
}
```

- [ ] **Step 2: Create AcreageSection**

Create `apps/frontend/src/ui/profile/AcreageSection.tsx`:

```typescript
import { DualRangeSlider } from './DualRangeSlider';
import { SectionCard } from './SectionCard';

interface AcreageSectionProps {
  min: number;
  max: number;
  onChange: (value: [number, number]) => void;
}

export function AcreageSection({ min, max, onChange }: AcreageSectionProps) {
  return (
    <SectionCard title="Acreage" hint={`${min} – ${max} ACRES`}>
      <DualRangeSlider
        min={0}
        max={200}
        value={[min, max]}
        onChange={onChange}
        step={1}
        formatLabel={(lo, hi) => `${lo} – ${hi} ac`}
      />
    </SectionCard>
  );
}
```

- [ ] **Step 3: Create PriceSection**

Create `apps/frontend/src/ui/profile/PriceSection.tsx`:

```typescript
import { RangeSlider } from './RangeSlider';
import { SectionCard } from './SectionCard';

interface PriceSectionProps {
  max: number;
  onChange: (value: number) => void;
}

export function PriceSection({ max, onChange }: PriceSectionProps) {
  return (
    <SectionCard title="Price ceiling" hint={`UP TO $${max}K`}>
      <RangeSlider
        min={0}
        max={1000}
        value={max}
        onChange={onChange}
        step={10}
        formatLabel={(v) => `$${v}K`}
      />
    </SectionCard>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `rtk pnpm --filter @landmatch/frontend build`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
rtk git add apps/frontend/src/ui/profile/GeographySection.tsx apps/frontend/src/ui/profile/AcreageSection.tsx apps/frontend/src/ui/profile/PriceSection.tsx && rtk git commit -m "feat: add Geography, Acreage, Price section components"
```

---

### Task 6: Section Components — Soil, Flood, Zoning, Infra

**Files:**
- Create: `apps/frontend/src/ui/profile/SoilSection.tsx`
- Create: `apps/frontend/src/ui/profile/FloodZoneSection.tsx`
- Create: `apps/frontend/src/ui/profile/ZoningSection.tsx`
- Create: `apps/frontend/src/ui/profile/InfraSection.tsx`

- [ ] **Step 1: Create SoilSection**

Create `apps/frontend/src/ui/profile/SoilSection.tsx`:

```typescript
import { Pressable } from 'react-native';

import { Text, XStack } from 'tamagui';

import { colors } from '@/src/theme/colors';

import { SectionCard } from './SectionCard';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'] as const;

interface SoilSectionProps {
  maxClass: number;
  onChange: (maxClass: number) => void;
}

export function SoilSection({ maxClass, onChange }: SoilSectionProps) {
  return (
    <SectionCard title="Soil capability class" hint={`MAX CLASS ${ROMAN[maxClass - 1] ?? 'III'}`}>
      <XStack flexWrap="wrap" gap={6}>
        {ROMAN.map((label, i) => {
          const classNum = i + 1;
          const isSelected = classNum <= maxClass;
          return (
            <Pressable key={label} onPress={() => onChange(classNum)}>
              <Text
                fontFamily="$mono"
                fontSize={12}
                letterSpacing={0.2}
                paddingVertical={5}
                paddingHorizontal={11}
                borderRadius={99}
                borderWidth={1}
                overflow="hidden"
                backgroundColor={isSelected ? 'rgba(212,168,67,0.1)' : 'transparent'}
                borderColor={isSelected ? 'rgba(212,168,67,0.3)' : colors.borderSoft}
                color={isSelected ? colors.accent : colors.textSecondary}
              >
                Class {label}
              </Text>
            </Pressable>
          );
        })}
      </XStack>
    </SectionCard>
  );
}
```

- [ ] **Step 2: Create FloodZoneSection**

Create `apps/frontend/src/ui/profile/FloodZoneSection.tsx`:

```typescript
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
  onChange: (excluded: string[]) => void;
}

export function FloodZoneSection({ excluded, onChange }: FloodZoneSectionProps) {
  return (
    <SectionCard title="Exclude flood zones" hint="HARD FILTER">
      <ToggleButtonRow
        options={FLOOD_OPTIONS}
        selected={excluded}
        onToggle={(v) => onChange(toggleValue(excluded, v))}
        variant="danger"
      />
    </SectionCard>
  );
}
```

- [ ] **Step 3: Create ZoningSection**

Create `apps/frontend/src/ui/profile/ZoningSection.tsx`:

```typescript
import { SectionCard } from './SectionCard';
import { ToggleButtonRow, toggleValue } from './ToggleButtonRow';

const ZONING_OPTIONS = [
  { value: 'agricultural', label: 'agricultural' },
  { value: 'residential-agricultural', label: 'residential-agricultural' },
  { value: 'rural-residential', label: 'rural-residential' },
  { value: 'conservation', label: 'conservation' },
];

interface ZoningSectionProps {
  selected: string[];
  onChange: (selected: string[]) => void;
}

export function ZoningSection({ selected, onChange }: ZoningSectionProps) {
  return (
    <SectionCard title="Preferred zoning" hint="NORMALIZED">
      <ToggleButtonRow
        options={ZONING_OPTIONS}
        selected={selected}
        onToggle={(v) => onChange(toggleValue(selected, v))}
      />
    </SectionCard>
  );
}
```

- [ ] **Step 4: Create InfraSection**

Create `apps/frontend/src/ui/profile/InfraSection.tsx`:

```typescript
import { SectionCard } from './SectionCard';
import { ToggleButtonRow, toggleValue } from './ToggleButtonRow';

const INFRA_OPTIONS = [
  { value: 'well', label: 'well' },
  { value: 'septic', label: 'septic' },
  { value: 'electric', label: 'electric' },
  { value: 'paved road', label: 'paved road' },
  { value: 'internet', label: 'internet' },
  { value: 'outbuildings', label: 'outbuildings' },
];

interface InfraSectionProps {
  selected: string[];
  onChange: (selected: string[]) => void;
}

export function InfraSection({ selected, onChange }: InfraSectionProps) {
  return (
    <SectionCard title="Infrastructure wish-list" hint="BOOSTS · NOT REQUIRED">
      <ToggleButtonRow
        options={INFRA_OPTIONS}
        selected={selected}
        onToggle={(v) => onChange(toggleValue(selected, v))}
      />
    </SectionCard>
  );
}
```

- [ ] **Step 5: Verify build**

Run: `rtk pnpm --filter @landmatch/frontend build`
Expected: No type errors

- [ ] **Step 6: Commit**

```bash
rtk git add apps/frontend/src/ui/profile/SoilSection.tsx apps/frontend/src/ui/profile/FloodZoneSection.tsx apps/frontend/src/ui/profile/ZoningSection.tsx apps/frontend/src/ui/profile/InfraSection.tsx && rtk git commit -m "feat: add Soil, FloodZone, Zoning, Infra section components"
```

---

### Task 7: Section Components — Weights and Alerts

**Files:**
- Create: `apps/frontend/src/ui/profile/WeightsSection.tsx`
- Create: `apps/frontend/src/ui/profile/AlertsSection.tsx`

- [ ] **Step 1: Create WeightsSection**

Create `apps/frontend/src/ui/profile/WeightsSection.tsx`:

```typescript
import { Pressable, View } from 'react-native';

import { Text, XStack, YStack } from 'tamagui';

import { colors } from '@/src/theme/colors';

import { SectionCard } from './SectionCard';

const WEIGHT_KEYS = [
  'flood', 'soil', 'price', 'acreage',
  'zoning', 'geography', 'climate', 'infrastructure',
] as const;

interface WeightsSectionProps {
  weights: Record<string, number>;
  onChange: (weights: Record<string, number>) => void;
}

export function WeightsSection({ weights, onChange }: WeightsSectionProps) {
  const handleBarPress = (
    key: string,
    e: { nativeEvent: { locationX: number } },
    width: number,
  ) => {
    if (width <= 0) return;
    const raw = (e.nativeEvent.locationX / width) * 2;
    const snapped = Math.round(raw * 10) / 10;
    const clamped = Math.max(0, Math.min(2, snapped));
    onChange({ ...weights, [key]: clamped });
  };

  return (
    <SectionCard title="Custom weights" hint="0 – 2.0">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {WEIGHT_KEYS.map((key) => {
          const value = weights[key] ?? 1.0;
          const fraction = value / 2;
          return (
            <XStack
              key={key}
              alignItems="center"
              gap={10}
              width="48%"
              paddingVertical={4}
            >
              <Text
                fontFamily="$mono"
                fontSize={11}
                textTransform="uppercase"
                letterSpacing={0.5}
                color={colors.textSecondary}
                width={90}
              >
                {key}
              </Text>
              <Pressable
                style={{ flex: 1, height: 20, justifyContent: 'center' }}
                onPress={(e) => {
                  const target = e.currentTarget as unknown as { offsetWidth?: number };
                  handleBarPress(key, e, target.offsetWidth ?? 0);
                }}
              >
                <View
                  style={{
                    height: 4,
                    backgroundColor: colors.borderSoft,
                    borderRadius: 99,
                  }}
                >
                  <View
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${fraction * 100}%` as unknown as number,
                      backgroundColor: colors.accent,
                      borderRadius: 99,
                    }}
                  />
                </View>
              </Pressable>
              <Text
                fontFamily="$mono"
                fontSize={11}
                color={colors.textPrimary}
                width={30}
                textAlign="right"
              >
                {value.toFixed(1)}
              </Text>
            </XStack>
          );
        })}
      </View>
    </SectionCard>
  );
}
```

- [ ] **Step 2: Create AlertsSection**

Create `apps/frontend/src/ui/profile/AlertsSection.tsx`:

```typescript
import { View } from 'react-native';

import { RangeSlider } from './RangeSlider';
import { SectionCard } from './SectionCard';
import { ToggleButtonRow } from './ToggleButtonRow';

const FREQUENCY_OPTIONS = [
  { value: 'instant', label: 'instant' },
  { value: 'daily', label: 'daily' },
  { value: 'weekly', label: 'weekly' },
];

interface AlertsSectionProps {
  threshold: number;
  frequency: 'instant' | 'daily' | 'weekly';
  onChangeThreshold: (threshold: number) => void;
  onChangeFrequency: (frequency: 'instant' | 'daily' | 'weekly') => void;
}

export function AlertsSection({
  threshold,
  frequency,
  onChangeThreshold,
  onChangeFrequency,
}: AlertsSectionProps) {
  return (
    <SectionCard title="Alerts" hint="THRESHOLD · FREQ">
      <RangeSlider
        min={0}
        max={100}
        value={threshold}
        onChange={onChangeThreshold}
        step={5}
        formatLabel={(v) => `≥ ${v}`}
      />
      <View style={{ marginTop: 12 }}>
        <ToggleButtonRow
          options={FREQUENCY_OPTIONS}
          selected={[frequency]}
          onToggle={(v) => onChangeFrequency(v as 'instant' | 'daily' | 'weekly')}
        />
      </View>
    </SectionCard>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `rtk pnpm --filter @landmatch/frontend build`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
rtk git add apps/frontend/src/ui/profile/WeightsSection.tsx apps/frontend/src/ui/profile/AlertsSection.tsx && rtk git commit -m "feat: add Weights and Alerts section components"
```

---

### Task 8: ProfileEditorScreen and DeleteProfileModal

**Files:**
- Create: `apps/frontend/src/ui/profile/ProfileEditorScreen.tsx`
- Create: `apps/frontend/src/ui/profile/DeleteProfileModal.tsx`
- Create: `apps/frontend/src/ui/profile/formState.ts`

- [ ] **Step 1: Create FormState type and defaults**

Create `apps/frontend/src/ui/profile/formState.ts`:

```typescript
import type { SearchProfileResponse } from '@landmatch/api';

export interface FormState {
  name: string;
  isActive: boolean;
  alertFrequency: 'instant' | 'daily' | 'weekly';
  alertThreshold: number;
  criteria: {
    geography: {
      type: 'radius';
      center: { lat: number; lng: number };
      radiusMiles: number;
    };
    acreage: { min: number; max: number };
    price: { max: number };
    soilCapabilityClass: { max: number };
    floodZoneExclude: string[];
    zoning: string[];
    infrastructure: string[];
    weights: Record<string, number>;
  };
}

export const DEFAULT_WEIGHTS: Record<string, number> = {
  flood: 2.0,
  soil: 1.5,
  price: 1.5,
  acreage: 1.0,
  zoning: 1.0,
  geography: 1.0,
  climate: 0.8,
  infrastructure: 0.5,
};

export const DEFAULT_FORM_STATE: FormState = {
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
    weights: { ...DEFAULT_WEIGHTS },
  },
};

export function profileToFormState(profile: SearchProfileResponse): FormState {
  const c = profile.criteria;
  return {
    name: profile.name,
    isActive: profile.isActive,
    alertFrequency: profile.alertFrequency as FormState['alertFrequency'],
    alertThreshold: profile.alertThreshold,
    criteria: {
      geography: {
        type: 'radius',
        center: c.geography?.center ?? { lat: 0, lng: 0 },
        radiusMiles: c.geography?.radiusMiles ?? 60,
      },
      acreage: {
        min: c.acreage?.min ?? 5,
        max: c.acreage?.max ?? 50,
      },
      price: { max: c.price?.max ?? 500 },
      soilCapabilityClass: { max: c.soilCapabilityClass?.max ?? 3 },
      floodZoneExclude: c.floodZoneExclude ?? [],
      zoning: c.zoning ?? [],
      infrastructure: c.infrastructure ?? [],
      weights: c.weights ?? { ...DEFAULT_WEIGHTS },
    },
  };
}

export function formStateToPayload(state: FormState) {
  return {
    name: state.name,
    isActive: state.isActive,
    alertFrequency: state.alertFrequency,
    alertThreshold: state.alertThreshold,
    criteria: {
      geography: state.criteria.geography,
      acreage: state.criteria.acreage,
      price: state.criteria.price,
      soilCapabilityClass: state.criteria.soilCapabilityClass,
      floodZoneExclude: state.criteria.floodZoneExclude,
      zoning: state.criteria.zoning,
      infrastructure: state.criteria.infrastructure,
      weights: state.criteria.weights,
    },
  };
}
```

- [ ] **Step 2: Write tests for profileToFormState and formStateToPayload**

Create `apps/frontend/src/ui/profile/__tests__/form-state.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import type { SearchProfileResponse } from '@landmatch/api';

import {
  DEFAULT_FORM_STATE,
  DEFAULT_WEIGHTS,
  formStateToPayload,
  profileToFormState,
} from '../formState';

function makeProfile(overrides: Partial<SearchProfileResponse> = {}): SearchProfileResponse {
  return {
    id: 'p1',
    userId: 'u1',
    name: 'Test',
    isActive: true,
    alertFrequency: 'daily',
    alertThreshold: 60,
    criteria: {},
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('profileToFormState', () => {
  it('maps profile with full criteria', () => {
    const profile = makeProfile({
      name: 'Hudson Valley',
      criteria: {
        geography: { type: 'radius', center: { lat: 41.9, lng: -74.0 }, radiusMiles: 80 },
        acreage: { min: 10, max: 40 },
        price: { max: 600 },
        soilCapabilityClass: { max: 2 },
        floodZoneExclude: ['A', 'AE'],
        zoning: ['agricultural'],
        infrastructure: ['well'],
        weights: { flood: 2.0, soil: 1.0 },
      },
    });
    const state = profileToFormState(profile);
    expect(state.name).toBe('Hudson Valley');
    expect(state.criteria.geography.radiusMiles).toBe(80);
    expect(state.criteria.acreage).toEqual({ min: 10, max: 40 });
    expect(state.criteria.floodZoneExclude).toEqual(['A', 'AE']);
    expect(state.criteria.weights).toEqual({ flood: 2.0, soil: 1.0 });
  });

  it('fills defaults for empty criteria', () => {
    const state = profileToFormState(makeProfile({ criteria: {} }));
    expect(state.criteria.geography.radiusMiles).toBe(60);
    expect(state.criteria.acreage).toEqual({ min: 5, max: 50 });
    expect(state.criteria.soilCapabilityClass.max).toBe(3);
    expect(state.criteria.floodZoneExclude).toEqual([]);
    expect(state.criteria.weights).toEqual(DEFAULT_WEIGHTS);
  });
});

describe('formStateToPayload', () => {
  it('maps form state to API payload shape', () => {
    const payload = formStateToPayload(DEFAULT_FORM_STATE);
    expect(payload.name).toBe('');
    expect(payload.alertFrequency).toBe('daily');
    expect(payload.criteria.geography.type).toBe('radius');
    expect(payload.criteria.weights).toEqual(DEFAULT_WEIGHTS);
  });

  it('preserves all criteria fields', () => {
    const state = { ...DEFAULT_FORM_STATE, name: 'Test' };
    state.criteria = {
      ...state.criteria,
      floodZoneExclude: ['A', 'VE'],
      zoning: ['agricultural'],
    };
    const payload = formStateToPayload(state);
    expect(payload.criteria.floodZoneExclude).toEqual(['A', 'VE']);
    expect(payload.criteria.zoning).toEqual(['agricultural']);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `rtk pnpm --filter @landmatch/frontend test -- src/ui/profile/__tests__/form-state.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Create DeleteProfileModal**

Create `apps/frontend/src/ui/profile/DeleteProfileModal.tsx`:

```typescript
import { Modal, Pressable, View } from 'react-native';

import { Text, XStack, YStack } from 'tamagui';

import { colors } from '@/src/theme/colors';

interface DeleteProfileModalProps {
  profileName: string;
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteProfileModal({
  profileName,
  visible,
  onConfirm,
  onCancel,
}: DeleteProfileModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.6)',
        }}
      >
        <YStack
          backgroundColor={colors.cardBackground}
          borderWidth={1}
          borderColor={colors.border}
          borderRadius={12}
          padding={24}
          width={360}
          gap={16}
        >
          <Text fontSize={16} fontWeight="600" color={colors.textPrimary}>
            Delete profile?
          </Text>
          <Text fontSize={13} color={colors.textSecondary}>
            "{profileName}" and all its matches will be permanently deleted.
            This cannot be undone.
          </Text>
          <XStack justifyContent="flex-end" gap={10} marginTop={8}>
            <Pressable onPress={onCancel}>
              <Text
                fontSize={13}
                fontWeight="500"
                color={colors.textSecondary}
                paddingVertical={8}
                paddingHorizontal={16}
              >
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              style={{
                backgroundColor: 'rgba(220,38,38,0.15)',
                borderWidth: 1,
                borderColor: 'rgba(220,38,38,0.3)',
                borderRadius: 6,
                paddingVertical: 8,
                paddingHorizontal: 16,
              }}
            >
              <Text fontSize={13} fontWeight="600" color={colors.danger}>
                Delete
              </Text>
            </Pressable>
          </XStack>
        </YStack>
      </View>
    </Modal>
  );
}
```

- [ ] **Step 5: Create ProfileEditorScreen**

Create `apps/frontend/src/ui/profile/ProfileEditorScreen.tsx`:

```typescript
import { useState } from 'react';

import { Pressable, ScrollView, Switch, TextInput } from 'react-native';

import { Text, XStack, YStack } from 'tamagui';

import {
  useCreateSearchProfile,
  useDeleteSearchProfile,
  useSearchProfiles,
  useUpdateSearchProfile,
} from '@/src/api/hooks';
import { colors } from '@/src/theme/colors';

import { AcreageSection } from './AcreageSection';
import { AlertsSection } from './AlertsSection';
import { DeleteProfileModal } from './DeleteProfileModal';
import { FloodZoneSection } from './FloodZoneSection';
import { GeographySection } from './GeographySection';
import { InfraSection } from './InfraSection';
import { PriceSection } from './PriceSection';
import { SoilSection } from './SoilSection';
import { WeightsSection } from './WeightsSection';
import { ZoningSection } from './ZoningSection';
import {
  DEFAULT_FORM_STATE,
  type FormState,
  formStateToPayload,
  profileToFormState,
} from './formState';

interface ProfileEditorScreenProps {
  profileId?: string;
  onClose: () => void;
}

export function ProfileEditorScreen({ profileId, onClose }: ProfileEditorScreenProps) {
  const { data: profiles = [] } = useSearchProfiles();
  const existingProfile = profileId ? profiles.find((p) => p.id === profileId) : undefined;

  const [form, setForm] = useState<FormState>(() =>
    existingProfile ? profileToFormState(existingProfile) : { ...DEFAULT_FORM_STATE },
  );
  const [showDelete, setShowDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateSearchProfile();
  const updateMutation = useUpdateSearchProfile();
  const deleteMutation = useDeleteSearchProfile();

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const updateCriteria = <K extends keyof FormState['criteria']>(
    key: K,
    value: FormState['criteria'][K],
  ) => {
    setForm((prev) => ({
      ...prev,
      criteria: { ...prev.criteria, [key]: value },
    }));
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      setError('Profile name is required');
      return;
    }
    setError(null);

    const payload = formStateToPayload(form);

    if (existingProfile) {
      updateMutation.mutate(
        { id: existingProfile.id, data: payload },
        { onSuccess: onClose },
      );
    } else {
      createMutation.mutate(payload, { onSuccess: onClose });
    }
  };

  const handleDelete = () => {
    if (!existingProfile) return;
    deleteMutation.mutate(existingProfile.id, { onSuccess: onClose });
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 28, paddingHorizontal: 40, paddingBottom: 80, maxWidth: 960 }}
    >
      {/* Header */}
      <XStack
        justifyContent="space-between"
        alignItems="flex-start"
        gap={16}
        flexWrap="wrap"
        marginBottom={6}
      >
        <YStack flex={1} minWidth={320}>
          <Text
            fontFamily="$mono"
            fontSize={10}
            textTransform="uppercase"
            letterSpacing={1.4}
            color={colors.textFaint}
            marginBottom={4}
          >
            Search profile
          </Text>
          <TextInput
            value={form.name}
            onChangeText={(name) => setForm((prev) => ({ ...prev, name }))}
            placeholder="Profile name"
            placeholderTextColor={colors.textFaint}
            style={{
              fontFamily: 'Fraunces',
              fontSize: 26,
              fontWeight: '600',
              color: colors.textPrimary,
              backgroundColor: 'transparent',
              borderWidth: 0,
              paddingVertical: 2,
              letterSpacing: -0.2,
            }}
          />
        </YStack>
        <XStack alignItems="center" gap={10}>
          <XStack alignItems="center" gap={6}>
            <Text fontFamily="$mono" fontSize={10} color={colors.textFaint}>
              {form.isActive ? 'ACTIVE' : 'PAUSED'}
            </Text>
            <Switch
              value={form.isActive}
              onValueChange={(isActive) => setForm((prev) => ({ ...prev, isActive }))}
              trackColor={{ false: colors.borderSoft, true: colors.success }}
              thumbColor={colors.textPrimary}
            />
          </XStack>
          <Pressable onPress={onClose}>
            <Text
              fontSize={13}
              fontWeight="500"
              color={colors.textSecondary}
              paddingVertical={8}
              paddingHorizontal={14}
            >
              Cancel
            </Text>
          </Pressable>
          <Pressable
            onPress={handleSave}
            disabled={isSaving}
            style={{
              backgroundColor: 'rgba(212,168,67,0.15)',
              borderWidth: 1,
              borderColor: 'rgba(212,168,67,0.3)',
              borderRadius: 6,
              paddingVertical: 8,
              paddingHorizontal: 16,
              opacity: isSaving ? 0.5 : 1,
            }}
          >
            <Text fontSize={13} fontWeight="600" color={colors.accent}>
              {isSaving ? 'Saving...' : 'Save profile'}
            </Text>
          </Pressable>
        </XStack>
      </XStack>

      {error && (
        <Text fontSize={12} color={colors.danger} marginBottom={8}>
          {error}
        </Text>
      )}

      <Text fontSize={13} color={colors.textSecondary} marginBottom={22}>
        Tune what lands in your inbox. Changes apply to future listings — past scores
        aren't retroactively recalculated.
      </Text>

      {/* Sections */}
      <GeographySection
        type={form.criteria.geography.type}
        center={form.criteria.geography.center}
        radiusMiles={form.criteria.geography.radiusMiles}
        onChangeRadius={(radiusMiles) =>
          updateCriteria('geography', { ...form.criteria.geography, radiusMiles })
        }
        onChangeCenter={(center) =>
          updateCriteria('geography', { ...form.criteria.geography, center })
        }
      />
      <AcreageSection
        min={form.criteria.acreage.min}
        max={form.criteria.acreage.max}
        onChange={([min, max]) => updateCriteria('acreage', { min, max })}
      />
      <PriceSection
        max={form.criteria.price.max}
        onChange={(max) => updateCriteria('price', { max })}
      />
      <SoilSection
        maxClass={form.criteria.soilCapabilityClass.max}
        onChange={(max) => updateCriteria('soilCapabilityClass', { max })}
      />
      <FloodZoneSection
        excluded={form.criteria.floodZoneExclude}
        onChange={(excluded) => updateCriteria('floodZoneExclude', excluded)}
      />
      <ZoningSection
        selected={form.criteria.zoning}
        onChange={(zoning) => updateCriteria('zoning', zoning)}
      />
      <InfraSection
        selected={form.criteria.infrastructure}
        onChange={(infrastructure) => updateCriteria('infrastructure', infrastructure)}
      />
      <WeightsSection
        weights={form.criteria.weights}
        onChange={(weights) => updateCriteria('weights', weights)}
      />
      <AlertsSection
        threshold={form.alertThreshold}
        frequency={form.alertFrequency}
        onChangeThreshold={(alertThreshold) =>
          setForm((prev) => ({ ...prev, alertThreshold }))
        }
        onChangeFrequency={(alertFrequency) =>
          setForm((prev) => ({ ...prev, alertFrequency }))
        }
      />

      {/* Delete */}
      {existingProfile && (
        <Pressable
          onPress={() => setShowDelete(true)}
          style={{ marginTop: 24, alignSelf: 'flex-start' }}
        >
          <Text
            fontSize={12}
            fontFamily="$mono"
            color={colors.danger}
            textDecorationLine="underline"
          >
            Delete this profile
          </Text>
        </Pressable>
      )}

      <DeleteProfileModal
        profileName={form.name}
        visible={showDelete}
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
      />
    </ScrollView>
  );
}
```

- [ ] **Step 6: Verify build**

Run: `rtk pnpm --filter @landmatch/frontend build`
Expected: No type errors

- [ ] **Step 7: Commit**

```bash
rtk git add apps/frontend/src/ui/profile/ && rtk git commit -m "feat: add ProfileEditorScreen with delete modal and form state management"
```

---

### Task 9: Wire Into AppShell, SidebarNav, and Layout

**Files:**
- Modify: `apps/frontend/src/ui/dashboard/SidebarNav.tsx`
- Modify: `apps/frontend/src/ui/dashboard/AppShell.tsx`
- Modify: `apps/frontend/app/(app)/_layout.tsx`

- [ ] **Step 1: Update SidebarNav with edit icon on hover and onNewProfile**

In `apps/frontend/src/ui/dashboard/SidebarNav.tsx`:

1. Add `onEditProfile` and `onNewProfile` to the props interface:

```typescript
interface SidebarNavProps {
  activeView: WorkspaceView;
  profiles: SearchProfileResponse[];
  profileCounts: ProfileCounts;
  onSelectView: (view: WorkspaceView) => void;
  onSelectProfile: (profileId: string) => void;
  onEditProfile: (profileId: string) => void;
  onNewProfile: () => void;
}
```

2. Add `EditIcon` import:

```typescript
import {
  ArchiveIcon,
  BellIcon,
  EditIcon,
  InboxIcon,
  PlusIcon,
  SettingsIcon,
  StarIcon,
} from './Icon';
```

3. Add `onEditProfile` and `onNewProfile` to the destructured props of `SidebarNav`.

4. Replace the profile list rendering (the `{profiles.map(...)}` block) with hover-capable items:

```typescript
{profiles.map((p) => {
  const pc = countsMap.get(p.id);
  const newCount = pc?.unread ?? 0;
  return (
    <ProfileItem
      key={p.id}
      profile={p}
      newCount={newCount}
      onSelect={() => onSelectProfile(p.id)}
      onEdit={() => onEditProfile(p.id)}
    />
  );
})}
```

5. Wire the "New profile" button's `onPress`:

```typescript
<Pressable onPress={onNewProfile}>
```

6. Add the `ProfileItem` component before `SidebarNav` (in the same file):

```typescript
function ProfileItem({
  profile,
  newCount,
  onSelect,
  onEdit,
}: {
  profile: SearchProfileResponse;
  newCount: number;
  onSelect: () => void;
  onEdit: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <Pressable
      onPress={onSelect}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
    >
      <XStack
        paddingVertical={7}
        paddingHorizontal={16}
        marginHorizontal={8}
        marginVertical={1}
        borderRadius={6}
        alignItems="center"
        gap={8}
        backgroundColor={hovered ? '#131813' : 'transparent'}
      >
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: profile.isActive ? colors.success : colors.textFaint,
          }}
        />
        <Text
          flex={1}
          fontSize={12.5}
          color={colors.textSecondary}
          numberOfLines={1}
        >
          {profile.name}
        </Text>
        {hovered ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            hitSlop={8}
          >
            <EditIcon size={12} color={colors.textFaint} />
          </Pressable>
        ) : (
          newCount > 0 && (
            <Text fontFamily="$mono" fontSize={10} color={colors.textFaint}>
              +{newCount}
            </Text>
          )
        )}
      </XStack>
    </Pressable>
  );
}
```

7. Add `useState` to the imports from `react`:

```typescript
import { useState } from 'react';
```

- [ ] **Step 2: Update AppShell to pass new props**

In `apps/frontend/src/ui/dashboard/AppShell.tsx`:

1. Add new props to the interface:

```typescript
interface AppShellProps {
  view: WorkspaceView;
  selectedProfileId: string | null;
  onChangeView: (view: WorkspaceView) => void;
  onChangeProfile: (profileId: string) => void;
  onEditProfile: (profileId: string) => void;
  onNewProfile: () => void;
  children: React.ReactNode;
}
```

2. Destructure the new props and pass them to `SidebarNav`:

```typescript
export function AppShell({
  view,
  selectedProfileId,
  onChangeView,
  onChangeProfile,
  onEditProfile,
  onNewProfile,
  children,
}: AppShellProps) {
```

3. Update the `SidebarNav` usage:

```typescript
<SidebarNav
  activeView={view}
  profiles={profiles}
  profileCounts={profileCounts}
  onSelectView={onChangeView}
  onSelectProfile={(id) => {
    onChangeProfile(id);
    onChangeView('inbox');
  }}
  onEditProfile={onEditProfile}
  onNewProfile={onNewProfile}
/>
```

- [ ] **Step 3: Update _layout.tsx to render ProfileEditorScreen**

In `apps/frontend/app/(app)/_layout.tsx`:

1. Add imports:

```typescript
import { ProfileEditorScreen } from '@/src/ui/profile/ProfileEditorScreen';
```

2. Add state for editing profile ID:

```typescript
const [editingProfileId, setEditingProfileId] = useState<string | undefined>(undefined);
```

3. Add handler functions inside `AppLayout`:

```typescript
const handleEditProfile = (profileId: string) => {
  setEditingProfileId(profileId);
  setView('profile');
};

const handleNewProfile = () => {
  setEditingProfileId(undefined);
  setView('new-profile');
};

const handleCloseEditor = () => {
  setEditingProfileId(undefined);
  setView('inbox');
};
```

4. Pass new props to `AppShell`:

```typescript
<AppShell
  view={view}
  selectedProfileId={selectedProfileId}
  onChangeView={setView}
  onChangeProfile={setSelectedProfileId}
  onEditProfile={handleEditProfile}
  onNewProfile={handleNewProfile}
>
```

5. Add the profile editor rendering alongside existing views:

```typescript
{(view === 'profile' || view === 'new-profile') && (
  <ProfileEditorScreen
    profileId={editingProfileId}
    onClose={handleCloseEditor}
  />
)}
```

- [ ] **Step 4: Verify build**

Run: `rtk pnpm --filter @landmatch/frontend build`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
rtk git add apps/frontend/src/ui/dashboard/SidebarNav.tsx apps/frontend/src/ui/dashboard/AppShell.tsx apps/frontend/app/\(app\)/_layout.tsx && rtk git commit -m "feat: wire profile editor into AppShell, SidebarNav, and layout (dkw.5)"
```

---

### Task 10: Manual Verification

- [ ] **Step 1: Start the dev server**

Run: `pnpm dev`

- [ ] **Step 2: Test new profile creation**

1. Click "+" New profile in sidebar
2. Editor should appear in content area with empty defaults
3. Type a profile name
4. Adjust criteria (radius, acreage, price, soil class, etc.)
5. Set alert threshold and frequency
6. Click "Save profile"
7. Verify profile appears in sidebar list

- [ ] **Step 3: Test profile editing**

1. Hover over a profile name in the sidebar
2. Edit icon should appear
3. Click the edit icon
4. Form should pre-fill with existing profile data
5. Modify some criteria
6. Click "Save profile"
7. Verify changes persist (re-open editor)

- [ ] **Step 4: Test profile deletion**

1. Open an existing profile in the editor
2. Click "Delete this profile" link at bottom
3. Confirmation modal should appear
4. Click "Delete"
5. Profile should disappear from sidebar

- [ ] **Step 5: Test active/inactive toggle**

1. Open a profile in the editor
2. Toggle the active switch
3. Save
4. Verify dot color changes in sidebar (green = active, gray = paused)

- [ ] **Step 6: Test cancel behavior**

1. Open editor, make changes, click Cancel
2. Verify no changes were saved

- [ ] **Step 7: Run full build**

Run: `rtk pnpm build`
Expected: All packages build successfully

- [ ] **Step 8: Run tests**

Run: `rtk pnpm --filter @landmatch/frontend test`
Expected: All tests pass
