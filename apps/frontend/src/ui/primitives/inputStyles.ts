import type { InputProps } from 'tamagui';

import { colors } from '../../theme/colors';

export const inputStyles = {
  backgroundColor: colors.cardBackground,
  color: colors.textPrimary,
  borderColor: colors.border,
  placeholderTextColor: colors.textSecondary,
} satisfies InputProps;
