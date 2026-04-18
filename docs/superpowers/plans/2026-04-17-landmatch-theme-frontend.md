# LandMatch Theme & Frontend Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the Expo + Tamagui frontend with the Dark + Warm Earthy color palette and a static search dashboard screen to preview the theme.

**Architecture:** Expo app with Expo Router for file-based routing, Tamagui for UI primitives and theming, React Query provider for future API integration. All colors centralized in `src/theme/colors.ts`, Tamagui config extends `@tamagui/config/v3` with custom tokens and a single dark theme. Static search dashboard uses hardcoded data to showcase the full palette.

**Tech Stack:** Expo 55, Expo Router, Tamagui 1.x, React Native Web, React Query v5, TypeScript

**Design Spec:** `docs/superpowers/specs/2026-04-17-landmatch-theme-design.md`

**Reference Implementation:** `/Users/amarbakir/dev/compair/apps/mobile/` — Tamagui config, colors, primitives, root layout

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/frontend/.gitkeep` | Delete | No longer needed |
| `apps/frontend/package.json` | Create | Dependencies, scripts |
| `apps/frontend/tsconfig.json` | Create | TypeScript config extending expo base |
| `apps/frontend/app.config.ts` | Create | Expo app configuration |
| `apps/frontend/babel.config.js` | Create | Babel preset for Expo |
| `apps/frontend/metro.config.js` | Create | Metro bundler config for monorepo |
| `apps/frontend/tamagui.config.ts` | Create | Tamagui tokens + dark theme |
| `apps/frontend/src/theme/colors.ts` | Create | Centralized color definitions |
| `apps/frontend/app/_layout.tsx` | Create | Root layout with providers |
| `apps/frontend/app/index.tsx` | Create | Entry point redirecting to search |
| `apps/frontend/app/(app)/_layout.tsx` | Create | App shell layout with header |
| `apps/frontend/app/(app)/search/index.tsx` | Create | Static search dashboard screen |
| `apps/frontend/src/ui/primitives/Screen.tsx` | Create | Full-screen wrapper with background |
| `apps/frontend/src/ui/primitives/Card.tsx` | Create | Themed card component |
| `apps/frontend/src/ui/primitives/Button.tsx` | Create | Button with primary/secondary/outline variants |

---

### Task 1: Initialize Expo frontend package

**Files:**
- Delete: `apps/frontend/.gitkeep`
- Create: `apps/frontend/package.json`
- Create: `apps/frontend/tsconfig.json`
- Create: `apps/frontend/babel.config.js`
- Create: `apps/frontend/metro.config.js`
- Create: `apps/frontend/app.config.ts`

- [ ] **Step 1: Delete .gitkeep**

```bash
rm apps/frontend/.gitkeep
```

- [ ] **Step 2: Create package.json**

Create `apps/frontend/package.json`:

```json
{
  "name": "@landmatch/frontend",
  "version": "1.0.0",
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "web": "expo start --web",
    "lint": "tsc --noEmit",
    "test": "vitest --passWithNoTests",
    "test:run": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "@landmatch/api": "workspace:*",
    "@tamagui/animations-react-native": "^1.144.4",
    "@tamagui/config": "^1.144.4",
    "@tamagui/lucide-icons": "^1.144.4",
    "@tanstack/react-query": "^5.90.21",
    "expo": "~55.0.5",
    "expo-font": "~55.0.4",
    "expo-router": "~55.0.4",
    "expo-status-bar": "~55.0.4",
    "react": "19.2.0",
    "react-dom": "19.2.0",
    "react-native": "0.83.2",
    "react-native-safe-area-context": "~5.6.2",
    "react-native-screens": "~4.23.0",
    "react-native-web": "~0.21.2",
    "tamagui": "^1.144.4"
  },
  "devDependencies": {
    "@expo/metro-runtime": "^55.0.6",
    "@types/react": "~19.2.14",
    "vitest": "^4.0.16"
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

Create `apps/frontend/tsconfig.json`:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": ["./*"],
      "@landmatch/api": ["../../packages/api/src"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

- [ ] **Step 4: Create babel.config.js**

Create `apps/frontend/babel.config.js`:

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
```

- [ ] **Step 5: Create metro.config.js**

Create `apps/frontend/metro.config.js`:

```js
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

module.exports = config;
```

- [ ] **Step 6: Create app.config.ts**

Create `apps/frontend/app.config.ts`:

```typescript
import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'LandMatch',
  slug: 'landmatch',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'landmatch',
  userInterfaceStyle: 'dark',
  web: {
    output: 'static' as const,
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-font',
    'expo-router',
  ],
  experiments: {
    typedRoutes: true,
  },
});
```

- [ ] **Step 7: Create assets directory**

```bash
mkdir -p apps/frontend/assets/images
```

- [ ] **Step 8: Install dependencies**

```bash
pnpm install
```

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/package.json apps/frontend/tsconfig.json apps/frontend/babel.config.js apps/frontend/metro.config.js apps/frontend/app.config.ts apps/frontend/assets pnpm-lock.yaml
git add -u apps/frontend/.gitkeep
git commit -m "feat(frontend): initialize Expo app with dependencies"
```

---

### Task 2: Set up theme colors and Tamagui config

**Files:**
- Create: `apps/frontend/src/theme/colors.ts`
- Create: `apps/frontend/tamagui.config.ts`

- [ ] **Step 1: Create colors.ts**

Create `apps/frontend/src/theme/colors.ts`:

```typescript
export const colors = {
  background: '#0F1410',
  cardBackground: '#1A2118',
  border: '#2C3E2D',
  textPrimary: '#E8DDD3',
  textSecondary: '#9BA393',
  accent: '#D4A843',
  accentHover: '#E0BA5A',
  accentPress: '#B8922F',
  accentSecondary: '#C4956A',
  success: '#7DB88A',
  danger: '#DC2626',
} as const;

export type Colors = typeof colors;
```

- [ ] **Step 2: Create tamagui.config.ts**

Create `apps/frontend/tamagui.config.ts`:

```typescript
import { config as defaultConfig, themes as defaultThemes, tokens as defaultTokens } from '@tamagui/config/v3';
import { createTamagui } from 'tamagui';

const customTokens = {
  ...defaultTokens,
  size: {
    ...defaultTokens.size,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 24,
  },
  space: {
    ...defaultTokens.space,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 24,
  },
  color: {
    ...defaultTokens.color,
    background: '#0F1410',
    cardBackground: '#1A2118',
    textPrimary: '#E8DDD3',
    textSecondary: '#9BA393',
    accent: '#D4A843',
    border: '#2C3E2D',
  },
  radius: {
    ...defaultTokens.radius,
    card: 12,
  },
};

const darkTheme = {
  ...defaultThemes.dark,
  background: '#0F1410',
  backgroundHover: '#1A2118',
  backgroundPress: '#2C3E2D',
  backgroundFocus: '#1A2118',
  color: '#E8DDD3',
  colorHover: '#E8DDD3',
  colorPress: '#E8DDD3',
  colorFocus: '#E8DDD3',
  borderColor: '#2C3E2D',
  borderColorHover: '#2C3E2D',
  borderColorPress: '#D4A843',
  borderColorFocus: '#D4A843',
  placeholderColor: '#9BA393',
  accent: '#D4A843',
  accentHover: '#E0BA5A',
  accentPress: '#B8922F',
  accentFocus: '#E0BA5A',
};

const config = createTamagui({
  ...defaultConfig,
  tokens: customTokens,
  themes: {
    ...defaultThemes,
    dark: darkTheme,
  },
});

export type Conf = typeof config;

declare module 'tamagui' {
  interface TamaguiCustomConfig extends Conf {}
}

export default config;
```

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/theme/colors.ts apps/frontend/tamagui.config.ts
git commit -m "feat(frontend): add theme colors and Tamagui config"
```

---

### Task 3: Create UI primitives (Screen, Card, Button)

**Files:**
- Create: `apps/frontend/src/ui/primitives/Screen.tsx`
- Create: `apps/frontend/src/ui/primitives/Card.tsx`
- Create: `apps/frontend/src/ui/primitives/Button.tsx`

- [ ] **Step 1: Create Screen.tsx**

Create `apps/frontend/src/ui/primitives/Screen.tsx`:

```typescript
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { YStack, YStackProps } from 'tamagui';

import { colors } from '../../theme/colors';

export interface ScreenProps extends YStackProps {
  children: React.ReactNode;
}

export function Screen({ children, ...props }: ScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <YStack
      flex={1}
      backgroundColor={colors.background}
      paddingTop={insets.top}
      paddingBottom={insets.bottom}
      paddingLeft={insets.left}
      paddingRight={insets.right}
      {...props}
    >
      {children}
    </YStack>
  );
}
```

- [ ] **Step 2: Create Card.tsx**

Create `apps/frontend/src/ui/primitives/Card.tsx`:

```typescript
import { YStack, YStackProps } from 'tamagui';

import { colors } from '../../theme/colors';

export interface CardProps extends YStackProps {
  children: React.ReactNode;
}

export function Card({ children, ...props }: CardProps) {
  return (
    <YStack
      backgroundColor={colors.cardBackground}
      borderRadius="$4"
      padding="$4"
      borderWidth={1}
      borderColor={colors.border}
      {...props}
    >
      {children}
    </YStack>
  );
}
```

- [ ] **Step 3: Create Button.tsx**

Create `apps/frontend/src/ui/primitives/Button.tsx`:

```typescript
import { ButtonProps, Button as TamaguiButton } from 'tamagui';

import { colors } from '../../theme/colors';

export interface LandMatchButtonProps extends Omit<ButtonProps, 'variant'> {
  buttonVariant?: 'primary' | 'secondary' | 'outline';
}

export function Button({ buttonVariant = 'primary', children, ...props }: LandMatchButtonProps) {
  const variantStyles = {
    primary: {
      backgroundColor: colors.accent,
      color: '#0F1410',
      borderWidth: 0,
    },
    secondary: {
      backgroundColor: colors.cardBackground,
      color: colors.textPrimary,
      borderWidth: 0,
    },
    outline: {
      backgroundColor: 'transparent',
      color: colors.accent,
      borderWidth: 1,
      borderColor: colors.accent,
    },
  };

  return (
    <TamaguiButton
      minHeight={44}
      borderRadius="$4"
      {...variantStyles[buttonVariant]}
      {...props}
    >
      {children}
    </TamaguiButton>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/ui/primitives/
git commit -m "feat(frontend): add Screen, Card, and Button primitives"
```

---

### Task 4: Set up root layout and app shell

**Files:**
- Create: `apps/frontend/app/_layout.tsx`
- Create: `apps/frontend/app/index.tsx`
- Create: `apps/frontend/app/(app)/_layout.tsx`

- [ ] **Step 1: Create root layout**

Create `apps/frontend/app/_layout.tsx`:

```typescript
import { useState } from 'react';

import { Stack } from 'expo-router';

import config from '@/tamagui.config';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TamaguiProvider } from 'tamagui';

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TamaguiProvider config={config} defaultTheme="dark">
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(app)" />
        </Stack>
      </TamaguiProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 2: Create index.tsx entry point**

Create `apps/frontend/app/index.tsx`:

```typescript
import { Redirect } from 'expo-router';

export default function Index() {
  return <Redirect href="/(app)/search" />;
}
```

- [ ] **Step 3: Create app shell layout**

Create `apps/frontend/app/(app)/_layout.tsx`:

```typescript
import { Stack } from 'expo-router';

import { colors } from '@/src/theme/colors';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { color: colors.textPrimary },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="search/index"
        options={{
          title: 'LandMatch',
          headerTitleStyle: { color: colors.accent, fontWeight: '700' },
        }}
      />
    </Stack>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/app/
git commit -m "feat(frontend): add root layout with providers and app shell"
```

---

### Task 5: Build static search dashboard screen

**Files:**
- Create: `apps/frontend/app/(app)/search/index.tsx`

- [ ] **Step 1: Create search dashboard with hardcoded data**

Create `apps/frontend/app/(app)/search/index.tsx`:

```typescript
import { ScrollView } from 'react-native';

import { Text, XStack, YStack } from 'tamagui';

import { colors } from '@/src/theme/colors';
import { Button } from '@/src/ui/primitives/Button';
import { Card } from '@/src/ui/primitives/Card';
import { Screen } from '@/src/ui/primitives/Screen';

const MOCK_LISTINGS = [
  {
    id: '1',
    title: '40 Acres — Benton County, AR',
    description: 'Mixed hardwood, year-round creek, county road access. Class II soils on 60% of parcel.',
    matchScore: 87,
    scores: { soil: 92, flood: 95, climate: 74, zoning: 88 },
    badges: ['Low Flood Risk', 'Prime Farmland', 'Well Permit OK'],
  },
  {
    id: '2',
    title: '15 Acres — Ozark County, MO',
    description: 'South-facing slope, spring-fed pond, gravel road. Timber and pasture mix.',
    matchScore: 72,
    scores: { soil: 68, flood: 85, climate: 70, zoning: 65 },
    badges: ['Spring Water', 'Timber Value'],
  },
  {
    id: '3',
    title: '80 Acres — Carroll County, AR',
    description: 'Rolling pasture with barn, fenced perimeter, paved road frontage. Municipal water available.',
    matchScore: 91,
    scores: { soil: 88, flood: 98, climate: 82, zoning: 95 },
    badges: ['Low Flood Risk', 'Prime Farmland', 'Paved Access', 'Municipal Water'],
  },
];

function scoreColor(score: number): string {
  if (score >= 80) return colors.success;
  if (score >= 60) return colors.accentSecondary;
  return colors.danger;
}

function ScoreCell({ label, score }: { label: string; score: number }) {
  return (
    <YStack flex={1} alignItems="center" backgroundColor={colors.background} borderRadius="$2" padding="$2">
      <Text fontSize={11} color={colors.textSecondary}>{label}</Text>
      <Text fontSize={16} fontWeight="600" color={scoreColor(score)}>{score}</Text>
    </YStack>
  );
}

function Badge({ text }: { text: string }) {
  return (
    <XStack
      backgroundColor={colors.border}
      paddingHorizontal="$2"
      paddingVertical={3}
      borderRadius={12}
    >
      <Text fontSize={11} fontWeight="600" color={colors.accent}>{text}</Text>
    </XStack>
  );
}

function ListingCard({ listing }: { listing: (typeof MOCK_LISTINGS)[number] }) {
  return (
    <Card>
      <XStack justifyContent="space-between" alignItems="flex-start">
        <YStack flex={1} marginRight="$3">
          <Text fontSize={15} fontWeight="600" color={colors.textPrimary}>{listing.title}</Text>
          <Text fontSize={12} color={colors.textSecondary} marginTop="$1" lineHeight={18}>
            {listing.description}
          </Text>
        </YStack>
        <YStack alignItems="center">
          <Text fontSize={28} fontWeight="700" color={scoreColor(listing.matchScore)}>
            {listing.matchScore}
          </Text>
          <Text fontSize={10} color={colors.textSecondary}>Match Score</Text>
        </YStack>
      </XStack>

      <XStack gap="$2" marginTop="$3">
        <ScoreCell label="Soil" score={listing.scores.soil} />
        <ScoreCell label="Flood" score={listing.scores.flood} />
        <ScoreCell label="Climate" score={listing.scores.climate} />
        <ScoreCell label="Zoning" score={listing.scores.zoning} />
      </XStack>

      <XStack gap="$2" marginTop="$2" flexWrap="wrap">
        {listing.badges.map((badge) => (
          <Badge key={badge} text={badge} />
        ))}
      </XStack>
    </Card>
  );
}

export default function SearchScreen() {
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        {/* Search bar */}
        <XStack
          backgroundColor={colors.cardBackground}
          borderRadius="$2"
          borderWidth={1}
          borderColor={colors.border}
          padding="$3"
          alignItems="center"
          gap="$2"
        >
          <Text flex={1} color={colors.textSecondary} fontSize={14}>
            Search by county, state, or coordinates...
          </Text>
          <Button buttonVariant="primary" size="$3" paddingHorizontal="$3">
            Search
          </Button>
        </XStack>

        {/* Section label */}
        <Text
          fontSize={11}
          color={colors.textSecondary}
          textTransform="uppercase"
          letterSpacing={1}
        >
          Top Matches
        </Text>

        {/* Listing cards */}
        {MOCK_LISTINGS.map((listing) => (
          <ListingCard key={listing.id} listing={listing} />
        ))}
      </ScrollView>
    </Screen>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/app/\(app\)/search/index.tsx
git commit -m "feat(frontend): add static search dashboard screen"
```

---

### Task 6: Verify the app runs

- [ ] **Step 1: Start the frontend**

```bash
cd apps/frontend && npx expo start --web
```

Expected: Browser opens showing the LandMatch search dashboard with:
- Dark green-tinted background (`#0F1410`)
- Gold "LandMatch" in the header
- Search bar with gold "Search" button
- Three listing cards with score colors (green for high, clay for medium)
- Badges with gold text on moss-green backgrounds

- [ ] **Step 2: Visual verification checklist**

Verify in browser:
1. Background is dark with green tint (not pure black or gray)
2. Cards have slightly lighter background (`#1A2118`) with moss borders
3. High scores (80+) show in green (`#7DB88A`)
4. Medium scores (60-79) show in clay (`#C4956A`)
5. The gold accent (`#D4A843`) appears on: search button, badge text
6. Text hierarchy is clear: stone primary vs sage gray secondary

- [ ] **Step 3: Fix any issues found during verification**

Address any rendering or build issues.

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A apps/frontend/
git commit -m "fix(frontend): address theme rendering issues"
```
