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
