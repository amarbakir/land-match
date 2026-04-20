export const colors = {
  background: '#0F1410',
  backgroundDeep: '#0A0E0B',
  cardBackground: '#1A2118',
  cardAlt: '#222B20',
  border: '#2C3E2D',
  borderSoft: '#223022',
  textPrimary: '#E8DDD3',
  textSecondary: '#9BA393',
  textFaint: '#6B7363',
  accent: '#D4A843',
  accentHover: '#E0BA5A',
  accentPress: '#B8922F',
  accentSecondary: '#C4956A',
  success: '#7DB88A',
  danger: '#DC2626',
  warning: '#E5A15A',
} as const;

export type Colors = typeof colors;
