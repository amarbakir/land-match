# Notification Preferences UI Design

**Bead:** land-match-33o — Add notification preference UI to frontend

## Context

The backend already supports GET/PUT `/api/v1/users/me/notification-preferences` for a single alert channel. Users need a frontend screen to choose how they receive alerts. During design, we decided to extend the data model from single-channel (`alertChannel: string`) to multi-channel (`alertChannels: string[]`) so users can receive alerts on multiple channels simultaneously (e.g., email + push).

## Schema Change

### `packages/api/src/notifications.ts`

Change the `NotificationPrefs` schema from singular to plural:

```typescript
// Before
export const NotificationPrefs = z.object({
  alertChannel: AlertChannel.default('email'),
});

// After
export const NotificationPrefs = z.object({
  alertChannels: z.array(AlertChannel).min(1).default(['email']),
});
```

Replace `getAlertChannel(raw): AlertChannel` with `getAlertChannels(raw): AlertChannel[]`:
- Uses `safeParse` with new schema, returns `data.alertChannels` on success
- Returns `['email']` for null/undefined/invalid input
- No backwards compatibility needed (no production data)

Update `packages/api/src/index.ts` export accordingly.

### No DB migration needed

`notification_prefs` is JSONB on the `users` table — the shape change is handled in application code. The `alerts.channel` column stays as a single TEXT value per alert record.

## Backend Changes

### `apps/server/src/services/matchingService.ts`

Fan out alert creation across all selected channels:

```typescript
const channels = getAlertChannels(user?.notificationPrefs);
for (const channel of channels) {
  await alertRepo.insert({ userId, searchProfileId, listingId, scoreId, channel });
}
```

Move the `alertsCreated++` increment inside the channel loop so it counts each alert created.

### `apps/server/src/services/userService.ts`

Update type references from singular to plural shape. The service logic is otherwise unchanged — it passes through to the repo.

### `apps/server/src/routes/users.ts`

No changes needed beyond what the schema change provides — the route already validates against `NotificationPrefs.safeParse(body)`.

## Frontend Changes

### New workspace view

Add `'alert-settings'` to the `WorkspaceView` union type in `apps/frontend/src/ui/dashboard/types.ts`.

### Sidebar wiring (`apps/frontend/src/ui/dashboard/SidebarNav.tsx`)

Wire the existing "Alert settings" nav item (line 281) to call `onSelectView('alert-settings')`. The `SidebarNav` component already receives `onSelectView` — just call it with the new view value.

### API hooks (`apps/frontend/src/api/hooks.ts`)

Add two hooks:

```typescript
export function useNotificationPrefs() {
  return useQuery<NotificationPrefs, Error>({
    queryKey: ['notificationPrefs'],
    queryFn: () => apiGet<NotificationPrefs>('/api/v1/users/me/notification-preferences'),
  });
}

export function useUpdateNotificationPrefs() {
  const queryClient = useQueryClient();
  return useMutation<NotificationPrefs, Error, NotificationPrefs>({
    mutationFn: (body) =>
      apiPut<NotificationPrefs, NotificationPrefs>(
        '/api/v1/users/me/notification-preferences',
        body,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificationPrefs'] });
    },
  });
}
```

### Alert settings screen (`apps/frontend/src/ui/notifications/AlertSettingsScreen.tsx`)

New component rendered when `view === 'alert-settings'` in `DashboardScreen`.

**Layout:**
- Centered content column (max width ~480px) with page title "Alert settings"
- `SectionCard` titled "Alert channels" with hint "at least 1 required"
- `ToggleButtonRow` with three options: `Email`, `SMS`, `Push` (multi-select)
- Save button (primary variant) below the section card
- Loading state: `Spinner` while fetching preferences
- Error state: red text above save button on mutation failure
- Disable save button when mutation is pending (show "Saving..." text)

**Behavior:**
- On mount, fetch current prefs and initialize toggle state
- Prevent deselecting the last remaining channel (at least 1 must be selected)
- Save button calls `useUpdateNotificationPrefs` mutation
- On success, no navigation — user stays on the settings view

### Dashboard integration (`apps/frontend/app/(app)/index.tsx`)

Add conditional rendering for the new view:

```tsx
{view === 'alert-settings' && <AlertSettingsScreen />}
```

## Test Plan

### Schema tests (`packages/api/src/__tests__/notifications.test.ts`)

Update existing `getAlertChannel` tests to `getAlertChannels`:
- Returns `['email']` for null, undefined, invalid input
- Returns `['email']` for empty object (default)
- Returns parsed array for valid `{ alertChannels: ['sms', 'push'] }`
- Returns `['email']` for `{ alertChannels: [] }` (min(1) fails)
- Returns `['email']` for invalid channel values

### Service tests (`apps/server/src/__tests__/userService.test.ts`)

Update assertions from `alertChannel` to `alertChannels` array shape.

### Matching service tests (`apps/server/src/__tests__/matchingService.test.ts`)

Verify fan-out: when user has `alertChannels: ['email', 'push']`, two alert records are created (one per channel).

### Frontend tests (`apps/frontend/src/ui/notifications/__tests__/AlertSettingsScreen.test.tsx`)

- Renders current preferences from API (selected channels shown as active toggles)
- Sends correct payload on save (array of selected channels)
- Prevents deselecting all channels (last toggle stays selected)
- Shows error message on mutation failure

### Manual verification

1. Start dev server (`pnpm dev`)
2. Log in, click "Alert settings" in sidebar
3. Verify current preference loads (default: email selected)
4. Select multiple channels, click save, refresh — selections persist
5. Try to deselect all — last one should remain selected
6. Verify existing profile editor and match views still work (no regressions)

## Files to modify

| File | Change |
|------|--------|
| `packages/api/src/notifications.ts` | Schema: singular → plural, new helper |
| `packages/api/src/index.ts` | Update export name |
| `packages/api/src/__tests__/notifications.test.ts` | Update tests for new shape |
| `apps/server/src/services/userService.ts` | Update type references |
| `apps/server/src/services/matchingService.ts` | Fan out alert creation |
| `apps/server/src/routes/users.ts` | Minor: import name if changed |
| `apps/server/src/__tests__/userService.test.ts` | Update test assertions |
| `apps/server/src/__tests__/matchingService.test.ts` | Add fan-out test |
| `apps/frontend/src/ui/dashboard/types.ts` | Add `'alert-settings'` view |
| `apps/frontend/src/api/hooks.ts` | Add notification pref hooks |
| `apps/frontend/src/ui/notifications/AlertSettingsScreen.tsx` | **New file** |
| `apps/frontend/src/ui/dashboard/SidebarNav.tsx` | Wire alert settings button |
| `apps/frontend/app/(app)/index.tsx` | Render AlertSettingsScreen |
| `apps/frontend/src/ui/notifications/__tests__/AlertSettingsScreen.test.tsx` | **New file** — frontend tests |

## Reusable existing code

- `SectionCard` (`apps/frontend/src/ui/profile/SectionCard.tsx`) — form section wrapper
- `ToggleButtonRow` + `toggleValue` (`apps/frontend/src/ui/profile/ToggleButtonRow.tsx`) — multi-select pill toggles
- `Button` (`apps/frontend/src/ui/primitives/Button.tsx`) — primary/secondary buttons
- `apiGet`, `apiPut` (`apps/frontend/src/api/client.ts`) — authenticated API calls
- `NotificationPrefs`, `AlertChannel` types from `@landmatch/api`
