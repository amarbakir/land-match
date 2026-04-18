# LandMatch Theme & Branding Design

## Context

LandMatch needs a visual identity that reflects its audience — homesteaders, small farmers, and off-grid seekers looking for rural property. The frontend (`apps/frontend/`) is currently empty. This spec defines the color palette, Tamagui theme configuration, and initial frontend scaffold to establish the brand visually.

The Compair repo (`/Users/amarbakir/dev/compair/apps/mobile/`) serves as the structural pattern — same Tamagui config approach, same component organization, adapted for LandMatch's identity.

## Color Palette: Dark + Warm Earthy

Dark mode only. The base is near-black with a subtle green tint (not neutral gray like Compair), paired with golden wheat and clay accents that evoke fertile land and warm sunlight.

| Role              | Name         | Hex       | Usage                                      |
|-------------------|--------------|-----------|----------------------------------------------|
| Background        | Night Forest | `#0F1410` | App background, root screens                 |
| Surface/Card      | Dark Canopy  | `#1A2118` | Cards, inputs, elevated surfaces              |
| Border            | Moss         | `#2C3E2D` | Dividers, card borders, subtle separators     |
| Text Primary      | Stone        | `#E8DDD3` | Headings, body text, primary content          |
| Text Secondary    | Sage Gray    | `#9BA393` | Labels, placeholders, supporting text         |
| Accent Primary    | Golden Wheat | `#D4A843` | CTAs, active nav, primary actions, logo        |
| Accent Hover      | Light Gold   | `#E0BA5A` | Hover state for accent                        |
| Accent Press      | Deep Gold    | `#B8922F` | Press/active state for accent                 |
| Accent Secondary  | Clay         | `#C4956A` | Secondary highlights, medium-range scores     |
| Success           | Meadow       | `#7DB88A` | High scores, positive badges, success states  |
| Danger            | Red          | `#DC2626` | Destructive actions, error states             |

### Semantic color usage

- **Scores**: High (green `#7DB88A`), Medium (clay `#C4956A`), Low (gold `#D4A843` or red for failing)
- **Badges**: Background uses border color + tinted, text uses the semantic color
- **Interactive elements**: Gold accent for primary buttons, borders for secondary/outline buttons

## Tamagui Configuration

Follow Compair's pattern: extend `@tamagui/config/v3` with custom tokens and a single dark theme.

### File: `tamagui.config.ts`

- Extend default config from `@tamagui/config/v3`
- Custom tokens:
  - **Spacing** (`size` and `space`): `1→4, 2→8, 3→12, 4→16, 5→24`
  - **Border radius**: `card→12`
  - **Color tokens**: map to the palette above
- Single dark theme with all palette colors mapped to Tamagui theme keys (`background`, `color`, `borderColor`, etc.)

### File: `src/theme/colors.ts`

Centralized color export object — all components import from here, no hardcoded hex values in UI code.

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
```

## Frontend Scaffold

### Structure (following Compair pattern)

```
apps/frontend/
├── app/
│   ├── _layout.tsx              # Root layout: TamaguiProvider, QueryClientProvider
│   ├── index.tsx                # Entry point → search dashboard
│   └── (app)/
│       ├── _layout.tsx          # App shell layout
│       └── search/index.tsx     # Search results screen (initial theme preview)
├── src/
│   ├── theme/
│   │   └── colors.ts            # Centralized color definitions
│   └── ui/
│       └── primitives/
│           ├── Screen.tsx        # Full-screen wrapper with safe area + background
│           ├── Card.tsx          # Themed card component
│           └── Button.tsx        # Primary/secondary/outline variants
├── tamagui.config.ts
├── app.config.ts                # Expo config
├── babel.config.js
├── metro.config.js
├── tsconfig.json
└── package.json
```

### Key Dependencies

- `expo`, `expo-router` — app framework and routing
- `tamagui`, `@tamagui/config` — UI framework and default tokens
- `@tamagui/lucide-icons` — icon library
- `react-native-web` — web platform support
- `@tanstack/react-query` — server state (provider set up, no queries yet)
- `react-native-safe-area-context` — safe area insets

### Initial Screen: Search Dashboard (Static)

A static mockup screen to preview the full palette in context. Shows:
- Header with "LandMatch" logo text in gold, navigation links in sage gray
- Search bar with accent-colored search button
- Two listing cards with:
  - Title (stone text), description (sage gray)
  - Match score (gold for high, clay for medium)
  - Sub-scores row (soil, flood, climate, zoning) with semantic colors
  - Badges with tinted backgrounds

This screen uses hardcoded data — no API integration yet. Purpose is purely to validate the theme visually.

### Typography

System defaults via Tamagui (Inter on web). No custom fonts for initial setup.

### Font Sizes

Follow Tamagui's default token scale. Specific size decisions deferred to component implementation.

## Out of Scope

- Light mode theme (future followup)
- Accessibility/colorblind mode (tracked as future followup — palette is structurally sound for it)
- Custom fonts or typography system
- API integration or real data
- Authentication flows
- Mobile-specific layouts

## Verification

1. Run `pnpm dev:frontend` — app should load in browser
2. Verify dark background renders with green tint (not gray)
3. Verify search dashboard shows cards with gold/clay/green score colors
4. Verify buttons use gold accent with hover/press states
5. Check that no hardcoded hex values exist outside `colors.ts` and `tamagui.config.ts`
