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
